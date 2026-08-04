// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/// SSU per-object bootstrap for bazaar_core (FP1-43).
///
/// Single entry point: `bootstrap_ssu_objects` creates and shares all
/// per-SSU shared objects (SSUGovernance, UserStorage, MemberRegistry,
/// AnnouncementBoard, GuestbookBoard, WidgetConfig) and
/// transfers SSUOwnerCap to the designated owner in one atomic PTB step.
///
/// Authorization hardening (OS-54-followup sub-a):
///   1. ssu_id must be registered in SSURegistry (E_SSU_NOT_REGISTERED).
///   2. owner parameter must match the registered SSU owner (E_OWNER_MISMATCH).
///   3. ssu_id must not already be bootstrapped (E_ALREADY_BOOTSTRAPPED).
///   On success, marks ssu_id as bootstrapped in SSURegistry (idempotency guard).
///
/// SDC-002: only `bootstrap_ssu_objects` is `public entry`.
/// SDC-008: @bazaar_core is the canonical authorized_package literal for all
/// widget creates — cross-reference: announcement_proxy.move:41 uses the same
/// literal pattern for all SharedWidgets cross-package calls.
///
/// NOTE: `registry: &mut SSURegistry` prepended as first parameter — this is a
/// non-additive ABI change. Bundled into the pending v5 fresh publish (required
/// for OS-59-tribe-widgets TribeGovernance struct expansion). Source-only commit.
module bazaar_core::ssu_bootstrap {
    use sui::clock::Clock;
    use sui::transfer;
    use sui::object;
    use dapp_hub::ssu_registry::{Self, SSURegistry};
    use bazaar_core::ssu_governance;
    use bazaar_core::user_storage;
    use bazaar_core::membership;
    use shared_widgets::announcements;
    use shared_widgets::guestbook;
    use shared_widgets::widget_config;
    use bazaar_core::quicktrade_vault;
    use bazaar_core::wtb_escrow_pool;

    // Error constants (public for #[expected_failure(abort_code = ...)] path resolution in tests).
    // NOTE: E_SSU_NOT_REGISTERED = 1 is this module's own abort code. It is
    // coincidentally the same numeric value as ssu_registry::E_SSU_NOT_REGISTERED
    // but is declared independently here — each module owns its own abort namespace.
    const E_SSU_NOT_REGISTERED:   u64 = 1;
    const E_OWNER_MISMATCH:       u64 = 2;
    const E_ALREADY_BOOTSTRAPPED: u64 = 3;

    /// Finalises an accepted SSU on-chain. Creates and shares all per-SSU
    /// objects, then transfers SSUOwnerCap to `owner`.
    ///
    /// Authorization guards (in order):
    ///   1. ssu_id is registered in SSURegistry         → E_SSU_NOT_REGISTERED (1)
    ///   2. owner == registered SSU owner               → E_OWNER_MISMATCH (2)
    ///   3. ssu_id not yet bootstrapped                 → E_ALREADY_BOOTSTRAPPED (3)
    ///
    /// Objects created and shared:
    ///   - SSUGovernance     (ssu_governance module — shared via ssu_governance::share)
    ///   - UserStorage       (user_storage module — shared via user_storage::share)
    ///   - MemberRegistry    (membership module)
    ///   - AnnouncementBoard (shared_widgets::announcements, authorized_package = @bazaar_core)
    ///   - GuestbookBoard    (shared_widgets::guestbook, authorized_package = @bazaar_core)
    ///   - WidgetConfig      (shared_widgets::widget_config, authorized_package = @bazaar_core)
    ///
    /// On completion, marks ssu_id as bootstrapped in SSURegistry (idempotency guard).
    ///
    /// Call this AFTER `dapp_hub::registration::accept_application` has registered
    /// `ssu_id` in the dapp_hub indexes. Both calls may be combined in a single PTB.
    ///
    /// SDC-006: authorization hardening applied per OS-54-followup sub-(a).
    ///
    /// Thin entry wrapper: delegates to the composable `bootstrap_ssu_objects_atomic`
    /// (Update Ceremony V2 Phase 2, §5) and transfers the returned cap to `owner`.
    /// ABI UNCHANGED — same params, same observable behavior. Existing callers
    /// (registration accept flow, FE bootstrap PTBs) are unaffected.
    public entry fun bootstrap_ssu_objects(
        registry: &mut SSURegistry,
        ssu_id: address,
        bazaar_type: u8,
        tribe_id: u64,
        owner: address,
        package_id: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let cap = bootstrap_ssu_objects_atomic(
            registry, ssu_id, bazaar_type, tribe_id, owner, package_id, clock, ctx,
        );
        transfer::public_transfer(cap, owner);
    }

