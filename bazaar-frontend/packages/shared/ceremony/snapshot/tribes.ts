// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Per-tribe snapshot walker.
 *
 * Walks dapp_hub TribeRegistry.tribes (Table<u64, Tribe>); per tribe reads the
 * TribeGovernance EVE tax wallet + tribe-wide bans, and (Advanced) the
 * TribeTokenLedger per-user balances, TribeVault EVE ("ExchangePool Wallet"), and
 * ExchangeConfig reserve. The tribe member roster is the deduped union of the
 * member rows already collected per-SSU (no extra RPC).
 */

import { TRIBE_REGISTRY_ID } from "../../constants";
import {
  getObjectFields, tableId, walkStructTable, walkAddressU64Table,
  balanceMist, unwrapOption,
} from "./readers";
import { dedupeMembers } from "./members";
import type { SsuSnapshot, TribeSnapshot } from "./types";

/** Read all tribes (Table<u64, Tribe>) into { idx, fields } rows. */
async function readTribeRows(): Promise<Array<{ idx: number; f: Record<string, unknown> }>> {
  const reg = await getObjectFields(TRIBE_REGISTRY_ID);
  if (!reg) return [];
  const rows = await walkStructTable(tableId(reg.tribes));
  return rows
    .map(({ key, value }) => ({ idx: Number(key), f: value }))
    .sort((a, b) => a.idx - b.idx);
}

async function buildOne(
  idx: number,
  f: Record<string, unknown>,
  ssus: SsuSnapshot[],
): Promise<TribeSnapshot> {
  const bazaarType = Number(f.bazaar_type ?? 0);
  const tribeGovId = unwrapOption(f.tribe_gov_id);
  const tribeVaultId = unwrapOption(f.tribe_vault_id);
  const tokenLedgerId = unwrapOption(f.tribe_token_ledger_id);
  const exchangeConfigId = unwrapOption(f.exchange_config_id);

  const gov = tribeGovId ? await getObjectFields(tribeGovId) : null;
  const globalBans = await walkAddressU64Table(tableId(gov?.global_bans));

  let tokenName: string | null = null, tokenSymbol: string | null = null;
  let tokenDecimals = 0, tokenSupplyCap = "0", tokenTotalSupply = "0";
  let tokenBalances: Record<string, string> = {};
  let tribeVaultEveMist = "0", exchangeReserveMist = "0";

  if (bazaarType === 2) {
    if (tokenLedgerId) {
      const led = await getObjectFields(tokenLedgerId);
      tokenName = String(led?.token_name ?? "");
      tokenSymbol = String(led?.token_symbol ?? "");
      tokenDecimals = Number(led?.decimals ?? 0);
      tokenSupplyCap = String(led?.supply_cap ?? "0");
      tokenTotalSupply = String(led?.total_supply ?? "0");
      tokenBalances = await walkAddressU64Table(tableId(led?.balances));
    }
    if (tribeVaultId) {
      const v = await getObjectFields(tribeVaultId);
      tribeVaultEveMist = balanceMist(v?.eve_balance);
    }
    if (exchangeConfigId) {
      const x = await getObjectFields(exchangeConfigId);
      exchangeReserveMist = String(x?.reserve_mist ?? "0");
    }
  }

  const rawSsuIds = Array.isArray(f.ssu_ids)
    ? (f.ssu_ids as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const members = dedupeMembers(ssus.filter((s) => s.tribeId === idx).flatMap((s) => s.members));

  return {
    tribeId: idx,
    name: String(f.name ?? ""),
    bazaarType,
    leaderAddress: String(f.leader ?? ""),
    isActive: f.is_active === true,
    ssuIds: rawSsuIds,
    tribeGovId,
    tribeGovTaxWalletEveMist: balanceMist(gov?.tax_wallet),
    globalBans,
    members,
    tokenLedgerId,
    tokenName,
    tokenSymbol,
    tokenDecimals,
    tokenSupplyCap,
    tokenTotalSupply,
    tokenBalances,
    tribeVaultId,
    tribeVaultEveMist,
    exchangeConfigId,
    exchangeReserveMist,
  };
}

/** Build TribeSnapshot[] for every tribe (member roster sourced from `ssus`). */
export async function readTribeSnapshots(
  ssus: SsuSnapshot[],
  _warnings: string[],
): Promise<TribeSnapshot[]> {
  const rows = await readTribeRows();
  return Promise.all(rows.map(({ idx, f }) => buildOne(idx, f, ssus)));
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
