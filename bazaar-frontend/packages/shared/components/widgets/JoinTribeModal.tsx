// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/components/JoinTribeModal.tsx
// Modal for joining an open-policy tribe (join_policy == 0).
// Chains: buildApplyToTribe + maybeRegisterStranger in a single PTB.
// NOTE (OS-25b limitation): maybeRegisterStranger is appended AFTER buildApplyToTribe,
// so register_stranger runs after apply_to_tribe in the PTB. An unregistered user's
// apply_to_tribe call may abort before register_stranger executes. Full atomic fix
// requires a combined Move entry fn — deferred as OS-25b post-R8.

import React, { useState, useRef } from "react";
import { dAppKit, useConnection, abbreviateAddress } from "@evefrontier/dapp-kit";
import type { TribeInfo } from "@bazaar/shared/hooks/useTribeRegistry";
import { buildApplyToTribe, maybeRegisterStranger } from "@bazaar/shared/tx";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { Z } from "@bazaar/shared/constants/zIndex";

interface Props {
  tribe: TribeInfo;
  onClose: () => void;
  onSuccess?: () => void;
  /** Whether the connected wallet is already registered in MemberRegistry */
  isRegistered?: boolean;
}

export default function JoinTribeModal({ tribe, onClose, onSuccess, isRegistered }: Props) {
  const { walletAddress } = useConnection();
  const [ssuId, setSsuId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { data: shared } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const ssuGovId = shared?.ssuGovId;
  const overlayRef = useRef<HTMLDivElement>(null);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose();
  }

  const ssuIdValid = /^0x[0-9a-fA-F]{1,64}$/.test(ssuId.trim());

  async function handleJoin() {
    if (!ssuIdValid || !walletAddress) return;
    if (!ssuGovId) {
      setError("SSU governance is still resolving — please wait before joining.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const tx = buildApplyToTribe({ tribeId: tribe.idx.toString(), ssuId: SSU_OBJECT_ID, message: "" });
      maybeRegisterStranger(tx, isRegistered, ssuGovId ?? "", shared?.memberRegistryId ?? "");
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setSuccess(true);
      onSuccess?.();
    } catch (e: any) {
      setError(e?.message ?? "Apply failed.");
    } finally {
      setLoading(false);
    }
  }

  const bazaarLink = `${window.location.origin}${window.location.pathname}?ssuId=${ssuId.trim()}`;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={overlayStyle}
    >
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ fontFamily: "var(--font-display)", color: "var(--accent, #cc7000)", margin: 0 }}>
            Join {tribe.name}
          </h3>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">X</button>
        </div>

        {success ? (
          <div>
            <p style={{ color: "var(--success, #4caf50)", marginBottom: "0.75rem" }}>
              Successfully joined {tribe.name}! Your SSU is now registered to this tribe.
            </p>
            {ssuId.trim() && (
              <div>
                <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.3rem" }}>Bazaar link for your SSU:</p>
                <a
                  href={bazaarLink}
                  style={{ fontSize: "0.8rem", color: "var(--accent, #cc7000)", wordBreak: "break-all" }}
                >
                  {bazaarLink}
                </a>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button className="btn btn--primary btn--sm" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>Wallet Address</label>
              <input
                className="input"
                value={walletAddress ? abbreviateAddress(walletAddress) : "Not connected"}
                readOnly
                style={{ width: "100%", boxSizing: "border-box", opacity: 0.7, cursor: "not-allowed" }}
              />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>Your SSU ID (0x...)</label>
              <input
                className="input"
                type="text"
                value={ssuId}
                onChange={e => setSsuId(e.target.value)}
                placeholder="0x..."
                style={{ width: "100%", boxSizing: "border-box" }}
              />
              {ssuId && !ssuIdValid && (
                <p style={{ color: "var(--error, #f44)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                  Invalid SSU address format.
                </p>
              )}
            </div>

            {error && (
              <p style={{ color: "var(--error, #f44)", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button className="btn btn--ghost btn--sm" onClick={onClose} disabled={loading}>Cancel</button>
              <button
                className="btn btn--primary btn--sm"
                onClick={handleJoin}
                disabled={!ssuIdValid || !walletAddress || loading}
              >
                {loading ? "Joining..." : "Join Tribe"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: Z.MODAL_3,
};

const modalStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  padding: "1.5rem",
  maxWidth: 420,
  width: "90%",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  color: "var(--text-muted, #999)",
  marginBottom: "0.3rem",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-muted, #888)",
  fontSize: "1rem",
  cursor: "pointer",
  padding: "0.2rem 0.4rem",
};

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
