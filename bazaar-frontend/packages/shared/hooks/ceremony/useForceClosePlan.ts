// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1.1 — Step-2 "force-close everything" enumeration hook.
 *
 * The Move entries + TX builders for the admin force-close already exist
 * (close_all_shops_batch allow_ssu_owner=true; mission_admin_drain /
 * mission_ledger_ops force-settle + force-cancel). What was deferred was the
 * FE enumeration that groups the work into PTB-shaped units. This hook is that
 * enumeration.
 *
 * It reads the two ACTIVE-only vector tables — `BazarRegistry.shops_by_ssu`
 * and `MissionRegistry.missions_by_ssu` (the flat `shops` / `missions` tables
 * retain inactive rows, so they are NOT used here) — and shapes them into:
 *
 *   shopGroups[] — one row per (ssu, owner). close_all_shops_batch pins
 *                  recipient == shop.owner, so every shop in a group shares one
 *                  owner ⇒ one Character ⇒ one paged PTB.
 *   missions[]   — one row per active mission, with its live takers (the
 *                  AcceptanceKey dynamic fields still present == accepted minus
 *                  cancelled/expired/completed, i.e. collateral still escrowed).
 *
 * No shared-object / Character resolution happens here — that is done per row
 * by <ShopOwnerDrainRow /> and <MissionDrainRow /> via the existing resolution
 * hooks, which keeps this hook cheap and side-effect free.
 *
 * File limit: 500 lines | Constitution Article XIV.4 (exempt under UpdateCeremonyPlan).
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../sui-client";
import { BAZAR_REGISTRY_ID, MISSION_REGISTRY_ID } from "../../constants";
import type { BazaarTypeNum } from "../../types/bazaarcore";

const PAGE_LIMIT = 200;
const OBJ_CHUNK = 50;
const DEFAULT_POLL_MS = 15_000;

// ── Public shapes ──────────────────────────────────────────────────────────────

/** One PTB-shaped unit of shop drain work: every shop owned by `ownerAddress`
 *  at `ssuId`. recipientCharacter (resolved per row) is this owner's Character. */
export interface ShopOwnerGroup {
  /** `${ssuId}:${ownerAddress}` — stable React key. */
  key: string;
  ssuId: string;
  ownerAddress: string;
  shopIds: string[];
}

/** One active mission to force-cancel, with its live (collateral-holding) takers. */
export interface MissionDrainItem {
  missionId: string;
  ssuId: string;
  /** Mission owner == the giver; cancel routes reward back to their Character. */
  giverAddress: string;
  bazaarType: BazaarTypeNum;
  tribeId: number;
  title: string;
  runsInProgress: number;
  isSettled: boolean;
  /** AcceptanceKey takers still present on-chain (collateral still escrowed). */
  takers: string[];
}

export interface ForceClosePlan {
  shopGroups: ShopOwnerGroup[];
  missions: MissionDrainItem[];
  totalShops: number;
  totalMissions: number;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  refetch: () => void;
}

// ── Low-level table readers ──────────────────────────────────────────────────

async function fetchTableUid(parentObjectId: string, fieldName: string): Promise<string | null> {
  const obj = await suiClient.getObject({ id: parentObjectId, options: { showContent: true } });
  const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
  const tbl = fields?.[fieldName] as { fields?: { id?: { id?: string } } } | undefined;
  return tbl?.fields?.id?.id ?? null;
}

/**
 * Read a `Table<address, vector<ID>>` into Map<ssuId(lowercased), ID[]>.
 * Each dynamic field is `Field<address, vector<ID>>` whose content.fields holds
 * `{ name: <ssu address>, value: [id, ...] }`.
 */
