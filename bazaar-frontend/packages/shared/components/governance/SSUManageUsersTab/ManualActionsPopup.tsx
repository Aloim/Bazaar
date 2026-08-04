// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Manual Actions modal. V30: grant-by-address uses set_ssu_role_gated and is
// shown only to actors with Admin (5)+ authority, offering only roles up to the
// actor's own authority (capped at SuperAdmin). Ban is shown only to cap holders.

import { useState } from "react";
import AddressInput from "@bazaar/shared/components/AddressInput";
import { ROLE_LABEL } from "@bazaar/shared/constants";
import { BAN_DURATIONS } from "./ssu-roles";

interface ManualActionsPopupProps {
  memberRegistryId: string;
  actorAuthority: number;
  canBan: boolean;
  hasSSUOwnerCap: boolean;
  ssuOwnerCapId: string | null;
  banTarget: string;
  setBanTarget: (v: string) => void;
  banLoading: string;
  transferTarget: string;
  setTransferTarget: (v: string) => void;
  transferLoading: boolean;
  onSetRole: (address: string, newRole: number) => void;
  onBanPlayer: (address: string, durationMs: number) => void;
  onTransferOwnership: () => void;
  onClose: () => void;
}

export function ManualActionsPopup({
  memberRegistryId, actorAuthority, canBan, hasSSUOwnerCap, ssuOwnerCapId,
  banTarget, setBanTarget, banLoading, transferTarget, setTransferTarget,
  transferLoading, onSetRole, onBanPlayer, onTransferOwnership, onClose,
}: ManualActionsPopupProps) {
  const [grantTarget, setGrantTarget] = useState("");
  const maxRole = Math.min(actorAuthority, 6);
  const assignable: number[] = [];
  for (let r = 0; r <= maxRole; r++) assignable.push(r);
  const [grantRole, setGrantRole] = useState<number>(0);
  const canGrant = actorAuthority >= 5;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "500px", width: "100%" }}>
        <div className="modal__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Manual Actions</h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>X</button>
        </div>

        {canGrant && (
          <div className="action-card" style={{ marginBottom: "1rem" }}>
            <h4>Set SSU Role by Address</h4>
            <p className="muted" style={{ fontSize: "0.78rem" }}>
              Assign an SSU role to a player address. The player must already be
              registered at this SSU. You can grant up to your own authority.
            </p>
            <div className="form-row" style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.5rem" }}>
              <AddressInput value={grantTarget} onChange={setGrantTarget} placeholder="Player address 0x..." />
              <select
                className="input input--xs"
                value={grantRole}
                onChange={e => setGrantRole(Number(e.target.value))}
                style={{ minWidth: "7rem" }}
              >
                {assignable.map(r => (
                  <option key={r} value={r}>{ROLE_LABEL[r] ?? `Role ${r}`}</option>
                ))}
              </select>
              <button
                className="btn btn--primary btn--sm"
                disabled={!grantTarget.trim() || !memberRegistryId}
                onClick={() => onSetRole(grantTarget.trim(), grantRole)}
              >
                Set Role
              </button>
            </div>
          </div>
        )}

        {canBan && (
          <div className="action-card" style={{ marginBottom: "1rem" }}>
            <h4>Ban Player at This SSU</h4>
            <p className="muted" style={{ fontSize: "0.78rem" }}>SSU-local ban prevents shop access at this SSU only.</p>
            <div className="form-row">
              <AddressInput value={banTarget} onChange={setBanTarget} placeholder="Player address 0x..." />
            </div>
            {banTarget && (
              <div className="form-row" style={{ flexWrap: "wrap", gap: "0.4rem", marginTop: "0.5rem" }}>
                {BAN_DURATIONS.map(d => (
                  <button key={d.ms} className="btn btn--danger btn--sm" disabled={!!banLoading} onClick={() => onBanPlayer(banTarget, d.ms)}>
                    {banLoading === `ban-${d.ms}` ? "Banning..." : `Ban ${d.label}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {hasSSUOwnerCap && ssuOwnerCapId && (
          <div className="action-card action-card--danger" style={{ marginBottom: "0.5rem" }}>
            <h4>Transfer SSU Ownership</h4>
            <p className="muted" style={{ fontSize: "0.78rem" }}>Transfers your SSUOwnerCap to the target address. This is irreversible.</p>
            <div className="form-row" style={{ marginTop: "0.5rem" }}>
              <AddressInput value={transferTarget} onChange={setTransferTarget} placeholder="New owner address 0x..." />
              <button className="btn btn--danger btn--sm" disabled={transferLoading || !transferTarget.trim()} onClick={onTransferOwnership}>
                {transferLoading ? "Transferring..." : "Transfer"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
