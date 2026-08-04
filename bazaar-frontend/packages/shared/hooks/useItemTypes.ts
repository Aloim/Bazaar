// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect } from "react";
import { DATAHUB_BY_TENANT } from "@evefrontier/dapp-kit";

export interface ItemTypeInfo {
  name: string;
  iconUrl?: string;
}

/**
 * Module-level cache so repeated mounts / re-renders don't re-fetch.
 * Key: typeId, Value: resolved ItemTypeInfo (or null if fetch failed).
 */
const typeCache = new Map<number, ItemTypeInfo | null>();

/** Prevents duplicate catalog pre-fetch calls across re-mounts. */
let prefetchStarted = false;

/**
 * EVE datahub host resolution for item-name lookups.
 *
 * IMPORTANT (re-fixed 2026-06-26): **stillness = the LIVE/real world**, utopia = a
 * separate TESTSERVER. The 2026-06-25 world wipe ALSO ROTATED the live datahub host:
 *   OLD: world-api-stillness.live.TECH.evefrontier.com  (internal infra → browser-unreachable)
 *   NEW: world-api-stillness.live.PUB.evefrontier.com   (public → browser-reachable)
 * Source of truth: github.com/evefrontier/wallet-core `src/tenant/tenants.ts` (pushed on the
 * wipe day; its stillness entry carries the NEW world 0x8b8a46ed… + EVE 0xac361aa5… — the V40
 * ids). The dapp-kit bundled in node_modules (0.1.9, npm `latest`) was NOT republished after the
 * wipe, so its DATAHUB_BY_TENANT["stillness"] still returns the DEAD .tech. host — we must NOT
 * trust it for the live world. We hardcode the verified public host as the default instead.
 *
 * Host priority:
 *   1. VITE_DATAHUB_HOST   — explicit host override (set if EVE Frontier rotates the host again;
 *                            no code change needed).
 *   2. VITE_DATAHUB_TENANT — an EXPLICIT non-stillness tenant maps via dapp-kit DATAHUB_BY_TENANT
 *                            (note: that table is the pre-wipe v0.0.18 snapshot — may be stale).
 *   3. default             — STILLNESS_LIVE_DATAHUB_HOST (the new public host, hardcoded).
 * The in-game `?tenant=` is intentionally NOT honoured (item TYPE names are world-global), and
 * this is scoped to item-name resolution only — on-chain / coin tenant logic is untouched.
 */
const STILLNESS_LIVE_DATAHUB_HOST = "world-api-stillness.live.pub.evefrontier.com";

const DATAHUB_HOST_OVERRIDE =
  (import.meta.env.VITE_DATAHUB_HOST as string | undefined)?.trim() || "";
const DATAHUB_TENANT =
  (import.meta.env.VITE_DATAHUB_TENANT as string | undefined)?.trim() || "";

function resolveDatahubHost(): string {
  if (DATAHUB_HOST_OVERRIDE) return DATAHUB_HOST_OVERRIDE;
  // An explicit non-stillness tenant pin → dapp-kit table (pre-wipe snapshot, may be stale).
  if (DATAHUB_TENANT && DATAHUB_TENANT !== "stillness") {
    return (
      DATAHUB_BY_TENANT[DATAHUB_TENANT as keyof typeof DATAHUB_BY_TENANT] ??
      STILLNESS_LIVE_DATAHUB_HOST
    );
  }
  return STILLNESS_LIVE_DATAHUB_HOST;
}

/**
 * Fetch a single type's {name, iconUrl} from the reachable datahub host.
 * Replaces dapp-kit's getDatahubGameInfo(), which hard-defaults to the unreachable
 * STILLNESS host when no ?tenant= is present. Throws on non-OK / missing name so
 * the caller caches null and falls back to #typeId.
 */
