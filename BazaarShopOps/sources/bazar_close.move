// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// bazar_close — Inline atomic drain + refund logic for shop self-close.
///
/// Two entry functions, one per storage tier (the V11 split closed the
/// VMVerificationOrDeserializationError caused by `Option<OwnerCap<StorageUnit>>`
/// when the real on-chain `world::access::OwnerCap` type lacks `store`):
///   close_shop                 — non-SSU-owner self-close → recipient Player Locker.
///   close_shop_as_ssu_owner    — SSU-owner self-close → recipient Main Storage.
///
/// Bug C / Temporaryfixplan / V11 implementation. Originally specified in
/// Bug-C-design.md rev 2; the V11-cascade split documented in
/// Session_2026-05-10_Temporaryfixplan-Phase3.4-V11-Cascade.md.
///
/// V21 NOTE: this module's close paths handle ONLY the EVE escrow refund
/// (`wtb_escrow_pool::withdraw_owner_residual_on_close` +
/// `bazar::withdraw_escrowed_eve`). Advanced WTB shops additionally hold
/// tribe-token credits in `bazaar_economy::tribe_token_wtb_pool`; bazaar_core
/// cannot import bazaar_economy (Article I.3 — dependency direction), so the
/// tribe-token pool refund lives in `bazaar_economy::wtb_pool_ops::
/// refund_wtb_pool_residue` and is invoked as a separate PTB step (idempotent;
/// callable any time after close — the deactivated shop record is still
/// readable via `bazar::borrow_shop_mut` for owner derivation).
module bazaar_shop_ops::bazar_close {
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::object;
    use sui::clock::Clock;
    use sui::coin::Coin;
    use EVE::EVE::EVE;
    use std::option;
    use world::storage_unit::{Self, StorageUnit};
    use world::access::{Self, OwnerCap};
    use world::character::{Self, Character};
    use bazaar_core::bazar::{Self, BazarRegistry, Shop, BazarAuth};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::wtb_escrow_pool::WtbEscrowPool;
    use bazaar_core::shop_ops_guarded;
    use bazaar_core::bazaar_core_admin::ShopOpsCap;
    use bazaar_shop_ops::shop_ops_cap_store::{Self, ShopOpsCapStore};

    // --- Error Codes ---
    /// Error code 3: redeclared from bazar.move:36 (Move module constants are private; reuse by value).
    const E_NOT_SHOP_OWNER: u64 = 3;
    /// Error code 5: redeclared from bazar.move:38 (Move module constants are private; reuse by value).
    const E_SHOP_NOT_ACTIVE: u64 = 5;
    /// Error code 16: redeclared from shop_ops_wtb.move:35. Cross-module test #19 verifies value-equality.
    const E_RECIPIENT_NOT_SHOP_OWNER: u64 = 16;

    // Slot 17 reserved: E_ITEM_QUANTITY_MISMATCH = 17, declared only in shop_ops_wtb.move (Phase 4 sibling).

    /// Error code 18: OwnerCap is not authorized for this shop's SSU object.
    const E_WRONG_OWNER_CAP_FOR_SSU: u64 = 18;

    /// Error code 19: Recipient character's address does not equal tx sender (Main Storage path).
    const E_CHARACTER_NOT_SENDER: u64 = 19;

    /// Error code 20: SSU owner's shops cannot be admin-force-closed; SSU owner must self-close.
    /// (Used by shop_moderation::force_close_shop_internal — declared here for documentation; redeclared in shop_moderation.move.)
    const E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP: u64 = 20;

    // --- Shop Kind Constants ---
    /// SHOP_WTB = 1 (redeclared from bazar.move:28; Move constants are module-private).
    /// Used to skip the Open Storage drain loop for WTB shops — WTB shops never
    /// deposit items into SSU Open Inventory at create time (V26 Phase 4 direct
    /// deposit). The listings vector encodes what the buyer WANTS, not what's
    /// escrowed. Iterating listings + calling withdraw_from_open_inventory on a
    /// WTB shop is guaranteed to abort with `world::inventory::EItemDoesNotExist`.
    /// Closes Wave 3 bug W3-2 / W3-7.
    const SHOP_WTB: u8 = 1;

    // --- Entry Functions ---

