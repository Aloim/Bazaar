// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore identity hooks — useTribeIdentity, useTribeRoles, useItemTypes.
 *
 * useTribeIdentity — cross-package: reads dapp_hub TribeRegistry (augments useTribeById).
 * useTribeRoles    — checks 4 tribe cap types for the connected wallet.
 * useItemTypes     — external item type metadata (NOT from BazaarCore Move).
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useQuery } from "@tanstack/react-query";
import type { TribeRoles } from "../../types/bazaarcore";
import { TRIBE_CAP_TYPES } from "../../types/bazaarcore";
import { SHARED_OBJECTS, WORLD_PACKAGE_ID } from "../../constants";
import { suiClient } from "../sui-client";
import type { SuiObjectResponse } from "../sui-client";
import { useState, useEffect } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useSSUGovernanceConfig } from "./ssu-governance-hooks";
import { resolveSSUOwnerCap } from "../../tx/bazaarcore/ssu-receiving-tx";
import type { SSUOwnerCapRef } from "../../tx/bazaarcore/ssu-receiving-tx";

// ── useTribeIdentity ───────────────────────────────────────────────────────────

/**
 * Read tribe identity (name, description, join_policy) for a tribe.
 * Move source: dapp_hub::tribe_registry::Tribe — cross-package boundary.
 * This hook augments the existing useTribeById DappHub hook with BazaarCore context.
 * For most uses, prefer useTribeById from the main hooks package directly.
 * tribeRegistryId — SHARED_OBJECTS.TRIBE_REGISTRY from DappHub.
 */
export function useTribeIdentity(tribeId: string | null) {
  return useQuery({
    queryKey: ["bazaarcore", "tribe-identity", tribeId],
    enabled: !!tribeId,
    queryFn: async () => {
      const resp = await suiClient.getDynamicFieldObject({
        parentId: SHARED_OBJECTS.TRIBE_REGISTRY,
        name: { type: "u64", value: tribeId! },
      });
      const content = resp.data?.content as { fields?: Record<string, unknown> } | undefined;
      if (!content?.fields) return null;
      const tribeWrapper = content.fields.value as { fields?: Record<string, unknown> } | undefined;
      const f = tribeWrapper?.fields ?? content.fields;
      return {
        id:           Number(f.id ?? 0),
        name:         String(f.name ?? ""),
        description:  String(f.description ?? ""),
        leader:       String(f.leader ?? ""),
        bazaarType:   Number(f.bazaar_type ?? 0),
        joinPolicy:   Number(f.join_policy ?? 0),
        isActive:     Boolean(f.is_active ?? false),
        memberCount:  Number(f.member_count ?? 0),
        createdAt:    Number(f.created_at ?? 0),
      };
    },
    staleTime: 30_000,
  });
}

// ── useTribeRoles ──────────────────────────────────────────────────────────────

/**
 * Check tribe cap flags for walletAddress at a specific tribe.
 * Move source: tribe_registry::TribeLeaderCap (dapp_hub) + tribe_governance caps (bazaar_core).
 * RPC: suix_getOwnedObjects for each cap struct type, filter tribe_id field.
 */
export function useTribeRoles(walletAddress: string | null, tribeId: string | null) {
  return useQuery<TribeRoles>({
    queryKey: ["bazaarcore", "tribe-roles", walletAddress, tribeId],
    enabled: !!(walletAddress && tribeId),
    queryFn: async (): Promise<TribeRoles> => {
      const owner = walletAddress!;
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
      const hasCap = (objs: SuiObjectResponse[]): boolean =>
        objs.some((obj) => {
          const fields = obj.data?.content?.fields as Record<string, unknown> | undefined;
          return String(fields?.tribe_id) === targetTribeId;
        });
      return {
        hasTribeLeaderCap:      hasCap(leaderRes.data),
        hasTribeSuperAdminCap:  hasCap(superAdminRes.data),
        hasTribeAdminCap:       hasCap(adminRes.data),
        hasTribeModCap:         hasCap(modRes.data),
      };
    },
    staleTime: 30_000,
  });
}

