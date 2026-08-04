// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useTribeAssets — R6.6.3 OS-28 hook for unwrapped tribe asset fields.
 *
 * Companion to useTribeRegistry: exposes 4 unwrapped Option<address> fields
 * per tribe (gov, vault, tokenLedger, exchangeConfig) plus bootstrap flags.
 *
 * File limit: 500 lines | Constitution Article XII.3
 */

import { useTribeRegistry } from "./useTribeRegistry";

/**
 * Per-tribe asset state — the 4 OS-28 Option<address> fields unwrapped to
 * `string | null`, plus two convenience bootstrap-status flags.
 *
 * govId     — TribeGovernance shared object ID (set by bootstrap_tribe_governance)
 * vaultId   — TribeVault shared object ID (set by initialize_tribe_economy)
 * tokenLedgerId — TribeTokenLedger shared object ID (same)
 * exchangeConfigId — ExchangeConfig shared object ID (same)
 *
 * isFullyBootstrapped — all 4 IDs are non-null (Advanced tribe, fully wired)
 * isEasyBootstrapped  — govId is non-null (Easy tribe needs governance only)
 * loading             — passes through from useTribeRegistry
 */
export interface TribeAssets {
  govId:                string | null;
  vaultId:              string | null;
  tokenLedgerId:        string | null;
  exchangeConfigId:     string | null;
  withdrawalBoardId:    string | null;   // V15 — WithdrawalBoard for Reserve Vault listings
  mintBurnQueueId:      string | null;   // V16 — MintBurnQueue for delayed mint/burn requests
  isFullyBootstrapped:  boolean;
  isEasyBootstrapped:   boolean;
  loading:              boolean;
  /** Re-reads the TribeRegistry (each useTribeAssets caller has its own
   *  instance, so callers must refetch their own copy after a bootstrap TX). */
  refetch:              () => void;
}

/** Null-state used for tribeIdx === null or tribe-not-found cases. */
function nullAssets(loading: boolean, refetch: () => void): TribeAssets {
  return {
    govId: null,
    vaultId: null,
    tokenLedgerId: null,
    exchangeConfigId: null,
    withdrawalBoardId: null,
    mintBurnQueueId: null,
    isFullyBootstrapped: false,
    isEasyBootstrapped: false,
    loading,
    refetch,
  };
}

/**
 * Read the 4 OS-28 bootstrap IDs for a specific tribe by its numeric index.
 *
 * @param tribeIdx - Numeric tribe ID from TribeInfo.idx, or null when no tribe
 *                   is selected (returns null-state immediately without fetching).
 *
 * @example
 *   const { govId, isEasyBootstrapped } = useTribeAssets(myTribeIdx);
 *   if (!isEasyBootstrapped) return <BootstrapPrompt />;
 */
export function useTribeAssets(tribeIdx: number | null): TribeAssets {
  const { tribes, loading, refetch } = useTribeRegistry();

  if (tribeIdx === null) {
    return nullAssets(loading, refetch);
  }

  const t = tribes.find(x => x.idx === tribeIdx);
  if (!t) {
    // Tribe not found — either registry still loading or idx is invalid
    return nullAssets(loading, refetch);
  }

  const govId             = t.tribeGovId;
  const vaultId           = t.tribeVaultId;
  const tokenLedgerId     = t.tribeTokenLedgerId;
  const exchangeConfigId  = t.exchangeConfigId;
  const withdrawalBoardId = t.withdrawalBoardId;
  const mintBurnQueueId   = t.mintBurnQueueId;

  // V16: mintBurnQueueId joins the "fully bootstrapped" gate. initialize_tribe_economy
  // creates + shares all 5 economy objects in a single PTB, so this flips atomically.
  const isFullyBootstrapped = !!(
    govId && vaultId && tokenLedgerId && exchangeConfigId && withdrawalBoardId && mintBurnQueueId
  );
  const isEasyBootstrapped  = !!govId;

  return {
    govId,
    vaultId,
    tokenLedgerId,
    exchangeConfigId,
    withdrawalBoardId,
    mintBurnQueueId,
    isFullyBootstrapped,
    isEasyBootstrapped,
    loading,
    refetch,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
