// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/DAppGovernancePanel.tsx (lines 251-518; split for 500-line guard, section: TribesTab).
// Phase 5 (AUD-DH-14): customTribeOverrides consumption + buildSetCustomTribeTax call removed.
// Per-entity overrides are retired in V36. The "dApp Tax" column now shows the global rate indicator.

import { useState } from "react";
import { abbreviateAddress } from "@evefrontier/dapp-kit";
import type { TribeInfo } from "@bazaar/shared/hooks";

interface TribesTabProps {
  tribes:        TribeInfo[];
  isDAppOwner:   boolean;
  isDAppAdmin:   boolean;
  ownerCapId:    string | null;
  adminCapId:    string | null;
  walletAddress: string;
  onRefresh:     () => void;
}

export function TribesTab({
  tribes,
  isDAppOwner,
  isDAppAdmin,
  ownerCapId,
  adminCapId,
  walletAddress,
  onRefresh,
}: TribesTabProps) {
  const [loading, setLoading] = useState("");

  // Suppress unused warnings for params kept for API compat (future expansion).
  void isDAppOwner;
  void ownerCapId;
  void loading;
  void setLoading;
  void walletAddress;
  void isDAppAdmin;
  void adminCapId;

  return (
    <div className="panel__section">
      {/* Stats */}
      <div className="stats-row">
        <div className="stat">
          <span className="stat__label">Total Tribes</span>
          <span className="stat__value">{tribes.length}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Total SSUs</span>
          <span className="stat__value">{tribes.reduce((acc, t) => acc + t.ssuIds.length, 0)}</span>
        </div>
      </div>

      {/* Tribe list */}
      <div className="action-card">
        <h4>Registered Tribes</h4>
        {tribes.length === 0 && (
          <p className="muted">No tribes registered yet.</p>
        )}
        <table className="admin-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Leader</th>
              <th>SSUs</th>
              <th>dApp Tax</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tribes.map(tribe => (
              <tr key={tribe.idx}>
                <td className="muted">{tribe.idx}</td>
                <td>
                  <strong>{tribe.name}</strong>
                  {tribe.description && (
                    <div className="muted" style={{ fontSize: "0.72rem" }}>{tribe.description}</div>
                  )}
                </td>
                <td>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                    {abbreviateAddress(tribe.leader)}
                  </span>
                </td>
                <td>{tribe.ssuIds.length}</td>
                <td style={{ textAlign: "center" }}>
                  <span className="muted" style={{ fontSize: "0.75rem" }}>global</span>
                </td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Refresh button */}
      <div style={{ marginTop: "0.5rem" }}>
        <button className="btn btn--ghost btn--sm" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {/* Note: Tribe deactivation is leader-only via buildDeactivateTribe. DApp-Owner remove bypass does not exist in v2. */}
      {/* Note: SSU registration uses apply/accept model (buildApplyToTribe / buildAcceptApplication). DApp-Owner bypass removed in v2. */}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
