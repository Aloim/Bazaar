// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// BazaarEconomy/sources/reclaim_tribe.move
// Update Ceremony V2 — Phase 2 (Slice 3): the tribe reclaim orchestrator.
//
// After a fresh publish (V38) re-mints tribe ids, the tribe leader re-materialises
// their tribe on the new packages. Because a fresh publish assigns a NEW monotonic
// tribe id, this records an old->new remap (consumed by reclaim_ssu's tribe-first
// guard). Multi-PTB, mirroring reclaim_ssu's two-PTB rationale (TribeGovernance +
// the economy ledger/vault are SHARED at bootstrap, so post-bootstrap &mut writes
// must be separate cap-gated PTBs):
//
//   reclaim_tribe            — consume the TRIBE_LEADER record (+ its single-use remap
//                              proof), decode the binding header, create the FRESH tribe
//                              (sender = leader; FE funds the creation fee), record the
//                              old->new remap, bootstrap governance, and for Advanced
//                              tribes create + share the 5 economy objects (empty ledger
//                              via create_for_reclaim — NO genesis mint). Transfers the
//                              new TribeLeaderCap to the sender.
//   reclaim_tribe_mint_page  — Advanced only; re-mint the snapshot token balances into
//                              the now-shared ledger (paged; leader-cap gated).
//   reclaim_tribe_restore    — restore tribe config (mission fee) + global bans + deposit
//                              the lazy-drained gov EVE into the now-shared TribeGovernance.
//
// Vault EVE is deposited via the existing tribe_vault::deposit_reclaimed_vault_eve against
// the shared vault; tribe taxes / godot URL are restored by the FE via the existing
// leader-gated batch setters composed in the restore PTB. reclaim_tribe lives in
// bazaar_economy (the leaf) because it composes both tribe creation (dapp_hub) and the
// economy objects (in-package).

