// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * MissionVisibilityPicker — Step 1 "Available to:" checkbox group.
 * Only rendered when privileged === true (Moderator/Admin/Owner).
 * EVE-Frontier console look: reuses .type-selector / checkbox-row language.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import type { VisibilityCheckboxState } from "@bazaar/shared/utils/mission";

interface Props {
  value: VisibilityCheckboxState;
  onChange: (s: VisibilityCheckboxState) => void;
  privileged: boolean;
}

export default function MissionVisibilityPicker({ value, onChange, privileged }: Props) {
  if (!privileged) return null;

  const set = (field: keyof VisibilityCheckboxState, checked: boolean) => {
    if (field === "everyone" && checked) {
      onChange({ everyone: true, owner: false, admin: false, moderator: false, member: false });
      return;
    }
    const next = { ...value, [field]: checked };
    if (field !== "everyone" && checked) next.everyone = false;
    if (!next.owner && !next.admin && !next.moderator && !next.member && !next.everyone) {
      next.everyone = true;
    }
    onChange(next);
  };

  const roleDisabled = value.everyone;

  return (
    <div className="mis-field" style={{ marginTop: "1rem" }}>
      <label className="mis-field__label">
        Available to <span className="muted">(who can see and accept this mission)</span>
      </label>
      <div className="type-selector" style={{ gap: "0.4rem" }}>
        <label className="vis-check">
          <input type="checkbox" checked={value.everyone} onChange={(e) => set("everyone", e.target.checked)} />
          <span>Everyone <span className="muted">(public)</span></span>
        </label>
        <div style={{ opacity: roleDisabled ? 0.4 : 1, pointerEvents: roleDisabled ? "none" : undefined }}>
          <label className="vis-check">
            <input type="checkbox" checked={value.owner} disabled={roleDisabled}
              onChange={(e) => set("owner", e.target.checked)} />
            <span>Owner</span>
          </label>
          <label className="vis-check">
            <input type="checkbox" checked={value.admin} disabled={roleDisabled}
              onChange={(e) => set("admin", e.target.checked)} />
            <span>Admins</span>
          </label>
          <label className="vis-check">
            <input type="checkbox" checked={value.moderator} disabled={roleDisabled}
              onChange={(e) => set("moderator", e.target.checked)} />
            <span>Moderators</span>
          </label>
          <label className="vis-check">
            <input type="checkbox" checked={value.member} disabled={roleDisabled}
              onChange={(e) => set("member", e.target.checked)} />
            <span>Members</span>
          </label>
        </div>
      </div>
      {!value.everyone && (
        <p className="muted" style={{ fontSize: "0.74rem", marginTop: "0.3rem" }}>
          Only visible and acceptable by the selected roles. You (the owner) always see your own missions.
        </p>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment.
// ============================================================
