// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore trade hooks — useTradeProposals.
 *
 * Populates the Phase E stub (Option A resolution per FA-FP2-E-001 §2.3).
 *
 * Strategy (FA-FP2-E-001 §4):
 *   1. queryEvents for TradeProposalCreated, filter by proposer|counterparty.
 *   2. getDynamicFieldObject on TRADE_REGISTRY per proposal_id.
 *   3. Parse TradeProposal struct fields.
 *
 * STATUS_MAP: {0:"pending",1:"accepted",2:"rejected",3:"cancelled",4:"expired"}
 * matches trade.move L.16-20 constants exactly (differs from Bazar1 which uses
 * 0/2/4/5/6 for its two-phase status set).
 *
 * staleTime: 10s — background revalidation catches events from other clients.
 * enabled gate: walletAddress must be non-null.
 * Pagination: first 50 events descending — MVP known limit (FP1-10 future cursor).
 *
 * DEPLOYMENT GATE: If SHARED_OBJECTS.TRADE_REGISTRY is empty the queryFn returns []
 * without throwing — UI shows empty state. The runtime guard in TX builders handles
 * the write path.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { TradeProposal, TradeStatus } from "../../types/bazaarcore";
import { suiClient } from "../sui-client";
import { PACKAGE_IDS, SHARED_OBJECTS, BAZAAR_MISSION_ORIGINAL_PACKAGE_ID } from "../../constants";

// ── Status map (matches trade.move L.16-20) ────────────────────────────────────

const STATUS_MAP: Record<number, TradeStatus> = {
  0: 0,  // PENDING
  1: 1,  // ACCEPTED
  2: 2,  // REJECTED
  3: 3,  // CANCELLED
  4: 4,  // EXPIRED
};

// ── TradeItem parser ───────────────────────────────────────────────────────────

function parseTradeItem(raw: unknown): { itemTypeId: number; quantity: number } {
  const f = (raw as { fields: Record<string, unknown> }).fields;
  return {
    itemTypeId: Number(f.item_type_id ?? 0),
    quantity:   Number(f.quantity ?? 0),
  };
}

// ── ProposalId deduplication set helper ────────────────────────────────────────

function deduplicateIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

// ── useTradeProposals ──────────────────────────────────────────────────────────

/**
 * Fetch all trade proposals involving walletAddress (proposer or counterparty).
 *
 * Returns: { proposals, refetch, isLoading, isError }
 * refetch wraps queryClient.invalidateQueries — call after TX resolves.
 */
export function useTradeProposals(walletAddress: string | null): {
  proposals: TradeProposal[];
  refetch: () => void;
  isLoading: boolean;
  isError: boolean;
} {
  const queryClient = useQueryClient();

  const result = useQuery<TradeProposal[]>({
    queryKey: ["bazaarcore", "trade-proposals", walletAddress],
    enabled: !!walletAddress && !!SHARED_OBJECTS.TRADE_REGISTRY,
    staleTime: 10_000,
    queryFn: async (): Promise<TradeProposal[]> => {
      if (!walletAddress || !SHARED_OBJECTS.TRADE_REGISTRY) return [];

      // Step 1: query events to find proposal IDs for this wallet
      // V35 split: `trade` now lives in bazaar_mission — its events anchor to the
      // bazaar_mission defining package, NOT the bazaar_core ORIGINAL_PACKAGE_ID
      // (Run-#9 invariant 1; missing this = silent trade-UI blackout).
      let eventPage;
      try {
        eventPage = await suiClient.queryEvents({
          query: {
            MoveEventType: `${BAZAAR_MISSION_ORIGINAL_PACKAGE_ID}::trade::TradeProposalCreated`,
          },
          limit: 50,
          descending_order: true,
        });
      } catch (err) {
        console.warn("[useTradeProposals] event query failed:", err);
        return [];
      }

      const events = eventPage?.data ?? [];

      const relevantIds = events
        .filter(e => {
          const p = e.parsedJson ?? {};
          return p.proposer === walletAddress || p.counterparty === walletAddress;
        })
        .map(e => String((e.parsedJson ?? {}).proposal_id ?? ""))
        .filter(Boolean);

      const uniqueIds = deduplicateIds(relevantIds);
      if (uniqueIds.length === 0) return [];

      // Step 2: fetch each proposal from TradeRegistry Table via dynamic field
      const settled = await Promise.allSettled(
        uniqueIds.map(id =>
          suiClient.getDynamicFieldObject({
            parentId: SHARED_OBJECTS.TRADE_REGISTRY,
            name: { type: "0x2::object::ID", value: id },
          })
        )
      );

      // Step 3: parse fulfilled results; log+skip rejections
      const proposals: TradeProposal[] = [];
      settled.forEach((result, idx) => {
        if (result.status === "rejected") {
          console.warn(`[useTradeProposals] fetch failed for ID ${uniqueIds[idx]}:`, result.reason);
          return;
        }
        const obj = result.value;
        const fields = (obj?.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
        if (!fields) return;

        try {
          const statusNum = Number(fields.status ?? 0);
          const offeredItems = ((fields.offered_items as unknown[]) ?? []).map(parseTradeItem);
          const requestedItems = ((fields.requested_items as unknown[]) ?? []).map(parseTradeItem);
          const escrowedEveRaw = fields.escrowed_eve as { fields?: { value?: unknown } } | undefined;

          const proposal: TradeProposal = {
            id:             uniqueIds[idx],
            proposer:       String(fields.proposer ?? ""),
            counterparty:   String(fields.counterparty ?? ""),
            ssuId:          String(fields.ssu_id ?? ""),
            tribeId:        Number(fields.tribe_id ?? 0),
            bazaarType:     Number(fields.bazaar_type ?? 0) as 0 | 1 | 2,
            offeredItems,
            requestedItems,
            offeredEve:     Number(fields.offered_eve ?? 0),
            requestedEve:   Number(fields.requested_eve ?? 0),
            // escrowed_eve is a Balance<SUI> — serialized as { fields: { value: "N" } }
            // offeredEve (the declared amount) is sufficient for MVP display
            status:         STATUS_MAP[statusNum] ?? 0,
            createdAtMs:    Number(fields.created_at_ms ?? 0),
            expiryMs:       Number(fields.expiry_ms ?? 0),
          };
          // Suppress the escrowedEveRaw value — it's redundant with offeredEve in MVP
          void escrowedEveRaw;
          proposals.push(proposal);
        } catch (parseErr) {
          console.warn(`[useTradeProposals] parse failed for ID ${uniqueIds[idx]}:`, parseErr);
        }
      });

      return proposals;
    },
  });

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["bazaarcore", "trade-proposals", walletAddress],
    });
  }, [queryClient, walletAddress]);

  return {
    proposals: result.data ?? [],
    refetch,
    isLoading: result.isLoading,
    isError:   result.isError,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
