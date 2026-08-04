// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * announcement-board-fetch.ts
 *
 * Pure async helper: fetchAnnouncementsForBoard(boardId) fetches all
 * announcements from a SharedWidgets AnnouncementBoard shared object.
 *
 * Extracted from useAnnouncements.ts so that both the per-SSU hook
 * (useAnnouncements) and the tribe-level aggregating hook
 * (useTribeAnnouncements) can share the same RPC + parsing logic
 * without duplication.
 *
 * No React state. No useQuery. Pure fetch → parse → return.
 *
 * Scaling note (R1): a tribe with N SSUs triggers 2N+1 RPCs total
 * (1 TribeGovernance + N SSUGovernance + N board fetches). For tribes
 * beyond ~50 SSUs, consider batching via multiGetObjects. This is
 * acceptable at current scale; staleTime=30s caches the result.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { NETWORK } from "../constants";
import { debug } from "../utils/debug";

let _rpcId = 0;

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const resp = await fetch(NETWORK.RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++_rpcId, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const data: { error?: { message?: string }; result: unknown } = await resp.json();
  if (data?.error) throw new Error(data.error.message ?? "RPC error");
  return data.result;
}

// ── Exported types ─────────────────────────────────────────────────────────────

export interface CommentData {
  author:      string;
  text:        string;
  createdAtMs: number;
}

export interface AnnouncementData {
  id:          number;
  author:      string;
  title:       string;
  body:        string;
  visibility:  number;
  isSticky:    boolean;
  createdAtMs: number;
  comments:    CommentData[];
}

// ── Decoding helpers ───────────────────────────────────────────────────────────

const decoder = new TextDecoder();

function decodeBytes(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") {
    try {
      const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      const decoded = decoder.decode(bytes);
      if (/^[\x20-\x7E\r\n\t]+$/.test(decoded)) return decoded;
    } catch {
      /* not base64 — use as-is */
    }
    return raw;
  }
  if (Array.isArray(raw)) return decoder.decode(Uint8Array.from(raw as number[]));
  if (raw instanceof Uint8Array) return decoder.decode(raw);
  return String(raw);
}

function parseComment(c: unknown): CommentData {
  const f = (c as { fields?: Record<string, unknown> })?.fields ?? (c as Record<string, unknown>);
  return {
    author:      String(f?.author ?? ""),
    text:        decodeBytes(f?.text),
    createdAtMs: Number(f?.created_at_ms ?? 0),
  };
}

function parseAnnouncement(
  id: number,
  raw: unknown,
  stickyId: number | null,
): AnnouncementData {
  const r = raw as Record<string, unknown> | null | undefined;
  const f =
    (r?.fields as { value?: { fields?: Record<string, unknown> } } | undefined)?.value?.fields ??
    (r?.value as { fields?: Record<string, unknown> } | undefined)?.fields ??
    (r?.fields as Record<string, unknown> | undefined) ??
    (r as Record<string, unknown> | undefined) ??
    {};

  debug("[parseAnnouncement] id:", id, "f:", JSON.stringify(f).slice(0, 400));

  const rawComments: unknown[] = Array.isArray(f?.comments) ? (f.comments as unknown[]) : [];
  return {
    id,
    author:      String(f?.author ?? ""),
    title:       decodeBytes(f?.title),
    body:        decodeBytes(f?.body),
    visibility:  Number(f?.visibility ?? 0),
    isSticky:    stickyId === id,
    createdAtMs: Number(f?.created_at_ms ?? 0),
    comments:    rawComments.map(parseComment),
  };
}

// ── Shared fetch helper ────────────────────────────────────────────────────────

/**
 * Fetch all announcements from an AnnouncementBoard shared object.
 *
 * @param boardId — the Sui object ID of the AnnouncementBoard.
 * @returns AnnouncementData[] — unsorted (caller is responsible for ordering).
 * @throws on RPC failure (caller should use Promise.allSettled for resilience).
 */
export async function fetchAnnouncementsForBoard(
  boardId: string,
): Promise<AnnouncementData[]> {
  const boardResult = await rpc("sui_getObject", [boardId, { showContent: true }]);
  const br = boardResult as {
    data?: { content?: { fields?: Record<string, unknown> } };
  };
  const boardFields = br?.data?.content?.fields ?? {};

  const rawSticky = boardFields?.sticky_id;
  const parsedStickyId: number | null =
    rawSticky == null ? null : Number(rawSticky);

  const announcementIds: number[] = (
    Array.isArray(boardFields?.announcement_ids) ? boardFields.announcement_ids : []
  ).map(Number);

  const tableIdRaw = boardFields?.announcements;
  const tableId: string | undefined = (
    tableIdRaw as { fields?: { id?: { id?: string } } } | undefined
  )?.fields?.id?.id;

  debug("[fetchAnnouncementsForBoard] boardId:", boardId, { announcementIds, tableId, parsedStickyId });

  if (!tableId || announcementIds.length === 0) return [];

  const settled = await Promise.allSettled(
    announcementIds.map(async (id) => {
      const fieldResult = await rpc("suix_getDynamicFieldObject", [
        tableId,
        { type: "u64", value: String(id) },
      ]);
      const fr = fieldResult as { data?: { content?: { fields?: unknown } } };
      return parseAnnouncement(id, fr?.data?.content?.fields, parsedStickyId);
    }),
  );

  return settled
    .filter(
      (r): r is PromiseFulfilledResult<AnnouncementData> => r.status === "fulfilled",
    )
    .map((r) => r.value);
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
