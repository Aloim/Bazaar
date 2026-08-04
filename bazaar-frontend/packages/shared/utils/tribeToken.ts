// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/utils/tribeToken — V26+ tribe-token decimals formatting.
 *
 * Tribe-token balances are stored on-chain as `u64` scaled units in
 * `bazaar_economy::tribe_token_ledger::TribeTokenLedger.balances`. The default
 * V26 convention is `decimals = 2` (read from `ledger.decimals`):
 *
 *   1.00 display token = 100 scaled units
 *
 * Use `formatTribeAmount` on every read render and `parseTribeAmount` on every
 * input field that accepts a player-typed amount. Pass the on-chain `decimals`
 * via `opts.decimals` whenever the ledger is loaded so per-tribe overrides
 * (future) just work; otherwise the default 2 applies.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

export const TRIBE_TOKEN_DECIMALS = 2;
export const TRIBE_TOKEN_SCALE: bigint = 10n ** BigInt(TRIBE_TOKEN_DECIMALS); // 100n

export interface FormatTribeAmountOptions {
  /** On-chain decimals (default 2). Read from `ledger.decimals` when available. */
  decimals?: number;
  /** Optional token symbol appended after the number (trailing): `"1.00 TOKEN"`. */
  symbol?: string;
  /** Intl locale (default `en-US`). Controls thousands separator + decimal mark. */
  locale?: string;
  /**
   * If true, omits the thousands separator (renders `1234.56` instead of `1,234.56`).
   * Default false. Useful when echoing back into a numeric input field where the
   * grouping comma would confuse the parser.
   */
  noGrouping?: boolean;
}

/**
 * Format a raw scaled-unit amount for human display.
 *
 *   formatTribeAmount(0n)        → "0.00"
 *   formatTribeAmount(100n)      → "1.00"
 *   formatTribeAmount(12345n)    → "123.45"
 *   formatTribeAmount(100000n, { symbol: "TOKEN" }) → "1,000.00 TOKEN"
 *
 * Accepts `bigint`, `number`, or `string` for `rawUnits`. Numbers are coerced
 * via `BigInt(Math.trunc(...))` — any fractional component is discarded; this
 * is by design because scaled units are always integers on-chain.
 */
export function formatTribeAmount(
  rawUnits: bigint | number | string,
  opts: FormatTribeAmountOptions = {},
): string {
  const decimals = opts.decimals ?? TRIBE_TOKEN_DECIMALS;
  const locale = opts.locale ?? "en-US";

  let raw: bigint;
  if (typeof rawUnits === "bigint") {
    raw = rawUnits;
  } else if (typeof rawUnits === "number") {
    if (!Number.isFinite(rawUnits)) raw = 0n;
    else raw = BigInt(Math.trunc(rawUnits));
  } else {
    // string — accept only integer-looking content (already-scaled units).
    const trimmed = rawUnits.trim();
    raw = trimmed === "" || trimmed === "-" ? 0n : BigInt(trimmed);
  }

  const negative = raw < 0n;
  const absRaw = negative ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const intPart = absRaw / scale;
  const fracPart = absRaw % scale;
  const fracStr = decimals === 0 ? "" : fracPart.toString().padStart(decimals, "0");

  // Format the integer portion with locale grouping (or none).
  const intFormatter = new Intl.NumberFormat(locale, {
    useGrouping: !opts.noGrouping,
    maximumFractionDigits: 0,
  });
  const intRendered = intFormatter.format(intPart);

  let body = decimals === 0 ? intRendered : `${intRendered}.${fracStr}`;
  if (negative) body = `-${body}`;

  return opts.symbol ? `${body} ${opts.symbol}` : body;
}

export class TribeAmountParseError extends Error {
  readonly reason: string;
  readonly input: string;
  constructor(reason: string, input: string) {
    super(`TribeAmountParseError: ${reason} (input: "${input}")`);
    this.name = "TribeAmountParseError";
    this.reason = reason;
    this.input = input;
  }
}

/**
 * Strict parser for player-typed display-token amounts. Returns the scaled
 * `bigint` ready to ship as a Move `u64`.
 *
 * Accepted forms (decimals=2):
 *   "1"        → 100n
 *   "1.5"      → 150n
 *   "1.50"     → 150n
 *   "1234.56"  → 123456n
 *   "1,234.56" → 123456n   (US thousands separator stripped)
 *   "0"        → 0n
 *   ".5"       → 50n
 *
 * Rejected (throws TribeAmountParseError with a specific `reason`):
 *   ""               — empty
 *   " "              — empty after trim
 *   "1.234"          — max 2 decimal places (under decimals=2)
 *   "1,50"           — comma-as-decimal not supported (use ".")
 *   "-1"             — negative amounts not allowed
 *   "abc"            — non-numeric
 *   "1.2.3"          — multiple decimal points
 *   "1e3"            — scientific notation rejected
 *   "Infinity"       — not a finite number
 *
 * The parser is locale-INDEPENDENT — always uses `.` as the decimal separator
 * and `,` as a (stripped) thousands separator, matching `en-US` rendering.
 * Inputs from other locales must be normalised by the caller.
 */
