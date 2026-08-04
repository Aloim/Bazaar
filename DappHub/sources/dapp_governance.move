// DappHub/sources/dapp_governance.move
// DApp-level ownership and global tax governance.
// DAppOwnerClaimBox enables first-come-first-served ownership claim.
// GovernanceConfig stores global and per-type tax rates.
// Phase 5: per-bazaar-type DApp tax rates added; per-entity override tables
//          RETIRED (AUD-DH-01 close-out) on this V36 fresh publish.
// Constitution: Article XII.3 — 500-line limit.
module dapp_hub::dapp_governance {
    use std::string::{Self, String};
    use sui::event;

    const VERSION: u64 = 1;

    // Default global dApp tax: 2% (200 bps).
    const DEFAULT_TAX_BPS: u64 = 200;
    // Hard cap at 50% (5000 bps).
    const MAX_TAX_BPS: u64 = 5_000;
    // Hard cap for raw-MIST EVE fee setters (10 EVE at 1_000_000_000 MIST/EVE).
    // Prevents accidental mis-entry of unscaled decimal values by the admin.
    // Error code shared with bps overflow: E_RATE_TOO_HIGH (2).
    const MAX_EVE_FEE_MIST: u64 = 10_000_000_000;

    // Error codes
    const E_ALREADY_CLAIMED: u64 = 1;
    const E_RATE_TOO_HIGH:   u64 = 2;

    // DAppOwnerCap: exactly one; transferable capability for the DApp owner.
    public struct DAppOwnerCap has key, store { id: UID }

    // DAppOwnerClaimBox: shared object for first-come-first-served ownership.
    // The inner cap is extracted on first claim and the box becomes empty.
    public struct DAppOwnerClaimBox has key {
        id: UID,
        cap: Option<DAppOwnerCap>,
    }

    // GovernanceConfig: global and per-type dApp tax configuration.
    // Registration/creation fees (raw MIST EVE) are charged on the matching
    // flow and routed to the DAppTaxWallet (join fee escrows first — see
    // dapp_hub::escrow_wallet). All default to 0 (free) until the DApp owner
    // sets them via set_registration_fees.
    //
    // Per-type rates (Phase 5): Option<u64> so that None = "fall back to global"
    // is structurally distinct from Some(0) = "deliberately exempt this type".
    // None is the default; set-time bounds: each rate <= MAX_TAX_BPS (5000).
    public struct GovernanceConfig has key {
        id: UID,
        version: u64,
        global_dapp_tax_bps: u64,
        // --- Phase 5: per-bazaar-type DApp tax (None => fall back to global) ---
        notribe_dapp_tax_bps:            Option<u64>,
        easy_dapp_tax_bps:               Option<u64>,
        advanced_exchange_dapp_tax_bps:  Option<u64>,
        ssu_registration_fee: u64,
        tribe_join_fee: u64,
        easy_tribe_creation_fee: u64,
        advanced_tribe_creation_fee: u64,
        // One global multiplayer relay WebSocket URL — the single shared standard
        // endpoint every player's client connects to. Empty by default until the
        // DApp owner sets it via set_multiplayer_relay_url. Authoritative for the
        // whole DApp (per-browser localStorage is only a dev fallback).
        multiplayer_relay_url: String,
        // Per-hour Mission (MIS) listing fee charged on the dApp layer (raw MIST
        // EVE per listing hour). Applies to NoTribe + Easy missions only — Advanced
        // has no dApp layer. 0 by default (free) until set via
        // set_mission_listing_fee_per_hour.
        mission_listing_fee_per_hour: u64,
    }

    // Events
    public struct OwnershipClaimedEvent has copy, drop { by: address }
    public struct TaxRateUpdatedEvent has copy, drop {
        old_rate_bps: u64,
        new_rate_bps: u64,
    }
    // Phase 5: single event shape for all three per-type setters.
    // bazaar_type is a Move-hardcoded literal per setter ("notribe"|"easy"|"advanced").
    // rate_bps = None signals "cleared back to global".
    public struct PerTypeTaxRateUpdatedEvent has copy, drop {
        bazaar_type: String,
        rate_bps:    Option<u64>,
    }
    public struct RegistrationFeesUpdatedEvent has copy, drop {
        ssu_registration_fee: u64,
        tribe_join_fee: u64,
        easy_tribe_creation_fee: u64,
        advanced_tribe_creation_fee: u64,
    }
    public struct MultiplayerRelayUrlUpdatedEvent has copy, drop {
        url: String,
    }
    public struct MissionListingFeeUpdatedEvent has copy, drop {
        fee_per_hour: u64,
    }

