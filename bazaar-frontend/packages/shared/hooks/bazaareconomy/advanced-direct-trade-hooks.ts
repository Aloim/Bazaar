// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V26 D6 — Advanced DirectTrade FE hooks.
 *
 * - useAdvancedTradeProposals(tribeId, walletAddress) — fetch proposals where
 *   the wallet is proposer OR receiver. Backed by Sui Move event scan over
 *   the propose / accept / refund event types; client-side filter by tribe +
 *   wallet match. Per-tribe registry ID is resolved upstream via
 *   `useTribeEconomyObjects().advancedTradeRegistryId`.
 *
 * The proposal lifecycle is collapsed client-side from 3 event types:
 *   AdvancedTradeProposed   → initial PENDING entry
 *   AdvancedTradeAccepted   → status updates to ACCEPTED
 *   AdvancedTradeRefunded   → status updates to CANCELLED | REJECTED | EXPIRED
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../sui-client";
import { BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID } from "../../constants";

export type AdvancedTradeStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "expired";

export interface AdvancedTradeProposal {
  proposalId: string;
  tribeId: number;
  proposer: string;
  receiver: string;
  offerEveMist: bigint;
  offerTokensScaled: bigint;
  requestEveMist: bigint;
  requestTokensScaled: bigint;
  status: AdvancedTradeStatus;
  createdAtMs: number;
  expiryMs: number;
  /** Last-status-change timestamp (proposed/accepted/refunded). */
  updatedAtMs: number;
}

// ── Event Types ───────────────────────────────────────────────────────────────

const ET_PROPOSED = `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::advanced_direct_trade::AdvancedTradeProposed`;
const ET_ACCEPTED = `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::advanced_direct_trade::AdvancedTradeAccepted`;
const ET_REFUNDED = `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::advanced_direct_trade::AdvancedTradeRefunded`;

const STATUS_BY_CODE: Record<number, AdvancedTradeStatus> = {
  0: "pending",
  1: "accepted",
  2: "rejected",
  3: "cancelled",
  4: "expired",
};

function bigintOr(v: unknown, fallback = 0n): bigint {
  if (typeof v === "string" || typeof v === "number") {
    try { return BigInt(v); } catch { return fallback; }
  }
  return fallback;
}

// ── useAdvancedTradeProposals ─────────────────────────────────────────────────

/**
 * Lists Advanced DirectTrade proposals for `walletAddress` within `tribeId`.
 * Returns the proposals + a refetch trigger to invalidate the query cache.
 */
export function useAdvancedTradeProposals(
  tribeId: number | null,
  walletAddress: string | null,
) {
  const q = useQuery<AdvancedTradeProposal[]>({
    queryKey: ["bazaareconomy", "advanced-trade-proposals", tribeId, walletAddress],
    enabled: tribeId !== null && tribeId > 0 && !!walletAddress,
    queryFn: async (): Promise<AdvancedTradeProposal[]> => {
      if (tribeId === null || !walletAddress) return [];
      // Pull all 3 event streams (capped at 200 each — sufficient for v1).
      const [proposed, accepted, refunded] = await Promise.all([
        suiClient.queryEvents({ query: { MoveEventType: ET_PROPOSED }, limit: 200, order: "descending" }),
        suiClient.queryEvents({ query: { MoveEventType: ET_ACCEPTED }, limit: 200, order: "descending" }),
        suiClient.queryEvents({ query: { MoveEventType: ET_REFUNDED }, limit: 200, order: "descending" }),
      ]);

      const map = new Map<string, AdvancedTradeProposal>();

      // Seed from Proposed events.
      for (const e of proposed.data) {
        const p = e.parsedJson as Record<string, unknown> | null;
        if (!p) continue;
        const tid = Number(p.tribe_id ?? -1);
        if (tid !== tribeId) continue;
        const proposer = String(p.proposer ?? "");
        const receiver = String(p.receiver ?? "");
        if (proposer !== walletAddress && receiver !== walletAddress) continue;
        const proposalId = String(p.proposal_id ?? "");
        if (!proposalId) continue;
        const created = Number(p.timestamp_ms ?? 0);
        map.set(proposalId, {
          proposalId,
          tribeId: tid,
          proposer,
          receiver,
          offerEveMist:        bigintOr(p.offer_eve_mist),
          offerTokensScaled:   bigintOr(p.offer_tokens_scaled),
          requestEveMist:      bigintOr(p.request_eve_mist),
          requestTokensScaled: bigintOr(p.request_tokens_scaled),
          status: "pending",
          createdAtMs: created,
          expiryMs: Number(p.expiry_ms ?? 0),
          updatedAtMs: created,
        });
      }

      // Apply Accepted updates.
      for (const e of accepted.data) {
        const p = e.parsedJson as Record<string, unknown> | null;
        if (!p) continue;
        const proposalId = String(p.proposal_id ?? "");
        const existing = map.get(proposalId);
        if (!existing) continue;
        existing.status = "accepted";
        existing.updatedAtMs = Number(p.timestamp_ms ?? existing.updatedAtMs);
      }

      // Apply Refunded updates (CANCELLED | REJECTED | EXPIRED).
      for (const e of refunded.data) {
        const p = e.parsedJson as Record<string, unknown> | null;
        if (!p) continue;
        const proposalId = String(p.proposal_id ?? "");
        const existing = map.get(proposalId);
        if (!existing) continue;
        const code = Number(p.final_status ?? 0);
        existing.status = STATUS_BY_CODE[code] ?? "cancelled";
        existing.updatedAtMs = Number(p.timestamp_ms ?? existing.updatedAtMs);
      }

      // Newest first.
      return [...map.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    },
    staleTime: 30 * 1000,        // 30s — events are eventually consistent
    gcTime: 5 * 60 * 1000,
  });

  return {
    proposals: q.data ?? [],
    isLoading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