export function parseTribeAmount(input: string, decimals = TRIBE_TOKEN_DECIMALS): bigint {
  const trimmed = input.trim();

  if (trimmed === "") {
    throw new TribeAmountParseError("empty input", input);
  }
  if (trimmed.startsWith("-")) {
    throw new TribeAmountParseError("negative amounts not allowed", input);
  }
  if (/[eE]/.test(trimmed)) {
    throw new TribeAmountParseError("scientific notation not allowed", input);
  }
  if (!/^[0-9.,]+$/.test(trimmed)) {
    throw new TribeAmountParseError("non-numeric characters not allowed", input);
  }

  // Disambiguate comma-as-thousands (allowed) from comma-as-decimal (rejected).
  // Strategy: split on '.' first (≤ 1 dot allowed), then for each side validate
  // that any commas form proper thousands groups — `^[0-9]{1,3}(,[0-9]{3})*$`
  // for the integer side and `^[0-9]+$` (no commas) for the fractional side.
  // "1,50" (2 digits after comma) → reject. "1,000" (3 digits) → accept.
  // ".5" is allowed (empty integer side); "1." (empty fractional side) rejected
  // implicitly by the fractional-regex check.
  const dotCount = (trimmed.match(/\./g) ?? []).length;
  if (dotCount > 1) {
    throw new TribeAmountParseError("multiple decimal points", input);
  }

  let intRaw: string;
  let fracRaw: string;
  if (dotCount === 0) {
    intRaw = trimmed;
    fracRaw = "";
  } else {
    const [a, b] = trimmed.split(".");
    intRaw = a;
    fracRaw = b;
  }

  // Validate fractional side first — must be digits-only, no commas.
  if (dotCount === 1 && !/^[0-9]*$/.test(fracRaw)) {
    if (fracRaw.includes(",")) {
      throw new TribeAmountParseError(
        "',' after '.' is not a valid thousands separator",
        input,
      );
    }
    throw new TribeAmountParseError("malformed digits", input);
  }

  // Validate integer side: allow lone digits OR thousands-grouped digits.
  // Empty integer side is OK only with non-empty fractional side (".5" → "0.5").
  let intStr: string;
  if (intRaw === "") {
    if (fracRaw === "") {
      throw new TribeAmountParseError("empty number", input);
    }
    intStr = "0";
  } else if (/^[0-9]+$/.test(intRaw)) {
    intStr = intRaw;
  } else if (/^[0-9]{1,3}(,[0-9]{3})+$/.test(intRaw)) {
    intStr = intRaw.replace(/,/g, "");
  } else {
    // Anything with a comma that isn't a valid thousands-grouping pattern is
    // either continental-decimal (`1,50`) or malformed (`10,00`, `1,2`, etc.).
    if (intRaw.includes(",")) {
      throw new TribeAmountParseError(
        "use '.' as decimal separator (got ',')",
        input,
      );
    }
    throw new TribeAmountParseError("malformed digits", input);
  }

  const fracStr = fracRaw;

  // Empty int part is valid only with a non-empty frac part (".5" → "0.5").
  if (intStr === "" && fracStr === "") {
    throw new TribeAmountParseError("empty number", input);
  }
  if (intStr === "") intStr = "0";

  if (fracStr.length > decimals) {
    throw new TribeAmountParseError(
      `max ${decimals} decimal place${decimals === 1 ? "" : "s"}`,
      input,
    );
  }

  // Pad fractional part to `decimals` length so concat → scaled-unit bigint.
  const fracPadded = fracStr.padEnd(decimals, "0");

  // Final integrity check — only digits remain after strip + split.
  if (!/^[0-9]+$/.test(intStr) || (decimals > 0 && !/^[0-9]*$/.test(fracPadded))) {
    throw new TribeAmountParseError("malformed digits", input);
  }

  return BigInt(intStr + fracPadded);
}

export type TribeAmountParseResult =
  | { ok: true; value: bigint }
  | { ok: false; reason: string };

/**
 * Non-throwing variant of `parseTribeAmount` for input-field validation.
 * Use this on every keystroke / blur handler so the UI can render a friendly
 * inline error.
 */
export function parseTribeAmountSafe(
  input: string,
  decimals = TRIBE_TOKEN_DECIMALS,
): TribeAmountParseResult {
  try {
    return { ok: true, value: parseTribeAmount(input, decimals) };
  } catch (err) {
    if (err instanceof TribeAmountParseError) {
      return { ok: false, reason: err.reason };
    }
    return { ok: false, reason: String(err) };
  }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
