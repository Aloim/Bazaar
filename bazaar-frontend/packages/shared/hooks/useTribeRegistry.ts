// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// useTribeRegistry.ts
// Reads TribeRegistry shared object via direct Sui fullnode RPC.
// NEVER use dAppKit.getClient() — it routes through stale GraphQL.
// OS-28: rewritten at R6.6.3 — drops all fictitious Bazar1 fields; adds 4 Option<address>
// unwrapped fields (tribeGovId, tribeVaultId, tribeTokenLedgerId, exchangeConfigId).

import { useState, useCallback, useEffect } from "react";
import { TRIBE_REGISTRY_ID } from "@bazaar/shared/constants";
import { unwrapOptionAddress, unwrapOptionString } from "./utils/option";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json() as { result?: unknown; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result;
}

/**
 * C6/GAS-10 (V39): Tribe.ssu_ids is now a Table<address, bool> (was an inline vector).
 * Enumerate the inner Table's dynamic fields (keys = SSU addresses) via paginated RPC.
 */
async function enumerateSsuIds(tableId: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  while (hasNext) {
    const page = await rpc("suix_getDynamicFields", [tableId, cursor, null]) as {
      data?: Array<{ name?: { value?: unknown } }>;
      nextCursor?: string | null;
      hasNextPage?: boolean;
    };
    for (const item of page.data ?? []) {
      const addr = item.name?.value;
      if (typeof addr === "string") out.push(addr);
    }
    cursor = page.nextCursor ?? null;
    hasNext = page.hasNextPage === true;
  }
  return out;
}

/** Full per-tribe state from TribeRegistry — post-OS-28 rewrite. */
export interface TribeInfo {
  idx:                  number;
  name:                 string;
  description:          string;
  leader:               string;
  bazaarType:           number;      // u8: 1=Easy, 2=Advanced
  joinPolicy:           number;      // u8: 0=Open, 1=Application
  isActive:             boolean;
  ssuIds:               string[];    // FA-OS28-NAMING-001: camelCase (on-chain: ssu_ids Table keys)
  ssuCount:             number;      // C6/GAS-10: denormalized ssu_count scalar
  memberCount:          number;
  createdAtMs:          number;      // on-chain field: created_at (ms timestamp)
  governanceMode:       number;      // u8: 0=Authoritarian (v1 only)
  tribeGovId:           string | null; // OS-28 unwrapped Option<address>; null = not bootstrapped
  tribeVaultId:         string | null; // OS-28
  tribeTokenLedgerId:   string | null; // OS-28
  exchangeConfigId:     string | null; // OS-28
  withdrawalBoardId:    string | null; // V15 — WithdrawalBoard shared object for Reserve Vault listings
  mintBurnQueueId:      string | null; // V16 — MintBurnQueue shared object for delayed mint/burn requests
  // V17 — token identity captured at create_advanced_tribe time. Null on Easy tribes.
  tokenName:            string | null;
  tokenSymbol:          string | null;
}

/**
 * TribeRegistryState — post-OS-28: pure tribe-list hook.
 * dappOwner / dappAdmins / dappTaxRateBps / registrationFee REMOVED — those
 * fields do not exist on the on-chain TribeRegistry object. Use useGovernanceConfig()
 * for DApp-level governance data.
 */
export interface TribeRegistryState {
  tribes:   TribeInfo[];
  loading:  boolean;
  refetch:  () => void;
}

/**
 * Parse a single Tribe dynamic-field value object returned by the RPC.
 * All 4 OS-28 Option<address> fields are unwrapped via unwrapOptionAddress.
 */
function parseTribeEntry(idx: number, fields: Record<string, unknown>): TribeInfo {
  // C6/GAS-10: ssu_ids is now a Table<address,bool>; the address list is enumerated
  // asynchronously in fetchRegistry (parseTribeEntry is sync). ssu_count is the
  // denormalized scalar — usable for count-only consumers without enumeration.
  return {
    idx,
    name:               typeof fields.name === "string" ? fields.name : "",
    description:        typeof fields.description === "string" ? fields.description : "",
    leader:             typeof fields.leader === "string" ? fields.leader : "",
    bazaarType:         Number(fields.bazaar_type ?? 0),
    joinPolicy:         Number(fields.join_policy ?? 0),
    isActive:           fields.is_active === true,
    ssuIds:             [],
    ssuCount:           Number(fields.ssu_count ?? 0),
    memberCount:        Number(fields.member_count ?? 0),
    createdAtMs:        Number(fields.created_at ?? 0),
    governanceMode:     Number(fields.governance_mode ?? 0),
    tribeGovId:         unwrapOptionAddress(fields.tribe_gov_id),
    tribeVaultId:       unwrapOptionAddress(fields.tribe_vault_id),
    tribeTokenLedgerId: unwrapOptionAddress(fields.tribe_token_ledger_id),
    exchangeConfigId:   unwrapOptionAddress(fields.exchange_config_id),
    withdrawalBoardId:  unwrapOptionAddress(fields.withdrawal_board_id),
    mintBurnQueueId:    unwrapOptionAddress(fields.mint_burn_queue_id),  // V16
    tokenName:          unwrapOptionString(fields.token_name),  // V17
    tokenSymbol:        unwrapOptionString(fields.token_symbol),// V17
  };
}

