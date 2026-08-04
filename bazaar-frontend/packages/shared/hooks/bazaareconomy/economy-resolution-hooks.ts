// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Economy object resolution hook.
 *
 * useTribeEconomyObjects — resolves the 4 per-tribe economy shared object IDs
 *   created by economy_governance::initialize_tribe_economy.
 *
 * DEPENDENCY: All other bazaareconomy hooks depend on this hook for object IDs.
 * Without it, callers would need to hard-code or manually discover object IDs.
 *
 * Strategy: Query TribeEconomyInitializedEvent by tribe_id, then fetch the
 * transaction's objectChanges to match created objects by type suffix.
 *
 * Caching: staleTime=Infinity (IDs never change after creation).
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../sui-client";
import { resolveCreatedIdsBySuffix } from "../created-object-resolver";
import { BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID, BAZAAR_MISSION_ORIGINAL_PACKAGE_ID } from "../../constants";
import type { TribeEconomyObjectIds } from "../../types/bazaareconomy";

// ── Type Suffixes for Created Object Matching ──────────────────────────────────

const ECONOMY_TYPE_SUFFIXES = {
  ledger: "tribe_token_ledger::TribeTokenLedger",
  vault:  "tribe_vault::TribeVault",
  config: "tribe_exchange::ExchangeConfig",
  board:  "vault_withdrawal::WithdrawalBoard",
  // V26 D5: per-tribe Advanced DirectTrade registry, created in the same
  // bootstrap_advanced_complete TX as the 4 above.
  advTrade: "advanced_direct_trade::AdvancedTradeRegistry",
} as const;

// ── useTribeEconomyObjects ─────────────────────────────────────────────────────

/**
 * Resolve the 4 shared economy object IDs for a tribe.
 *
 * Returns null when:
 *   - tribeId is null or 0
 *   - The tribe has not yet called initialize_tribe_economy
 *   - The event exists but transaction effects are missing (guarded with warning)
 *
 * RPC calls (2 sequential, on first mount only):
 *   1. suiClient.queryEvents — find TribeEconomyInitializedEvent for tribe_id
 *   2. suiClient.getTransactionBlock — read objectChanges from init TX
 *
 * @depends economy_governance::initialize_tribe_economy (creates 4 objects)
 * @depends TribeEconomyInitializedEvent (emitted by initialize_tribe_economy)
 */
export function useTribeEconomyObjects(tribeId: string | null) {

  const tribeIdNum = tribeId ? Number(tribeId) : null;

  return useQuery<TribeEconomyObjectIds | null>({
    queryKey: ["bazaareconomy", "economy-objects", tribeIdNum],
    enabled: tribeIdNum !== null && tribeIdNum > 0,
    queryFn: async (): Promise<TribeEconomyObjectIds | null> => {
      if (tribeIdNum === null) return null;

      // Step 1: Find the TribeEconomyInitializedEvent for this tribe
      const eventType =
        `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::economy_governance::TribeEconomyInitializedEvent`;

      // TODO: Replace with actual suiClient.queryEvents call at deployment.
      // Sui event queries do not support field-level filters — we query the event
      // type and filter client-side by tribe_id field.
      const events = await suiClient.queryEvents({
        query: { MoveEventType: eventType },
        limit: 50,
      });

      const initEvent = events.data.find((e) => {
        const parsed = e.parsedJson as { tribe_id?: string | number } | null;
        return parsed != null && Number(parsed.tribe_id) === tribeIdNum;
      });

      if (!initEvent) return null;

      // Step 2+3: Resolve the created object IDs by type suffix. objectChanges-
      // first with an effects.created fallback (objectChanges is pruned by
      // fullnodes after a few days — see resolveCreatedIdsBySuffix). These IDs
      // are NOT carried on the TribeEconomyInitializedEvent payload, so without
      // the fallback Advanced token/vault/exchange resolution silently broke
      // once the init TX aged past the prune window.
      const txDigest = initEvent.id.txDigest;
      const ids = await resolveCreatedIdsBySuffix(txDigest, [
        ECONOMY_TYPE_SUFFIXES.ledger,
        ECONOMY_TYPE_SUFFIXES.vault,
        ECONOMY_TYPE_SUFFIXES.config,
        ECONOMY_TYPE_SUFFIXES.board,
        ECONOMY_TYPE_SUFFIXES.advTrade,
      ]);

      const ledgerId = ids[ECONOMY_TYPE_SUFFIXES.ledger];
      const vaultId  = ids[ECONOMY_TYPE_SUFFIXES.vault];
      const configId = ids[ECONOMY_TYPE_SUFFIXES.config];
      const boardId  = ids[ECONOMY_TYPE_SUFFIXES.board];
      const advTradeRegistryId = ids[ECONOMY_TYPE_SUFFIXES.advTrade];  // V26 D5 (optional — pre-V26 bootstraps lack this)

      if (!ledgerId || !vaultId || !configId || !boardId) {
        console.warn(
          `[useTribeEconomyObjects] Incomplete object set for tribe ${tribeIdNum}`,
          { ledgerId, vaultId, configId, boardId }
        );
        return null;
      }

      return {
        ledgerId,
        vaultId,
        configId,
        boardId,
        tribeId: tribeIdNum,
        initTxDigest: txDigest,
        advancedTradeRegistryId: advTradeRegistryId ?? undefined,   // V26 D5
      };
    },
    staleTime: Infinity,             // Object IDs are immutable after creation
    gcTime: 24 * 60 * 60 * 1000,    // Keep in cache for 24 hours
  });
}

