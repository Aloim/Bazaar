// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Queries the FOUR dapp_hub::tax_wallet event streams via direct Sui fullnode
// RPC with cursor-based pagination (15 per page). Phase 8 A3 (AUD-DH-16):
// FeeDepositEvent + EmergencyDrainEvent added — they move total_collected /
// total_withdrawn, so without them the history could never reconcile with the
// lifetime stats above it. NEVER use dAppKit.getClient() — stale GraphQL.
//
// Amount fields: TaxDepositEvent.dapp_tax (the DApp's actual cut) ·
// TaxWithdrawEvent.amount · FeeDepositEvent.amount (+fee_kind) ·
// EmergencyDrainEvent.drained_amount. Source: DappHub/sources/tax_wallet.move.
// AUD-DH-18: event type filters anchor DAPP_HUB_ORIGINAL_PACKAGE_ID.

import { useState, useCallback, useEffect } from "react";
import { DAPP_HUB_ORIGINAL_PACKAGE_ID } from "@bazaar/shared/constants";

const DAPP_HUB_PKG = DAPP_HUB_ORIGINAL_PACKAGE_ID;

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

const PAGE_SIZE = 15;

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

export type DAppTaxEventType = "deposit" | "withdrawal" | "fee" | "drain";

export interface DAppTaxEvent {
  id: string;
  type: DAppTaxEventType;
  /**
   * deposit: dapp_tax (DApp's actual cut) · withdrawal: amount ·
   * fee: amount · drain: drained_amount.
   */
  amount: number;
  timestamp: number;
  txDigest: string;
  recipient?: string;  // withdrawals + drains
  feeKind?: string;    // fees — "ssu_registration" | "tribe_join" | "*_tribe_creation"
}

interface RawEventPage {
  data: RawEvent[];
  nextCursor: { txDigest: string; eventSeq: string } | null;
  hasNextPage: boolean;
}

interface RawEvent {
  id: { txDigest: string; eventSeq: string };
  type: string;
  parsedJson: Record<string, unknown>;
  timestampMs: string | number | null;
}

export interface UseDAppTaxHistoryResult {
  events: DAppTaxEvent[];
  loading: boolean;
  error: string | null;
  page: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  goNext: () => void;
  goPrev: () => void;
  refetch: () => void;
}

// Fetch a single event type page — returns raw events + next cursor info
async function fetchEventPage(
  eventType: string,
  cursor: { txDigest: string; eventSeq: string } | null,
): Promise<RawEventPage> {
  const result = await rpc("suix_queryEvents", [
    { MoveEventType: eventType },
    cursor,
    PAGE_SIZE * 2, // over-fetch so merged pages have enough for one display page
    true,          // descending (newest first)
  ]) as RawEventPage;
  return result;
}

function parseRawEvent(ev: RawEvent): DAppTaxEvent | null {
  const typeStr = ev.type ?? "";
  let eventType: DAppTaxEventType;
  if (typeStr.includes("TaxDepositEvent")) {
    eventType = "deposit";
  } else if (typeStr.includes("TaxWithdrawEvent")) {
    eventType = "withdrawal";
  } else if (typeStr.includes("FeeDepositEvent")) {
    eventType = "fee";
  } else if (typeStr.includes("EmergencyDrainEvent")) {
    eventType = "drain";
  } else {
    return null;
  }

  const json = ev.parsedJson;
  const amount =
    eventType === "deposit" ? Number(json.dapp_tax ?? 0)
  : eventType === "drain"   ? Number(json.drained_amount ?? 0)
  :                           Number(json.amount ?? 0);
  // (AUD-DH-20: the dead DEV "currency !== SUI" warning removed — Move emits "EVE",
  // so it fired on every deposit row.)
  const txDigest = ev.id?.txDigest ?? "";
  const eventSeq = String(ev.id?.eventSeq ?? "0");
  const timestamp = Number(ev.timestampMs ?? 0);
  const recipient = (eventType === "withdrawal" || eventType === "drain")
    ? (json.recipient as string | undefined)
    : undefined;
  const feeKind = eventType === "fee"
    ? (json.fee_kind as string | undefined)
    : undefined;

  return {
    id: `${txDigest}_${eventSeq}`,
    type: eventType,
    amount,
    timestamp,
    txDigest,
    recipient,
    feeKind,
  };
}

