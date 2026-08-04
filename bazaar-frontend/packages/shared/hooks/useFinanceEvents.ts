// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/hooks/useFinanceEvents.ts
// Queries FinanceEvent events for a specific tribe via direct Sui fullnode RPC.
// Uses suix_queryEvents with MoveEventType filter on
// bazaar_economy::finance_events::FinanceEvent.
// Filters by tribe_id client-side (fullnode does not support field-level filtering).
// NEVER use dAppKit.getClient() — it routes through stale GraphQL.
//
// Run-#9 invariant 1: struct type filters MUST anchor to the ORIGINAL_PACKAGE_ID
// (V1 publish ID, frozen across upgrades / fresh publishes). FinanceEvent lives
// in BazaarEconomy, so we anchor to BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID.

import { useState, useCallback, useEffect } from "react";
import { BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID } from "@bazaar/shared/constants";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

const PAGE_SIZE = 10;
const MAX_EVENTS = 100;

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json() as { result?: unknown; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result;
}

export interface FinanceEvent {
  id:                 string;
  tribeId:            number;
  eventType:          number;  // 0=mint, 1=burn, 2=vault_deposit, 3=withdraw_request,
                               // 4=withdraw_approved, 5=withdraw_cancelled,
                               // 6=withdraw_executed, 7=withdraw_expired, 8=withdraw_denied,
                               // 9=swap_eve_to_token, 10=swap_token_to_eve
  actor:              string;
  amount:             number;
  eveReserveBefore:   number;
  eveReserveAfter:    number;
  circulationBefore:  number;
  circulationAfter:   number;
  timestampMs:        number;
  txDigest:           string;
}

/**
 * Format a FinanceEvent type code into a display label for the given tribe.
 * Tribe token symbol is dynamic (chosen at tribe registration), so labels
 * that reference the token (MINT / BURN / SWAP) substitute the live symbol
 * resolved upstream via `useTribeTokenSymbol(tribeGovId)`.
 *
 * Pass an empty string for currencySymbol to get a generic "TOKEN" placeholder
 * (only useful when the symbol hasn't loaded yet).
 */
export function formatFinanceEventLabel(eventType: number, currencySymbol: string): string {
  const sym = currencySymbol || "TOKEN";
  switch (eventType) {
    case 0:  return `${sym} MINTED`;
    case 1:  return `${sym} BURNED`;
    case 2:  return "VAULT DEPOSIT";
    case 3:  return "WITHDRAWAL REQUESTED";
    case 4:  return "WITHDRAWAL APPROVED";
    case 5:  return "WITHDRAWAL CANCELLED";
    case 6:  return "WITHDRAWAL EXECUTED";
    case 7:  return "WITHDRAWAL EXPIRED";
    case 8:  return "WITHDRAWAL DENIED";
    case 9:  return `EVE → ${sym} SWAP`;
    case 10: return `${sym} → EVE SWAP`;
    case 11: return `${sym} MINT REQUESTED`;
    case 12: return `${sym} BURN REQUESTED`;
    case 13: return `${sym} MINT/BURN REJECTED`;
    default: return `TYPE ${eventType}`;
  }
}

export interface UseFinanceEventsResult {
  events:      FinanceEvent[];
  loading:     boolean;
  error:       string | null;
  page:        number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  goNext:      () => void;
  goPrev:      () => void;
  refetch:     () => void;
}

interface RawEvent {
  id:         { txDigest: string; eventSeq: string };
  type:       string;
  parsedJson: Record<string, unknown>;
  timestampMs: string | number | null;
}

interface RawEventPage {
  data:        RawEvent[];
  nextCursor:  { txDigest: string; eventSeq: string } | null;
  hasNextPage: boolean;
}

function parseRawEvent(ev: RawEvent): FinanceEvent | null {
  const json = ev.parsedJson;
  const txDigest = ev.id?.txDigest ?? "";
  const eventSeq = String(ev.id?.eventSeq ?? "0");
  return {
    id:                `${txDigest}_${eventSeq}`,
    tribeId:           Number(json.tribe_id ?? -1),
    eventType:         Number(json.event_type ?? 0),
    actor:             String(json.actor ?? ""),
    amount:            Number(json.amount ?? 0),
    eveReserveBefore:  Number(json.eve_reserve_before ?? 0),
    eveReserveAfter:   Number(json.eve_reserve_after ?? 0),
    circulationBefore: Number(json.circulation_before ?? 0),
    circulationAfter:  Number(json.circulation_after ?? 0),
    timestampMs:       Number(ev.timestampMs ?? 0),
    txDigest,
  };
}

/**
 * Fetch finance events for a specific tribe.
 * tribeIdx: filter to specific tribe. Pass -1 to receive all tribes.
 */
export function useFinanceEvents(tribeIdx: number): UseFinanceEventsResult {
  const [allEvents, setAllEvents]   = useState<FinanceEvent[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [page, setPage]             = useState(0);

  const fetchAll = useCallback(async () => {
    if (!BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID) return;
    setLoading(true);
    setError(null);

    // FinanceEvent is emitted by bazaar_economy::finance_events; per Run-#9
    // invariant 1, the type-filter MUST anchor to BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID
    // (V1 publish ID, frozen across fresh publishes).
    const eventType = `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::finance_events::FinanceEvent`;
    const collected: FinanceEvent[] = [];
    let cursor: { txDigest: string; eventSeq: string } | null = null;
    let hasMore = true;

    try {
      // Paginate up to MAX_EVENTS total events (descending order)
      while (hasMore && collected.length < MAX_EVENTS) {
        const result = await rpc("suix_queryEvents", [
          { MoveEventType: eventType },
          cursor,
          PAGE_SIZE * 2,  // over-fetch per RPC call for client-side filtering efficiency
          true,           // descending — newest first
        ]) as RawEventPage;

        for (const ev of result.data ?? []) {
          const parsed = parseRawEvent(ev);
          if (!parsed) continue;
          // Client-side tribe_id filter (tribeIdx === tribeId in this scope)
          if (tribeIdx >= 0 && parsed.tribeId !== tribeIdx) continue;
          collected.push(parsed);
          if (collected.length >= MAX_EVENTS) break;
        }

        cursor = result.nextCursor ?? null;
        hasMore = result.hasNextPage && !!cursor;
      }

      setAllEvents(collected);
      setPage(0);
    } catch (err) {
      console.error("[useFinanceEvents] fetch failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load finance events");
    } finally {
      setLoading(false);
    }
  }, [tribeIdx]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const pageEvents = allEvents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(allEvents.length / PAGE_SIZE);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  const goNext = useCallback(() => {
    if (hasNextPage) setPage(p => p + 1);
  }, [hasNextPage]);

  const goPrev = useCallback(() => {
    if (hasPrevPage) setPage(p => p - 1);
  }, [hasPrevPage]);

  const refetch = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    events:  pageEvents,
    loading,
    error,
    page,
    hasNextPage,
    hasPrevPage,
    goNext,
    goPrev,
    refetch,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
