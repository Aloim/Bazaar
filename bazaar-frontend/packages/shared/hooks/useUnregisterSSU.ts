// ============================================================
// useUnregisterSSU.ts — Mutation hook: deregister an SSU the
// caller owns from the Bazaar registry.
// Calls dapp_hub::ssu_registry::deregister_ssu_with_tribe_cleanup.
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dAppKit } from "@evefrontier/dapp-kit";
import { unregisterSSU as buildUnregisterSSU } from "../tx";

export interface UnregisterSSUArgs {
  /** On-chain SSU smart-assembly ID (address-form hex). */
  ssuId: string;
  /**
   * TribeGovernance shared object ID, if this SSU is tribe-affiliated.
   * Used only for cache invalidation of useTribeMembers.
   * Pass null for NoTribe SSUs or when the ID is not yet available.
   */
  tribeGovId: string | null;
}

export interface UnregisterSSUResult {
  digest: string;
}

/**
 * Mutation hook — unregister an SSU the caller owns.
 *
 * On success invalidates:
 *   ["my-ssus"]                             — MyRegisteredSSUs view
 *   ["all-ssus"]                            — admin SSUsTab view
 *   ["ssu-status", ssuId]                   — JoinTribeWindow conflict check
 *   ["bazaarcore","tribe-members",tribeGovId]  — if tribeGovId !== null
 *
 * Errors surface via React Query's error state; callers handle UI presentation.
 */
export function useUnregisterSSU() {
  const qc = useQueryClient();

  return useMutation<UnregisterSSUResult, Error, UnregisterSSUArgs>({
    mutationKey: ["unregister-ssu"],
    mutationFn: async ({ ssuId }) => {
      const tx = buildUnregisterSSU(ssuId);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") {
        throw new Error("Unregister transaction failed. Please try again.");
      }
      return { digest: result.digest };
    },
    onSuccess: (_data, { ssuId, tribeGovId }) => {
      qc.invalidateQueries({ queryKey: ["my-ssus"] });
      qc.invalidateQueries({ queryKey: ["all-ssus"] });
      qc.invalidateQueries({ queryKey: ["ssu-status", ssuId] });
      if (tribeGovId) {
        qc.invalidateQueries({
          queryKey: ["bazaarcore", "tribe-members", tribeGovId],
          exact: false,
        });
      }
    },
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
