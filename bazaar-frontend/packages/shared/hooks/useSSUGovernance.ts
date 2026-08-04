// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useMemo, useCallback } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { PACKAGE_ID, ORIGINAL_PACKAGE_ID } from "@bazaar/shared/constants";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useSSUCaps } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

export interface TaxSurcharge {
  wts_surcharge_bps: number;
  wtb_surcharge_bps: number;
  de_surcharge_amount: number;
}

export interface SsuWalletTransaction {
  ssuId: string;
  walletType: 0 | 1;
  direction: 0 | 1;
  amount: bigint;
  fromAddr: string;
  toAddr: string;
  txType: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  shopId: string | null;
  digest: string;
  timestampMs: number;
}

export interface SSUGovernanceData {
  ssuOwner: string;
  isFrozen: boolean;
  localUsers: string[];
  localBanList: Map<string, number>;
  localTaxSurcharges: TaxSurcharge[];
  ssuAdmins: string[];
  ssuSuperAdmins: string[];
  ssuMods: string[];
  ssuTreasuryAddress: string;
  maxShopsOverride: number | null;
  taxWalletBalance: bigint;
  depositWalletBalance: bigint;
  walletTransactions: SsuWalletTransaction[];
  hasGovernance: boolean;
  isLoading: boolean;
}

export interface SSUCaps {
  hasSSUOwnerCap: boolean;
  hasSSUSuperAdminCap: boolean;
  hasSSUAdminCap: boolean;
  hasSSUModCap: boolean;
  ssuOwnerCapId: string | null;
  ssuSuperAdminCapId: string | null;
  ssuAdminCapId: string | null;
  ssuModCapId: string | null;
}

export type UseSSUGovernanceResult = SSUGovernanceData & SSUCaps & {
  /**
   * Maps each SSUSuperAdminCap holder address to their cap object ID.
   * Required by buildRevokeSSUSuperAdminCap which takes targetCapId, not address.
   * Populated lazily after ssuSuperAdmins is known; empty Map while loading.
   */
  ssuSuperAdminCapIds: Map<string, string>;
  refetchGovernance: () => void;
};

const DEFAULT_SURCHARGES: TaxSurcharge[] = Array.from({ length: 8 }, () => ({
  wts_surcharge_bps: 0,
  wtb_surcharge_bps: 0,
  de_surcharge_amount: 0,
}));

const DEFAULT_DATA: SSUGovernanceData = {
  ssuOwner: "",
  isFrozen: false,
  localUsers: [],
  localBanList: new Map(),
  localTaxSurcharges: DEFAULT_SURCHARGES,
  ssuAdmins: [],
  ssuSuperAdmins: [],
  ssuMods: [],
  ssuTreasuryAddress: "",
  maxShopsOverride: null,
  taxWalletBalance: 0n,
  depositWalletBalance: 0n,
  walletTransactions: [],
  hasGovernance: false,
  isLoading: false,
};

const DEFAULT_CAPS: SSUCaps = {
  hasSSUOwnerCap: false,
  hasSSUSuperAdminCap: false,
  hasSSUAdminCap: false,
  hasSSUModCap: false,
  ssuOwnerCapId: null,
  ssuSuperAdminCapId: null,
  ssuAdminCapId: null,
  ssuModCapId: null,
};

async function rpc(method: string, params: unknown[]): Promise<any> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const data = await resp.json();
  if (data?.error) throw new Error(data.error.message);
  return data.result;
}

function parseSurcharge(raw: any): TaxSurcharge {
  return {
    wts_surcharge_bps: Number(raw?.fields?.wts_surcharge_bps ?? 0),
    wtb_surcharge_bps: Number(raw?.fields?.wtb_surcharge_bps ?? 0),
    de_surcharge_amount: Number(raw?.fields?.de_surcharge_amount ?? 0),
  };
}

function parseWalletTxEvent(raw: any): SsuWalletTransaction | null {
  const f = raw?.parsedJson;
  if (!f) return null;
  const shopIdVec: string[] | null = f.shop_id ?? null;
  return {
    ssuId: f.ssu_id ?? "",
    walletType: Number(f.wallet_type) as 0 | 1,
    direction: Number(f.direction) as 0 | 1,
    amount: BigInt(f.amount ?? 0),
    fromAddr: f.from_addr ?? "",
    toAddr: f.to_addr ?? "",
    txType: Number(f.tx_type) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    shopId: Array.isArray(shopIdVec) && shopIdVec.length > 0 ? shopIdVec[0] : null,
    digest: raw?.id?.txDigest ?? "",
    timestampMs: Number(raw?.timestampMs ?? 0),
  };
}

