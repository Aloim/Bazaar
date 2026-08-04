// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/hooks/useDAppClaimStatus.ts
// Reads the DAppOwnerClaimBox shared object to check if dApp ownership is claimable.
// Uses direct fullnode RPC (NOT dAppKit.getClient() which routes through stale GraphQL).

import { useSuiQuery } from "./useSuiQuery";
import { DAPP_OWNER_CLAIM_BOX_ID } from "@bazaar/shared/constants";
import { useMemo } from "react";

export interface UseDAppClaimStatusResult {
  /** True when the DAppOwnerClaimBox still holds an unclaimed DAppOwnerCap (Option is Some). */
  isClaimable: boolean;
  isLoading: boolean;
  /** Re-fetch the claim box. Call after a successful claim transaction. */
  refetch: () => void;
}

/**
 * Queries the on-chain DAppOwnerClaimBox to determine if the dApp ownership
 * is available to claim. The Move Option<DAppOwnerCap> field returns non-null
 * when the cap is present (claimable) and null when already claimed.
 */
export function useDAppClaimStatus(): UseDAppClaimStatusResult {
  const {
    data,
    isLoading,
    refetch,
  } = useSuiQuery<any>(
    "getObject",
    { id: DAPP_OWNER_CLAIM_BOX_ID, options: { showContent: true } },
    { enabled: !!DAPP_OWNER_CLAIM_BOX_ID },
  );

  const isClaimable = useMemo<boolean>(() => {
    if (isLoading || !data) return false;
    const fields = (data?.data?.content as any)?.fields ?? null;
    if (!fields) return false;
    // Move Option<DAppOwnerCap>: Sui RPC returns null for None, non-null object for Some
    return fields.cap !== null && fields.cap !== undefined;
  }, [data, isLoading]);

  return { isClaimable, isLoading, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
