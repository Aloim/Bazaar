// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// OS-21 closure — 9 tests (BA-01..09)
// Covers: assert_advanced_external × {NoTribe reject, Easy reject, Advanced accept},
//         assert_easy_or_advanced_external × {NoTribe reject, Easy accept, Advanced accept},
//         assert_bazaar_type_external × {match accept, mismatch abort},
//         error-code-accessor sentinel test.
// Reference: OverhaulStubFixPlan.md §4 R6.6.2
// Reference: TA-overhaul-r6.6-stub-fix-tests.md §BA-01..09

#[test_only]
module bazaar_core::bazaar_assertions_negative_tests {
    use bazaar_core::bazaar_assertions;

    // ===== BA-01: assert_advanced_external rejects NoTribe =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun ba01_assert_advanced_external_rejects_notribe() {
        bazaar_assertions::assert_advanced_external(bazaar_assertions::type_notribe());
    }

    // ===== BA-02: assert_advanced_external rejects Easy =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun ba02_assert_advanced_external_rejects_easy() {
        bazaar_assertions::assert_advanced_external(bazaar_assertions::type_easy());
    }

    // ===== BA-03: assert_advanced_external accepts Advanced =====

    #[test]
    fun ba03_assert_advanced_external_accepts_advanced() {
        bazaar_assertions::assert_advanced_external(bazaar_assertions::type_advanced());
    }

    // ===== BA-04: assert_easy_or_advanced_external rejects NoTribe =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_EASY_OR_ADVANCED_BAZAAR)]
    fun ba04_assert_easy_or_advanced_external_rejects_notribe() {
        bazaar_assertions::assert_easy_or_advanced_external(bazaar_assertions::type_notribe());
    }

    // ===== BA-05: assert_easy_or_advanced_external accepts Easy =====

    #[test]
    fun ba05_assert_easy_or_advanced_external_accepts_easy() {
        bazaar_assertions::assert_easy_or_advanced_external(bazaar_assertions::type_easy());
    }

    // ===== BA-06: assert_easy_or_advanced_external accepts Advanced =====

    #[test]
    fun ba06_assert_easy_or_advanced_external_accepts_advanced() {
        bazaar_assertions::assert_easy_or_advanced_external(bazaar_assertions::type_advanced());
    }

    // ===== BA-07: assert_bazaar_type_external match succeeds =====

    #[test]
    fun ba07_assert_bazaar_type_external_match_succeeds() {
        bazaar_assertions::assert_bazaar_type_external(
            bazaar_assertions::type_easy(),
            bazaar_assertions::type_easy(),
        );
    }

    // ===== BA-08: assert_bazaar_type_external mismatch aborts =====

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_BAZAAR_TYPE_MISMATCH)]
    fun ba08_assert_bazaar_type_external_mismatch_aborts() {
        bazaar_assertions::assert_bazaar_type_external(
            bazaar_assertions::type_easy(),
            bazaar_assertions::type_advanced(),
        );
    }

    // ===== BA-09: error-code accessor sentinel =====
    // Locks error-code values against accidental renumbering. Constitution Article XI.

    #[test]
    fun ba09_error_code_accessors_correct() {
        assert!(bazaar_assertions::e_not_advanced_bazaar() == 1, 0);
        assert!(bazaar_assertions::e_not_easy_or_advanced_bazaar() == 2, 1);
        assert!(bazaar_assertions::e_bazaar_type_mismatch() == 3, 2);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
