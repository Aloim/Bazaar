// ============================================================
// TribeDetailsWindow.tsx — Floating window showing tribe details
// and remove tribe functionality.
// Part of DappHub admin panel. Created for FixPolishPlan1 Phase B.
// Phase 5 (AUD-DH-14): tax-override section removed — the per-entity
// override Move fns are retired in V36; the UI was writing to a dead code path.
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect } from "react";
import { useConnection, dAppKit } from "@evefrontier/dapp-kit";
import { buildDeactivateTribe, buildDeactivateTribeFully } from "@bazaar/shared/tx";
import { suiClient } from "@bazaar/shared/hooks";
import { useTribeGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { PACKAGE_IDS, v37Enabled } from "@bazaar/shared/constants";
import ConfirmRemoveDialog from "./ConfirmRemoveDialog";
import type { TribeRow } from "./TribesTab";

const TRIBE_LEADER_CAP_TYPE = `${PACKAGE_IDS.DAPP_HUB}::tribe_registry::TribeLeaderCap`;

interface TribeDetailsWindowProps {
  tribe: TribeRow;
  onClose: () => void;
  ownerCapId: string | null;
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

export default function TribeDetailsWindow({ tribe, onClose, ownerCapId: _ownerCapId }: TribeDetailsWindowProps) {
  const { walletAddress } = useConnection();
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [leaderCapId, setLeaderCapId] = useState<string | null>(null);
  const [capError, setCapError] = useState<string | null>(null);
  // V37: the tribe's TribeGovernance id, so removal can deactivate governance too
  // (not just the registry flag). null until V37 / for tribes with no gov object.
  const { data: tribeGovId } = useTribeGovId(tribe.id);

  useEffect(() => {
    if (!walletAddress) return;
    setLeaderCapId(null);
    setCapError(null);
    suiClient.getOwnedObjects({
      owner: walletAddress,
      filter: { StructType: TRIBE_LEADER_CAP_TYPE },
      options: { showContent: true },
    }).then(result => {
      const match = result.data.find(obj => {
        const fields = (obj.data?.content as { fields?: Record<string, unknown> })?.fields;
        return fields && String(fields.tribe_id) === tribe.id;
      });
      if (match?.data?.objectId) {
        setLeaderCapId(match.data.objectId);
      } else {
        setCapError("No TribeLeaderCap found for this tribe in your wallet.");
      }
    }).catch(() => {
      setCapError("Failed to query TribeLeaderCap.");
    });
  }, [walletAddress, tribe.id]);

  async function handleConfirmRemove() {
    if (!leaderCapId) return;
    setIsRemoving(true);
    try {
      // V37: deactivate BOTH the registry flag AND the TribeGovernance object so
      // removal truly revokes governance. Falls back to the registry-only entry on
      // live V36, or when the tribe has no governance object to deactivate.
      const tx = v37Enabled() && tribeGovId
        ? buildDeactivateTribeFully({ tribeLeaderCapId: leaderCapId, tribeGovId })
        : buildDeactivateTribe(leaderCapId);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setShowRemoveDialog(false);
      onClose();
    } catch (e) {
      console.error("Deactivate tribe failed:", e);
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
          <h3 className="detail-window__title">{tribe.name}</h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>x</button>
        </div>

        <div className="detail-row">
          <span className="detail-row__label">Tribe ID</span>
          <span className="detail-row__value" style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
            {tribe.id}
            <CopyButton text={tribe.id} />
          </span>
        </div>

        <div className="detail-row">
          <span className="detail-row__label">Type</span>
          <span className={`badge badge--${tribe.bazaarType}`}>{tribe.bazaarType}</span>
        </div>

        <div className="detail-row">
          <span className="detail-row__label">Members</span>
          <span className="detail-row__value">{tribe.memberCount}</span>
        </div>

        <div className="detail-row">
          <span className="detail-row__label">SSUs</span>
          <span className="detail-row__value">{tribe.ssuCount}</span>
        </div>

        <div className="detail-row">
          <span className="detail-row__label">Total Taxes Paid to DApp</span>
          <span className="detail-row__value muted">Loading...</span>
        </div>

        <hr className="detail-window__divider" />

        <div className="detail-window__danger-zone">
          <p className="detail-window__danger-label">Danger Zone</p>
          <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
            Removing this tribe will unregister all SSUs. They will continue operating as NoTribe SSUs.
          </p>
          {capError && (
            <p style={{ color: "var(--danger, #f55)", fontSize: "0.75rem", marginBottom: "0.4rem" }}>
              {capError}
            </p>
          )}
          <button
            className="btn btn--danger btn--sm"
            onClick={() => setShowRemoveDialog(true)}
            disabled={!leaderCapId}
          >
            Remove Tribe
          </button>
        </div>
      </div>

      {showRemoveDialog && (
        <ConfirmRemoveDialog
          entityType="tribe"
          entityName={tribe.name}
          warningText="Removing this tribe will unregister all SSUs. They will continue operating as NoTribe SSUs."
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
