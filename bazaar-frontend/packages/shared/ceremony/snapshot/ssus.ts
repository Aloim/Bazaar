// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Per-SSU snapshot walker.
 *
 * 1. Walk dapp_hub SSURegistry.registrations → every { ssu_id, owner, bazaar_type,
 *    tribe_id, is_active }.
 * 2. ONE SSUGovernanceCreated query → map ssu_id → { txDigest, board ids }.
 * 3. Per SSU: resolve the SSUGovernance object id (tx objectChanges), read its EVE
 *    tax wallet / bans / configs / godot url; read the WtbEscrowPool ("deposit")
 *    balance; read members; read announcements ("news") + guestbook.
 */

import { SHARED_OBJECTS, ORIGINAL_PACKAGE_ID } from "../../constants";
import {
  getObjectFields, tableId, walkStructTable, walkAddressU64Table,
  balanceMist, unwrapOption, queryAllEvents, findCreatedObjectId,
} from "./readers";
import { readMemberRows } from "./members";
import { readAnnouncements, readGuestbook } from "./social";
import type { SsuSnapshot } from "./types";

const SSU_GOV_SUFFIX = "ssu_governance::SSUGovernance";

interface RegRow {
  ssuId: string; owner: string; bazaarType: number; tribeId: number; isActive: boolean;
}

/** Walk SSURegistry.registrations. */
async function readRegistrations(): Promise<RegRow[]> {
  const fields = await getObjectFields(SHARED_OBJECTS.SSU_REGISTRY);
  if (!fields) return [];
  const rows = await walkStructTable(tableId(fields.registrations));
  return rows.map(({ key, value }) => ({
    ssuId: String(value.ssu_id ?? key),
    owner: String(value.owner ?? ""),
    bazaarType: Number(value.bazaar_type ?? 0),
    tribeId: Number(value.tribe_id ?? 0),
    isActive: value.is_active === true,
  }));
}

/** Map ssu_id (lowercased) → { txDigest, board ids } from SSUGovernanceCreated. */
async function readGovEventMap(): Promise<Map<string, { txDigest: string; parsed: Record<string, unknown> }>> {
  const events = await queryAllEvents(`${ORIGINAL_PACKAGE_ID}::ssu_governance::SSUGovernanceCreated`);
  const map = new Map<string, { txDigest: string; parsed: Record<string, unknown> }>();
  for (const e of events) {
    const ssuId = String(e.parsedJson.ssu_id ?? "").toLowerCase();
    if (ssuId && !map.has(ssuId)) map.set(ssuId, { txDigest: e.txDigest, parsed: e.parsedJson });
  }
  return map;
}

async function buildOne(
  reg: RegRow,
  ev: { txDigest: string; parsed: Record<string, unknown> } | undefined,
  warnings: string[],
): Promise<SsuSnapshot> {
  const parsed = ev?.parsed ?? {};
  const announcementBoardId = (parsed.announcement_board_id as string) ?? null;
  const guestbookBoardId = (parsed.guestbook_board_id as string) ?? null;
  const memberRegistryId = (parsed.member_registry_id as string) ?? null;

  let ssuGovId: string | null = null;
  if (ev?.txDigest) {
    try { ssuGovId = await findCreatedObjectId(ev.txDigest, SSU_GOV_SUFFIX); } catch { /* warn below */ }
  }
  if (!ssuGovId) warnings.push(`SSU ${reg.ssuId}: SSUGovernance not resolved (un-bootstrapped or event beyond page) — EVE/bans/config not captured`);

  const gov = ssuGovId ? await getObjectFields(ssuGovId) : null;
  const taxConfig = (gov?.tax_config as { fields?: Record<string, unknown> } | undefined)?.fields;

  // WtbEscrowPool "deposit" balance (total_escrowed u64).
  const wtbEscrowPoolId = (gov?.wtb_escrow_pool_id as string) ?? (parsed.wtb_escrow_pool_id as string) ?? null;
  let wtbEscrowPoolEveMist = "0";
  if (wtbEscrowPoolId) {
    const poolFields = await getObjectFields(wtbEscrowPoolId);
    wtbEscrowPoolEveMist = String(poolFields?.total_escrowed ?? "0");
  }

  const [members, announcements, guestbook, localBanList, roleTaxRows, shopLimits] = await Promise.all([
    readMemberRows(memberRegistryId),
    readAnnouncements(announcementBoardId),
    readGuestbook(guestbookBoardId),
    walkAddressU64Table(tableId(gov?.local_ban_list)),
    walkStructTable(tableId(taxConfig?.role_taxes)),
    walkAddressU64Table(tableId(gov?.shop_limits_by_role)),
  ]);

  const roleTaxTable: Record<string, unknown> = {};
  for (const { key, value } of roleTaxRows) roleTaxTable[key] = value;

  return {
    ssuId: reg.ssuId,
    ownerAddress: reg.owner,
    bazaarType: reg.bazaarType,
    tribeId: reg.tribeId,
    ssuGovId,
    godotUrl: unwrapOption(gov?.godot_url),
    isActive: reg.isActive,
    frozen: gov?.frozen === true,
    taxWalletEveMist: balanceMist(gov?.tax_wallet),
    wtbEscrowPoolId,
    wtbEscrowPoolEveMist,
    roleTaxTable,
    shopLimitsByRole: shopLimits,
    localBanList,
    members,
    announcementBoardId,
    announcements,
    guestbookBoardId,
    guestbook,
  };
}

/** Build SsuSnapshot[] for every registered SSU. */
export async function readSsuSnapshots(warnings: string[]): Promise<SsuSnapshot[]> {
  const [regs, evMap] = await Promise.all([readRegistrations(), readGovEventMap()]);
  return Promise.all(regs.map((reg) => buildOne(reg, evMap.get(reg.ssuId.toLowerCase()), warnings)));
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
