// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// A single user row in the tribe-wide Users & Roles tab. Identity + current tribe
// role + a leader-gated role <select>/Set. No ban controls (bans → Moderation tab).

import { useState } from "react";
import { abbreviateAddress } from "@evefrontier/dapp-kit";
import { ROLE_LABEL } from "@bazaar/shared/constants";

interface UserRowProps {
  address:         string;
  /** The tribe-role value used as the <select> default (the bucket this row is in). */
  currentRole:     number;
  /** Display label for the current tribe role (e.g. "Member" / "Leader"). */
  currentRoleLabel: string;
  characterName?:  string;
  isSelf:          boolean;
  /** Tribe roles the leader may assign; empty = read-only ("No permission"). */
  assignableRoles: number[];
  onSetRole:       (newRole: number) => Promise<void>;
}

export function UserRow({
  address, currentRole, currentRoleLabel, characterName, isSelf, assignableRoles, onSetRole,
}: UserRowProps) {
  const [copied, setCopied] = useState(false);
  const [pendingRole, setPendingRole] = useState<number>(currentRole);
  const [busy, setBusy] = useState(false);

  function copyAddress() {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const canEdit = assignableRoles.length > 0;

  async function apply() {
    setBusy(true);
    try { await onSetRole(pendingRole); }
    finally { setBusy(false); }
  }

  return (
    <tr>
      <td>
        <div className="user-row__addr-cell">
          <div className="user-row__identity">
            {characterName && <span className="user-row__char-name">{characterName}</span>}
            <span className="user-row__addr">{abbreviateAddress(address)}</span>
          </div>
          <button className="user-row__copy-btn" onClick={copyAddress} title="Copy full address" aria-label="Copy address">
            {copied ? "Copied!" : "copy"}
          </button>
        </div>
      </td>
      <td>
        <span className="muted" style={{ fontSize: "0.8rem" }}>
          {currentRoleLabel}{isSelf ? " (you)" : ""}
        </span>
      </td>
      <td>
        {canEdit ? (
          <div className="form-row" style={{ gap: "0.35rem", flexWrap: "nowrap", alignItems: "center" }}>
            <select
              className="input input--xs"
              value={pendingRole}
              onChange={e => setPendingRole(Number(e.target.value))}
              style={{ minWidth: "7rem" }}
            >
              {assignableRoles.map(r => (
                <option key={r} value={r}>{ROLE_LABEL[r] ?? `Role ${r}`}</option>
              ))}
            </select>
            <button
              className="btn btn--primary btn--sm"
              disabled={busy || pendingRole === currentRole}
              onClick={apply}
            >
              {busy ? "..." : "Set"}
            </button>
          </div>
        ) : (
          <span className="muted" style={{ fontSize: "0.75rem" }}>{isSelf ? "—" : "No permission"}</span>
        )}
      </td>
    </tr>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
