/**
 * @bazaar/shared/hooks — Shared RPC data-fetching hooks.
 *
 * Hooks follow the FrontendAPI.md specification exactly.
 * SuiClient singleton reads from Sui testnet RPC.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useQuery } from "@tanstack/react-query";
import { SHARED_OBJECTS, buildBazaarAppUrl } from "../constants";
import { suiClient } from "./sui-client";
import { useTribeCaps } from "./useTribeCaps";
import type {
  TribeSummary,
  RegisteredSSU,
  SSUSummary,
  DAppTaxConfig,
  TaxWalletData,
  SupportTicket,
} from "../types";

// ── Sui Client Singleton (re-exported from ./sui-client.ts) ─────────────────────
export { suiClient } from "./sui-client";

// ── Helper: read shared object fields ──────────────────────────────────────────

async function getObjectFields(objectId: string): Promise<Record<string, unknown>> {
  const result = await suiClient.getObject({
    id: objectId,
    options: { showContent: true },
  });
  const content = result.data?.content;
  if (!content || !("fields" in content)) {
    throw new Error(`Object ${objectId} has no parseable content.`);
  }
  return content.fields as Record<string, unknown>;
}

// ── Helper: unwrap dynamic field value ───────────────────────────────────────

/** Unwrap the value struct from a Sui dynamic field object (Field<K, V>).
 *  getDynamicFieldObject returns { fields: { id, name: <key>, value: { fields: <V> } } }.
 *  This extracts the inner V fields. */
function unwrapDfValue(entry: { data?: { content?: unknown } }): Record<string, unknown> | null {
  const wrapper = (entry.data?.content as { fields?: Record<string, unknown> })?.fields;
  if (!wrapper) return null;
  return (wrapper.value as { fields?: Record<string, unknown> })?.fields ?? null;
}

// ── Tribe Registry Hooks ───────────────────────────────────────────────────────

/**
 * C6/GAS-10 (V39): Tribe.ssu_ids is now a Table<address, bool> (was an inline vector).
 * Enumerate its dynamic fields (the keys are the SSU addresses) instead of reading
 * an inline array. The table descriptor is `ef.ssu_ids.fields.id.id`.
 */
async function enumerateTribeSsuIds(ssuIdsField: unknown): Promise<string[]> {
  const tableId = (ssuIdsField as { fields?: { id?: { id?: string } } } | undefined)
    ?.fields?.id?.id;
  if (!tableId) return [];
  const out: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await suiClient.getDynamicFields({ parentId: tableId, cursor });
    for (const d of page.data) {
      const addr = (d.name as { value?: unknown })?.value;
      if (typeof addr === "string") out.push(addr);
    }
    cursor = page.hasNextPage ? (page.nextCursor ?? null) : null;
  } while (cursor);
  return out;
}

/** Fetch all registered tribes from TribeRegistry dynamic fields. */
export function useTribes() {
  return useQuery<TribeSummary[]>({
    queryKey: ["tribes"],
    queryFn: async (): Promise<TribeSummary[]> => {
      const fields = await getObjectFields(SHARED_OBJECTS.TRIBE_REGISTRY);
      // tribes is a Table — get its object ID from the nested field
      const tribesTable = fields.tribes as { fields: { id: { id: string } } };
      const tableId = tribesTable?.fields?.id?.id;
      if (!tableId) return [];
      const dynamicFields = await suiClient.getDynamicFields({ parentId: tableId });
      // TODO: paginate beyond first 50 entries (add cursor support)
      const entries = await Promise.all(
        dynamicFields.data.map(async (df) => {
          const entry = await suiClient.getDynamicFieldObject({
            parentId: tableId,
            name: df.name,
          });
          const ef = unwrapDfValue(entry);
          if (!ef) return null;
          const ssuIds = await enumerateTribeSsuIds(ef.ssu_ids);
          return {
            id: String(ef.id ?? ""),
            name: String(ef.name ?? ""),
            description: String(ef.description ?? ""),
            memberCount: Number(ef.member_count ?? 0),
            ssuCount: Number(ef.ssu_count ?? ssuIds.length),
            ssuIds,
            bazaarType: (ef.bazaar_type === 1 ? "easy" : ef.bazaar_type === 2 ? "advanced" : "notribe") as TribeSummary["bazaarType"],
            joinPolicy: (ef.join_policy === 0 ? "open" : "application") as TribeSummary["joinPolicy"],
            isActive: Boolean(ef.is_active),
            leaderAddress: String(ef.leader ?? ""),
            createdAt: Number(ef.created_at ?? 0),
          } satisfies TribeSummary;
        })
      );
      return entries.filter((e): e is TribeSummary => e !== null && e.isActive);
    },
    staleTime: 30_000,
  });
}

