// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useTribeSSUTradeStats — per-SSU trade revenue/profit stats for a tribe.
 *
 * Replaces the on-chain `ssu_tax_accumulated` read (frozen by GAS-06 — the
 * trade hot path no longer writes that counter; see the Gas Optimization
 * program Slice B1). Instead of one pre-summed display number, this hook
 * derives the FULL per-SSU trade breakdown from the trade event log, which
 * carries strictly more information than the old counter ever did and costs
 * ZERO on-chain gas:
 *
 *   - trade count
 *   - gross volume (total routed through the SSU's shops)
 *   - ssu_tax  (the SSU owner's cut → SSU tax wallet)
 *   - tribe_tax (the tribe's cut → tribe wallet — what the old counter showed)
 *   - dapp_tax  (platform cut; Easy only — Advanced internal trades pay none)
 *   - net       (paid out to sellers)
 *
 * Event sources (filtered client-side by ssu_id ∈ the tribe's SSU set):
 *   - Easy (bazaar_type 1): bazaar_core::shop_ops_helpers::PurchaseEvent
 *       (anchored to ORIGINAL_PACKAGE_ID — Sweep-H: struct types retain the
 *        first-publish id across upgrades). Fields: gross_amount / ssu_tax /
 *        tribe_tax / dapp_tax / net_amount (EVE mist).
 *   - Advanced (bazaar_type 2): bazaar_economy::ledger_shop_ops::LedgerPurchaseEvent
 *       (anchored to BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID). Fields: gross_tokens /
 *        ssu_tax_tokens / tribe_tax_tokens / net_tokens (tribe tokens; no DApp tax).
 *
 * The SSU list comes from the caller (resolved from the LIVE dapp_hub
 * `tribe_registry::Tribe.ssu_ids` via useTribeRegistry), falling back to the
 * legacy `TribeGovernance.ssu_ids` only when no override is given — same source
 * discipline as the hook this replaces (the on-gov vector is dead/never-written
 * during normal registration).
 *
 * Session-cached (staleTime 5 min) so a SuperAdmin's tab visit pages the events
 * once; a manual Refresh (react-query refetch) re-pulls on demand. At high trade
 * volume the per-type paging should move to an indexer; the page budget below is
 * surfaced via `truncated` (never a silent cap).
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../sui-client";
import {
  SHARED_OBJECTS,
  ORIGINAL_PACKAGE_ID,
  BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID,
} from "../../constants";

export interface TribeSSUStatRow {
  ssuId: string;
  ownerAddress: string | null;
  tradeCount: number;
  /** raw amounts: EVE mist (Easy) or tribe tokens (Advanced). */
  gross: number;
  ssuTax: number;
  tribeTax: number;
  dappTax: number;
  net: number;
}

export interface TribeSSUStatsData {
  bazaarType: number;
  rows: TribeSSUStatRow[];
  /** true when event paging hit the page budget — figures are a recent-trades subset. */
  truncated: boolean;
}

type AnyFields = { fields?: Record<string, unknown> } | undefined;

// Page budget: 40 × 50 = up to 2000 of the most recent trade events per type.
// Plenty at testnet volume; bounded so a busy marketplace can't fan out unbounded RPC.
const MAX_EVENT_PAGES = 40;
const EVENT_PAGE_SIZE = 50;

interface Agg {
  tradeCount: number;
  gross: number;
  ssuTax: number;
  tribeTax: number;
  dappTax: number;
  net: number;
}

function emptyAgg(): Agg {
  return { tradeCount: 0, gross: 0, ssuTax: 0, tribeTax: 0, dappTax: 0, net: 0 };
}

interface ParsedTrade {
  ssuId: string;
  gross: number;
  ssuTax: number;
  tribeTax: number;
  dappTax: number;
  net: number;
}

function readPurchaseEvent(json: Record<string, unknown>): ParsedTrade {
  return {
    ssuId: String(json.ssu_id ?? ""),
    gross: Number(json.gross_amount ?? 0),
    ssuTax: Number(json.ssu_tax ?? 0),
    tribeTax: Number(json.tribe_tax ?? 0),
    dappTax: Number(json.dapp_tax ?? 0),
    net: Number(json.net_amount ?? 0),
  };
}

function readLedgerPurchaseEvent(json: Record<string, unknown>): ParsedTrade {
  return {
    ssuId: String(json.ssu_id ?? ""),
    gross: Number(json.gross_tokens ?? 0),
    ssuTax: Number(json.ssu_tax_tokens ?? 0),
    tribeTax: Number(json.tribe_tax_tokens ?? 0),
    dappTax: 0, // Advanced internal trades carry no DApp tax (charged only at the exchange).
    net: Number(json.net_tokens ?? 0),
  };
}

/**
 * Page every event of `eventType` (newest first), folding each row whose
 * ssu_id is in `wanted` into `acc`. Returns true if the page budget was hit
 * before exhausting the stream (so the caller can flag the figures as partial).
 */
async function aggregateEvents(
  eventType: string,
  wanted: Set<string>,
  acc: Map<string, Agg>,
  read: (json: Record<string, unknown>) => ParsedTrade,
): Promise<boolean> {
  let cursor: string | null = null;
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const res = await suiClient.queryEvents({
      query: { MoveEventType: eventType },
      cursor,
      limit: EVENT_PAGE_SIZE,
      descending_order: true,
    });
    for (const ev of res.data ?? []) {
      const json = ev.parsedJson;
      if (!json) continue;
      const t = read(json);
      if (!wanted.has(t.ssuId)) continue;
      const a = acc.get(t.ssuId) ?? emptyAgg();
      a.tradeCount += 1;
      a.gross += t.gross;
      a.ssuTax += t.ssuTax;
      a.tribeTax += t.tribeTax;
      a.dappTax += t.dappTax;
      a.net += t.net;
      acc.set(t.ssuId, a);
    }
    if (!res.hasNextPage || !res.nextCursor) return false;
    cursor = res.nextCursor;
  }
  // Reached the page budget with more pages available.
  console.warn(
    `[useTribeSSUTradeStats] page budget (${MAX_EVENT_PAGES}×${EVENT_PAGE_SIZE}) hit for ${eventType}; figures cover recent trades only.`,
  );
  return true;
}

export function useTribeSSUTradeStats(
  tribeGovId: string | null,
  /**
   * Canonical SSU list from the live dapp_hub Tribe.ssu_ids (via useTribeRegistry).
   * Overrides the dead TribeGovernance.ssu_ids fallback when non-empty.
   */
  ssuIdsOverride?: string[],
) {
  const overrideKey = (ssuIdsOverride ?? []).join(",");
  return useQuery<TribeSSUStatsData>({
    queryKey: ["bazaarcore", "tribe-ssu-trade-stats", tribeGovId, overrideKey],
    enabled: !!tribeGovId,
    staleTime: 5 * 60_000, // session cache — page once per visit; manual refetch refreshes.
    queryFn: async (): Promise<TribeSSUStatsData> => {
      const gov = await suiClient.getObject({
        id: tribeGovId!,
        options: { showContent: true },
      });
      const fields = (gov.data?.content as AnyFields)?.fields;
      if (!fields) return { bazaarType: 0, rows: [], truncated: false };

      const bazaarType = Number(fields.bazaar_type ?? 0);
      const ssuIds: string[] = (ssuIdsOverride && ssuIdsOverride.length > 0)
        ? ssuIdsOverride
        : (Array.isArray(fields.ssu_ids)
            ? (fields.ssu_ids as unknown[]).map(String)
            : []);
      if (ssuIds.length === 0) return { bazaarType, rows: [], truncated: false };

      // ── Aggregate trade events for this tribe's SSUs ──────────────────────
      const wanted = new Set(ssuIds);
      const acc = new Map<string, Agg>();
      let truncated = false;
      if (bazaarType === 2) {
        truncated = await aggregateEvents(
          `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::ledger_shop_ops::LedgerPurchaseEvent`,
          wanted, acc, readLedgerPurchaseEvent,
        );
      } else if (bazaarType === 1) {
        truncated = await aggregateEvents(
          `${ORIGINAL_PACKAGE_ID}::shop_ops_helpers::PurchaseEvent`,
          wanted, acc, readPurchaseEvent,
        );
      }
      // bazaarType 0 (NoTribe) has no tribe surface → no rows.

      // ── Resolve SSU owners (SSURegistry.registrations), fail-soft ─────────
      let regTableId: string | undefined;
      try {
        const reg = await suiClient.getObject({
          id: SHARED_OBJECTS.SSU_REGISTRY,
          options: { showContent: true },
        });
        regTableId = ((reg.data?.content as AnyFields)?.fields?.registrations as
          { fields?: { id?: { id?: string } } } | undefined)?.fields?.id?.id;
      } catch {
        regTableId = undefined; // owners render as Unknown
      }

      const rows = await Promise.all(
        ssuIds.map(async (ssuId): Promise<TribeSSUStatRow> => {
          let ownerAddress: string | null = null;
          if (regTableId) {
            try {
              const r = await suiClient.getDynamicFieldObject({
                parentId: regTableId,
                name: { type: "address", value: ssuId },
              });
              const wrapper = (r.data?.content as AnyFields)?.fields?.value as AnyFields;
              ownerAddress = (wrapper?.fields?.owner as string | undefined) ?? null;
            } catch {
              /* not registered / unreadable → null */
            }
          }
          const a = acc.get(ssuId) ?? emptyAgg();
          return {
            ssuId,
            ownerAddress,
            tradeCount: a.tradeCount,
            gross: a.gross,
            ssuTax: a.ssuTax,
            tribeTax: a.tribeTax,
            dappTax: a.dappTax,
            net: a.net,
          };
        }),
      );

      return { bazaarType, rows, truncated };
    },
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
