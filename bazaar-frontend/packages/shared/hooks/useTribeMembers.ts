// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useTribeMembers — tribe-wide member aggregation.
 *
 * There is NO tribe-wide member object on-chain. "Users in a tribe" is the UNION
 * of the per-SSU MemberRegistry entries across every SSU registered to the tribe
 * (membership.move:26-41 — MemberRegistry is per-SSU). This hook builds that union
 * and DEDUPES by address: a player who is a member of two of the tribe's SSUs is
 * returned as ONE entry, carrying every membership plus the max TRIBE role.
 *
 * TRIBE ROLE vs SSU ROLE (2026-06-23 fix). Each MemberEntry carries BOTH an
 * `ssu_role` and a `tribe_role` (membership.move:35-41). The two are independent:
 *   - `ssu_role` is SSU-governance-INTERNAL. Every SSU owner is seeded ssu_role=7
 *     (Owner) in THEIR OWN SSU's registry at bootstrap (membership::seed_owner_entry).
 *     It is managed in **SSU Governance → Users & Roles** and must NOT leak into the
 *     tribe roster — otherwise every SSU owner who joins the tribe shows as a second
 *     "Owner", which looks like a takeover but is not (verified on-chain 2026-06-23).
 *   - `tribe_role` is the tribe-scoped role (set via membership::set_tribe_role,
 *     TribeLeaderCap-gated). This is what the tribe roster shows. Anyone registered
 *     into a tribe SSU is at least a tribe **Member**; elevated tribe roles are
 *     explicit grants. The single tribe **Leader** (dapp_hub Tribe.leader) is its
 *     authority holder and is surfaced separately.
 *
 * Resolution:
 *   1. dapp_hub Tribe.ssu_ids + Tribe.leader (via useTribeRegistry). (The bazaar_core
 *      TribeGovernance.ssu_ids vector is dead/never-written — see useTribeSSUTradeStats.)
 *   2. ONE queryEvents(SSUGovernanceCreated) → map ssu_id → member_registry_id.
 *   3. For each member registry: read the members Table dynamic fields → MemberEntry
 *      { ssu_role, tribe_role, is_banned } per address.
 *   4. Aggregate + dedupe by address; carry max tribe_role; flag the tribe leader.
 *
 * Powers the Tribe Governance → Admin → Users & Roles tab. Role changes apply via
 * membership::set_tribe_role (leader-only) — see buildSetTribeRolesBatch.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { suiClient } from "./sui-client";
import { useTribeRegistry } from "./useTribeRegistry";
import { ORIGINAL_PACKAGE_ID } from "@bazaar/shared/constants";

export interface TribeMembership {
  ssuId:            string;
  memberRegistryId: string;
  /** ssu_role 0..7 (Stranger..Owner) — SSU-INTERNAL; not shown in the tribe roster. */
  ssuRole:          number;
  /** tribe_role 0..7 — the tribe-scoped role shown in the roster. */
  tribeRole:        number;
  banned:           boolean;
}

export interface TribeMemberEntry {
  address:     string;
  /** Highest tribe_role this address holds across the tribe's SSUs (NOT ssu_role). */
  tribeRole:   number;
  /** True iff this address is the dapp_hub Tribe.leader (TribeLeaderCap holder). */
  isLeader:    boolean;
  /** Banned in any of the tribe's SSUs. */
  banned:      boolean;
  memberships: TribeMembership[];
}

export interface TribeMembersResult {
  members:   TribeMemberEntry[];
  /** Number of tribe SSUs whose member registry resolved + was scanned. */
  ssuCount:  number;
  isLoading: boolean;
  refetch:   () => void;
}

type AnyFields = { fields?: Record<string, unknown> } | undefined;

/** Map every SSU id → its MemberRegistry id via one SSUGovernanceCreated query. */
async function resolveMemberRegistryMap(): Promise<Map<string, string>> {
  const eventType = `${ORIGINAL_PACKAGE_ID}::ssu_governance::SSUGovernanceCreated`;
  const events = await suiClient.queryEvents({
    query: { MoveEventType: eventType },
    limit: 1000,
  });
  if (events.data.length === 1000) {
    console.warn(
      "[useTribeMembers] SSUGovernanceCreated queryEvents hit the 1000 cap — " +
      "some SSUs may not resolve a member registry (cursor pagination not implemented).",
    );
  }
  const map = new Map<string, string>();
  for (const e of events.data) {
    const p = e.parsedJson as { ssu_id?: string; member_registry_id?: string } | null;
    if (p?.ssu_id && p.member_registry_id) {
      // First-bootstrap-wins (ascending order): don't overwrite an earlier mapping.
      const key = p.ssu_id.toLowerCase();
      if (!map.has(key)) map.set(key, p.member_registry_id);
    }
  }
  return map;
}

