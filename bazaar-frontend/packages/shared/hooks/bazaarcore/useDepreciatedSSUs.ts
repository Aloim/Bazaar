// bazaar-frontend | SSU depreciation delist hook unioning certified event scan and existence probe signals
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useDepreciatedSSUs — the delist source for the V41 SSU depreciation / dead-bazaar
 * prune feature (Documentation/plans/implementation/ssu-depreciation-prune-plan.md §5).
 *
 * Unions TWO signals per world SSU (assembly) id:
 *   (a) CERTIFIED — bazaar_core::ssu_depreciation::SSUDepreciatedEvent has ever fired
 *       for this ssu_id. The certificate is terminal (plan §4 "never reset"), so a
 *       single bounded queryEvents scan is sufficient and safe to cache aggressively —
 *       this avoids resolving each candidate SSU's SSUGovernance object id via the
 *       expensive per-id useSSUGovId event-query pattern just to read one boolean.
 *   (b) PROBED — a batched `sui_multiGetObjects` existence check on the candidate
 *       world SSU ids. A `deleted` / absent response means the assembly was
 *       unanchored but no wallet has run `mark_ssu_depreciated` yet (plan §5 "the
 *       pre-mark window right after unanchor — the ghost must vanish immediately").
 *
 * Candidate ids are caller-supplied (the ssuIds currently referenced by loaded
 * shops/missions/admin rows) — the probe is deliberately scoped, never the whole
 * SSU registry.
 *
 * `certified` and `probedGone` are exposed separately (not just the union) so a
 * janitor UI can branch: certified -> the prune-page flow; probed-only -> the
 * "Mark depreciated" step must run first.
 *
 * Sweep H: SSUDepreciatedEvent is bazaar_core's OWN event -- anchor ORIGINAL_PACKAGE_ID
 * (never a rotating PACKAGE_IDS.* -- Documentation/reports/api-monitor/
 * APM-ssu-depreciation-prune-P4b.md §6.F).
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ORIGINAL_PACKAGE_ID } from "../../constants";
import { suiClient } from "../sui-client";

const MULTIGET_CHUNK = 50;
// N-1: stable shared identity for the "still loading" fallback (avoids a new
// Set allocation, and a new `depreciated` reference, every render pre-resolve).
const EMPTY: Set<string> = new Set();

/** All ssu_ids that have ever emitted SSUDepreciatedEvent. Terminal certificate —
 *  the Set only ever grows, so a moderate staleTime is safe (a fresh mark surfaces
 *  within one staleTime window, not instantly — acceptable for a single, globally
 *  shared, cached query). */
function useCertifiedDepreciatedSSUIds(enabled: boolean) {
  return useQuery<Set<string>>({
    queryKey: ["bazaarcore", "ssu-depreciated-certified"],
    enabled,
    queryFn: async (): Promise<Set<string>> => {
      const eventType = `${ORIGINAL_PACKAGE_ID}::ssu_depreciation::SSUDepreciatedEvent`;
      const events = await suiClient.queryEvents({ query: { MoveEventType: eventType }, limit: 1000 });
      if (events.data.length === 1000) {
        console.warn(
          "[useDepreciatedSSUs] queryEvents returned 1000 results (limit). " +
          "Cursor-based pagination not yet implemented. Some depreciated SSUs may be missing."
        );
      }
      const set = new Set<string>();
      for (const e of events.data) {
        const p = e.parsedJson as { ssu_id?: string } | null;
        if (typeof p?.ssu_id === "string") set.add(p.ssu_id.toLowerCase());
      }
      return set;
    },
    staleTime: 30_000,
  });
}

/** Batched existence probe on the candidate world SSU ids. A missing `.data` in
 *  the multiGetObjects response (deleted / notExists) is treated as depreciated-
 *  by-probe — covers the pre-mark window right after unanchor. */
function useSSUExistenceProbe(candidateSsuIds: string[], enabled: boolean) {
  const ids = useMemo(
    () => [...new Set(candidateSsuIds.filter(Boolean))].sort(),
    [candidateSsuIds],
  );
  const key = ids.join(",");
  return useQuery<Set<string>>({
    queryKey: ["bazaarcore", "ssu-existence-probe", key],
    enabled: enabled && ids.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      const gone = new Set<string>();
      for (let i = 0; i < ids.length; i += MULTIGET_CHUNK) {
        const chunk = ids.slice(i, i + MULTIGET_CHUNK);
        const objs = await suiClient.multiGetObjects({ ids: chunk, options: { showContent: false } });
        objs.forEach((o, idx) => {
          if (!o?.data) gone.add(chunk[idx].toLowerCase());
        });
      }
      return gone;
    },
    staleTime: 30_000,
  });
}

export interface UseDepreciatedSSUsResult {
  /** Union of certified + probedGone (lowercased ssu_id Set) — the delist source. */
  depreciated: Set<string>;
  /** SSUDepreciatedEvent has fired — the prune-page flow is available. */
  certified: Set<string>;
  /** Existence-probe-only (not yet certified) — only the "Mark depreciated" step
   *  is available; prune entries would abort E_NOT_DEPRECIATED. */
  probedGone: Set<string>;
  isLoading: boolean;
}

/**
 * @param candidateSsuIds - distinct world SSU ids currently referenced by loaded
 *   shops/missions/admin rows. The probe (signal b) is scoped to these; the
 *   certified scan (signal a) is global but shared/cached across every caller.
 * @param enabled - gate both RPC legs off (e.g. a collapsed accordion row —
 *   mirrors the useSSUOwners(ssuIds, isExpanded) gating convention).
 */
export function useDepreciatedSSUs(
  candidateSsuIds: string[],
  enabled = true,
): UseDepreciatedSSUsResult {
  const certifiedQ = useCertifiedDepreciatedSSUIds(enabled);
  const probedQ = useSSUExistenceProbe(candidateSsuIds, enabled);

  const certified = certifiedQ.data ?? EMPTY;
  const probedGone = probedQ.data ?? EMPTY;

  const depreciated = useMemo(() => {
    if (certified === EMPTY && probedGone === EMPTY) return EMPTY;
    const out = new Set<string>();
    certified.forEach((id) => out.add(id));
    probedGone.forEach((id) => out.add(id));
    return out;
  }, [certified, probedGone]);

  return { depreciated, certified, probedGone, isLoading: certifiedQ.isLoading || probedQ.isLoading };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
