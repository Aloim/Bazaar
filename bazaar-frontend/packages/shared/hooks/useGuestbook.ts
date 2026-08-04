// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { GUESTBOOK_BOARD_ID } from "@bazaar/shared/constants";
import type { GuestbookEntry } from "@bazaar/shared/types";
import { suiClient } from "./sui-client";

/** Returns true when the id is absent, empty, or a normalised 0x0…0 address. */
function isEmptyOrZeroId(id: string | undefined | null): boolean {
  if (!id) return true;
  return /^0x0+$/.test(id);
}

const decoder = new TextDecoder();

function decodeBytes(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") {
    try {
      const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
      const decoded = decoder.decode(bytes);
      if (/^[\x20-\x7E\r\n\t]+$/.test(decoded)) return decoded;
    } catch { /* not base64 */ }
    return raw;
  }
  if (Array.isArray(raw)) return decoder.decode(Uint8Array.from(raw as number[]));
  if (raw instanceof Uint8Array) return decoder.decode(raw);
  return String(raw);
}

function parseEntry(f: any): GuestbookEntry {
  return {
    id:          Number(f?.id ?? 0),
    author:      String(f?.author ?? ""),
    message:     decodeBytes(f?.message),
    createdAtMs: Number(f?.created_at_ms ?? 0),
  };
}

export interface UseGuestbookResult {
  entries: GuestbookEntry[];
  loading: boolean;
  refetch: () => void;
}

/**
 * @param boardId - Optional per-SSU GuestbookBoard ID resolved via useSSUSharedObjects.
 *                  Falls back to the legacy static GUESTBOOK_BOARD_ID env var when not supplied.
 *                  An empty string or 0x0…0 sentinel short-circuits the RPC fetch.
 *
 * Slice C2 / GAS-11 (V39): `GuestbookBoard.entries` was reshaped from an inline
 * `vector<GuestbookEntry>` to a `Table<u64, GuestbookEntry>` keyed by the monotonic
 * `id` (FIFO-capped at MAX_ENTRIES). Read path:
 *   1. read the board object → `entries.fields.id.id` is the Table's parent id,
 *   2. enumerate the Table dynamic fields (paginated `getDynamicFields`),
 *   3. read each row (`getDynamicFieldObject` → `content.fields.value.fields`).
 * Entries are returned sorted by id ascending (oldest first); GuestbookPanel reverses
 * for newest-first display. DF enumeration only — an event-derive would resurface
 * FIFO-evicted entries (eviction emits no EntryDeletedEvent).
 */
export function useGuestbook(boardId?: string | null): UseGuestbookResult {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick]       = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const effectiveBoardId = boardId ?? GUESTBOOK_BOARD_ID;
      if (isEmptyOrZeroId(effectiveBoardId)) {
        setEntries([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // 1. Read the board → the entries Table's parent id.
        const board = await suiClient.getObject({
          id: effectiveBoardId,
          options: { showContent: true },
        });
        const fields = (board.data?.content as { fields?: Record<string, any> } | undefined)?.fields;
        const tableId: string | undefined = fields?.entries?.fields?.id?.id;
        if (!tableId) {
          if (!cancelled) { setEntries([]); setLoading(false); }
          return;
        }

        // 2. Enumerate the Table dynamic fields (paginated).
        const names: Array<{ type: string; value: unknown }> = [];
        let cursor: string | null = null;
        do {
          const page = await suiClient.getDynamicFields({ parentId: tableId, cursor });
          for (const d of page.data) names.push(d.name as { type: string; value: unknown });
          cursor = page.hasNextPage ? (page.nextCursor ?? null) : null;
        } while (cursor);

        // 3. Read each row → GuestbookEntry.
        const rows = await Promise.all(names.map(async (name): Promise<GuestbookEntry | null> => {
          try {
            const row = await suiClient.getDynamicFieldObject({ parentId: tableId, name });
            const f = (row.data?.content as
              { fields?: { value?: { fields?: Record<string, any> } } } | undefined)
              ?.fields?.value?.fields;
            if (!f) return null;
            return parseEntry(f);
          } catch {
            return null;
          }
        }));

        const parsed = rows
          .filter((e): e is GuestbookEntry => e !== null)
          .sort((a, b) => a.id - b.id);

        if (!cancelled) {
          setEntries(parsed);
          setLoading(false);
        }
      } catch (e) {
        console.warn("[useGuestbook] RPC load failed:", e);
        if (!cancelled) {
          setEntries([]);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tick, boardId]);

  return { entries, loading, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
