// bazaar_economy | Paginated permissionless Advanced tribe-token refund prune for depreciated dead SSUs
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V41 SSU depreciation / dead-bazaar prune -- Phase 4 "economy prune" (Advanced tribe-token legs)
// of Phase B (Documentation/plans/implementation/ssu-depreciation-prune-plan.md §2.5). Gated ONLY
// on the ssu_governance::is_depreciated(gov) certificate set by bazaar_core::ssu_depreciation
// (Phase A, already applied) -- this module NEVER imports world::location (bazaar_economy carries
// no world DEPENDENCY per Move.toml -- `world` there is an [addresses]-only compile-time binding,
// verified by the plan audit) and NEVER computes the death predicate itself.
//
// Four entries, each mirroring the EXACT create/burn semantics of the pool/row it drains
// (CR-DEP-01, the campaign's core fund-integrity lesson -- report §5 has the full disposition
// table with source-line citations):
//   1. prune_depreciated_wtb_token_page -- Advanced WTB earmark, pop-once -> internal_mint
//      (create burns supply via internal_burn, wtb_pool_ops.move:168; the LIVE close-path refund
//      refund_wtb_pool_residue already mints it back, wtb_pool_ops.move:252 -- this entry mirrors
//      that exact inverse for the depreciated-SSU case).
//   2. prune_depreciated_free_token_page -- Advanced FREE Shop.tribe_token_pool, read+zero ->
//      internal_mint (OQ-2 resolution: create pre-burns via internal_burn,
//      free_shop_advanced.move:117; the LIVE claim path free_token_claim_advanced already mints it
//      back, free_shop_advanced.move:181 -- the plan's original "credit" was WRONG here, corrected
//      per CR-DEP-01. NO new bazaar_core accessor: shop_tribe_token_pool/debit_tribe_token_pool
//      are already public and already consumed cross-package by this same package, :174-179).
//   3. prune_depreciated_mission_collateral_token_page -- Advanced mission token collateral,
//      pop-once -> credit (this pool sits INSIDE supply, mission_collateral_token_pool.move:11
//      header -- mirrors mission_ledger_ops::admin_force_settle_acceptances_advanced's own credit
//      leg, mission_ledger_ops.move:441-443 -- the plan got this leg right).
//   4. prune_depreciated_mission_reward_token -- P4b (CR-P4-01, mandated by
//      ssu-depreciation-prune-P4-review-2026-07-13.md §8): the Advanced mission's OWN escrowed
//      reward-token ledger row, `ledger.balances[mission_addr]` -- a DIFFERENT custody point
//      from entry 3's collateral pool. create_mission_advanced locks this via a same-supply
//      debit(creator)+credit(mission_addr) (mission_ledger_ops.move:96-102, NOT a burn); the
//      LIVE twin admin_force_cancel_mission_advanced already refunds it the same way
//      (mission_ledger_ops.move:469-472) but is permanently unreachable post-depreciation
//      (needs the destroyed StorageUnit + asserts !settled). Runs LAST per mission, gated on
//      mission_is_settled==true (E_MISSION_NOT_SETTLED) so it never races entry 3 or P3's own
//      reward/close entry -- balance_of pop-once -> credit (never internal_mint, CR-DEP-01: the
//      lock was a move, not a burn).
//
// CR-DEP-02 (HIGH, entries 1-3; entry 4 mirrors it): binds the `ledger` argument to the RECORD's
// own stored tribe_id (bazar::shop_tribe_id / the mission::mission_ssu_and_tribe getter), NEVER
// gov.tribe_id -- ssu_rebind's guard 6 does not cover missions (SA-REBIND-01), so a mission/shop's
// tribe-era binding can diverge from the SSU's CURRENT tribe. Does NOT reuse validate_ctx
// (mission_ledger_ops.move:486-492) -- it asserts ssu_is_active, which is false on a depreciated
// gov by construction (set_depreciated forces is_active=false); a naive reuse would make every
// entry in this module dead-on-arrival (CR-DEP-02's explicit warning).
//
// CR-DEP-04 (everywhere): zero-amount mint/credit legs SKIP, never abort --
// tribe_token_ledger::internal_mint/credit both assert amount>0 (tribe_token_ledger.move:333
// credit, :349 internal_mint); tribe_token_wtb_pool::take_residue is idempotent-0-on-absent;
// mission_collateral_token_pool::take_full DOES abort on an absent key, guarded here by the same
// existed&&coll>0 precondition P3's EVE-side sibling uses; entry 4's balance_of>0 pre-skip is
// the same discipline applied to a plain ledger row.
//
// Two EXISTING-file edits ship against BazaarMission/sources/mission.move (P4 report §1 + this
// P4b addendum): bare-public, read-only getters `mission::mission_ssu_and_tribe` (P4; ssu_id +
// tribe_id by mission id) and `mission::mission_owner_and_settled` (P4b; owner + is_settled by
// mission id) -- both needed because `mission::borrow_mission` is `public(package)`
// (bazaar_mission-only) and this module must read mission fields cross-package before any
// refund. No cap, no mutation on either -- mirrors the has_mission/is_depreciated class of pure
// Phase-B-enabling getter this campaign has added at every prior phase. Per the P4 critic review
// §8 point 4, entry 4 uses the NEW sibling getter rather than widening mission_ssu_and_tribe's
// already-verified two-value signature.
//
// Permissionless + paginated + idempotent, mirroring the P2/P3 admin-drain-derived pattern:
// caller composes a bounded page of shop_ids/takers for ONE depreciated SSU/mission (entries
// 1-3), or a single mission_id with no pagination args (entry 4, single-row); per-row/whole-call
// pre-skip on already-drained state (no abort); a full-page or single-call re-run after
// completion is a clean no-op (plan §4).
module bazaar_economy::ssu_depreciation_economy {
    use sui::event;
    use sui::clock::{Self, Clock};
    use bazaar_core::bazar::{Self, BazarRegistry};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_mission::mission::{Self, MissionRegistry};
    use bazaar_mission::mission_lifecycle;
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};
    use bazaar_economy::tribe_token_wtb_pool::{Self, TribeTokenWtbPool};
    use bazaar_economy::mission_collateral_token_pool::{Self, MissionCollateralTokenPool};
    use bazaar_economy::economy_cap_store::{Self, EconomyCapStore};

    // ===== Error Codes (module-scoped; fresh module, no collision -- see report §3 OI-4 for the
    // deviation vs the plan's original 5-code §2.5 list) =====

    /// `gov` is not yet certified depreciated -- Phase A must run first.
    const E_NOT_DEPRECIATED: u64 = 1;
    /// `gov` is not an Advanced SSU. Defense-in-depth: the pools/fields this module drains only
    /// ever exist for Advanced SSUs by construction (their bootstrap/create paths assert
    /// Advanced), but this whole-call gate gives a clean, diagnosable abort instead of relying
    /// solely on the structural guarantee.
    const E_NOT_ADVANCED: u64 = 2;
    /// A shop_id in a page belongs to a different SSU than `gov` -- caller-composed-page bug.
    const E_SHOP_WRONG_SSU: u64 = 3;
    /// `mission_id` belongs to a different SSU than `gov`.
    const E_MISSION_WRONG_SSU: u64 = 4;
    /// CR-DEP-02: `ledger`'s tribe_id does not match the RECORD's (shop/mission) own stored
    /// tribe_id -- never gov.tribe_id.
    const E_WRONG_TRIBE: u64 = 5;
    const E_PAGINATION_ZERO: u64 = 6;
    const E_BATCH_TOO_LARGE: u64 = 7;
    /// P4b (CR-P4-01): the mission is not yet settled -- prune_depreciated_mission_reward_token
    /// must run AFTER bazaar_mission's prune_depreciated_mission_reward closes the mission,
    /// enforcing the same ordering discipline as entry 3's C-4/CR-DEP-06 chain.
    const E_MISSION_NOT_SETTLED: u64 = 8;

    const MAX_BATCH_ROWS: u64 = 100;

    // ===== Events (one per leg -- see report §3 OI-1 for the deviation vs the plan's literal
    // single shared DepreciatedTokenRefundedEvent) =====

    public struct WtbTokenResidueRefundedEvent has copy, drop {
        ssu_id: address,
        shop_id: ID,
        owner: address,
        tribe_id: u64,
        tokens: u64,
        timestamp_ms: u64,
    }

    public struct FreeTokenPoolRefundedEvent has copy, drop {
        ssu_id: address,
        shop_id: ID,
        owner: address,
        tribe_id: u64,
        tokens: u64,
        timestamp_ms: u64,
    }

    public struct MissionCollateralTokenRefundedEvent has copy, drop {
        ssu_id: address,
        mission_id: ID,
        taker: address,
        tribe_id: u64,
        tokens: u64,
        timestamp_ms: u64,
    }

    /// P4b (CR-P4-01). Emitted ONLY on a non-zero drain -- a post-drain or never-locked mission
    /// row (balance_of == 0) is a clean no-op, no event (CR-DEP-04 discipline).
    public struct MissionRewardTokenRefundedEvent has copy, drop {
        ssu_id: address,
        mission_id: ID,
        owner: address,
        tribe_id: u64,
        tokens: u64,
        timestamp_ms: u64,
    }

    // ===== Entry 1: WTB token-pool residue page =====

    /// Prune one caller-composed page of Advanced-WTB shop_ids' token earmarks on a depreciated
    /// SSU. Per row: skip if the shop_id is absent from the registry or the pool holds no entry
    /// for it (idempotent, no abort -- CR-DEP-04); otherwise assert it belongs to `gov`'s SSU and
    /// `ledger`'s tribe matches the SHOP's own tribe_id (CR-DEP-02), pop the pool residue and
    /// internal_mint it back to the shop's recorded owner (mirrors
    /// wtb_pool_ops::refund_wtb_pool_residue's exact inverse of create_wtb_shop_advanced's
    /// internal_burn -- CR-DEP-01). `borrow_shop_mut` is used even though this leg never mutates
    /// the Shop directly: it is the ONLY cross-package path to a Shop reference at all
    /// (`borrow_shop` is public(package)) -- the P2 review already ruled this necessary and safe
    /// (`Documentation/reports/critic/ssu-depreciation-prune-P2-review-2026-07-12.md` §2).
    public entry fun prune_depreciated_wtb_token_page(
        gov: &SSUGovernance,
        registry: &mut BazarRegistry,
        pool: &mut TribeTokenWtbPool,
        ledger: &mut TribeTokenLedger,
        shop_ids: vector<ID>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let n = vector::length(&shop_ids);
        assert!(n > 0, E_PAGINATION_ZERO);
        assert!(n <= MAX_BATCH_ROWS, E_BATCH_TOO_LARGE);

        assert!(ssu_governance::is_depreciated(gov), E_NOT_DEPRECIATED);
        assert!(ssu_governance::ssu_bazaar_type(gov) == bazar::bazaar_type_advanced(), E_NOT_ADVANCED);
        let gov_ssu_id = ssu_governance::ssu_id(gov);

        // Pool<->gov binding (existing primitive), before any row.
        tribe_token_wtb_pool::assert_pool_for_ssu(pool, gov);

        let ts = clock::timestamp_ms(clock);
        let mut i: u64 = 0;
        while (i < n) {
            let shop_id = *vector::borrow(&shop_ids, i);
            if (bazar::has_shop(registry, shop_id)) {
                let shop = bazar::borrow_shop_mut(registry, shop_id);
                // Idempotent pre-skip: no earmark left for this shop (already drained by a prior
                // page, or never earmarked). No mutation, no assert, no event.
                if (tribe_token_wtb_pool::has_entry(pool, shop_id)) {
                    assert!(bazar::shop_ssu_id(shop) == gov_ssu_id, E_SHOP_WRONG_SSU);
                    let owner = bazar::shop_owner(shop);
                    let tribe_id = bazar::shop_tribe_id(shop);
                    assert!(tribe_token_ledger::tribe_id(ledger) == tribe_id, E_WRONG_TRIBE);

                    let amount = tribe_token_wtb_pool::take_residue(pool, shop_id, owner);
                    if (amount > 0) {
                        tribe_token_ledger::internal_mint(ledger, owner, amount);
                        event::emit(WtbTokenResidueRefundedEvent {
                            ssu_id: gov_ssu_id, shop_id, owner, tribe_id, tokens: amount,
                            timestamp_ms: ts,
                        });
                    };
                };
            };
            i = i + 1;
        };
        let _ = ctx; // no Coin creation on this leg -- every refund is a ledger internal_mint.
    }

    // ===== Entry 2: Advanced FREE shop token-pool page =====

    /// Prune one caller-composed page of Advanced FREE shop_ids' remaining giveaway pool on a
    /// depreciated SSU. Per row: skip if the shop_id is absent or its `tribe_token_pool` is
    /// already zero (idempotent, no abort -- CR-DEP-04; also silently no-ops on any non-FREE
    /// shop_id, since only FREE shops ever populate this field -- see report §3 OI-2); otherwise
    /// assert SSU + tribe binding (CR-DEP-02), zero the pool via the existing
    /// `debit_tribe_token_pool` accessor, and internal_mint the swept amount to the shop's
    /// recorded owner (OQ-2 resolution: mirrors free_token_claim_advanced's exact inverse of
    /// create_free_shop_advanced's internal_burn -- CR-DEP-01; NO new bazaar_core accessor, both
    /// primitives already public and already consumed cross-package by this same package's
    /// free_shop_advanced.move).
    public entry fun prune_depreciated_free_token_page(
        gov: &SSUGovernance,
        registry: &mut BazarRegistry,
        ledger: &mut TribeTokenLedger,
        shop_ids: vector<ID>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let n = vector::length(&shop_ids);
        assert!(n > 0, E_PAGINATION_ZERO);
        assert!(n <= MAX_BATCH_ROWS, E_BATCH_TOO_LARGE);

        assert!(ssu_governance::is_depreciated(gov), E_NOT_DEPRECIATED);
        assert!(ssu_governance::ssu_bazaar_type(gov) == bazar::bazaar_type_advanced(), E_NOT_ADVANCED);
        let gov_ssu_id = ssu_governance::ssu_id(gov);

        let ts = clock::timestamp_ms(clock);
        let mut i: u64 = 0;
        while (i < n) {
            let shop_id = *vector::borrow(&shop_ids, i);
            if (bazar::has_shop(registry, shop_id)) {
                let shop = bazar::borrow_shop_mut(registry, shop_id);
                let pool_amt = bazar::shop_tribe_token_pool(shop);
                // Idempotent pre-skip: pool already zero (already drained, never funded, or a
                // non-FREE shop whose tribe_token_pool field is unused).
                if (pool_amt > 0) {
                    assert!(bazar::shop_ssu_id(shop) == gov_ssu_id, E_SHOP_WRONG_SSU);
                    let owner = bazar::shop_owner(shop);
                    let tribe_id = bazar::shop_tribe_id(shop);
                    assert!(tribe_token_ledger::tribe_id(ledger) == tribe_id, E_WRONG_TRIBE);

                    bazar::debit_tribe_token_pool(shop, pool_amt);
                    tribe_token_ledger::internal_mint(ledger, owner, pool_amt);
                    event::emit(FreeTokenPoolRefundedEvent {
                        ssu_id: gov_ssu_id, shop_id, owner, tribe_id, tokens: pool_amt,
                        timestamp_ms: ts,
                    });
                };
            };
            i = i + 1;
        };
        let _ = ctx;
    }

    // ===== Entry 3: mission token-collateral page (CR-DEP-05 signature) =====

    /// Prune one caller-composed page of takers' Advanced token collateral for a mission on a
    /// depreciated SSU. CR-DEP-05: takes `mission_registry: &mut MissionRegistry` and
    /// `cap_store: &EconomyCapStore` (absent from the plan's original §2.5 signature) so it can
    /// remove acceptances via the cap-gated `mission_lifecycle::advance_admin_remove_acceptance`
    /// -- mirrors `mission_ledger_ops::admin_force_settle_acceptances_advanced`
    /// (mission_ledger_ops.move:417-449) MINUS the &DAppOwnerCap, gated on is_depreciated instead.
    /// MUST be paged to completion before bazaar_mission's `prune_depreciated_mission_reward` can
    /// close this mission (that entry's C-4 runs_in_progress==0 assert enforces the ordering --
    /// CR-DEP-06).
    public entry fun prune_depreciated_mission_collateral_token_page(
        gov: &SSUGovernance,
        mission_registry: &mut MissionRegistry,
        pool: &mut MissionCollateralTokenPool,
        ledger: &mut TribeTokenLedger,
        cap_store: &EconomyCapStore,
        mission_id: ID,
        takers: vector<address>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let n = vector::length(&takers);
        assert!(n > 0, E_PAGINATION_ZERO);
        assert!(n <= MAX_BATCH_ROWS, E_BATCH_TOO_LARGE);

        assert!(ssu_governance::is_depreciated(gov), E_NOT_DEPRECIATED);
        assert!(ssu_governance::ssu_bazaar_type(gov) == bazar::bazaar_type_advanced(), E_NOT_ADVANCED);
        let gov_ssu_id = ssu_governance::ssu_id(gov);

        // New bare-public getter (mission.move, report §1) -- cross-package read of the
        // MISSION's own ssu_id/tribe_id (borrow_mission is public(package)-only).
        let (mission_ssu_id, mission_tribe_id) =
            mission::mission_ssu_and_tribe(mission_registry, mission_id);
        assert!(mission_ssu_id == gov_ssu_id, E_MISSION_WRONG_SSU);
        // CR-DEP-02: bind to the MISSION's own stored tribe_id, not gov.tribe_id.
        assert!(tribe_token_ledger::tribe_id(ledger) == mission_tribe_id, E_WRONG_TRIBE);

        // Pool<->gov binding (existing primitive), before any row.
        mission_collateral_token_pool::assert_pool_for_ssu(pool, gov);

        let shop_cap = economy_cap_store::borrow_shop_cap(cap_store);
        let mission_addr = object::id_to_address(&mission_id);
        let ts = clock::timestamp_ms(clock);

        let mut i: u64 = 0;
        while (i < n) {
            let taker = *vector::borrow(&takers, i);
            // CR-DEP-04: existence-guarded, idempotent -- mirrors mission_admin_drain.move:64-77
            // via the cap-gated mission_lifecycle twin the plan-audit prescribed (CR-DEP-05).
            let (existed, coll) = mission_lifecycle::advance_admin_remove_acceptance(
                mission_registry, mission_id, taker, shop_cap,
            );
            if (existed && coll > 0) {
                // Acceptance-present + coll>0 => pool-entry-present invariant (verified by the P3
                // review for the EVE-side sibling; holds identically here -- the ledger debit and
                // the pool credit at accept-time are the same guarded block,
                // mission_ledger_ops.move:286-300). take_full is therefore abort-free here.
                let popped = mission_collateral_token_pool::take_full(pool, mission_addr, taker, 0);
                if (popped > 0) {
                    tribe_token_ledger::credit_with_event(
                        ledger, mission_addr, taker, popped, b"mission_collateral_refund", clock,
                    );
                    event::emit(MissionCollateralTokenRefundedEvent {
                        ssu_id: gov_ssu_id, mission_id, taker, tribe_id: mission_tribe_id,
                        tokens: popped, timestamp_ms: ts,
                    });
                };
            };
            i = i + 1;
        };
        let _ = ctx;
    }

    // ===== Entry 4 (P4b): mission reward-token residue (CR-P4-01) =====

    /// P4b (CR-P4-01, mandated by the P4 critic review
    /// Documentation/reports/critic/ssu-depreciation-prune-P4-review-2026-07-13.md §8): prune the
    /// Advanced mission's OWN escrowed reward-token ledger row, `ledger.balances[mission_addr]` --
    /// a DIFFERENT custody point from entry 3's collateral pool. create_mission_advanced locks
    /// `reward_token_per_run x max_runs` directly into the ledger via a same-supply
    /// debit(creator)+credit(mission_addr) (mission_ledger_ops.move:96-102, NOT a burn);
    /// completions pay out of that same row via settle_token (mission_ledger_ops.move:476-484).
    /// The LIVE twin admin_force_cancel_mission_advanced already refunds this exact residue to the
    /// giver the same way (mission_ledger_ops.move:469-472) but is permanently unreachable
    /// post-depreciation (needs the destroyed StorageUnit + asserts !settled,
    /// mission_complete.move:444) -- once bazaar_mission's prune_depreciated_mission_reward
    /// settles the mission, the row is stranded forever without this entry.
    ///
    /// Gate order: is_depreciated -> is_advanced -> mission/gov SSU+tribe binding via the
    /// EXISTING mission_ssu_and_tribe getter (CR-DEP-02, never gov.tribe_id) ->
    /// mission_is_settled == true (E_MISSION_NOT_SETTLED, NEW code 8). The settled gate enforces
    /// the required per-mission ordering: entry 3's collateral pages (if any takers) -> P3's
    /// prune_depreciated_mission_reward settles the mission -> this entry drains the row. Needs a
    /// SECOND read-only getter (mission_owner_and_settled) rather than widening
    /// mission_ssu_and_tribe's already-verified two-value signature (critic ruling, P4 review §8
    /// point 4).
    ///
    /// Single mission, single row -- no pagination args, no page-bound codes. Idempotent:
    /// balance_of == 0 is a clean no-op (post-drain terminal state; no path re-credits
    /// mission_addr after settle -- completions/accepts are dead on a depreciated gov). `credit`,
    /// NEVER `internal_mint` (CR-DEP-01: the create-time lock was a same-supply MOVE, not a burn --
    /// mirrors admin_force_cancel_mission_advanced's own refund leg exactly). Drain-the-whole-row
    /// semantics is deliberate: any voluntary third-party credit to mission_addr also flows to the
    /// giver (donation-class, strictly better than stranding).
    public entry fun prune_depreciated_mission_reward_token(
        gov: &SSUGovernance,
        mission_registry: &MissionRegistry,
        ledger: &mut TribeTokenLedger,
        mission_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(ssu_governance::is_depreciated(gov), E_NOT_DEPRECIATED);
        assert!(ssu_governance::ssu_bazaar_type(gov) == bazar::bazaar_type_advanced(), E_NOT_ADVANCED);
        let gov_ssu_id = ssu_governance::ssu_id(gov);

        // Existing P4 getter -- CR-DEP-02 binding, never gov.tribe_id.
        let (mission_ssu_id, mission_tribe_id) =
            mission::mission_ssu_and_tribe(mission_registry, mission_id);
        assert!(mission_ssu_id == gov_ssu_id, E_MISSION_WRONG_SSU);
        assert!(tribe_token_ledger::tribe_id(ledger) == mission_tribe_id, E_WRONG_TRIBE);

        // New P4b sibling getter -- owner + settled; does NOT widen mission_ssu_and_tribe.
        let (owner, settled) = mission::mission_owner_and_settled(mission_registry, mission_id);
        // Ordering: entry 3 (collateral) -> P3 reward/close settles the mission -> here.
        assert!(settled, E_MISSION_NOT_SETTLED);

        let mission_addr = object::id_to_address(&mission_id);
        let bal = tribe_token_ledger::balance_of(ledger, mission_addr);
        // CR-DEP-04: idempotent pre-skip -- a post-drain or never-locked row is a clean no-op.
        if (bal > 0) {
            tribe_token_ledger::debit(ledger, mission_addr, bal);
            // CR-DEP-01: credit, NEVER internal_mint -- the create-time lock moved supply, it did
            // not burn it. Mirrors admin_force_cancel_mission_advanced's refund leg,
            // mission_ledger_ops.move:469-472, exactly.
            tribe_token_ledger::credit_with_event(
                ledger, mission_addr, owner, bal, b"mission_refund", clock,
            );
            event::emit(MissionRewardTokenRefundedEvent {
                ssu_id: gov_ssu_id, mission_id, owner, tribe_id: mission_tribe_id,
                tokens: bal, timestamp_ms: clock::timestamp_ms(clock),
            });
        };
        let _ = ctx;
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
