// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy withdrawal hooks.
 *
 * useWithdrawalBoard    — full WithdrawalBoard shared object (top-level fields)
 * useWithdrawalRequest  — single WithdrawalRequest by ID (from board.requests Table)
 * useWithdrawalRequests — all requests (via WithdrawalRequestedEvent enumeration)
 *
 * @depends useTribeEconomyObjects for boardId
 *
 * Move source: bazaar_economy::vault_withdrawal::WithdrawalBoard
 *
 * NOTE: requests is Table<u64, WithdrawalRequest> in Move.
 *   - Single request: getDynamicFieldObject with u64 key
 *   - All requests: getDynamicFields to enumerate keys, then fetch each
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../sui-client";
import type { WithdrawalBoard, WithdrawalRequest } from "../../types/bazaareconomy";

// ── useWithdrawalBoard ─────────────────────────────────────────────────────────

/**
 * Fetch the WithdrawalBoard shared object (top-level fields only).
 *
 * RPC: suiClient.getObject({ id: boardId, options: { showContent: true } })
 *
 * NOTE: The requests Table is excluded — fetch individual requests via
 * useWithdrawalRequest or enumerate via useWithdrawalRequests.
 */
export function useWithdrawalBoard(boardId: string | null) {

  return useQuery<WithdrawalBoard | null>({
    queryKey: ["bazaareconomy", "withdrawal-board", boardId],
    enabled: !!boardId,
    queryFn: async (): Promise<WithdrawalBoard | null> => {
      const obj = await suiClient.getObject({
        id: boardId!,
        options: { showContent: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") return null;
      const f = obj.data.content.fields as Record<string, unknown>;
      return {
        id: boardId!,
        tribeId: Number(f.tribe_id),
        nextRequestId: Number(f.next_request_id),
        requiredApprovals: Number(f.required_approvals),
        waitPeriodMs: Number(f.wait_period_ms),
      };
    },
    staleTime: 15_000,
  });
}

// ── useWithdrawalRequest ───────────────────────────────────────────────────────

/**
 * Fetch a single WithdrawalRequest by ID from the board.requests Table.
 *
 * RPC: suiClient.getDynamicFieldObject({
 *   parentId: boardId,
 *   name: { type: "u64", value: String(requestId) },
 * })
 *
 * approvals and denials are VecSet<address> in Move — exposed as counts only
 * (vec_set::size). The actual voter sets are not returned for display.
 *
 * SA-005: requiredApprovals is a snapshot per-request field, not from the board.
 */
export function useWithdrawalRequest(
  boardId: string | null,
  requestId: number | null
) {

  return useQuery<WithdrawalRequest | null>({
    queryKey: ["bazaareconomy", "withdrawal-request", boardId, requestId],
    enabled: !!(boardId && requestId !== null && requestId >= 0),
    queryFn: async (): Promise<WithdrawalRequest | null> => {
      const result = await suiClient.getDynamicFieldObject({
        parentId: boardId!,
        name: { type: "u64", value: String(requestId) },
      });
      if (!result.data?.content || result.data.content.dataType !== "moveObject") return null;
      const f = result.data.content.fields as Record<string, unknown>;
      const approvals = f.approvals as { fields: { contents: unknown[] } };
      const denials   = f.denials   as { fields: { contents: unknown[] } };
      return {
        id: requestId!,
        tribeId: Number(f.tribe_id),
        requester: f.requester as string,
        amountMist: Number(f.amount_mist),
        reason: f.reason as string,
        approvalCount: approvals?.fields?.contents?.length ?? 0,
        denialCount: denials?.fields?.contents?.length ?? 0,
        requiredApprovals: Number(f.required_approvals),
        status: Number(f.status) as import("../../types/bazaareconomy").WithdrawalStatus,
        createdAtMs: Number(f.created_at_ms),
        approvedAtMs: Number(f.approved_at_ms),
        executedAtMs: Number(f.executed_at_ms),
        expiresAtMs: Number(f.expires_at_ms),
      };
    },
    staleTime: 10_000,
  });
}

// ── useWithdrawalRequests ──────────────────────────────────────────────────────

/**
 * Fetch all WithdrawalRequests for a tribe's board.
 *
 * Strategy: suiClient.getDynamicFields on boardId to enumerate Table keys,
 * then getDynamicFieldObject for each key to fetch request content.
 *
 * Alternative (if event-based is preferred): Query WithdrawalRequestedEvent
 * filtered by tribe_id to collect all request IDs, then fetch each by ID.
 *
 * This stub uses the getDynamicFields approach as it does not require knowing
 * all request IDs upfront and works even if events are not indexed.
 */
export function useWithdrawalRequests(boardId: string | null) {

  return useQuery<WithdrawalRequest[]>({
    queryKey: ["bazaareconomy", "withdrawal-requests", boardId],
    enabled: !!boardId,
    queryFn: async (): Promise<WithdrawalRequest[]> => {
      const fields = await suiClient.getDynamicFields({ parentId: boardId! });
      if (fields.data.length >= 50) {
        console.warn(
          "[useWithdrawalRequests] getDynamicFields returned 50 results (limit). " +
          "Cursor-based pagination is not yet implemented — some requests may be missing."
        );
      }
      const results = await Promise.all(
        fields.data.map(async (field) => {
          const r = await suiClient.getDynamicFieldObject({
            parentId: boardId!,
            name: field.name,
          });
          if (!r.data?.content || r.data.content.dataType !== "moveObject") return null;
          const f = r.data.content.fields as Record<string, unknown>;
          const approvals = f.approvals as { fields: { contents: unknown[] } };
          const denials   = f.denials   as { fields: { contents: unknown[] } };
          return {
            id: Number(f.id),
            tribeId: Number(f.tribe_id),
            requester: f.requester as string,
            amountMist: Number(f.amount_mist),
            reason: f.reason as string,
            approvalCount: approvals?.fields?.contents?.length ?? 0,
            denialCount: denials?.fields?.contents?.length ?? 0,
            requiredApprovals: Number(f.required_approvals),
            status: Number(f.status) as import("../../types/bazaareconomy").WithdrawalStatus,
            createdAtMs: Number(f.created_at_ms),
            approvedAtMs: Number(f.approved_at_ms),
            executedAtMs: Number(f.executed_at_ms),
            expiresAtMs: Number(f.expires_at_ms),
          } satisfies WithdrawalRequest;
        })
      );
      return results.filter((r): r is WithdrawalRequest => r !== null);
    },
    staleTime: 15_000,
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
