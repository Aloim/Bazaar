// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/hooks/bazaarcore/governance-resolution-hooks
 *
 * Resolves SSU and Tribe governance shared-object IDs from on-chain events.
 *
 * useSSUGovId   — queries SSUGovernanceCreated event by ssu_id, returns the
 *                 SSUGovernance shared object ID created in that TX.
 * useTribeGovId — queries TribeGovernanceCreated event by tribe_id, returns the
 *                 TribeGovernance shared object ID created in that TX.
 * useSSUSharedObjects — queries SSUGovernanceCreated event by ssu_id and resolves
 *                 all 7 per-SSU shared object IDs (ssuGovId + userStorageId + 5
 *                 from parsedJson).
 *
 * Both hooks use queryEvents (default: ascending order — first-bootstrap-wins
 * semantics, defends against re-bootstrap from FP1-38 hardening gap).
 * Caching: staleTime=Infinity (governance object IDs are immutable after creation).
 *
 * SDC-006 — Transient mis-classification window:
 *   useResolvedGodotUrl checks `ssuGovId` / `tribeGovId` to classify URL source.
 *   While these resolver hooks are in-flight (isLoading=true), the IDs are null,
 *   which causes useResolvedGodotUrl to fall back to "default" source instead of
 *   "ssu" or "tribe". This is a transient condition that self-resolves once the
 *   events are fetched. No action needed — the downstream hooks merely return null
 *   during the in-flight window and the resolver correctly reflects that. The window
 *   exists only on first mount (before React Query cache is populated).
 *
 * Constitution: Article III.2 (shared canonical), XIV.2 (file-manager creates),
 *               XIV.4 (500-line ceiling).
 * Phase: FP1-24 EXPANDED + OS-54-followup FE-A
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { suiClient } from "../sui-client";
import { resolveCreatedIdsBySuffix } from "../created-object-resolver";
import { PACKAGE_IDS, ORIGINAL_PACKAGE_ID } from "../../constants";

// ── Type Suffix Constants (SDC-001) ───────────────────────────────────────────

/**
 * Type suffix used to identify SSUGovernance created objects in TX objectChanges.
 * Exported for callers that need to match SSUGovernance objects by type.
 */
export const SSU_GOV_TYPE_SUFFIX = "ssu_governance::SSUGovernance" as const;

/**
 * Type suffix used to identify TribeGovernance created objects in TX objectChanges.
 * Exported for callers that need to match TribeGovernance objects by type.
 */
export const TRIBE_GOV_TYPE_SUFFIX = "tribe_governance::TribeGovernance" as const;

/**
 * Type suffix used to identify UserStorage created objects in TX objectChanges.
 * Exported for callers that need to match UserStorage objects by type.
 */
export const USER_STORAGE_TYPE_SUFFIX = "user_storage::UserStorage" as const;

// ── Private helper types ───────────────────────────────────────────────────────

interface SSUGovCreatedRaw {
  parsedJson: Record<string, unknown>;
  txDigest:   string;
}

// ── Private helper — queryEvents for SSUGovernanceCreated ─────────────────────

/**
 * Issues a single queryEvents for SSUGovernanceCreated events (limit 1000),
 * filters client-side by ssu_id (lowercased), returns { parsedJson, txDigest }
 * for the first matching event, or null if none found.
 *
 * SDC-004: warns when result set is at 1000-result capacity.
 * SDC-005: both sides of ssu_id comparison are lowercased.
 *
 * This is a module-private helper. Shared by useSSUGovId and useSSUSharedObjects
 * to eliminate duplicated queryEvents logic.
 */
async function _findSSUGovernanceCreatedEvent(
  ssuId: string,
): Promise<SSUGovCreatedRaw | null> {
  const eventType =
    `${ORIGINAL_PACKAGE_ID}::ssu_governance::SSUGovernanceCreated`;

  const events = await suiClient.queryEvents({
    query: { MoveEventType: eventType },
    limit: 1000,
  });

  if (events.data.length === 1000) {
    console.warn(
      "[_findSSUGovernanceCreatedEvent] queryEvents returned 1000 results (limit). " +
      "Cursor-based pagination is not yet implemented. " +
      "The correct SSUGovernanceCreated event may be beyond this page.",
    );
  }

  const targetId = ssuId.toLowerCase();
  const match = events.data.find((e) => {
    const parsed = e.parsedJson as { ssu_id?: string } | null;
    return (
      typeof parsed?.ssu_id === "string" &&
      parsed.ssu_id.toLowerCase() === targetId
    );
  });

  if (!match) return null;

  return {
    parsedJson: match.parsedJson as Record<string, unknown>,
    txDigest:   match.id.txDigest,
  };
}

// ── useSSUGovId ───────────────────────────────────────────────────────────────