module bazaar_economy::reclaim_tribe {
    use sui::clock::{Self, Clock};
    use sui::coin::Coin;
    use sui::event;
    use sui::bcs;
    use EVE::EVE::EVE;
    use dapp_hub::reclaim_registry::{Self, ReclaimRegistry};
    use dapp_hub::tribe_registry::{Self, TribeRegistry, TribeLeaderCap};
    use dapp_hub::dapp_governance::GovernanceConfig;
    use dapp_hub::tax_wallet::DAppTaxWallet;
    use dapp_hub::ceremony_gate::{Self, CeremonyGate};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::tribe_governance_bootstrap;
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};
    use bazaar_economy::tribe_vault;
    use bazaar_economy::tribe_exchange;
    use bazaar_economy::vault_withdrawal;
    use bazaar_economy::mint_burn_queue;
    use bazaar_economy::advanced_direct_trade;

    // ----- bazaar types -----
    const BAZAAR_TYPE_EASY:     u8 = 1;
    const BAZAAR_TYPE_ADVANCED: u8 = 2;
    // Tribe metadata not carried in the snapshot payload (best-effort restore defaults).
    const DEFAULT_JOIN_POLICY:  u8 = 0;
    const GOVERNANCE_MODE:      u8 = 0; // v1 only supports AUTHORITARIAN_CAPITALISTIC
    // Quorum bounds mirror economy_governance::bootstrap_advanced_complete (CC-002).
    const MIN_QUORUM: u64 = 1;
    const MAX_QUORUM: u64 = 10;

    // ----- errors -----
    const E_TRIBE_ID_MISMATCH:    u64 = 1; // decoded payload.original_tribe_id != arg
    const E_WRONG_TRIBE:          u64 = 2; // mint-page leader cap does not match the ledger
    const E_LEN_MISMATCH:         u64 = 3; // parallel vectors differ in length
    const E_NOT_EASY_OR_ADVANCED: u64 = 4; // tribe payload bazaar_type not in {1,2}
    const E_CEREMONY_NOT_OPEN:    u64 = 5; // SA-RCV2-MINT: mint page inert outside the ceremony
    const E_INVALID_QUORUM:       u64 = 6; // initial_required_approvals out of 1..=10

    // ----- events -----
    public struct TribeReclaimedEvent has copy, drop {
        old_tribe_id: u64,
        new_tribe_id: u64,
        leader: address,
        bazaar_type: u8,
        timestamp_ms: u64,
    }

    public struct TribeReclaimRestoreEvent has copy, drop {
        tribe_id: u64,
        leader: address,
        bans_restored: u64,
        gov_eve_deposited: u64,
        timestamp_ms: u64,
    }

    // ===== PTB 1 — create the fresh tribe + governance + (Advanced) economy =====

    /// Consume the caller's TRIBE_LEADER record (sender-bound + single-use remap proof),
    /// decode the binding header, create a FRESH tribe (new monotonic id), record the
    /// old->new remap, bootstrap governance, and for Advanced tribes create + share the
    /// 5 economy objects with an EMPTY ledger (create_for_reclaim — balances re-minted by
    /// reclaim_tribe_mint_page; NO genesis mint -> no double-credit). The new TribeLeaderCap
    /// goes to the sender; the shared object ids land on the bootstrap/init events.
    ///
    /// Aborts:
    ///   - reclaim_registry::E_NOT_IN_BACKUP / E_ALREADY_CONSUMED — no/again record.
    ///   - E_TRIBE_ID_MISMATCH (1) — payload tribe id != original_tribe_id.
    ///   - reclaim_registry::E_REMAP_EXISTS — old tribe already remapped.
    public entry fun reclaim_tribe(
        reclaim_registry: &mut ReclaimRegistry,
        tribe_registry: &mut TribeRegistry,
        config: &GovernanceConfig,
        wallet: &mut DAppTaxWallet,
        fee_payment: Coin<EVE>,
        package_id: address,
        original_tribe_id: u64,
        initial_required_approvals: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);

        // 1. Consume the caller's TRIBE_LEADER record + its single-use remap proof.
        let (blob, proof) = reclaim_registry::consume_tribe_reclaim_record(
            reclaim_registry, (original_tribe_id as u256), clock, ctx,
        );

        // 2. Decode the binding header (TribeLeaderPayload fields 1-7; §6.4):
        //    original_tribe_id: u64, name: String, bazaar_type: u8, token_name: String,
        //    token_symbol: String, token_decimals: u8, token_supply_cap: u64. The remaining
        //    restore fields (bans / balances / EVE) are applied by the FE-driven mint-page +
        //    restore PTBs (multi-PTB design).
        let mut b = bcs::new(blob);
        let payload_tribe_id = bcs::peel_u64(&mut b);
        let name = bcs::peel_vec_u8(&mut b);
        let bazaar_type = bcs::peel_u8(&mut b);
        let token_name = bcs::peel_vec_u8(&mut b);
        let token_symbol = bcs::peel_vec_u8(&mut b);
        let token_decimals = bcs::peel_u8(&mut b);
        let token_supply_cap = bcs::peel_u64(&mut b);
        let original_total_supply = bcs::peel_u64(&mut b); // field 8 — snapshot circulation
        assert!(payload_tribe_id == original_tribe_id, E_TRIBE_ID_MISMATCH);
        assert!(
            bazaar_type == BAZAAR_TYPE_EASY || bazaar_type == BAZAAR_TYPE_ADVANCED,
            E_NOT_EASY_OR_ADVANCED,
        );

        // 3. Create the FRESH tribe (sender = leader; FE funds fee_payment). Description +
        //    join_policy are not snapshot-carried -> best-effort defaults.
        let leader_cap = if (bazaar_type == BAZAAR_TYPE_ADVANCED) {
            tribe_registry::create_advanced_tribe(
                tribe_registry, config, wallet, fee_payment,
                name, b"", token_name, token_symbol,
                DEFAULT_JOIN_POLICY, GOVERNANCE_MODE, clock, ctx,
            )
        } else {
            tribe_registry::create_easy_tribe(
                tribe_registry, config, wallet, fee_payment,
                name, b"", DEFAULT_JOIN_POLICY, GOVERNANCE_MODE, clock, ctx,
            )
        };
        let new_tribe_id = tribe_registry::cap_tribe_id(&leader_cap);

        // 4. Record the old->new remap (proof-gated; reclaim_ssu's tribe-first guard reads it).
        reclaim_registry::record_tribe_remap(reclaim_registry, &leader_cap, original_tribe_id, proof, clock);

        // 5. Bootstrap governance (shares TribeGovernance + WidgetConfig) + bind the gov id.
        let gov_addr = tribe_governance_bootstrap::bootstrap_tribe_governance_atomic(
            tribe_registry, &leader_cap, package_id, clock, ctx,
        );
        tribe_registry::set_tribe_gov_id(&leader_cap, tribe_registry, new_tribe_id, gov_addr, clock, ctx);

        // 6. Advanced: create + share the 5 economy objects with an EMPTY ledger.
        if (bazaar_type == BAZAAR_TYPE_ADVANCED) {
            assert!(
                initial_required_approvals >= MIN_QUORUM && initial_required_approvals <= MAX_QUORUM,
                E_INVALID_QUORUM,
            ); // CC-002: mirror the bootstrap quorum bounds

            // SA-RCV2-MINT binding: bound reclaim minting to the snapshot circulation. A genuinely
            // uncapped tribe (snapshot supply_cap == 0) gets a reclaim cap == its snapshot
            // total_supply, so reclaim_tribe_mint_page can re-grow supply to AT MOST the snapshot
            // amount (no inflation past it, and re-paging cannot exceed it). To restore a truly
            // uncapped tribe after the ceremony the leader runs the existing leader-gated
            // set_supply_cap(0) (post-ceremony runbook step). Capped tribes keep their real cap.
            let reclaim_cap = if (token_supply_cap == 0) { original_total_supply } else { token_supply_cap };
            let ledger = tribe_token_ledger::create_for_reclaim(
                new_tribe_id, token_name, token_symbol, token_decimals, reclaim_cap, clock, ctx,
            );
            let vault = tribe_vault::create_vault(new_tribe_id, ctx);
            let mut exchange_config = tribe_exchange::create_exchange_config(new_tribe_id, 0, clock, ctx);
            tribe_exchange::set_active(&mut exchange_config, true);
            let board = vault_withdrawal::create_withdrawal_board(new_tribe_id, initial_required_approvals, ctx);
            let queue = mint_burn_queue::create_queue(new_tribe_id, ctx);

            tribe_registry::set_tribe_economy_ids(
                &leader_cap, tribe_registry, new_tribe_id,
                object::id_address(&vault),
                object::id_address(&ledger),
                object::id_address(&exchange_config),
                object::id_address(&board),
                object::id_address(&queue),
                clock, ctx,
            );

            tribe_token_ledger::share(ledger);
            tribe_vault::share(vault);
            tribe_exchange::share(exchange_config);
            vault_withdrawal::share(board);
            mint_burn_queue::share(queue);

            let trade_reg = advanced_direct_trade::create_advanced_trade_registry(new_tribe_id, ctx);
            advanced_direct_trade::share_advanced_trade_registry(trade_reg);
        };

        transfer::public_transfer(leader_cap, sender);

        event::emit(TribeReclaimedEvent {
            old_tribe_id: original_tribe_id,
            new_tribe_id,
            leader: sender,
            bazaar_type,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== PTB 2.. — Advanced: re-mint token balances (paged) =====

    /// Re-mint a page of snapshot token balances into the now-shared ledger. CEREMONY-GATED
    /// (E_CEREMONY_NOT_OPEN, SA-RCV2-MINT): inert outside the admin-opened ceremony window, so
    /// it is NOT a standing live-version leader direct-mint that bypasses the V36 veto queue —
    /// it only mints during the bounded reclaim. Leader-cap gated (E_WRONG_TRIBE if the cap does
    /// not match the ledger's tribe). Each mint goes through mint_for_reclaim, which asserts the
    /// supply cap (set to the snapshot circulation by reclaim_tribe), so the supply can re-grow
    /// to AT MOST the snapshot total — re-paging cannot inflate past it. Paged so large tribes
    /// stay under the gas cap; the final total_supply == Σ restored balances.
    public entry fun reclaim_tribe_mint_page(
        leader_cap: &TribeLeaderCap,
        ledger: &mut TribeTokenLedger,
        gate: &CeremonyGate,
        holders: vector<address>,
        amounts: vector<u64>,
        clock: &Clock,
        _ctx: &TxContext,
    ) {
        assert!(ceremony_gate::is_open(gate), E_CEREMONY_NOT_OPEN);
        assert!(
            tribe_registry::cap_tribe_id(leader_cap) == tribe_token_ledger::tribe_id(ledger),
            E_WRONG_TRIBE,
        );
        let n = vector::length(&holders);
        assert!(vector::length(&amounts) == n, E_LEN_MISMATCH);
        let mut i = 0;
        while (i < n) {
            tribe_token_ledger::mint_for_reclaim(
                ledger,
                *vector::borrow(&holders, i),
                *vector::borrow(&amounts, i),
                clock,
            );
            i = i + 1;
        };
    }

    // ===== PTB last — restore tribe config + global bans + gov EVE =====

    /// Restore the tribe-level mission listing fee + global bans, and deposit the lazy-drained
    /// gov EVE into the now-shared TribeGovernance. TribeLeaderCap-gated through the validated
    /// bazaar_core restore setters. Tribe taxes + godot URL are restored by the FE via the
    /// existing leader-gated batch setters composed in the same PTB. `gov_eve_coin` may be
    /// zero. The FE must pre-filter non-permanent bans already expired by reclaim time.
    public entry fun reclaim_tribe_restore(
        leader_cap: &TribeLeaderCap,
        gov: &mut TribeGovernance,
        gov_eve_coin: Coin<EVE>,
        mission_listing_fee_per_hour: u64,
        ban_addrs: vector<address>,
        ban_expiries: vector<u64>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let n_ban = vector::length(&ban_addrs);
        assert!(vector::length(&ban_expiries) == n_ban, E_LEN_MISMATCH);

        let tribe_id = tribe_governance::tribe_id(gov);
        let gov_eve_deposited = sui::coin::value(&gov_eve_coin);

        // Gov EVE (tolerates a zero coin: join of zero balance is a no-op).
        tribe_governance::deposit_reclaimed_gov_eve(leader_cap, gov, gov_eve_coin);

        // Mission listing fee (0 = none).
        tribe_governance::set_tribe_mission_listing_fee(leader_cap, gov, mission_listing_fee_per_hour, clock, ctx);

        // Global timed bans.
        let mut j = 0;
        while (j < n_ban) {
            tribe_governance::restore_tribe_ban(
                leader_cap, gov,
                *vector::borrow(&ban_addrs, j),
                *vector::borrow(&ban_expiries, j),
                clock, ctx,
            );
            j = j + 1;
        };

        event::emit(TribeReclaimRestoreEvent {
            tribe_id,
            leader: tx_context::sender(ctx),
            bans_restored: n_ban,
            gov_eve_deposited,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