    /// Non-SSU-owner self-close. Drains items into recipient_character's Player Locker
    /// via `deposit_to_owned<BazarAuth>` (no sender check — Run-#11 invariant 7),
    /// refunds WTB pool residue and any escrowed_eve to the shop owner, then deactivates.
    /// If ANY step fails, TX aborts and shop stays is_active = true.
    public entry fun close_shop(
        registry: &mut BazarRegistry,
        shop_id: ID,
        gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        recipient_character: &Character,
        pool: &mut WtbEscrowPool,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // V38 split: borrow the ShopOpsCap once; the read-borrow + mutator wrappers need it.
        let cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        let owner_addr = validate_shop_close(registry, shop_id, gov, recipient_character, cap, ctx);

        // GAS-07: mirror shop_moderation::force_close_shop_internal:91-162 exactly.
        // One borrow_mut held across all drain iterations + WTB pool refund + EVE extraction.
        // Listing/ExchangePair have copy,drop — *std::vector::borrow() is safe inside live borrow.
        // &mut Shop (registry root) and &mut StorageUnit (ssu param) are distinct roots —
        // the Move borrow checker accepts both simultaneously, as proven by the live V38
        // shop_moderation code.
        // Block is dropped before finalize_close_pre_drained calls deactivate_shop_by_id_g
        // (which requires &mut BazarRegistry — same borrow-checker constraint as shop_moderation).
        let (eve_balance, refund_opt) = {
            let shop = bazar::borrow_shop_mut(registry, shop_id); // single DOF load
            let drain_items = bazar::shop_kind(shop) != SHOP_WTB;

            // --- Drain WTS/FREE listings into Player Locker (non-WTB only) ---
            let listing_count = if (drain_items) std::vector::length(bazar::shop_listings(shop)) else 0;
            let mut i = 0;
            while (i < listing_count) {
                let listing = *std::vector::borrow(bazar::shop_listings(shop), i);
                let qty = bazar::listing_quantity(&listing);
                if (qty > 0) {
                    let type_id = bazar::listing_item_type_id(&listing);
                    let item = storage_unit::withdraw_from_open_inventory<BazarAuth>(
                        ssu,
                        recipient_character,
                        bazar::new_bazar_auth(),
                        type_id,
                        (qty as u32),
                        ctx,
                    );
                    storage_unit::deposit_to_owned<BazarAuth>(
                        ssu,
                        recipient_character,
                        item,
                        bazar::new_bazar_auth(),
                        ctx,
                    );
                };
                i = i + 1;
            };

            // --- Drain DE pairs (offer side only) into Player Locker ---
            let pair_count = if (drain_items) std::vector::length(bazar::shop_pairs(shop)) else 0;
            let mut j = 0;
            while (j < pair_count) {
                let pair = *std::vector::borrow(bazar::shop_pairs(shop), j);
                let qty = bazar::pair_offer_qty(&pair);
                if (qty > 0) {
                    let type_id = bazar::pair_offer_type(&pair);
                    let item = storage_unit::withdraw_from_open_inventory<BazarAuth>(
                        ssu,
                        recipient_character,
                        bazar::new_bazar_auth(),
                        type_id,
                        (qty as u32),
                        ctx,
                    );
                    storage_unit::deposit_to_owned<BazarAuth>(
                        ssu,
                        recipient_character,
                        item,
                        bazar::new_bazar_auth(),
                        ctx,
                    );
                };
                j = j + 1;
            };

            // WTB pool residue refund inside the live borrow (idempotent — None if no entry).
            let coin_opt = shop_ops_guarded::withdraw_owner_residual_on_close_g(
                pool, shop_id, owner_addr, cap, ctx,
            );
            if (option::is_some(&coin_opt)) {
                transfer::public_transfer(option::destroy_some(coin_opt), owner_addr);
            } else { option::destroy_none(coin_opt); };

            // Extract escrowed_eve while borrow is live.
            let eve_balance = shop_ops_guarded::escrowed_eve_value_g(shop, cap);
            let refund_opt = if (eve_balance > 0) {
                option::some(shop_ops_guarded::withdraw_escrowed_eve_g(shop, eve_balance, cap, ctx))
            } else { option::none() };
            (eve_balance, refund_opt)
        }; // shop borrow dropped — registry free for deactivate_shop_by_id_g

        finalize_close_pre_drained(registry, shop_id, owner_addr, refund_opt, cap, ctx);
        let _ = clock;
    }

