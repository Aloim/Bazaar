// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// BazaarCore/sources/tribe_admin_drain.move
// Update Ceremony V2 — Phase 2 (Slice 2): the leader-gated, ceremony-gated legacy
// drain of TribeGovernance.tax_wallet (per-tribe EVE; Easy + Advanced).
//
// Sibling to ssu_admin_drain.move (the per-SSU equivalent). Kept in its own file so
// the tribe-gov drain does not churn tribe_governance.move's LOC / size — bazaar_core
// is at the 102,400 B object ceiling (design §9).
//
// withdraw_legacy_tribe_gov_eve mirrors ssu_admin_drain::withdraw_legacy_ssu_eve
// (cap-gated, returns Coin<EVE>, zeroes the wallet, emits an unconditional forensic
// event) with ONE added guard: it is INERT unless the admin has opened the
// CeremonyGate (dapp_hub::ceremony_gate). That confines the drain to the ceremony
// window so it can never run on a normally-live version (security-auditor SA-RCV2-06;
// design §13 ruling #4).
//
// The returned Coin<EVE> is composed by the FE reclaim PTB (lazy drain-on-reclaim,
// no permanent cross-version Move dep):
//   OLD::withdraw_legacy_tribe_gov_eve -> coin -> NEW::reclaim_tribe

module bazaar_core::tribe_admin_drain {
    use sui::balance;
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::event;
    use EVE::EVE::EVE;
    use dapp_hub::tribe_registry::{Self, TribeLeaderCap};
    use dapp_hub::ceremony_gate::{Self, CeremonyGate};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};

    // Error codes
    const E_WRONG_TRIBE: u64 = 1;          // SA-RCV2-05: cap.tribe_id != gov.tribe_id
    const E_CEREMONY_NOT_OPEN: u64 = 2;    // SA-RCV2-06: gate closed -> inert

    // Events
    public struct LegacyTribeGovEveWithdrawn has copy, drop {
        tribe_id: u64,
        amount: u64,
        leader: address,
        timestamp_ms: u64,
    }

    /// Rescue residual EVE from a legacy outgoing-version TribeGovernance.tax_wallet
    /// during the Update Ceremony. TribeLeaderCap-gated (E_WRONG_TRIBE, SA-RCV2-05) AND
    /// ceremony-gated (E_CEREMONY_NOT_OPEN, SA-RCV2-06 — inert outside the ceremony window).
    /// Returns coin::zero<EVE> at zero balance; emits LegacyTribeGovEveWithdrawn
    /// unconditionally so the audit trail records every drain attempt (mirrors
    /// ssu_admin_drain.move:106).
    public fun withdraw_legacy_tribe_gov_eve(
        leader_cap: &TribeLeaderCap,
        gov: &mut TribeGovernance,
        gate: &CeremonyGate,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<EVE> {
        assert!(ceremony_gate::is_open(gate), E_CEREMONY_NOT_OPEN);
        let tribe_id = tribe_governance::tribe_id(gov);
        assert!(tribe_registry::cap_tribe_id(leader_cap) == tribe_id, E_WRONG_TRIBE);

        let amount = tribe_governance::tribe_tax_balance(gov);
        let bal = if (amount > 0) {
            tribe_governance::withdraw_tribe_tax_balance_all(gov)
        } else {
            balance::zero<EVE>()
        };

        event::emit(LegacyTribeGovEveWithdrawn {
            tribe_id,
            amount,
            leader: tx_context::sender(ctx),
            timestamp_ms: clock::timestamp_ms(clock),
        });

        coin::from_balance(bal, ctx)
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
