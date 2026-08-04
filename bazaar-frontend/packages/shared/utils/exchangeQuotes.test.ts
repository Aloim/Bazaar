// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * exchangeQuotes.test.ts — Phase 6 W5/W6 quote-math tests (AUD-ADV-18/19).
 *
 * Verifies the V28 wallet-stock swap quotes mirror tribe_exchange.move
 * (denominator = tribe wallet ledger row, NOT total supply) and that the
 * legacy redemption quote mirrors ledger_shop_ops::withdraw_ssu_tax_credits
 * (denominator = total supply). Includes the divergence case the ADV-07
 * warning copy describes and Move-abort edge cases (return 0n).
 */

import { describe, it, expect } from "vitest";
import {
  RATE_PRECISION,
  MIN_SWAP_EVE_MIST,
  availableLiquidity,
  scaledRateV28,
  quoteEveToTokensV28,
  quoteEveCostForTokensV28,
  quoteTokensToEveV28,
  quoteLegacyRedeemEveOut,
  type V28PoolState,
} from "./exchangeQuotes";

// 1000 EVE vault, no reserve, tribe wallet holds 500 token units.
const POOL: V28PoolState = {
  eveBalance: 1_000_000_000_000n,
  reserveMist: 0n,
  tribeWalletBalance: 500n,
};

describe("availableLiquidity / scaledRateV28", () => {
  it("floors available at 0 when vault <= reserve", () => {
    expect(availableLiquidity({ eveBalance: 100n, reserveMist: 100n })).toBe(0n);
    expect(availableLiquidity({ eveBalance: 50n, reserveMist: 100n })).toBe(0n);
  });

  it("scaled rate = available * PRECISION / tribeWalletBalance", () => {
    expect(scaledRateV28(POOL)).toBe((1_000_000_000_000n * RATE_PRECISION) / 500n);
  });

  it("scaled rate is 0 on empty tribe wallet or drained vault (Move E_ZERO_RATE)", () => {
    expect(scaledRateV28({ ...POOL, tribeWalletBalance: 0n })).toBe(0n);
    expect(scaledRateV28({ ...POOL, eveBalance: 0n })).toBe(0n);
  });
});

describe("quoteEveToTokensV28 (buy — mirrors swap_eve_to_tokens)", () => {
  it("computes floor((gross - tax) * walletBal / available)", () => {
    // gross 10_000_000_000 (10 EVE), fee 500 bps → tax 500_000_000, net 9_500_000_000.
    // tokens = 9_500_000_000 * 500 / 1_000_000_000_000 = 4.75 → 4.
    expect(quoteEveToTokensV28(POOL, 10_000_000_000n, 500)).toBe(4n);
  });

  it("uses the TRIBE WALLET stock as denominator, not total supply", () => {
    // Same pool but wallet stock doubled → output doubles (supply irrelevant).
    const doubled = { ...POOL, tribeWalletBalance: 1000n };
    expect(quoteEveToTokensV28(doubled, 10_000_000_000n, 500)).toBe(9n); // 9.5 → 9
  });

  it("returns 0n where Move aborts: output exceeding wallet stock", () => {
    const tiny = { ...POOL, tribeWalletBalance: 2n };
    // gross = 2 × available (fee 0) → tokens = 4 > stock 2 → unfillable.
    expect(quoteEveToTokensV28(tiny, 2_000_000_000_000n, 0)).toBe(0n);
  });

  it("returns 0n on zero/eaten input and dead pools", () => {
    expect(quoteEveToTokensV28(POOL, 0n, 500)).toBe(0n);
    expect(quoteEveToTokensV28({ ...POOL, tribeWalletBalance: 0n }, 10_000n, 0)).toBe(0n);
    expect(quoteEveToTokensV28({ ...POOL, eveBalance: 0n }, 10_000n, 0)).toBe(0n);
    expect(quoteEveToTokensV28(POOL, 10n, 10_000)).toBe(0n); // fee eats everything
  });
});