    /// SSU-owner self-close. Drains items into the SSU's Main Storage tier via
    /// `deposit_by_owner<StorageUnit>` (sender-check enforced by storage_unit;
    /// recipient_character.address MUST equal tx sender), refunds WTB pool residue
    /// and any escrowed_eve to the shop owner, then deactivates.
    /// `ssu_owner_cap` is borrowed by reference (`&OwnerCap<StorageUnit>`); the FE PTB
    /// retains ownership and must return it to the character via the SSU receiving pattern.
    public entry fun close_shop_as_ssu_owner(
        registry: &mut BazarRegistry,
        shop_id: ID,
        gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        recipient_character: &Character,
        ssu_owner_cap: &OwnerCap<StorageUnit>,
        pool: &mut WtbEscrowPool,
        cap_store: &ShopOpsCapStore,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // V38 split: borrow the ShopOpsCap once; the read-borrow + mutator wrappers need it.
        let cap = shop_ops_cap_store::borrow_shop_ops_cap(cap_store);
        let owner_addr = validate_shop_close(registry, shop_id, gov, recipient_character, cap, ctx);

        // Assert 7: OwnerCap must be authorized for this shop's SSU object.
        assert!(
            access::is_authorized(ssu_owner_cap, object::id(ssu)),
            E_WRONG_OWNER_CAP_FOR_SSU,
        );

        // Assert 8: recipient_character.address must equal tx sender
        // (defense-in-depth ahead of world::storage_unit::deposit_by_owner's own sender check).
        assert!(
            character::character_address(recipient_character) == tx_context::sender(ctx),
            E_CHARACTER_NOT_SENDER,
        );

        // GAS-07: same held-borrow form as close_shop above.
        // deposit_by_owner<StorageUnit> replaces deposit_to_owned<BazarAuth> — only diff.
        let (eve_balance, refund_opt) = {
            let shop = bazar::borrow_shop_mut(registry, shop_id); // single DOF load
            let drain_items = bazar::shop_kind(shop) != SHOP_WTB;

            // --- Drain WTS/FREE listings into Main Storage (non-WTB only) ---
            let listing_count = if (drain_items) std::vector::length(bazar::shop_listings(shop)) else 0;
            let mut i = 0;
            while (i < listing_count) {
                let listing = *std::vector::borrow(bazar::shop_listings(shop), i);
                let qty = bazar::listing_quantity(&listing);
                if (qty > 0) {
                    let type_id = bazar::listing_item_type_id(&listing);
                    let item = storage_unit::withdraw_from_open_inventory<BazarAuth>(
                        ssu,
                        recipient_character,
                        bazar::new_bazar_auth(),
                        type_id,
                        (qty as u32),
                        ctx,
                    );
                    storage_unit::deposit_by_owner<StorageUnit>(
                        ssu,
                        item,
                        recipient_character,
                        ssu_owner_cap,
                        ctx,
                    );
                };
                i = i + 1;
            };

            // --- Drain DE pairs into Main Storage ---
            let pair_count = if (drain_items) std::vector::length(bazar::shop_pairs(shop)) else 0;
            let mut j = 0;
            while (j < pair_count) {
                let pair = *std::vector::borrow(bazar::shop_pairs(shop), j);
                let qty = bazar::pair_offer_qty(&pair);
                if (qty > 0) {
                    let type_id = bazar::pair_offer_type(&pair);
                    let item = storage_unit::withdraw_from_open_inventory<BazarAuth>(
                        ssu,
                        recipient_character,
                        bazar::new_bazar_auth(),
                        type_id,
                        (qty as u32),
                        ctx,
                    );
                    storage_unit::deposit_by_owner<StorageUnit>(
                        ssu,
                        item,
                        recipient_character,
                        ssu_owner_cap,
                        ctx,
                    );
                };
                j = j + 1;
            };

            // WTB pool residue refund inside the live borrow.
            let coin_opt = shop_ops_guarded::withdraw_owner_residual_on_close_g(
                pool, shop_id, owner_addr, cap, ctx,
            );
            if (option::is_some(&coin_opt)) {
                transfer::public_transfer(option::destroy_some(coin_opt), owner_addr);
            } else { option::destroy_none(coin_opt); };

            // Extract escrowed_eve while borrow is live.
            let eve_balance = shop_ops_guarded::escrowed_eve_value_g(shop, cap);
            let refund_opt = if (eve_balance > 0) {
                option::some(shop_ops_guarded::withdraw_escrowed_eve_g(shop, eve_balance, cap, ctx))
            } else { option::none() };
            (eve_balance, refund_opt)
        }; // shop borrow dropped

        finalize_close_pre_drained(registry, shop_id, owner_addr, refund_opt, cap, ctx);
        let _ = clock;
    }

