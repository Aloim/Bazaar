// BazaarShopOps/sources/bazar_admin_drain.move (V38 split: moved from bazaar_core)
// UpdateCeremonyPlan v1 — Phase B entry 1: admin batch close-all-shops.
// Sibling module to bazar.move (which is at the 500-LOC guard ceiling). Re-uses
// shop_moderation::force_close_shop_internal as the per-row primitive — that primitive
// already handles item drain (deposit_to_owned<BazarAuth>), pool residue refund,
// EVE escrow refund, deactivation, and per-row ShopForceClosedEvent emission.
//
// FE iteration model: ONE call per SSU. The (gov, ssu, pool) args fix the SSU scope;
// FE enumerates per-SSU shop IDs via Sui RPC (getDynamicFields against BazarRegistry.id
// filtered by Shop.ssu_id) and pages the shop_ids vector in MAX_BATCH_ROWS chunks.
//
// SSU-owner-owned shops are PRE-SKIPPED (force_close_shop_internal aborts on them with
// E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP=20). Admin pre-ceremony checklist must instruct
// SSU owners to user-self-close their own shops during the T-7d → T+0 window.

module bazaar_shop_ops::bazar_admin_drain {
    use sui::clock::Clock;
    use world::storage_unit::StorageUnit;
    use world::character::Character;
    use dapp_hub::dapp_governance::DAppOwnerCap;
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::ssu_governance::SSUGovernance;
    use bazaar_core::wtb_escrow_pool::WtbEscrowPool;
    use bazaar_core::admin_drain_events;
    use bazaar_core::shop_ops_guarded;
    use bazaar_shop_ops::bazar_close;
    use bazaar_shop_ops::shop_moderation;
    use bazaar_shop_ops::shop_ops_cap_store::{Self, ShopOpsCapStore};

    // Error codes
    const E_BATCH_TOO_LARGE: u64 = 1;
    const E_PAGINATION_ZERO: u64 = 2;

    // Constants
    const MAX_BATCH_ROWS: u64 = 100;

    // Reserved closer_tier value for the DApp Admin Ceremony Drain path. Extends the
    // 0-6 tier table documented in shop_moderation::ShopForceClosedEvent (0=Owner,
    // 1-3=SSU caps, 4-6=Tribe caps). 99 is a forward-compatible reservation.
    const CLOSER_TIER_DAPP_CEREMONY: u8 = 99;

    /// Force-close every shop in `shop_ids` belonging to the SSU identified by `gov`.
    /// Idempotent: silently skips IDs that are missing, already inactive, or owned by
    /// the SSU owner (those abort the underlying primitive and so must be pre-filtered).
    /// Emits per-row ShopForceClosedEvent (via force_close_shop_internal) plus one
    /// BatchDrainSummary at the end (via admin_drain_events::emit_summary).
    public entry fun close_all_shops_batch(
        _cap: &DAppOwnerCap,
        registry: &mut BazarRegistry,
        gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        recipient_character: &Character,
        pool: &mut WtbEscrowPool,
        shop_ids: vector<ID>,
        allow_ssu_owner: bool,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let n = vector::length(&shop_ids);
        assert!(n > 0, E_PAGINATION_ZERO);
        assert!(n <= MAX_BATCH_ROWS, E_BATCH_TOO_LARGE);

        // V38 split: borrow the ShopOpsCap once; the read-borrow wrapper + the per-row
        // force_close_shop_internal both need it.
        let cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        let admin = tx_context::sender(ctx);
        let mut processed: u64 = 0;
        let mut skipped: u64 = 0;
        let mut i: u64 = 0;
        while (i < n) {
            let shop_id = *vector::borrow(&shop_ids, i);

            // Pre-skip check in a scope block so the immutable borrow is released before
            // the &mut force_close_shop_internal call below.
            let should_skip = if (!bazar::has_shop(registry, shop_id)) {
                true
            } else {
                let shop = shop_ops_guarded::borrow_shop_g(registry, shop_id, cap);
                // When allow_ssu_owner=true (ceremony admin drain), SSU-owner shops are
                // NOT skipped — their items route to the owner's Player Locker.
                let owner_skip = if (allow_ssu_owner) false else bazar_close::shop_owner_is_ssu_owner(shop, gov);
                !bazar::shop_is_active(shop) || owner_skip
            };

            if (should_skip) {
                skipped = skipped + 1;
            } else {
                shop_moderation::force_close_shop_internal(
                    registry,
                    shop_id,
                    gov,
                    ssu,
                    recipient_character,
                    pool,
                    admin,
                    CLOSER_TIER_DAPP_CEREMONY,
                    allow_ssu_owner,
                    cap,
                    clock,
                    ctx,
                );
                processed = processed + 1;
            };
            i = i + 1;
        };

        admin_drain_events::emit_summary(
            admin_drain_events::kind_close_shops(),
            processed,
            skipped,
            ctx,
            clock,
        );
    }
}
