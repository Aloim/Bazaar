// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy governance hooks.
 *
 * useSupplyUtilization     — supply vs cap data for progress bar display
 * useCanMint               — boolean gate: vault > reserve (Article XIII.4)
 * useEconomyGovernanceConfig — consolidated governance state for admin panel
 *
 * @depends useTribeEconomyObjects for ledgerId, vaultId, configId
 *
 * Move accessors:
 *   economy_governance::supply_utilization(ledger): (u64, u64)
 *   economy_governance::can_mint(vault, config): bool
 *   economy_governance::exchange_health(config, vault, ledger): (u64, u64, u64, bool)
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import type { SupplyUtilization } from "../../types/bazaareconomy";
import { useTribeTokenLedger } from "./ledger-hooks";
import { useTribeVault } from "./vault-hooks";
import { useExchangeConfig } from "./exchange-hooks";

// ── useSupplyUtilization ───────────────────────────────────────────────────────

/**
 * Compute supply utilization for the tribe token.
 *
 * Derives from useTribeTokenLedger — no extra RPC call.
 * utilizationPct is 0 when supplyCap == 0 (uncapped).
 *
 * Used by the ExchangeTab supply cap progress bar.
 */
export function useSupplyUtilization(
  ledgerId: string | null
): SupplyUtilization | null {
  const { data: ledger } = useTribeTokenLedger(ledgerId);

  if (!ledger) return null;

  const utilizationPct =
    ledger.supplyCap > 0
      ? ledger.totalSupply / ledger.supplyCap
      : 0;

  return {
    totalSupply: ledger.totalSupply,
    supplyCap: ledger.supplyCap,
    utilizationPct,
  };
}

// ── useCanMint ─────────────────────────────────────────────────────────────────

/**
 * Returns true when vault_balance > reserve_mist.
 * Constitution Article XIII.4 — minting is blocked when vault is underfunded.
 *
 * Used to disable the Mint button in the admin ExchangeTab.
 * Derives from useTribeVault + useExchangeConfig — no extra RPC call.
 */
export function useCanMint(
  vaultId: string | null,
  configId: string | null
): boolean {
  const { data: vault }  = useTribeVault(vaultId);
  const { data: config } = useExchangeConfig(configId);

  if (!vault || !config) return false;
  return vault.eveBalance > config.reserveMist;
}

// ── useEconomyGovernanceConfig ─────────────────────────────────────────────────

/**
 * Consolidated governance state for the EconomyAdminPanel.
 *
 * Composes vault, ledger, and config hooks into a single object for use
 * by admin panel tabs that need all three simultaneously. Avoids prop-drilling.
 *
 * Returns null until all three objects are loaded.
 */
export function useEconomyGovernanceConfig(
  vaultId: string | null,
  ledgerId: string | null,
  configId: string | null
): {
  isActive: boolean;
  isFrozen: boolean;
  isLocked: boolean;
  canMint: boolean;
  reserveMist: number;
  requiredApprovals: number | null; // from WithdrawalBoard — pass boardId separately
  feeOverrideBps: number | null;
} | null {
  const { data: vault }  = useTribeVault(vaultId);
  const { data: ledger } = useTribeTokenLedger(ledgerId);
  const { data: config } = useExchangeConfig(configId);

  if (!vault || !ledger || !config) return null;

  return {
    isActive:           config.isActive,
    isFrozen:           ledger.isFrozen,
    isLocked:           vault.isLocked,
    canMint:            vault.eveBalance > config.reserveMist,
    reserveMist:        config.reserveMist,
    requiredApprovals:  null, // caller must pass boardId to useWithdrawalBoard separately
    feeOverrideBps:     config.exchangeFeeOverrideBps,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
