// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/WidgetMenuTab.tsx (lines 297-504; split for 500-line guard, section: WidgetMenuTab main toggle UI + state).
// Sub-components in ./widget-config-form.tsx.
// OS-59-tribe-widgets: retargeted to buildToggleTribeWidget; useTribeWidgetConfigId resolver added.

import { useState, useEffect } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useWidgetConfig } from "@bazaar/shared/hooks";
import { buildToggleTribeWidget } from "@bazaar/shared/tx/bazaarcore/widget-governance-tribe-tx";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { useTribeWidgetConfigId } from "@bazaar/shared/hooks/bazaarcore/useTribeWidgetConfigId";
import { normalizeRelayUrl } from "@bazaar/shared/hooks/useMultiplayerRelay";
import { InitiationProtocolToggle } from "./widget-config-form";

const WIDGET_LABELS = ["Announcements", "Guestbook", "Donate", "Multiplayer"];
const LS_RELAY_KEY = "multiplayerServerUrl";

export default function WidgetMenuTab() {
  // Resolve tribe leader cap + tribe governance ID
  const { leaderTribeIdx, leaderCapId } = useTribeCaps();
  const { tribes } = useTribeRegistry();
  const tribe = leaderTribeIdx !== null
    ? tribes.find(t => t.idx === leaderTribeIdx)
    : undefined;
  const tribeGovId = tribe?.tribeGovId ?? null;

  // Hooks called unconditionally — Rules of Hooks compliance.
  // useTribeWidgetConfigId handles null tribeGovId by disabling the query (enabled: !!tribeGovId).
  const { data: tribeWidgetConfigId, isLoading: wcidLoading } =
    useTribeWidgetConfigId(tribeGovId);
  const { enabledWidgets, loading, refetch } =
    useWidgetConfig(tribeWidgetConfigId ?? undefined);

  const [toggling, setToggling] = useState<number | null>(null);
  const [showMultiplayerWarning, setShowMultiplayerWarning] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState("");
  const [urlDirty, setUrlDirty]             = useState(false);
  const [urlSaved, setUrlSaved]             = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(LS_RELAY_KEY) ?? "";
    setServerUrlInput(stored);
    setUrlDirty(false);
  }, []);

  // CC-006: early-return AFTER all hooks — Rules of Hooks compliant.
  if (!leaderCapId) {
    return (
      <div className="panel__section">
        <p className="muted">No tribe leadership context — Widget Menu is unavailable.</p>
      </div>
    );
  }
  if (!tribeGovId) {
    return (
      <div className="panel__section">
        <p className="muted">
          Tribe economy not yet bootstrapped. Run <strong>Owner → Bootstrap Economy</strong> first.
        </p>
      </div>
    );
  }

  if (loading || wcidLoading) {
    return <div className="panel__section"><p className="muted">Loading widgets...</p></div>;
  }

  // State C: legacy v4 tribe has no widget_config_id set (option::none).
  // tribeGovId is guaranteed non-null here (early-return above).
  if (tribeWidgetConfigId === null) {
    return (
      <div className="panel__section">
        <h3>Widget Menu</h3>
        <div style={{ padding: "1rem", background: "rgba(255,165,0,0.08)", border: "1px solid rgba(255,165,0,0.25)", borderRadius: "6px", marginTop: "0.75rem" }}>
          <p style={{ color: "#cc7000", fontWeight: 600, marginBottom: "0.5rem" }}>
            Tribe widgets pending bootstrap
          </p>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            This tribe was created before widget governance was enabled (v4 to v5 upgrade).
            Contact your tribe administrator to run the bootstrap transaction that sets up
            the per-tribe widget configuration. No changes can be made until this is complete.
          </p>
        </div>
      </div>
    );
  }

  async function handleToggle(idx: number) {
    if (idx === 3 && !enabledWidgets[idx]) { setShowMultiplayerWarning(true); return; }
    if (!leaderCapId || !tribeWidgetConfigId) {
      alert("Tribe leadership cap or widget config not available. Ensure the tribe is fully bootstrapped.");
      return;
    }
    setToggling(idx);
    try {
      const tx = buildToggleTribeWidget({
        leaderCapId,
        tribeGovId,
        widgetConfigId: tribeWidgetConfigId,
        widgetIdx:      idx,
        enabled:        !enabledWidgets[idx],
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      refetch();
    } catch (e: any) { alert(e?.message); } finally { setToggling(null); }
  }

  function handleSaveServerUrl() {
    // Accept https:// / http:// / bare-host and convert to wss:// / ws:// so a pasted
    // PaaS URL (e.g. Render's https domain) just works. Reflect the normalized value back.
    const normalized = normalizeRelayUrl(serverUrlInput);
    localStorage.setItem(LS_RELAY_KEY, normalized);
    setServerUrlInput(normalized);
    setUrlDirty(false);
    setUrlSaved(true);
    setTimeout(() => setUrlSaved(false), 3000);
  }

  async function confirmMultiplayer() {
    setShowMultiplayerWarning(false);
    if (!leaderCapId || !tribeWidgetConfigId) {
      alert("Tribe leadership cap or widget config not available. Ensure the tribe is fully bootstrapped.");
      return;
    }
    setToggling(3);
    try {
      const tx = buildToggleTribeWidget({
        leaderCapId,
        tribeGovId,
        widgetConfigId: tribeWidgetConfigId,
        widgetIdx:      3,
        enabled:        true,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      refetch();
    } catch (e: any) { alert(e?.message); } finally { setToggling(null); }
  }

  const onChainWidgetLabels = WIDGET_LABELS.slice(0, 4);

  return (
    <div className="panel__section">
      <h3>Widget Menu</h3>
      <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "1rem" }}>Toggle which widgets appear on the landing page.</p>
      <div className="widget-toggle-list">
        {onChainWidgetLabels.map((label, idx) => (
          <div key={label} className="widget-toggle">
            <span className="widget-toggle__label">{label}</span>
            <button className={`widget-toggle__btn ${enabledWidgets[idx] ? "widget-toggle__btn--on" : "widget-toggle__btn--off"}`} disabled={toggling !== null} onClick={() => handleToggle(idx)}>
              {toggling === idx ? "..." : enabledWidgets[idx] ? "ON" : "OFF"}
            </button>
          </div>
        ))}
      </div>
      {enabledWidgets[3] && (
        <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(255,255,255,0.04)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <label style={{ display: "block", fontSize: "0.8rem", color: "#aaa", marginBottom: "0.4rem" }}>Multiplayer Server URL</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input type="text" value={serverUrlInput} onChange={e => { setServerUrlInput(e.target.value); setUrlDirty(e.target.value !== (localStorage.getItem(LS_RELAY_KEY) ?? "")); }}
              placeholder="wss://your-server.example.com"
              style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", color: "#fff", fontFamily: "var(--font)", fontSize: "0.8rem", padding: "5px 8px" }} />
            <button className="btn btn--primary btn--sm" disabled={!urlDirty} onClick={handleSaveServerUrl}>
              {urlSaved ? "Saved" : "Save"}
            </button>
          </div>
          <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.4rem" }}>
            Saved in <strong>this browser only</strong> (localStorage) — each player must set it in their
            own browser. An <code>https://</code> URL is auto-converted to <code>wss://</code> on save.
          </p>
        </div>
      )}
      <InitiationProtocolToggle />
      {showMultiplayerWarning && (
        <div className="multiplayer-warning-overlay">
          <div className="multiplayer-warning-panel">
            <h3 style={{ color: "var(--accent, #cc7000)", marginBottom: "12px" }}>Multiplayer Requires External Hosting</h3>
            <div style={{ fontSize: "0.85rem", color: "#ccc", lineHeight: 1.7 }}>
              <p style={{ marginBottom: "10px" }}>Multiplayer allows players to see each other moving in real-time. Unlike other features, <strong>it cannot run fully on-chain</strong> because real-time position updates require a WebSocket relay server.</p>
              <p style={{ marginBottom: "10px", fontWeight: 600, color: "var(--accent, #cc7000)" }}>To use multiplayer, the tribe admin must:</p>
              <ul style={{ paddingLeft: "1.2rem", marginBottom: "10px" }}>
                <li>Deploy a WebSocket relay server (a ~50-line Node.js app)</li>
                <li>Host it on a service like Railway, Fly.io, Render, or any VPS</li>
                <li>Paste the server URL into the <strong>Multiplayer Server URL</strong> field that appears after enabling</li>
                <li>Save locally in each browser — no frontend rebuild needed</li>
              </ul>
              <p style={{ marginBottom: "10px" }}>The relay server only broadcasts player positions — no blockchain keys, no wallet data, and no sensitive information passes through it.</p>
              <p className="muted" style={{ fontSize: "0.8rem" }}>Enabling this toggle without a relay server will have no visible effect.</p>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowMultiplayerWarning(false)}>Cancel</button>
              <button className="btn btn--primary btn--sm" onClick={confirmMultiplayer}>Continue Anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
