// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Tribe Governance → Admin → Users & Roles (TRIBE-ROLE rewrite, 2026-06-23).
//
// Lists every user across ALL the tribe's SSUs, DEDUPED (a player in two of the
// tribe's SSUs appears as one row), grouped by TRIBE role. It does NOT show the
// SSU `ssu_role` — every SSU owner is Owner of their own SSU registry (seeded at
// bootstrap), and showing that here made each SSU owner look like a second tribe
// "Owner" (a false alarm, verified on-chain 2026-06-23). The SSU Owner role is
// managed in SSU Governance → Users & Roles.
//
// Roster model: anyone registered into a tribe SSU is at least a tribe Member; the
// single Leader (dapp_hub Tribe.leader) is shown on top; Moderator/Admin/SuperAdmin
// are explicit grants. The only action is changing a user's tribe role via
// membership::set_tribe_role — LEADER-ONLY (TribeLeaderCap-gated). Bans live in the
// Moderation tab.

import { useMemo } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useTribeMembers } from "@bazaar/shared/hooks/useTribeMembers";
import { useCharacterNames } from "@bazaar/shared/hooks";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { buildSetTribeRolesBatch } from "@bazaar/shared/tx/bazaarcore/membership-tx";
import { UserRoleSection } from "./UserRoleSection";
import type { TribeManageUsersTabProps, TribeRoleSectionView } from "./manage-users-types";

// Tribe-role buckets, highest first. A user lands in the FIRST bucket whose
// predicate matches (Leader wins; everyone else floors to Member). Tribe-role
// assignment is capped at SuperAdmin (6) — Owner (7) is an SSU-internal role and
// is never a tribe role.
type Bucket = {
  key: string;
  label: string;     // plural header
  rowLabel: string;  // singular per-row label
  role: number;      // <select> default for this bucket
  editable: boolean;
  match: (e: { isLeader: boolean; tribeRole: number }) => boolean;
};
const BUCKETS: Bucket[] = [
  { key: "leader", label: "Tribe Leader", rowLabel: "Leader",     role: 7, editable: false, match: e => e.isLeader },
  { key: "super",  label: "SuperAdmins",  rowLabel: "SuperAdmin", role: 6, editable: true,  match: e => !e.isLeader && e.tribeRole === 6 },
  { key: "admin",  label: "Admins",       rowLabel: "Admin",      role: 5, editable: true,  match: e => !e.isLeader && e.tribeRole === 5 },
  { key: "mod",    label: "Moderators",   rowLabel: "Moderator",  role: 4, editable: true,  match: e => !e.isLeader && e.tribeRole === 4 },
  { key: "member", label: "Members",      rowLabel: "Member",     role: 2, editable: true,  match: e => !e.isLeader && e.tribeRole <= 3 },
];

// Tribe roles the leader may assign (Member..SuperAdmin). Owner (7) excluded by
// design; Stranger (0) is not settable via set_tribe_role.
const ASSIGNABLE_TRIBE_ROLES = [2, 4, 5, 6];

export default function ManageUsersTab({ tribeIdx, connectedAddress }: TribeManageUsersTabProps) {
  const { members, ssuCount, isLoading, refetch } = useTribeMembers(tribeIdx);
  const { leaderCapId, leaderTribeIdx } = useTribeCaps();
  const { tribes } = useTribeRegistry();

  const tribe = useMemo(
    () => (tribeIdx !== null ? tribes.find(t => t.idx === tribeIdx) : undefined),
    [tribes, tribeIdx],
  );
  const tribeGovId = tribe?.tribeGovId ?? null;

  // Tribe-role changes are TribeLeaderCap-gated on-chain (set_tribe_role). The
  // connected wallet can manage only if it holds THIS tribe's leader cap and we can
  // resolve the TribeGovernance object the entry needs.
  const canManage =
    !!leaderCapId && leaderTribeIdx === tribeIdx && tribeIdx !== null && !!tribeGovId;

  const allAddresses = useMemo(() => members.map(m => m.address), [members]);
  const characterNames = useCharacterNames(allAddresses);

  // Place each member in the first matching bucket.
  const sections = useMemo<TribeRoleSectionView[]>(
    () => BUCKETS.map(b => ({
      key: b.key,
      label: b.label,
      rowLabel: b.rowLabel,
      role: b.role,
      editable: b.editable,
      entries: members
        .filter(m => BUCKETS.find(x => x.match(m))?.key === b.key)
        .map(m => ({ address: m.address })),
    })),
    [members],
  );

  function assignableRolesForTarget(target: string): number[] {
    if (!canManage) return [];
    const entry = members.find(m => m.address === target);
    if (!entry || entry.isLeader) return [];        // leadership isn't a set_tribe_role grant
    if (target.toLowerCase() === connectedAddress?.toLowerCase()) return [];
    return ASSIGNABLE_TRIBE_ROLES;
  }

  async function setRole(target: string, newRole: number) {
    const entry = members.find(m => m.address === target);
    if (!entry || !canManage || !leaderCapId || !tribeGovId) return;
    // Apply to every MemberRegistry this user belongs to in the tribe (all share
    // the same TribeLeaderCap + TribeGovernance).
    const updates = entry.memberships.map(ms => ({
      memberRegistryId: ms.memberRegistryId,
      player: target,
      role: newRole,
    }));
    if (updates.length === 0) return;
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildSetTribeRolesBatch({ leaderCapId, tribeGovernanceId: tribeGovId, updates }),
      });
      setTimeout(() => refetch(), 1500);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Tribe role change failed.");
    }
  }

  // ── Empty / loading states ────────────────────────────────────────────────
  if (tribeIdx === null) {
    return (
      <div className="panel__section">
        <p className="muted">
          No tribe detected for the connected wallet. This tab lists members across
          all of your tribe&apos;s SSUs once you hold a tribe cap — per-SSU members
          (and the SSU Owner role) are managed in <strong>SSU Governance → Users &amp; Roles</strong>.
        </p>
      </div>
    );
  }
  if (isLoading && members.length === 0) {
    return <div className="panel__section"><p className="muted">Loading tribe members across all SSUs…</p></div>;
  }
  if (members.length === 0) {
    return (
      <div className="panel__section">
        <p className="muted">
          No members found across this tribe&apos;s SSUs yet. Users appear here once
          they register at any of the tribe&apos;s SSUs.
        </p>
      </div>
    );
  }

  return (
    <div className="panel__section manage-users">
      <p className="muted" style={{ fontSize: "0.78rem", marginTop: 0 }}>
        All users across this tribe&apos;s {ssuCount} SSU{ssuCount === 1 ? "" : "s"}, deduped, by
        tribe role. Everyone who registers an SSU into the tribe is a <strong>Member</strong>;
        the SSU Owner role is separate and lives in <strong>SSU Governance → Users &amp; Roles</strong>.
        {canManage
          ? " As tribe leader you can change tribe roles below — bans live in the Moderation tab."
          : " Only the tribe leader can change tribe roles."}
      </p>
      {sections.map(section => (
        <UserRoleSection
          key={section.key}
          section={section}
          characterNames={characterNames}
          connectedAddress={connectedAddress}
          assignableRolesForTarget={assignableRolesForTarget}
          onSetRole={setRole}
        />
      ))}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
