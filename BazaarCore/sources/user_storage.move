// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_core::user_storage {
    use sui::event;
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use std::option::{Self, Option};
    use bazaar_core::membership::{Self, SSUAdminCap, MemberRegistry};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};

    // ===== Error Codes =====
    const E_NO_ITEMS_TO_WITHDRAW: u64 = 1;
    const E_UNCLAIMED_ITEM_NOT_FOUND: u64 = 2;
    const E_UNCLAIMED_ITEM_EXPIRED: u64 = 3;
    const E_NOT_ORIGINAL_OWNER: u64 = 4;
    const E_INVALID_INDEX: u64 = 5;
    const E_VOLUME_LIMIT_EXCEEDED: u64 = 6;
    const E_WRONG_SSU: u64 = 7;
    const E_INVALID_ROLE: u64 = 8;  // OS-46: role > 7
    const E_UNCLAIMED_NOT_FOUND: u64 = 9;
    const E_GRACE_PERIOD_NOT_EXPIRED: u64 = 10;

    // Sentinel: u64::MAX = no cap. Move add() panics on overflow before the assertion.
    const VOLUME_LIMIT_UNLIMITED: u64 = 18446744073709551615;

    // ===== Structs =====
    public struct StoredItem has store, copy, drop {
        item_type_id: u64,
        quantity: u64,
        deposited_at_ms: u64,
        source_shop_id: Option<ID>,
    }

    public struct UnclaimedItem has store, drop {
        original_owner: address,
        item_type_id: u64,
        quantity: u64,
        shop_id: ID,
        expiry_ms: u64,
    }

    public struct UserStorage has key {
        id: UID,
        ssu_id: address,
        // GAS-03: inner Table keyed by item_type_id for O(1) merge on store + O(1) keyed withdraw.
        deposits: Table<address, Table<u64, StoredItem>>,
        unclaimed_items: Table<ID, UnclaimedItem>,
        total_item_count: u64,
        // R3.3: per-SSU storage volume cap. Sentinel VOLUME_LIMIT_UNLIMITED = no cap.
        volume_limit: u64,
        // R6.7.0 (step 9): per-role volume limit overrides. role_id (u8) -> volume cap (u64).
        // Empty at creation. Populated by OS-46 set_volume_limit_for_role (R6.7.1).
        volume_limits_by_role: Table<u8, u64>,
    }

    // ===== Events =====
    public struct ItemsStored has copy, drop {
        ssu_id: address, player: address, item_type_id: u64, quantity: u64, timestamp_ms: u64,
    }
    public struct ItemsWithdrawn has copy, drop {
        ssu_id: address, player: address, item_count: u64, timestamp_ms: u64,
    }
    public struct ItemMovedToUnclaimed has copy, drop {
        ssu_id: address, original_owner: address, item_type_id: u64,
        quantity: u64, shop_id: ID, timestamp_ms: u64,
    }
    public struct UnclaimedItemClaimed has copy, drop {
        ssu_id: address, claimer: address, item_type_id: u64,
        quantity: u64, shop_id: ID, timestamp_ms: u64,
    }
    public struct VolumeLimitSet has copy, drop {
        ssu_id: address,
        new_limit: u64,
        set_by: address,
        timestamp_ms: u64,
    }

    /// Emitted when per-role volume limit is set via set_volume_limit_for_role.
    public struct VolumeLimitSetForRole has copy, drop {
        ssu_id: address,
        role: u8,
        limit: u64,
        set_by: address,
        timestamp_ms: u64,
    }

    public struct AdminClaimedForUser has copy, drop {
        ssu_id: address,
        admin: address,
        target: address,
        item_type_id: u64,
        quantity: u64,
        shop_id: ID,
        timestamp_ms: u64,
    }

    public struct UnclaimedItemConfiscated has copy, drop {
        ssu_id: address,
        admin: address,
        item_type_id: u64,
        quantity: u64,
        shop_id: ID,
        timestamp_ms: u64,
    }

    // ===== Package-Internal Creation =====
    public(package) fun create_storage(ssu_id: address, ctx: &mut TxContext): UserStorage {
        UserStorage {
            id: object::new(ctx), ssu_id,
            deposits: table::new(ctx),
            unclaimed_items: table::new(ctx),
            total_item_count: 0,
            volume_limit: VOLUME_LIMIT_UNLIMITED,  // R3.3: default = no cap
            volume_limits_by_role: table::new(ctx), // R6.7.0: empty, populated by OS-46 in R6.7.1
        }
    }

    /// Share a newly-created UserStorage. Called from package siblings during bootstrap.
    /// Kept inside this module so `UserStorage` need not have the `store` ability.
    public(package) fun share(storage: UserStorage) {
        transfer::share_object(storage);
    }

    // ===== Governance: Volume Cap =====
    /// Set the per-SSU storage volume cap. Pass VOLUME_LIMIT_UNLIMITED to remove the cap.
    /// R3.5 annotation: NO assert_not_frozen here — governance ops work during freeze.
    public entry fun set_volume_limit(
        cap: &membership::SSUOwnerCap,
        storage: &mut UserStorage,
        new_limit: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(membership::cap_ssu_id(cap) == storage.ssu_id, E_WRONG_SSU);
        storage.volume_limit = new_limit;
        event::emit(VolumeLimitSet {
            ssu_id: storage.ssu_id,
            new_limit,
            set_by: tx_context::sender(ctx),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== OS-46: Per-Role Volume Limit =====

    /// Set per-role volume limit for this UserStorage.
    /// Owner-only (matches set_volume_limit precedent). Requires active SSUGovernance.
    /// Pass gov to validate active state and ssu cross-binding.
    /// Aborts E_WRONG_SSU, E_SSU_NOT_ACTIVE, E_INVALID_ROLE.
    public entry fun set_volume_limit_for_role(
        cap: &membership::SSUOwnerCap,
        storage: &mut UserStorage,
        role: u8,
        limit: u64,
        gov: &SSUGovernance,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(membership::cap_ssu_id(cap) == storage.ssu_id, E_WRONG_SSU);
        assert!(ssu_governance::ssu_id(gov) == storage.ssu_id, E_WRONG_SSU);
        ssu_governance::assert_active(gov);   // R6.7.1 E_SSU_NOT_ACTIVE
        assert!(role <= 7, E_INVALID_ROLE);
        if (table::contains(&storage.volume_limits_by_role, role)) {
            *table::borrow_mut(&mut storage.volume_limits_by_role, role) = limit;
        } else {
            table::add(&mut storage.volume_limits_by_role, role, limit);
        };
        event::emit(VolumeLimitSetForRole {
            ssu_id: storage.ssu_id,
            role,
            limit,
            set_by: tx_context::sender(ctx),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Package-Internal Write Operations =====

    /// Store items purchased for `buyer` into per-player storage.
    ///
    /// TRANSITIVE FREEZE COVERAGE (SDC-R3-010 / SA-R3-08):
    /// This function is `public(package)` and is called exclusively from
    /// `shop_ops` entry functions (`wts_buy_*`, `wtb_fill_*`, `de_exchange_*`,
    /// `free_claim`). ALL of those callers guard for freeze via
    /// `ssu_governance::assert_not_frozen` before reaching this function.
    /// Adding a redundant `gov: &SSUGovernance` parameter here would require
    /// threading it through 5 call-sites and create dead-code duplication.
    ///
    /// If a future package-internal caller is added that bypasses the shop_ops
    /// layer, that caller MUST independently call `assert_not_frozen` before
    /// invoking this function. This obligation is documented here so it survives
    /// code review. Failure to do so is a security regression.
    public(package) fun store_purchased_items(
        storage: &mut UserStorage,
        members: &MemberRegistry,          // R6.7.6 OS-46: role-aware volume limit
        buyer: address,
        item_type_id: u64,
        quantity: u64,
        source_shop_id: Option<ID>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        // R6.7.6 OS-46: role-aware volume limit enforcement.
        // Priority: per-role limit (if set for buyer's effective_role) > global volume_limit.
        let effective_role = membership::effective_role(members, buyer);
        let role_limit_opt = volume_limit_for_role(storage, effective_role);
        let applicable_limit = if (option::is_some(&role_limit_opt)) {
            *option::borrow(&role_limit_opt)
        } else {
            storage.volume_limit
        };
        let new_total = storage.total_item_count + quantity;
        assert!(new_total <= applicable_limit, E_VOLUME_LIMIT_EXCEEDED);
        // GAS-03: O(1) merge via nested Table keyed by item_type_id.
        // Lazy-init the inner Table for first-time buyers; table::new requires ctx.
        if (!table::contains(&storage.deposits, buyer)) {
            table::add(&mut storage.deposits, buyer, table::new<u64, StoredItem>(ctx));
        };
        let player_tbl = table::borrow_mut(&mut storage.deposits, buyer);
        if (table::contains(player_tbl, item_type_id)) {
            let existing = table::borrow_mut(player_tbl, item_type_id);
            existing.quantity = existing.quantity + quantity;
        } else {
            table::add(player_tbl, item_type_id, StoredItem {
                item_type_id, quantity, deposited_at_ms: now, source_shop_id,
            });
        };
        storage.total_item_count = storage.total_item_count + quantity;
        event::emit(ItemsStored {
            ssu_id: storage.ssu_id, player: buyer, item_type_id, quantity, timestamp_ms: now,
        });
    }

    public(package) fun move_to_unclaimed(
        storage: &mut UserStorage, original_owner: address, item_type_id: u64,
        quantity: u64, shop_id: ID, expiry_ms: u64, clock: &Clock,
    ) {
        if (table::contains(&storage.unclaimed_items, shop_id)) return;
        table::add(&mut storage.unclaimed_items, shop_id, UnclaimedItem {
            original_owner, item_type_id, quantity, shop_id, expiry_ms,
        });
        event::emit(ItemMovedToUnclaimed {
            ssu_id: storage.ssu_id, original_owner, item_type_id, quantity,
            shop_id, timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== OS-47: Admin Claim + Confiscate (SSUAdminCap) =====

    /// Admin claims an unclaimed item on behalf of `target` user, placing it in their storage.
    /// Asserts: cap SSU matches storage → governance active → item exists.
    /// Does NOT check original_owner match — admin overrides that gate.
    public entry fun admin_claim_for_user(
        cap: &SSUAdminCap,
        gov: &SSUGovernance,
        members: &MemberRegistry,          // R6.7.6 OS-46 + Q3: role lookup uses target's role
        storage: &mut UserStorage,
        target: address,
        item_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(membership::ssu_admin_cap_ssu_id(cap) == storage.ssu_id, E_WRONG_SSU);
        assert!(ssu_governance::ssu_id(gov) == storage.ssu_id, E_WRONG_SSU);
        ssu_governance::assert_active(gov);   // §2.6 GATED
        assert!(table::contains(&storage.unclaimed_items, item_id), E_UNCLAIMED_NOT_FOUND);
        let now = clock::timestamp_ms(clock);
        let item = table::remove(&mut storage.unclaimed_items, item_id);
        // R6.7.6 Condition #7: per-role lookup uses effective_role(members, target), NOT admin.
        store_purchased_items(storage, members, target, item.item_type_id, item.quantity,
            option::some(item.shop_id), clock, ctx);
        event::emit(AdminClaimedForUser {
            ssu_id: storage.ssu_id,
            admin: tx_context::sender(ctx),
            target,
            item_type_id: item.item_type_id,
            quantity: item.quantity,
            shop_id: item_id,
            timestamp_ms: now,
        });
    }

    /// Admin confiscates an unclaimed item after the grace period has expired.
    /// Asserts: cap SSU matches → governance active → item exists → expiry has passed.
    /// Removes the item from unclaimed storage (permanently destroyed — no recipient).
    public entry fun confiscate_unclaimed_item(
        cap: &SSUAdminCap,
        gov: &SSUGovernance,
        storage: &mut UserStorage,
        item_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(membership::ssu_admin_cap_ssu_id(cap) == storage.ssu_id, E_WRONG_SSU);
        assert!(ssu_governance::ssu_id(gov) == storage.ssu_id, E_WRONG_SSU);
        ssu_governance::assert_active(gov);   // §2.6 GATED
        assert!(table::contains(&storage.unclaimed_items, item_id), E_UNCLAIMED_NOT_FOUND);
        let item = table::borrow(&storage.unclaimed_items, item_id);
        assert!(clock::timestamp_ms(clock) > item.expiry_ms, E_GRACE_PERIOD_NOT_EXPIRED);
        let item = table::remove(&mut storage.unclaimed_items, item_id);
        event::emit(UnclaimedItemConfiscated {
            ssu_id: storage.ssu_id,
            admin: tx_context::sender(ctx),
            item_type_id: item.item_type_id,
            quantity: item.quantity,
            shop_id: item_id,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Public Player Operations =====
    public fun withdraw_items(
        // GAS-03: re-keyed from positional item_indices to item_type_ids (Table key lookup, O(m)).
        storage: &mut UserStorage, item_type_ids: vector<u64>, clock: &Clock, ctx: &mut TxContext,
    ) {
        let player = tx_context::sender(ctx);
        let count = vector::length(&item_type_ids);
        assert!(count > 0, E_NO_ITEMS_TO_WITHDRAW);
        assert!(table::contains(&storage.deposits, player), E_NO_ITEMS_TO_WITHDRAW);
        let player_tbl = table::borrow_mut(&mut storage.deposits, player);
        let mut withdrawn_qty = 0u64;
        let mut j = 0;
        while (j < count) {
            let type_id = *vector::borrow(&item_type_ids, j);
            assert!(table::contains(player_tbl, type_id), E_INVALID_INDEX);
            let item = table::remove(player_tbl, type_id);
            withdrawn_qty = withdrawn_qty + item.quantity;
            storage.total_item_count = if (storage.total_item_count >= item.quantity) {
                storage.total_item_count - item.quantity
            } else { 0 };
            j = j + 1;
        };
        event::emit(ItemsWithdrawn {
            ssu_id: storage.ssu_id, player, item_count: withdrawn_qty,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    public fun claim_unclaimed_item(
        storage: &mut UserStorage, shop_id: ID, clock: &Clock, ctx: &mut TxContext,
    ) {
        let claimer = tx_context::sender(ctx);
        assert!(table::contains(&storage.unclaimed_items, shop_id), E_UNCLAIMED_ITEM_NOT_FOUND);
        let item = table::borrow(&storage.unclaimed_items, shop_id);
        assert!(item.original_owner == claimer, E_NOT_ORIGINAL_OWNER);
        let now = clock::timestamp_ms(clock);
        assert!(now <= item.expiry_ms, E_UNCLAIMED_ITEM_EXPIRED);
        let item = table::remove(&mut storage.unclaimed_items, shop_id);
        event::emit(UnclaimedItemClaimed {
            ssu_id: storage.ssu_id, claimer, item_type_id: item.item_type_id,
            quantity: item.quantity, shop_id, timestamp_ms: now,
        });
    }

    // ===== Public Accessors =====
    // GAS-03: player_item_count and player_items removed — impossible with nested Table
    // (Move Table has no native iteration). Both were dead (zero live callers). FE reads
    // the inner Table via DF enumeration or derives from events. §4 caller audit confirms.
    public fun unclaimed_count(storage: &UserStorage): u64 { table::length(&storage.unclaimed_items) }
    public fun ssu_id(storage: &UserStorage): address { storage.ssu_id }
    public fun total_item_count(storage: &UserStorage): u64 { storage.total_item_count }
    public fun stored_item_type_id(item: &StoredItem): u64 { item.item_type_id }
    public fun stored_item_quantity(item: &StoredItem): u64 { item.quantity }
    public fun stored_item_deposited_at(item: &StoredItem): u64 { item.deposited_at_ms }
    public fun stored_item_source_shop(item: &StoredItem): Option<ID> { item.source_shop_id }
    // R3.3 — volume limit accessors
    public fun volume_limit(storage: &UserStorage): u64 { storage.volume_limit }
    /// Returns the sentinel value signifying "no cap" (per D-R3.3-01 / SDC-R3-007).
    public fun volume_limit_unlimited(): u64 { VOLUME_LIMIT_UNLIMITED }
    /// Returns per-role volume limit for given role.
    /// Returns option::some(limit) if set, option::none() if no per-role override exists.
    /// Callers fall back to storage.volume_limit when none.
    public fun volume_limit_for_role(storage: &UserStorage, role: u8): Option<u64> {
        if (table::contains(&storage.volume_limits_by_role, role)) {
            option::some(*table::borrow(&storage.volume_limits_by_role, role))
        } else {
            option::none()
        }
    }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(ssu_id: address, ctx: &mut TxContext): UserStorage {
        create_storage(ssu_id, ctx)
    }

    /// GAS-03 test helper: number of distinct item_type_id rows in the player's inner Table.
    /// Returns 0 if the player has no outer-Table entry.
    #[test_only]
    public fun deposit_type_count_for_testing(storage: &UserStorage, player: address): u64 {
        if (!table::contains(&storage.deposits, player)) return 0;
        let player_tbl = table::borrow(&storage.deposits, player);
        table::length(player_tbl)
    }

    /// GAS-03 test helper: quantity for a specific item_type_id in the player's inner Table.
    /// Returns 0 if the player or the item_type_id is absent.
    #[test_only]
    public fun deposit_quantity_for_testing(storage: &UserStorage, player: address, type_id: u64): u64 {
        if (!table::contains(&storage.deposits, player)) return 0;
        let player_tbl = table::borrow(&storage.deposits, player);
        if (!table::contains(player_tbl, type_id)) return 0;
        table::borrow(player_tbl, type_id).quantity
    }

    #[test_only]
    public fun share_for_testing(storage: UserStorage) {
        transfer::share_object(storage);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
