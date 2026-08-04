// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// One collapsible section for a single ssu_role (or the Banned bucket).
// V30: rows carry the target's current role so each row can offer only the
// roles the actor is permitted to assign (assignableRolesFor).

import { useState } from "react";
import { SSUUserRow } from "./SSUUserRow";
import { assignableRolesFor, type SSURoleSection as SSURoleSectionType } from "./ssu-roles";

interface SSURoleSectionProps {
  section: SSURoleSectionType;
  characterNames: Map<string, string>;
  connectedAddress?: string;
  localBanList: Map<string, number>;
  roleByAddr: Map<string, number>;
  actorAuthority: number;
  canBan: boolean;
  banLoading: string;
  onSetRole: (target: string, newRole: number) => void;
  onUnban: (target: string) => void;
  onBan: (target: string, ms: number) => void;
  isBannedSection: boolean;
  isOwnerSection: boolean;
}

export function SSURoleSection({
  section, characterNames, connectedAddress, localBanList, roleByAddr, actorAuthority,
  canBan, banLoading, onSetRole, onUnban, onBan, isBannedSection, isOwnerSection,
}: SSURoleSectionProps) {
  const [expanded, setExpanded] = useState(!isBannedSection && section.entries.length > 0);

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
            <p className="muted user-section__empty">
              {isOwnerSection ? "No SSU owner detected (governance not initialized)." : isBannedSection ? "No local bans active." : "No users in this category."}
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Status</th>
                  {!isBannedSection && <th>Role</th>}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {section.entries.map(entry => {
                  const banEntry = localBanList.get(entry.address);
                  const isBanned = banEntry !== undefined && (banEntry === 0 || banEntry > Date.now());
                  const expiryMs = banEntry ?? 0;
                  const isSelf = !!connectedAddress && entry.address === connectedAddress;
                  const targetRole = isOwnerSection ? 7 : (roleByAddr.get(entry.address) ?? 0);
                  // Owner is never editable here; self is excluded to avoid self-demotion footguns.
                  const assignable = (isOwnerSection || isSelf || isBannedSection)
                    ? []
                    : assignableRolesFor(actorAuthority, targetRole);
                  return (
                    <SSUUserRow
                      key={entry.address}
                      entry={entry}
                      characterName={characterNames.get(entry.address)}
                      isBanned={isBanned}
                      expiryMs={expiryMs}
                      isSelf={isSelf}
                      targetRole={targetRole}
                      assignableRoles={assignable}
                      canBan={canBan && !isBannedSection && !isSelf && !isOwnerSection}
                      banLoading={banLoading}
                      showRole={!isBannedSection}
                      onSetRole={(newRole) => onSetRole(entry.address, newRole)}
                      onUnban={() => onUnban(entry.address)}
                      onBan={(ms) => onBan(entry.address, ms)}
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