/**
 * Resolve the SSUGovernance shared object ID for a given SSU address.
 *
 * Strategy:
 *   1. _findSSUGovernanceCreatedEvent (queryEvents + client-side filter by ssu_id).
 *   2. getTransactionBlock on the matching TX digest (showObjectChanges: true).
 *   3. Find the created object whose type ends with SSU_GOV_TYPE_SUFFIX.
 *
 * Sui RPC default ordering is ascending — first matching event wins (bootstrap-wins).
 * SDC-005: both sides of ssu_id comparison are lowercased.
 *
 * Returns null when:
 *   - ssuId is null
 *   - No SSUGovernanceCreated event exists for this ssu_id
 *   - TX objectChanges missing (should not happen on mainnet)
 *
 * @param ssuId - SSU address (0x-prefixed hex), or null to disable.
 */
export function useSSUGovId(ssuId: string | null) {
  return useQuery<string | null>({
    queryKey: ["bazaarcore", "ssu-gov-id", ssuId],
    enabled: !!ssuId,
    queryFn: async (): Promise<string | null> => {
      if (!ssuId) return null;

      const found = await _findSSUGovernanceCreatedEvent(ssuId);
      if (!found) return null;

      // Resolve the SSUGovernance id from the bootstrap TX. objectChanges-first
      // with an effects.created fallback (objectChanges is pruned by fullnodes
      // after a few days — see _resolveCreatedIdsBySuffix).
      const ids = await resolveCreatedIdsBySuffix(found.txDigest, [SSU_GOV_TYPE_SUFFIX]);
      return ids[SSU_GOV_TYPE_SUFFIX];
    },
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

// ── useTribeGovId ─────────────────────────────────────────────────────────────

/**
 * Resolve the TribeGovernance shared object ID for a given tribe ID.
 *
 * Strategy:
 *   1. queryEvents for TribeGovernanceCreated, filtered client-side by tribe_id.
 *   2. getTransactionBlock on the matching TX digest (showObjectChanges: true).
 *   3. Find the created object whose type ends with TRIBE_GOV_TYPE_SUFFIX.
 *
 * tribe_id comparison: decimal-string compare (Move u64 serialises as decimal in JSON-RPC).
 *
 * Returns null when:
 *   - tribeId is null
 *   - No TribeGovernanceCreated event found for this tribe_id
 *   - TX objectChanges missing
 *
 * @param tribeId - Tribe ID as a decimal string (e.g. "1", "42"), or null to disable.
 */
export function useTribeGovId(tribeId: string | null) {
  return useQuery<string | null>({
    queryKey: ["bazaarcore", "tribe-gov-id", tribeId],
    enabled: !!tribeId,
    queryFn: async (): Promise<string | null> => {
      if (!tribeId) return null;

      const eventType =
        `${ORIGINAL_PACKAGE_ID}::tribe_governance::TribeGovernanceCreated`;

      const events = await suiClient.queryEvents({
        query: { MoveEventType: eventType },
        limit: 1000,
      });

      if (events.data.length === 1000) {
        console.warn(
          "[useTribeGovId] queryEvents returned 1000 results (limit). " +
          "Cursor-based pagination is not yet implemented. " +
          "The correct TribeGovernanceCreated event may be beyond this page.",
        );
      }

      const targetId = String(tribeId);
      const match = events.data.find((e) => {
        const parsed = e.parsedJson as { tribe_id?: string | number } | null;
        return parsed != null && String(parsed.tribe_id) === targetId;
      });

      if (!match) return null;

      // Resolve the TribeGovernance id from the creation TX. objectChanges-first
      // with an effects.created fallback (objectChanges is pruned by fullnodes
      // after a few days — see _resolveCreatedIdsBySuffix).
      const ids = await resolveCreatedIdsBySuffix(match.id.txDigest, [TRIBE_GOV_TYPE_SUFFIX]);
      return ids[TRIBE_GOV_TYPE_SUFFIX];
    },
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

// ── SSUSharedObjects ──────────────────────────────────────────────────────────

/**
 * All 7 per-SSU shared object IDs resolved from a single SSUGovernanceCreated event.
 * 5 IDs come directly from parsedJson; ssuGovId and userStorageId are resolved
 * via getTransactionBlock objectChanges.
 */
export interface SSUSharedObjects {
  /** SSUGovernance shared object ID — resolved from TX objectChanges. */
  ssuGovId:            string;
  memberRegistryId:    string;
  widgetConfigId:      string;
  announcementBoardId: string;
  guestbookBoardId:    string;
  /** UserStorage shared object ID — resolved from TX objectChanges. */
  userStorageId:       string;
  /** WtbEscrowPool shared object ID — V13 atomic-9 per-SSU pool (used by force_close_shop_*). */
  wtbEscrowPoolId:     string;
}

/**
 * Resolve all per-SSU shared object IDs for a given SSU address.
 *
 * Resolution flow:
 *   1. _findSSUGovernanceCreatedEvent (queryEvents + client-side filter by ssu_id).
 *   2. Extract 4 IDs from matching event parsedJson:
 *      widget_config_id, member_registry_id, announcement_board_id,
 *      guestbook_board_id.
 *   3. getTransactionBlock(digest, { showObjectChanges: true }) to find:
 *      a. SSUGovernance object ID via objectType ending with SSU_GOV_TYPE_SUFFIX.
 *      b. UserStorage object ID via objectType ending with USER_STORAGE_TYPE_SUFFIX.
 *   4. SA-O1 defense: getObject(ssuGovId) and compare fields.ssu_id (lowercased)
 *      against queried ssuId. On mismatch: console.error + return null.
 *   5. Compose into SSUSharedObjects and cache with staleTime=Infinity, gcTime=24h.
 *
 * SDC-004: warns at 1000-result capacity (cursor pagination not yet implemented).
 * SDC-005: both sides of ssu_id comparison are lowercased.
 *
 * Returns null when:
 *   - ssuId is null or empty
 *   - No matching SSUGovernanceCreated event found (SSU not bootstrapped)
 *   - getTransactionBlock objectChanges missing or SSUGovernance/UserStorage not found
 *   - SA-O1: getObject ssu_id cross-SSU mismatch detected
 *
 * Per SA C3: consumers MUST guard with `if (!data) return` before firing TX.
 *
 * @param ssuId - SSU address (0x-prefixed hex), or null to disable.
 */
export function useSSUSharedObjects(
  ssuId: string | null,
): UseQueryResult<SSUSharedObjects | null, Error> {
  return useQuery<SSUSharedObjects | null, Error>({
    queryKey: ["bazaarcore", "ssu-shared-objects", ssuId],
    enabled: !!ssuId,
    queryFn: async (): Promise<SSUSharedObjects | null> => {
      if (!ssuId) return null;

      const found = await _findSSUGovernanceCreatedEvent(ssuId);
      if (!found) return null;

      // Extract IDs from parsedJson (emitted directly by bootstrap_ssu_objects).
      // V13 atomic-9 added wtb_escrow_pool_id; pre-V13 events lack it.
      const parsed = found.parsedJson as {
        ssu_id?:               string;
        widget_config_id?:     string;
        member_registry_id?:   string;
        announcement_board_id?: string;
        guestbook_board_id?:   string;
        wtb_escrow_pool_id?:   string;
      };

      const memberRegistryId    = parsed.member_registry_id    ?? null;
      const widgetConfigId      = parsed.widget_config_id      ?? null;
      const announcementBoardId = parsed.announcement_board_id ?? null;
      const guestbookBoardId    = parsed.guestbook_board_id    ?? null;
      const wtbEscrowPoolId     = parsed.wtb_escrow_pool_id    ?? "";

      if (
        !memberRegistryId || !widgetConfigId ||
        !announcementBoardId || !guestbookBoardId
      ) {
        return null;
      }

      // Resolve ssuGovId and userStorageId from the bootstrap TX. objectChanges-
      // first with an effects.created fallback (objectChanges is pruned by
      // fullnodes after a few days — see _resolveCreatedIdsBySuffix). These two
      // IDs are NOT on the SSUGovernanceCreated event payload, so this is the
      // only way to recover them.
      const createdIds = await resolveCreatedIdsBySuffix(found.txDigest, [
        SSU_GOV_TYPE_SUFFIX,
        USER_STORAGE_TYPE_SUFFIX,
      ]);
      const ssuGovObjectId = createdIds[SSU_GOV_TYPE_SUFFIX];
      const userStorageObjectId = createdIds[USER_STORAGE_TYPE_SUFFIX];

      if (!ssuGovObjectId || !userStorageObjectId) return null;

      // SA-O1 defense-in-depth: verify the resolved SSUGovernance object actually
      // belongs to the queried ssuId. Guards against cross-SSU event collisions.
      const govObj = await suiClient.getObject({
        id: ssuGovObjectId,
        options: { showContent: true },
      });

      const govFields = (govObj.data?.content as { fields?: Record<string, unknown> } | undefined)
        ?.fields;
      const govSsuId = typeof govFields?.ssu_id === "string"
        ? govFields.ssu_id
        : null;

      if (govSsuId === null || govSsuId.toLowerCase() !== ssuId.toLowerCase()) {
        console.error(
          "[useSSUSharedObjects] SA-O1 cross-SSU mismatch: " +
          `resolved SSUGovernance.ssu_id (${govSsuId ?? "null"}) ` +
          `does not match queried ssuId (${ssuId}). Returning null.`,
        );
        return null;
      }

      return {
        ssuGovId:            ssuGovObjectId,
        memberRegistryId,
        widgetConfigId,
        announcementBoardId,
        guestbookBoardId,
        userStorageId:       userStorageObjectId,
        wtbEscrowPoolId,
      };
    },
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