    fun init(ctx: &mut TxContext) {
        let owner_cap = DAppOwnerCap { id: object::new(ctx) };
        let claim_box = DAppOwnerClaimBox {
            id: object::new(ctx),
            cap: option::some(owner_cap),
        };
        transfer::share_object(claim_box);

        let config = GovernanceConfig {
            id: object::new(ctx),
            version: VERSION,
            global_dapp_tax_bps: DEFAULT_TAX_BPS,
            notribe_dapp_tax_bps:           option::none(),
            easy_dapp_tax_bps:              option::none(),
            advanced_exchange_dapp_tax_bps: option::none(),
            ssu_registration_fee: 0,
            tribe_join_fee: 0,
            easy_tribe_creation_fee: 0,
            advanced_tribe_creation_fee: 0,
            multiplayer_relay_url: string::utf8(b""),
            mission_listing_fee_per_hour: 0,
        };
        transfer::share_object(config);
    }

    // First-come-first-served ownership claim. Aborts if already claimed.
    public fun claim_ownership(
        claim_box: &mut DAppOwnerClaimBox,
        ctx: &mut TxContext,
    ): DAppOwnerCap {
        assert!(option::is_some(&claim_box.cap), E_ALREADY_CLAIMED);
        let cap = option::extract(&mut claim_box.cap);
        event::emit(OwnershipClaimedEvent { by: tx_context::sender(ctx) });
        cap
    }

    // Check if ownership is still claimable.
    public fun is_claimable(claim_box: &DAppOwnerClaimBox): bool {
        option::is_some(&claim_box.cap)
    }

    // Set global dApp tax rate. Requires DAppOwnerCap. Hard-capped at 50%.
    // Cross-package: called by dapp_hub frontend.
    // Aborts: E_RATE_TOO_HIGH if rate > 5000.
    public fun set_global_dapp_tax_rate(
        _cap: &DAppOwnerCap,
        config: &mut GovernanceConfig,
        rate_bps: u64,
    ) {
        assert!(rate_bps <= MAX_TAX_BPS, E_RATE_TOO_HIGH);
        let old_rate = config.global_dapp_tax_bps;
        config.global_dapp_tax_bps = rate_bps;
        event::emit(TaxRateUpdatedEvent { old_rate_bps: old_rate, new_rate_bps: rate_bps });
    }

    // ===== Phase 5: per-bazaar-type tax setters =====
    // Each accepts Option<u64>: Some(n) sets the type-specific rate;
    // None clears it (falls back to global_dapp_tax_bps).
    // Bounds: Some(v) requires v <= MAX_TAX_BPS (5000). None always accepted.
    // Aborts: E_RATE_TOO_HIGH (2) if Some(v) with v > 5000.
    // Requires DAppOwnerCap (compile-time gate — satisfies A5 / C-A4).
    // Emits PerTypeTaxRateUpdatedEvent; bazaar_type is a Move literal (satisfies C-EVENT).

    // Set (or clear) the DApp tax rate for NoTribe trades.
    // Pass option::none() to clear back to the global rate.
    public fun set_notribe_dapp_tax_bps(
        _cap: &DAppOwnerCap,
        config: &mut GovernanceConfig,
        rate_bps: Option<u64>,
    ) {
        if (option::is_some(&rate_bps)) {
            assert!(*option::borrow(&rate_bps) <= MAX_TAX_BPS, E_RATE_TOO_HIGH);
        };
        config.notribe_dapp_tax_bps = rate_bps;
        event::emit(PerTypeTaxRateUpdatedEvent {
            bazaar_type: string::utf8(b"notribe"),
            rate_bps,
        });
    }