/** Fetch a single tribe by numeric tribe ID. */
export function useTribeById(tribeId: string | null) {
  return useQuery<TribeSummary | null>({
    queryKey: ["tribe", tribeId],
    enabled: !!tribeId,
    queryFn: async (): Promise<TribeSummary | null> => {
      const fields = await getObjectFields(SHARED_OBJECTS.TRIBE_REGISTRY);
      const tribesTable = fields.tribes as { fields: { id: { id: string } } };
      const tableId = tribesTable?.fields?.id?.id;
      if (!tableId || !tribeId) return null;
      const entry = await suiClient.getDynamicFieldObject({
        parentId: tableId,
        name: { type: "u64", value: tribeId },
      });
      const ef = unwrapDfValue(entry);
      if (!ef) return null;
      const ssuIds = await enumerateTribeSsuIds(ef.ssu_ids);
      return {
        id: String(ef.id ?? ""),
        name: String(ef.name ?? ""),
        description: String(ef.description ?? ""),
        memberCount: Number(ef.member_count ?? 0),
        ssuCount: Number(ef.ssu_count ?? ssuIds.length),
        ssuIds,
        bazaarType: (ef.bazaar_type === 1 ? "easy" : ef.bazaar_type === 2 ? "advanced" : "notribe") as TribeSummary["bazaarType"],
        joinPolicy: (ef.join_policy === 0 ? "open" : "application") as TribeSummary["joinPolicy"],
        isActive: Boolean(ef.is_active),
        leaderAddress: String(ef.leader ?? ""),
        createdAt: Number(ef.created_at ?? 0),
      };
    },
    staleTime: 30_000,
  });
}

/**
 * Whether the connected wallet holds a tribe governance cap (Leader / SuperAdmin /
 * Admin / Mod) bound to a tribe that is STILL ACTIVE in the registry.
 *
 * Gates the DappHub "My Tribe Governance" entry. A wallet KEEPS its TribeLeaderCap
 * after the tribe is removed from DApp Management — `deactivate_tribe` only flips
 * `Tribe.is_active`, it never burns the cap — so a cap-presence check alone keeps
 * granting governance access to a deleted tribe (the Issue-1 leak). Cross-reference
 * the cap's encoded `tribe_id` against the live tribe's `is_active` flag to close it.
 *
 * A wallet leads/staffs a single tribe, so we resolve the one tribe id encoded in
 * whichever cap is held (leader takes precedence) and read its current `is_active`.
 * `useTribeById` returns deactivated tribes too (with `isActive: false`) and fetches
 * by id, so this flips to `false` the instant the tribe is removed — unlike
 * `useTribes`, which is page-1-limited AND active-filtered (would mask the change).
 *
 * `isResolving` is true only while a held cap's tribe id / active flag is still
 * loading; callers should treat the role as ABSENT while resolving so a deactivated
 * tribe never momentarily re-grants access.
 */
export function useHasActiveTribeRole(): { hasActiveTribeRole: boolean; isResolving: boolean } {
  const {
    hasLeaderCap, hasSuperAdminCap, hasAdminCap, hasModCap,
    leaderTribeIdx, superAdminTribeIdx, adminTribeIdx, modTribeIdx,
  } = useTribeCaps();
  const hasAnyTribeCap = hasLeaderCap || hasSuperAdminCap || hasAdminCap || hasModCap;
  // Leader cap takes precedence; fall through to delegated-staff caps.
  const tribeIdx = leaderTribeIdx ?? superAdminTribeIdx ?? adminTribeIdx ?? modTribeIdx;
  const tribeIdStr = tribeIdx != null ? String(tribeIdx) : null;
  const { data: tribe, isLoading } = useTribeById(hasAnyTribeCap ? tribeIdStr : null);
  return {
    hasActiveTribeRole: hasAnyTribeCap && !!tribe && tribe.isActive,
    isResolving: hasAnyTribeCap && (tribeIdStr === null || isLoading),
  };
}

/** Search tribes by name — client-side filter on useTribes data. */
export function useTribeSearch(query: string) {
  const tribesQuery = useTribes();
  return useQuery<TribeSummary[]>({
    queryKey: ["tribes", "search", query],
    queryFn: async (): Promise<TribeSummary[]> => {
      const all = tribesQuery.data ?? [];
      if (!query.trim()) return all;
      const q = query.toLowerCase();
      return all.filter(t => t.name.toLowerCase().includes(q));
    },
    enabled: !tribesQuery.isLoading,
    staleTime: 10_000,
  });
}

