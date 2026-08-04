// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/storage/dev-override-store — Developer Godot URL override storage.
 *
 * Client-local localStorage wrapper. Maps SSU object IDs to developer-supplied
 * Godot base URLs. Written by DeveloperOverridePanel; read by AP2-E resolver (tier-2).
 *
 * Key: "bazaar:dev-override:ssu-urls"
 * Schema: Record<ssuId, DevOverrideEntry>
 *
 * No React imports — pure module, usable outside component context.
 * AP2-E consumer contract: import { getOverrideForSSU } from "@bazaar/shared/storage/dev-override-store"
 *
 * SDC-FP1-29-01 applied: JSON.parse failure → console.warn + removeItem (predictable state).
 *
 * Phase: AP2-D / FP1-29
 * File limit: 500 lines | Constitution Article XIV.4
 */

// ── Key ───────────────────────────────────────────────────────────────────────

/** localStorage key. Exported for tests and conflict-detection tools. */
export const DEV_OVERRIDE_STORAGE_KEY = "bazaar:dev-override:ssu-urls" as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DevOverrideEntry {
  /** Godot base URL — MUST pass validateGodotUrlForStorage before write. */
  devUrl: string;
  /** Milliseconds since epoch (Date.now() at write time). */
  addedAt: number;
}

/** Full map of all developer overrides keyed by SSU object ID. */
export type DevOverrideMap = Record<string, DevOverrideEntry>;

// ── Internal helpers ──────────────────────────────────────────────────────────

function readRaw(): DevOverrideMap {
  try {
    const raw = localStorage.getItem(DEV_OVERRIDE_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DevOverrideMap;
  } catch (e) {
    // SDC-FP1-29-01: malformed JSON → warn + clear so resolver state is predictable.
    // eslint-disable-next-line no-console
    console.warn(
      "[bazaar/shared] dev-override-store: malformed JSON in localStorage key " +
        `"${DEV_OVERRIDE_STORAGE_KEY}". Clearing to restore clean state.`,
      e,
    );
    try { localStorage.removeItem(DEV_OVERRIDE_STORAGE_KEY); } catch { /* ignore */ }
    return {};
  }
}

function writeRaw(map: DevOverrideMap): boolean {
  try {
    localStorage.setItem(DEV_OVERRIDE_STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read the full override map.
 * Returns empty object on missing key, malformed JSON, or localStorage unavailable.
 * Never throws.
 */
export function getOverrides(): DevOverrideMap {
  return readRaw();
}

/**
 * Read a single override for an SSU. Returns null when absent.
 * Used by AP2-E resolver tier-2 (dev-override) lookup.
 */
export function getOverrideForSSU(ssuId: string): string | null {
  return readRaw()[ssuId]?.devUrl ?? null;
}

/**
 * Insert or replace an override. Caller MUST pre-validate via validateGodotUrlForStorage.
 * Minimal length guard applied as defence-in-depth.
 * Returns true on success, false on storage failure (quota exceeded, private mode).
 */
export function setOverride(ssuId: string, devUrl: string): boolean {
  if (!ssuId.trim() || !devUrl.trim() || devUrl.length > 512) return false;
  const map = readRaw();
  map[ssuId] = { devUrl, addedAt: Date.now() };
  return writeRaw(map);
}

/**
 * Delete a single override by SSU ID. No-op if absent.
 * Returns true on success (including "already absent"), false on storage failure.
 */
export function removeOverride(ssuId: string): boolean {
  const map = readRaw();
  if (!(ssuId in map)) return true;
  delete map[ssuId];
  return writeRaw(map);
}

/**
 * Delete all overrides. Returns true on success (key removed or already absent),
 * false on failure.
 */
export function clearAll(): boolean {
  try {
    localStorage.removeItem(DEV_OVERRIDE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
