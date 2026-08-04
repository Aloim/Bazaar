// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore tribe governance hooks.
 *
 * useTribeCaps             — checks 4 cap types for walletAddress
 * useTribeGovernanceConfig — reads TribeGovernance shared object (V16: no flat tax fields)
 * useTribeRoleTaxTable     — walks TribeTaxConfig.role_taxes Table<u8, RoleTaxConfig> (V16)
 * useTribeSSUs             — reads ssu_ids vector from TribeGovernance
 * useTribeMembers          — aggregates members across per-SSU MemberRegistries
 * useTribeAnnouncements    — aggregates announcements across per-SSU AnnouncementBoards
 *                            (pure FE aggregation; no proxy needed — reads are off-chain RPC)
 *
 * V16 (Session 3B+3C): TribeTaxConfig flat fields replaced by per-role Table.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useQuery } from "@tanstack/react-query";
import type { TribeCaps, TribeGovernanceConfig, TribeMemberAggregated, RoleTaxTable } from "../../types/bazaarcore";
import { TRIBE_CAP_TYPES } from "../../types/bazaarcore";
import { suiClient } from "../sui-client";
import type { SuiObjectResponse } from "../sui-client";
import { fetchAnnouncementsForBoard } from "../announcement-board-fetch";
import type { AnnouncementData } from "../announcement-board-fetch";

// ── useTribeCaps ───────────────────────────────────────────────────────────────

/**
 * Check which tribe caps walletAddress holds for tribeId.
 * Move source: tribe_registry::TribeLeaderCap (dapp_hub), tribe_governance::TribeSuperAdminCap,
 *   TribeAdminCap, TribeModCap.
 * RPC: suix_getOwnedObjects for each cap struct type, filter tribe_id field.
 * NOTE (G-16): FrontendAPI spec listed only 2 caps; Move has 4 types — all 4 are checked.
 */
export function useTribeCaps(walletAddress: string | null, tribeId: string | null) {
  return useQuery<TribeCaps>({
    queryKey: ["bazaarcore", "tribe-caps", walletAddress, tribeId],
    enabled: !!(walletAddress && tribeId),
    queryFn: async (): Promise<TribeCaps> => {
      // walletAddress and tribeId are guaranteed non-null by `enabled` guard above.
      const owner = walletAddress!;
      // tribe_id is u64 in Move. Sui JSON-RPC serialises u64 as decimal string.
      // tribeId parameter arrives as a decimal string from all callers — compare directly.
      const targetTribeId = String(tribeId!);

      const fetchCap = (structType: string) =>
        suiClient.getOwnedObjects({
          owner,
          filter: { StructType: structType },
          options: { showContent: true },
        });

      const [leaderRes, superAdminRes, adminRes, modRes] = await Promise.all([
        fetchCap(TRIBE_CAP_TYPES.TRIBE_LEADER_CAP),
        fetchCap(TRIBE_CAP_TYPES.TRIBE_SUPER_ADMIN_CAP),
        fetchCap(TRIBE_CAP_TYPES.TRIBE_ADMIN_CAP),
        fetchCap(TRIBE_CAP_TYPES.TRIBE_MOD_CAP),
      ]);

      // Filter each result set to objects whose tribe_id field matches targetTribeId.
      // Move type: tribe_id is `u64` — RPC returns a decimal string (e.g. "1", "42").
      const matchTribe = (objs: SuiObjectResponse[]): SuiObjectResponse | undefined =>
        objs.find(obj => {
          const fields = obj.data?.content?.fields as Record<string, unknown> | undefined;
          return String(fields?.tribe_id) === targetTribeId;
        });

      const leaderCap      = matchTribe(leaderRes.data);
      const superAdminCap  = matchTribe(superAdminRes.data);
      const adminCap       = matchTribe(adminRes.data);
      const modCap         = matchTribe(modRes.data);

      return {
        hasTribeLeaderCap:      !!leaderCap,
        hasTribeSuperAdminCap:  !!superAdminCap,
        hasTribeAdminCap:       !!adminCap,
        hasTribeModCap:         !!modCap,
        capIds: {
          ...(leaderCap      && { leaderCapId:      leaderCap.data?.objectId }),
          ...(superAdminCap  && { superAdminCapId:  superAdminCap.data?.objectId }),
          ...(adminCap       && { adminCapId:        adminCap.data?.objectId }),
          ...(modCap         && { modCapId:          modCap.data?.objectId }),
        },
      };
    },
    staleTime: 30_000,
  });
}

// ── useTribeGovernanceConfig ───────────────────────────────────────────────────

