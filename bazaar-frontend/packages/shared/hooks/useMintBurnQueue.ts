// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useMintBurnQueue — V16 hook for enumerating pending + historical
 * MintBurnRequest entries inside a MintBurnQueue's
 * `requests: Table<u64, MintBurnRequest>` via dynamic-field RPCs.
 *
 * Mirrors the shape of useVaultWithdrawals (same 3-step Table walk):
 *   1. sui_getObject(queueId, { showContent: true })
 *        → queue.fields.requests.fields.id.id is the Table's UID.
 *   2. suix_getDynamicFields(tableUid, cursor, null) — full pagination
 *        → list of u64 keys + per-key objectId of the Field<u64, MintBurnRequest>.
 *   3. sui_multiGetObjects(objectIds, { showContent: true })
 *        → unwrap each Field's `.value.fields` into a MintBurnRequest.
 *
 * `executableAfterMs` is stored on-chain (NOT derived) — unlike
 * useVaultWithdrawals where it's computed from `approved_at_ms + WAIT_PERIOD_MS`.
 * Pending requests in the mint/burn queue carry their executable timestamp at
 * creation since there's no quorum-approval intermediate state.
 *
 * Polls every 15s.
 */

import { useState, useEffect, useCallback } from "react";

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

/** Status values mirror MintBurnQueue Move constants. */
export const MINT_BURN_STATUS_PENDING  = 0;
export const MINT_BURN_STATUS_EXECUTED = 1;
export const MINT_BURN_STATUS_REJECTED = 2;

/** Kind values mirror MintBurnQueue Move constants. */
export const MINT_BURN_KIND_MINT = 0;
export const MINT_BURN_KIND_BURN = 1;

export interface MintBurnRequest {
  /** Queue-internal u64 key (NOT a Sui object ID). Pass tx.pure.u64 in PTBs. */
  id:                  number;
  tribeId:             number;
  kind:                number;   // 0=MINT, 1=BURN
  amount:              number;
  proposer:            string;
  createdAtMs:         number;
  executableAfterMs:   number;
  status:              number;   // 0=PENDING, 1=EXECUTED, 2=REJECTED
  rejectedBy:          string | null;
  executedBy:          string | null;
}

export interface UseMintBurnQueueResult {
  requests:  MintBurnRequest[];
  loading:   boolean;
  error:     string | null;
  refetch:   () => void;
}

/**
 * Unwrap a `Move Option<address>` JSON value.
 * Two shapes appear on the wire:
 *   - `null` / `undefined`            → null
 *   - `{ vec: ["0x.."] }` / `{ vec: [] }` → string | null
 *   - `["0x.."]` / `[]`                → string | null
 */
function unwrapOptionAddress(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) {
    return raw.length > 0 ? String(raw[0]) : null;
  }
  if (typeof raw === "object") {
    const obj = raw as { vec?: unknown };
    if (Array.isArray(obj.vec)) {
      return obj.vec.length > 0 ? String(obj.vec[0]) : null;
    }
  }
  if (typeof raw === "string") return raw;
  return null;
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
        value?: { fields?: Record<string, unknown> } | Record<string, unknown>;
      };
    };
  };
}

function parseRequest(rawValueFields: Record<string, unknown>): MintBurnRequest {
  return {
    id:                Number(rawValueFields.id ?? 0),
    tribeId:           Number(rawValueFields.tribe_id ?? 0),
    kind:              Number(rawValueFields.kind ?? 0),
    amount:            Number(rawValueFields.amount ?? 0),
    proposer:          String(rawValueFields.proposer ?? ""),
    createdAtMs:       Number(rawValueFields.created_at_ms ?? 0),
    executableAfterMs: Number(rawValueFields.executable_after_ms ?? 0),
    status:            Number(rawValueFields.status ?? 0),
    rejectedBy:        unwrapOptionAddress(rawValueFields.rejected_by),
    executedBy:        unwrapOptionAddress(rawValueFields.executed_by),
  };
}

/**
 * @param queueId — MintBurnQueue shared object ID. Resolve via
 *                  `useTribeAssets(tribeIdx).mintBurnQueueId`.
 *                  Null disables the hook.
 */
export function useMintBurnQueue(queueId: string | null): UseMintBurnQueueResult {
  const [requests, setRequests] = useState<MintBurnRequest[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!queueId) { setRequests([]); return; }
    setLoading(true);
    setError(null);

    try {
      // Step 1: resolve the Table's UID from inside the queue.
      const queueResult = await rpc("sui_getObject", [
        queueId,
        { showContent: true },
      ]) as { data?: { content?: { fields?: Record<string, unknown> } } } | null;

      const queueFields = queueResult?.data?.content?.fields;
      if (!queueFields) {
        setRequests([]);
        return;
      }
      const requestsField = queueFields.requests as
        | { fields?: { id?: { id?: string } }; id?: { id?: string } }
        | undefined;
      const tableUid: string =
        requestsField?.fields?.id?.id ?? requestsField?.id?.id ?? "";
      if (!tableUid) {
        setRequests([]);
        return;
      }

      // Step 2: enumerate all dynamic fields (u64 keys → Field<u64, MBR> objectIds).
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

      const parsed: MintBurnRequest[] = [];
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

      // Newest first
      parsed.sort((a, b) => b.createdAtMs - a.createdAtMs);
      setRequests(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error("[useMintBurnQueue]", msg);
    } finally {
      setLoading(false);
    }
  }, [queueId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!queueId) return;
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [queueId, fetchData]);

  return { requests, loading, error, refetch: fetchData };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
