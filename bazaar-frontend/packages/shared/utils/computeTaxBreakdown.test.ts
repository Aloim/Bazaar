// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * computeTaxBreakdown.test.ts — Phase 8 Wave A1 (AUD-NT-07/NT-16/NT-17, ET-02/ET-03/ET-24).
 *
 * Pure-math tests for computeTaxBreakdownBps + computeTaxBreakdownFlat.
 * The flat (DE) cases encode the Move shop_ops_de carve semantics: the DApp
 * share is carved OUT of the SSU/Tribe flats (payer total unchanged) with
 * PER-LAYER floors — the test that would have caught AUD-NT-16 (FE showed
 * DApp = 0 and over-stated the SSU net).
 */

import { describe, it, expect } from "vitest";
import { computeTaxBreakdownBps, computeTaxBreakdownFlat } from "./computeTaxBreakdown";

describe("computeTaxBreakdownBps — single-step floor semantics", () => {
  it("computes the total with one floor over the summed bps", () => {
    const b = computeTaxBreakdownBps(1_000_000, 525, 200, 200);
    expect(b.totalBps).toBe(925);
    expect(b.totalAmount).toBe(Math.floor((1_000_000 * 925) / 10_000));
    expect(b.net).toBe(1_000_000 - b.totalAmount);
  });

  it("per-layer floors are sub-additive by at most N-1 mist", () => {
    const gross = 333_333;
    const b = computeTaxBreakdownBps(gross, 333, 333, 333);
    const layerSum = b.ssuTax + b.tribeTax + b.dappTax;
    expect(layerSum).toBeLessThanOrEqual(b.totalAmount);
    expect(b.totalAmount - layerSum).toBeLessThanOrEqual(2);
  });

  it("zero gross / zero bps stay zero", () => {
    expect(computeTaxBreakdownBps(0, 525, 200, 200).totalAmount).toBe(0);
    expect(computeTaxBreakdownBps(1_000_000, 0, 0, 0).totalAmount).toBe(0);
  });
});

describe("computeTaxBreakdownFlat — DE carve semantics (AUD-NT-16/ET-03)", () => {
  it("payer total is the gross flats — the DApp carve never inflates it", () => {
    const f = computeTaxBreakdownFlat(2, 1_000_000, 500_000, 200);
    expect(f.totalAmount).toBe(2 * (1_000_000 + 500_000));
    expect(f.ssuAmount + f.tribeAmount + f.dappAmount).toBe(f.totalAmount);
  });

  it("NoTribe DE: DApp share carved from the SSU flat (the AUD-NT-16 catch)", () => {
    // 1 unit, 1 EVE flat, 2% dapp: dapp = 20_000_000 mist carved out of the SSU share.
    const f = computeTaxBreakdownFlat(1, 1_000_000_000, 0, 200);
    expect(f.dappAmount).toBe(20_000_000);          // NOT 0 — the old FE hid this
    expect(f.ssuAmount).toBe(980_000_000);          // NOT the full flat — net of carve
    expect(f.tribeAmount).toBe(0);
    expect(f.totalAmount).toBe(1_000_000_000);      // payer pays the flat, unchanged
  });

  it("Easy DE: per-layer floors (mirrors the post-V36 ET-02 rounding fix)", () => {
    // Odd flats so combined-floor vs per-layer floors would differ.
    const ssu = 333; const tribe = 333; const bps = 100; // 1%
    const f = computeTaxBreakdownFlat(1, ssu, tribe, bps);
    const dappFromSsu = Math.floor((ssu * bps) / 10_000);
    const dappFromTribe = Math.floor((tribe * bps) / 10_000);
    expect(f.dappAmount).toBe(dappFromSsu + dappFromTribe);
    expect(f.ssuAmount).toBe(ssu - dappFromSsu);
    expect(f.tribeAmount).toBe(tribe - dappFromTribe);
    // The three splits can never sum above the payment (the ET-02 abort class).
    expect(f.ssuAmount + f.tribeAmount + f.dappAmount).toBeLessThanOrEqual(ssu + tribe);
  });

  it("Easy DE payment sizing includes the tribe flat (the AUD-ET-01 catch)", () => {
    // The payer-funded total MUST cover ssu+tribe; an SSU-only coin under-funds it.
    const f = computeTaxBreakdownFlat(3, 200_000, 50_000, 0);
    expect(f.totalAmount).toBe(3 * 250_000);
    expect(f.totalAmount).toBeGreaterThan(3 * 200_000);
  });

  it("dappBps omitted → legacy behavior (gross attribution, zero carve)", () => {
    const f = computeTaxBreakdownFlat(1, 100, 50);
    expect(f).toEqual({ totalAmount: 150, ssuAmount: 100, tribeAmount: 50, dappAmount: 0 });
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
