// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Tribe Governance → Admin → Users & Roles — shared types.
//
// 2026-06-23 rewrite: this tab lists every user across ALL the tribe's SSUs
// (deduped — a player in two SSUs is one row) sourced from useTribeMembers, grouped
// by TRIBE role. It deliberately does NOT show ssu_role: every SSU owner is Owner of
// their OWN SSU registry (seeded at bootstrap), and surfacing that here made each SSU
// owner look like a second tribe "Owner" (a false-alarm — verified on-chain
// 2026-06-23). The SSU Owner role lives in SSU Governance → Users & Roles.
//
// Roster model: registering an SSU into a tribe makes you a tribe **Member**; the
// single **Leader** (dapp_hub Tribe.leader) is shown on top; Moderator/Admin/
// SuperAdmin are explicit tribe grants. The only action is changing a user's tribe
// role via membership::set_tribe_role — LEADER-ONLY (TribeLeaderCap-gated). Bans live
// in the Moderation tab.

export interface TribeManageUsersTabProps {
  /** Numeric tribe id (TribeInfo.idx) the connected wallet leads/co-admins, or null. */
  tribeIdx:          number | null;
  connectedAddress?: string;
}

/** One collapsible section grouping users by tribe role. */
export interface TribeRoleSectionView {
  /** Section key (stable React key + bucket id). */
  key:      string;
  /** Plural section header, e.g. "Members". */
  label:    string;
  /** Singular per-row role label, e.g. "Member" / "Leader". */
  rowLabel: string;
  /** Tribe-role value used as the role-<select> default for rows in this bucket. */
  role:     number;
  /** False for the Leader bucket (leadership is not a set_tribe_role-assignable role). */
  editable: boolean;
  entries:  Array<{ address: string }>;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