async function readVectorTable(tableUid: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  let cursor: string | null = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page: { data: Array<{ objectId: string }>; nextCursor: string | null; hasNextPage: boolean } =
      await suiClient.getDynamicFields({ parentId: tableUid, cursor, limit: PAGE_LIMIT });
    if (page.data.length > 0) {
      const objs = await suiClient.multiGetObjects({
        ids: page.data.map((d) => d.objectId),
        options: { showContent: true },
      });
      for (const o of objs) {
        const f = (o.data?.content as { fields?: { name?: unknown; value?: unknown } } | undefined)?.fields;
        const ssu = typeof f?.name === "string" ? f.name.toLowerCase() : null;
        // C3/GAS-08 (shops_by_ssu) + C4/GAS-12 (missions_by_ssu): the per-SSU vector
        // elements are now {id,x,y,active} structs, not bare IDs. Extract .id; the
        // `?? el` fallback keeps pre-reshape bare-ID vectors working.
        const rawVec = Array.isArray(f?.value) ? (f!.value as any[]) : [];
        const vec = rawVec.map((el) => String(el?.fields?.id ?? el?.id ?? el));
        if (!ssu || vec.length === 0) continue;
        out.set(ssu, (out.get(ssu) ?? []).concat(vec));
      }
    }
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

// ── Shop grouping ────────────────────────────────────────────────────────────

async function buildShopGroups(shopsBySsu: Map<string, string[]>): Promise<ShopOwnerGroup[]> {
  const ids = [...shopsBySsu.values()].flat();
  const groups = new Map<string, ShopOwnerGroup>();
  for (let i = 0; i < ids.length; i += OBJ_CHUNK) {
    const chunk = ids.slice(i, i + OBJ_CHUNK);
    const objs = await suiClient.multiGetObjects({ ids: chunk, options: { showContent: true } });
    for (const o of objs) {
      const f = (o.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
      const id = o.data?.objectId;
      if (!f || !id) continue;
      if (!Boolean(f.is_active ?? false)) continue; // defensive: vector should be active-only
      const owner = String(f.owner ?? "");
      const ssuId = String(f.ssu_id ?? "").toLowerCase();
      if (!owner || !ssuId) continue;
      const key = `${ssuId}:${owner.toLowerCase()}`;
      const g = groups.get(key) ?? { key, ssuId, ownerAddress: owner, shopIds: [] };
      g.shopIds.push(id);
      groups.set(key, g);
    }
  }
  // Stable order: most shops first, then by key.
  return [...groups.values()].sort(
    (a, b) => b.shopIds.length - a.shopIds.length || a.key.localeCompare(b.key),
  );
}

// ── Mission rows ─────────────────────────────────────────────────────────────

/** Enumerate the live AcceptanceKey takers on a mission UID. A taker drops out
 *  of this list the moment their run completes / is cancelled / expires (the DF
 *  is removed), so the result == accepted minus settled. */
async function fetchMissionTakers(missionId: string): Promise<string[]> {
  const takers: string[] = [];
  let cursor: string | null | undefined = undefined;
  let hasNext = true;
  while (hasNext) {
    const page = await suiClient.getDynamicFields({ parentId: missionId, cursor: cursor ?? undefined });
    for (const df of page.data) {
      if (typeof df.name?.type === "string" && df.name.type.includes("::mission::AcceptanceKey")) {
        const v = (df.name.value as { taker?: string } | undefined)?.taker;
        if (typeof v === "string") takers.push(v);
      }
    }
    cursor = page.nextCursor;
    hasNext = page.hasNextPage;
  }
  return takers;
}

async function buildMissionItems(missionsBySsu: Map<string, string[]>): Promise<MissionDrainItem[]> {
  const entries: Array<{ ssuId: string; missionId: string }> = [];
  for (const [ssuId, ids] of missionsBySsu) for (const missionId of ids) entries.push({ ssuId, missionId });

  const items: MissionDrainItem[] = [];
  for (let i = 0; i < entries.length; i += OBJ_CHUNK) {
    const chunk = entries.slice(i, i + OBJ_CHUNK);
    const objs = await suiClient.multiGetObjects({
      ids: chunk.map((e) => e.missionId),
      options: { showContent: true },
    });
    for (let j = 0; j < objs.length; j++) {
      const f = (objs[j].data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
      const missionId = objs[j].data?.objectId ?? chunk[j].missionId;
      if (!f) continue;
      if (!Boolean(f.is_active ?? false)) continue;
      const takers = await fetchMissionTakers(missionId);
      items.push({
        missionId,
        ssuId: String(f.ssu_id ?? chunk[j].ssuId).toLowerCase(),
        giverAddress: String(f.owner ?? ""),
        bazaarType: Number(f.bazaar_type ?? 0) as BazaarTypeNum,
        tribeId: Number(f.tribe_id ?? 0),
        title: String(f.title ?? ""),
        runsInProgress: Number(f.runs_in_progress ?? 0),
        isSettled: Boolean(f.is_settled ?? false),
        takers,
      });
    }
  }
  // Settled-but-not-cancelled first (one step left), then by mission id.
  return items.sort(
    (a, b) => Number(b.isSettled) - Number(a.isSettled) || a.missionId.localeCompare(b.missionId),
  );
}

// ── Top-level enumeration ────────────────────────────────────────────────────

async function enumerateForceClosePlan(): Promise<{
  shopGroups: ShopOwnerGroup[];
  missions: MissionDrainItem[];
}> {
  const [shopUid, missionUid] = await Promise.all([
    fetchTableUid(BAZAR_REGISTRY_ID, "shops_by_ssu"),
    MISSION_REGISTRY_ID ? fetchTableUid(MISSION_REGISTRY_ID, "missions_by_ssu") : Promise.resolve(null),
  ]);
  const shopsBySsu = shopUid ? await readVectorTable(shopUid) : new Map<string, string[]>();
  const missionsBySsu = missionUid ? await readVectorTable(missionUid) : new Map<string, string[]>();
  const [shopGroups, missions] = await Promise.all([
    buildShopGroups(shopsBySsu),
    buildMissionItems(missionsBySsu),
  ]);
  return { shopGroups, missions };
}

/**
 * Enumerate every active shop (grouped by owner) + every active mission (with
 * its live takers) so the ceremony admin can drive force-close PTBs one
 * owner / mission at a time. Polls on the same 15s cadence as the count hooks.
 */
export function useForceClosePlan(pollIntervalMs: number = DEFAULT_POLL_MS): ForceClosePlan {
  const q = useQuery({
    queryKey: ["ceremony", "force-close-plan"],
    queryFn: enumerateForceClosePlan,
    enabled: !!BAZAR_REGISTRY_ID,
    staleTime: 10_000,
    refetchInterval: pollIntervalMs > 0 ? pollIntervalMs : false,
  });
  const shopGroups = q.data?.shopGroups ?? [];
  const missions = q.data?.missions ?? [];
  return {
    shopGroups,
    missions,
    totalShops: shopGroups.reduce((n, g) => n + g.shopIds.length, 0),
    totalMissions: missions.length,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error ? (q.error as Error).message : null,
    refetch: () => { void q.refetch(); },
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
