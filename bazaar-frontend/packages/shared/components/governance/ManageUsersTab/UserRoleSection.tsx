// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// One collapsible section for a single tribe-role bucket in the tribe-wide Users &
// Roles tab. Role-change only — no ban controls (bans → Moderation tab).

import { useState } from "react";
import { UserRow } from "./UserRow";
import type { TribeRoleSectionView } from "./manage-users-types";

interface UserRoleSectionProps {
  section:                  TribeRoleSectionView;
  characterNames:           Map<string, string>;
  connectedAddress?:        string;
  assignableRolesForTarget: (address: string) => number[];
  onSetRole:                (target: string, newRole: number) => Promise<void>;
}

export function UserRoleSection({
  section, characterNames, connectedAddress, assignableRolesForTarget, onSetRole,
}: UserRoleSectionProps) {
  const [expanded, setExpanded] = useState(section.entries.length > 0);

  return (
    <div className="user-section">
      <button className="user-section__header" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
        <span className="user-section__label">{section.label}</span>
        <span className="user-section__count">{section.entries.length}</span>
        <span className="user-section__chevron">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="user-section__body">
          {section.entries.length === 0 ? (
            <p className="muted user-section__empty">No users in this category.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>User</th><th>Current Role</th><th>Change Role</th></tr>
              </thead>
              <tbody>
                {section.entries.map(entry => {
                  const isSelf = !!connectedAddress &&
                    entry.address.toLowerCase() === connectedAddress.toLowerCase();
                  const assignable = (isSelf || !section.editable)
                    ? [] : assignableRolesForTarget(entry.address);
                  return (
                    <UserRow
                      key={entry.address}
                      address={entry.address}
                      currentRole={section.role}
                      currentRoleLabel={section.rowLabel}
                      characterName={characterNames.get(entry.address)}
                      isSelf={isSelf}
                      assignableRoles={assignable}
                      onSetRole={(newRole) => onSetRole(entry.address, newRole)}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
