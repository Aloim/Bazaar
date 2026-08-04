// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// bazaar_mission::mission_collateral_pool — Per-SSU EVE collateral custody
/// for Mission (MIS) shops (NoTribe / Easy bazaar types).
///
/// Each taker's collateral is keyed by CompoundKey { mission_id, taker } in a
/// Table<CollateralKey, Balance<EVE>>. Settlement pops the entry (SA-V34-05:
/// table::remove, not decrement-to-zero). Supply: Σpool entries == Σposted.
///
/// Advanced SSUs use mission_collateral_token_pool (bazaar_economy).
module bazaar_mission::mission_collateral_pool {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::table::{Self, Table};
    use sui::event;
    use EVE::EVE::EVE;
    use bazaar_core::ssu_governance::{Self, SSUGovernance};

    // ===== Error Codes =====
    const E_COLLATERAL_NOT_FOUND:  u64 = 36;
    const E_WRONG_COLLATERAL_POOL: u64 = 37;

    // ===== Structs =====
    public struct CollateralKey has copy, drop, store {
        mission_id: address,
        taker: address,
    }

    public struct MissionCollateralPool has key {
        id: UID,
        ssu_id: address,
        deposits: Table<CollateralKey, Balance<EVE>>,
        total_escrowed: u64,
    }

    // ===== Events =====
    public struct MissionCollateralPoolCreated has copy, drop {
        pool_id: ID,
        ssu_id: address,
    }
    public struct CollateralDeposited has copy, drop {
        pool_id: ID, mission_id: address, taker: address,
        amount: u64, total_escrowed: u64,
    }
    public struct CollateralRefunded has copy, drop {
        pool_id: ID, mission_id: address, taker: address,
        amount: u64, reason: u8,
    }
    public struct CollateralForfeited has copy, drop {
        pool_id: ID, mission_id: address, taker: address, giver: address,
        amount: u64,
    }
    public struct CollateralSplit has copy, drop {
        pool_id: ID, mission_id: address, taker: address, giver: address,
        taker_share: u64, giver_share: u64,
    }

    // ===== Bootstrap =====

    /// Per-SSU bootstrap (NoTribe/Easy only). Standalone entry for already-live SSUs.
    /// Folded into V34 ssu_bootstrap for new SSU creation.
    public entry fun bootstrap_mission_collateral_pool(
        ssu_gov: &SSUGovernance,
        ctx: &mut TxContext,
    ) {
        // EVE pool is for NoTribe (0) and Easy (1) only.
        let bt = ssu_governance::ssu_bazaar_type(ssu_gov);
        assert!(bt != 2, E_WRONG_COLLATERAL_POOL);
        let pool = create_pool(ssu_governance::ssu_id(ssu_gov), ctx);
        share(pool);
    }

    // ===== Package Factory =====
    public(package) fun create_pool(ssu_id: address, ctx: &mut TxContext): MissionCollateralPool {
        MissionCollateralPool {
            id: object::new(ctx),
            ssu_id,
            deposits: table::new(ctx),
            total_escrowed: 0,
        }
    }

    /// share_object wrapper — MissionCollateralPool has only `key` (no `store`).
    public(package) fun share(pool: MissionCollateralPool) {
        let pool_id = object::id(&pool);
        let ssu_id = pool.ssu_id;
        event::emit(MissionCollateralPoolCreated { pool_id, ssu_id });
        transfer::share_object(pool);
    }

    // ===== SA-V34-06: pool anchor =====
    /// Assert this pool belongs to mission.ssu_id. Called on accept (mandatory)
    /// and recommended on every settlement entry.
    public(package) fun assert_pool_for_ssu(pool: &MissionCollateralPool, ssu_id: address) {
        assert!(pool.ssu_id == ssu_id, E_WRONG_COLLATERAL_POOL);
    }

    // ===== Deposit =====
    /// Deposit taker's collateral at accept. Coin must have exact value equal to
    /// mission.collateral_eve_per_run (checked by accept_mission before calling this).
    /// When collateral_eve_per_run == 0 the caller passes coin::zero and we skip.
    public(package) fun deposit(
        pool: &mut MissionCollateralPool,
        mission_id: address,
        taker: address,
        payment: Coin<EVE>,
    ) {
        let amount = coin::value(&payment);
        if (amount == 0) {
            coin::destroy_zero(payment);
            return
        };
        let key = CollateralKey { mission_id, taker };
        let bal = coin::into_balance(payment);
        table::add(&mut pool.deposits, key, bal);
        pool.total_escrowed = pool.total_escrowed + amount;
        event::emit(CollateralDeposited {
            pool_id: object::id(pool), mission_id, taker,
            amount, total_escrowed: pool.total_escrowed,
        });
    }