// Merge and sort all event streams by timestamp descending
function mergeAndSort(...streams: DAppTaxEvent[][]): DAppTaxEvent[] {
  return streams.flat().sort((a, b) => b.timestamp - a.timestamp);
}

// Each page entry stores cursor snapshots for going back
interface PageCursor {
  depositCursor: { txDigest: string; eventSeq: string } | null;
  withdrawalCursor: { txDigest: string; eventSeq: string } | null;
  feeCursor: { txDigest: string; eventSeq: string } | null;
  drainCursor: { txDigest: string; eventSeq: string } | null;
}

const EMPTY_CURSOR: PageCursor = {
  depositCursor: null, withdrawalCursor: null, feeCursor: null, drainCursor: null,
};

export function useDAppTaxHistory(): UseDAppTaxHistoryResult {
  const [events, setEvents]     = useState<DAppTaxEvent[]>([]);
  const [loading, setLoading]   = useState<boolean>(false);
  const [error, setError]       = useState<string | null>(null);
  const [page, setPage]         = useState<number>(0);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false);

  // Cursor stack: index 0 = first page (null cursors), index 1 = after first page, etc.
  const [cursorStack, setCursorStack] = useState<PageCursor[]>([EMPTY_CURSOR]);

  const fetchPage = useCallback(async (
    pageIdx: number,
    stack: PageCursor[],
  ) => {
    if (!DAPP_HUB_PKG) return;
    setLoading(true);
    setError(null);

    const cursor = stack[pageIdx] ?? EMPTY_CURSOR;

    try {
      const depositType    = `${DAPP_HUB_PKG}::tax_wallet::TaxDepositEvent`;
      const withdrawalType = `${DAPP_HUB_PKG}::tax_wallet::TaxWithdrawEvent`;
      const feeType        = `${DAPP_HUB_PKG}::tax_wallet::FeeDepositEvent`;
      const drainType      = `${DAPP_HUB_PKG}::tax_wallet::EmergencyDrainEvent`;

      const [depositPage, withdrawalPage, feePage, drainPage] = await Promise.all([
        fetchEventPage(depositType, cursor.depositCursor),
        fetchEventPage(withdrawalType, cursor.withdrawalCursor),
        fetchEventPage(feeType, cursor.feeCursor),
        fetchEventPage(drainType, cursor.drainCursor),
      ]);

      const parse = (page: RawEventPage) =>
        page.data.flatMap(ev => { const p = parseRawEvent(ev); return p ? [p] : []; });

      const merged = mergeAndSort(
        parse(depositPage), parse(withdrawalPage), parse(feePage), parse(drainPage),
      );
      // Take only PAGE_SIZE for display
      const paginated = merged.slice(0, PAGE_SIZE);

      setEvents(paginated);
      setHasNextPage(
        depositPage.hasNextPage || withdrawalPage.hasNextPage ||
        feePage.hasNextPage || drainPage.hasNextPage || merged.length > PAGE_SIZE,
      );

      // Build next page cursor from the RPC-returned cursor (after all fetched items)
      const nextCursor: PageCursor = {
        depositCursor:    depositPage.nextCursor    ?? null,
        withdrawalCursor: withdrawalPage.nextCursor ?? null,
        feeCursor:        feePage.nextCursor        ?? null,
        drainCursor:      drainPage.nextCursor      ?? null,
      };

      // If we navigated forward, push next cursor only if it doesn't exist
      if (pageIdx >= stack.length - 1) {
        setCursorStack(prev => {
          const next = [...prev];
          if (next.length <= pageIdx + 1) {
            next.push(nextCursor);
          }
          return next;
        });
      }
    } catch (err) {
      console.error("[useDAppTaxHistory] fetchPage failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load tax history");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchPage(0, cursorStack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage]);

  const goNext = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage, cursorStack);
  }, [page, cursorStack, fetchPage]);

  const goPrev = useCallback(() => {
    if (page <= 0) return;
    const prevPage = page - 1;
    setPage(prevPage);
    fetchPage(prevPage, cursorStack);
  }, [page, cursorStack, fetchPage]);

  const refetch = useCallback(() => {
    // Reset to first page
    const resetStack: PageCursor[] = [EMPTY_CURSOR];
    setCursorStack(resetStack);
    setPage(0);
    fetchPage(0, resetStack);
  }, [fetchPage]);

  return {
    events,
    loading,
    error,
    page,
    hasNextPage,
    hasPrevPage: page > 0,
    goNext,
    goPrev,
    refetch,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
