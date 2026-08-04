// bazaar_shop_ops | Paginated permissionless EVE shop escrow refund and delist prune for depreciated dead SSUs
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V41 SSU depreciation / dead-bazaar prune -- Phase 2 "shop prune" half of Phase B
// (Documentation/plans/implementation/ssu-depreciation-prune-plan.md §2.3). Gated ONLY on the
// `ssu_governance::is_depreciated(gov)` certificate set by bazaar_core::ssu_depreciation
// (Phase A, already applied) -- this module NEVER reads world::location itself; the plan's
// entire two-phase design exists precisely so Phase-B trusts the certificate, not the world
// (plan §1 "why two phases" (b): bazaar_economy has no world dep and must be able to prune too).
//
// Reuses the existing `_g` hardened-callee wrappers in bazaar_core::shop_ops_guarded
// (deactivate_shop_by_id_g, escrowed_eve_value_g, withdraw_escrowed_eve_g,
// withdraw_owner_residual_on_close_g) via a &ShopOpsCap borrowed from ShopOpsCapStore --
// the exact pattern bazar_close.move / bazar_admin_drain.move already use, so this feature
// needs no bazaar_core mutator widening.
//
// No StorageUnit, no Character: at this point the SSU's world assembly and every inventory it
// held are already destroyed by unanchor (plan §1), so items are UNRECOVERABLE (plan §3
// disposition table, WTS/DE/FREE item stock row -- mission reward-bundle/proof-escrow items are
// SEPARATELY recoverable via bazaar_mission::ssu_depreciation_missions::
// prune_depreciated_mission_items_page, CR-P3-01/P3b) -- only the two surviving
// EVE escrow legs (Shop.escrowed_eve, WtbEscrowPool.deposits[shop]) are refunded here, both to
// the shop's recorded OWNER ADDRESS via transfer::public_transfer (never deposit_to_owned --
// there is no StorageUnit left to write a locker into). Advanced tribe-token legs
// (TribeTokenWtbPool / Shop.tribe_token_pool) are OUT OF SCOPE -- bazaar_economy, Phase 4
// (plan §2.5), because bazaar_core cannot depend on bazaar_economy (dependency direction).
//
// Permissionless + paginated + idempotent, mirroring bazar_admin_drain::close_all_shops_batch
// and wtb_escrow_pool::refund_wtb_escrow_pool_batch: caller composes a bounded page of shop_ids
// for ONE depreciated SSU; per-row pre-skip on missing/already-inactive shops (no abort); a
// full-page re-run after completion is a clean no-op (plan §4 idempotency semantics).
module bazaar_shop_ops::ssu_depreciation_ops {
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::transfer;
    use std::option;
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::wtb_escrow_pool::{Self, WtbEscrowPool};
    use bazaar_core::shop_ops_guarded;
    use bazaar_shop_ops::shop_ops_cap_store::{Self, ShopOpsCapStore};

    // ===== Error Codes (module-scoped; fresh module, no collision) =====

    /// `gov` is not yet certified depreciated -- Phase A (bazaar_core::ssu_depreciation::
    /// mark_ssu_depreciated) must run first. This is what makes it impossible to refund/delist
    /// shops on a live SSU (plan §4 ordering invariant).
    const E_NOT_DEPRECIATED: u64 = 1;
    /// A shop_id in the page belongs to a different SSU than `gov` -- caller-composed-page bug;
    /// hard abort (never silently skipped, unlike the has_shop/is_active pre-skips -- plan §2.3).
    const E_SHOP_WRONG_SSU: u64 = 2;
    const E_PAGINATION_ZERO: u64 = 3;
    const E_BATCH_TOO_LARGE: u64 = 4;
    /// CR-DEP-08 (critic binding condition, P2): `pool` does not belong to `gov`'s SSU -- checked
    /// ONCE before any refund row via the wtb_escrow_pool::pool_ssu_id accessor. Not in the
    /// plan's original §2.3 abort-code list (that list predates this critic condition) -- flagged
    /// here for critic visibility per the task brief.
    const E_POOL_WRONG_SSU: u64 = 5;

    // Matches the MAX_BATCH_ROWS precedent in bazar_admin_drain / wtb_escrow_pool (v1 ceremony).
    const MAX_BATCH_ROWS: u64 = 100;

    // ===== Events =====

    /// Per-row -- emitted ONLY when a shop is actually processed (never on a has_shop/is_active
    /// skip). Carries shop context (kind/bazaar_type/tribe_id) plus both refund-leg amounts so
    /// the FE janitor can render progress without a follow-up RPC read per shop.
    public struct DepreciatedShopPrunedEvent has copy, drop {
        ssu_id: address,
        shop_id: ID,
        owner: address,
        kind: u8,
        bazaar_type: u8,
        tribe_id: u64,
        escrowed_eve_refunded: u64,
        wtb_pool_residual_refunded: u64,
        timestamp_ms: u64,
    }