// ── SSU Registry Hooks ─────────────────────────────────────────────────────────

/** Fetch all SSUs registered by a specific wallet address. */
export function useMySSUs(walletAddress: string | null) {
  return useQuery<RegisteredSSU[]>({
    queryKey: ["my-ssus", walletAddress],
    enabled: !!walletAddress,
    queryFn: async (): Promise<RegisteredSSU[]> => {
      if (!walletAddress) return [];
      const fields = await getObjectFields(SHARED_OBJECTS.SSU_REGISTRY);
      const regsTable = fields.registrations as { fields: { id: { id: string } } };
      const tableId = regsTable?.fields?.id?.id;
      if (!tableId) return [];
      // TODO: paginate — first 50 entries only
      const dynamicFields = await suiClient.getDynamicFields({ parentId: tableId });
      const entries = await Promise.all(
        dynamicFields.data.map(async (df) => {
          const entry = await suiClient.getDynamicFieldObject({
            parentId: tableId,
            name: df.name,
          });
          const ef = unwrapDfValue(entry);
          if (!ef || ef.owner !== walletAddress) return null;
          return {
            ssuId: String(ef.ssu_id ?? ""),
            tribeId: ef.tribe_id != null && String(ef.tribe_id) !== "0"
              ? String(ef.tribe_id)
              : null,
            tribeName: null, // requires tribe lookup — omitted for performance
            url: buildSSUUrl(ef),
            status: Boolean(ef.is_active) ? "active" : "inactive",
            registeredAtMs: Number(ef.registered_at ?? 0),
          } satisfies RegisteredSSU;
        })
      );
      return entries.filter((e): e is RegisteredSSU => e !== null);
    },
    staleTime: 15_000,
  });
}

function buildSSUUrl(ef: Record<string, unknown>): string {
  const ssuId = String(ef.ssu_id ?? "");
  const bazaarType = Number(ef.bazaar_type ?? 0);
  const kind = bazaarType === 1 ? "easy" : bazaarType === 2 ? "advanced" : "notribe";
  return buildBazaarAppUrl(kind, ssuId);
}

/** Fetch all registered SSUs (admin view). */
export function useAllSSUs() {
  return useQuery<SSUSummary[]>({
    queryKey: ["all-ssus"],
    queryFn: async (): Promise<SSUSummary[]> => {
      const fields = await getObjectFields(SHARED_OBJECTS.SSU_REGISTRY);
      const regsTable = fields.registrations as { fields: { id: { id: string } } };
      const tableId = regsTable?.fields?.id?.id;
      if (!tableId) return [];
      // TODO: paginate — first 50 entries only
      const dynamicFields = await suiClient.getDynamicFields({ parentId: tableId });
      const entries = await Promise.all(
        dynamicFields.data.map(async (df) => {
          const entry = await suiClient.getDynamicFieldObject({
            parentId: tableId,
            name: df.name,
          });
          const ef = unwrapDfValue(entry);
          if (!ef) return null;
          const bazaarType = Number(ef.bazaar_type ?? 0);
          return {
            ssuId: String(ef.ssu_id ?? ""),
            ownerAddress: String(ef.owner ?? ""),
            bazaarType: (bazaarType === 1 ? "easy" : bazaarType === 2 ? "advanced" : "notribe") as SSUSummary["bazaarType"],
            tribeId: ef.tribe_id != null && String(ef.tribe_id) !== "0"
              ? String(ef.tribe_id)
              : null,
            tribeName: null,
            isActive: Boolean(ef.is_active),
            registeredAt: Number(ef.registered_at ?? 0),
          } satisfies SSUSummary;
        })
      );
      return entries.filter((e): e is SSUSummary => e !== null);
    },
    staleTime: 30_000,
  });
}

