// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_core::quicktrade_vault {
    use sui::table::{Self, Table};
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::transfer;
    use sui::dynamic_field as df;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    // Basket additions — see "Basket flow" section at the bottom of this module.
    use world::storage_unit::{Self as su, StorageUnit};
    use world::character::{Self as character, Character};
    use world::inventory::{Self as inv, Item};
    use world::access::OwnerCap;
    use bazaar_core::bazar::{Self, BazarAuth};
    use bazaar_core::membership::{Self, MemberRegistry};
    use dapp_hub::role_types;

    // --- Error Codes ---
    const E_LENGTH_MISMATCH: u64 = 1;
    const E_NO_ENTRIES:      u64 = 2;
    const E_INVALID_INDEX:   u64 = 3;
    // Basket additions
    const E_NOT_OWNER_OF_CHARACTER:  u64 = 4;
    const E_INSUFFICIENT_BASKET_QTY: u64 = 5;
    const E_ZERO_QUANTITY:           u64 = 6;
    const E_EMPTY_ITEMS:             u64 = 7;

    // --- Shared Object ---
    public struct QuicktradeVault has key {
        id: UID,
        ssu_id: address,
        deposits: Table<address, vector<VaultEntry>>,
    }

    public struct VaultEntry has store, copy, drop {
        item_type_id: u64,
        quantity: u64,
        deposited_at_ms: u64,
    }

    // --- Events ---
    public struct QuicktradeDeposited has copy, drop { ssu_id: address, player: address, item_count: u64 }
    public struct QuicktradeWithdrawn has copy, drop { ssu_id: address, player: address, item_count: u64 }

    // --- Package Factory ---
    public(package) fun create_vault(ssu_id: address, ctx: &mut TxContext): QuicktradeVault {
        QuicktradeVault { id: object::new(ctx), ssu_id, deposits: table::new(ctx) }
    }

    /// Share a QuicktradeVault as a shared object. QuicktradeVault has `key` only
    /// (no `store`), so transfer::share_object must be used (not public_share_object).
    public(package) fun share(vault: QuicktradeVault) {
        transfer::share_object(vault)
    }

    public fun deposit_to_vault(
        vault: &mut QuicktradeVault,
        gov: &SSUGovernance, // R3.5 NEW: freeze + identity guard
        item_type_ids: vector<u64>,
        quantities: vector<u64>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        ssu_governance::assert_not_frozen(gov);                           // R3.5
        ssu_governance::assert_active(gov);                                // R6.7.1 E_SSU_NOT_ACTIVE
        ssu_governance::assert_subject_in_governance(gov, vault.ssu_id); // R3.5 SA-R3-01
        let len = vector::length(&item_type_ids);
        assert!(len == vector::length(&quantities), E_LENGTH_MISMATCH);
        assert!(len > 0, E_NO_ENTRIES);
        let player = tx_context::sender(ctx);
        let now_ms = clock::timestamp_ms(clock);
        if (!table::contains(&vault.deposits, player)) {
            table::add(&mut vault.deposits, player, vector::empty<VaultEntry>());
        };
        let entries = table::borrow_mut(&mut vault.deposits, player);
        let mut i = 0;
        while (i < len) {
            vector::push_back(entries, VaultEntry {
                item_type_id: *vector::borrow(&item_type_ids, i),
                quantity: *vector::borrow(&quantities, i),
                deposited_at_ms: now_ms,
            });
            i = i + 1;
        };
        event::emit(QuicktradeDeposited { ssu_id: vault.ssu_id, player, item_count: len });
    }

    public fun withdraw_from_vault(
        vault: &mut QuicktradeVault,
        entry_indices: vector<u64>,
        ctx: &mut TxContext,
    ) {
        let player = tx_context::sender(ctx);
        let count = vector::length(&entry_indices);
        assert!(count > 0, E_NO_ENTRIES);
        assert!(table::contains(&vault.deposits, player), E_NO_ENTRIES);
        let entries = table::borrow_mut(&mut vault.deposits, player);
        let entries_len = vector::length(entries);
        let mut k = 0;
        while (k < count) {
            assert!(*vector::borrow(&entry_indices, k) < entries_len, E_INVALID_INDEX);
            k = k + 1;
        };
        // Sort indices descending
        let mut sorted = entry_indices;
        let mut s = 0;
        while (s < count) {
            let mut max_pos = s;
            let mut t = s + 1;
            while (t < count) {
                if (*vector::borrow(&sorted, t) > *vector::borrow(&sorted, max_pos)) {
                    max_pos = t;
                };
                t = t + 1;
            };
            let tmp = *vector::borrow(&sorted, s);
            *vector::borrow_mut(&mut sorted, s) = *vector::borrow(&sorted, max_pos);
            *vector::borrow_mut(&mut sorted, max_pos) = tmp;
            s = s + 1;
        };
        let mut r = 0;
        while (r < count) {
            vector::remove(entries, *vector::borrow(&sorted, r));
            r = r + 1;
        };
        event::emit(QuicktradeWithdrawn { ssu_id: vault.ssu_id, player, item_count: count });
    }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_vault_for_testing(ssu_id: address, ctx: &mut TxContext): QuicktradeVault {
        create_vault(ssu_id, ctx)
    }

    // --- Accessors ---
    public fun player_vault_entries(vault: &QuicktradeVault, player: address): vector<VaultEntry> {
        if (!table::contains(&vault.deposits, player)) { return vector::empty<VaultEntry>() };
        *table::borrow(&vault.deposits, player)
    }

    public fun vault_entry_count(vault: &QuicktradeVault, player: address): u64 {
        if (!table::contains(&vault.deposits, player)) return 0;
        vector::length(table::borrow(&vault.deposits, player))
    }

    // =====================================================================
    // Basket flow (additive — added on top of the legacy ledger-only fns
    //   `deposit_to_vault` + `withdraw_from_vault` which DO NOT move items).
    //
    // The new flow physically moves items between the caller's locker tier
    // and the SSU's Open Storage (via BazarAuth-gated world calls), and
    // tracks aggregate per-typeId quantities as dynamic fields on vault.id.
    // No struct changes to QuicktradeVault — upgrade-safe additive surface.
    //
    // Tier asymmetry by caller (per Run-#10 invariants 5–6):
    //   - Non-owner member: items live in / return to **Player Locker**
    //     (DF keyed by character.owner_cap_id).
    //   - SSU owner:        items live in / return to **Main Storage**
    //     (DF keyed by storage_unit.owner_cap_id).
    //
    // Deposit is tier-agnostic on the Move side — the FE PTB withdraws the
    // items from the right tier (`withdraw_by_owner<Character>` for members,
    // `withdraw_by_owner<StorageUnit>` for the owner) BEFORE handing the
    // vector<Item> to `basket_deposit`. Once items are in hand, Move just
    // deposits them all into Open Storage.
    //
    // Withdraw is split into two entry fns because the destination tier
    // requires different world primitives:
    //   - `basket_withdraw_to_locker`  → deposit_to_owned<BazarAuth>      (Player Locker)
    //   - `basket_withdraw_to_main`    → deposit_by_owner<StorageUnit>    (Main Storage)
    //
    // Member-or-above gating uses bazaar_core::membership::assert_min_role
    // against the per-SSU MemberRegistry. Open Storage requires BazarAuth
    // extension authorization on the SSU (same authorization shops need).
    // =====================================================================

    /// Dynamic-field key — per-typeId aggregate quantity on vault.id.
    public struct BasketKey has copy, drop, store { type_id: u64 }

    /// Emitted on basket deposit (one event per item; multi-item PTBs fire N times).
    public struct BasketDeposited has copy, drop {
        ssu_id:    address,
        depositor: address,
        type_id:   u64,
        quantity:  u64,
    }

    /// Emitted on basket withdraw (one event per call).
    public struct BasketWithdrawn has copy, drop {
        ssu_id:     address,
        withdrawer: address,
        type_id:    u64,
        quantity:   u64,
    }

    /// Move `items` (pre-withdrawn from caller's Player Locker by the same PTB)
    /// into the SSU's Open Storage and bump the basket counters by typeId.
    ///
    /// `character` MUST be the caller's character (`character_address == ctx.sender`).
    /// The caller MUST be Member-or-above per the per-SSU MemberRegistry.
    public fun basket_deposit(
        vault: &mut QuicktradeVault,
        ssu_gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        character: &Character,
        member_registry: &MemberRegistry,
        mut items: vector<Item>,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(character::character_address(character) == sender, E_NOT_OWNER_OF_CHARACTER);
        ssu_governance::assert_not_frozen(ssu_gov);
        ssu_governance::assert_active(ssu_gov);
        ssu_governance::assert_subject_in_governance(ssu_gov, vault.ssu_id);
        membership::assert_min_role(member_registry, sender, role_types::role_member());

        let n = vector::length(&items);
        assert!(n > 0, E_EMPTY_ITEMS);

        while (!vector::is_empty(&items)) {
            let item = vector::pop_back(&mut items);
            let type_id = inv::type_id(&item);
            let qty = (inv::quantity(&item) as u64);

            let key = BasketKey { type_id };
            if (df::exists_(&vault.id, key)) {
                let existing: &mut u64 = df::borrow_mut(&mut vault.id, key);
                *existing = *existing + qty;
            } else {
                df::add(&mut vault.id, key, qty);
            };

            su::deposit_to_open_inventory<BazarAuth>(
                ssu, character, item, bazar::new_bazar_auth(), ctx,
            );

            event::emit(BasketDeposited {
                ssu_id: vault.ssu_id, depositor: sender, type_id, quantity: qty,
            });
        };
        vector::destroy_empty(items);
    }

    /// Shared assertions + DF decrement + Open Storage withdraw. Internal helper
    /// shared by both tier-specific entry fns below. Returns the extracted Item
    /// so each caller can deposit it into the tier-appropriate locker.
    fun basket_withdraw_internal(
        vault: &mut QuicktradeVault,
        ssu_gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        character: &Character,
        member_registry: &MemberRegistry,
        type_id: u64,
        quantity: u32,
        ctx: &mut TxContext,
    ): Item {
        let sender = tx_context::sender(ctx);
        assert!(character::character_address(character) == sender, E_NOT_OWNER_OF_CHARACTER);
        ssu_governance::assert_not_frozen(ssu_gov);
        ssu_governance::assert_active(ssu_gov);
        ssu_governance::assert_subject_in_governance(ssu_gov, vault.ssu_id);
        membership::assert_min_role(member_registry, sender, role_types::role_member());
        assert!(quantity > 0, E_ZERO_QUANTITY);

        let key = BasketKey { type_id };
        assert!(df::exists_(&vault.id, key), E_INSUFFICIENT_BASKET_QTY);

        let qty_u64 = (quantity as u64);
        let existing: &mut u64 = df::borrow_mut(&mut vault.id, key);
        assert!(*existing >= qty_u64, E_INSUFFICIENT_BASKET_QTY);
        *existing = *existing - qty_u64;
        let drop_to_zero = *existing == 0;
        if (drop_to_zero) {
            let _removed: u64 = df::remove(&mut vault.id, key);
        };

        event::emit(BasketWithdrawn {
            ssu_id: vault.ssu_id, withdrawer: sender, type_id, quantity: qty_u64,
        });

        su::withdraw_from_open_inventory<BazarAuth>(
            ssu, character, bazar::new_bazar_auth(), type_id, quantity, ctx,
        )
    }

    /// Non-owner-member withdraw path: pulls `quantity` of `type_id` from the basket
    /// and deposits the Item into the caller's **Player Locker** (DF keyed by
    /// `character.owner_cap_id`). Use this fn when the caller does NOT hold the
    /// SSU's `OwnerCap<StorageUnit>` — i.e., regular members.
    public fun basket_withdraw_to_locker(
        vault: &mut QuicktradeVault,
        ssu_gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        character: &Character,
        member_registry: &MemberRegistry,
        type_id: u64,
        quantity: u32,
        ctx: &mut TxContext,
    ) {
        let item = basket_withdraw_internal(
            vault, ssu_gov, ssu, character, member_registry, type_id, quantity, ctx,
        );
        su::deposit_to_owned<BazarAuth>(
            ssu, character, item, bazar::new_bazar_auth(), ctx,
        );
    }

    /// SSU-owner withdraw path: pulls `quantity` of `type_id` from the basket and
    /// deposits the Item into the **Main Storage** tier (DF keyed by the SSU's
    /// `OwnerCap<StorageUnit>`). Use this fn when the caller holds the SSU owner
    /// cap. The `owner_cap` argument is the same cap the SSU owner uses for
    /// shop creation and `withdraw_by_owner<StorageUnit>` from Main Storage.
    public fun basket_withdraw_to_main(
        vault: &mut QuicktradeVault,
        ssu_gov: &SSUGovernance,
        ssu: &mut StorageUnit,
        character: &Character,
        member_registry: &MemberRegistry,
        owner_cap: &OwnerCap<StorageUnit>,
        type_id: u64,
        quantity: u32,
        ctx: &mut TxContext,
    ) {
        let item = basket_withdraw_internal(
            vault, ssu_gov, ssu, character, member_registry, type_id, quantity, ctx,
        );
        su::deposit_by_owner<StorageUnit>(
            ssu, item, character, owner_cap, ctx,
        );
    }

    /// Read accessor — current basket balance for `type_id`. Returns 0 when no DF exists.
    public fun basket_quantity(vault: &QuicktradeVault, type_id: u64): u64 {
        let key = BasketKey { type_id };
        if (df::exists_(&vault.id, key)) {
            *df::borrow(&vault.id, key)
        } else {
            0
        }
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
