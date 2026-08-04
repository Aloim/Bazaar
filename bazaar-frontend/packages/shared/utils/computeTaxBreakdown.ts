// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// computeTaxBreakdown — EconomyFixplan Phase 6 (2026-05-08)
// Pure utilities for layer-by-layer tax / flat-fee aggregation.
// Mirrors Move-side single-step floor semantics (sub-additive surplus
// 0..(N−1) mist; never under-funded). Used by useShopTaxBreakdown +
// optionally direct by tests.

export interface BpsBreakdown {
  totalBps:    number;
  ssuBps:      number;
  tribeBps:    number;
  dappBps:     number;
  totalAmount: number;   // floor(grossScaled * totalBps / 10_000)
  // Per-layer "rounded contribution" — sum may be ≤ totalAmount by ≤(N−1) mist.
  ssuTax:      number;
  tribeTax:    number;
  dappTax:     number;
  net:         number;   // gross − totalAmount (informational; surcharge model adds, not deducts)
}

export function computeTaxBreakdownBps(
  grossScaled: number,
  ssuBps: number, tribeBps: number, dappBps: number,
): BpsBreakdown {
  const totalBps = ssuBps + tribeBps + dappBps;
  const totalAmount = Math.floor((grossScaled * totalBps) / 10_000);
  const ssuTax   = Math.floor((grossScaled * ssuBps)   / 10_000);
  const tribeTax = Math.floor((grossScaled * tribeBps) / 10_000);
  const dappTax  = Math.floor((grossScaled * dappBps)  / 10_000);
  const net = Math.max(0, grossScaled - totalAmount);
  return { totalBps, ssuBps, tribeBps, dappBps, totalAmount, ssuTax, tribeTax, dappTax, net };
}

export interface FlatBreakdown {
  /** Payer total — the gross flats (ssu+tribe); the DApp share is carved OUT of these, not added. */
  totalAmount:  number;
  /** SSU recipient net (gross SSU flat − its DApp carve). */
  ssuAmount:    number;
  /** Tribe recipient net (gross tribe flat − its DApp carve). */
  tribeAmount:  number;
  /** DApp share carved out of the flats (per-layer floors, mirrors shop_ops_de). */
  dappAmount:   number;
}

export function computeTaxBreakdownFlat(
  units: number, ssuFee: number, tribeFee: number, dappBps: number = 0,
): FlatBreakdown {
  const ssuGross   = ssuFee   * units;
  const tribeGross = tribeFee * units;
  const dappFromSsu   = Math.floor((ssuGross   * dappBps) / 10_000);
  const dappFromTribe = Math.floor((tribeGross * dappBps) / 10_000);
  return {
    totalAmount: ssuGross + tribeGross,
    ssuAmount:   ssuGross   - dappFromSsu,
    tribeAmount: tribeGross - dappFromTribe,
    dappAmount:  dappFromSsu + dappFromTribe,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