export function useTribeRegistry(): TribeRegistryState {
  const [tribes, setTribes] = useState<TribeInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRegistry = useCallback(async () => {
    if (!TRIBE_REGISTRY_ID) return;
    setLoading(true);
    try {
      // Step 1: Fetch top-level TribeRegistry object
      const regResult = await rpc("sui_getObject", [TRIBE_REGISTRY_ID, { showContent: true }]);
      const regData = regResult as { data?: { content?: { fields?: Record<string, unknown> } } };
      const regFields = regData?.data?.content?.fields;
      if (!regFields) {
        console.warn("[useTribeRegistry] No fields on TribeRegistry object");
        return;
      }

      // Step 2: Get the tribes Table object ID
      // TribeRegistry has { tribes: Table<u64, Tribe>, next_id: u64 }
      const tribesField = regFields.tribes as { fields?: { id?: { id?: string } }; id?: { id?: string } } | undefined;
      const tribesTableId: string = tribesField?.fields?.id?.id ?? tribesField?.id?.id ?? "";
      if (!tribesTableId) {
        console.warn("[useTribeRegistry] Could not extract tribes Table object ID");
        return;
      }

      // Step 3: Enumerate dynamic fields (key = u64 tribe idx) — full cursor pagination
      const tribeEntryIds: Array<{ idx: number; objectId: string }> = [];
      let cursor: string | null = null;
      let hasNext = true;
      while (hasNext) {
        const page = await rpc("suix_getDynamicFields", [tribesTableId, cursor, null]);
        const pageData = page as { data?: Array<{ name?: { value?: unknown }; objectId?: string }>; nextCursor?: string | null; hasNextPage?: boolean };
        for (const item of pageData.data ?? []) {
          const tribeIdx = Number(item.name?.value ?? -1);
          if (tribeIdx >= 0 && item.objectId) {
            tribeEntryIds.push({ idx: tribeIdx, objectId: item.objectId });
          }
        }
        cursor = pageData.nextCursor ?? null;
        hasNext = pageData.hasNextPage === true;
      }

      if (tribeEntryIds.length === 0) { setTribes([]); return; }

      // Step 4: Batch-fetch all tribe entry objects
      const objects = await rpc("sui_multiGetObjects", [
        tribeEntryIds.map(e => e.objectId),
        { showContent: true },
      ]) as Array<{ data?: { content?: { fields?: Record<string, unknown> } } }>;

      const parsedWithTable = objects
        .map((obj, i) => {
          const rawFields = obj?.data?.content?.fields;
          if (!rawFields) return null;
          // Tribe is stored as a dynamic field value: Field<u64, Tribe>
          // The actual Tribe fields are in .value.fields or directly in .value
          const valueField = rawFields.value as { fields?: Record<string, unknown> } | Record<string, unknown> | undefined;
          const tribeFields: Record<string, unknown> =
            (valueField as { fields?: Record<string, unknown> })?.fields ?? (valueField as Record<string, unknown>) ?? rawFields;
          const idx = tribeEntryIds[i]?.idx ?? i;
          const info = parseTribeEntry(idx, tribeFields);
          // C6/GAS-10: capture the inner ssu_ids Table id for async enumeration.
          const ssuTableId = (tribeFields.ssu_ids as { fields?: { id?: { id?: string } } } | undefined)
            ?.fields?.id?.id ?? null;
          return { info, ssuTableId };
        })
        .filter((x): x is { info: TribeInfo; ssuTableId: string | null } => x !== null);

      // C6/GAS-10: enumerate each tribe's ssu_ids Table (DF keys = SSU addresses).
      await Promise.all(parsedWithTable.map(async ({ info, ssuTableId }) => {
        if (ssuTableId) info.ssuIds = await enumerateSsuIds(ssuTableId);
      }));

      const parsed = parsedWithTable.map(p => p.info);
      setTribes(parsed.sort((a, b) => a.idx - b.idx));
    } catch (err) {
      console.error("[useTribeRegistry] fetchRegistry failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRegistry(); }, [fetchRegistry]);

  return { tribes, loading, refetch: fetchRegistry };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
