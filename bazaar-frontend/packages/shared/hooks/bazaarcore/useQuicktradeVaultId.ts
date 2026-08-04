// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useQuicktradeVaultId — resolves the per-SSU quicktrade vault object ID
 * from the SSUGovernance shared object.
 *
 * SSUGovernance carries `quicktrade_vault_id: ID` (plain ID, set atomically
 * during ssu_bootstrap; see BazaarCore/sources/ssu_governance.move:62). This
 * hook is the canonical FE source of the vault ID; the QUICKTRADE_VAULT_ID
 * env-var constant is a legacy fallback only.
 *
 * Move-side field type: ID (NOT Option<ID>).
 * On-chain RPC shape: a plain hex string "0x...".
 *
 * Returns:
 *   data      — the quicktrade vault object ID string, or null if missing.
 *   isLoading — true while the RPC call is in-flight.
 *   error     — any RPC error, or null on success.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../sui-client";

/** 24 hours — vault_id is immutable post-bootstrap. */
const STALE_MS = 24 * 60 * 60 * 1000;

export interface UseQuicktradeVaultIdResult {
  /** The quicktrade vault shared object ID for this SSU, or null when not set / loading. */
  data:      string | null;
  isLoading: boolean;
  error:     Error | null;
}

/**
 * Resolve the quicktrade vault object ID for a given SSUGovernance shared object.
 *
 * @param ssuGovId — SSUGovernance shared object ID (0x-prefixed hex), or null to disable.
 */
export function useQuicktradeVaultId(
  ssuGovId: string | null | undefined,
): UseQuicktradeVaultIdResult {
  const { data, isLoading, error } = useQuery<string | null, Error>({
    queryKey: ["bazaarcore", "quicktrade-vault-id", ssuGovId],
    enabled:  !!ssuGovId,
    staleTime: STALE_MS,
    gcTime:    STALE_MS,
    queryFn: async (): Promise<string | null> => {
      if (!ssuGovId) return null;
      const resp = await suiClient.getObject({
        id:      ssuGovId,
        options: { showContent: true },
      });
      const fields = (
        resp.data?.content as { fields?: Record<string, unknown> } | undefined
      )?.fields;
      if (!fields) return null;
      const raw = fields.quicktrade_vault_id;
      if (typeof raw !== "string" || raw.length === 0) return null;
      return raw;
    },
  });

  return {
    data:      data ?? null,
    isLoading,
    error:     error ?? null,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