    // Set (or clear) the DApp tax rate for Easy-tribe trades.
    // Pass option::none() to clear back to the global rate.
    public fun set_easy_dapp_tax_bps(
        _cap: &DAppOwnerCap,
        config: &mut GovernanceConfig,
        rate_bps: Option<u64>,
    ) {
        if (option::is_some(&rate_bps)) {
            assert!(*option::borrow(&rate_bps) <= MAX_TAX_BPS, E_RATE_TOO_HIGH);
        };
        config.easy_dapp_tax_bps = rate_bps;
        event::emit(PerTypeTaxRateUpdatedEvent {
            bazaar_type: string::utf8(b"easy"),
            rate_bps,
        });
    }

    // Set (or clear) the DApp tax rate for the Advanced Exchange (EVE side only).
    // Pass option::none() to clear back to the global rate.
    // Note: the per-exchange override (set via economy_governance::set_exchange_fee_override)
    // remains the highest-priority term and is unchanged by this setter.
    public fun set_advanced_exchange_dapp_tax_bps(
        _cap: &DAppOwnerCap,
        config: &mut GovernanceConfig,
        rate_bps: Option<u64>,
    ) {
        if (option::is_some(&rate_bps)) {
            assert!(*option::borrow(&rate_bps) <= MAX_TAX_BPS, E_RATE_TOO_HIGH);
        };
        config.advanced_exchange_dapp_tax_bps = rate_bps;
        event::emit(PerTypeTaxRateUpdatedEvent {
            bazaar_type: string::utf8(b"advanced"),
            rate_bps,
        });
    }

    // ===== Phase 5: resolver helper (private) =====
    // Resolves an Option<u64> per-type rate to the effective rate.
    // Some(v) => v  (even if v == 0; deliberate exemption).
    // None    => global (never silently 0).
    // Never aborts.
    fun resolve_or_global(opt: &Option<u64>, global: u64): u64 {
        if (option::is_some(opt)) { *option::borrow(opt) } else { global }
    }

    // Set the four registration/creation fees (raw MIST EVE). Requires
    // DAppOwnerCap. Any fee may be 0 (that flow is free). Batched so the admin
    // UI submits all four in one transaction.
    public fun set_registration_fees(
        _cap: &DAppOwnerCap,
        config: &mut GovernanceConfig,
        ssu_registration_fee: u64,
        tribe_join_fee: u64,
        easy_tribe_creation_fee: u64,
        advanced_tribe_creation_fee: u64,
    ) {
        assert!(ssu_registration_fee        <= MAX_EVE_FEE_MIST, E_RATE_TOO_HIGH);
        assert!(tribe_join_fee              <= MAX_EVE_FEE_MIST, E_RATE_TOO_HIGH);
        assert!(easy_tribe_creation_fee     <= MAX_EVE_FEE_MIST, E_RATE_TOO_HIGH);
        assert!(advanced_tribe_creation_fee <= MAX_EVE_FEE_MIST, E_RATE_TOO_HIGH);
        config.ssu_registration_fee = ssu_registration_fee;
        config.tribe_join_fee = tribe_join_fee;
        config.easy_tribe_creation_fee = easy_tribe_creation_fee;
        config.advanced_tribe_creation_fee = advanced_tribe_creation_fee;
        event::emit(RegistrationFeesUpdatedEvent {
            ssu_registration_fee,
            tribe_join_fee,
            easy_tribe_creation_fee,
            advanced_tribe_creation_fee,
        });
    }

    // Set the single global multiplayer relay WebSocket URL — the shared standard
    // endpoint for ALL players. Requires DAppOwnerCap. Pass empty bytes to clear.
    // `url` is the raw UTF-8 bytes of a wss:// / ws:// URL; stored verbatim (the
    // frontend normalizes https://->wss:// before saving, so admins can paste either).
    public fun set_multiplayer_relay_url(
        _cap: &DAppOwnerCap,
        config: &mut GovernanceConfig,
        url: vector<u8>,
    ) {
        config.multiplayer_relay_url = string::utf8(url);
        event::emit(MultiplayerRelayUrlUpdatedEvent { url: config.multiplayer_relay_url });
    }

    // Cross-package accessor: the global multiplayer relay URL ("" if unset). Never aborts.
    public fun multiplayer_relay_url(config: &GovernanceConfig): String { config.multiplayer_relay_url }

