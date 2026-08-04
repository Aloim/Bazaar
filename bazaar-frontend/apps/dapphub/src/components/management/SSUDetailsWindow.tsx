// ============================================================
// SSUDetailsWindow.tsx — Floating window showing SSU details
// and remove SSU functionality.
// Part of DappHub admin panel. Created for FixPolishPlan1 Phase B.
// Phase 5 (AUD-DH-14): tax-override section removed — the per-entity
// override Move fns are retired in V36; the UI was writing to a dead code path.
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useSSUDappTaxPaid } from "@bazaar/shared/hooks";
import { formatSui } from "@bazaar/shared/utils";
import { buildRemoveSSU } from "@bazaar/shared/tx";
import ConfirmRemoveDialog from "./ConfirmRemoveDialog";
import DepreciationDrainRow from "./DepreciationDrainRow";
import RecordRevealRow from "./RecordRevealRow";
import type { SSURow } from "./SSUsTab";

// SDC-007: user must type last 8 chars of SSU ID
function getLast8(id: string): string {
  const clean = id.replace(/\./g, "").replace(/\s/g, "");
  return clean.slice(-8);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button className="copy-btn" onClick={handleCopy} title="Copy to clipboard">
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

interface SSUDetailsWindowProps {
  ssu: SSURow;
  onClose: () => void;
  ownerCapId: string | null;
}

export default function SSUDetailsWindow({ ssu, onClose, ownerCapId: _ownerCapId }: SSUDetailsWindowProps) {
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const queryClient = useQueryClient();

  const confirmToken = getLast8(ssu.ssuId);

  const dappTax = useSSUDappTaxPaid(ssu.ssuId);

  async function handleConfirmRemove() {
    setIsRemoving(true);
    try {
      const tx = buildRemoveSSU(ssu.ssuId);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setShowRemoveDialog(false);
      onClose();
    } catch (e) {
      console.error("Remove SSU failed:", e);
    } finally {
      setIsRemoving(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="detail-window" onClick={handleBackdropClick}>
      <div className="detail-window__card">
        <div className="detail-window__header">
          <h3 className="detail-window__title" style={{ fontSize: "1rem" }}>SSU Details</h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>x</button>
        </div>

        <div className="detail-row">
          <span className="detail-row__label">SSU ID</span>
          <span className="detail-row__value" style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
            {ssu.ssuId}
            <CopyButton text={ssu.ssuId} />
          </span>
        </div>

        <div className="detail-row">
          <span className="detail-row__label">Owner Wallet</span>
          <span className="detail-row__value" style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
            {ssu.ownerAddress}
            <CopyButton text={ssu.ownerAddress} />
          </span>
        </div>

        <div className="detail-row">
          <span className="detail-row__label">Tribe</span>
          <span className="detail-row__value">
            {ssu.tribeName ?? <span className="muted">NoTribe</span>}
          </span>
        </div>

        <div className="detail-row">
          <span className="detail-row__label">Status</span>
          <span className={`badge badge--${ssu.status}`}>{ssu.status}</span>
          {ssu.isDepreciated && (
            <span className="badge badge--depreciated" style={{ marginLeft: "0.4rem" }}>
              Depreciated
            </span>
          )}
        </div>

        {!ssu.isDepreciated && <RecordRevealRow ssuId={ssu.ssuId} />}

        <div className="detail-row">
          <span className="detail-row__label">DApp Tax Paid (ingoing)</span>
          <span className="detail-row__value">
            {dappTax.loading ? (
              <span className="muted">Loading…</span>
            ) : dappTax.error ? (
              <span className="muted" title={dappTax.error}>Unavailable</span>
            ) : (
              <span>
                {formatSui(dappTax.dappTaxPaid)} EVE
                <span className="muted" style={{ fontSize: "0.72rem", marginLeft: "0.4rem" }}>
                  ({dappTax.txCount} tx{dappTax.txCount !== 1 ? "s" : ""}{dappTax.capped ? "+" : ""})
                </span>
              </span>
            )}
          </span>
        </div>

        <div className="detail-row">
          <span className="detail-row__label">Trade Volume (gross)</span>
          <span className="detail-row__value">
            {dappTax.loading ? (
              <span className="muted">Loading…</span>
            ) : dappTax.error ? (
              <span className="muted">—</span>
            ) : (
              <span>{formatSui(dappTax.grossVolume)} EVE</span>
            )}
          </span>
        </div>

        {ssu.isDepreciated && (
          <div className="detail-window__danger-zone" style={{ marginTop: "0.75rem" }}>
            <p className="detail-window__danger-label">Dead Bazaar — Prune</p>
            <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
              This SSU's in-game assembly no longer exists. Refund surviving escrow to the
              recorded owners/takers and delist its shops/missions. Permissionless — any
              wallet may run this, not only the DApp owner.
            </p>
            <DepreciationDrainRow ssu={ssu} onRefresh={() => { void queryClient.invalidateQueries(); }} />
          </div>
        )}

        <hr className="detail-window__divider" />

        <div className="detail-window__danger-zone">
          <p className="detail-window__danger-label">Danger Zone</p>
          <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
            This will unregister the SSU from the DApp.
          </p>
          <button
            className="btn btn--danger btn--sm"
            onClick={() => setShowRemoveDialog(true)}
          >
            Remove SSU
          </button>
        </div>
      </div>

      {showRemoveDialog && (
        <ConfirmRemoveDialog
          entityType="ssu"
          entityName={confirmToken}
          warningText="This will unregister the SSU from the DApp."
          isRemoving={isRemoving}
          onConfirm={handleConfirmRemove}
          onCancel={() => setShowRemoveDialog(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
