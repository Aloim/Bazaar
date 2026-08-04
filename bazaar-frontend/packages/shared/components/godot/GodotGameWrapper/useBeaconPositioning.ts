// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useBeaconPositioning — R6.6.4 OS-14
 *
 * Adapts the individual beacon refs returned by useGodotBridge into the
 * BeaconRefs shape expected by <BeaconLayer/>. This is the residual ref-glue
 * layer after the per-beacon rAF positioning effects (Bazar1 lines 634-854)
 * were absorbed into BeaconLayer.tsx.
 *
 * Does NOT call any data hooks. Consumes bridge refs from useGodotBridge.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useMemo } from "react";
import type { RefObject } from "react";
import type { BeaconRefs } from "@bazaar/shared/components/BeaconLayer";
import type { BeaconScreenPos } from "@bazaar/shared/hooks/useGodotBridge";

export interface UseBeaconPositioningArgs {
  /** beaconScreenRef — Bazar1 name for the announcement beacon. Maps to beaconRefs.archive. */
  archiveBeaconRef:     RefObject<BeaconScreenPos | null>;
  guestbookBeaconRef:   RefObject<BeaconScreenPos | null>;
  tradeBeaconRef:       RefObject<BeaconScreenPos | null>;
  inventoryBeaconRef:   RefObject<BeaconScreenPos | null>;
  exchangeBeaconRef:    RefObject<BeaconScreenPos | null>;
  financeNewsBeaconRef: RefObject<BeaconScreenPos | null>;
  bazaarNewsBeaconRef:  RefObject<BeaconScreenPos | null>;
  missionBeaconRef:     RefObject<BeaconScreenPos | null>;
  skinPickerBeaconRef:  RefObject<BeaconScreenPos | null>;
}

/**
 * Returns the BeaconRefs adapter object for <BeaconLayer/>.
 * The object is stable across renders (useMemo with empty deps) because all
 * members are RefObjects whose .current is mutated in-place by useGodotBridge.
 */
export function useBeaconPositioning({
  archiveBeaconRef,
  guestbookBeaconRef,
  tradeBeaconRef,
  inventoryBeaconRef,
  exchangeBeaconRef,
  financeNewsBeaconRef,
  bazaarNewsBeaconRef,
  missionBeaconRef,
  skinPickerBeaconRef,
}: UseBeaconPositioningArgs): { beaconRefs: BeaconRefs } {
  // Stable object: RefObject references are stable by definition — .current mutates
  // but the ref object identity does not change. useMemo with [] is safe here.
  const beaconRefs: BeaconRefs = useMemo(
    () => ({
      archive:      archiveBeaconRef,
      guestbook:    guestbookBeaconRef,
      trade:        tradeBeaconRef,
      inventory:    inventoryBeaconRef,
      exchange:     exchangeBeaconRef,
      financeNews:  financeNewsBeaconRef,
      bazaarNews:   bazaarNewsBeaconRef,
      mission:      missionBeaconRef,
      skinPicker:   skinPickerBeaconRef,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { beaconRefs };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
