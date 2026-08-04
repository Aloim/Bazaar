// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/components/ApplicationModal.tsx
// Modal for applying to a tribe with join_policy == 1 (application required).

import React, { useState, useRef } from "react";
import { dAppKit, useConnection, abbreviateAddress } from "@evefrontier/dapp-kit";
import type { TribeInfo } from "@bazaar/shared/hooks/useTribeRegistry";
import { buildApplyToTribe } from "@bazaar/shared/tx";
import { Z } from "@bazaar/shared/constants/zIndex";

const MAX_CHARS = 1000;

interface Props {
  tribe: TribeInfo;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ApplicationModal({ tribe, onClose, onSuccess }: Props) {
  const { walletAddress } = useConnection();
  const [ssuId, setSsuId] = useState("");
  const [applicationText, setApplicationText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose();
  }

  const ssuIdValid = /^0x[0-9a-fA-F]{1,64}$/.test(ssuId.trim());
  const charCount = new TextEncoder().encode(applicationText).length;
  const charCountValid = charCount <= MAX_CHARS;
  const canSubmit = ssuIdValid && charCountValid && !!walletAddress;

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const tx = buildApplyToTribe(
        ssuId.trim(),
        tribe.idx.toString(),
        applicationText,
      );
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setSubmitted(true);
      onSuccess?.();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={overlayStyle}
    >
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ fontFamily: "var(--font-display)", color: "var(--accent, #cc7000)", margin: 0 }}>
            Apply to Join {tribe.name}
          </h3>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">X</button>
        </div>

        {submitted ? (
          <div>
            <p style={{ color: "var(--success, #4caf50)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
              Application submitted. The tribe leader will review it and register your SSU if accepted.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
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

            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>
                Application Message
                <span style={{ float: "right", opacity: 0.7 }}>
                  {charCount}/{MAX_CHARS} bytes
                </span>
              </label>
              <textarea
                value={applicationText}
                onChange={e => setApplicationText(e.target.value)}
                placeholder="Tell the tribe leader why you'd like to join..."
                rows={5}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "var(--surface)",
                  border: `1px solid ${!charCountValid ? "var(--error, #f44)" : "var(--border)"}`,
                  borderRadius: 4,
                  color: "var(--text)",
                  padding: "0.5rem",
                  fontFamily: "var(--font)",
                  fontSize: "0.82rem",
                  resize: "vertical",
                }}
              />
              {!charCountValid && (
                <p style={{ color: "var(--error, #f44)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                  Application text exceeds 1000 bytes.
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
                onClick={handleSubmit}
                disabled={!canSubmit || loading}
              >
                {loading ? "Submitting..." : "Send Application"}
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
  maxWidth: 460,
  width: "90%",
  maxHeight: "85vh",
  overflowY: "auto",
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
