// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V17: extracted from tribe_registry.move to keep the registry under the
// 500-line ceiling. Houses the token-identity validators called by
// create_advanced_tribe (and indirectly by create_tribe_internal).
// FE-side validation in AdvancedBazaarCreation.tsx mirrors these checks
// for friendly errors before submission; Move is the trust boundary.
module dapp_hub::tribe_token_validation {

    // ===== Error Codes =====
    const E_TOKEN_NAME_EMPTY:         u64 = 1;
    const E_TOKEN_NAME_TOO_LONG:      u64 = 2;
    const E_TOKEN_SYMBOL_EMPTY:       u64 = 3;
    const E_TOKEN_SYMBOL_TOO_LONG:    u64 = 4;
    const E_TOKEN_SYMBOL_INVALID_CHAR: u64 = 5;

    // ===== Bounds (match FE form constraints in AdvancedBazaarCreation.tsx) =====
    const MAX_TOKEN_NAME_BYTES:   u64 = 32;
    const MAX_TOKEN_SYMBOL_BYTES: u64 = 8;

    /// Aborts if the bytes vector is empty or longer than 32 UTF-8 bytes.
    public fun assert_valid_token_name(name: &vector<u8>) {
        assert!(!vector::is_empty(name), E_TOKEN_NAME_EMPTY);
        assert!(vector::length(name) <= MAX_TOKEN_NAME_BYTES, E_TOKEN_NAME_TOO_LONG);
    }

    /// Aborts if empty, longer than 8 bytes, or contains any byte that is
    /// not an uppercase ASCII letter [A-Z] (0x41-0x5A) or digit [0-9] (0x30-0x39).
    public fun assert_valid_token_symbol(symbol: &vector<u8>) {
        assert!(!vector::is_empty(symbol), E_TOKEN_SYMBOL_EMPTY);
        let len = vector::length(symbol);
        assert!(len <= MAX_TOKEN_SYMBOL_BYTES, E_TOKEN_SYMBOL_TOO_LONG);
        let mut i = 0;
        while (i < len) {
            let b = *vector::borrow(symbol, i);
            let is_digit = b >= 0x30 && b <= 0x39;
            let is_upper = b >= 0x41 && b <= 0x5A;
            assert!(is_digit || is_upper, E_TOKEN_SYMBOL_INVALID_CHAR);
            i = i + 1;
        };
    }

    // ===== Test-Only Error Accessors =====
    #[test_only] public fun e_token_name_empty(): u64         { E_TOKEN_NAME_EMPTY }
    #[test_only] public fun e_token_name_too_long(): u64      { E_TOKEN_NAME_TOO_LONG }
    #[test_only] public fun e_token_symbol_empty(): u64       { E_TOKEN_SYMBOL_EMPTY }
    #[test_only] public fun e_token_symbol_too_long(): u64    { E_TOKEN_SYMBOL_TOO_LONG }
    #[test_only] public fun e_token_symbol_invalid_char(): u64 { E_TOKEN_SYMBOL_INVALID_CHAR }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