    // ===== Settlement: 100% to taker (complete / reject) — SA-V34-05: table::remove =====
    /// reason: 0 = complete, 1 = reject
    public(package) fun take_full(
        pool: &mut MissionCollateralPool,
        mission_id: address,
        taker: address,
        reason: u8,
        ctx: &mut TxContext,
    ): Coin<EVE> {
        let key = CollateralKey { mission_id, taker };
        assert!(table::contains(&pool.deposits, key), E_COLLATERAL_NOT_FOUND);
        let bal = table::remove(&mut pool.deposits, key);
        let amount = balance::value(&bal);
        pool.total_escrowed = pool.total_escrowed - amount;
        event::emit(CollateralRefunded {
            pool_id: object::id(pool), mission_id, taker, amount, reason,
        });
        coin::from_balance(bal, ctx)
    }

    // ===== Settlement: 100% to giver (expire/forfeit) — SA-V34-05 =====
    public(package) fun take_full_for_forfeit(
        pool: &mut MissionCollateralPool,
        mission_id: address,
        taker: address,
        giver: address,
        ctx: &mut TxContext,
    ): Coin<EVE> {
        let key = CollateralKey { mission_id, taker };
        assert!(table::contains(&pool.deposits, key), E_COLLATERAL_NOT_FOUND);
        let bal = table::remove(&mut pool.deposits, key);
        let amount = balance::value(&bal);
        pool.total_escrowed = pool.total_escrowed - amount;
        event::emit(CollateralForfeited {
            pool_id: object::id(pool), mission_id, taker, giver, amount,
        });
        coin::from_balance(bal, ctx)
    }

    // ===== Settlement: 50/50 (cancel) — SA-V34-05, conservation exact =====
    /// Returns (giver_coin = floor(C/2), taker_coin = C - floor(C/2)).
    /// When C == 0 or C == 1, both degenerate cases handled: C==0 both zero-coins,
    /// C==1 giver gets 0-coin (handled by caller with zero-value transfer), taker 1.
    /// EVE path: coin::zero transfer of 0-value is valid (no abort).
    public(package) fun take_split(
        pool: &mut MissionCollateralPool,
        mission_id: address,
        taker: address,
        giver: address,
        ctx: &mut TxContext,
    ): (Coin<EVE>, Coin<EVE>) {
        let key = CollateralKey { mission_id, taker };
        assert!(table::contains(&pool.deposits, key), E_COLLATERAL_NOT_FOUND);
        let bal = table::remove(&mut pool.deposits, key);
        let total = balance::value(&bal);
        pool.total_escrowed = pool.total_escrowed - total;
        let floor = total / 2;
        let remainder = total - floor;
        let mut full_coin = coin::from_balance(bal, ctx);
        let giver_coin = coin::split(&mut full_coin, floor, ctx);
        // full_coin now holds `remainder`
        event::emit(CollateralSplit {
            pool_id: object::id(pool), mission_id, taker, giver,
            taker_share: remainder, giver_share: floor,
        });
        (giver_coin, full_coin)
    }

    // ===== Accessor =====
    public fun entry_balance(pool: &MissionCollateralPool, mission_id: address, taker: address): u64 {
        let key = CollateralKey { mission_id, taker };
        if (table::contains(&pool.deposits, key)) {
            balance::value(table::borrow(&pool.deposits, key))
        } else { 0 }
    }

    public fun total_escrowed(pool: &MissionCollateralPool): u64 { pool.total_escrowed }
    public fun pool_ssu_id(pool: &MissionCollateralPool): address { pool.ssu_id }

    // ===== Test-only =====
    #[test_only]
    public fun create_for_testing(ssu_id: address, ctx: &mut TxContext): MissionCollateralPool {
        create_pool(ssu_id, ctx)
    }
    #[test_only]
    public fun share_for_testing(pool: MissionCollateralPool) {
        transfer::share_object(pool);
    }
    #[test_only]
    public fun e_collateral_not_found(): u64 { E_COLLATERAL_NOT_FOUND }
    #[test_only]
    public fun e_wrong_collateral_pool(): u64 { E_WRONG_COLLATERAL_POOL }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
