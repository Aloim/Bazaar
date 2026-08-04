// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

module bazaar_core::bazar_helpers {
    // Primitives-only helpers extracted from bazaar_core::bazar to keep
    // bazar.move under the 500-line ceiling (Article XIV.4).
    // INVARIANT: This module MUST NOT import from bazaar_core::bazar (or any
    // other bazaar_core module). All helpers operate exclusively on primitive
    // types (u8, u64, bool, vector, Option) and std:: types.
    //
    // Error code values numerically mirrored from bazar.move; Move identifies
    // aborts by value not name. (CC-010)

    use std::string::{Self, String};
    use std::option::{Self, Option};

    // ===== Mirrored Error Codes (CC-010) =====
    // Values MUST stay synchronized with bazar.move.
    const E_INVALID_BAZAAR_TYPE: u64 = 6;
    const E_TITLE_TOO_LONG: u64     = 1;
    const E_EMPTY_LISTINGS: u64     = 2;
    const E_LENGTH_MISMATCH: u64    = 7;
    const BAZAAR_TYPE_ADVANCED: u8  = 2;
    const TITLE_MAX: u64            = 20;

    /// Validates bazaar_type range, UTF-8 title byte length, and non-zero
    /// item count. Returns the decoded String title for use by callers.
    /// Aborts with E_INVALID_BAZAAR_TYPE, E_TITLE_TOO_LONG, E_EMPTY_LISTINGS.
    public(package) fun validate_shop_params(
        bazaar_type: u8,
        title_bytes: &vector<u8>,
        item_count: u64,
    ): String {
        assert!(bazaar_type <= BAZAAR_TYPE_ADVANCED, E_INVALID_BAZAAR_TYPE);
        let title = string::utf8(*title_bytes);
        assert!(string::length(&title) <= TITLE_MAX, E_TITLE_TOO_LONG);
        assert!(item_count > 0, E_EMPTY_LISTINGS);
        title
    }

    /// V25 — FREE-shop-specific validator. Skips the `item_count > 0` check
    /// because FREE shops may be coin-giveaway-only (caller enforces that
    /// EITHER items OR coin giveaway is non-empty — see bazar.move
    /// E_FREE_SHOP_EMPTY). Same bazaar_type + title checks as the universal
    /// validator.
    public(package) fun validate_free_shop_params(
        bazaar_type: u8,
        title_bytes: &vector<u8>,
    ): String {
        assert!(bazaar_type <= BAZAAR_TYPE_ADVANCED, E_INVALID_BAZAAR_TYPE);
        let title = string::utf8(*title_bytes);
        assert!(string::length(&title) <= TITLE_MAX, E_TITLE_TOO_LONG);
        title
    }

    /// Asserts that three vectors have equal length. Returns that length n.
    /// Used by build_listings in bazar.move to enforce type/qty/price alignment.
    /// Aborts with E_LENGTH_MISMATCH if any pair differs.
    public(package) fun validate_three_vector_lengths(
        a: &vector<u64>,
        b: &vector<u64>,
        c: &vector<u64>,
    ): u64 {
        let n = vector::length(a);
        assert!(n == vector::length(b), E_LENGTH_MISMATCH);
        assert!(n == vector::length(c), E_LENGTH_MISMATCH);
        n
    }

    /// Asserts that four vectors have equal length. Returns that length n.
    /// Used by build_pairs in bazar.move to enforce offer/request alignment.
    /// Aborts with E_LENGTH_MISMATCH if any pair differs.
    public(package) fun validate_four_vector_lengths(
        a: &vector<u64>,
        b: &vector<u64>,
        c: &vector<u64>,
        d: &vector<u64>,
    ): u64 {
        let n = vector::length(a);
        assert!(n == vector::length(b), E_LENGTH_MISMATCH);
        assert!(n == vector::length(c), E_LENGTH_MISMATCH);
        assert!(n == vector::length(d), E_LENGTH_MISMATCH);
        n
    }

    /// Asserts that five vectors have equal length. Returns that length n.
    /// Used by build_pairs (bundle-ratio DE model) to enforce offer/request/lot
    /// alignment. Aborts with E_LENGTH_MISMATCH if any differ.
    public(package) fun validate_five_vector_lengths(
        a: &vector<u64>,
        b: &vector<u64>,
        c: &vector<u64>,
        d: &vector<u64>,
        e: &vector<u64>,
    ): u64 {
        let n = vector::length(a);
        assert!(n == vector::length(b), E_LENGTH_MISMATCH);
        assert!(n == vector::length(c), E_LENGTH_MISMATCH);
        assert!(n == vector::length(d), E_LENGTH_MISMATCH);
        assert!(n == vector::length(e), E_LENGTH_MISMATCH);
        n
    }

    /// Pure limit comparison: given current shop count, a role-specific limit
    /// (0 = role has no configured limit), and an optional SSU-wide override,
    /// returns true if the caller is permitted to open another shop.
    /// Resolution order:
    ///   1. If role_limit > 0: enforced; ignore override.
    ///   2. Else if override_opt is Some: enforced.
    ///   3. Else: unlimited — returns true.
    public(package) fun check_shop_limit(
        current: u64,
        role_limit: u64,
        override_opt: &Option<u64>,
    ): bool {
        if (role_limit > 0) {
            current < role_limit
        } else if (option::is_some(override_opt)) {
            current < *option::borrow(override_opt)
        } else {
            true
        }
    }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