async function fetchTypeInfo(typeId: number): Promise<ItemTypeInfo> {
  const host = resolveDatahubHost();
  const res = await fetch(`https://${host}/v2/types/${typeId}`);
  if (!res.ok) throw new Error(`datahub /v2/types/${typeId} -> ${res.status}`);
  const data = (await res.json()) as { name?: string; iconUrl?: string };
  if (!data?.name) throw new Error(`datahub /v2/types/${typeId} -> no name`);
  return { name: data.name, iconUrl: data.iconUrl || undefined };
}

/**
 * Fetches EVE Datahub type info for a list of typeIds.
 * Returns a Map<typeId, ItemTypeInfo> for all successfully resolved types.
 * Unknown / failed types are absent from the returned map (callers fall back to #typeId).
 */
export function useItemTypes(typeIds: number[]): Map<number, ItemTypeInfo> {
  const [resolved, setResolved] = useState<Map<number, ItemTypeInfo>>(
    () => buildMapFromCache(typeIds),
  );

  useEffect(() => {
    if (typeIds.length === 0) return;

    const unknown = [...new Set(typeIds)].filter(
      (id) => !typeCache.has(id),
    );

    if (unknown.length === 0) {
      setResolved(buildMapFromCache(typeIds));
      return;
    }

    let cancelled = false;

    Promise.allSettled(
      unknown.map((id) =>
        fetchTypeInfo(id).then((info) => ({ id, info })),
      ),
    ).then((results) => {
      if (cancelled) return;

      for (const result of results) {
        if (result.status === "fulfilled") {
          const { id, info } = result.value;
          typeCache.set(id, { name: info.name, iconUrl: info.iconUrl || undefined });
        } else {
          const id = unknown[results.indexOf(result)];
          typeCache.set(id, null);
        }
      }

      setResolved(buildMapFromCache(typeIds));
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeIds.join(",")]);

  return resolved;
}

/** Build a Map<typeId, ItemTypeInfo> from the module-level cache for the given ids. */
function buildMapFromCache(typeIds: number[]): Map<number, ItemTypeInfo> {
  const map = new Map<number, ItemTypeInfo>();
  for (const id of typeIds) {
    const cached = typeCache.get(id);
    if (cached != null) {
      map.set(id, cached);
    }
  }
  return map;
}

/**
 * Search the in-memory item type cache by name substring (case-insensitive).
 */
export function searchCachedItemTypes(
  query: string,
  limit = 10,
): Array<{ typeId: number; name: string; iconUrl?: string }> {
  if (query.trim().length === 0) return [];
  const lower = query.toLowerCase();
  const results: Array<{ typeId: number; name: string; iconUrl?: string }> = [];
  for (const [id, info] of typeCache.entries()) {
    if (info != null && info.name.toLowerCase().includes(lower)) {
      results.push({ typeId: id, name: info.name, iconUrl: info.iconUrl });
      if (results.length >= limit) break;
    }
  }
  return results;
}

/**
 * Pre-fetches the full EVE item type catalog from the datahub /v2/types endpoint.
 */
export async function prefetchAllItemTypes(): Promise<void> {
  if (prefetchStarted) return;
  prefetchStarted = true;

  try {
    // Reachable public host (new post-wipe stillness .pub. host by default).
    const host = resolveDatahubHost();

    const response = await fetch(`https://${host}/v2/types?limit=400`);
    if (!response.ok) {
      console.warn("[prefetchAllItemTypes] datahub /v2/types returned", response.status);
      prefetchStarted = false;
      return;
    }

    const json = await response.json() as {
      data: Array<{ id: number; name: string; iconUrl?: string }>;
    };

    for (const item of json.data) {
      if (item.id != null && item.name) {
        if (!typeCache.has(item.id)) {
          typeCache.set(item.id, { name: item.name, iconUrl: item.iconUrl });
        }
      }
    }
  } catch (err) {
    prefetchStarted = false;
    console.warn("[prefetchAllItemTypes] failed to fetch item catalog:", err);
  }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