    // ===== Entry =====

    /// Prune one caller-composed page of shop_ids belonging to a depreciated SSU.
    ///
    /// Per row: skip if the shop_id is absent from the registry or already inactive
    /// (idempotent, no abort); otherwise assert it belongs to `gov`'s SSU (hard abort on
    /// mismatch -- a caller bug, not a re-run state), refund the WTB pool residue and any
    /// escrowed_eve to the shop's recorded owner ADDRESS (CR-DEP-04: zero-amount legs skip the
    /// transfer, never abort), deactivate via the hardened callee, and emit
    /// DepreciatedShopPrunedEvent. `deactivate_shop_by_id_g` is the LAST mutation in the
    /// processed branch and is unconditional once reached -- exactly the
    /// bazar_close::finalize_close_pre_drained guardrail -- so `is_active` becomes the terminal,
    /// one-way re-run gate for this shop (plan §4).
    public entry fun prune_depreciated_shops_page(
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        pool: &mut WtbEscrowPool,
        shop_ids: vector<ID>,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let n = vector::length(&shop_ids);
        assert!(n > 0, E_PAGINATION_ZERO);
        assert!(n <= MAX_BATCH_ROWS, E_BATCH_TOO_LARGE);

        assert!(ssu_governance::is_depreciated(gov), E_NOT_DEPRECIATED);

        let gov_ssu_id = ssu_governance::ssu_id(gov);
        // CR-DEP-08: pool<->gov binding, asserted ONCE before any refund row.
        assert!(wtb_escrow_pool::pool_ssu_id(pool) == gov_ssu_id, E_POOL_WRONG_SSU);

        let cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        let ts = clock::timestamp_ms(clock);

        let mut i: u64 = 0;
        while (i < n) {
            let shop_id = *vector::borrow(&shop_ids, i);

            if (bazar::has_shop(registry, shop_id)) {
                // Scoped mutable borrow: read + refund + emit inside; drop before the
                // registry-level deactivate call below needs &mut BazarRegistry again (same
                // borrow-checker constraint bazar_close::close_shop documents at :96-103).
                let (did_process, owner) = {
                    let shop = bazar::borrow_shop_mut(registry, shop_id);
                    if (bazar::shop_is_active(shop)) {
                        assert!(bazar::shop_ssu_id(shop) == gov_ssu_id, E_SHOP_WRONG_SSU);
                        let owner = bazar::shop_owner(shop);

                        // --- WTB pool residue leg (idempotent: None when no entry) ---
                        let pool_refunded = wtb_escrow_pool::shop_escrow_balance(pool, shop_id);
                        let pool_coin_opt = shop_ops_guarded::withdraw_owner_residual_on_close_g(
                            pool, shop_id, owner, cap, ctx,
                        );
                        if (option::is_some(&pool_coin_opt)) {
                            transfer::public_transfer(option::destroy_some(pool_coin_opt), owner);
                        } else {
                            option::destroy_none(pool_coin_opt);
                        };

                        // --- Shop.escrowed_eve leg (WTB/FREE NoTribe+Easy; CR-DEP-04 zero-skip) ---
                        let eve_refunded = shop_ops_guarded::escrowed_eve_value_g(shop, cap);
                        if (eve_refunded > 0) {
                            let refund = shop_ops_guarded::withdraw_escrowed_eve_g(
                                shop, eve_refunded, cap, ctx,
                            );
                            transfer::public_transfer(refund, owner);
                        };

                        event::emit(DepreciatedShopPrunedEvent {
                            ssu_id: gov_ssu_id,
                            shop_id,
                            owner,
                            kind: bazar::shop_kind(shop),
                            bazaar_type: bazar::shop_bazaar_type(shop),
                            tribe_id: bazar::shop_tribe_id(shop),
                            escrowed_eve_refunded: eve_refunded,
                            wtb_pool_residual_refunded: pool_refunded,
                            timestamp_ms: ts,
                        });

                        (true, owner)
                    } else {
                        // Idempotent skip: already pruned by a prior page, or was inactive
                        // before depreciation. No mutation, no event.
                        (false, @0x0)
                    }
                };

                if (did_process) {
                    shop_ops_guarded::deactivate_shop_by_id_g(registry, shop_id, owner, cap);
                };
            };
            // else: shop_id absent from the registry -- idempotent skip (already pruned in a
            // prior page, or never existed). No abort, matches bazar_admin_drain's has_shop
            // pre-skip.

            i = i + 1;
        };
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
