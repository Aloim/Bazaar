// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Member-registry reader. A MemberRegistry (bazaar_core::membership) holds
 * `members: Table<address, MemberEntry>` where MemberEntry =
 * { player, ssu_role, tribe_role, is_banned, registered_at_ms }.
 * There is ONE MemberRegistry per SSU; "tribe members" = the union across the
 * tribe's SSUs (built in tribes.ts from the per-SSU rows, deduped).
 */

import { getObjectFields, tableId, walkStructTable } from "./readers";
import type { MemberRow } from "./types";

/** Read every member row from one MemberRegistry object. */
export async function readMemberRows(memberRegistryId: string | null): Promise<MemberRow[]> {
  if (!memberRegistryId) return [];
  const fields = await getObjectFields(memberRegistryId);
  if (!fields) return [];
  const membersTableId = tableId(fields.members);
  const rows = await walkStructTable(membersTableId);
  return rows.map(({ key, value }) => ({
    address: String(value.player ?? key),
    ssuRole: Number(value.ssu_role ?? 0),
    tribeRole: Number(value.tribe_role ?? 0),
    isBanned: value.is_banned === true,
  }));
}

/** Dedupe a flat list of member rows by address, keeping the max ssu/tribe role. */
export function dedupeMembers(rows: MemberRow[]): MemberRow[] {
  const byAddr = new Map<string, MemberRow>();
  for (const r of rows) {
    const existing = byAddr.get(r.address);
    if (!existing) {
      byAddr.set(r.address, { ...r });
    } else {
      existing.ssuRole = Math.max(existing.ssuRole, r.ssuRole);
      existing.tribeRole = Math.max(existing.tribeRole, r.tribeRole);
      existing.isBanned = existing.isBanned || r.isBanned;
    }
  }
  return Array.from(byAddr.values()).sort(
    (a, b) => b.ssuRole - a.ssuRole || a.address.localeCompare(b.address),
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
