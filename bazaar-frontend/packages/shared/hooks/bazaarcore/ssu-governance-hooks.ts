// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore SSU governance hooks.
 *
 * useSSUCaps        — checks owned objects for SSU cap types
 * useSSURoleTaxTable — walks SSUTaxConfig.role_taxes Table<u8, RoleTaxConfig> (V16 per-role)
 * useSSUGovernanceConfig — reads full SSUGovernance shared object (no flat tax fields after V16)
 * useSSURoles       — reads MemberRegistry entry for wallet
 * useUnclaimedSSUItems — reads all unclaimed items (admin view)
 *
 * V16 (Session 3B+3C): SSUTaxConfig flat fields replaced by per-role Table.
 * Tax data exposed via useSSURoleTaxTable. (surchargeMode removed Phase 8 A4 — dead config.)
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useQuery } from "@tanstack/react-query";
import type { SSUCaps, SSUGovernanceConfig, SSURoles, UnclaimedItem, RoleTaxTable } from "../../types/bazaarcore";
import { SSU_CAP_TYPES } from "../../types/bazaarcore";
import { suiClient } from "../sui-client";
import type { SuiObjectResponse } from "../sui-client";

// ── useSSUCaps ─────────────────────────────────────────────────────────────────

/**
 * Check which SSU caps walletAddress holds for ssuId.
 * Move source: membership::SSUOwnerCap, SSUAdminCap, SSUModCap (owned objects).
 * RPC: suix_getOwnedObjects filtered by StructType for each cap, then filter ssu_id field.
 */
export function useSSUCaps(walletAddress: string | null, ssuId: string | null) {
  return useQuery<SSUCaps>({
    queryKey: ["bazaarcore", "ssu-caps", walletAddress, ssuId],
    enabled: !!(walletAddress && ssuId),
    queryFn: async (): Promise<SSUCaps> => {
      // walletAddress and ssuId are guaranteed non-null by `enabled` guard above.
      const owner = walletAddress!;
      const targetSsuId = ssuId!;

      const fetchCap = (structType: string) =>
        suiClient.getOwnedObjects({
          owner,
          filter: { StructType: structType },
          options: { showContent: true },
        });

      const [ownerRes, superAdminRes, adminRes, modRes] = await Promise.all([
        fetchCap(SSU_CAP_TYPES.SSU_OWNER_CAP),
        fetchCap(SSU_CAP_TYPES.SSU_SUPER_ADMIN_CAP),
        fetchCap(SSU_CAP_TYPES.SSU_ADMIN_CAP),
        fetchCap(SSU_CAP_TYPES.SSU_MOD_CAP),
      ]);

      // Filter each result set to objects whose ssu_id field matches targetSsuId.
      // Move type: ssu_id is `address` — RPC returns a hex string (0x-prefixed).
      // Normalise both sides to lowercase for comparison robustness.
      const matchSsu = (objs: SuiObjectResponse[]): SuiObjectResponse | undefined =>
        objs.find(obj => {
          const fields = obj.data?.content?.fields as Record<string, unknown> | undefined;
          return typeof fields?.ssu_id === "string" &&
            fields.ssu_id.toLowerCase() === targetSsuId.toLowerCase();
        });

      const ownerCap      = matchSsu(ownerRes.data);
      const superAdminCap = matchSsu(superAdminRes.data);
      const adminCap      = matchSsu(adminRes.data);
      const modCap        = matchSsu(modRes.data);

      return {
        hasSSUOwnerCap:      !!ownerCap,
        hasSSUSuperAdminCap: !!superAdminCap,
        hasSSUAdminCap:      !!adminCap,
        hasSSUModCap:        !!modCap,
        capIds: {
          ...(ownerCap      && { ownerCapId:      ownerCap.data?.objectId }),
          ...(superAdminCap && { superAdminCapId: superAdminCap.data?.objectId }),
          ...(adminCap      && { adminCapId:      adminCap.data?.objectId }),
          ...(modCap        && { modCapId:        modCap.data?.objectId }),
        },
      };
    },
    staleTime: 30_000,
  });
}

// ── useSSURoleTaxTable ─────────────────────────────────────────────────────────