// ── useTribeTokenWtbPoolId ─────────────────────────────────────────────────────

/**
 * V21 — Resolve the canonical TribeTokenWtbPool shared object ID for an SSU.
 *
 * The pool is created by a one-shot user call to
 * `tribe_token_wtb_pool::bootstrap_tribe_token_wtb_pool` AFTER the atomic-9 SSU
 * bootstrap. Multiple calls create orphan pools — this hook picks the FIRST
 * `TribeTokenWtbPoolCreated` event for the SSU as canonical.
 *
 * Returns null when:
 *   - ssuId is empty/null
 *   - No bootstrap event found for this SSU yet
 *
 * Caching: staleTime=Infinity (pool ID is immutable after bootstrap).
 */
export function useTribeTokenWtbPoolId(ssuId: string | null) {
  return useQuery<string | null>({
    queryKey: ["bazaareconomy", "tribe-token-wtb-pool-id", ssuId],
    enabled: !!ssuId,
    queryFn: async (): Promise<string | null> => {
      if (!ssuId) return null;
      const eventType =
        `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::tribe_token_wtb_pool::TribeTokenWtbPoolCreated`;
      const events = await suiClient.queryEvents({
        query: { MoveEventType: eventType },
        limit: 200,
      });
      // Earliest-first: pick the first event matching this ssu_id. Orphan pools
      // (created by repeat bootstrap) are ignored.
      const match = events.data.find((e) => {
        const parsed = e.parsedJson as { ssu_id?: string; pool_id?: string } | null;
        return parsed?.ssu_id === ssuId;
      });
      if (!match) return null;
      const parsed = match.parsedJson as { pool_id?: string } | null;
      return parsed?.pool_id ?? null;
    },
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

// ── useMissionCollateralPoolId ─────────────────────────────────────────────────

/**
 * V34 — Resolve the canonical MissionCollateralPool ID for a NoTribe/Easy SSU.
 * The pool is created by the standalone bootstrap_mission_collateral_pool entry
 * (mission_collateral_pool.move:65-92), which emits MissionCollateralPoolCreated
 * { pool_id, ssu_id }. Multiple calls create orphan pools; the FIRST event is canonical.
 *
 * Returns null when:
 *   - ssuId is empty/null
 *   - No bootstrap event found yet (pool not yet bootstrapped)
 *
 * Sweep-H: BAZAAR_MISSION_ORIGINAL_PACKAGE_ID is the V1 publish ID for the
 * bazaar_mission package — NEVER rotated for struct-type / event-type filters.
 *
 * Caching: staleTime=Infinity (pool ID is immutable after bootstrap).
 */
export function useMissionCollateralPoolId(ssuId: string | null) {
  return useQuery<string | null>({
    queryKey: ["bazaarmission", "mission-collateral-pool-id", ssuId],
    enabled: !!ssuId,
    queryFn: async (): Promise<string | null> => {
      if (!ssuId) return null;
      const eventType =
        `${BAZAAR_MISSION_ORIGINAL_PACKAGE_ID}::mission_collateral_pool::MissionCollateralPoolCreated`;
      const events = await suiClient.queryEvents({
        query: { MoveEventType: eventType },
        limit: 200,
      });
      const match = events.data.find((e) => {
        const parsed = e.parsedJson as { ssu_id?: string; pool_id?: string } | null;
        return parsed?.ssu_id === ssuId;
      });
      if (!match) return null;
      const parsed = match.parsedJson as { pool_id?: string } | null;
      return parsed?.pool_id ?? null;
    },
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

// ── useMissionCollateralTokenPoolId ───────────────────────────────────────────

/**
 * V34 — Resolve the canonical MissionCollateralTokenPool ID for an Advanced SSU.
 * Bootstrapped by bazaar_economy::mission_collateral_token_pool::bootstrap_mission_collateral_token_pool.
 * Returns null when SSU hasn't been bootstrapped yet.
 * Sweep-H: BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID for the event type filter.
 */
export function useMissionCollateralTokenPoolId(ssuId: string | null) {
  return useQuery<string | null>({
    queryKey: ["bazaareconomy", "mission-collateral-token-pool-id", ssuId],
    enabled: !!ssuId,
    queryFn: async (): Promise<string | null> => {
      if (!ssuId) return null;
      const eventType =
        `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::mission_collateral_token_pool::MissionCollateralTokenPoolCreated`;
      const events = await suiClient.queryEvents({
        query: { MoveEventType: eventType },
        limit: 200,
      });
      const match = events.data.find((e) => {
        const parsed = e.parsedJson as { ssu_id?: string; pool_id?: string } | null;
        return parsed?.ssu_id === ssuId;
      });
      if (!match) return null;
      const parsed = match.parsedJson as { pool_id?: string } | null;
      return parsed?.pool_id ?? null;
    },
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
