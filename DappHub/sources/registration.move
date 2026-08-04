// DappHub/sources/registration.move
// Application queue for tribe SSU registration.
// Applicants submit applications; tribe leaders accept or reject them.
// On acceptance, the SSU is registered in SSURegistry and added to TribeRegistry.
// Constitution: Article XII.3 — 500-line limit. Current: ~200 lines.
module dapp_hub::registration {
    use std::string::{Self, String};
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::balance;
    use sui::table::{Self, Table};
    use EVE::EVE::EVE;
    use dapp_hub::tribe_registry::{Self, TribeRegistry, TribeLeaderCap};
    use dapp_hub::ssu_registry::{Self, SSURegistry};
    use dapp_hub::dapp_governance::{Self, GovernanceConfig};
    use dapp_hub::tax_wallet::{Self, DAppTaxWallet};
    use dapp_hub::escrow_wallet::{Self, DAppEscrowWallet};

    // Application status constants
    const STATUS_PENDING:  u8 = 0;

    // Error codes
    const E_APPLICATION_NOT_FOUND: u64 = 1;
    const E_NOT_TRIBE_LEADER: u64      = 2;
    const E_ALREADY_PROCESSED: u64     = 3;
    const E_INSUFFICIENT_FEE: u64      = 4;  // payment coin < configured join fee
    const E_NOT_APPLICANT: u64         = 5;  // caller is not the application's original applicant

    // TribeApplication: stored in the queue's applications vector.
    // has drop so the vector can be cleaned if needed.
    public struct TribeApplication has store, drop {
        id: u64,
        tribe_id: u64,
        applicant: address,
        ssu_id: address,
        message: String,
        status: u8,
        submitted_at: u64,
    }

    // RegistrationRequestQueue: single shared object holding all pending applications.
    public struct RegistrationRequestQueue has key {
        id: UID,
        applications: Table<u64, TribeApplication>,
        next_id: u64,
    }

    // Events
    public struct ApplicationSubmittedEvent has copy, drop {
        application_id: u64,
        tribe_id: u64,
        applicant: address,
        ssu_id: address,
        timestamp_ms: u64,
    }
    public struct ApplicationAcceptedEvent has copy, drop {
        application_id: u64,
        tribe_id: u64,
        ssu_id: address,
        approved_by: address,
        timestamp_ms: u64,
    }
    public struct ApplicationRejectedEvent has copy, drop {
        application_id: u64,
        tribe_id: u64,
        ssu_id: address,
        rejected_by: address,
        timestamp_ms: u64,
    }
    public struct ApplicationCancelledEvent has copy, drop {
        application_id: u64,
        tribe_id:       u64,
        ssu_id:         address,
        cancelled_by:   address,
        refund_amount:  u64,
        timestamp_ms:   u64,
    }

    fun init(ctx: &mut TxContext) {
        let queue = RegistrationRequestQueue {
            id: object::new(ctx),
            applications: table::new(ctx),
            next_id: 1,
        };
        transfer::share_object(queue);
    }

    // Submit an application to join a tribe with an SSU. Permissionless.
    // The configured tribe-join fee (raw MIST EVE) is held in the SEPARATE
    // DAppEscrowWallet keyed by the application id — NOT the tax wallet. It is
    // forwarded to the tax wallet on accept, or refunded on reject. Pass a zero
    // coin when the join fee is 0. Aborts E_INSUFFICIENT_FEE if payment < fee.
    public fun apply_to_tribe(
        queue: &mut RegistrationRequestQueue,
        escrow: &mut DAppEscrowWallet,
        config: &GovernanceConfig,
        payment: Coin<EVE>,
        tribe_id: u64,
        ssu_id: address,
        message: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let fee = dapp_governance::tribe_join_fee(config);
        assert!(coin::value(&payment) >= fee, E_INSUFFICIENT_FEE);
        let application_id = queue.next_id;
        // Escrow the fee under the application id (held until accept/reject).
        escrow_wallet::escrow(escrow, application_id, payment);
        let timestamp_ms = clock::timestamp_ms(clock);
        let applicant = tx_context::sender(ctx);
        let application = TribeApplication {
            id: application_id,
            tribe_id,
            applicant,
            ssu_id,
            message: string::utf8(message),
            status: STATUS_PENDING,
            submitted_at: timestamp_ms,
        };
        table::add(&mut queue.applications, application_id, application);
        queue.next_id = application_id + 1;
        event::emit(ApplicationSubmittedEvent {
            application_id,
            tribe_id,
            applicant,
            ssu_id,
            timestamp_ms,
        });
    }