// ── useIsSSUOwner ──────────────────────────────────────────────────────────────

/**
 * Result shape for useIsSSUOwner.
 * data      — true when the connected wallet equals gov.owner (case-insensitive).
 *             false while loading, when gov is null, or when wallet is disconnected.
 * isLoading — mirrors the underlying useSSUGovernanceConfig query isLoading flag.
 */
export interface UseIsSSUOwnerResult {
  data: boolean;
  isLoading: boolean;
}

/**
 * Returns whether the connected wallet is the SSU's registered owner.
 * Move source: ssu_governance::SSUGovernance.owner — accessor at ssu_governance.move:282.
 * Wallet source: useConnection().walletAddress from @evefrontier/dapp-kit.
 * Case-insensitive compare: both sides lowercased; same robustness convention as
 * useSSUCaps() line ssu-governance-hooks.ts:64.
 *
 * Phase 3 / EconomyFixplan: gates the asOwner branch in CreateShopModal + TX builders.
 *
 * ssuGovId — the object ID of the SSUGovernance shared object for the target SSU.
 *            Pass null when no SSU is selected; returns { data: false, isLoading: false }.
 */
export function useIsSSUOwner(ssuGovId: string | null): UseIsSSUOwnerResult {
  const { data: gov, isLoading } = useSSUGovernanceConfig(ssuGovId);
  const { walletAddress } = useConnection();
  const data =
    !!gov &&
    !!walletAddress &&
    walletAddress.toLowerCase() === String(gov.owner).toLowerCase();
  return { data, isLoading };
}

// ── useSSUOwnerCapRef ──────────────────────────────────────────────────────────

/**
 * Result shape for useSSUOwnerCapRef.
 * ref       — resolved SSUOwnerCapRef, or null if not resolved.
 * isLoading — true while resolveSSUOwnerCap is in-flight.
 */
export interface UseSSUOwnerCapRefResult {
  ref: SSUOwnerCapRef | null;
  isLoading: boolean;
}

/**
 * Async resolver hook: fetches the SSUOwnerCapRef for the given characterId + ssuId.
 * Only fires when isSSUOwner === true. Returns null while loading or when not owner.
 *
 * Binding Decision A (code-critic C-1): this hook is extracted here so CreateShopModal
 * collapses to a single call:
 *   const { ref: ssuOwnerCapRef, isLoading: ssuOwnerCapLoading } =
 *     useSSUOwnerCapRef(isSSUOwner, characterId, selectedShopSsuId);
 *
 * Abort-flag cleanup pattern: verbatim from useOwnedInventory.ts:57-65.
 * Three effect deps (isSSUOwner, characterId, ssuId) are exactly the variables
 * that gate the resolveSSUOwnerCap call.
 */
export function useSSUOwnerCapRef(
  isSSUOwner: boolean,
  characterId: string | null | undefined,
  ssuId: string | null | undefined,
): UseSSUOwnerCapRefResult {
  const [ref, setRef]           = useState<SSUOwnerCapRef | null>(null);
  const [isLoading, setLoading] = useState(false);
  useEffect(() => {
    if (!isSSUOwner || !characterId || !ssuId) {
      setRef(null);
      setLoading(false);
      return;
    }
    let aborted = false;
    setLoading(true);
    resolveSSUOwnerCap(characterId, ssuId)
      .then(r   => { if (!aborted) setRef(r); })
      .catch(()  => { if (!aborted) setRef(null); })
      .finally(() => { if (!aborted) setLoading(false); });
    return () => { aborted = true; };
  }, [isSSUOwner, characterId, ssuId]);
  return { ref, isLoading };
}

// ── useRecipientCharacter ──────────────────────────────────────────────────────

/**
 * Result shape for useRecipientCharacter.
 */
