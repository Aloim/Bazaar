// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy exchange hooks.
 *
 * useExchangeConfig  — full ExchangeConfig shared object
 * useExchangeRate    — computed MIST-per-token rate (client-side math)
 * useExchangeHealth  — aggregated health dashboard (vault + config + ledger)
 *
 * @depends useTribeEconomyObjects for configId, vaultId, ledgerId
 *
 * Rate formula (Article XIII, tribe_exchange::compute_scaled_rate):
 *   rateScaled = (vault_balance - reserve) * RATE_PRECISION / total_supply
 *   displayRate = rateScaled / RATE_PRECISION
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../sui-client";
import type { ExchangeConfig, ExchangeHealth } from "../../types/bazaareconomy";
import { ECONOMY_CONSTANTS } from "../../types/bazaareconomy";
import { useTribeVault } from "./vault-hooks";
import { useTribeTokenLedger } from "./ledger-hooks";

// ── useExchangeConfig ──────────────────────────────────────────────────────────

/**
 * Fetch the full ExchangeConfig shared object.
 *
 * RPC: suiClient.getObject({ id: configId, options: { showContent: true } })
 *
 * exchange_fee_override_bps is Option<u64> in Move:
 *   Some(v) -> number
 *   None    -> null
 */
export function useExchangeConfig(configId: string | null) {

  return useQuery<ExchangeConfig | null>({
    queryKey: ["bazaareconomy", "exchange-config", configId],
    enabled: !!configId,
    queryFn: async (): Promise<ExchangeConfig | null> => {
      const obj = await suiClient.getObject({
        id: configId!,
        options: { showContent: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") return null;
      const f = obj.data.content.fields as Record<string, unknown>;
      const feeOverride = f.exchange_fee_override_bps as { fields: { vec: string[] } } | null;
      return {
        id: configId!,
        tribeId: Number(f.tribe_id),
        reserveMist: Number(f.reserve_mist),
        isActive: f.is_active as boolean,
        exchangeFeeOverrideBps: feeOverride && feeOverride.fields.vec.length > 0
          ? Number(feeOverride.fields.vec[0]) : null,
        totalEveIn: Number(f.total_eve_in),
        totalEveOut: Number(f.total_eve_out),
        totalTokensIssued: Number(f.total_tokens_issued),
        totalTokensBurned: Number(f.total_tokens_burned),
        swapCount: Number(f.swap_count),
        createdAtMs: Number(f.created_at_ms),
      };
    },
    staleTime: 15_000,
  });
}

// ── useExchangeRate ────────────────────────────────────────────────────────────

/**
 * Compute the current exchange rate from vault + ledger + config data.
 *
 * Client-side mirrors tribe_exchange::compute_scaled_rate:
 *   rateScaled = (vault_balance - reserve) * RATE_PRECISION / total_supply
 *   displayRate = rateScaled / RATE_PRECISION
 *
 * Returns null if any of the three objects are unavailable.
 * Returns { rateScaled: 0, displayRate: 0 } on bootstrap (supply == 0) or
 * underfunded vault (balance <= reserve).
 *
 * staleTime: 5_000 (refreshed frequently for live rate display).
 */
export function useExchangeRate(
  vaultId: string | null,
  ledgerId: string | null,
  configId: string | null
): { rateScaled: number; displayRate: number } | null {
  const { data: vault } = useTribeVault(vaultId);
  const { data: ledger } = useTribeTokenLedger(ledgerId);
  const { data: config } = useExchangeConfig(configId);

  if (!vault || !ledger || !config) return null;

  const balance = vault.eveBalance;
  const supply  = ledger.totalSupply;
  const reserve = config.reserveMist;

  if (supply === 0 || balance <= reserve) {
    return { rateScaled: 0, displayRate: 0 };
  }

  const available = balance - reserve;
  // u128 safety: JS numbers are f64, max safe integer is ~9e15.
  // For very large economies this may lose precision — acceptable for display.
  const rateScaled = Math.floor(
    (available * ECONOMY_CONSTANTS.RATE_PRECISION) / supply
  );
  const displayRate = rateScaled / ECONOMY_CONSTANTS.RATE_PRECISION;

  return { rateScaled, displayRate };
}

// ── useExchangeHealth ──────────────────────────────────────────────────────────

/**
 * Aggregate exchange health data for the ExchangeTab dashboard.
 *
 * Composes useTribeVault + useTribeTokenLedger + useExchangeConfig.
 * canMint: vault_balance > reserve_mist (Constitution Article XIII.4).
 *
 * @depends useTribeEconomyObjects for configId, vaultId, ledgerId
 */
export function useExchangeHealth(
  configId: string | null,
  vaultId: string | null,
  ledgerId: string | null
) {
  return useQuery<ExchangeHealth | null>({
    queryKey: ["bazaareconomy", "exchange-health", configId, vaultId, ledgerId],
    enabled: !!(configId && vaultId && ledgerId),
    queryFn: async (): Promise<ExchangeHealth | null> => {
      const [vaultResult, ledgerResult, configResult] = await Promise.all([
        suiClient.getObject({ id: vaultId!, options: { showContent: true } }),
        suiClient.getObject({ id: ledgerId!, options: { showContent: true } }),
        suiClient.getObject({ id: configId!, options: { showContent: true } }),
      ]);
      if (
        !vaultResult.data?.content || vaultResult.data.content.dataType !== "moveObject" ||
        !ledgerResult.data?.content || ledgerResult.data.content.dataType !== "moveObject" ||
        !configResult.data?.content || configResult.data.content.dataType !== "moveObject"
      ) return null;
      const vf = vaultResult.data.content.fields as Record<string, unknown>;
      const lf = ledgerResult.data.content.fields as Record<string, unknown>;
      const cf = configResult.data.content.fields as Record<string, unknown>;
      const eveBalField = vf.eve_balance as { fields: { value: string } } | undefined;
      const vaultBalance = Number(eveBalField?.fields?.value ?? (vf.eve_balance as string | number | undefined) ?? 0);
      const reserveMist = Number(cf.reserve_mist);
      const totalSupply = Number(lf.total_supply);
      const isActive = cf.is_active as boolean;
      let rateScaled = 0;
      if (totalSupply > 0 && vaultBalance > reserveMist) {
        const available = vaultBalance - reserveMist;
        rateScaled = Math.floor((available * ECONOMY_CONSTANTS.RATE_PRECISION) / totalSupply);
      }
      return {
        vaultBalance,
        reserveMist,
        rateScaled,
        isActive,
        displayRate: rateScaled / ECONOMY_CONSTANTS.RATE_PRECISION,
        canMint: vaultBalance > reserveMist,
      };
    },
    staleTime: 5_000,
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
