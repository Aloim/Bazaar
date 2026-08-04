// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useMemo } from "react";
import { useSuiQuery } from "./useSuiQuery";
import { CLAIM_BOX_ID } from "@bazaar/shared/constants";

export interface UseClaimBoxResult {
  /** True while the OwnerClaimBox still holds an unclaimed OwnerCap. */
  isClaimable: boolean;
  /**
   * Currency display name for UI labels.
   * Advanced app passes tokenSymbol from useTribeTokenSymbol; others default to "EVE".
   */
  currencyName: string;
  isLoading: boolean;
  /** Re-fetch the OwnerClaimBox object. Call after a successful claim transaction. */
  refetch: () => void;
}

/**
 * Options for useClaimBox.
 *
 * tokenSymbol: when provided (non-null), overrides the default "EVE" currency label.
 * Used by the Advanced app to propagate the tribe token symbol into HUD/bridge displays.
 * NoTribe and Easy apps omit this option — they always show "EVE".
 */
export interface UseClaimBoxOptions {
  tokenSymbol?: string | null;
}

/**
 * Queries the on-chain OwnerClaimBox to determine whether the dApp has been claimed yet.
 * Currency name defaults to "EVE"; Advanced app may override via opts.tokenSymbol.
 */
export function useClaimBox(opts: UseClaimBoxOptions = {}): UseClaimBoxResult {
  const {
    data: boxData,
    isLoading: boxLoading,
    refetch: refetchBox,
  } = useSuiQuery<any>("getObject", {
    id: CLAIM_BOX_ID,
    options: { showContent: true },
  });

  const isClaimable = useMemo<boolean>(() => {
    if (boxLoading || !boxData) return false;
    const fields = (boxData?.data?.content as any)?.fields ?? null;
    if (!fields) return false;
    // Move Option<T>: Sui RPC returns null for None, non-null object for Some
    return fields.cap !== null && fields.cap !== undefined;
  }, [boxData, boxLoading]);

  // Phase 12: currency name derived from opts.tokenSymbol when provided (Advanced app).
  // Falls back to "EVE" for NoTribe and Easy apps (no tribe token).
  // STUB-02 note: RoleRegistry Move struct never existed in V6+ — "EVE" default is correct for NoTribe/Easy.
  const currencyName = opts.tokenSymbol ?? "EVE";

  function refetch() {
    refetchBox();
  }

  return {
    isClaimable,
    currencyName,
    isLoading: boxLoading,
    refetch,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
