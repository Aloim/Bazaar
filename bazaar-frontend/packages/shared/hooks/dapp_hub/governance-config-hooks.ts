// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * governance-config-hooks.ts — R6.6.3 OS-28 DappHub governance config hooks.
 *
 * Extracted from packages/shared/hooks/index.ts (lines 274-319):
 * - useDAppTaxConfig (Phase 5: per-type rates; dead registration-fee placeholders removed)
 * - useDAppOwner
 * - useGovernanceConfig (Phase 5: custom override Table walks removed — AUD-DH-01 retire)
 *
 * File limit: 500 lines | Constitution Article XII.3
 */

import { useQuery } from "@tanstack/react-query";
import { SHARED_OBJECTS } from "../../constants";
import { suiClient } from "../sui-client";
import type { DAppTaxConfig } from "../../types";

// ── Helper ────────────────────────────────────────────────────────────────────

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

/**
 * Parse a Move Option<u64> RPC field into number | null.
 * On-chain Option<u64> serialises over RPC showContent as:
 *   Some(v) → { fields: { vec: ["<v>"] } }  (vec with one string element)
 *   None    → { fields: { vec: [] } }       (empty vec)  OR null / undefined (absent field)
 * We handle all three shapes defensively.
 */
function parseOptionU64(raw: unknown): number | null {
  if (raw == null) return null;
  const obj = raw as { fields?: { vec?: unknown[] } };
  const vec = obj?.fields?.vec;
  if (!Array.isArray(vec) || vec.length === 0) return null;
  const val = Number(vec[0]);
  return Number.isFinite(val) ? val : null;
}

// ── useDAppTaxConfig ──────────────────────────────────────────────────────────

/** Fetch the current DApp tax configuration from GovernanceConfig.
 *
 *  Per-type fields (Phase 5 / V36): null = not set → callers fall back to globalTaxBps.
 *  Safe to read on V35 — absent fields return null via parseOptionU64's defensive parse,
 *  and callers use `?? globalTaxBps` to get the V35 global value. No on-chain write occurs.
 */
export function useDAppTaxConfig() {
  return useQuery<DAppTaxConfig>({
    queryKey: ["dapp-tax-config"],
    queryFn: async (): Promise<DAppTaxConfig> => {
      const fields = await getObjectFields(SHARED_OBJECTS.GOVERNANCE_CONFIG);
      return {
        globalTaxBps:            Number(fields.global_dapp_tax_bps ?? 0),
        notribeDappBps:          parseOptionU64(fields.notribe_dapp_tax_bps),
        easyDappBps:             parseOptionU64(fields.easy_dapp_tax_bps),
        advancedExchangeDappBps: parseOptionU64(fields.advanced_exchange_dapp_tax_bps),
      };
    },
    staleTime: 60_000,
  });
}

// ── useDAppFees (V31 registration/creation fees) ──────────────────────────────

/** The configurable fees, raw MIST EVE. 0 = that flow is free. */
export interface DAppFees {
  ssuRegistrationFee:       number;
  tribeJoinFee:             number;
  easyTribeCreationFee:     number;
  advancedTribeCreationFee: number;
  /** Slice 3: per-hour Mission (MIS) listing fee, dApp layer (NoTribe + Easy only). */
  missionListingFeePerHour: number;
}

/**
 * Fetch the four registration/creation fees from GovernanceConfig.
 * Pre-V31 the fields don't exist on-chain → all default to 0 (free), so this is
 * safe to render on the current deployment; real values appear after the V31
 * fresh publish + admin set_registration_fees.
 */
export function useDAppFees() {
  return useQuery<DAppFees>({
    queryKey: ["dapp-fees"],
    queryFn: async (): Promise<DAppFees> => {
      const fields = await getObjectFields(SHARED_OBJECTS.GOVERNANCE_CONFIG);
      return {
        ssuRegistrationFee:       Number(fields.ssu_registration_fee ?? 0),
        tribeJoinFee:             Number(fields.tribe_join_fee ?? 0),
        easyTribeCreationFee:     Number(fields.easy_tribe_creation_fee ?? 0),
        advancedTribeCreationFee: Number(fields.advanced_tribe_creation_fee ?? 0),
        missionListingFeePerHour: Number(fields.mission_listing_fee_per_hour ?? 0),
      };
    },
    staleTime: 60_000,
  });
}

// ── useMultiplayerRelayUrl (V32 — one global shared relay URL) ────────────────

/**
 * Fetch the single global multiplayer relay URL from GovernanceConfig.
 * This is the shared standard endpoint every player's client connects to —
 * set once by the DApp owner. Pre-V32 the field doesn't exist on-chain → "" ,
 * in which case the client falls back to localStorage["multiplayerServerUrl"].
 */
export function useMultiplayerRelayUrl() {
  return useQuery<string>({
    queryKey: ["multiplayer-relay-url"],
    queryFn: async (): Promise<string> => {
      const fields = await getObjectFields(SHARED_OBJECTS.GOVERNANCE_CONFIG);
      return typeof fields.multiplayer_relay_url === "string" ? fields.multiplayer_relay_url : "";
    },
    staleTime: 60_000,
  });
}

// ── useDAppOwner (extracted verbatim from index.ts:290-302) ──────────────────

/** Fetch the DApp owner address and check if current wallet matches. */
export function useDAppOwner(walletAddress: string | null) {
  return useQuery<{ address: string; isCurrent: boolean }>({
    queryKey: ["dapp-owner", walletAddress],
    queryFn: async () => {
      // DAppOwnerCap is a capability object owned by the owner wallet.
      // We cannot read the owner address from GovernanceConfig — it has no owner field.
      // App.tsx checks ownership by querying owned objects for the cap type.
      // This hook returns empty; real ownership check is in App.tsx useDAppOwnerCap.
      return { address: "", isCurrent: false };
    },
    staleTime: 120_000,
  });
}

// ── GovernanceConfigExtended (OS-28 extension, Phase 5 cleaned) ──────────────

/**
 * Extended GovernanceConfig shape — OS-28 addition.
 *
 * Phase 5 (AUD-DH-01 retire): customTribeOverrides + customSsuOverrides removed.
 * The eager Table-walk prefetch for these fields has been deleted — the override
 * tables do not exist in V36 and were confirmed dead on V35 (zero levy-site reads).
 *
 * dappOwnerAddress: kept for API compat — actual fetch via cap-walker is out-of-scope.
 */
export interface GovernanceConfigExtended {
  version:          number;
  globalTaxBps:     number;
  dappOwnerAddress: string;
}

// ── useGovernanceConfig (extended — queryKey "governance-config-v2") ──────────

/**
 * Fetch the governance config (version + global rate).
 * Phase 5: custom override Table prefetch removed (AUD-DH-01 retire).
 * staleTime: 60_000 ms (matches prior hook).
 */
export function useGovernanceConfig() {
  return useQuery<GovernanceConfigExtended>({
    queryKey: ["governance-config-v2"],
    queryFn: async (): Promise<GovernanceConfigExtended> => {
      const fields = await getObjectFields(SHARED_OBJECTS.GOVERNANCE_CONFIG);
      const version      = Number(fields.version ?? 0);
      const globalTaxBps = Number(fields.global_dapp_tax_bps ?? 0);
      return {
        version,
        globalTaxBps,
        dappOwnerAddress: "",
      };
    },
    staleTime: 60_000,
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
