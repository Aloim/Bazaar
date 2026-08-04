// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { QUICKTRADE_VAULT_ID as QUICKTRADE_VAULT_ID_FALLBACK } from "@bazaar/shared/constants";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

async function rpc(method: string, params: unknown[]): Promise<any> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const data = await resp.json();
  if (data?.error) throw new Error(data.error.message);
  return data.result;
}

export interface UseQuicktradeVaultResult {
  /** typeId → aggregated quantity currently in the basket. */
  vaultLedger: Map<number, number>;
  loading: boolean;
  refetch: () => void;
}

/**
 * Read the basket contents of a QuicktradeVault.
 *
 * Source of truth: the new tier-aware basket flow stores per-typeId aggregate
 * quantities as **dynamic fields** on the vault object, keyed by
 * `bazaar_core::quicktrade_vault::BasketKey { type_id: u64 }` → `u64` quantity.
 *
 * We enumerate the vault's dynamic fields, filter to those whose name type
 * ends with `::quicktrade_vault::BasketKey`, decode the typeId from the name
 * payload, then fetch the value (a `Field<BasketKey, u64>` wrapper, with the
 * quantity at `.value.fields.value`).
 *
 * The legacy `deposit_to_vault` ledger Table is intentionally ignored —
 * it was a no-op for item movement and is being phased out by the basket
 * upgrade. The Table still lives on the struct for upgrade-compatibility,
 * but no one writes to it anymore.
 *
 * @param vaultId — per-SSU vault ID from useQuicktradeVaultId. When omitted,
 *                  falls back to the legacy QUICKTRADE_VAULT_ID env-var.
 */
export function useQuicktradeVault(vaultId?: string): UseQuicktradeVaultResult {
  const resolvedVaultId = vaultId ?? QUICKTRADE_VAULT_ID_FALLBACK;
  const [vaultLedger, setVaultLedger] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!resolvedVaultId) {
        if (!cancelled) {
          setVaultLedger(new Map());
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      try {
        // Enumerate dynamic fields on the vault object — basket counters are
        // direct DFs on vault.id, not on the legacy `deposits` Table.
        const aggregated = new Map<number, number>();
        let cursor: string | null = null;
        let hasNext = true;

        while (hasNext && !cancelled) {
          const page = await rpc("suix_getDynamicFields", [resolvedVaultId, cursor, null]);
          const data: any[] = page?.data ?? [];
          for (const df of data) {
            const nameType: string = df?.name?.type ?? "";
            if (!nameType.endsWith("::quicktrade_vault::BasketKey")) continue;
            // df.name.value shape: { type_id: "<u64-as-string>" }
            const typeId = Number(df?.name?.value?.type_id ?? 0);
            if (!Number.isFinite(typeId) || typeId === 0) continue;
            // Fetch the field object to read the u64 value.
            const fieldObj = await rpc("suix_getDynamicFieldObject", [
              resolvedVaultId,
              df.name,
            ]);
            // Field<BasketKey, u64> — value at content.fields.value.
            const qty = Number(fieldObj?.data?.content?.fields?.value ?? 0);
            if (qty > 0) {
              aggregated.set(typeId, (aggregated.get(typeId) ?? 0) + qty);
            }
          }
          cursor = page?.nextCursor ?? null;
          hasNext = page?.hasNextPage === true;
        }

        if (!cancelled) {
          setVaultLedger(aggregated);
          setLoading(false);
        }
      } catch (e) {
        console.warn("[useQuicktradeVault] RPC load failed:", e);
        if (!cancelled) {
          setVaultLedger(new Map());
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tick, resolvedVaultId]);

  return { vaultLedger, loading, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
