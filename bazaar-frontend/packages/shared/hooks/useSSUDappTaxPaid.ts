// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// useSSUDappTaxPaid — per-SSU DApp-tax accounting for the DApp-management
// SSU details window. The DAppTaxWallet stores only GLOBAL totals, but every
// deposit emits `dapp_hub::tax_wallet::TaxDepositEvent { ssu_id, dapp_tax,
// gross_amount, ... }`. So per-SSU "taxes paid to the DApp" is the sum of
// `dapp_tax` across all TaxDepositEvents whose `ssu_id` matches, and the
// "ingoing" trade volume that generated it is the sum of `gross_amount`.
//
// suix_queryEvents cannot filter by an event FIELD (only by type/sender/time),
// so we page through every TaxDepositEvent and aggregate client-side. Testnet
// volumes are small; a page cap guards against runaway. NEVER use
// dAppKit.getClient() — it routes through stale GraphQL.
//
// Amounts are raw MIST (EVE 9-decimals); format with utils.formatSui at render.

import { useState, useCallback, useEffect } from "react";
import { DAPP_HUB_ORIGINAL_PACKAGE_ID } from "@bazaar/shared/constants";

// AUD-DH-18: event type filters anchor the ORIGINAL (defining) package id —
// stays correct after a future compatible upgrade of dapp_hub.
const DAPP_HUB_PKG = DAPP_HUB_ORIGINAL_PACKAGE_ID;

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

const PAGE_SIZE = 50;
// Cap total pages so a large event log can never hang the details window.
// 40 × 50 = 2000 deposits scanned; bump if a single SSU ever exceeds this.
const MAX_PAGES = 40;

async function rpc(method: string, params: unknown[]): Promise<any> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json();
  if (json?.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result;
}

/** Normalize a Sui address for comparison: lowercase, 0x + 64 hex, zero-padded. */
function normAddr(a: string | undefined): string {
  if (!a) return "";
  let s = a.toLowerCase().trim();
  if (s.startsWith("0x")) s = s.slice(2);
  if (!/^[0-9a-f]*$/.test(s)) return "";
  return "0x" + s.padStart(64, "0");
}

export interface SSUDappTaxTotals {
  /** Sum of TaxDepositEvent.dapp_tax for this SSU (raw MIST) — the DApp's cut. */
  dappTaxPaid: number;
  /** Sum of TaxDepositEvent.gross_amount for this SSU (raw MIST) — trade volume. */
  grossVolume: number;
  /** Number of taxed transactions attributed to this SSU. */
  txCount: number;
  /** True if the page cap was hit (totals are a lower bound). */
  capped: boolean;
}

export interface UseSSUDappTaxPaidResult extends SSUDappTaxTotals {
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const EMPTY: SSUDappTaxTotals = { dappTaxPaid: 0, grossVolume: 0, txCount: 0, capped: false };

export function useSSUDappTaxPaid(ssuId: string | null | undefined): UseSSUDappTaxPaidResult {
  const [totals, setTotals] = useState<SSUDappTaxTotals>(EMPTY);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    const target = normAddr(ssuId ?? undefined);
    if (!DAPP_HUB_PKG || !target) {
      setTotals(EMPTY);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const eventType = `${DAPP_HUB_PKG}::tax_wallet::TaxDepositEvent`;
      let cursor: { txDigest: string; eventSeq: string } | null = null;
      let dappTaxPaid = 0;
      let grossVolume = 0;
      let txCount = 0;
      let capped = false;

      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await rpc("suix_queryEvents", [
          { MoveEventType: eventType },
          cursor,
          PAGE_SIZE,
          false, // ascending — order is irrelevant for a sum
        ]) as {
          data?: Array<{ parsedJson?: Record<string, unknown> }>;
          nextCursor?: { txDigest: string; eventSeq: string } | null;
          hasNextPage?: boolean;
        };
        if (cancelled) return;

        for (const ev of res?.data ?? []) {
          const j = ev?.parsedJson ?? {};
          if (normAddr(j.ssu_id as string | undefined) !== target) continue;
          dappTaxPaid += Number(j.dapp_tax ?? 0);
          grossVolume += Number(j.gross_amount ?? 0);
          txCount += 1;
        }

        if (!res?.hasNextPage) break;
        cursor = res.nextCursor ?? null;
        if (!cursor) break;
        if (page === MAX_PAGES - 1) capped = true;
      }

      if (!cancelled) {
        setTotals({ dappTaxPaid, grossVolume, txCount, capped });
        setLoading(false);
      }
    })().catch(e => {
      if (!cancelled) {
        setError(e instanceof Error ? e.message : "Failed to load SSU DApp tax");
        setTotals(EMPTY);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [ssuId, tick]);

  return { ...totals, loading, error, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
