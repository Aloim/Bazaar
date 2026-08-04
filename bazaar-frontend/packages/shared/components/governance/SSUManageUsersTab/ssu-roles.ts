// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// SSU Users & Roles — shared types + role helpers.
//
// V30 redesign: the Users & Roles list is sourced from the per-SSU MemberRegistry
// (ssu_role per address, via useSSURoleList) — NOT from the SSUGovernance staff
// tables, which never existed on the struct. Authority for role changes is the
// CALLER's own ssu_role (membership::set_ssu_role_gated), so SuperAdmins and
// Admins can manage users, not just the Owner.

export interface SSUManageUsersTabProps {
  ssuId: string;
  ssuOwner: string;
  ssuAdmins: string[];
  ssuSuperAdmins: string[];
  ssuMods: string[];
  localUsers: string[];
  localBanList: Map<string, number>;
  hasSSUOwnerCap: boolean;
  hasSSUSuperAdminCap: boolean;
  hasSSUAdminCap: boolean;
  hasSSUModCap: boolean;
  ssuOwnerCapId: string | null;
  ssuSuperAdminCapId: string | null;
  ssuAdminCapId: string | null;
  ssuModCapId: string | null;
  connectedAddress?: string;
  onRefetch: () => void;
}

export type SSUCapType = "owner" | "super_admin" | "admin" | "mod";

export interface CapInfo {
  capId: string;
  capType: SSUCapType;
}

export interface SSUSectionEntry {
  address: string;
  sectionLabel: string;
}

export type SectionId =
  | "owner"
  | "superadmin"
  | "admin"
  | "mod"
  | "friendly"
  | "member"
  | "unfriendly"
  | "stranger"
  | "banned";

export interface SSURoleSection {
  id: SectionId;
  label: string;
  entries: SSUSectionEntry[];
}

export const BAN_DURATIONS = [
  { label: "1 Day",   ms: 86_400_000 },
  { label: "1 Week",  ms: 604_800_000 },
  { label: "Permanent", ms: 0 },
];

export function resolveCapInfo(
  hasSSUOwnerCap: boolean, ssuOwnerCapId: string | null,
  hasSSUSuperAdminCap: boolean, ssuSuperAdminCapId: string | null,
  hasSSUAdminCap: boolean, ssuAdminCapId: string | null,
  hasSSUModCap: boolean, ssuModCapId: string | null,
): CapInfo | null {
  if (hasSSUOwnerCap && ssuOwnerCapId) return { capId: ssuOwnerCapId, capType: "owner" };
  if (hasSSUSuperAdminCap && ssuSuperAdminCapId) return { capId: ssuSuperAdminCapId, capType: "super_admin" };
  if (hasSSUAdminCap && ssuAdminCapId) return { capId: ssuAdminCapId, capType: "admin" };
  if (hasSSUModCap && ssuModCapId) return { capId: ssuModCapId, capType: "mod" };
  return null;
}

// ── V30 per-role section model ───────────────────────────────────────────────
// One collapsible section per ssu_role (Owner..Stranger) plus a Banned section.
// Order: highest role first.

export interface RoleSectionDef {
  id: SectionId;
  role: number;
  label: string;
}

export const ROLE_SECTIONS: RoleSectionDef[] = [
  { id: "owner",      role: 7, label: "Owner" },
  { id: "superadmin", role: 6, label: "SuperAdmins" },
  { id: "admin",      role: 5, label: "Admins" },
  { id: "mod",        role: 4, label: "Moderators" },
  { id: "friendly",   role: 3, label: "Friendly" },
  { id: "member",     role: 2, label: "Members" },
  { id: "unfriendly", role: 1, label: "Unfriendly" },
  { id: "stranger",   role: 0, label: "Strangers" },
];

/**
 * Roles the actor may assign to a target, given the actor's effective SSU
 * authority and the target's current role. Empty array = no role actions.
 *
 * Mirrors membership::set_ssu_role_gated exactly:
 *   - actor must be Admin (5) or above;
 *   - cannot assign a role above the actor's own authority (capped at SuperAdmin 6 —
 *     Owner is conferred only by the SSUOwnerCap, never via the registry);
 *   - cannot act on a target whose current role outranks the actor.
 */
export function assignableRolesFor(actorAuthority: number, targetRole: number): number[] {
  if (actorAuthority < 5) return [];
  if (targetRole > actorAuthority) return [];
  const max = Math.min(actorAuthority, 6);
  const out: number[] = [];
  for (let r = 0; r <= max; r++) out.push(r);
  return out;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
