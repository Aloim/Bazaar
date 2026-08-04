// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { REGISTRATION_REQUEST_QUEUE_ID } from "@bazaar/shared/constants";
import { suiClient } from "./sui-client";

export interface RegistrationRequest {
  id:            number;   // TribeApplication.id — application_id for accept/reject TX
  tribeId:       number;   // TribeApplication.tribe_id
  applicant:     string;   // TribeApplication.applicant (address)
  ssuId:         string;   // TribeApplication.ssu_id (address)
  message:       string;   // TribeApplication.message (String)
  status:        number;   // 0=PENDING (all live rows are pending — see note below)
  submittedAtMs: number;   // TribeApplication.submitted_at (timestamp_ms)
}

interface Result {
  requests:  RegistrationRequest[];
  isLoading: boolean;
  error:     string | null;
  refetch:   () => void;
}

type AnyFields = { fields?: Record<string, unknown> } | undefined;

/** Decode a Move String (vector<u8>) that RPC may return as a plain string,
 *  { bytes: number[] }, or { fields: { bytes: number[] } }. */
function decodeMoveString(raw: unknown): string {
  if (typeof raw === "string") return raw;
  const bytes =
    (raw as { bytes?: number[] })?.bytes ??
    (raw as { fields?: { bytes?: number[] } })?.fields?.bytes;
  if (Array.isArray(bytes)) {
    try {
      return new TextDecoder().decode(new Uint8Array(bytes as number[]));
    } catch { /* fall through */ }
  }
  return "";
}

/**
 * Reads the pending tribe-registration applications.
 *
 * Slice C1 / GAS-09 (V39): `RegistrationRequestQueue.applications` was reshaped
 * from an inline `vector<TribeApplication>` to a `Table<u64, TribeApplication>`
 * with **remove-on-process** (accept/reject/cancel `table::remove` the row). So:
 *   1. read the queue object → `applications.fields.id.id` is the Table's parent id,
 *   2. enumerate the Table's dynamic fields (paginated `getDynamicFields`),
 *   3. read each row (`getDynamicFieldObject` → `content.fields.value.fields` is the
 *      TribeApplication struct).
 * Because processed rows are removed on-chain, every enumerated row is PENDING —
 * the old inline-vector + status-filter approach (and the `fields.applications`
 * array decode) no longer applies. Pattern mirrors useTribeMembers/useTribeBanList.
 *
 * Optional filterTribeId: when supplied, only applications where tribeId ===
 * filterTribeId are returned. Used by ApplicationsSubTab to show the leader's tribe.
 */
export function useRegistrationRequests(filterTribeId?: number): Result {
  const [requests, setRequests]   = useState<RegistrationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!REGISTRATION_REQUEST_QUEUE_ID) {
      setRequests([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // 1. Read the queue object → the applications Table's parent id.
      const queueObj = await suiClient.getObject({
        id: REGISTRATION_REQUEST_QUEUE_ID,
        options: { showContent: true },
      });
      const fields = (queueObj.data?.content as AnyFields)?.fields;
      const tableId =
        (fields?.applications as { fields?: { id?: { id?: string } } } | undefined)
          ?.fields?.id?.id;
      if (!tableId) {
        setRequests([]);
        return;
      }

      // 2. Enumerate the Table's dynamic fields (paginated).
      const names: Array<{ type: string; value: unknown }> = [];
      let cursor: string | null = null;
      do {
        const page = await suiClient.getDynamicFields({ parentId: tableId, cursor });
        for (const d of page.data) names.push(d.name as { type: string; value: unknown });
        cursor = page.hasNextPage ? (page.nextCursor ?? null) : null;
      } while (cursor);

      // 3. Read each row → TribeApplication.
      const parsed: RegistrationRequest[] = (await Promise.all(
        names.map(async (name): Promise<RegistrationRequest | null> => {
          try {
            const row = await suiClient.getDynamicFieldObject({ parentId: tableId, name });
            const f = (row.data?.content as
              { fields?: { value?: { fields?: Record<string, any> } } } | undefined)
              ?.fields?.value?.fields ?? {};
            const id = Number(f.id ?? -1);
            if (id < 0) return null;
            return {
              id,
              tribeId:       Number(f.tribe_id ?? 0),
              applicant:     String(f.applicant ?? ""),
              ssuId:         String(f.ssu_id ?? ""),
              message:       decodeMoveString(f.message),
              status:        Number(f.status ?? 0),
              submittedAtMs: Number(f.submitted_at ?? 0),
            };
          } catch {
            return null;
          }
        }),
      )).filter((r): r is RegistrationRequest => r !== null);

      // Apply optional tribe filter — set by ApplicationsSubTab (leader's tribe).
      const filtered = filterTribeId !== undefined
        ? parsed.filter(r => r.tribeId === filterTribeId)
        : parsed;

      setRequests(filtered);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load registration requests";
      console.warn("[useRegistrationRequests] fetch failed:", err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [filterTribeId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  return { requests, isLoading, error, refetch: fetchRequests };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