/**
 * Read the full TribeGovernance shared object for a tribe.
 * Move source: bazaar_core::tribe_governance::TribeGovernance.
 * tribeGovId — the object ID of the TribeGovernance shared object.
 * NOTE (G-11): registrationPolicy and maxMembers are not in TribeGovernance Move struct.
 *   registrationPolicy lives in dapp_hub::tribe_registry::Tribe (join_policy field).
 *   These fields are intentionally omitted here; use useTribeById from DappHub hooks for join_policy.
 */
export function useTribeGovernanceConfig(tribeGovId: string | null) {
  return useQuery<TribeGovernanceConfig | null>({
    queryKey: ["bazaarcore", "tribe-governance-config", tribeGovId],
    enabled: !!tribeGovId,
    queryFn: async (): Promise<TribeGovernanceConfig | null> => {
      const obj = await suiClient.getObject({
        id: tribeGovId!,
        options: { showContent: true },
      });
      const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
      if (!fields) return null;
      // V16 (Session 3B): TribeTaxConfig flat fields removed; per-role Table read via useTribeRoleTaxTable.
      const balanceField = fields.tax_wallet as { fields?: { value?: string }; value?: string } | undefined;
      const taxBalance = Number(balanceField?.fields?.value ?? balanceField?.value ?? 0);
      const ssuIdsRaw = fields.ssu_ids;
      const ssuIds = Array.isArray(ssuIdsRaw)
        ? (ssuIdsRaw as unknown[]).map(String)
        : [];
      const govMode = fields.governance_mode != null
        ? Number(fields.governance_mode)
        : null;
      return {
        tribeId:            Number(fields.tribe_id ?? 0),
        bazaarType:         Number(fields.bazaar_type ?? 0) as import("../../types/bazaarcore").BazaarTypeNum,
        taxBalance,
        totalTaxCollected:  Number(fields.total_tax_collected ?? 0),
        ssuIds,
        isActive:           Boolean(fields.is_active ?? false),
        createdAtMs:        Number(fields.created_at_ms ?? 0),
        missionListingFeePerHour: Number(fields.mission_listing_fee_per_hour ?? 0),
        governanceMode:     govMode as import("../../types/bazaarcore").GovernanceMode | null,
      };
    },
    staleTime: 30_000,
  });
}

// ── useTribeRoleTaxTable ───────────────────────────────────────────────────────

/**
 * Read the per-role tribe tax table (V16 — replaces TribeTaxConfig flat read).
 *
 * Move source: TribeGovernance.tribe_tax_config: TribeTaxConfig { role_taxes: Table<u8, RoleTaxConfig> }.
 * Each row keyed by tribe-role index (u8 0..7).
 *
 * Strategy mirrors useSSURoleTaxTable:
 *  1. getObject(tribeGovId) → walks to tribe_tax_config.fields.role_taxes.fields.id.id (Table UID).
 *  2. getDynamicFields(tableUid) → enumerates per-role rows.
 *  3. getDynamicFieldObject for each → extract role index (u8) + RoleTaxConfig fields.
 *
 * Returns: Record<0..7, RoleTaxRow | null>. Missing rows return null (Move getter returns 0).
 *
 * tribeGovId — the TribeGovernance shared object ID.
 */
export function useTribeRoleTaxTable(tribeGovId: string | null) {
  return useQuery<RoleTaxTable | null>({
    queryKey: ["bazaarcore", "tribe-role-tax-table", tribeGovId],
    enabled: !!tribeGovId,
    queryFn: async (): Promise<RoleTaxTable | null> => {
      const obj = await suiClient.getObject({
        id: tribeGovId!,
        options: { showContent: true },
      });
      const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
      if (!fields) return null;
      const tc = fields.tribe_tax_config as { fields?: Record<string, unknown> } | undefined;
      const roleTaxes = tc?.fields?.role_taxes as { fields?: { id?: { id?: string } } } | undefined;
      const tableId = roleTaxes?.fields?.id?.id;
      const out: RoleTaxTable = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null };
      if (!tableId) return out;
      const page = await suiClient.getDynamicFields({ parentId: tableId });
      if (page.data.length === 0) return out;
      const settled = await Promise.allSettled(
        page.data.map((field) =>
          suiClient.getDynamicFieldObject({ parentId: tableId, name: field.name }),
        ),
      );
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        if (s.status !== "fulfilled") continue;
        const content = s.value.data?.content as { fields?: Record<string, unknown> } | undefined;
        const f = content?.fields;
        if (!f) continue;
        const roleRaw = (f.name ?? page.data[i].name?.value) as unknown;
        const role = Number(roleRaw ?? -1);
        if (!Number.isFinite(role) || role < 0 || role > 7) continue;
        const valueWrapper = f.value as { fields?: Record<string, unknown> } | undefined;
        const v = valueWrapper?.fields ?? (f.value as Record<string, unknown> | undefined);
        if (!v) continue;
        out[role] = {
          wtsPct:    Number(v.wts_pct ?? 0),
          wtbPct:    Number(v.wtb_pct ?? 0),
          deFlatFee: Number(v.de_flat_fee ?? 0),
        };
      }
      return out;
    },
    staleTime: 30_000,
  });
}

