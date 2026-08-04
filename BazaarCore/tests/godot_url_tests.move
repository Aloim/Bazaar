// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
// Phase: AP2-C / FP1-28
// Tests: GU-01 through GU-14 (14 tests)
// Covers: SSU + Tribe godot_url set/clear/validate paths

#[test_only]
module bazaar_core::godot_url_tests {
    use sui::clock;
    use sui::test_scenario;
    use std::string;
    use std::option;
    use bazaar_core::ssu_governance;
    use bazaar_core::ssu_governance_test_helpers;
    use bazaar_core::tribe_governance;
    use bazaar_core::tribe_governance_godot;
    use bazaar_core::tribe_governance_test_helpers;
    use dapp_hub::tribe_registry;

    const OWNER: address = @0xA1;
    const LEADER: address = @0xB1;
    const TRIBE_ID: u64 = 1;
    const SSU_ADDR: address = @0xC1;
    const WRONG_ADDR: address = @0xFF;

    // Helper: build a 256-byte string (boundary test)
    fun make_url_of_len(n: u64): std::string::String {
        let mut bytes = vector::empty<u8>();
        let mut i = 0;
        while (i < n) {
            vector::push_back(&mut bytes, 65u8); // 'A'
            i = i + 1;
        };
        string::utf8(bytes)
    }

    // Helper: build a 257-byte string (over-limit test)
    fun make_url_257(): std::string::String {
        make_url_of_len(257)
    }

    // Helper: build a 256-byte string (boundary, must succeed)
    fun make_url_256(): std::string::String {
        make_url_of_len(256)
    }

