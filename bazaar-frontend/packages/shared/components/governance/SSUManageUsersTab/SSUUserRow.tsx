// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// A single user row. V30: the role cell is an authority-gated <select> that
// applies via membership::set_ssu_role_gated; "No actions" shows when the actor
// may not manage this target.

import { useState } from "react";
import { abbreviateAddress } from "@evefrontier/dapp-kit";
import { ROLE_LABEL } from "@bazaar/shared/constants";
import { SSUBanPopup } from "./SSUBanPopup";
import type { SSUSectionEntry } from "./ssu-roles";

interface SSUUserRowProps {
  entry: SSUSectionEntry;
  characterName?: string;
  isBanned: boolean;
  expiryMs: number;
  isSelf: boolean;
  targetRole: number;
  assignableRoles: number[];
  canBan: boolean;
  banLoading: string;
  showRole: boolean;
  onSetRole: (newRole: number) => void;
  onUnban: () => void;
  onBan: (ms: number) => void;
}

export function SSUUserRow({
  entry, characterName, isBanned, expiryMs, isSelf, targetRole, assignableRoles,
  canBan, banLoading, showRole, onSetRole, onUnban, onBan,
}: SSUUserRowProps) {
  const [copied, setCopied] = useState(false);
  const [showBanOptions, setShowBanOptions] = useState(false);
  const [pendingRole, setPendingRole] = useState<number>(targetRole);

  function copyAddress() {
    navigator.clipboard.writeText(entry.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const isPermanent  = isBanned && expiryMs === 0;
  const expiryLabel  = isPermanent ? "Permanent" : isBanned ? `Until ${new Date(expiryMs).toLocaleDateString()}` : null;
  const canEditRole  = assignableRoles.length > 0;

  return (
    <tr>
      <td>
        <div className="user-row__addr-cell">
          <div className="user-row__identity">
            {characterName && <span className="user-row__char-name">{characterName}</span>}
            <span className="user-row__addr">{abbreviateAddress(entry.address)}</span>
          </div>
          <button className="user-row__copy-btn" onClick={copyAddress} title="Copy full address" aria-label="Copy address">
            {copied ? "Copied!" : "copy"}
          </button>
          {isBanned && <span className="badge badge--banned">BANNED{expiryLabel ? ` · ${expiryLabel}` : ""}</span>}
        </div>
      </td>
      <td>
        {isBanned ? (
          <span className="muted" style={{ fontSize: "0.78rem" }}>{isPermanent ? "Permanent ban" : `Expires ${new Date(expiryMs).toLocaleString()}`}</span>
        ) : (
          <span className="muted" style={{ fontSize: "0.78rem" }}>Active</span>
        )}
      </td>
      {showRole && (
        <td>
          {canEditRole ? (
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
                disabled={pendingRole === targetRole}
                onClick={() => onSetRole(pendingRole)}
              >
                Set
              </button>
            </div>
          ) : (
            <span className="muted" style={{ fontSize: "0.75rem" }}>
              {ROLE_LABEL[targetRole] ?? `Role ${targetRole}`}{isSelf ? " (you)" : ""}
            </span>
          )}
        </td>
      )}
      <td>
        <div className="user-row__actions">
          {isBanned ? (
            <button className="btn btn--outline btn--sm" disabled={!canBan || banLoading.startsWith("unban-")} onClick={onUnban}>
              {banLoading === `unban-${entry.address}` ? "..." : "Unban"}
            </button>
          ) : (
            canBan && (
              <div style={{ position: "relative", display: "inline-block" }}>
                <button className="btn btn--danger btn--sm" disabled={!!banLoading} onClick={() => setShowBanOptions(v => !v)}>Ban</button>
                {showBanOptions && (
                  <SSUBanPopup onBan={(ms) => { setShowBanOptions(false); onBan(ms); }} onClose={() => setShowBanOptions(false)} />
                )}
              </div>
            )
          )}
        </div>
      </td>
    </tr>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