// ── useTribeSSUs ───────────────────────────────────────────────────────────────

/**
 * Read the list of SSU IDs registered under a tribe.
 * Move source: TribeGovernance.ssu_ids: vector<address>.
 * tribeGovId — the object ID of the TribeGovernance shared object.
 */
export function useTribeSSUs(tribeGovId: string | null) {
  return useQuery<string[]>({
    queryKey: ["bazaarcore", "tribe-ssus", tribeGovId],
    enabled: !!tribeGovId,
    queryFn: async (): Promise<string[]> => {
      const obj = await suiClient.getObject({
        id: tribeGovId!,
        options: { showContent: true },
      });
      const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
      if (!fields) return [];
      const raw = fields.ssu_ids;
      return Array.isArray(raw) ? (raw as unknown[]).map(String) : [];
    },
    staleTime: 30_000,
  });
}

// ── useTribeMembers (G-18 — cross-SSU aggregation) ────────────────────────────

/**
 * Fetch all members of a tribe aggregated across every SSU the tribe owns.
 *
 * G-18 implementation strategy:
 *  1. Call useTribeSSUs(tribeGovId) to read ssu_ids from TribeGovernance.
 *  2. For each ssuId, resolve the SSUGovernance object to read member_registry_id.
 *  3. For each MemberRegistry, call suiClient.getDynamicFields to enumerate player entries.
 *  4. For each player key, call suiClient.getDynamicFieldObject to read MemberEntry fields
 *     (ssu_role, tribe_role, is_banned).
 *  5. Merge into a Map<address, TribeMemberAggregated>:
 *     - Track maxSSURole = max across SSUs for this player
 *     - Track maxTribeRole = max across SSUs for this player
 *     - isBanned = true if banned in ANY SSU
 *     - memberAtSSUs = all SSU IDs where this player has an entry
 *  6. effectiveRole = Math.max(maxSSURole, maxTribeRole)
 *  7. Sort: by effectiveRole descending, then address ascending.
 *
 * Performance: O(N*M) where N = SSU count, M = members per SSU.
 * staleTime is 60s (longer than other hooks) due to RPC fan-out cost.
 * Frontend should show per-SSU loading progress and paginate for large tribes.
 *
 * Returns TribeMemberAggregated[] from types/bazaarcore.ts.
 * tribeGovId — the TribeGovernance shared object ID for the tribe.
 */