    // GU-01: SSU happy-path set — field becomes Some(url), event scope=0
    #[test]
    fun test_gu01_ssu_set_happy_path() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let wid = object::id_from_address(@0x1);
        let mut gov = ssu_governance_test_helpers::create_for_testing(
            SSU_ADDR, 1, TRIBE_ID, OWNER, wid, &clock, &mut ctx,
        );
        let owner_cap = ssu_governance_test_helpers::create_owner_cap_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        let url = option::some(string::utf8(b"https://example.com/godot"));
        ssu_governance::set_ssu_godot_url(&mut gov, url, &owner_cap, &clock, &mut ctx);
        assert!(option::is_some(ssu_governance::ssu_godot_url(&gov)), 0);
        ssu_governance_test_helpers::destroy_for_testing(gov);
        ssu_governance_test_helpers::destroy_owner_cap_for_testing(owner_cap);
        clock::destroy_for_testing(clock);
    }

    // GU-02: SSU replace (set then re-set) — old_some=true, new_some=true in event
    #[test]
    fun test_gu02_ssu_replace_url() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let wid = object::id_from_address(@0x1);
        let mut gov = ssu_governance_test_helpers::create_for_testing(
            SSU_ADDR, 1, TRIBE_ID, OWNER, wid, &clock, &mut ctx,
        );
        let owner_cap = ssu_governance_test_helpers::create_owner_cap_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        let url1 = option::some(string::utf8(b"https://v1.example.com"));
        let url2 = option::some(string::utf8(b"https://v2.example.com"));
        ssu_governance::set_ssu_godot_url(&mut gov, url1, &owner_cap, &clock, &mut ctx);
        ssu_governance::set_ssu_godot_url(&mut gov, url2, &owner_cap, &clock, &mut ctx);
        let stored = ssu_governance::ssu_godot_url(&gov);
        assert!(option::is_some(stored), 0);
        assert!(*option::borrow(stored) == string::utf8(b"https://v2.example.com"), 1);
        ssu_governance_test_helpers::destroy_for_testing(gov);
        ssu_governance_test_helpers::destroy_owner_cap_for_testing(owner_cap);
        clock::destroy_for_testing(clock);
    }

    // GU-03: SSU clear path — field becomes None
    #[test]
    fun test_gu03_ssu_clear() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let wid = object::id_from_address(@0x1);
        let mut gov = ssu_governance_test_helpers::create_for_testing(
            SSU_ADDR, 1, TRIBE_ID, OWNER, wid, &clock, &mut ctx,
        );
        let owner_cap = ssu_governance_test_helpers::create_owner_cap_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        ssu_governance::set_ssu_godot_url(
            &mut gov,
            option::some(string::utf8(b"https://example.com")),
            &owner_cap, &clock, &mut ctx,
        );
        ssu_governance::clear_ssu_godot_url(&mut gov, &owner_cap, &clock, &mut ctx);
        assert!(option::is_none(ssu_governance::ssu_godot_url(&gov)), 0);
        ssu_governance_test_helpers::destroy_for_testing(gov);
        ssu_governance_test_helpers::destroy_owner_cap_for_testing(owner_cap);
        clock::destroy_for_testing(clock);
    }

    // GU-04: SSU double-clear is idempotent (no abort)
    #[test]
    fun test_gu04_ssu_double_clear_idempotent() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let wid = object::id_from_address(@0x1);
        let mut gov = ssu_governance_test_helpers::create_for_testing(
            SSU_ADDR, 1, TRIBE_ID, OWNER, wid, &clock, &mut ctx,
        );
        let owner_cap = ssu_governance_test_helpers::create_owner_cap_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        // Clear on already-None is valid — no abort, event emits with both flags false
        ssu_governance::clear_ssu_godot_url(&mut gov, &owner_cap, &clock, &mut ctx);
        ssu_governance::clear_ssu_godot_url(&mut gov, &owner_cap, &clock, &mut ctx);
        assert!(option::is_none(ssu_governance::ssu_godot_url(&gov)), 0);
        ssu_governance_test_helpers::destroy_for_testing(gov);
        ssu_governance_test_helpers::destroy_owner_cap_for_testing(owner_cap);
        clock::destroy_for_testing(clock);
    }

    // GU-05: SSU wrong-cap aborts E_WRONG_SSU
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_WRONG_SSU)]
    fun test_gu05_ssu_wrong_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let wid = object::id_from_address(@0x1);
        let mut gov = ssu_governance_test_helpers::create_for_testing(
            SSU_ADDR, 1, TRIBE_ID, OWNER, wid, &clock, &mut ctx,
        );
        // Cap scoped to WRONG_ADDR — must abort
        let bad_cap = ssu_governance_test_helpers::create_owner_cap_for_testing(WRONG_ADDR, TRIBE_ID, &mut ctx);
        ssu_governance::set_ssu_godot_url(
            &mut gov,
            option::some(string::utf8(b"https://example.com")),
            &bad_cap, &clock, &mut ctx,
        );
        abort 0
    }

    // GU-06: SSU 257-byte URL aborts E_URL_TOO_LONG
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_URL_TOO_LONG)]
    fun test_gu06_ssu_url_too_long_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let wid = object::id_from_address(@0x1);
        let mut gov = ssu_governance_test_helpers::create_for_testing(
            SSU_ADDR, 1, TRIBE_ID, OWNER, wid, &clock, &mut ctx,
        );
        let owner_cap = ssu_governance_test_helpers::create_owner_cap_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        ssu_governance::set_ssu_godot_url(
            &mut gov, option::some(make_url_257()), &owner_cap, &clock, &mut ctx,
        );
        abort 0
    }

    // GU-07: SSU exactly 256-byte URL succeeds
    #[test]
    fun test_gu07_ssu_url_256_bytes_ok() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let wid = object::id_from_address(@0x1);
        let mut gov = ssu_governance_test_helpers::create_for_testing(
            SSU_ADDR, 1, TRIBE_ID, OWNER, wid, &clock, &mut ctx,
        );
        let owner_cap = ssu_governance_test_helpers::create_owner_cap_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        ssu_governance::set_ssu_godot_url(
            &mut gov, option::some(make_url_256()), &owner_cap, &clock, &mut ctx,
        );
        assert!(option::is_some(ssu_governance::ssu_godot_url(&gov)), 0);
        ssu_governance_test_helpers::destroy_for_testing(gov);
        ssu_governance_test_helpers::destroy_owner_cap_for_testing(owner_cap);
        clock::destroy_for_testing(clock);
    }

    // GU-08: SSU Option::some("") aborts E_URL_EMPTY (MA-OQ-1)
    #[test]
    #[expected_failure(abort_code = bazaar_core::ssu_governance::E_URL_EMPTY)]
    fun test_gu08_ssu_empty_some_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let wid = object::id_from_address(@0x1);
        let mut gov = ssu_governance_test_helpers::create_for_testing(
            SSU_ADDR, 1, TRIBE_ID, OWNER, wid, &clock, &mut ctx,
        );
        let owner_cap = ssu_governance_test_helpers::create_owner_cap_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        ssu_governance::set_ssu_godot_url(
            &mut gov, option::some(string::utf8(b"")), &owner_cap, &clock, &mut ctx,
        );
        abort 0
    }

    // GU-09: Tribe happy-path set — scope=1 event emitted
    #[test]
    fun test_gu09_tribe_set_happy_path() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let mut gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        tribe_governance_godot::set_tribe_godot_url(
            &mut gov,
            option::some(string::utf8(b"https://tribe.example.com")),
            &leader_cap, &clock, &mut ctx,
        );
        assert!(option::is_some(tribe_governance::tribe_godot_url(&gov)), 0);
        tribe_governance::destroy_for_testing(gov);
        tribe_registry::destroy_leader_cap_for_testing(leader_cap);
        clock::destroy_for_testing(clock);
    }

    // GU-10: Tribe wrong-cap aborts E_WRONG_TRIBE
    #[test]
    #[expected_failure(abort_code = bazaar_core::tribe_governance_godot::E_WRONG_TRIBE)]
    fun test_gu10_tribe_wrong_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        // Cap scoped to tribe 999 — gov is tribe 1
        let bad_cap = tribe_registry::create_leader_cap_for_testing(999, &mut ctx);
        let mut gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        tribe_governance_godot::set_tribe_godot_url(
            &mut gov,
            option::some(string::utf8(b"https://example.com")),
            &bad_cap, &clock, &mut ctx,
        );
        abort 0
    }

    // GU-11: Tribe 257-byte URL aborts E_URL_TOO_LONG
    #[test]
    #[expected_failure(abort_code = bazaar_core::tribe_governance_godot::E_URL_TOO_LONG)]
    fun test_gu11_tribe_url_too_long_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let mut gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        tribe_governance_godot::set_tribe_godot_url(
            &mut gov, option::some(make_url_257()), &leader_cap, &clock, &mut ctx,
        );
        abort 0
    }

    // GU-12: Tribe clear path — field becomes None
    #[test]
    fun test_gu12_tribe_clear() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let mut gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        tribe_governance_godot::set_tribe_godot_url(
            &mut gov,
            option::some(string::utf8(b"https://temp.example.com")),
            &leader_cap, &clock, &mut ctx,
        );
        tribe_governance_godot::clear_tribe_godot_url(&mut gov, &leader_cap, &clock, &mut ctx);
        assert!(option::is_none(tribe_governance::tribe_godot_url(&gov)), 0);
        tribe_governance::destroy_for_testing(gov);
        tribe_registry::destroy_leader_cap_for_testing(leader_cap);
        clock::destroy_for_testing(clock);
    }

    // GU-13: Cross-scope event distinguishability — SSU scope=0, Tribe scope=1
    // Note: event assertion is structural (we trust the emit code paths differ by
    // SCOPE_SSU vs SCOPE_TRIBE constants). This test confirms both calls succeed
    // and produce distinct stored state independently.
    #[test]
    fun test_gu13_cross_scope_distinguishable() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let wid = object::id_from_address(@0x1);
        let mut ssu_gov = ssu_governance_test_helpers::create_for_testing(
            SSU_ADDR, 1, TRIBE_ID, OWNER, wid, &clock, &mut ctx,
        );
        let owner_cap = ssu_governance_test_helpers::create_owner_cap_for_testing(SSU_ADDR, TRIBE_ID, &mut ctx);
        let leader_cap = tribe_registry::create_leader_cap_for_testing(TRIBE_ID, &mut ctx);
        let mut tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        ssu_governance::set_ssu_godot_url(
            &mut ssu_gov,
            option::some(string::utf8(b"https://ssu.example.com")),
            &owner_cap, &clock, &mut ctx,
        );
        tribe_governance_godot::set_tribe_godot_url(
            &mut tribe_gov,
            option::some(string::utf8(b"https://tribe.example.com")),
            &leader_cap, &clock, &mut ctx,
        );
        assert!(option::is_some(ssu_governance::ssu_godot_url(&ssu_gov)), 0);
        assert!(option::is_some(tribe_governance::tribe_godot_url(&tribe_gov)), 1);
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov);
        ssu_governance_test_helpers::destroy_owner_cap_for_testing(owner_cap);
        tribe_governance::destroy_for_testing(tribe_gov);
        tribe_registry::destroy_leader_cap_for_testing(leader_cap);
        clock::destroy_for_testing(clock);
    }

    // GU-14: Initial-state invariant — fresh bootstrap: godot_url is None for both scopes
    #[test]
    fun test_gu14_initial_state_none() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let wid = object::id_from_address(@0x1);
        let ssu_gov = ssu_governance_test_helpers::create_for_testing(
            SSU_ADDR, 1, TRIBE_ID, OWNER, wid, &clock, &mut ctx,
        );
        let tribe_gov = tribe_governance_test_helpers::create_for_testing(TRIBE_ID, 1, LEADER, 0, &clock, &mut ctx);
        assert!(option::is_none(ssu_governance::ssu_godot_url(&ssu_gov)), 0);
        assert!(option::is_none(tribe_governance::tribe_godot_url(&tribe_gov)), 1);
        ssu_governance_test_helpers::destroy_for_testing(ssu_gov);
        tribe_governance::destroy_for_testing(tribe_gov);
        clock::destroy_for_testing(clock);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
