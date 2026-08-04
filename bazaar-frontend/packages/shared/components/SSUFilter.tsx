// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * SSUFilter.tsx — "Shop Filter" menu: bazaar-type-aware visibility tiers.
 *
 * Three toggles, each a colour-coded tier (see utils/shopTier.ts):
 *   My SSU   (yellow/orange) — shops on the current SSU. On by default.
 *   Tribe    (blue)          — NoTribe → all NoTribe shops; Easy/Advanced → same tribe.
 *   All others (red)         — every other bazaar.
 *
 * Default = My SSU only, so a fresh bazaar shows only its own shops (fixes
 * "Advanced shops appear in NoTribe"). State persists in localStorage; the Godot
 * beacon world reads the same persisted set via loadPersistedTierFilter().
 */

import { useState, useEffect, useCallback } from "react";
import { TIER_ORDER, TIER_COLOR, TIER_LABEL, type ShopTier } from "@bazaar/shared/utils/shopTier";

export const STORAGE_KEY = "bazar_shop_filter_v2";

/** "Hide all missions" preference key (Market & Missions window). When ON, the
 *  in-world mission stalls + the fixed kiosk MissionBeacon are suppressed — EXCEPT
 *  stalls of missions the wallet has accepted (handled by the consumer). Default OFF
 *  (missions shown). Persisted alongside the tier filter so both ride the same
 *  SHOP_FILTER_CHANGED_EVENT live-refresh. */
export const HIDE_MISSIONS_KEY = "bazar_hide_missions_v1";

/** Read the persisted "hide all missions" flag (default false → missions shown). */
export function loadHideMissions(): boolean {
  try {
    return localStorage.getItem(HIDE_MISSIONS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the "hide all missions" flag + fire SHOP_FILTER_CHANGED_EVENT so the
 *  Godot beacon bridge + BeaconLayer re-filter the in-world view live. */
export function persistHideMissions(hide: boolean) {
  try {
    localStorage.setItem(HIDE_MISSIONS_KEY, hide ? "1" : "0");
    window.dispatchEvent(new Event(SHOP_FILTER_CHANGED_EVENT));
  } catch {
    // Ignore storage errors.
  }
}

/** React-reactive read of the hide-missions flag — re-renders on the shared
 *  SHOP_FILTER_CHANGED_EVENT so consumers (BeaconLayer) stay in sync live. */
export function useHideMissions(): boolean {
  const [hide, setHide] = useState<boolean>(() => loadHideMissions());
  useEffect(() => {
    const h = () => setHide(loadHideMissions());
    window.addEventListener(SHOP_FILTER_CHANGED_EVENT, h);
    return () => window.removeEventListener(SHOP_FILTER_CHANGED_EVENT, h);
  }, []);
  return hide;
}

/** Default visible tiers — own SSU only. */
function defaultTiers(): Set<ShopTier> {
  return new Set<ShopTier>(["own"]);
}

/** Load the persisted enabled-tier set (own-only default). Shared with the
 *  Godot bridge so beacons and the list honour the same filter. */
export function loadPersistedTierFilter(): Set<ShopTier> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTiers();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return defaultTiers();
    const valid = arr.filter((t): t is ShopTier => TIER_ORDER.includes(t as ShopTier));
    // Empty persisted set would hide everything — fall back to own-only.
    return valid.length > 0 ? new Set<ShopTier>(valid) : defaultTiers();
  } catch {
    return defaultTiers();
  }
}

/** Fired whenever the persisted tier filter changes, so non-React consumers
 *  (the Godot beacon bridge) can re-filter the in-world view live. */
export const SHOP_FILTER_CHANGED_EVENT = "bazar-shop-filter-changed";

function persist(tiers: Set<ShopTier>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...tiers]));
    window.dispatchEvent(new Event(SHOP_FILTER_CHANGED_EVENT));
  } catch {
    // Ignore storage errors.
  }
}

interface Props {
  /** Per-tier shop counts to show next to each toggle (optional). */
  counts?: Record<ShopTier, number>;
  /** Notifies the parent whenever the enabled-tier set changes. */
  onChange: (enabled: Set<ShopTier>) => void;
}

export default function SSUFilter({ counts, onChange }: Props) {
  const [enabled, setEnabled] = useState<Set<ShopTier>>(() => loadPersistedTierFilter());
  const [hideMissions, setHideMissions] = useState<boolean>(() => loadHideMissions());

  // Notify parent + persist whenever the set changes (including initial mount).
  useEffect(() => {
    onChange(enabled);
    persist(enabled);
  }, [enabled, onChange]);

  const toggle = useCallback((tier: ShopTier) => {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(tier)) {
        // Never allow an empty set — keep at least "own" visible.
        if (next.size === 1) return prev;
        next.delete(tier);
      } else {
        next.add(tier);
      }
      return next;
    });
  }, []);

  return (
    <div className="ssu-filter">
      <div className="ssu-filter__header">
        <span className="ssu-filter__title muted" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
          Shop Filter
        </span>
      </div>
      <div className="ssu-filter__list">
        {TIER_ORDER.map(tier => {
          const count = counts?.[tier];
          return (
            <label key={tier} className="ssu-filter__item" title={TIER_LABEL[tier]}>
              <input
                type="checkbox"
                checked={enabled.has(tier)}
                onChange={() => toggle(tier)}
              />
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: "0.7rem",
                  height: "0.7rem",
                  borderRadius: "2px",
                  background: TIER_COLOR[tier],
                  marginRight: "0.35rem",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: "0.78rem" }}>
                {TIER_LABEL[tier]}{count != null ? ` (${count})` : ""}
              </span>
            </label>
          );
        })}
      </div>

      {/* Hide-all-missions — suppresses other players' mission stalls + the kiosk
          MissionBeacon in-world. Missions the wallet has ACCEPTED stay visible (so
          the taker can return to Complete). Own created stalls still appear under
          My Stalls; on the map they follow this toggle like any other stall. */}
      <label
        className="ssu-filter__item"
        title="Hide every mission stall and the Missions beacon in the world (your accepted missions stay visible)."
        style={{ marginTop: "0.5rem", borderTop: "1px solid var(--border, #333)", paddingTop: "0.5rem" }}
      >
        <input
          type="checkbox"
          checked={hideMissions}
          onChange={() => {
            const next = !hideMissions;
            setHideMissions(next);
            persistHideMissions(next);
          }}
        />
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: "0.7rem",
            height: "0.7rem",
            borderRadius: "2px",
            background: "#965adc",
            marginRight: "0.35rem",
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: "0.78rem" }}>Hide all missions</span>
      </label>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
