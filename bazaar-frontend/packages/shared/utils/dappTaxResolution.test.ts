// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * dappTaxResolution.test.ts — Phase 5 per-type DApp tax rate resolution tests.
 *
 * Tests for resolveDAppTaxBps from dappTaxResolution.ts.
 * Covers: unset → global fallback, Some → explicit value, Some(0) → exempt (NOT global),
 * NoTribe vs Easy field selection, excludeDapp suppression.
 * Phase 8 (AUD-NT-16/ET-03): DE is no longer suppressed — Move carves the DApp
 * share out of the DE flats, so DE resolves the same per-type rate.
 */

import { describe, it, expect } from "vitest";
import { resolveDAppTaxBps } from "./dappTaxResolution";
import type { DAppTaxConfig } from "../types";

function cfg(overrides: Partial<DAppTaxConfig>): DAppTaxConfig {
  return {
    globalTaxBps: 200,
    notribeDappBps: null,
    easyDappBps: null,
    advancedExchangeDappBps: null,
    ...overrides,
  };
}

describe("resolveDAppTaxBps — layer suppression", () => {
  it("DE resolves the per-type rate (AUD-NT-16: the carve is real, not 0)", () => {
    expect(resolveDAppTaxBps({ kind: "de", excludeDapp: false, tribeId: 0, config: cfg({}) })).toBe(200);
    expect(resolveDAppTaxBps({ kind: "de", excludeDapp: false, tribeId: 0, config: cfg({ notribeDappBps: 300 }) })).toBe(300);
    expect(resolveDAppTaxBps({ kind: "de", excludeDapp: false, tribeId: 5, config: cfg({ easyDappBps: 150 }) })).toBe(150);
  });

  it("returns 0 for DE only when excludeDapp (Advanced token-side DE)", () => {
    expect(resolveDAppTaxBps({ kind: "de", excludeDapp: true, tribeId: 5, config: cfg({ easyDappBps: 400 }) })).toBe(0);
  });

  it("returns 0 when excludeDapp is true (Advanced wts/wtb)", () => {
    expect(resolveDAppTaxBps({ kind: "wts", excludeDapp: true, tribeId: 5, config: cfg({ easyDappBps: 400 }) })).toBe(0);
  });

  it("returns 0 when config is null/undefined (loading state)", () => {
    expect(resolveDAppTaxBps({ kind: "wts", excludeDapp: false, tribeId: 0, config: null })).toBe(0);
    expect(resolveDAppTaxBps({ kind: "wtb", excludeDapp: false, tribeId: 5, config: undefined })).toBe(0);
  });
});

describe("resolveDAppTaxBps — NoTribe (tribeId===0)", () => {
  it("unset notribeDappBps → falls back to globalTaxBps", () => {
    expect(resolveDAppTaxBps({ kind: "wts", excludeDapp: false, tribeId: 0, config: cfg({ notribeDappBps: null }) })).toBe(200);
  });

  it("Some(notribeDappBps) → returns that value", () => {
    expect(resolveDAppTaxBps({ kind: "wts", excludeDapp: false, tribeId: 0, config: cfg({ notribeDappBps: 350 }) })).toBe(350);
  });

  it("Some(0) → exempt (0), NOT global (200)", () => {
    expect(resolveDAppTaxBps({ kind: "wts", excludeDapp: false, tribeId: 0, config: cfg({ notribeDappBps: 0 }) })).toBe(0);
  });

  it("does NOT use easyDappBps for NoTribe", () => {
    expect(resolveDAppTaxBps({
      kind: "wts", excludeDapp: false, tribeId: 0,
      config: cfg({ notribeDappBps: null, easyDappBps: 400 }),
    })).toBe(200); // falls to global, NOT easy
  });
});

describe("resolveDAppTaxBps — Easy/tribe (tribeId>0)", () => {
  it("unset easyDappBps → falls back to globalTaxBps", () => {
    expect(resolveDAppTaxBps({ kind: "wts", excludeDapp: false, tribeId: 7, config: cfg({ easyDappBps: null }) })).toBe(200);
  });

  it("Some(easyDappBps) → returns that value", () => {
    expect(resolveDAppTaxBps({ kind: "wtb", excludeDapp: false, tribeId: 3, config: cfg({ easyDappBps: 150 }) })).toBe(150);
  });

  it("Some(0) → exempt (0), NOT global (200)", () => {
    expect(resolveDAppTaxBps({ kind: "wtb", excludeDapp: false, tribeId: 1, config: cfg({ easyDappBps: 0 }) })).toBe(0);
  });

  it("does NOT use notribeDappBps for Easy tribe", () => {
    expect(resolveDAppTaxBps({
      kind: "wts", excludeDapp: false, tribeId: 5,
      config: cfg({ notribeDappBps: 300, easyDappBps: null }),
    })).toBe(200); // falls to global, NOT notribe
  });
});

describe("resolveDAppTaxBps — V35 compat (all per-type fields null)", () => {
  it("V35 config (all null) always returns globalTaxBps for wts/wtb", () => {
    const v35cfg = cfg({ notribeDappBps: null, easyDappBps: null, advancedExchangeDappBps: null });
    expect(resolveDAppTaxBps({ kind: "wts", excludeDapp: false, tribeId: 0, config: v35cfg })).toBe(200);
    expect(resolveDAppTaxBps({ kind: "wtb", excludeDapp: false, tribeId: 9, config: v35cfg })).toBe(200);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
