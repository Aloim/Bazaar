// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/hooks/useVaultWithdrawals.ts
// Enumerates WithdrawalRequest entries inside a WithdrawalBoard's
// `requests: Table<u64, WithdrawalRequest>` via dynamic-field RPCs.
//
// V15 rewrite (was event-then-multiGet, all events targeted a Move event
// type that does not exist; rotated to Table dynamic-field walk):
//   1. sui_getObject(boardId, { showContent: true })
//        → board.fields.requests.fields.id.id is the Table's UID.
//   2. suix_getDynamicFields(tableUid, cursor, null)  — full pagination
//        → list of u64 keys + per-key objectId of the Field<u64, WR>.
//   3. sui_multiGetObjects(objectIds, { showContent: true })
//        → unwrap each Field's `.value.fields` into a WithdrawalRequest.
//
// Field names match the Move struct exactly (run-#11 invariant 5 — read
// the source, do not assume). VecSet<address> serializes as
// `{ fields: { contents: [...] } }` on the wire — `parseVecSetAddresses`
// unwraps the contents accessor.
//
// `executableAfter` is derived in TS, not stored on-chain. Move source
// defines WAIT_PERIOD_MS = 86_400_000 (24h); we mirror it here as a const.

import { useState, useEffect, useCallback } from "react";

const WAIT_PERIOD_MS = 86_400_000; // 24h — must match vault_withdrawal::WAIT_PERIOD_MS

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
  const json = await resp.json() as { result?: unknown; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result;
}

export interface VaultWithdrawalRequest {
  /** Board-internal u64 key (NOT a Sui object ID). Pass tx.pure.u64 in PTBs. */
  id:                 number;
  tribeId:            number;
  requester:          string;
  amountMist:         number;
  reason:             string;
  status:             number;   // 0=PENDING, 1=APPROVED, 2=EXECUTED,
                                // 3=CANCELLED, 4=EXPIRED, 5=DENIED
  approvals:          string[]; // VecSet<address>.contents
  denials:            string[];
  requiredApprovals:  number;
  createdAtMs:        number;
  approvedAtMs:       number;
  executedAtMs:       number;
  expiresAtMs:        number;
  /** Derived: approvedAtMs + WAIT_PERIOD_MS (24h). 0 while status === PENDING. */
  executableAfterMs:  number;
}

export interface UseVaultWithdrawalsResult {
  requests:  VaultWithdrawalRequest[];
  loading:   boolean;
  error:     string | null;
  refetch:   () => void;
}