    /// Composable bootstrap (Update Ceremony V2 Phase 2, §5). Creates + shares all 8
    /// per-SSU objects EXACTLY as the entry does — same 3 guards, same `mark_bootstrapped`
    /// idempotency anchor — but RETURNS the freshly-minted SSUOwnerCap instead of
    /// transferring it. This lets a reclaim orchestrator (bazaar_mission::reclaim_ssu)
    /// drive the cap-gated restore setters on the now-shared objects before handing the
    /// cap to the owner. The existing entry above wraps it with the transfer (zero ABI drift).
    ///
    /// Authorization guards (in order):
    ///   1. ssu_id is registered in SSURegistry         → E_SSU_NOT_REGISTERED (1)
    ///   2. owner == registered SSU owner               → E_OWNER_MISMATCH (2)
    ///   3. ssu_id not yet bootstrapped                 → E_ALREADY_BOOTSTRAPPED (3)
    public fun bootstrap_ssu_objects_atomic(
        registry: &mut SSURegistry,
        ssu_id: address,
        bazaar_type: u8,
        tribe_id: u64,
        owner: address,
        package_id: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ): membership::SSUOwnerCap {
        // Guard 1: ssu_id must be registered.
        assert!(ssu_registry::is_registered(registry, ssu_id), E_SSU_NOT_REGISTERED);
        // Guard 2: owner must match the registered SSU owner (prevents leader-divert).
        let reg = ssu_registry::registration(registry, ssu_id);
        assert!(owner == ssu_registry::ssu_owner(reg), E_OWNER_MISMATCH);
        // Guard 3: must not already be bootstrapped (idempotency guard).
        assert!(!ssu_registry::is_bootstrapped(registry, ssu_id), E_ALREADY_BOOTSTRAPPED);

        // Create per-SSU widget objects. V6: package_id explicitly passed by caller
        // to avoid the @bazaar_core literal substitution failure that left V5 boards
        // with authorized_package = @0x0 (sui compiler does not substitute @-literals
        // inside function bodies at fresh-publish time).
        let ann_board   = announcements::create_board(ssu_id, package_id, ctx);
        let guest_board = guestbook::create_board(ssu_id, package_id, ctx);
        let wconfig     = widget_config::create_widget_config(ssu_id, package_id, ctx);
        let mut reg_obj = membership::create_member_registry(ssu_id, tribe_id, ctx);
        // Seed the SSU owner as ROLE_OWNER in their own registry. Without this the
        // owner is Stranger (0) and is locked out of every registry-gated flow
        // (e.g. quicktrade_vault::basket_deposit, Member-gated, no owner-cap bypass).
        membership::seed_owner_entry(&mut reg_obj, owner, clock);

        // Capture IDs before consuming objects via share (object::id takes &T).
        let ann_id     = object::id(&ann_board);
        let guest_id   = object::id(&guest_board);
        let wconfig_id = object::id(&wconfig);
        let reg_id     = object::id(&reg_obj);

        // Create QuicktradeVault (Issue 4: per-SSU bootstrap).
        let qvault = quicktrade_vault::create_vault(ssu_id, ctx);
        let qvault_id = object::id(&qvault);

        // V13 atomic-9 → V33 atomic-8 (MissionBoard removed): per-SSU WtbEscrowPool — closes the "Object 0x0 not found"
        // gap on force_close_shop_*. Pool stays empty in normal operation
        // (WTB escrow lives in Shop.escrowed_eve), but the residue refund step
        // in shop_moderation requires a real shared object reference.
        let pool = wtb_escrow_pool::create_pool(ssu_id, ctx);
        let pool_id = object::id(&pool);

        // Create SSUGovernance (passes all 6 per-SSU IDs into the struct + event).
        let gov = ssu_governance::create_ssu_governance(
            ssu_id,
            bazaar_type,
            tribe_id,
            owner,
            wconfig_id,
            reg_id,
            ann_id,
            guest_id,
            qvault_id,
            pool_id,
            clock,
            ctx,
        );

        // Create UserStorage + SSUOwnerCap.
        let storage = user_storage::create_storage(ssu_id, ctx);
        let cap = membership::create_ssu_owner_cap(ssu_id, tribe_id, ctx);

        // Share governance + storage via package-private share helpers
        // (these structs lack `store` so cannot use public_share_object — CC-002).
        ssu_governance::share(gov);
        user_storage::share(storage);

        // SharedWidgets boards have `key + store` so cross-module sharing
        // requires `public_share_object` (CC-003).
        transfer::public_share_object(ann_board);
        transfer::public_share_object(guest_board);
        transfer::public_share_object(wconfig);
        transfer::public_share_object(reg_obj);

        // Share QuicktradeVault (key only, no store — must use package-private share).
        quicktrade_vault::share(qvault);

        // Share WtbEscrowPool (key only, no store — package-private share helper).
        wtb_escrow_pool::share(pool);

        // Final state mutation: mark SSU as bootstrapped (idempotency guard, OS-54-followup sub-a).
        ssu_registry::mark_bootstrapped(registry, ssu_id);

        // Return the cap (caller transfers it or runs reclaim restore first).
        cap
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
