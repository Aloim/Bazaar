// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// bazaar_economy::mission_collateral_token_pool — Per-SSU tribe-token
/// collateral custody for Advanced Mission (MIS) shops.
///
/// Mirrors tribe_token_wtb_pool but keyed by (mission_id, taker) instead of shop_id.
/// Stores amounts in Table<CollateralKey, u64> (NOT Balance — tribe tokens are ledger
/// primitives). Supply invariant: Σledger_rows + Σpool_entries == total_supply.
///
/// Lifecycle: accept debits taker row + credits pool; settlement pops pool entry
/// and credits recipient row(s). No mint/burn anywhere on this path.
module bazaar_economy::mission_collateral_token_pool {
    use sui::event;
    use sui::table::{Self, Table};
    use sui::transfer;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::bazaar_assertions;

    // ===== Error Codes =====
    const E_ENTRY_NOT_IN_POOL: u64 = 1;
    const E_INSUFFICIENT_POOL: u64 = 2;
    const E_WRONG_SSU:         u64 = 3;
    const E_ZERO_AMOUNT:       u64 = 4;

    // ===== Structs =====
    public struct CollateralKey has copy, drop, store {
        mission_id: address,
        taker: address,
    }

    public struct MissionCollateralTokenPool has key {
        id: UID,
        ssu_id: address,
        deposits: Table<CollateralKey, u64>,
        total_escrowed: u64,
    }

    // ===== Events =====
    public struct MissionCollateralTokenPoolCreated has copy, drop {
        pool_id: ID,
        ssu_id: address,
    }
    public struct TokenCollateralEarmarked has copy, drop {
        pool_id: ID, mission_id: address, taker: address,
        amount: u64, total_escrowed: u64,
    }
    public struct TokenCollateralReleased has copy, drop {
        pool_id: ID, mission_id: address, taker: address,
        amount: u64, reason: u8,
    }
    public struct TokenCollateralForfeited has copy, drop {
        pool_id: ID, mission_id: address, taker: address, giver: address,
        amount: u64,
    }
    public struct TokenCollateralSplit has copy, drop {
        pool_id: ID, mission_id: address, taker: address, giver: address,
        taker_share: u64, giver_share: u64,
    }

    // ===== Bootstrap =====

