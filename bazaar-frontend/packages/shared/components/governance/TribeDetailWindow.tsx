// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/components/TribeDetailWindow.tsx
// Floating modal showing tribe details. Opened when a tribe card in TribeBrowserPanel is clicked.
// Renders a "Join" button (policy 0) or "Apply to Join" button (policy 1).

import React, { useEffect, useRef } from "react";
import type { TribeInfo } from "@bazaar/shared/hooks/useTribeRegistry";
import { abbreviateAddress } from "@evefrontier/dapp-kit";
import { useCharacterNames } from "@bazaar/shared/hooks/useCharacterNames";
import { useTribeAssets } from "@bazaar/shared/hooks/useTribeAssets";
import { useTribeTokenLedger } from "@bazaar/shared/hooks/bazaareconomy/ledger-hooks";
import { Z } from "@bazaar/shared/constants/zIndex";

interface Props {
  tribe: TribeInfo;
  onClose: () => void;
  onJoin: (tribe: TribeInfo) => void;
  onApply: (tribe: TribeInfo) => void;
}

export default function TribeDetailWindow({ tribe, onClose, onJoin, onApply }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const names = useCharacterNames([tribe.leader]);
  const leaderName = names.get(tribe.leader) ?? abbreviateAddress(tribe.leader);

  const tribeAssets = useTribeAssets(tribe.idx);
  const isAdvanced = tribe.bazaarType === 2;
  const { data: ledger } = useTribeTokenLedger(isAdvanced ? tribeAssets.tokenLedgerId : null);
  const tokenSymbol = ledger?.tokenSymbol ?? "—";
  const tokenName   = ledger?.tokenName   ?? "—";
  const hasExchange = isAdvanced && !!tribeAssets.exchangeConfigId;

  // Click-outside-to-close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose();
  }

  const createdDate = tribe.createdAtMs > 0
    ? new Date(tribe.createdAtMs).toLocaleDateString()
    : "Unknown";

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: Z.MODAL_2,
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          padding: "1.5rem",
          maxWidth: 480,
          width: "90%",
          maxHeight: "80vh",
          overflowY: "auto",
          position: "relative",
        }}
      >
        {/* Header */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "0.75rem",
            right: "0.75rem",
            background: "none",
            border: "none",
            color: "var(--text-muted, #888)",
            fontSize: "1.1rem",
            cursor: "pointer",
            padding: "0.25rem 0.5rem",
          }}
          aria-label="Close"
        >
          X
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.25rem" }}>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.4rem",
            color: "var(--accent, #cc7000)",
            letterSpacing: "0.06em",
            margin: 0,
          }}>
            {tribe.name}
          </h2>
          {hasExchange ? (
            <span style={tickerBadgeStyle}>{tokenSymbol}</span>
          ) : (
            <span style={eveBadgeStyle}>EVE-Only</span>
          )}
        </div>

        {tribe.description && (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted, #aaa)", marginBottom: "1rem", lineHeight: 1.5 }}>
            {tribe.description}
          </p>
        )}

        {/* Stats grid */}
        <div style={statsGridStyle}>
          <StatRow label="Leader" value={leaderName} mono />
          <StatRow label="Members" value={String(tribe.memberCount)} />
          <StatRow label="SSUs" value={String(tribe.ssuIds.length)} />
          <StatRow label="Created" value={createdDate} />
          <StatRow
            label="Currency"
            value={hasExchange ? `${tokenName} (${tokenSymbol})` : "EVE (EVE-Only)"}
          />
          <StatRow
            label="Join Policy"
            value={tribe.joinPolicy === 0 ? "Open (anyone can join)" : "Application Required"}
          />
        </div>

        {/* Registered SSUs */}
        {tribe.ssuIds.length > 0 && (
          <div style={{ marginBottom: "1rem" }}>
            <p className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.4rem" }}>
              Registered SSUs ({tribe.ssuIds.length})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {tribe.ssuIds.slice(0, 5).map(ssu => (
                <a
                  key={ssu}
                  href={`?ssuId=${ssu}`}
                  style={{
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    color: "var(--accent, #cc7000)",
                    textDecoration: "none",
                    opacity: 0.85,
                  }}
                >
                  {abbreviateAddress(ssu)}
                </a>
              ))}
              {tribe.ssuIds.length > 5 && (
                <span className="muted" style={{ fontSize: "0.75rem" }}>
                  ...and {tribe.ssuIds.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
          {tribe.joinPolicy === 0 ? (
            <button className="btn btn--primary btn--sm" onClick={() => onJoin(tribe)}>
              Join Tribe
            </button>
          ) : (
            <button className="btn btn--primary btn--sm" onClick={() => onApply(tribe)}>
              Request to Join
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
      <span className="muted" style={{ fontSize: "0.7rem" }}>{label}</span>
      <span style={{ fontSize: "0.82rem", fontFamily: mono ? "monospace" : undefined }}>{value}</span>
    </div>
  );
}

const statsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.75rem 1.5rem",
  marginBottom: "1rem",
  padding: "0.75rem",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 6,
};

const tickerBadgeStyle: React.CSSProperties = {
  background: "rgba(204, 112, 0, 0.15)",
  border: "1px solid rgba(204, 112, 0, 0.4)",
  color: "var(--accent, #cc7000)",
  borderRadius: 3,
  padding: "0.1rem 0.4rem",
  fontSize: "0.7rem",
  fontFamily: "monospace",
  letterSpacing: "0.08em",
};

const eveBadgeStyle: React.CSSProperties = {
  background: "rgba(100, 180, 255, 0.1)",
  border: "1px solid rgba(100, 180, 255, 0.3)",
  color: "rgba(100, 180, 255, 0.8)",
  borderRadius: 3,
  padding: "0.1rem 0.4rem",
  fontSize: "0.7rem",
  letterSpacing: "0.06em",
};

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