/** Fetch status of a specific SSU. */
export function useSSUStatus(ssuId: string | null) {
  return useQuery<{
    status: string;
    tribeId: string | null;
    bazaarType: string;
    ownerAddress: string;
  } | null>({
    queryKey: ["ssu-status", ssuId],
    enabled: !!ssuId,
    queryFn: async () => {
      if (!ssuId) return null;
      const fields = await getObjectFields(SHARED_OBJECTS.SSU_REGISTRY);
      const regsTable = fields.registrations as { fields: { id: { id: string } } };
      const tableId = regsTable?.fields?.id?.id;
      if (!tableId) return null;
      try {
        const entry = await suiClient.getDynamicFieldObject({
          parentId: tableId,
          name: { type: "address", value: ssuId },
        });
        const ef = unwrapDfValue(entry);
        if (!ef) return null;
        const bt = Number(ef.bazaar_type ?? 0);
        return {
          status: Boolean(ef.is_active) ? "active" : "inactive",
          tribeId: ef.tribe_id != null && String(ef.tribe_id) !== "0"
            ? String(ef.tribe_id)
            : null,
          bazaarType: bt === 1 ? "easy" : bt === 2 ? "advanced" : "notribe",
          ownerAddress: String(ef.owner ?? ""),
        };
      } catch {
        return null;
      }
    },
    staleTime: 10_000,
  });
}

// ── Governance Hooks ───────────────────────────────────────────────────────────

// useDAppTaxConfig, useDAppOwner, useGovernanceConfig relocated to
// dapp_hub/governance-config-hooks.ts (R6.6.3 OS-28 LOC headroom + extension).
// Re-exported below — import paths for consumers are unchanged.
export * from "./dapp_hub/governance-config-hooks";

// ── Tax Wallet Hooks ───────────────────────────────────────────────────────────

/** Fetch the DApp tax wallet balance and statistics. */
export function useTaxWallet() {
  return useQuery<TaxWalletData>({
    queryKey: ["tax-wallet"],
    queryFn: async (): Promise<TaxWalletData> => {
      const fields = await getObjectFields(SHARED_OBJECTS.TAX_WALLET);
      // balance is Balance<EVE> — represented as { fields: { value: "N" } }
      const balanceField = fields.balance as { fields?: { value?: string }; value?: string } | undefined;
      const rawBalance = Number(
        balanceField?.fields?.value ?? balanceField?.value ?? 0
      );
      return {
        balance: rawBalance,
        totalCollected: Number(fields.total_collected ?? 0),
        totalWithdrawn: Number(fields.total_withdrawn ?? 0),
        depositCount: Number(fields.deposit_count ?? 0),
      };
    },
    staleTime: 15_000,
  });
}

// (useTaxTransactionLog DELETED Phase 8 A3 / AUD-DH-21 — a dead wire-up TODO
//  returning []; superseded by useDAppTaxHistory.)

// ── Ticket Hooks ───────────────────────────────────────────────────────────────

const TAG_FROM_U8: Record<number, SupportTicket["tag"]> = {
  0: "bug", 1: "feature-request", 2: "ssu-issue",
  3: "tribe-issue", 4: "account", 5: "other",
};

const CONTACT_FROM_U8: Record<number, SupportTicket["contactMethod"]> = {
  0: "none", 1: "discord", 2: "email",
};

const STATUS_FROM_U8: Record<number, SupportTicket["status"]> = {
  0: "open", 1: "in-progress", 2: "resolved", 3: "closed",
};

async function parseTicketsFromBoard(): Promise<SupportTicket[]> {
  const fields = await getObjectFields(SHARED_OBJECTS.TICKET_BOARD);
  const ticketsTable = fields.tickets as { fields: { id: { id: string } } };
  const tableId = ticketsTable?.fields?.id?.id;
  if (!tableId) return [];
  // TODO: paginate — first 50 entries only
  const dynamicFields = await suiClient.getDynamicFields({ parentId: tableId });
  const entries = await Promise.all(
    dynamicFields.data.map(async (df) => {
      const entry = await suiClient.getDynamicFieldObject({
        parentId: tableId,
        name: df.name,
      });
      const ef = unwrapDfValue(entry);
      if (!ef) return null;
      return {
        id: String(ef.id ?? ""),
        title: String(ef.title ?? ""),
        tag: TAG_FROM_U8[Number(ef.tag ?? 0)] ?? "other",
        body: String(ef.body ?? ""),
        contactMethod: CONTACT_FROM_U8[Number(ef.contact_method ?? 0)] ?? "none",
        contactValue: String(ef.contact_value ?? ""),
        authorAddress: String(ef.author ?? ""),
        status: STATUS_FROM_U8[Number(ef.status ?? 0)] ?? "open",
        createdAtMs: Number(ef.created_at ?? 0),
      } satisfies SupportTicket;
    })
  );
  return entries.filter((e): e is SupportTicket => e !== null);
}

/** Fetch all support tickets (admin view). */
export function useTickets() {
  return useQuery<SupportTicket[]>({
    queryKey: ["tickets"],
    queryFn: parseTicketsFromBoard,
    staleTime: 30_000,
  });
}

