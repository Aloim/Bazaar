// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * exchangeQuotes.ts — Pure BigInt quote math for tribe token<→EVE swaps.
 *
 * Mirrors bazaar_economy::tribe_exchange V28 wallet-stock swap rates
 * and the legacy total-supply redemption rate used by
 * ledger_shop_ops::withdraw_ssu_tax_credits (Phase 6 W5/W6, AUD-ADV-18/19).
 *
 * Move references (exact mirror targets):
 *   - swap_eve_to_tokens   tribe_exchange.move:133-249
 *       tokens_out = (gross − tax) × tribe_wallet_bal / (vault − reserve)
 *   - swap_tokens_to_eve   tribe_exchange.move:255-365
 *       gross_eve  = tokens × scaled_rate_v28 / RATE_PRECISION
 *   - compute_scaled_rate_v28  tribe_exchange.move:489-501
 *       scaled = (vault − reserve) × RATE_PRECISION / tribe_wallet_balance
 *       (0 when wallet empty or vault ≤ reserve)
 *   - withdraw_ssu_tax_credits  ledger_shop_ops.move:419-467 (LEGACY rate)
 *       eve_out = tokens × [(vault − reserve) × RATE_PRECISION / total_supply]
 *                 / RATE_PRECISION, reserve floor enforced, tokens BURNED.
 *
 * All functions return 0n where the Move side would abort — callers treat
 * 0n as "cannot fill / do not submit". BigInt throughout: the u128
 * intermediates (available × RATE_PRECISION) overflow JS doubles.
 */

export const RATE_PRECISION  = 1_000_000_000n;
export const BPS_DENOMINATOR = 10_000n;
/** Mirrors MIN_SWAP_EVE_MIST in bazaar_economy::tribe_exchange (E_BELOW_MIN_SWAP = 11). */
export const MIN_SWAP_EVE_MIST = 10_000n;

/** Shared pool snapshot for the V28 quote functions. */
export interface V28PoolState {
  /** TribeVault.eve_balance (raw MIST). */
  eveBalance: bigint;
  /** ExchangeConfig.reserve_mist. */
  reserveMist: bigint;
  /** Ledger row at the TribeGovernance address — the V28 rate denominator. */
  tribeWalletBalance: bigint;
}

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/** vault − reserve, floored at 0 (the only EVE that backs swaps). */
export function availableLiquidity(pool: { eveBalance: bigint; reserveMist: bigint }): bigint {
  return pool.eveBalance > pool.reserveMist ? pool.eveBalance - pool.reserveMist : 0n;
}

/** compute_scaled_rate_v28 — MIST per token unit, scaled by RATE_PRECISION. */
export function scaledRateV28(pool: V28PoolState): bigint {
  const available = availableLiquidity(pool);
  if (pool.tribeWalletBalance <= 0n || available <= 0n) return 0n;
  return (available * RATE_PRECISION) / pool.tribeWalletBalance;
}

/**
 * Buy quote (mirrors swap_eve_to_tokens): gross EVE in → tokens out.
 * 0n where Move aborts: empty wallet row, vault ≤ reserve, net ≤ 0,
 * zero output, or output exceeding the tribe wallet stock.
 */
export function quoteEveToTokensV28(
  pool: V28PoolState,
  grossEveMist: bigint,
  feeBps: number,
): bigint {
  if (grossEveMist <= 0n) return 0n;
  const available = availableLiquidity(pool);
  if (pool.tribeWalletBalance <= 0n || available <= 0n) return 0n;
  const tax = (grossEveMist * BigInt(feeBps)) / BPS_DENOMINATOR;
  const net = grossEveMist - tax;
  if (net <= 0n) return 0n;
  const tokensOut = (net * pool.tribeWalletBalance) / available;
  if (tokensOut <= 0n || tokensOut > pool.tribeWalletBalance) return 0n;
  return tokensOut;
}

/**
 * Inverse buy quote: smallest gross EVE (MIST) whose Move-side floor math
 * yields at least `tokensOut` tokens. Ceiling math throughout — never
 * under-quotes. Clamped up to MIN_SWAP_EVE_MIST (Move floor assert).
 * 0n when the ask exceeds the tribe wallet stock or the pool can't quote.
 */
export function quoteEveCostForTokensV28(
  pool: V28PoolState,
  tokensOut: bigint,
  feeBps: number,
): bigint {
  if (tokensOut <= 0n || feeBps >= 10_000) return 0n;
  const available = availableLiquidity(pool);
  if (pool.tribeWalletBalance <= 0n || available <= 0n) return 0n;
  if (tokensOut > pool.tribeWalletBalance) return 0n;
  const netNeeded = ceilDiv(tokensOut * available, pool.tribeWalletBalance);
  const gross = ceilDiv(netNeeded * BPS_DENOMINATOR, BPS_DENOMINATOR - BigInt(feeBps));
  return gross > MIN_SWAP_EVE_MIST ? gross : MIN_SWAP_EVE_MIST;
}

/**
 * Sell quote (mirrors swap_tokens_to_eve): tokens in → net EVE out.
 * 0n where Move aborts: zero rate, zero gross, or reserve-floor breach
 * (vault must retain reserve_mist after the gross withdrawal).
 */
export function quoteTokensToEveV28(
  pool: V28PoolState,
  tokens: bigint,
  feeBps: number,
): bigint {
  if (tokens <= 0n) return 0n;
  const rate = scaledRateV28(pool);
  if (rate <= 0n) return 0n;
  const grossEve = (tokens * rate) / RATE_PRECISION;
  if (grossEve <= 0n) return 0n;
  if (pool.eveBalance < grossEve + pool.reserveMist) return 0n;
  const tax = (grossEve * BigInt(feeBps)) / BPS_DENOMINATOR;
  return grossEve - tax;
}

/** Pool snapshot for the LEGACY redemption rate (denominator = total supply). */
export interface LegacyRedeemPoolState {
  eveBalance: bigint;
  reserveMist: bigint;
  /** TribeTokenLedger.total_supply — the LEGACY rate denominator. */
  totalSupply: bigint;
}

/**
 * SSU tax-credit redemption quote (mirrors withdraw_ssu_tax_credits,
 * ledger_shop_ops.move:443-450). Uses the LEGACY exchange_rate_scaled
 * (denominator = total_supply, NOT the V28 tribe-wallet stock) — redemption
 * prices intentionally differ from player swaps (AUD-ADV-07; vault-favorable
 * whenever the tribe wallet holds less than the full supply). Tokens are
 * BURNED on redemption (supply decreases). 0n on reserve-floor breach.
 */
export function quoteLegacyRedeemEveOut(
  pool: LegacyRedeemPoolState,
  tokens: bigint,
): bigint {
  if (tokens <= 0n) return 0n;
  const available = pool.eveBalance > pool.reserveMist ? pool.eveBalance - pool.reserveMist : 0n;
  if (pool.totalSupply <= 0n || available <= 0n) return 0n;
  const scaled = (available * RATE_PRECISION) / pool.totalSupply;
  const eveOut = (tokens * scaled) / RATE_PRECISION;
  if (eveOut <= 0n) return 0n;
  if (pool.eveBalance < eveOut + pool.reserveMist) return 0n;
  return eveOut;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
