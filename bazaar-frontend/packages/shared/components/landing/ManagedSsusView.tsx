// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/LandingScreen.tsx (lines 1018-1117; split for 500-line guard, section: ManagedSsusView).
// Re-imported into ./Portal.tsx.

import { useTribeRegistry } from "@bazaar/shared/hooks";

interface ManagedSsusViewProps {
  leaderCapId:    string | null;
  leaderTribeIdx: number | null;
  onBack:         () => void;
}

export default function ManagedSsusView({ leaderCapId, leaderTribeIdx, onBack }: ManagedSsusViewProps) {
  const { tribes, loading } = useTribeRegistry();

  const myTribe = leaderTribeIdx !== null
    ? tribes.find(t => t.idx === leaderTribeIdx)
    : undefined;

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => { /* ignore */ });
  }

  const origin = window.location.origin + window.location.pathname;

  return (
    <div className="panel" style={{ maxWidth: 560, background: "var(--surface)" }}>
      <div className="panel__header">
        <button className="btn btn--ghost btn--sm" onClick={onBack}>Back</button>
        <h2>My Registered SSUs</h2>
        {loading && <span className="muted" style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>Loading...</span>}
      </div>
      <div className="panel__section">
        {!leaderCapId && <p className="muted">No TribeLeaderCap detected. Connect a wallet that owns a tribe.</p>}
        {leaderCapId && leaderTribeIdx === null && <p className="muted">Reading tribe index...</p>}
        {myTribe && (
          <div>
            <p style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
              Tribe: <strong style={{ color: "var(--accent, #cc7000)" }}>{myTribe.name}</strong>
              &nbsp;({myTribe.ssuIds.length} SSU{myTribe.ssuIds.length !== 1 ? "s" : ""})
            </p>
            {myTribe.ssuIds.length === 0 ? (
              <p className="muted">No SSUs registered to this tribe yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {myTribe.ssuIds.map(ssu => {
                  const bazaarLink = `${origin}?ssuId=${ssu}`;
                  return (
                    <div key={ssu} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "0.6rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                      <span style={{ fontSize: "0.8rem", fontFamily: "monospace", wordBreak: "break-all" }}>{ssu}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <a href={bazaarLink} style={{ fontSize: "0.75rem", color: "var(--accent, #cc7000)", flex: 1, wordBreak: "break-all" }}>{bazaarLink}</a>
                        <button className="btn btn--ghost btn--sm" onClick={() => copyToClipboard(bazaarLink)} style={{ whiteSpace: "nowrap", fontSize: "0.72rem" }}>Copy</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {leaderCapId && leaderTribeIdx !== null && !myTribe && !loading && (
          <p className="muted">Tribe #{leaderTribeIdx} not found in registry. The registry may still be loading.</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