/** Fetch tickets submitted by a specific wallet. */
export function useMyTickets(walletAddress: string | null) {
  return useQuery<SupportTicket[]>({
    queryKey: ["my-tickets", walletAddress],
    enabled: !!walletAddress,
    queryFn: async (): Promise<SupportTicket[]> => {
      if (!walletAddress) return [];
      const all = await parseTicketsFromBoard();
      return all.filter(t => t.authorAddress === walletAddress);
    },
    staleTime: 30_000,
  });
}

// ── Application Hooks ──────────────────────────────────────────────────────────
// NOTE: the former usePendingApplications() inline-vector reader was retired at
// Slice C1/GAS-09 (V39) — RegistrationRequestQueue.applications is now a
// Table<u64, TribeApplication> (dynamic fields, not an inline vector). The live
// pending-applications path is useRegistrationRequests.ts, which enumerates the
// Table DFs. This hook was dead (zero consumers) and also mis-keyed id to a
// positional index, so it was removed rather than migrated.

export * from "./bazaarcore";
export * from "./bazaareconomy";
export { useUnregisterSSU } from "./useUnregisterSSU";
export type { UnregisterSSUArgs, UnregisterSSUResult } from "./useUnregisterSSU";
export { useGodotBridge } from "./useGodotBridge";
export type {
  UseGodotBridgeOptions, UseGodotBridgeReturn,
  BeaconScreenPos, ShopScreenRect, GodotMessage,
} from "./useGodotBridge";
export { useTextDecode }           from "./useTextDecode";
export type { UseTextDecodeOptions, UseTextDecodeResult } from "./useTextDecode";
export { useDissolve }             from "./useDissolve";
export type { UseDissolveResult }  from "./useDissolve";
export { useCharacterForAddress }  from "./useCharacterForAddress";
export type { CharacterInfo as CharacterAddressInfo } from "./useCharacterForAddress";
export { useCharacterNames }       from "./useCharacterNames";
export { useSSUOwners }            from "./useSSUOwners";
export type { SSUOwnerInfo, SSUOwnerMap } from "./useSSUOwners";
export { usePlayerCharacter, resolveCharacterIdByWallet } from "./usePlayerCharacter";
export type { PlayerCharacter, UsePlayerCharacterResult }  from "./usePlayerCharacter";
export { useInputCapture }         from "./useInputCapture";
export type { UseInputCaptureOptions } from "./useInputCapture";
export { useSSUInventory, useSSUInventoryByKey } from "./useSSUInventory";
export type { InventoryItem }                    from "./useSSUInventory";
export { useOwnedInventory }                     from "./useOwnedInventory";
export type { OwnedInventoryItem as OwnedInventoryItemV2, OwnedInventoryResult } from "./useOwnedInventory";
export { useUserStorage }                        from "./useUserStorage";
export type { LockedItem, UserStorageResult }    from "./useUserStorage";
export { useUnclaimedItems }                     from "./useUnclaimedItems";
export type { UnclaimedItem as UnclaimedItemV2 } from "./useUnclaimedItems";
export { useItemTypes, searchCachedItemTypes, prefetchAllItemTypes } from "./useItemTypes";
export type { ItemTypeInfo }                     from "./useItemTypes";
export { useShops }                              from "./useShops";
export { useSolarSystemName, resolveSolarSystem } from "./useSolarSystemName";
export type { SolarSystemInfo, UseSolarSystemNameResult } from "./useSolarSystemName";
export { useLockerCapacity, fetchLockerCapacity, lockerWouldOverflow } from "./useLockerCapacity";
export type { LockerCapacity, UseLockerCapacityResult } from "./useLockerCapacity";
export { useSSUDappTaxPaid } from "./useSSUDappTaxPaid";
export type { SSUDappTaxTotals, UseSSUDappTaxPaidResult } from "./useSSUDappTaxPaid";
export { useResolveCharacterAndSSUStatus }       from "./useResolveCharacterAndSSUStatus";
export type { CharacterSSUStatus }               from "./useResolveCharacterAndSSUStatus";
export { useClaimBox }                           from "./useClaimBox";
export type { UseClaimBoxResult }                from "./useClaimBox";

export { useBazaarType } from "./useBazaarType";
export type { BazaarTypeName, UseBazaarTypeResult } from "./useBazaarType";

// R2.3 Bazar1 verbatim port re-exports (extracted to bazar1-hooks-index.ts for 500-line compliance)
export * from "./bazar1-hooks-index";

export * from "./useTribeAssets";
export * from "./godot";
