// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ssu-receiving-frozen-error.test.ts — guards isExtensionConfigFrozenError, the
 * predicate that lets the registration overlays catch the EVE-Frontier world
 * abort `EExtensionConfigFrozen` (from storage_unit::authorize_extension) and
 * retry register+bootstrap WITHOUT the bundled, now-redundant authorize step.
 *
 * Must MATCH the world extension freeze (any casing / truncation the wallet
 * surfaces) and must NOT match the Bazaar's own E_SSU_FROZEN commerce freeze.
 */

import { describe, it, expect } from "vitest";
import { isExtensionConfigFrozenError } from "../bazaarcore/ssu-receiving-tx";

describe("isExtensionConfigFrozenError", () => {
  it("matches the literal world abort name (the real wallet message)", () => {
    const e = new Error(
      'code 32603 message "Transaction Resolution failed" MoveAbort in 5th command, ' +
        "EExtensionConfigFrozen: extension configuration is frozen in " +
        "0x28b497559d65ab320d9da4613bf2498d::storage_unit::authorize_extension (line 124)",
    );
    expect(isExtensionConfigFrozenError(e)).toBe(true);
  });

  it("matches case-insensitively and on the truncated module form", () => {
    expect(isExtensionConfigFrozenError(new Error("eextensionconfigfrozen"))).toBe(true);
    expect(
      isExtensionConfigFrozenError("Move abort: frozen in 0xabc::storage_unit::authorize"),
    ).toBe(true);
  });

  it("accepts a plain string as well as an Error", () => {
    expect(isExtensionConfigFrozenError("ExtensionConfigFrozen")).toBe(true);
  });

  it("does NOT match the Bazaar's own E_SSU_FROZEN commerce freeze", () => {
    // bazaar_core freeze aborts in bazaar_core modules, never world storage_unit.
    expect(
      isExtensionConfigFrozenError(new Error("MoveAbort E_SSU_FROZEN in ssu_governance::assert_not_frozen")),
    ).toBe(false);
  });

  it("does NOT match unrelated errors / nullish input", () => {
    expect(isExtensionConfigFrozenError(new Error("CommandArgumentError ArgumentWithoutValue"))).toBe(false);
    expect(isExtensionConfigFrozenError(undefined)).toBe(false);
    expect(isExtensionConfigFrozenError(null)).toBe(false);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