/** Read all { address, ssu_role, tribe_role, is_banned } rows from one MemberRegistry. */
async function readRegistryMembers(
  memberRegistryId: string,
): Promise<Array<{ address: string; ssuRole: number; tribeRole: number; banned: boolean }>> {
  const reg = await suiClient.getObject({ id: memberRegistryId, options: { showContent: true } });
  const fields = (reg.data?.content as AnyFields)?.fields;
  const tableId = (fields?.members as { fields?: { id?: { id?: string } } } | undefined)?.fields?.id?.id;
  if (!tableId) return [];

  // Enumerate the members Table dynamic fields (paginated).
  const names: Array<{ name: unknown; addr: string }> = [];
  let cursor: string | null = null;
  do {
    const page = await suiClient.getDynamicFields({ parentId: tableId, cursor });
    for (const d of page.data) {
      names.push({ name: d.name, addr: String((d.name as { value?: unknown })?.value ?? "") });
    }
    cursor = page.hasNextPage ? (page.nextCursor ?? null) : null;
  } while (cursor);

  const rows = await Promise.all(names.map(async ({ name, addr }) => {
    try {
      const obj = await suiClient.getDynamicFieldObject({
        parentId: tableId,
        name: name as { type: string; value: unknown },
      });
      const entry = (obj.data?.content as { fields?: { value?: { fields?: Record<string, unknown> } } } | undefined)
        ?.fields?.value?.fields;
      const ssuRole = Number(entry?.ssu_role ?? 0);
      const tribeRole = Number(entry?.tribe_role ?? 0);
      const banned = entry?.is_banned === true;
      const player = String(entry?.player ?? addr);
      return { address: player || addr, ssuRole, tribeRole, banned };
    } catch {
      return { address: addr, ssuRole: 0, tribeRole: 0, banned: false };
    }
  }));
  return rows.filter(r => !!r.address);
}

export function useTribeMembers(tribeIdx: number | null): TribeMembersResult {
  const { tribes } = useTribeRegistry();
  const tribe = useMemo(
    () => (tribeIdx !== null ? tribes.find(t => t.idx === tribeIdx) : undefined),
    [tribes, tribeIdx],
  );
  const ssuIds = tribe?.ssuIds ?? [];
  const leader = (tribe?.leader ?? "").toLowerCase();
  const ssuKey = ssuIds.slice().sort().join(",");

  const query = useQuery<{ members: TribeMemberEntry[]; ssuCount: number }>({
    queryKey: ["tribe-members", tribeIdx, ssuKey, leader],
    enabled: tribeIdx !== null && ssuIds.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const regMap = await resolveMemberRegistryMap();

      const byAddr = new Map<string, TribeMemberEntry>();
      let scanned = 0;

      await Promise.all(ssuIds.map(async (ssuId) => {
        const memberRegistryId = regMap.get(ssuId.toLowerCase());
        if (!memberRegistryId) return;
        scanned += 1;
        const rows = await readRegistryMembers(memberRegistryId);
        for (const r of rows) {
          const existing = byAddr.get(r.address);
          const membership: TribeMembership = {
            ssuId, memberRegistryId, ssuRole: r.ssuRole, tribeRole: r.tribeRole, banned: r.banned,
          };
          if (!existing) {
            byAddr.set(r.address, {
              address: r.address,
              tribeRole: r.tribeRole,
              isLeader: r.address.toLowerCase() === leader,
              banned: r.banned,
              memberships: [membership],
            });
          } else {
            existing.memberships.push(membership);
            if (r.tribeRole > existing.tribeRole) existing.tribeRole = r.tribeRole;
            if (r.banned) existing.banned = true;
          }
        }
      }));

      // Leader-first, then by tribe role (highest first), then address.
      const members = Array.from(byAddr.values()).sort(
        (a, b) =>
          Number(b.isLeader) - Number(a.isLeader) ||
          b.tribeRole - a.tribeRole ||
          a.address.localeCompare(b.address),
      );
      return { members, ssuCount: scanned };
    },
  });

  return {
    members:   query.data?.members ?? [],
    ssuCount:  query.data?.ssuCount ?? 0,
    isLoading: query.isLoading,
    refetch:   () => { query.refetch(); },
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