/**
 * Read the per-role SSU tax table (V16 — replaces the flat SSUTaxConfig read).
 *
 * Move source: SSUGovernance.tax_config: SSUTaxConfig { role_taxes: Table<u8, RoleTaxConfig>,
 *   surcharge_mode: bool }. Each Table row is a `RoleTaxConfig { wts_pct, wtb_pct, de_flat_fee }`
 * keyed by role index (u8: 0=Stranger..7).
 *
 * Strategy (mirrors useMintBurnQueue):
 *  1. getObject(ssuGovId) — walks to tax_config.fields.role_taxes.fields.id.id (Table UID).
 *  2. getDynamicFields(tableUid) — enumerates per-role entries.
 *  3. getDynamicFieldObject for each row — reads name (role u8) + value (RoleTaxConfig).
 *
 * Returns: Record<0..7, RoleTaxRow | null>. Roles not present in the on-chain Table
 * map to null (Move-side getter returns 0 for the same).
 *
 * ssuGovId — the object ID of the SSUGovernance shared object for this SSU.
 */
export function useSSURoleTaxTable(ssuGovId: string | null) {
  return useQuery<RoleTaxTable | null>({
    queryKey: ["bazaarcore", "ssu-role-tax-table", ssuGovId],
    enabled: !!ssuGovId,
    queryFn: async (): Promise<RoleTaxTable | null> => {
      const obj = await suiClient.getObject({
        id: ssuGovId!,
        options: { showContent: true },
      });
      const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
      if (!fields) return null;
      const tc = fields.tax_config as { fields?: Record<string, unknown> } | undefined;
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

// ── useSSUGovernanceConfig ─────────────────────────────────────────────────────

/**
 * Read the full SSUGovernance shared object for an SSU.
 * Move source: bazaar_core::ssu_governance::SSUGovernance.
 * ssuGovId — the object ID of the SSUGovernance shared object.
 */
export function useSSUGovernanceConfig(ssuGovId: string | null) {
  return useQuery<SSUGovernanceConfig | null>({
    queryKey: ["bazaarcore", "ssu-governance-config", ssuGovId],
    enabled: !!ssuGovId,
    queryFn: async (): Promise<SSUGovernanceConfig | null> => {
      const obj = await suiClient.getObject({
        id: ssuGovId!,
        options: { showContent: true },
      });
      const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
      if (!fields) return null;
      // Phase 8 A4 (AUD-NT-10): the dead surcharge_mode parse removed — the flag
      // was never read by any Move tax path and is retired from the struct at V36.
      // Per-role wts/wtb/de rows live on the useSSURoleTaxTable walk.
      // CC-003: canonical Balance<EVE> read — try nested .fields.value first, fall back to .value.
      const balanceField = fields.tax_wallet as { fields?: { value?: string }; value?: string } | undefined;
      const taxBalance = Number(balanceField?.fields?.value ?? balanceField?.value ?? 0);
      return {
        ssuId:              String(fields.ssu_id ?? ""),
        bazaarType:         Number(fields.bazaar_type ?? 0) as import("../../types/bazaarcore").BazaarTypeNum,
        tribeId:            Number(fields.tribe_id ?? 0),
        owner:              String(fields.owner ?? ""),
        taxBalance,
        totalTaxCollected:  Number(fields.total_tax_collected ?? 0),
        widgetConfigId:     String(fields.widget_config_id ?? ""),
        // FP1-43: 4 new per-SSU object ID fields stored on SSUGovernance.
        memberRegistryId:    String(fields.member_registry_id ?? ""),
        announcementBoardId: String(fields.announcement_board_id ?? ""),
        guestbookBoardId:    String(fields.guestbook_board_id ?? ""),
        missionListingFeePerHour: Number(fields.mission_listing_fee_per_hour ?? 0),
        isActive:           Boolean(fields.is_active ?? false),
        createdAtMs:        Number(fields.created_at_ms ?? 0),
        // V41 SSU depreciation/prune (CR-P6-01): surfaces the certificate's
        // prerequisite flag off the SAME already-fetched SSUGovernance object —
        // zero extra RPC calls. Consumed by RecordRevealRow to hide the "Record
        // reveal state" button once already recorded.
        locationRevealed:   Boolean(fields.location_revealed ?? false),
      };
    },
    staleTime: 30_000,
  });
}

// ── useSSURoles ────────────────────────────────────────────────────────────────

/**
 * Read SSU + tribe role data for walletAddress at a specific SSU.
 * Move source: membership::MemberRegistry.members Table<address, MemberEntry>.
 * memberRegistryId — the object ID of the MemberRegistry for this SSU.
 */
export function useSSURoles(walletAddress: string | null, memberRegistryId: string | null) {
  return useQuery<SSURoles>({
    queryKey: ["bazaarcore", "ssu-roles", walletAddress, memberRegistryId],
    enabled: !!(walletAddress && memberRegistryId),
    queryFn: async (): Promise<SSURoles> => {
      const addr = walletAddress!;
      const regId = memberRegistryId!;
      let entry: Record<string, unknown> | null = null;
      try {
        const res = await suiClient.getDynamicFieldObject({
          parentId: regId,
          name: { type: "address", value: addr },
        });
        const content = res.data?.content as { fields?: Record<string, unknown> } | undefined;
        const wrapper = content?.fields?.value as { fields?: Record<string, unknown> } | undefined;
        entry = wrapper?.fields ?? content?.fields ?? null;
      } catch {
        // Not found = not registered
        entry = null;
      }
      if (!entry) {
        return { ssuRole: 0, tribeRole: 0, effectiveRole: 0, isBanned: false, isRegistered: false };
      }
      const ssuRole   = Number(entry.ssu_role   ?? 0);
      const tribeRole = Number(entry.tribe_role  ?? 0);
      return {
        ssuRole,
        tribeRole,
        effectiveRole: Math.max(ssuRole, tribeRole),
        isBanned:      Boolean(entry.is_banned   ?? false),
        isRegistered:  true,
      };
    },
    staleTime: 20_000,
  });
}

// ── useUnclaimedSSUItems ───────────────────────────────────────────────────────

/**
 * Fetch ALL unclaimed items at an SSU (admin view — not filtered by owner).
 * Move source: UserStorage.unclaimed_items Table<ID, UnclaimedItem>.
 * userStorageId — the object ID of UserStorage for this SSU.
 */
export function useUnclaimedSSUItems(userStorageId: string | null) {
  return useQuery<UnclaimedItem[]>({
    queryKey: ["bazaarcore", "unclaimed-ssu-items", userStorageId],
    enabled: !!userStorageId,
    queryFn: async (): Promise<UnclaimedItem[]> => {
      const page = await suiClient.getDynamicFields({ parentId: userStorageId! });
      if (page.hasNextPage) {
        console.warn(
          "[useUnclaimedSSUItems] unclaimed_items has more entries than fetched. " +
          "Cursor-based pagination not yet implemented."
        );
      }
      if (page.data.length === 0) return [];
      const settled = await Promise.allSettled(
        page.data.map((field) =>
          suiClient.getDynamicFieldObject({
            parentId: userStorageId!,
            name: field.name,
          })
        )
      );
      const failed = settled.filter((s) => s.status === "rejected").length;
      if (failed > 0) {
        console.warn(`[useUnclaimedSSUItems] ${failed} of ${settled.length} item fetches failed.`);
      }
      const items: UnclaimedItem[] = [];
      for (const s of settled) {
        if (s.status !== "fulfilled") continue;
        const content = s.value.data?.content as { fields?: Record<string, unknown> } | undefined;
        if (!content?.fields) continue;
        const wrapper = content.fields.value as { fields?: Record<string, unknown> } | undefined;
        const f = wrapper?.fields ?? content.fields;
        items.push({
          originalOwner: String(f.original_owner ?? ""),
          itemTypeId:    Number(f.item_type_id ?? 0),
          quantity:      Number(f.quantity ?? 0),
          shopId:        String(f.shop_id ?? ""),
          expiryMs:      Number(f.expiry_ms ?? 0),
        });
      }
      return items;
    },
    staleTime: 20_000,
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
