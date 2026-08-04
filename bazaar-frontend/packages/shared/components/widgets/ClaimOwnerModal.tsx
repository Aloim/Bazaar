// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useRef } from "react";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import { buildClaimOwnership } from "@bazaar/shared/tx/dapp_hub/governance-tx";
import { resolveSSUOwnerCap } from "@bazaar/shared/tx";
import { usePlayerCharacter } from "@bazaar/shared/hooks/usePlayerCharacter";
import { useClaimBoxContext } from "@bazaar/shared/contexts/ClaimBoxContext";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";

interface Props {
  onSuccess: () => void;
  onClose: () => void;
}

export default function ClaimOwnerModal({ onSuccess, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ssuCap, setSsuCap] = useState<{ ssuCapId: string; ssuCapVersion: string; ssuCapDigest: string } | null>(null);
  const [checkingCap, setCheckingCap] = useState(true);

  const { character } = usePlayerCharacter();
  const { walletAddress } = useConnection();
  const claimBox = useClaimBoxContext();
  // Keep a stable ref to the latest claimBox value so the async poll loop can read it
  const claimBoxRef = useRef(claimBox);
  useEffect(() => { claimBoxRef.current = claimBox; }, [claimBox]);


  // Check if this wallet owns the SSU OwnerCap on mount
  useEffect(() => {
    if (!character) {
      setCheckingCap(false);
      return;
    }
    setCheckingCap(true);
    resolveSSUOwnerCap(character.characterId, SSU_OBJECT_ID)
      .then(cap => setSsuCap(cap))
      .catch(() => setSsuCap(null))
      .finally(() => setCheckingCap(false));
  }, [character]);

  const isSSUOwner = ssuCap !== null;
  const canSubmit = isSSUOwner && !loading;

  async function handleClaim() {
    if (!character || !ssuCap || !walletAddress) return;

    // dapp_governance::claim_ownership takes only (claim_box, ctx) — no BazarAuth authorize_extension step.
    // Extension authorization is handled at bootstrap time via ssu_bootstrap::bootstrap_ssu_objects.
    setLoading(true);
    setError(null);
    try {
      const tx = buildClaimOwnership({ senderAddress: walletAddress });

      await dAppKit.signAndExecuteTransaction({ transaction: tx });
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed");
      setLoading(false);
      return;
    }

    // Transaction submitted — enter polling phase
    setLoading(false);
    setPolling(true);
    setPollError(null);

    const MAX_POLLS = 15;
    for (let i = 0; i < MAX_POLLS; i++) {
      claimBoxRef.current.refetch();
      // Wait 1 s then check the latest context value via the ref
      await new Promise<void>(r => setTimeout(r, 1000));
      if (!claimBoxRef.current.isClaimable) {
        // Ownership confirmed — isClaimable is now false
        setPolling(false);
        onSuccess();
        onClose();
        return;
      }
    }

    // Timed out
    setPolling(false);
    setPollError(
      "Claim timed out. The transaction was submitted but ownership has not been confirmed yet. Please refresh the page and try again."
    );
  }

  const isBusy = loading || polling;

  return (
    <div className="modal-overlay" onClick={isBusy ? undefined : onClose}>
      <div className="modal modal--claim" onClick={e => e.stopPropagation()}>
        <h3 className="modal__title">Claim Owner Status</h3>

        {polling && (
          <div className="panel__section" style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <p style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>
              Claiming ownership<span className="loading-dots">...</span>
            </p>
            <p className="muted" style={{ fontSize: "0.8rem" }}>
              Please wait while the blockchain confirms.
            </p>
          </div>
        )}

        {pollError && (
          <div className="panel__section">
            <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: "1rem" }}>{pollError}</p>
            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={onClose}>Close</button>
            </div>
          </div>
        )}

        {!polling && !pollError && checkingCap ? (
          <div className="panel__section">
            <p className="muted">Checking SSU ownership...</p>
          </div>
        ) : !polling && !pollError && !isSSUOwner ? (
          <div className="panel__section">
            <p style={{ color: "var(--danger)", fontSize: "0.9rem", marginBottom: "0.5rem" }}>
              <strong>You are not the owner of this SSU.</strong>
            </p>
            <p className="muted" style={{ fontSize: "0.8rem" }}>
              Only the SSU owner can claim dApp ownership. Claiming also
              authorizes the BazarAuth extension on the SSU, which requires
              the SSU OwnerCap. Ask the SSU owner to perform this setup.
            </p>
            <div className="modal__actions" style={{ marginTop: "1rem" }}>
              <button className="btn btn--ghost" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : !polling && !pollError ? (
          <>
            <div className="claim-modal__warning">
              <p>
                This action cannot be undone. You will be permanently granted the
                Owner role for this dApp.
              </p>
              <ul className="claim-modal__list">
                <li>There can only be one Owner at a time.</li>
                <li>Ownership can only be transferred, not removed.</li>
                <li>
                  After claiming, all other users are assigned their designated
                  roles (Stranger by default). Setup mode will end.
                </li>
              </ul>
              <p style={{ marginTop: "0.75rem", color: "var(--accent)", fontSize: "0.8rem" }}>
                As the SSU owner, claiming will also authorize the BazarAuth
                extension — required for the marketplace to function.
              </p>
            </div>

            {error && (
              <p className="form-error" style={{ color: "var(--danger)", fontSize: "0.8rem" }}>
                {error}
              </p>
            )}

            <div className="modal__actions">
              <button className="btn btn--ghost" onClick={onClose} disabled={isBusy}>
                Cancel
              </button>
              <button
                className="btn btn--danger"
                disabled={!canSubmit}
                onClick={handleClaim}
              >
                {loading ? "Claiming..." : "I understand, Claim Ownership"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
