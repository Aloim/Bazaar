// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useMemo, useCallback } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useOwnedCaps } from "./useOwnedCaps";
import type { Roles } from "@bazaar/shared/types";
import { debug } from "@bazaar/shared/utils/debug";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

const EMPTY: Roles = {
  isOwner:      false,
  isAdmin:      false,
  isModerator:  false,
  isMember:     false,
  isRegistered: false,
  isLoading:    false,
};

/** Sentinel: loading not yet complete. */
export const LOADING_SENTINEL = -1;

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

/**
 * OS-58 Bug 6 + C-01: useRoles now accepts ssuId and resolves memberRegistryId at runtime
 * via useSSUSharedObjects. LOADING_SENTINEL semantics prevent isRegistered=false flash.
 *
 * C-01 BLOCKER FIX: field-read changed from `market_roles` -> `members` (table name)
 * and value extraction changed from `fields.value` (scalar) -> `fields.value.fields.ssu_role`
 * (MemberEntry struct). Matches BazaarCore/sources/membership.move:26-41.
 */
export function useRoles(
  ssuId: string | null
): Roles & { ssuRole: number; rawSSURole: number; tribeRole: number; isInRegistry: boolean; refetchRoles: () => void } {
  const { walletAddress } = useConnection();
  const { data: shared } = useSSUSharedObjects(ssuId || null);
  const memberRegistryId = shared?.memberRegistryId ?? null;
  const caps = useOwnedCaps();
  const [ssuRole, setSSURole]           = useState<number>(LOADING_SENTINEL);
  const [tribeRole, setTribeRole]       = useState<number>(0);
  const [isInRegistry, setIsInRegistry] = useState<boolean | null>(null);
  const [tick, setTick]                 = useState(0);

  const refetchRoles = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!walletAddress) {
      // Not connected: no role
      setSSURole(0);
      setTribeRole(0);
      setIsInRegistry(false);
      return;
    }
    if (!memberRegistryId) {
      // ssuId provided but registry not yet resolved (or ssuId=null).
      // Stay in LOADING_SENTINEL to prevent isRegistered=false flash.
      setSSURole(LOADING_SENTINEL);
      setTribeRole(0);
      setIsInRegistry(null);
      return;
    }

    setSSURole(LOADING_SENTINEL);
    setTribeRole(0);
    setIsInRegistry(null);
    let cancelled = false;

    async function fetchRole() {
      try {
        // Step 1: Get MemberRegistry object to find the members table UID
        // C-01 FIX: field is `members` (Table<address, MemberEntry>), NOT `market_roles`.
        const registry = await rpc("sui_getObject", [memberRegistryId!, { showContent: true }]);
        const fields = registry?.data?.content?.fields ?? {};
        const tableId = fields.members?.fields?.id?.id;
        if (!tableId) {
          if (!cancelled) { setSSURole(0); setTribeRole(0); setIsInRegistry(false); }
          return;
        }

        // Step 2: Look up this wallet address in the Table<address, MemberEntry>
        const fieldObj = await rpc("suix_getDynamicFieldObject", [
          tableId,
          { type: "address", value: walletAddress },
        ]);

        if (!fieldObj?.data || fieldObj?.error) {
          if (!cancelled) { setSSURole(0); setTribeRole(0); setIsInRegistry(false); }
          return;
        }

        // C-01 FIX: `value` is MemberEntry struct { player, ssu_role, tribe_role, is_banned, ... }
        // NOT a u8 scalar. Read .fields.ssu_role + .fields.tribe_role from the MoveStruct wrapper.
        const valFields = fieldObj.data?.content?.fields?.value?.fields ?? {};
        const val = Number(valFields.ssu_role ?? 0);
        const tribeVal = Number(valFields.tribe_role ?? 0);
        debug("[useRoles] RPC ssu_role/tribe_role for", walletAddress, "=", val, "/", tribeVal);
        if (!cancelled) { setSSURole(val); setTribeRole(tribeVal); setIsInRegistry(true); }
      } catch (e) {
        console.warn("[useRoles] RPC fetchRole failed:", e);
        if (!cancelled) { setSSURole(0); setTribeRole(0); setIsInRegistry(false); }
      }
    }

    fetchRole();
    return () => { cancelled = true; };
  }, [walletAddress, memberRegistryId, tick]);

  const roles = useMemo(() => {
    if (!walletAddress) return EMPTY;
    const registered = isInRegistry ?? false;
    const loading = isInRegistry === null || ssuRole === LOADING_SENTINEL;
    const effectiveSsuRole = ssuRole === LOADING_SENTINEL ? 0 : ssuRole;
    return {
      isOwner:      caps.hasOwnerCap || effectiveSsuRole === 7,
      isAdmin:      caps.hasOwnerCap || caps.hasSuperAdminCap || caps.hasAdminCap || effectiveSsuRole === 5 || effectiveSsuRole === 6,
      isModerator:  caps.hasOwnerCap || caps.hasSuperAdminCap || caps.hasAdminCap || caps.hasModCap || effectiveSsuRole === 4,
      isMember:     effectiveSsuRole === 2 || effectiveSsuRole === 3,
      isRegistered: registered,
      isLoading:    loading,
    };
  }, [walletAddress, caps, ssuRole, isInRegistry]);

  const rawRole = ssuRole === LOADING_SENTINEL ? 0 : ssuRole;
  const effectiveRole = (caps.hasOwnerCap || caps.hasSuperAdminCap || caps.hasAdminCap || caps.hasModCap)
    ? Math.max(rawRole, 1)
    : rawRole;
  const isInRegistryExposed = isInRegistry === true;
  return { ...roles, ssuRole: effectiveRole, rawSSURole: rawRole, tribeRole, isInRegistry: isInRegistryExposed, refetchRoles };
}

export { useOwnedCaps } from "./useOwnedCaps";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