async function fetchWalletTransactions(ssuId: string): Promise<SsuWalletTransaction[]> {
  if (!PACKAGE_ID) return [];
  try {
    const result = await rpc("suix_queryEvents", [
      { MoveEventType: `${ORIGINAL_PACKAGE_ID}::ssu_governance::SsuWalletTransaction` },
      null, 50, true,
    ]);
    const events: any[] = result?.data ?? [];
    return events
      .map(parseWalletTxEvent)
      .filter((e): e is SsuWalletTransaction => e !== null && e.ssuId === ssuId);
  } catch {
    return [];
  }
}

async function fetchTableKeys(tableUid: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const result = await rpc("suix_getDynamicFields", [tableUid, cursor, 50]);
    const fields: any[] = result?.data ?? [];
    for (const f of fields) {
      const name = f?.name;
      if (name?.type === "address" && typeof name?.value === "string") {
        keys.push(name.value);
      }
    }
    hasNextPage = result?.hasNextPage ?? false;
    cursor = result?.nextCursor ?? null;
    if (!hasNextPage) break;
  }
  return keys;
}

export function useSSUGovernance(ssuId: string): UseSSUGovernanceResult {
  const { walletAddress } = useConnection();
  const [govData, setGovData] = useState<SSUGovernanceData>({ ...DEFAULT_DATA, isLoading: true });
  const [tick, setTick] = useState(0);
  const [superAdminCapIds, setSuperAdminCapIds] = useState<Map<string, string>>(
    () => new Map<string, string>()
  );

  const refetchGovernance = useCallback(() => setTick(t => t + 1), []);

  // Bug 1A+1B fix: use useSSUSharedObjects to resolve ssuGovId at runtime.
  // Eliminates the SSU_GOVERNANCE_REGISTRY_ID env-constant early-return.
  const { data: sharedObjects, isLoading: sharedLoading } = useSSUSharedObjects(ssuId || null);
  const ssuGovId = sharedObjects?.ssuGovId ?? null;

  // Bug 1B fix: delegate cap detection to useSSUCaps which correctly filters
  // by bazaar_core::membership::SSU*Cap (not the broken ::ssu_governance::SSU* pattern).
  const capsQuery = useSSUCaps(walletAddress ?? null, ssuId || null);
  const capsData = capsQuery.data;

  useEffect(() => {
    if (!ssuGovId) {
      setGovData({ ...DEFAULT_DATA, isLoading: sharedLoading });
      return;
    }
    let cancelled = false;
    setGovData(prev => ({ ...prev, isLoading: true }));

    async function fetchGovernance() {
      try {
        const govObj = await rpc("sui_getObject", [ssuGovId!, { showContent: true }]);
        if (!govObj?.data) {
          if (!cancelled) setGovData({ ...DEFAULT_DATA, isLoading: false });
          return;
        }
        const govFields = govObj.data?.content?.fields ?? {};
        const ssuOwner: string = govFields.owner ?? govFields.ssu_owner ?? "";
        const isFrozen: boolean = govFields.frozen ?? false;
        const ssuTreasuryAddress: string = govFields.ssu_treasury_address ?? "";
        const maxShopsOverrideRaw = govFields.max_shops_override;
        const maxShopsOverride: number | null =
          maxShopsOverrideRaw?.fields?.vec?.length > 0
            ? Number(maxShopsOverrideRaw.fields.vec[0]) : null;

        const taxWalletBalance: bigint = BigInt(
          govFields.tax_wallet?.fields?.value ?? govFields.tax_wallet?.value ?? 0
        );
        const depositWalletBalance: bigint = BigInt(
          govFields.deposit_wallet?.fields?.value ?? govFields.deposit_wallet?.value ?? 0
        );

        const rawSurcharges: any[] = govFields.local_tax_surcharges ?? [];
        const localTaxSurcharges: TaxSurcharge[] =
          rawSurcharges.length === 8 ? rawSurcharges.map(parseSurcharge) : DEFAULT_SURCHARGES;

        // Read admin/mod lists from ssuGovId's Table fields (if present).
        // Gracefully returns [] when fields are absent (no crash).
        const ssuAdminsTableId: string    = govFields.ssu_admins?.fields?.id?.id ?? "";
        const ssuSuperAdminsTableId: string = govFields.ssu_super_admins?.fields?.id?.id ?? "";
        const ssuModsTableId: string      = govFields.ssu_mods?.fields?.id?.id ?? "";
        const localUsersTableId: string   = govFields.local_users?.fields?.id?.id ?? "";
        const localBanListTableId: string = govFields.local_ban_list?.fields?.id?.id ?? "";

        const [ssuAdmins, ssuSuperAdmins, ssuMods, localUsers, walletTransactions] = await Promise.all([
          ssuAdminsTableId      ? fetchTableKeys(ssuAdminsTableId)      : Promise.resolve([]),
          ssuSuperAdminsTableId ? fetchTableKeys(ssuSuperAdminsTableId) : Promise.resolve([]),
          ssuModsTableId        ? fetchTableKeys(ssuModsTableId)        : Promise.resolve([]),
          localUsersTableId     ? fetchTableKeys(localUsersTableId)     : Promise.resolve([]),
          fetchWalletTransactions(ssuId),
        ]);

        const localBanList = new Map<string, number>();
        if (localBanListTableId) {
          const banKeys = await fetchTableKeys(localBanListTableId);
          await Promise.all(banKeys.map(async addr => {
            try {
              const banEntry = await rpc("suix_getDynamicFieldObject",
                [localBanListTableId, { type: "address", value: addr }]);
              localBanList.set(addr, Number(banEntry?.data?.content?.fields?.value ?? 0));
            } catch { localBanList.set(addr, 0); }
          }));
        }

        if (!cancelled) {
          setGovData({
            ssuOwner, isFrozen, localUsers, localBanList,
            localTaxSurcharges, ssuAdmins, ssuSuperAdmins, ssuMods,
            ssuTreasuryAddress, maxShopsOverride, taxWalletBalance, depositWalletBalance,
            walletTransactions, hasGovernance: true, isLoading: false,
          });
        }
      } catch (e) {
        console.warn("[useSSUGovernance] fetch failed:", e);
        if (!cancelled) setGovData({ ...DEFAULT_DATA, isLoading: false });
      }
    }

    fetchGovernance();
    const interval = setInterval(fetchGovernance, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [ssuGovId, ssuId, tick, sharedLoading]);

  // ── SuperAdmin cap-ID enumeration ──────────────────────────────────────────
  // For each address in ssuSuperAdmins, look up the SSUSuperAdminCap object ID
  // owned by that address.  Required by buildRevokeSSUSuperAdminCap (takes capId).
  // Fires whenever the governance data refreshes (govData.ssuSuperAdmins changes).
  useEffect(() => {
    const holders = govData.ssuSuperAdmins;
    if (!PACKAGE_ID || holders.length === 0) {
      setSuperAdminCapIds(new Map<string, string>());
      return;
    }
    let cancelled = false;
    const superAdminType = `${ORIGINAL_PACKAGE_ID}::membership::SSUSuperAdminCap`;

    async function fetchSuperAdminCapIds(): Promise<void> {
      const result = new Map<string, string>();
      await Promise.all(
        holders.map(async (holderAddr) => {
          try {
            let cursor: string | null = null;
            let hasNextPage = true;
            while (hasNextPage) {
              const page: unknown = await rpc("suix_getOwnedObjects", [
                holderAddr,
                { filter: { StructType: superAdminType }, options: { showType: true } },
                cursor,
                10,
              ]);
              const data: unknown[] =
                Array.isArray((page as Record<string, unknown>)?.data)
                  ? ((page as Record<string, unknown>).data as unknown[])
                  : [];
              for (const item of data) {
                const objectId =
                  (item as Record<string, unknown>)?.data != null
                    ? ((item as Record<string, unknown>).data as Record<string, unknown>)
                        ?.objectId
                    : undefined;
                if (typeof objectId === "string" && objectId) {
                  result.set(holderAddr, objectId);
                  hasNextPage = false; // one cap per holder; stop after first
                  break;
                }
              }
              hasNextPage =
                ((page as Record<string, unknown>)?.hasNextPage as boolean | undefined) ===
                  true && hasNextPage;
              cursor =
                ((page as Record<string, unknown>)?.nextCursor as string | null | undefined) ??
                null;
              if (!hasNextPage) break;
            }
          } catch {
            // holder may not currently own a cap; skip silently
          }
        })
      );
      if (!cancelled) setSuperAdminCapIds(result);
    }

    fetchSuperAdminCapIds();
    return () => { cancelled = true; };
  }, [govData.ssuSuperAdmins, ssuId]);

  // Map useSSUCaps result shape -> SSUCaps shape expected by UseSSUGovernanceResult.
  const ssuCaps: SSUCaps = useMemo(() => {
    if (!capsData) return DEFAULT_CAPS;
    return {
      hasSSUOwnerCap:      capsData.hasSSUOwnerCap,
      hasSSUSuperAdminCap: capsData.hasSSUSuperAdminCap,
      hasSSUAdminCap:      capsData.hasSSUAdminCap,
      hasSSUModCap:        capsData.hasSSUModCap,
      ssuOwnerCapId:      capsData.capIds?.ownerCapId      ?? null,
      ssuSuperAdminCapId: capsData.capIds?.superAdminCapId ?? null,
      ssuAdminCapId:      capsData.capIds?.adminCapId      ?? null,
      ssuModCapId:        capsData.capIds?.modCapId        ?? null,
    };
  }, [capsData]);

  return useMemo(
    () => ({ ...govData, ...ssuCaps, ssuSuperAdminCapIds: superAdminCapIds, refetchGovernance }),
    [govData, ssuCaps, superAdminCapIds, refetchGovernance]
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
