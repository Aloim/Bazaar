// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState } from "react";
import { abbreviateAddress, dAppKit } from "@evefrontier/dapp-kit";
import { buildSSUBanAs } from "@bazaar/shared/tx/bazaarcore/ssu-ban-tx";
import type { SSUCapTier } from "@bazaar/shared/tx/bazaarcore/ssu-ban-tx";

// ── PermaBanModal ─────────────────────────────────────────────────────────────

export interface PermaBanModalProps {
  address:   string;
  capTier:   SSUCapTier;
  capId:     string;
  ssuGovId:  string;
  onConfirm: () => void;
  onClose:   () => void;
}

export default function PermaBanModal({ address, capTier, capId, ssuGovId, onConfirm, onClose }: PermaBanModalProps) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const tx = buildSSUBanAs({ capTier, capId, ssuGovId, target: address, expiresAtMs: "permanent" });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onConfirm();
    } catch (e: any) {
      alert(e?.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--warn" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h3>Permanent Ban</h3>
        </div>

        <div className="ban-modal__target">
          <span className="muted" style={{ fontSize: "0.78rem" }}>Target:</span>
          <code className="ban-modal__addr">{abbreviateAddress(address)}</code>
        </div>

        <div className="ban-modal__warning">
          This user will be permanently banned until manually removed from the ban list.
          All their active shops will be closed and escrowed items/funds returned.
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn--danger"
            disabled={!capId || loading}
            onClick={handleConfirm}
          >
            {loading ? "Banning..." : "Proceed with Ban"}
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
