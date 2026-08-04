// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// DappHub/sources/ceremony_gate.move
// Update Ceremony V2 — a one-shot admin flag that gates the legacy EVE-withdraw
// entries (withdraw_legacy_tribe_gov_eve, withdraw_legacy_tribe_vault) so they are
// INERT during normal operation and active ONLY when the admin opens the ceremony.
//
// Why: those leader-gated drains bypass the TribeVault 24h multisig + is_locked
// guard by design (the legacy exit). Shipping them always-on on a live version would
// hand every leader an instant vault drain (security-auditor SA-RCV2-06). Gating them
// behind this flag confines the bypass to the ceremony window: admin flips `open`
// true on the OUTGOING version only after the new version is published, then false
// again once reclaims have drained the old wallets.
//
// Lives in dapp_hub (top of the dependency graph) so both bazaar_core
// (tribe_gov drain) and bazaar_economy (vault drain) can read it.

module dapp_hub::ceremony_gate {
    use sui::event;
    use dapp_hub::dapp_governance::DAppOwnerCap;

    public struct CeremonyGate has key {
        id: UID,
        open: bool,
    }

    public struct CeremonyGateToggled has copy, drop {
        open: bool,
        timestamp_ms: u64,
    }

    /// One-shot init, folded into the V38 cascade PTB#1 alongside ReclaimRegistry.
    /// Starts CLOSED. NOT an entry.
    public(package) fun create_and_share(ctx: &mut TxContext) {
        transfer::share_object(CeremonyGate { id: object::new(ctx), open: false });
    }

    /// Admin opens/closes the ceremony window. DAppOwnerCap-gated.
    public entry fun set_ceremony_open(
        _cap: &DAppOwnerCap,
        gate: &mut CeremonyGate,
        open: bool,
        clock: &sui::clock::Clock,
    ) {
        gate.open = open;
        event::emit(CeremonyGateToggled { open, timestamp_ms: sui::clock::timestamp_ms(clock) });
    }

    public fun is_open(gate: &CeremonyGate): bool { gate.open }

    #[test_only]
    public fun create_for_testing(ctx: &mut TxContext): CeremonyGate {
        CeremonyGate { id: object::new(ctx), open: false }
    }

    /// Flip the gate open/closed in unit tests without a DAppOwnerCap (Slice-2 drains
    /// consume this to exercise their ceremony-gate guard). NOT compiled into prod bytecode.
    #[test_only]
    public fun set_open_for_testing(gate: &mut CeremonyGate, open: bool) {
        gate.open = open;
    }

    #[test_only]
    public fun destroy_for_testing(gate: CeremonyGate) {
        let CeremonyGate { id, open: _ } = gate;
        object::delete(id);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
