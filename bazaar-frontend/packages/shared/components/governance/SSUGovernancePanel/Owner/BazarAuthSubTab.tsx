// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazarAuthSubTab — R6.6.4b OS-32
 *
 * SSU extension authorization + freeze config. Ported verbatim from Bazar1
 * SSUGovernancePanel.tsx lines 1535-1676 with import path adaptations only.
 *
 * Functions:
 *   SSUBazarAuthSubTab    — authorize extension + trigger freeze modal
 *   SSUFreezeConfigModal  — irreversible freeze warning modal
 *
 * TX builders:
 *   buildAuthorizeExtension    — bazaarcore/ssu-receiving-tx.ts (unified module)
 *   buildFreezeExtensionConfig — bazaarcore/ssu-receiving-tx.ts (unified module)
 *   resolveSSUOwnerCap         — bazaarcore/ssu-receiving-tx.ts (unified module)
 *
 * Both builders use the Sui Receiving pattern (borrow/return OwnerCap<StorageUnit>).
 * resolveSSUOwnerCap is called at action-time (not at render) to get the live cap ref.
 *
 * Article XIV.2 exemption: verbatim from Bazar1 with import path adaptations only.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import {
  buildAuthorizeExtension,
  buildFreezeExtensionConfig,
  resolveSSUOwnerCap,
  isExtensionConfigFrozenError,
} from "@bazaar/shared/tx/bazaarcore/ssu-receiving-tx";
import { usePlayerCharacter } from "@bazaar/shared/hooks/usePlayerCharacter";

// ── SSUBazarAuthSubTab ────────────────────────────────────────────────────────

// ssuId is passed in (NOT read from the SSU_OBJECT_ID env) so this sub-tab
// authorizes/freezes the SELECTED SSU. In-game ssuId === SSU_OBJECT_ID (no change);
// in the DappHub SSU Governance screen the user may govern any of their SSUs.
export function SSUBazarAuthSubTab({ ssuId }: { ssuId: string }) {
  const { character } = usePlayerCharacter();
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [authLoading,   setAuthLoading]   = useState(false);
  const [freezeStatus,  setFreezeStatus]  = useState<string | null>(null);
  const [authStatus,    setAuthStatus]    = useState<string | null>(null);
  const [showFreezeModal, setShowFreezeModal] = useState(false);

  async function handleAuthorize() {
    if (!character) { alert("Character not resolved. Connect wallet first."); return; }
    setAuthLoading(true); setAuthStatus(null);
    try {
      const cap = await resolveSSUOwnerCap(character.characterId, ssuId);
      if (!cap) {
        alert("Could not find OwnerCap<StorageUnit> for this SSU. Are you the SSU owner?");
        return;
      }
      await dAppKit.signAndExecuteTransaction({
        transaction: buildAuthorizeExtension(
          ssuId, character.characterId, cap.ssuCapId, cap.ssuCapVersion, cap.ssuCapDigest,
        ),
      });
      setAuthStatus("Extension authorized successfully!");
      setTimeout(() => setAuthStatus(null), 3000);
    } catch (e: any) {
      if (isExtensionConfigFrozenError(e)) {
        alert(
          "This SSU's extension config is frozen, so the Bazaar extension can no longer be authorized. " +
          "If it was authorized before being frozen, the Bazaar already works. Freezing is irreversible — " +
          "if it was never authorized, this SSU can't run the Bazaar and you'll need to use a different one.",
        );
      } else {
        alert(e?.message);
      }
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <div>
      <div className="action-card">
        <h4>SSU Extension Authorization</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          Authorize BazarAuth as the SSU extension. Normally done automatically during Ownership Claiming.
          Press this button if shop creation fails or transactions are rejected.
        </p>
        {authStatus && (
          <p style={{ color: "#4ade80", fontSize: "0.85rem", margin: "0.4rem 0" }}>{authStatus}</p>
        )}
        <button
          className="btn btn--primary btn--sm"
          disabled={authLoading || !character}
          onClick={handleAuthorize}
        >
          {authLoading ? "Authorizing..." : "Authorize BazarAuth Extension"}
        </button>
      </div>

      <div className="action-card" style={{ marginTop: "1rem" }}>
        <h4>Freeze Extension Config</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          Optional but recommended — permanently locks this SSU to the Tribe Bazar extension.
          Acts as a trust signal for users. This action is irreversible.
        </p>
        {freezeStatus && (
          <p style={{ color: "#4ade80", fontSize: "0.85rem", margin: "0.4rem 0" }}>{freezeStatus}</p>
        )}
        <button
          className="btn btn--danger btn--sm"
          disabled={freezeLoading || !character}
          onClick={() => setShowFreezeModal(true)}
        >
          Freeze Config
        </button>
      </div>

      {showFreezeModal && (
        <SSUFreezeConfigModal
          ssuId={ssuId}
          onClose={() => setShowFreezeModal(false)}
          onSuccess={(msg) => {
            setFreezeStatus(msg);
            setShowFreezeModal(false);
            setTimeout(() => setFreezeStatus(null), 3000);
          }}
        />
      )}
    </div>
  );
}

// ── SSUFreezeConfigModal ──────────────────────────────────────────────────────

interface SSUFreezeConfigModalProps {
  ssuId: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

function SSUFreezeConfigModal({ ssuId, onClose, onSuccess }: SSUFreezeConfigModalProps) {
  const { character } = usePlayerCharacter();
  const [loading, setLoading] = useState(false);

  async function handleFreeze() {
    if (!character) { alert("Character not resolved. Connect wallet first."); return; }
    setLoading(true);
    try {
      const cap = await resolveSSUOwnerCap(character.characterId, ssuId);
      if (!cap) {
        alert("Could not find OwnerCap<StorageUnit> for this SSU. Are you the SSU owner?");
        return;
      }
      await dAppKit.signAndExecuteTransaction({
        transaction: buildFreezeExtensionConfig(
          ssuId, character.characterId, cap.ssuCapId, cap.ssuCapVersion, cap.ssuCapDigest,
        ),
      });
      onSuccess("Extension config frozen successfully!");
    } catch (e: any) {
      alert(e?.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={loading ? undefined : onClose}>
      <div className="modal modal--warn" onClick={e => e.stopPropagation()}>
        <div className="modal__header"><h3>Freeze Extension Config</h3></div>
        <div className="ban-modal__warning">
          <p><strong>This action is IRREVERSIBLE.</strong></p>
          <ul style={{ marginTop: "0.5rem", paddingLeft: "1.2rem", lineHeight: 1.6 }}>
            <li>Once frozen, this SSU is permanently locked to the Tribe Bazar extension.</li>
            <li>No other dApp or extension can be installed on this SSU.</li>
            <li>Recommended as a trust signal for users.</li>
          </ul>
        </div>
        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className="btn btn--danger"
            disabled={loading || !character}
            onClick={handleFreeze}
          >
            {loading ? "Freezing..." : "I understand, Freeze Config"}
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