    // Set the per-hour Mission (MIS) listing fee charged on the dApp layer (raw MIST
    // EVE per listing hour). Requires DAppOwnerCap. Applies to NoTribe + Easy missions
    // only (Advanced has no dApp layer). 0 = no dApp mission fee.
    public fun set_mission_listing_fee_per_hour(
        _cap: &DAppOwnerCap,
        config: &mut GovernanceConfig,
        fee_per_hour: u64,
    ) {
        assert!(fee_per_hour <= MAX_EVE_FEE_MIST, E_RATE_TOO_HIGH);
        config.mission_listing_fee_per_hour = fee_per_hour;
        event::emit(MissionListingFeeUpdatedEvent { fee_per_hour });
    }

    // Cross-package accessor: per-hour dApp Mission listing fee (raw MIST EVE). Never aborts.
    public fun mission_listing_fee_per_hour(config: &GovernanceConfig): u64 { config.mission_listing_fee_per_hour }

    // Fee accessors (raw MIST EVE). Never abort.
    public fun ssu_registration_fee(config: &GovernanceConfig): u64 { config.ssu_registration_fee }
    public fun tribe_join_fee(config: &GovernanceConfig): u64 { config.tribe_join_fee }
    public fun easy_tribe_creation_fee(config: &GovernanceConfig): u64 { config.easy_tribe_creation_fee }
    public fun advanced_tribe_creation_fee(config: &GovernanceConfig): u64 { config.advanced_tribe_creation_fee }

    // Cross-package accessor: global dApp tax rate in basis points. Never aborts.
    public fun global_dapp_tax_bps(config: &GovernanceConfig): u64 {
        config.global_dapp_tax_bps
    }

    // ===== Phase 5: per-type resolved getters =====
    // Each resolves to the type-specific rate if set (Some), else falls back to global.
    // Never aborts. Called by the matching levy site in bazaar_core / bazaar_economy.

    /// Resolved DApp tax bps for NoTribe trades. Never aborts.
    /// Some(v) => v  (including Some(0) = deliberate exemption).
    /// None    => global_dapp_tax_bps.
    public fun notribe_dapp_tax_bps(config: &GovernanceConfig): u64 {
        resolve_or_global(&config.notribe_dapp_tax_bps, config.global_dapp_tax_bps)
    }

    /// Resolved DApp tax bps for Easy-tribe trades. Never aborts.
    public fun easy_dapp_tax_bps(config: &GovernanceConfig): u64 {
        resolve_or_global(&config.easy_dapp_tax_bps, config.global_dapp_tax_bps)
    }

    /// Resolved DApp tax bps for the Advanced Exchange (EVE side only). Never aborts.
    /// The per-exchange override (ExchangeConfig.exchange_fee_override_bps) is the
    /// highest-priority term and is evaluated in tribe_exchange::effective_fee_bps —
    /// this getter is the second-priority fallback.
    public fun advanced_exchange_dapp_tax_bps(config: &GovernanceConfig): u64 {
        resolve_or_global(&config.advanced_exchange_dapp_tax_bps, config.global_dapp_tax_bps)
    }

    // Governance config version.
    public fun version(config: &GovernanceConfig): u64 { config.version }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_owner_cap_for_testing(ctx: &mut TxContext): DAppOwnerCap {
        DAppOwnerCap { id: object::new(ctx) }
    }

    #[test_only]
    public fun create_config_for_testing(ctx: &mut TxContext): GovernanceConfig {
        GovernanceConfig {
            id: object::new(ctx),
            version: 1,
            global_dapp_tax_bps: 200,
            notribe_dapp_tax_bps:           option::none(),
            easy_dapp_tax_bps:              option::none(),
            advanced_exchange_dapp_tax_bps: option::none(),
            ssu_registration_fee: 0,
            tribe_join_fee: 0,
            easy_tribe_creation_fee: 0,
            advanced_tribe_creation_fee: 0,
            multiplayer_relay_url: string::utf8(b""),
            mission_listing_fee_per_hour: 0,
        }
    }

    #[test_only]
    public fun create_claim_box_for_testing(ctx: &mut TxContext): DAppOwnerClaimBox {
        let owner_cap = DAppOwnerCap { id: object::new(ctx) };
        DAppOwnerClaimBox {
            id: object::new(ctx),
            cap: option::some(owner_cap),
        }
    }
}
// END OF FILE — dapp_hub::dapp_governance
