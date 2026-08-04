// MAX 500 LINES — DO NOT EXCEED
//
// R5.2: Bazaar-type gate helpers (u8 form to avoid circular deps).
//
// Asserts take `bazaar_type: u8` directly. Callers extract bazaar_type from
// SSUGovernance (via ssu_bazaar_type accessor) or TribeGovernance (via
// tribe_bazaar_type accessor) — OR access the field directly when within
// the same module. This avoids importing governance types into the assertions
// module, which would create circular use dependencies (bazaar_assertions
// imports tribe_governance ↔ tribe_governance imports bazaar_assertions).
//
// Closes OS-17 (R4-to-R5 BazaarEconomy assert window).
//
// public(package) intra-bazaar_core helpers + public *_external wrappers
// for cross-package BazaarEconomy callers (Constitution Article I.4).
//
// Article I.3: BazaarCore::bazaar_assertions has zero dependencies on other
// bazaar_core modules — pure type-tag arithmetic on u8.

module bazaar_core::bazaar_assertions {
    // ===== Error codes =====

    const E_NOT_ADVANCED_BAZAAR: u64 = 1;
    const E_NOT_EASY_OR_ADVANCED_BAZAAR: u64 = 2;
    const E_BAZAAR_TYPE_MISMATCH: u64 = 3;

    // ===== Bazaar type constants =====
    // Mirrors DappHub::ssu_registry NoTribe=0, Easy=1, Advanced=2.

    const BAZAAR_TYPE_NOTRIBE: u8 = 0;
    const BAZAAR_TYPE_EASY: u8 = 1;
    const BAZAAR_TYPE_ADVANCED: u8 = 2;

    public fun type_notribe(): u8 { BAZAAR_TYPE_NOTRIBE }
    public fun type_easy(): u8 { BAZAAR_TYPE_EASY }
    public fun type_advanced(): u8 { BAZAAR_TYPE_ADVANCED }

    // ===== Assert helpers =====
    // Take bazaar_type as u8 directly. Caller is responsible for extracting it
    // from the appropriate governance object (ssu_bazaar_type/tribe_bazaar_type
    // accessors) OR from a struct's private field if calling from within the
    // governance module itself.

    public(package) fun assert_advanced(bazaar_type: u8) {
        assert!(bazaar_type == BAZAAR_TYPE_ADVANCED, E_NOT_ADVANCED_BAZAAR);
    }

    public(package) fun assert_easy_or_advanced(bazaar_type: u8) {
        assert!(
            bazaar_type == BAZAAR_TYPE_EASY || bazaar_type == BAZAAR_TYPE_ADVANCED,
            E_NOT_EASY_OR_ADVANCED_BAZAAR,
        );
    }

    public(package) fun assert_bazaar_type(bazaar_type: u8, expected: u8) {
        assert!(bazaar_type == expected, E_BAZAAR_TYPE_MISMATCH);
    }

    // ===== Cross-package wrappers (Constitution Article I.4) =====

    public fun assert_advanced_external(bazaar_type: u8) {
        assert_advanced(bazaar_type);
    }

    public fun assert_easy_or_advanced_external(bazaar_type: u8) {
        assert_easy_or_advanced(bazaar_type);
    }

    public fun assert_bazaar_type_external(bazaar_type: u8, expected: u8) {
        assert_bazaar_type(bazaar_type, expected);
    }

    // ===== Test-only error code accessors =====

    #[test_only]
    public fun e_not_advanced_bazaar(): u64 { E_NOT_ADVANCED_BAZAAR }

    #[test_only]
    public fun e_not_easy_or_advanced_bazaar(): u64 { E_NOT_EASY_OR_ADVANCED_BAZAAR }

    #[test_only]
    public fun e_bazaar_type_mismatch(): u64 { E_BAZAAR_TYPE_MISMATCH }
}
// MAX 500 LINES — DO NOT EXCEED (this comment must remain at end of file)
