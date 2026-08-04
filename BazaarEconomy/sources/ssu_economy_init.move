// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// ssu_economy_init — Post-V26 Wave 2 (Issues 7+8).
///
/// Per-SSU "Initialize Economy" entry. Closes the gap left when an Advanced
/// SSU is freshly bootstrapped (atomic-9) but its sibling tribe-token state
/// is missing:
///   - The per-SSU `TribeTokenWtbPool` (created lazily by the old standalone
///     entry `tribe_token_wtb_pool::bootstrap_tribe_token_wtb_pool`) — without
///     it, Advanced WTB shop creation aborts because the create_wtb_shop_advanced
///     flow needs a pool to earmark into. This is the cause of Issue 8 and the
///     downstream Issue 11 silent failure on WTB sell.
///   - The SSU's row in the per-tribe `TribeTokenLedger` (created lazily on
///     first credit). Pre-initing the row makes the SSU Tax Wallet UI render a
///     real "0 {SYMBOL}" balance immediately instead of failing the row lookup
///     until the first shop trade credits it.
///
/// This entry is meant to be called from the SSU SuperAdmin Wallets section
/// after the tribe's Economy Bootstrap has produced the `TribeTokenLedger`.
/// SSUOwnerCap-gated so only the SSU owner can run it.
///
/// Idempotency: NOT enforced on-chain — duplicate calls produce orphan pools
/// (mirrors the existing `bootstrap_tribe_token_wtb_pool` policy). FE detects
/// completion via the `TribeTokenWtbPoolCreated` event keyed on `ssu_id` and
/// hides the button after init. `ensure_account` is already idempotent.
///
/// Constitution / upgrade compliance: this is a new module added in an
/// additive Move upgrade — no struct changes, no signature changes on existing
/// public APIs. The existing public entry `bootstrap_tribe_token_wtb_pool`
/// keeps its signature; this module reuses its body via the new
/// `tribe_token_wtb_pool::create_and_share_pool` package-private helper.
module bazaar_economy::ssu_economy_init {
    use sui::event;
    use sui::clock::{Self, Clock};
    use bazaar_core::ssu_governance::{Self, SSUGovernance};
    use bazaar_core::tribe_governance::{Self, TribeGovernance};
    use bazaar_core::membership::{Self, SSUOwnerCap};
    use bazaar_core::bazaar_assertions;
    use bazaar_economy::tribe_token_wtb_pool;
    use bazaar_economy::tribe_token_ledger::{Self, TribeTokenLedger};

    // ===== Error Codes =====
    /// SSUOwnerCap's ssu_id does not match `ssu_gov.ssu_id`.
    const E_WRONG_SSU:          u64 = 1;
    /// SSUGovernance's tribe_id does not match `tribe_gov.tribe_id`.
    const E_WRONG_TRIBE:        u64 = 2;
    /// TribeTokenLedger's tribe_id does not match `tribe_gov.tribe_id`.
    const E_LEDGER_WRONG_TRIBE: u64 = 3;
    /// SSU is not active (deregistered or freeze-bypassed).
    const E_SSU_NOT_ACTIVE:     u64 = 4;

    // ===== Events =====

    /// Emitted by `init_ssu_economy` for FE event-scan indexing. Carries enough
    /// fields to drive `useSSUEconomyInitStatus(ssuId)` without an extra RPC
    /// round-trip. Mirrors the per-pool `TribeTokenWtbPoolCreated` shape but
    /// adds the tribe + ledger + caller context.
    public struct SSUEconomyInitializedEvent has copy, drop {
        ssu_id:        address,
        tribe_id:      u64,
        wtb_pool_id:   ID,
        ledger_id:     address,
        initialized_by: address,
        timestamp_ms:  u64,
    }

    // ===== Entry =====

    /// Initialize the per-SSU economy state. SSUOwnerCap-gated. Caller MUST
    /// hold the SSUOwnerCap for `ssu_gov` AND `ssu_gov.tribe_id` must equal
    /// `tribe_gov.tribe_id` AND `ledger.tribe_id` must equal the same tribe.
    ///
    /// Effects (atomic):
    ///   1. Creates and shares a fresh `TribeTokenWtbPool` for this SSU.
    ///   2. Ensures a zero-balance row exists for the SSU address in the
    ///      `TribeTokenLedger` so downstream credits never hit a missing-row
    ///      branch.
    ///   3. Emits `SSUEconomyInitializedEvent` for FE indexing.
    public entry fun init_ssu_economy(
        ssu_gov:       &SSUGovernance,
        ssu_owner_cap: &SSUOwnerCap,
        tribe_gov:     &TribeGovernance,
        ledger:        &mut TribeTokenLedger,
        clock:         &Clock,
        ctx:           &mut TxContext,
    ) {
        // Cross-object identity checks before mutating anything.
        assert!(
            membership::cap_ssu_id(ssu_owner_cap) == ssu_governance::ssu_id(ssu_gov),
            E_WRONG_SSU,
        );
        let tribe_id = tribe_governance::tribe_id(tribe_gov);
        assert!(ssu_governance::ssu_tribe_id(ssu_gov) == tribe_id, E_WRONG_TRIBE);
        assert!(tribe_token_ledger::tribe_id(ledger) == tribe_id, E_LEDGER_WRONG_TRIBE);

        // Advanced + active gates.
        bazaar_assertions::assert_advanced_external(
            ssu_governance::ssu_bazaar_type(ssu_gov),
        );
        bazaar_assertions::assert_advanced_external(
            tribe_governance::tribe_bazaar_type(tribe_gov),
        );
        assert!(ssu_governance::ssu_is_active(ssu_gov), E_SSU_NOT_ACTIVE);

        // (1) Create + share the WTB escrow pool. Delegates to the helper so
        //     the share + event-emit logic stays in tribe_token_wtb_pool.
        let pool_id = tribe_token_wtb_pool::create_and_share_pool(ssu_gov, ctx);

        // (2) Pre-init the SSU's tribe-token ledger row. `ensure_account` is
        //     idempotent and gates on Advanced + tribe_id match — both already
        //     covered above, so the call is purely an insert-if-missing.
        let ssu_addr = ssu_governance::ssu_id(ssu_gov);
        tribe_token_ledger::ensure_account(tribe_gov, ledger, ssu_addr);

        // (3) FE indexing event.
        event::emit(SSUEconomyInitializedEvent {
            ssu_id:         ssu_addr,
            tribe_id,
            wtb_pool_id:    pool_id,
            ledger_id:      object::id_address(ledger),
            initialized_by: tx_context::sender(ctx),
            timestamp_ms:   clock::timestamp_ms(clock),
        });
    }

    // ===== Test-Only Error Accessors =====
    #[test_only] public fun e_wrong_ssu():          u64 { E_WRONG_SSU }
    #[test_only] public fun e_wrong_tribe():        u64 { E_WRONG_TRIBE }
    #[test_only] public fun e_ledger_wrong_tribe(): u64 { E_LEDGER_WRONG_TRIBE }
    #[test_only] public fun e_ssu_not_active():     u64 { E_SSU_NOT_ACTIVE }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