function decodeReason(raw: unknown): string {
  // Move::String roundtrips as a UTF-8 string on the wire today (showContent).
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    try {
      return new TextDecoder().decode(new Uint8Array(raw as number[]));
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Unwrap a `VecSet<address>` JSON value:
 *   { fields: { contents: ["0x...", "0x..."] } }
 * Sui RPC also occasionally returns the bare `contents` form for non-`fields`
 * paths; we handle both.
 */
function parseVecSetAddresses(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return (raw as unknown[]).filter((x): x is string => typeof x === "string");
  }
  const obj = raw as { fields?: { contents?: unknown }; contents?: unknown };
  const inner = obj.fields?.contents ?? obj.contents;
  if (Array.isArray(inner)) {
    return (inner as unknown[]).filter((x): x is string => typeof x === "string");
  }
  return [];
}

interface DynamicFieldEntry {
  name?: { value?: unknown };
  objectId?: string;
}
interface DynamicFieldsPage {
  data?: DynamicFieldEntry[];
  nextCursor?: string | null;
  hasNextPage?: boolean;
}
interface MultiObjEntry {
  data?: {
    objectId?: string;
    content?: {
      fields?: Record<string, unknown> & {
        // Field<K, V>: { name, id, value: V } — value is the WithdrawalRequest
        value?: { fields?: Record<string, unknown> } | Record<string, unknown>;
      };
    };
  };
}

function parseRequest(rawValueFields: Record<string, unknown>): VaultWithdrawalRequest {
  const approvedAtMs = Number(rawValueFields.approved_at_ms ?? 0);
  const status       = Number(rawValueFields.status ?? 0);
  return {
    id:                Number(rawValueFields.id ?? 0),
    tribeId:           Number(rawValueFields.tribe_id ?? 0),
    requester:         String(rawValueFields.requester ?? ""),
    amountMist:        Number(rawValueFields.amount_mist ?? 0),
    reason:            decodeReason(rawValueFields.reason),
    status,
    approvals:         parseVecSetAddresses(rawValueFields.approvals),
    denials:           parseVecSetAddresses(rawValueFields.denials),
    requiredApprovals: Number(rawValueFields.required_approvals ?? 0),
    createdAtMs:       Number(rawValueFields.created_at_ms ?? 0),
    approvedAtMs,
    executedAtMs:      Number(rawValueFields.executed_at_ms ?? 0),
    expiresAtMs:       Number(rawValueFields.expires_at_ms ?? 0),
    executableAfterMs: approvedAtMs > 0 ? approvedAtMs + WAIT_PERIOD_MS : 0,
  };
}

/**
 * @param boardId — WithdrawalBoard shared object ID. Resolve via
 *                  `useTribeAssets(tribeIdx).withdrawalBoardId` or
 *                  `useTribeEconomyObjects(tribeGovId).data?.boardId`.
 *                  Null disables the hook.
 */
export function useVaultWithdrawals(boardId: string | null): UseVaultWithdrawalsResult {
  const [requests, setRequests] = useState<VaultWithdrawalRequest[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!boardId) { setRequests([]); return; }
    setLoading(true);
    setError(null);

    try {
      // Step 1: resolve the Table's UID from inside the board.
      const boardResult = await rpc("sui_getObject", [
        boardId,
        { showContent: true },
      ]) as { data?: { content?: { fields?: Record<string, unknown> } } } | null;

      const boardFields = boardResult?.data?.content?.fields;
      if (!boardFields) {
        setRequests([]);
        return;
      }
      const requestsField = boardFields.requests as
        | { fields?: { id?: { id?: string } }; id?: { id?: string } }
        | undefined;
      const tableUid: string =
        requestsField?.fields?.id?.id ?? requestsField?.id?.id ?? "";
      if (!tableUid) {
        setRequests([]);
        return;
      }

      // Step 2: enumerate all dynamic fields (u64 keys → Field<u64, WR> objectIds).
      const entries: Array<{ key: number; objectId: string }> = [];
      let cursor: string | null = null;
      let hasNext = true;
      while (hasNext) {
        const page = await rpc("suix_getDynamicFields", [tableUid, cursor, null]) as DynamicFieldsPage;
        for (const item of page.data ?? []) {
          const k = Number(item.name?.value ?? -1);
          if (k >= 0 && item.objectId) {
            entries.push({ key: k, objectId: item.objectId });
          }
        }
        cursor  = page.nextCursor ?? null;
        hasNext = page.hasNextPage === true;
      }

      if (entries.length === 0) { setRequests([]); return; }

      // Step 3: batch-fetch the field objects to read their value.
      const objs = await rpc("sui_multiGetObjects", [
        entries.map(e => e.objectId),
        { showContent: true },
      ]) as MultiObjEntry[] | null;

      const parsed: VaultWithdrawalRequest[] = [];
      for (const obj of objs ?? []) {
        const fieldFields = obj?.data?.content?.fields;
        if (!fieldFields) continue;
        const valueField = fieldFields.value as { fields?: Record<string, unknown> } | Record<string, unknown> | undefined;
        const reqFields: Record<string, unknown> =
          (valueField as { fields?: Record<string, unknown> })?.fields
            ?? (valueField as Record<string, unknown>)
            ?? {};
        parsed.push(parseRequest(reqFields));
      }

      // Stable ordering: newest first.
      parsed.sort((a, b) => b.createdAtMs - a.createdAtMs);
      setRequests(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error("[useVaultWithdrawals]", msg);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!boardId) return;
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [boardId, fetchData]);

  return { requests, loading, error, refetch: fetchData };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
