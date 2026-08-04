// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
//
// R5.2 refactor: tests now use u8 directly (no governance object construction).
// Eliminates SSU/Tribe governance dependency from the assertions test module.

#[test_only]
module bazaar_core::bazaar_assertions_tests {
    use bazaar_core::bazaar_assertions;

    // ===== assert_advanced =====

    #[test]
    fun test_assert_advanced_accepts_advanced() {
        bazaar_assertions::assert_advanced(bazaar_assertions::type_advanced());
    }

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_assert_advanced_rejects_easy() {
        bazaar_assertions::assert_advanced(bazaar_assertions::type_easy());
    }

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_ADVANCED_BAZAAR)]
    fun test_assert_advanced_rejects_notribe() {
        bazaar_assertions::assert_advanced(bazaar_assertions::type_notribe());
    }

    // ===== assert_easy_or_advanced =====

    #[test]
    fun test_assert_easy_or_advanced_accepts_easy() {
        bazaar_assertions::assert_easy_or_advanced(bazaar_assertions::type_easy());
    }

    #[test]
    fun test_assert_easy_or_advanced_accepts_advanced() {
        bazaar_assertions::assert_easy_or_advanced(bazaar_assertions::type_advanced());
    }

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_NOT_EASY_OR_ADVANCED_BAZAAR)]
    fun test_assert_easy_or_advanced_rejects_notribe() {
        bazaar_assertions::assert_easy_or_advanced(bazaar_assertions::type_notribe());
    }

    // ===== assert_bazaar_type =====

    #[test]
    fun test_assert_bazaar_type_matches() {
        bazaar_assertions::assert_bazaar_type(bazaar_assertions::type_easy(), bazaar_assertions::type_easy());
    }

    #[test]
    #[expected_failure(abort_code = bazaar_core::bazaar_assertions::E_BAZAAR_TYPE_MISMATCH)]
    fun test_assert_bazaar_type_mismatch_aborts() {
        bazaar_assertions::assert_bazaar_type(bazaar_assertions::type_easy(), bazaar_assertions::type_advanced());
    }

    // ===== type constant accessors =====

    #[test]
    fun test_type_constants_correct() {
        assert!(bazaar_assertions::type_notribe() == 0, 0);
        assert!(bazaar_assertions::type_easy() == 1, 1);
        assert!(bazaar_assertions::type_advanced() == 2, 2);
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
