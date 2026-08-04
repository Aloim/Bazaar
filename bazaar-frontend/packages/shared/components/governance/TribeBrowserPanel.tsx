// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/components/TribeBrowserPanel.tsx
// Displays all registered tribes from useTribeRegistry.
// Allows filtering by name. "Visit" button navigates to ?ssuId=X for the tribe's first SSU.

import React, { useState, useMemo } from "react";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import type { TribeInfo } from "@bazaar/shared/hooks/useTribeRegistry";
import { abbreviateAddress } from "@evefrontier/dapp-kit";
import TribeDetailWindow from "@bazaar/shared/components/governance/TribeDetailWindow";
import JoinTribeModal from "@bazaar/shared/components/widgets/JoinTribeModal";
import ApplicationModal from "@bazaar/shared/components/widgets/ApplicationModal";

interface Props {
  onBack: () => void;
}

export default function TribeBrowserPanel({ onBack }: Props) {
  const { tribes, loading, refetch } = useTribeRegistry();
  const [search, setSearch] = useState("");
  const [selectedTribe, setSelectedTribe] = useState<TribeInfo | null>(null);
  const [joinTribe, setJoinTribe] = useState<TribeInfo | null>(null);
  const [applyTribe, setApplyTribe] = useState<TribeInfo | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tribes;
    return tribes.filter(t => t.name.toLowerCase().includes(q));
  }, [tribes, search]);

  function handleVisit(tribe: TribeInfo) {
    const firstSsu = tribe.ssuIds[0];
    if (!firstSsu) return;
    const url = new URL(window.location.href);
    url.searchParams.set("ssuId", firstSsu);
    url.searchParams.delete("view");
    window.location.href = url.toString();
  }

  return (
    <div className="panel" style={{ maxWidth: 720, background: "var(--surface)" }}>
      <div className="panel__header">
        <button className="btn btn--ghost btn--sm" onClick={onBack}>Back</button>
        <h2>Browse Tribes</h2>
        {loading && <span className="muted" style={{ fontSize: "0.75rem" }}>Loading...</span>}
        <button
          className="btn btn--ghost btn--sm"
          onClick={refetch}
          style={{ marginLeft: "auto" }}
        >
          Refresh
        </button>
      </div>

      <div className="panel__section" style={{ paddingBottom: 0 }}>
        <input
          className="input"
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tribes by name..."
          style={{ width: "100%", boxSizing: "border-box" }}
        />
      </div>

      <div className="panel__section">
        {!loading && filtered.length === 0 && (
          <p className="muted" style={{ textAlign: "center", padding: "2rem 0" }}>
            {tribes.length === 0
              ? "No tribes registered yet. Be the first!"
              : "No tribes match your search."}
          </p>
        )}

        {filtered.map(tribe => (
          <TribeCard
            key={tribe.idx}
            tribe={tribe}
            onVisit={handleVisit}
            onSelect={setSelectedTribe}
          />
        ))}

        {/* Tribe detail overlay */}
        {selectedTribe && !joinTribe && !applyTribe && (
          <TribeDetailWindow
            tribe={selectedTribe}
            onClose={() => setSelectedTribe(null)}
            onJoin={t => { setSelectedTribe(null); setJoinTribe(t); }}
            onApply={t => { setSelectedTribe(null); setApplyTribe(t); }}
          />
        )}
        {joinTribe && (
          <JoinTribeModal
            tribe={joinTribe}
            onClose={() => setJoinTribe(null)}
            onSuccess={() => { setJoinTribe(null); refetch(); }}
          />
        )}
        {applyTribe && (
          <ApplicationModal
            tribe={applyTribe}
            onClose={() => setApplyTribe(null)}
            onSuccess={() => setApplyTribe(null)}
          />
        )}
      </div>
    </div>
  );
}

// ── TribeCard ─────────────────────────────────────────────────────────────────

interface TribeCardProps {
  tribe: TribeInfo;
  onVisit: (tribe: TribeInfo) => void;
  onSelect: (tribe: TribeInfo) => void;
}

function TribeCard({ tribe, onVisit, onSelect }: TribeCardProps) {
  const isAdvanced = tribe.bazaarType === 2;
  const firstSsu = tribe.ssuIds[0] ?? null;

  return (
    <div
      style={{ ...cardStyle, cursor: "pointer" }}
      onClick={() => onSelect(tribe)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onSelect(tribe)}
      aria-label={`View details for ${tribe.name}`}
    >
      <div style={cardHeaderStyle}>
        <div style={tribeNameStyle}>{tribe.name}</div>
        {isAdvanced ? (
          <span style={tickerBadgeStyle}>Advanced</span>
        ) : (
          <span style={eveBadgeStyle}>Easy</span>
        )}
      </div>

      <div style={cardBodyStyle}>
        <div style={statRowStyle}>
          <span className="muted" style={{ fontSize: "0.75rem" }}>Currency</span>
          <span style={{ fontSize: "0.8rem" }}>
            {isAdvanced ? "Custom Token (Advanced)" : "EVE (EVE-Only)"}
          </span>
        </div>
        <div style={statRowStyle}>
          <span className="muted" style={{ fontSize: "0.75rem" }}>SSUs</span>
          <span style={{ fontSize: "0.8rem" }}>{tribe.ssuIds.length}</span>
        </div>
        <div style={statRowStyle}>
          <span className="muted" style={{ fontSize: "0.75rem" }}>Leader</span>
          <span style={{ fontSize: "0.8rem", fontFamily: "monospace" }}>
            {abbreviateAddress(tribe.leader)}
          </span>
        </div>
      </div>

      <div style={cardFooterStyle}>
        <button
          className="btn btn--ghost btn--sm"
          onClick={e => { e.stopPropagation(); onVisit(tribe); }}
          disabled={!firstSsu}
          title={firstSsu ? `Navigate to SSU ${firstSsu}` : "No SSUs registered to this tribe"}
        >
          {firstSsu ? "Visit Tribe" : "No SSUs"}
        </button>
      </div>
    </div>
  );
}

// ── Inline style constants ─────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6,
  padding: "0.9rem 1rem",
  marginBottom: "0.75rem",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  marginBottom: "0.5rem",
};

const tribeNameStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1rem",
  color: "var(--accent, #cc7000)",
  letterSpacing: "0.05em",
  flex: 1,
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

const cardBodyStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem 2rem",
  marginBottom: "0.75rem",
};

const statRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.1rem",
};

const cardFooterStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
