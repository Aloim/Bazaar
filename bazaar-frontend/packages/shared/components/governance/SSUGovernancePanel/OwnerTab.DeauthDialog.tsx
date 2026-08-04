// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * OwnerTab.DeauthDialog — R6.7.5.A Article XIV.4 split
 *
 * Extracted from OwnerTab.tsx to keep that file ≤500 lines.
 * Defines: DeauthDialogProps interface + DeauthDialog modal component.
 *
 * Original location: OwnerTab.tsx lines ~447-522
 */

// ── DeauthDialog ──────────────────────────────────────────────────────────────

export interface DeauthDialogProps {
  isFrozen: boolean;
  /** isActive — OS-38 Decision B active state. */
  isActive: boolean;
  loading: string;
  onFreeze: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onClose: () => void;
}

export function DeauthDialog({ isFrozen, isActive, loading, onFreeze, onDeactivate, onActivate, onClose }: DeauthDialogProps) {
  return (
    <div className="modal-overlay" onClick={loading ? undefined : onClose}>
      <div className="modal modal--warn" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h3>Governance Controls</h3>
        </div>

        <div className="ban-modal__warning">
          <p>
            Choose a governance action. All actions are Owner-only and reversible
            (Freeze requires SSUSuperAdminCap).
          </p>
          <ul style={{ marginTop: "0.5rem", paddingLeft: "1.2rem", lineHeight: 1.6 }}>
            <li>
              <strong>Freeze:</strong> Suspends all governance ops. Reversible via Unfreeze.
              Requires SSUSuperAdminCap.
            </li>
            <li>
              <strong>Deactivate:</strong> Soft-disables the SSU. All GATED entry fns abort.
              Withdraw + Unfreeze still work (EXEMPT-RECOVERY).
            </li>
            <li>
              <strong>Activate:</strong> Re-enables a deactivated SSU governance.
            </li>
          </ul>
        </div>

        <div className="modal__actions" style={{ flexDirection: "column", gap: "0.5rem" }}>
          <button
            className="btn btn--danger"
            disabled={!!loading || isFrozen}
            onClick={onFreeze}
          >
            {loading === "freeze" ? "Freezing..." : isFrozen ? "Already Frozen" : "FREEZE GOVERNANCE"}
          </button>

          {/* OS-38 Decision B: DEACTIVATE replaces the hidden DESTROY button */}
          <button
            className="btn btn--danger"
            disabled={!!loading || !isActive}
            onClick={onDeactivate}
            title={!isActive ? "Already deactivated" : undefined}
          >
            {loading === "deactivate" ? "Deactivating..." : !isActive ? "Already Deactivated" : "DEACTIVATE GOVERNANCE"}
          </button>

          {/* OS-38 Decision B: ACTIVATE for re-activation symmetry */}
          <button
            className="btn btn--primary"
            disabled={!!loading || isActive}
            onClick={onActivate}
            title={isActive ? "Already active" : undefined}
          >
            {loading === "activate" ? "Activating..." : isActive ? "Already Active" : "ACTIVATE GOVERNANCE"}
          </button>

          <button className="btn btn--ghost" onClick={onClose} disabled={!!loading}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