    /// Per-SSU bootstrap (Advanced only). Standalone entry for already-live SSUs.
    public entry fun bootstrap_mission_collateral_token_pool(
        ssu_gov: &SSUGovernance,
        ctx: &mut TxContext,
    ) {
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(ssu_gov));
        let pool = create_pool_internal(ssu_governance::ssu_id(ssu_gov), ctx);
        let pool_id = object::id(&pool);
        let ssu_id = pool.ssu_id;
        event::emit(MissionCollateralTokenPoolCreated { pool_id, ssu_id });
        transfer::share_object(pool);
    }

    // ===== Package Factory =====
    fun create_pool_internal(ssu_id: address, ctx: &mut TxContext): MissionCollateralTokenPool {
        MissionCollateralTokenPool {
            id: object::new(ctx),
            ssu_id,
            deposits: table::new(ctx),
            total_escrowed: 0,
        }
    }

    /// Used by ssu_bootstrap or other package-level init flows.
    public(package) fun create_and_share_pool(ssu_gov: &SSUGovernance, ctx: &mut TxContext): ID {
        bazaar_assertions::assert_advanced_external(ssu_governance::ssu_bazaar_type(ssu_gov));
        let ssu_id = ssu_governance::ssu_id(ssu_gov);
        let pool = create_pool_internal(ssu_id, ctx);
        let pool_id = object::id(&pool);
        event::emit(MissionCollateralTokenPoolCreated { pool_id, ssu_id });
        transfer::share_object(pool);
        pool_id
    }

    // ===== SA-V34-06: pool anchor (Advanced variant) =====
    public(package) fun assert_pool_for_ssu(pool: &MissionCollateralTokenPool, ssu_gov: &SSUGovernance) {
        assert!(pool.ssu_id == ssu_governance::ssu_id(ssu_gov), E_WRONG_SSU);
    }

    // ===== Earmark (SA-V34-07: skip if amount == 0) =====
    /// Caller (mission_ledger_ops) must have already debited the taker's ledger row
    /// by `amount` in the same PTB call. amount == 0 → skip (zero-collateral mission).
    public(package) fun credit(
        pool: &mut MissionCollateralTokenPool,
        mission_id: address,
        taker: address,
        amount: u64,
    ) {
        // SA-V34-07: zero-collateral accept skips the earmark entirely.
        if (amount == 0) return;
        assert!(amount > 0, E_ZERO_AMOUNT);  // redundant but explicit
        let key = CollateralKey { mission_id, taker };
        if (table::contains(&pool.deposits, key)) {
            let cur = table::borrow_mut(&mut pool.deposits, key);
            *cur = *cur + amount;
        } else {
            table::add(&mut pool.deposits, key, amount);
        };
        pool.total_escrowed = pool.total_escrowed + amount;
        event::emit(TokenCollateralEarmarked {
            pool_id: object::id(pool), mission_id, taker,
            amount, total_escrowed: pool.total_escrowed,
        });
    }

    // ===== Settlement: pop full entry (SA-V34-05: table::remove) =====
    /// reason: 0 = complete, 1 = reject. Returns amount; caller credits taker row.
    public(package) fun take_full(
        pool: &mut MissionCollateralTokenPool,
        mission_id: address,
        taker: address,
        reason: u8,
    ): u64 {
        let key = CollateralKey { mission_id, taker };
        assert!(table::contains(&pool.deposits, key), E_ENTRY_NOT_IN_POOL);
        let amount = table::remove(&mut pool.deposits, key);
        pool.total_escrowed = pool.total_escrowed - amount;
        event::emit(TokenCollateralReleased {
            pool_id: object::id(pool), mission_id, taker, amount, reason,
        });
        amount
    }

    /// Forfeit path: returns amount; caller credits GIVER row. SA-V34-05.
    public(package) fun take_full_for_forfeit(
        pool: &mut MissionCollateralTokenPool,
        mission_id: address,
        taker: address,
        giver: address,
    ): u64 {
        let key = CollateralKey { mission_id, taker };
        assert!(table::contains(&pool.deposits, key), E_ENTRY_NOT_IN_POOL);
        let amount = table::remove(&mut pool.deposits, key);
        pool.total_escrowed = pool.total_escrowed - amount;
        event::emit(TokenCollateralForfeited {
            pool_id: object::id(pool), mission_id, taker, giver, amount,
        });
        amount
    }

    // ===== Settlement: 50/50 (cancel) — SA-V34-01 zero-guards on EACH leg =====
    /// Returns (giver_share = floor(C/2), taker_share = C - floor).
    /// C == 1 → giver_share = 0, taker_share = 1.
    /// SA-V34-01: caller MUST guard each credit leg with if (share > 0).
    public(package) fun take_split(
        pool: &mut MissionCollateralTokenPool,
        mission_id: address,
        taker: address,
        giver: address,
    ): (u64, u64) {
        let key = CollateralKey { mission_id, taker };
        assert!(table::contains(&pool.deposits, key), E_ENTRY_NOT_IN_POOL);
        let total = table::remove(&mut pool.deposits, key);
        pool.total_escrowed = pool.total_escrowed - total;
        let floor = total / 2;
        let remainder = total - floor;
        event::emit(TokenCollateralSplit {
            pool_id: object::id(pool), mission_id, taker, giver,
            taker_share: remainder, giver_share: floor,
        });
        (floor, remainder)
    }

    // ===== Accessor =====
    public fun entry_balance(
        pool: &MissionCollateralTokenPool, mission_id: address, taker: address,
    ): u64 {
        let key = CollateralKey { mission_id, taker };
        if (table::contains(&pool.deposits, key)) {
            *table::borrow(&pool.deposits, key)
        } else { 0 }
    }

    public fun total_escrowed(pool: &MissionCollateralTokenPool): u64 { pool.total_escrowed }
    public fun pool_ssu_id(pool: &MissionCollateralTokenPool): address { pool.ssu_id }

    // ===== Test-only =====
    #[test_only]
    public fun create_for_testing(ssu_id: address, ctx: &mut TxContext): MissionCollateralTokenPool {
        create_pool_internal(ssu_id, ctx)
    }
    #[test_only]
    public fun share_for_testing(pool: MissionCollateralTokenPool) {
        transfer::share_object(pool);
    }
    #[test_only]
    public fun e_entry_not_in_pool(): u64 { E_ENTRY_NOT_IN_POOL }
    #[test_only]
    public fun e_wrong_ssu(): u64 { E_WRONG_SSU }
    #[test_only]
    public fun e_zero_amount(): u64 { E_ZERO_AMOUNT }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
