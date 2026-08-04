// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useSolarSystemName — resolve an SSU object id to its in-game solar-system
 * name (e.g. "IT5-C0B", "A 203591", "HX-56-661") for the Multi-SSU "Global"
 * inventory tab (Phase 4).
 *
 * Resolution chain (verified on testnet 2026-06-06 — see memory
 * `reference_ssu_solar_system_location`):
 *   1. On-chain: world `LocationRegistry { locations: Table<ID, Coordinates> }`
 *      keyed by the SSU object id. A keyed `getDynamicFieldObject` on the Table
 *      returns `Coordinates { solarsystem: u64, x, y, z }` — O(1), no event scan.
 *   2. Off-chain: the `solarsystem` u64 is NOT a name on-chain; resolve it via the
 *      EVE Frontier World API `GET <base>/v2/solarsystems/{id}` → `{ name, ... }`.
 *      `name` is the in-game-searchable name shown to the player.
 *
 * Both legs are Option-guarded: an SSU whose location was never revealed has no
 * Table entry (returns null); an unknown solarsystem id returns null. Callers
 * fall back to the abbreviated SSU id.
 *
 * Module-level caches dedupe across mounts (names are immutable).
 *
 * Env overrides (defaults target Stillness testnet so it works out-of-the-box):
 *   - VITE_WORLD_LOCATION_REGISTRY_ID — the world LocationRegistry object id.
 *   - VITE_WORLD_API_BASE             — World API base host.
 *   - VITE_SUI_RPC_ENDPOINT           — Sui fullnode (shared with other hooks).
 */

import { useState, useEffect } from "react";
import { WORLD_LOCATION_REGISTRY_ID } from "../constants";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

/** World LocationRegistry shared object (Stillness testnet default). Single
 *  source of truth via constants/index.ts — this file used to carry its OWN
 *  hardcoded fallback (`0xc87dca9c...`), a DIFFERENT, dead, pre-world-wipe
 *  address than the Move-side ssu_depreciation::LOCATION_REGISTRY_ID const.
 *  APM-ssu-depreciation-prune-P4b.md §6.H flagged the two-divergent-ids bug. */
const LOCATION_REGISTRY_ID = WORLD_LOCATION_REGISTRY_ID;

/** EVE Frontier World API base (Stillness testnet default). */
const WORLD_API_BASE =
  (import.meta.env.VITE_WORLD_API_BASE as string | undefined) ??
  "https://world-api-stillness.live.tech.evefrontier.com";

export interface SolarSystemInfo {
  /** In-game solar-system name (e.g. "IT5-C0B"). */
  name: string;
  /** On-chain solarsystem u64 id. */
  solarSystemId: number;
}

// ssuId → resolved info (or null = no on-chain location / unknown system).
const ssuCache = new Map<string, SolarSystemInfo | null>();
// In-flight de-dupe so concurrent mounts share one network round-trip per SSU.
const inflight = new Map<string, Promise<SolarSystemInfo | null>>();
// The LocationRegistry's inner `locations` Table id — read once, then reused.
let tableIdPromise: Promise<string | null> | null = null;

async function rpc(method: string, params: unknown[]): Promise<any> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const data = await resp.json();
  if (data?.error) throw new Error(data.error.message);
  return data.result;
}

/** Read the LocationRegistry once and cache its inner `locations` Table id. */
async function resolveTableId(): Promise<string | null> {
  if (!tableIdPromise) {
    tableIdPromise = (async () => {
      try {
        const obj = await rpc("sui_getObject", [
          LOCATION_REGISTRY_ID,
          { showContent: true },
        ]);
        const tableId: string | undefined =
          obj?.data?.content?.fields?.locations?.fields?.id?.id;
        return tableId ?? null;
      } catch (e) {
        console.warn("[useSolarSystemName] LocationRegistry read failed:", e);
        tableIdPromise = null; // allow retry on next request
        return null;
      }
    })();
  }
  return tableIdPromise;
}

/** Resolve an SSU id → SolarSystemInfo, or null when unresolvable. Cached. */
export async function resolveSolarSystem(ssuId: string): Promise<SolarSystemInfo | null> {
  if (!ssuId) return null;
  if (ssuCache.has(ssuId)) return ssuCache.get(ssuId)!;
  const existing = inflight.get(ssuId);
  if (existing) return existing;

  const job = (async (): Promise<SolarSystemInfo | null> => {
    try {
      const tableId = await resolveTableId();
      if (!tableId) return null;
      // Keyed Table lookup: Table<ID, Coordinates> → dynamic field by the SSU id.
      const field = await rpc("suix_getDynamicFieldObject", [
        tableId,
        { type: "0x2::object::ID", value: ssuId },
      ]);
      const coords = field?.data?.content?.fields?.value?.fields;
      const solarRaw = coords?.solarsystem;
      if (solarRaw == null) return null;
      const solarSystemId = Number(solarRaw);
      if (!Number.isFinite(solarSystemId) || solarSystemId <= 0) return null;

      // u64 → in-game name via World API. Isolate this leg in its own try: if the
      // name service is unreachable (network / CORS / 5xx), still return the
      // resolved system id so a successfully-located SSU never collapses to
      // "Unknown system" — only a truly unresolvable location (no Table entry,
      // handled above) yields null.
      try {
        const resp = await fetch(`${WORLD_API_BASE}/v2/solarsystems/${solarSystemId}`);
        if (resp.ok) {
          const json = (await resp.json()) as { name?: string };
          const name = json?.name?.trim();
          if (name) return { name, solarSystemId };
        }
      } catch (e) {
        console.warn("[useSolarSystemName] World API name lookup failed for", solarSystemId, e);
      }
      return { name: String(solarSystemId), solarSystemId };
    } catch (e) {
      console.warn("[useSolarSystemName] resolve failed for", ssuId, e);
      return null;
    } finally {
      inflight.delete(ssuId);
    }
  })();

  inflight.set(ssuId, job);
  const result = await job;
  ssuCache.set(ssuId, result);
  return result;
}

export interface UseSolarSystemNameResult {
  info: SolarSystemInfo | null;
  isLoading: boolean;
}

/** React hook wrapper around `resolveSolarSystem`. */
export function useSolarSystemName(ssuId: string | undefined): UseSolarSystemNameResult {
  const [info, setInfo] = useState<SolarSystemInfo | null>(
    () => (ssuId && ssuCache.has(ssuId) ? ssuCache.get(ssuId)! : null),
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => !!ssuId && !ssuCache.has(ssuId),
  );

  useEffect(() => {
    if (!ssuId) { setInfo(null); setIsLoading(false); return; }
    if (ssuCache.has(ssuId)) { setInfo(ssuCache.get(ssuId)!); setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);
    resolveSolarSystem(ssuId)
      .then(r => { if (!cancelled) { setInfo(r); setIsLoading(false); } })
      .catch(() => { if (!cancelled) { setInfo(null); setIsLoading(false); } });
    return () => { cancelled = true; };
  }, [ssuId]);

  return { info, isLoading };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