export interface UseRecipientCharacterResult {
  /** Recipient's Character shared-object ID, or null if unresolvable. */
  characterId: string | null;
  /** True while resolution is in flight. */
  isLoading: boolean;
  /** Non-null when resolution failed (no PlayerProfile, RPC error, stale pointer). */
  error: string | null;
}

/**
 * Resolve the WTB shop owner's Character shared-object ID at a given SSU.
 * Used by WTBView to pass `recipient_character: &Character` into buildWTBFill.
 *
 * Resolution chain (read-only RPC, no state mutation):
 *   1. ownerAddress → PlayerProfile (suix_getOwnedObjects StructType filter)
 *   2. PlayerProfile.character_id → Character (sui_getObject)
 *   3. Sanity-check: Character.character_address === ownerAddress
 *      (guards against stale PlayerProfile after update_address — character.move:234-244)
 *
 * The ssuId param is reserved for future per-SSU character disambiguation and is used
 * only for cache-keying today (EVE Frontier's current model is one character per wallet
 * across all SSUs). Including it now keeps the hook signature stable.
 *
 * Tenant cross-check (Character.tenant() vs SSU.tenant) is skipped in v1 — Move-side
 * E_RECIPIENT_NOT_SHOP_OWNER = 16 is the on-chain backstop. Logged as EFP4-L2.
 *
 * Move-side backstop: even a wrong characterId causes wtb_fill_* to abort with
 * E_RECIPIENT_NOT_SHOP_OWNER = 16. This hook is a defense-in-depth pre-check only.
 *
 * NOTE: uses WORLD_PACKAGE_ID for the PlayerProfile StructType filter — this is the
 * upstream EVE Frontier world package, NOT ORIGINAL_PACKAGE_ID (which applies only
 * to our BazaarCore struct types per Sweep H invariant).
 */
export function useRecipientCharacter(
  ownerAddress: string | null | undefined,
  ssuId:        string | null | undefined,
): UseRecipientCharacterResult {
  const { data, isLoading, error } = useQuery<{ characterId: string } | null, Error>({
    queryKey: ["bazaarcore", "recipient-character", ownerAddress, ssuId],
    enabled:  !!(ownerAddress && ssuId),
    staleTime: 30_000,
    queryFn: async (): Promise<{ characterId: string } | null> => {
      const addr = ownerAddress!;
      const playerProfileType = `${WORLD_PACKAGE_ID}::character::PlayerProfile`;
      const rpcUrl = (import.meta.env.VITE_SUI_RPC_URL as string | undefined)
        ?? "https://api.zan.top/public/sui-testnet";

      async function rpc(method: string, params: unknown[]): Promise<any> {
        const r = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
        const json = await r.json();
        if (json.error) throw new Error(`RPC error: ${json.error.message}`);
        return json.result;
      }

      // Step 1: wallet → PlayerProfile → character_id
      const profileResult = await rpc("suix_getOwnedObjects", [
        addr,
        { filter: { StructType: playerProfileType }, options: { showContent: true } },
        null, 1,
      ]);
      const profiles: any[] = profileResult?.data ?? [];
      if (profiles.length === 0) throw new Error("No EVE Frontier character found for shop owner");

      const charId = profiles[0]?.data?.content?.fields?.character_id as string | undefined;
      if (!charId) throw new Error("PlayerProfile missing character_id");

      // Step 2: character_id → Character → character_address (sanity check)
      const charResult = await rpc("sui_getObject", [charId, { showContent: true }]);
      const charAddress = charResult?.data?.content?.fields?.character_address as string | undefined;
      if (!charAddress) throw new Error("Character object missing character_address");
      if (charAddress.toLowerCase() !== addr.toLowerCase()) {
        throw new Error("Stale PlayerProfile: character_address does not match shop owner");
      }

      return { characterId: charId };
    },
  });

  return {
    characterId: data?.characterId ?? null,
    isLoading,
    error: error ? error.message : null,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