    // --- Private Helpers ---

    /// Asserts 1-5 (canonical order per design § 3.1). Returns the shop owner address.
    /// Assert 6 (assert_not_frozen) is intentionally SKIPPED for self-close per SA-308.
    /// Asserts 7+8 are SSU-owner-tier-only and live inline in close_shop_as_ssu_owner.
    fun validate_shop_close(
        registry: &mut BazarRegistry,
        shop_id: ID,
        gov: &SSUGovernance,
        recipient_character: &Character,
        cap: &ShopOpsCap,
        ctx: &TxContext,
    ): address {
        let owner_addr = bazar::shop_owner(shop_ops_guarded::borrow_shop_g(registry, shop_id, cap));
        assert!(owner_addr == tx_context::sender(ctx), E_NOT_SHOP_OWNER);
        assert!(bazar::shop_is_active(shop_ops_guarded::borrow_shop_g(registry, shop_id, cap)), E_SHOP_NOT_ACTIVE);
        assert!(
            character::character_address(recipient_character) == owner_addr,
            E_RECIPIENT_NOT_SHOP_OWNER,
        );
        ssu_governance::assert_subject_in_governance(
            gov,
            bazar::shop_ssu_id(shop_ops_guarded::borrow_shop_g(registry, shop_id, cap)),
        );
        ssu_governance::assert_active(gov);
        owner_addr
    }

    /// GAS-07: renamed from `finalize_close`. The WTB pool refund, escrowed_eve read,
    /// and EVE withdrawal have all been folded into the caller's held-borrow block.
    /// This helper receives the pre-extracted `refund_opt: Option<Coin<EVE>>` and only
    /// transfers the EVE (if any) then calls the unconditional deactivate.
    ///
    /// GUARDRAIL: deactivate_shop_by_id_g is unconditional — re-close prevention is
    /// anchored on is_active (asserted in validate_shop_close BEFORE this runs), NOT on
    /// the listings/pairs vector being emptied. The new pattern leaves vectors non-empty
    /// on a deactivated shop; that is correct and safe.
    ///
    /// NOTE: `pool` parameter removed — WTB pool refund now happens inside the drain block,
    /// before the shop borrow is dropped. Callers no longer pass `pool` here.
    fun finalize_close_pre_drained(
        registry: &mut BazarRegistry,
        shop_id: ID,
        owner_addr: address,
        refund_opt: Option<Coin<EVE>>,
        cap: &ShopOpsCap,
        ctx: &mut TxContext,
    ) {
        // Pre-extracted escrowed-EVE refund (Latent Twin Bug Fix retained).
        if (option::is_some(&refund_opt)) {
            transfer::public_transfer(option::destroy_some(refund_opt), owner_addr);
        } else {
            option::destroy_none(refund_opt);
        };

        // Unconditional deactivate — MUST remain unconditional (GAS-07 guardrail).
        shop_ops_guarded::deactivate_shop_by_id_g(registry, shop_id, owner_addr, cap);
        let _ = ctx;
    }

    // --- Public (Package) Helpers ---

    /// Pure read helper: is the shop's owner the same address as the SSU's owner?
    /// Consumed by shop_moderation::force_close_shop_internal to enforce
    /// E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP (admin cannot force-close SSU-owner-owned shops).
    public(package) fun shop_owner_is_ssu_owner(shop: &Shop, gov: &SSUGovernance): bool {
        bazar::shop_owner(shop) == ssu_governance::ssu_owner(gov)
    }

    // --- Test-Only Accessors ---

    #[test_only]
    public fun e_not_shop_owner_for_testing(): u64 { E_NOT_SHOP_OWNER }
    #[test_only]
    public fun e_shop_not_active_for_testing(): u64 { E_SHOP_NOT_ACTIVE }
    #[test_only]
    public fun e_recipient_not_shop_owner_for_testing(): u64 { E_RECIPIENT_NOT_SHOP_OWNER }
    #[test_only]
    public fun e_wrong_owner_cap_for_ssu_for_testing(): u64 { E_WRONG_OWNER_CAP_FOR_SSU }
    #[test_only]
    public fun e_character_not_sender_for_testing(): u64 { E_CHARACTER_NOT_SENDER }
    #[test_only]
    public fun e_cannot_force_close_ssu_owner_shop_for_testing(): u64 { E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
