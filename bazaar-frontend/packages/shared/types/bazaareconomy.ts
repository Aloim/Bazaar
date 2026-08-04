// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/types/bazaareconomy — BazaarEconomy on-chain type mirrors.
 *
 * All types mirror Move struct fields exactly (snake_case -> camelCase).
 * TribeToken is an INTERNAL LEDGER (Table<address, u64>), NOT Coin<T>.
 * Constitution Article V. No real coins for tribe token balances.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

// ── TribeTokenLedger Types ─────────────────────────────────────────────────────

/**
 * Mirrors bazaar_economy::tribe_token_ledger::TribeTokenLedger.
 * NOTE: balances (Table<address, u64>) is NOT included — read individually
 * via getDynamicFieldObject. The top-level fields here exclude the Table.
 */
export interface TribeTokenLedger {
  id: string;
  tribeId: number;
  totalSupply: number;       // V26+ scaled units (decimals=2)
  supplyCap: number;         // 0 = uncapped; V26+ scaled units
  tokenName: string;
  tokenSymbol: string;
  decimals: number;          // V26+ default 2 (read from on-chain ledger)
  isFrozen: boolean;
  createdAtMs: number;
}

/** Player's tribe token balance (read from ledger.balances Table). */
export interface TribeTokenBalance {
  player: string;
  balance: number;           // V26+ scaled units; format via formatTribeAmount
  decimals: number;          // V26+ — propagated from ledger for callsite convenience
  tribeId: number;
  tokenSymbol: string;
}

/** Token metadata subset for display UI. */
export interface TribeTokenMetadata {
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  totalSupply: number;
  supplyCap: number;
  isFrozen: boolean;
}

// ── TribeVault Types ───────────────────────────────────────────────────────────

/**
 * Mirrors bazaar_economy::tribe_vault::TribeVault.
 * NOTE: eve_balance is Balance<SUI> in Move — the .value() is exposed here in MIST.
 */
export interface TribeVault {
  id: string;
  tribeId: number;
  eveBalance: number;        // Balance<SUI>.value() in MIST
  totalDeposited: number;
  totalWithdrawn: number;
  depositCount: number;
  withdrawalCount: number;
  isLocked: boolean;
}

// ── ExchangeConfig Types ───────────────────────────────────────────────────────

/**
 * Mirrors bazaar_economy::tribe_exchange::ExchangeConfig.
 * exchange_fee_override_bps is Option<u64> in Move — maps to null when none.
 */
export interface ExchangeConfig {
  id: string;
  tribeId: number;
  reserveMist: number;
  isActive: boolean;
  exchangeFeeOverrideBps: number | null;  // null = use global dApp rate
  totalEveIn: number;
  totalEveOut: number;
  totalTokensIssued: number;
  totalTokensBurned: number;
  swapCount: number;
  createdAtMs: number;
}

/** Exchange health dashboard data — computed from vault + ledger + config. */
export interface ExchangeHealth {
  vaultBalance: number;
  reserveMist: number;
  /** Precision-scaled rate (x RATE_PRECISION = 1e9). */
  rateScaled: number;
  isActive: boolean;
  /** rateScaled / 1e9 — MIST per token for display. */
  displayRate: number;
  canMint: boolean;
}

/** Supply utilization data for the ExchangeTab cap progress bar. */
export interface SupplyUtilization {
  totalSupply: number;
  supplyCap: number;          // 0 = uncapped
  /** Computed: supplyCap > 0 ? totalSupply / supplyCap : 0 */
  utilizationPct: number;
}

/** Swap quote for frontend preview before submitting a TX. */
export interface SwapQuote {
  direction: "eve_to_token" | "token_to_eve";
  inputAmount: number;
  grossOutput: number;
  dappTax: number;
  netOutput: number;
  rateScaled: number;
}

// ── Withdrawal Types ───────────────────────────────────────────────────────────

/** Status constants matching Move vault_withdrawal status constants. */
export const WITHDRAWAL_STATUS = {
  PENDING:   0,
  APPROVED:  1,
  EXECUTED:  2,
  CANCELLED: 3,
  EXPIRED:   4,
  DENIED:    5,
} as const;
export type WithdrawalStatus = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Mirrors bazaar_economy::vault_withdrawal::WithdrawalBoard top-level fields.
 * NOTE: requests (Table<u64, WithdrawalRequest>) is NOT included here — read
 * individual requests via getDynamicFieldObject with u64 key.
 */
export interface WithdrawalBoard {
  id: string;
  tribeId: number;
  nextRequestId: number;
  requiredApprovals: number;
  waitPeriodMs: number;     // 86_400_000 = 24h
}

/**
 * Mirrors bazaar_economy::vault_withdrawal::WithdrawalRequest.
 * approvals and denials are VecSet<address> in Move — exposed as counts only.
 * SA-005: requiredApprovals is a snapshot taken at request creation time.
 */
export interface WithdrawalRequest {
  id: number;
  tribeId: number;
  requester: string;
  amountMist: number;
  reason: string;
  approvalCount: number;
  denialCount: number;
  requiredApprovals: number;  // SA-005: snapshot at creation time
  status: WithdrawalStatus;
  createdAtMs: number;
  approvedAtMs: number;
  executedAtMs: number;
  expiresAtMs: number;
}

// ── Ledger Event Types ─────────────────────────────────────────────────────────

/** Mirrors bazaar_economy::ledger_shop_ops::LedgerPurchaseEvent. */
export interface LedgerPurchaseEvent {
  shopId: string;
  txType: number;             // 0=WTS, 1=WTB, 2=DE
  buyer: string;
  seller: string;
  ssuId: string;
  tribeId: number;
  listingIdx: number;
  quantity: number;
  grossTokens: number;
  ssuTaxTokens: number;
  tribeTaxTokens: number;
  netTokens: number;
  timestampMs: number;
}

/** Mirrors bazaar_economy::ledger_shop_ops::TaxCreditWithdrawEvent. */
export interface TaxCreditWithdrawEvent {
  tribeId: number;
  recipient: string;
  tokenAmount: number;
  eveAmount: number;
  taxType: "ssu" | "tribe";
  timestampMs: number;
}

// ── Economy Constants ──────────────────────────────────────────────────────────

/** On-chain economy constants mirrored for frontend use. */
export const ECONOMY_CONSTANTS = {
  RATE_PRECISION:     1_000_000_000,   // 1e9 — precision scaler for rate math
  BPS_DENOMINATOR:    10_000,
  WAIT_PERIOD_MS:     86_400_000,      // 24h
  EXPIRY_PERIOD_MS:   259_200_000,     // 72h
  MAX_RESERVE_MIST:   1_000_000_000_000, // 1000 SUI
  MAX_FEE_BPS:        5_000,           // 50%
  MIN_QUORUM:         1,
  MAX_QUORUM:         10,
  REASON_MAX_LEN:     200,
} as const;

// ── Resolved Economy Object IDs ────────────────────────────────────────────────

/**
 * The 4 per-tribe economy shared object IDs — resolved by useTribeEconomyObjects.
 * Created once by initialize_tribe_economy and never change.
 */
export interface TribeEconomyObjectIds {
  ledgerId: string;
  vaultId: string;
  configId: string;      // ExchangeConfig
  boardId: string;       // WithdrawalBoard
  tribeId: number;
  /** Transaction digest that created these objects. */
  initTxDigest: string;
  /** V26 D5: per-tribe AdvancedTradeRegistry (created in same bootstrap TX).
   *  Optional because pre-V26 bootstraps did not create this object. */
  advancedTradeRegistryId?: string;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