export function useTribeMembers(tribeGovId: string | null) {
  const { data: ssuIds } = useTribeSSUs(tribeGovId);

  return useQuery<TribeMemberAggregated[]>({
    queryKey: ["bazaarcore", "tribe-members", tribeGovId, ssuIds],
    enabled: !!(tribeGovId && ssuIds && ssuIds.length > 0),
    queryFn: async (): Promise<TribeMemberAggregated[]> => {
      const ids = ssuIds!;

      // Step 2: For each ssuId, read the SSUGovernance object to find member_registry_id.
      const ssuGovResults = await Promise.all(
        ids.map(ssuId => suiClient.getObject({ id: ssuId, options: { showContent: true } }))
      );
      const registryIds: Array<{ ssuId: string; registryId: string }> = [];
      for (let i = 0; i < ssuGovResults.length; i++) {
        const fields = (ssuGovResults[i].data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
        const rid = fields?.member_registry_id;
        if (typeof rid === "string" && rid) {
          registryIds.push({ ssuId: ids[i], registryId: rid });
        }
      }

      if (registryIds.length === 0) return [];

      // Step 3: For each registryId, enumerate dynamic fields (player address keys).
      const perSSUFields = await Promise.all(
        registryIds.map(({ registryId }) => suiClient.getDynamicFields({ parentId: registryId }))
      );

      // Step 4 + 5: For each (registryId, player key), read MemberEntry and merge.
      const merged = new Map<string, TribeMemberAggregated>();

      for (let i = 0; i < registryIds.length; i++) {
        const { ssuId, registryId } = registryIds[i];
        const page = perSSUFields[i];
        const settled = await Promise.allSettled(
          page.data.map(field =>
            suiClient.getDynamicFieldObject({ parentId: registryId, name: field.name })
          )
        );
        for (let j = 0; j < settled.length; j++) {
          const s = settled[j];
          if (s.status !== "fulfilled") continue;
          const content = s.value.data?.content as { fields?: Record<string, unknown> } | undefined;
          const wrapper = content?.fields?.value as { fields?: Record<string, unknown> } | undefined;
          const f = wrapper?.fields ?? content?.fields;
          if (!f) continue;
          const playerAddr = String(page.data[j].name.value ?? "");
          if (!playerAddr) continue;
          const ssuRole   = Number(f.ssu_role   ?? 0);
          const tribeRole = Number(f.tribe_role  ?? 0);
          const isBanned  = Boolean(f.is_banned  ?? false);
          const existing  = merged.get(playerAddr) ?? {
            address: playerAddr, maxSSURole: 0, maxTribeRole: 0,
            effectiveRole: 0, isBanned: false, memberAtSSUs: [],
          };
          existing.maxSSURole   = Math.max(existing.maxSSURole,   ssuRole);
          existing.maxTribeRole = Math.max(existing.maxTribeRole, tribeRole);
          existing.isBanned     = existing.isBanned || isBanned;
          existing.memberAtSSUs.push(ssuId);
          existing.effectiveRole = Math.max(existing.maxSSURole, existing.maxTribeRole);
          merged.set(playerAddr, existing);
        }
      }

      // Step 6: Sort by effectiveRole descending, then address ascending.
      return Array.from(merged.values())
        .sort((a, b) => b.effectiveRole - a.effectiveRole || a.address.localeCompare(b.address));
    },
    staleTime: 60_000,
  });
}

// ── useTribeAnnouncements ─────────────────────────────────────────────────────

/**
 * Aggregate announcements from all per-SSU AnnouncementBoards belonging to a tribe.
 *
 * Strategy (Option B — FE-only aggregation):
 *  1. useTribeSSUs(tribeGovId)  → ssu_ids: string[]
 *  2. For each ssuId, getObject(SSUGovernance) → announcement_board_id
 *  3. fetchAnnouncementsForBoard(boardId) for each resolved board
 *  4. Tag each announcement with { ssuId, boardId }, flatten, sort sticky-first then
 *     createdAtMs desc.
 *
 * Returns TribeAnnouncementData[] — extends AnnouncementData with ssuId + boardId.
 * Parameter renamed tribeId → tribeGovId for symmetry with useTribeSSUs / useTribeMembers.
 * Zero callers at time of rename (OS-30 audit confirmed).
 */
export interface TribeAnnouncementData extends AnnouncementData {
  /** Which SSU's board this announcement belongs to. */
  ssuId:   string;
  /** The AnnouncementBoard shared object ID. */
  boardId: string;
}

export function useTribeAnnouncements(tribeGovId: string | null) {
  const { data: ssuIds } = useTribeSSUs(tribeGovId);

  return useQuery<TribeAnnouncementData[]>({
    queryKey: ["bazaarcore", "tribe-announcements", tribeGovId, ssuIds],
    enabled: !!(tribeGovId && ssuIds && ssuIds.length > 0),
    queryFn: async (): Promise<TribeAnnouncementData[]> => {
      const ids = ssuIds!;

      // Step 1: Read SSUGovernance for each ssuId to find announcement_board_id.
      const ssuGovObjs = await Promise.all(
        ids.map((ssuId) =>
          suiClient.getObject({ id: ssuId, options: { showContent: true } }),
        ),
      );

      const boardRefs: Array<{ ssuId: string; boardId: string }> = [];
      for (let i = 0; i < ssuGovObjs.length; i++) {
        const fields = (
          ssuGovObjs[i].data?.content as { fields?: Record<string, unknown> } | undefined
        )?.fields;
        const bid = fields?.announcement_board_id;
        if (typeof bid === "string" && bid) {
          boardRefs.push({ ssuId: ids[i], boardId: bid });
        }
      }

      if (boardRefs.length === 0) return [];

      // Step 2: Fetch each board (Promise.allSettled for partial-failure resilience).
      const settled = await Promise.allSettled(
        boardRefs.map(({ boardId }) => fetchAnnouncementsForBoard(boardId)),
      );

      // Step 3: Tag, flatten, and sort.
      const out: TribeAnnouncementData[] = [];
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        if (s.status !== "fulfilled") {
          console.warn(
            `[useTribeAnnouncements] board fetch failed for boardId=${boardRefs[i].boardId}:`,
            (s as PromiseRejectedResult).reason,
          );
          continue;
        }
        const { ssuId, boardId } = boardRefs[i];
        for (const ann of s.value) {
          out.push({ ...ann, ssuId, boardId });
        }
      }

      out.sort((a, b) => {
        if (a.isSticky && !b.isSticky) return -1;
        if (!a.isSticky && b.isSticky) return 1;
        return b.createdAtMs - a.createdAtMs;
      });

      return out;
    },
    staleTime: 30_000,
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