    // Accept an application. Tribe leader only (cap.tribe_id must match application.tribe_id).
    // Registers the SSU in SSURegistry with app.applicant as owner (not the signing leader).
    // Adds SSU to TribeRegistry.
    // Replay guard: table::contains → E_APPLICATION_NOT_FOUND (row absent = already processed).
    // Guardrail: table::remove + escrow_wallet::release are ALWAYS paired; fee_bal consumed
    // (deposit_fee_balance) before any subsequent call that can abort.
    public fun accept_application(
        cap: &TribeLeaderCap,
        queue: &mut RegistrationRequestQueue,
        escrow: &mut DAppEscrowWallet,
        tax_wallet: &mut DAppTaxWallet,
        tribe_registry: &mut TribeRegistry,
        ssu_registry: &mut SSURegistry,
        application_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Step 1: replay guard
        assert!(table::contains(&queue.applications, application_id), E_APPLICATION_NOT_FOUND);
        // Step 2: validate auth + capture fields (isolated borrow block; borrow released before remove)
        let (tribe_id, ssu_id, applicant) = {
            let app = table::borrow(&queue.applications, application_id);
            assert!(app.tribe_id == tribe_registry::cap_tribe_id(cap), E_NOT_TRIBE_LEADER);
            // NOTE: with remove-on-process, every live row is PENDING.
            // This assert is effectively unreachable; retained as a documentation invariant.
            assert!(app.status == STATUS_PENDING, E_ALREADY_PROCESSED);
            (app.tribe_id, app.ssu_id, app.applicant)  // OS-54: capture applicant before remove
        };
        // Step 3: consume the row (TribeApplication has drop)
        table::remove(&mut queue.applications, application_id);
        // Step 4: paired escrow release + immediate consume before any subsequent abort
        let fee_bal = escrow_wallet::release(escrow, application_id);
        tax_wallet::deposit_fee_balance(tax_wallet, fee_bal, b"tribe_join", applicant, clock);
        // Step 5: downstream registration (can abort E_SSU_ALREADY_REGISTERED;
        // no non-droppable locals are in scope at this point)
        let tribe = tribe_registry::tribe_by_id(tribe_registry, tribe_id);
        let bazaar_type = tribe_registry::tribe_bazaar_type(tribe);
        ssu_registry::register_ssu_with_tribe(
            ssu_registry, ssu_id, bazaar_type, tribe_id, applicant, clock, ctx,
        );
        tribe_registry::add_ssu_to_tribe(cap, tribe_registry, ssu_id);
        tribe_registry::increment_member_count(tribe_registry, tribe_id);
        let approved_by = tx_context::sender(ctx);
        let timestamp_ms = clock::timestamp_ms(clock);
        event::emit(ApplicationAcceptedEvent {
            application_id,
            tribe_id,
            ssu_id,
            approved_by,
            timestamp_ms,
        });
    }