describe("quoteEveCostForTokensV28 (inverse buy)", () => {
  it("never under-quotes: forward(inverse(T)) >= T", () => {
    for (const t of [1n, 3n, 7n, 250n, 499n]) {
      for (const fee of [0, 250, 500, 5000]) {
        const cost = quoteEveCostForTokensV28(POOL, t, fee);
        expect(cost).toBeGreaterThan(0n);
        expect(quoteEveToTokensV28(POOL, cost, fee)).toBeGreaterThanOrEqual(t);
      }
    }
  });

  it("clamps up to the Move min-swap floor", () => {
    // 1 token from a dust pool costs almost nothing → floor kicks in.
    const dust: V28PoolState = { eveBalance: 1_000_000n, reserveMist: 0n, tribeWalletBalance: 1_000n };
    expect(quoteEveCostForTokensV28(dust, 1n, 0)).toBe(MIN_SWAP_EVE_MIST);
  });

  it("returns 0n when the ask exceeds the tribe wallet stock", () => {
    expect(quoteEveCostForTokensV28(POOL, 501n, 0)).toBe(0n);
  });
});

describe("quoteTokensToEveV28 (sell — mirrors swap_tokens_to_eve)", () => {
  it("computes gross = tokens * scaledRate / PRECISION, minus fee", () => {
    // rate = 1e12 * 1e9 / 500 = 2e18; 5 tokens → gross 1e10; fee 500 → tax 5e8.
    expect(quoteTokensToEveV28(POOL, 5n, 500)).toBe(10_000_000_000n - 500_000_000n);
  });

  it("returns 0n on reserve-floor breach (Move E_VAULT_BELOW_RESERVE)", () => {
    // available = 1 MIST: selling 1 token grosses exactly 1 MIST and passes
    // (Move allows equality on the floor); selling 2 must breach it.
    const floored: V28PoolState = {
      eveBalance: 1_000_000n,
      reserveMist: 999_999n,
      tribeWalletBalance: 1n,
    };
    expect(quoteTokensToEveV28(floored, 1n, 0)).toBe(1n);
    expect(quoteTokensToEveV28(floored, 2n, 0)).toBe(0n);
  });

  it("returns 0n on zero rate / zero tokens", () => {
    expect(quoteTokensToEveV28({ ...POOL, tribeWalletBalance: 0n }, 5n, 0)).toBe(0n);
    expect(quoteTokensToEveV28(POOL, 0n, 0)).toBe(0n);
  });
});

describe("quoteLegacyRedeemEveOut (mirrors withdraw_ssu_tax_credits)", () => {
  it("uses TOTAL SUPPLY as denominator — diverges from the V28 swap rate", () => {
    // Vault 1000 EVE, supply 10_000 units, wallet stock only 500.
    const eveBalance = 1_000_000_000_000n;
    const legacy = quoteLegacyRedeemEveOut(
      { eveBalance, reserveMist: 0n, totalSupply: 10_000n },
      100n,
    );
    // legacy: 100 * (1e12 * 1e9 / 1e4) / 1e9 = 1e10 (10 EVE)
    expect(legacy).toBe(10_000_000_000n);
    // V28 swap of the same 100 tokens (wallet stock 500) pays 20x more —
    // the ADV-07 divergence the redeem UI must warn about.
    const v28 = quoteTokensToEveV28(
      { eveBalance, reserveMist: 0n, tribeWalletBalance: 500n },
      100n,
      0,
    );
    expect(v28).toBe(200_000_000_000n);
    expect(v28).not.toBe(legacy);
  });

  it("enforces the reserve floor", () => {
    expect(
      quoteLegacyRedeemEveOut(
        { eveBalance: 1_000_000n, reserveMist: 999_999n, totalSupply: 10n },
        5n,
      ),
    ).toBe(0n);
  });

  it("returns 0n on zero supply / drained vault / zero tokens", () => {
    expect(quoteLegacyRedeemEveOut({ eveBalance: 0n, reserveMist: 0n, totalSupply: 10n }, 5n)).toBe(0n);
    expect(quoteLegacyRedeemEveOut({ eveBalance: 100n, reserveMist: 0n, totalSupply: 0n }, 5n)).toBe(0n);
    expect(quoteLegacyRedeemEveOut({ eveBalance: 100n, reserveMist: 0n, totalSupply: 10n }, 0n)).toBe(0n);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
