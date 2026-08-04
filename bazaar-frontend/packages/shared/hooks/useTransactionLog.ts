// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// OS-29 R6.6.5: Retargeted from tribe_coin ghost module to post-overhaul emitting modules.
// CC-R2-001: fetchModuleEvents accepts packageId so tax_wallet→DAPP_HUB, tribe_vault→BAZAAR_ECONOMY.
// CC-003: EVENT_META updated to canonical TaxDepositEvent/TaxWithdrawEvent field names.
// Dropped: CoinMinted, CoinBurned, PackageIssued, PackageClaimed, ItemRecorded (no Move successors).

import { useState, useEffect, useCallback } from "react";
import { PACKAGE_IDS } from "@bazaar/shared/constants";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const data = await resp.json() as { result?: unknown; error?: { message?: string } };
  if (data?.error) throw new Error(data.error.message ?? "RPC error");
  return data.result ?? null;
}

export interface TxLogEntry {
  id: string;
  type: string;
  direction: "in" | "out";
  actor?: string;
  coinAmount?: number;
  itemTypeId?: number;
  itemQuantity?: number;
  timestamp: number;
  txDigest: string;
}

interface EventMeta {
  label: string;
  direction: "in" | "out";
  actorField?: string;
  amountField?: string;
  typeIdField?: string;
  quantityField?: string;
  useSender?: boolean;
}

// CC-003 (R6.6.5 Rev 3): EVENT_META updated to post-overhaul Move event surface.
// Source authority: DappHub/sources/tax_wallet.move (TaxDepositEvent, TaxWithdrawEvent).
// Dropped events (no Move successor): CoinMinted, CoinBurned, PackageIssued, PackageClaimed, ItemRecorded.
const EVENT_META: Record<string, EventMeta> = {
  // dapp_hub::tax_wallet — TaxDepositEvent.payer + TaxDepositEvent.dapp_tax (CC-003 fix)
  TaxDepositEvent:   { label: "Tax Deposit",    direction: "in",  actorField: "payer",     amountField: "dapp_tax" },
  // dapp_hub::tax_wallet — TaxWithdrawEvent.recipient + TaxWithdrawEvent.amount (correct already)
  TaxWithdrawEvent:  { label: "Tax Withdrawal", direction: "out", actorField: "recipient", amountField: "amount"   },
  // bazaar_economy::tribe_vault events (field names pending verification at R7 wire-up)
  VaultDeposit:      { label: "Vault Donation", direction: "in",  actorField: "depositor", amountField: "amount"   },
  VaultWithdrawal:   { label: "Vault Payout",   direction: "out", actorField: "recipient", amountField: "amount"   },
};

function shortName(fullType: string): string {
  const parts = fullType.split("::");
  return parts[parts.length - 1] ?? fullType;
}

function parseEvent(ev: Record<string, unknown>): TxLogEntry | null {
  const name = shortName((ev.type as string | undefined) ?? "");
  const meta = EVENT_META[name];
  if (!meta) return null;

  const json = (ev.parsedJson as Record<string, unknown>) ?? {};
  const sender = ev.sender as string | undefined;

  const actor: string | undefined =
    (meta.actorField ? (json[meta.actorField] as string | undefined) : undefined) ??
    (meta.useSender ? sender : undefined);

  const coinAmount = meta.amountField != null ? Number(json[meta.amountField] ?? 0) : undefined;
  const itemTypeId = meta.typeIdField != null ? Number(json[meta.typeIdField] ?? 0) : undefined;
  const itemQuantity = meta.quantityField != null ? Number(json[meta.quantityField] ?? 0) : undefined;

  const direction = meta.direction;

  const evId = (ev.id as Record<string, unknown>) ?? {};
  const txDigest = (evId.txDigest as string | undefined) ?? "";
  const eventSeq = String(evId.eventSeq ?? "0");

  return {
    id: `${txDigest}_${eventSeq}`,
    type: meta.label,
    direction,
    actor,
    coinAmount,
    itemTypeId,
    itemQuantity,
    timestamp: Number(ev.timestampMs ?? 0),
    txDigest,
  };
}

// CC-R2-001 (CRITICAL): accepts packageId so callers route each module to its defining package.
// tax_wallet → PACKAGE_IDS.DAPP_HUB; tribe_vault → PACKAGE_IDS.BAZAAR_ECONOMY.
async function fetchModuleEvents(moduleName: string, packageId: string): Promise<TxLogEntry[]> {
  const result = await rpc("suix_queryEvents", [
    { MoveModule: { package: packageId, module: moduleName } },
    null, 50, true,
  ]) as { data?: Record<string, unknown>[] } | null;
  const evs: Record<string, unknown>[] = result?.data ?? [];
  return evs.flatMap(ev => {
    const e = parseEvent(ev);
    return e ? [e] : [];
  });
}

export function useTransactionLog() {
  const [entries, setEntries] = useState<TxLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function load() {
      // CC-R2-001: each module routed to its defining package.
      const [taxEvents, vaultEvents] = await Promise.all([
        fetchModuleEvents("tax_wallet",  PACKAGE_IDS.DAPP_HUB),
        fetchModuleEvents("tribe_vault", PACKAGE_IDS.BAZAAR_ECONOMY),
      ]);
      const merged = [...taxEvents, ...vaultEvents].sort(
        (a, b) => b.timestamp - a.timestamp,
      );
      if (!cancelled) {
        setEntries(merged);
        setIsLoading(false);
      }
    }

    load().catch((e: unknown) => {
      console.warn("[useTransactionLog] fetch failed:", e);
      if (!cancelled) {
        setError(e instanceof Error ? e.message : "Failed to load transaction log");
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { entries, isLoading, error, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
