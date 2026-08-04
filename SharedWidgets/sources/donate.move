// SharedWidgets/sources/donate.move
// MAX 500 LINES — DO NOT EXCEED
module shared_widgets::donate {
    use sui::event;
    use sui::coin::{Self, Coin};
    use EVE::EVE::EVE;
    use sui::clock::{Self, Clock};
    use sui::transfer;

    // -- Error codes --
    const E_UNAUTHORIZED_PACKAGE: u64 = 1;
    const E_DONATIONS_DISABLED: u64 = 2;
    const E_ZERO_DONATION: u64 = 3;

    // -- Structs --

    /// Per-SSU donation configuration and accounting.
    /// `authorized_package`: the package address authorised to call mutating functions.
    public struct DonateConfig has key, store {
        id: UID,
        ssu_id: address,
        authorized_package: address,
        enabled: bool,
        total_donated: u64,
        donation_count: u64,
    }

    // -- Events --

    public struct DonationsToggledEvent has copy, drop {
        ssu_id: address,
        enabled: bool,
    }

    public struct DonationEvent has copy, drop {
        ssu_id: address,
        donor: address,
        amount: u64,
        total_donated: u64,
        donation_count: u64,
        timestamp_ms: u64,
    }

    // ===== Constructor =====

    /// Create a new DonateConfig for an SSU.
    /// Donations start enabled by default.
    public fun create_config(
        ssu_id: address,
        authorized_package: address,
        ctx: &mut TxContext,
    ): DonateConfig {
        DonateConfig {
            id: object::new(ctx),
            ssu_id,
            authorized_package,
            enabled: true,
            total_donated: 0,
            donation_count: 0,
        }
    }

    // ===== Mutating functions =====

    /// Permissionless EVE (SUI) donation to the SSU/tribe treasury.
    /// The donated coin is transferred to the SSU's address (ssu_id).
    /// Aborts: E_DONATIONS_DISABLED, E_ZERO_DONATION
    public fun donate_eve(
        config: &mut DonateConfig,
        payment: Coin<EVE>,
        donor: address,
        clock: &Clock,
    ) {
        assert!(config.enabled, E_DONATIONS_DISABLED);
        let amount = coin::value(&payment);
        assert!(amount > 0, E_ZERO_DONATION);

        config.total_donated = config.total_donated + amount;
        config.donation_count = config.donation_count + 1;

        // Forward the donation coin to the SSU address (the SSU owner controls it)
        transfer::public_transfer(payment, config.ssu_id);

        event::emit(DonationEvent {
            ssu_id: config.ssu_id,
            donor,
            amount,
            total_donated: config.total_donated,
            donation_count: config.donation_count,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Enable or disable donations. Caller package must be authorised.
    /// Role checks (admin+) are the caller's responsibility.
    /// Aborts: E_UNAUTHORIZED_PACKAGE
    public fun toggle_donations(
        config: &mut DonateConfig,
        caller_package: address,
        enabled: bool,
    ) {
        assert!(config.authorized_package == caller_package, E_UNAUTHORIZED_PACKAGE);
        config.enabled = enabled;
        event::emit(DonationsToggledEvent { ssu_id: config.ssu_id, enabled });
    }

    // ===== Read accessors =====

    public fun ssu_id(config: &DonateConfig): address { config.ssu_id }
    public fun authorized_package(config: &DonateConfig): address { config.authorized_package }
    public fun is_enabled(config: &DonateConfig): bool { config.enabled }
    public fun total_donated(config: &DonateConfig): u64 { config.total_donated }
    public fun donation_count(config: &DonateConfig): u64 { config.donation_count }
}