    // Reject an application. Tribe leader only. Refunds the escrowed join fee
    // (if any) back to the applicant — it never touches the tax wallet.
    // Replay guard: table::contains → E_APPLICATION_NOT_FOUND.
    // Guardrail: table::remove + escrow_wallet::release always paired; fee_bal consumed before return.
    public fun reject_application(
        cap: &TribeLeaderCap,
        queue: &mut RegistrationRequestQueue,
        escrow: &mut DAppEscrowWallet,
        application_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&queue.applications, application_id), E_APPLICATION_NOT_FOUND);
        let (tribe_id, ssu_id, applicant) = {
            let app = table::borrow(&queue.applications, application_id);
            assert!(app.tribe_id == tribe_registry::cap_tribe_id(cap), E_NOT_TRIBE_LEADER);
            // NOTE: effectively unreachable with remove-on-process; retained as invariant doc.
            assert!(app.status == STATUS_PENDING, E_ALREADY_PROCESSED);
            (app.tribe_id, app.ssu_id, app.applicant)
        };
        table::remove(&mut queue.applications, application_id);
        // Paired release; fee_bal consumed (transfer or destroy) before function returns.
        let fee_bal = escrow_wallet::release(escrow, application_id);
        if (balance::value(&fee_bal) > 0) {
            transfer::public_transfer(coin::from_balance(fee_bal, ctx), applicant);
        } else {
            balance::destroy_zero(fee_bal);
        };
        let rejected_by = tx_context::sender(ctx);
        let timestamp_ms = clock::timestamp_ms(clock);
        event::emit(ApplicationRejectedEvent {
            application_id,
            tribe_id,
            ssu_id,
            rejected_by,
            timestamp_ms,
        });
    }

    // Public accessor for E_NOT_APPLICANT — for FE abort-code lookup and tests.
    public fun e_not_applicant(): u64 { E_NOT_APPLICANT }

    // Cancel a PENDING application. Applicant-only (ctx.sender must equal app.applicant).
    // Refunds the escrowed join fee to the applicant.
    // Asserts: E_APPLICATION_NOT_FOUND (1), E_NOT_APPLICANT (5), E_ALREADY_PROCESSED (3).
    // Replay guard: table::contains → E_APPLICATION_NOT_FOUND (row absent = already processed).
    // Double-release is blocked: the row is removed atomically; a second cancel on the same id
    // aborts at E_APPLICATION_NOT_FOUND before reaching escrow_wallet::release.
    // Guardrail: table::remove + escrow_wallet::release always paired; fee_bal consumed before return.
    public entry fun cancel_application(
        queue:          &mut RegistrationRequestQueue,
        escrow:         &mut DAppEscrowWallet,
        application_id: u64,
        clock:          &Clock,
        ctx:            &mut TxContext,
    ) {
        assert!(table::contains(&queue.applications, application_id), E_APPLICATION_NOT_FOUND);
        let caller = tx_context::sender(ctx);
        let (tribe_id, ssu_id, applicant) = {
            let app = table::borrow(&queue.applications, application_id);
            assert!(app.applicant == caller, E_NOT_APPLICANT);
            // NOTE: effectively unreachable with remove-on-process; retained as invariant doc.
            assert!(app.status == STATUS_PENDING, E_ALREADY_PROCESSED);
            (app.tribe_id, app.ssu_id, app.applicant)   // OS-54: capture before remove
        };
        table::remove(&mut queue.applications, application_id);
        let fee_bal = escrow_wallet::release(escrow, application_id);
        let refund_amount = balance::value(&fee_bal);
        if (refund_amount > 0) {
            transfer::public_transfer(coin::from_balance(fee_bal, ctx), applicant);
        } else {
            balance::destroy_zero(fee_bal);
        };
        let timestamp_ms = clock::timestamp_ms(clock);
        event::emit(ApplicationCancelledEvent {
            application_id,
            tribe_id,
            ssu_id,
            cancelled_by: caller,
            refund_amount,
            timestamp_ms,
        });
    }

    // Check whether an application id is still pending (not yet processed).
    // With remove-on-process: absent id means accepted/rejected/cancelled.
    public fun has_application(queue: &RegistrationRequestQueue, application_id: u64): bool {
        table::contains(&queue.applications, application_id)
    }

    // Borrow a pending application by id. Aborts E_APPLICATION_NOT_FOUND if absent.
    // For use by in-package tests and read-only callers; FE uses getDynamicFields RPC.
    public fun borrow_application(
        queue: &RegistrationRequestQueue,
        application_id: u64,
    ): &TribeApplication {
        assert!(table::contains(&queue.applications, application_id), E_APPLICATION_NOT_FOUND);
        table::borrow(&queue.applications, application_id)
    }

    // Count of currently-pending (unprocessed) applications.
    public fun application_count(queue: &RegistrationRequestQueue): u64 {
        table::length(&queue.applications)
    }

    // TribeApplication field accessors.
    public fun app_id(app: &TribeApplication): u64            { app.id }
    public fun app_tribe_id(app: &TribeApplication): u64      { app.tribe_id }
    public fun app_applicant(app: &TribeApplication): address { app.applicant }
    public fun app_ssu_id(app: &TribeApplication): address    { app.ssu_id }
    public fun app_status(app: &TribeApplication): u8         { app.status }
    public fun app_message(app: &TribeApplication): &String   { &app.message }
    public fun app_submitted_at(app: &TribeApplication): u64  { app.submitted_at }

    // ===== Test-Only Factories =====
    #[test_only]
    public fun create_for_testing(ctx: &mut TxContext): RegistrationRequestQueue {
        RegistrationRequestQueue {
            id: object::new(ctx),
            applications: table::new(ctx),
            next_id: 1,
        }
    }

    #[test_only]
    public fun share_for_testing(self: RegistrationRequestQueue) {
        sui::transfer::share_object(self);
    }
}
// END OF FILE — dapp_hub::registration
