// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy vault hooks.
 *
 * useTribeVault  — full TribeVault shared object
 * useVaultHealth — lightweight (balance, isLocked) for exchange display
 *
 * @depends useTribeEconomyObjects for vaultId
 *
 * Move struct: bazaar_economy::tribe_vault::TribeVault
 * eve_balance is Balance<SUI> — exposed as MIST (u64) via .value().
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../sui-client";
import type { TribeVault } from "../../types/bazaareconomy";

// ── useTribeVault ──────────────────────────────────────────────────────────────

/**
 * Fetch the full TribeVault shared object.
 *
 * RPC: suiClient.getObject({ id: vaultId, options: { showContent: true } })
 *
 * NOTE: eve_balance in Move is Balance<SUI>. The on-chain content exposes
 * it as { fields: { value: <mist_amount> } } — parsed to a plain number.
 */
export function useTribeVault(vaultId: string | null) {

  return useQuery<TribeVault | null>({
    queryKey: ["bazaareconomy", "vault", vaultId],
    enabled: !!vaultId,
    queryFn: async (): Promise<TribeVault | null> => {
      const obj = await suiClient.getObject({
        id: vaultId!,
        options: { showContent: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") return null;
      const f = obj.data.content.fields as Record<string, unknown>;
      const eveBalanceField = f.eve_balance as { fields: { value: string } } | undefined;
      return {
        id: vaultId!,
        tribeId: Number(f.tribe_id),
        eveBalance: Number(eveBalanceField?.fields?.value ?? (f.eve_balance as string | number | undefined) ?? 0),
        totalDeposited: Number(f.total_deposited),
        totalWithdrawn: Number(f.total_withdrawn),
        depositCount: Number(f.deposit_count),
        withdrawalCount: Number(f.withdrawal_count),
        isLocked: f.is_locked as boolean,
      };
    },
    staleTime: 10_000,
  });
}

// ── useVaultHealth ─────────────────────────────────────────────────────────────

/**
 * Lightweight vault health check.
 * Returns { eveBalance, isLocked } for exchange rate display and swap gating.
 * Derives from useTribeVault to avoid a duplicate RPC call.
 */
export function useVaultHealth(vaultId: string | null): {
  eveBalance: number;
  isLocked: boolean;
} {
  const { data } = useTribeVault(vaultId);
  return {
    eveBalance: data?.eveBalance ?? 0,
    isLocked: data?.isLocked ?? false,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
