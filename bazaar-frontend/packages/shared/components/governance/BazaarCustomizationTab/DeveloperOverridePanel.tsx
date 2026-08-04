// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * DeveloperOverridePanel — Client-local Godot URL override editor.
 *
 * Writes per-SSU developer override URLs to localStorage via dev-override-store.
 * NO chain writes. NO tribe-level override (AP2-E resolver operates at SSU granularity).
 *
 * Cap check is UX-only per Article VII. A user who bypasses the tab via devtools
 * can write to localStorage but cannot affect any other player's experience.
 * The red warning banner communicates this boundary explicitly.
 *
 * Phase: AP2-D / FP1-29
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState } from "react";
import {
  getOverrides,
  setOverride,
  removeOverride,
  clearAll,
  type DevOverrideMap,
} from "@bazaar/shared/storage/dev-override-store";
import { validateGodotUrlForStorage } from "@bazaar/shared/godot/url-config";

// ── Props ─────────────────────────────────────────────────────────────────────

interface DeveloperOverridePanelProps {
  /** Pre-fill SSU ID if the parent knows it (scope="ssu") — otherwise empty. */
  defaultSsuId?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DeveloperOverridePanel({ defaultSsuId = "" }: DeveloperOverridePanelProps) {
  const [overrides, setOverrides]     = useState<DevOverrideMap>(() => getOverrides());
  const [ssuInput, setSsuInput]       = useState(defaultSsuId);
  const [urlInput, setUrlInput]       = useState("");
  const [addError, setAddError]       = useState<string | null>(null);
  const [storageFail, setStorageFail] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  const overrideEntries = Object.entries(overrides).sort(
    ([, a], [, b]) => b.addedAt - a.addedAt,
  );

  const urlValidation = urlInput.trim()
    ? validateGodotUrlForStorage(urlInput)
    : { ok: false, reason: "URL cannot be empty" };

  function refresh() {
    setOverrides(getOverrides());
  }

  function handleAdd() {
    const ssu = ssuInput.trim();
    const url = urlInput.trim();
    setAddError(null);

    if (!ssu) { setAddError("SSU ID is required."); return; }
    if (ssu in overrides) { setAddError("Override already exists — remove it first."); return; }
    if (!urlValidation.ok) { setAddError(urlValidation.reason ?? "Invalid URL."); return; }

    const ok = setOverride(ssu, url);
    if (!ok) {
      setStorageFail(true);
      return;
    }
    setUrlInput("");
    if (!defaultSsuId) setSsuInput("");
    refresh();
  }

  function handleRemove(ssuId: string) {
    const ok = removeOverride(ssuId);
    if (!ok) { setStorageFail(true); return; }
    refresh();
  }

  function handleClearAll() {
    const ok = clearAll();
    if (!ok) { setStorageFail(true); return; }
    setClearConfirm(false);
    refresh();
  }

  return (
    <div>
      <div className="action-card action-card--danger" style={{ marginBottom: "1rem" }}>
        <strong>Developer overrides only affect this browser.</strong>
        {" "}Use for testing custom Godot builds. Does not change what other players see.
        <br />
        <span className="muted" style={{ fontSize: "0.78rem" }}>
          Cap check is UX-only. Developer overrides are always client-local.
          To test for multiple SSUs, add one entry per SSU.
        </span>
      </div>

      {storageFail && (
        <div className="action-card action-card--danger" style={{ marginBottom: "1rem" }}>
          Could not persist override. Your browser may be in private mode or out of storage.
        </div>
      )}

      <div className="panel__section" style={{ padding: "0.75rem 0" }}>
        <h4 style={{ marginBottom: "0.5rem" }}>Add Override</h4>
        <div className="panel__field">
          <label style={{ fontSize: "0.82rem" }}>SSU Object ID</label>
          <input
            type="text"
            className="input"
            placeholder="0x..."
            value={ssuInput}
            onChange={(e) => setSsuInput(e.target.value)}
          />
        </div>
        <div className="panel__field">
          <label style={{ fontSize: "0.82rem" }}>Developer Godot URL</label>
          <input
            type="text"
            className="input"
            placeholder="https://localhost:8000/godot/"
            value={urlInput}
            onChange={(e) => { setUrlInput(e.target.value); setAddError(null); }}
          />
          {urlInput.trim() && (
            <p style={{
              fontSize: "0.78rem",
              marginTop: "0.25rem",
              color: !urlValidation.ok ? "var(--danger)" : urlValidation.reason ? "var(--accent2)" : "var(--success)",
            }}>
              {urlValidation.reason ?? (urlValidation.ok ? "URL OK" : "")}
            </p>
          )}
        </div>
        {addError && (
          <p style={{ color: "var(--danger)", fontSize: "0.82rem", marginBottom: "0.5rem" }}>{addError}</p>
        )}
        <button
          className="btn btn--primary"
          onClick={handleAdd}
          disabled={!ssuInput.trim() || !urlValidation.ok}
          style={{ marginTop: "0.25rem" }}
        >
          Add Override
        </button>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <h4 style={{ marginBottom: "0.5rem" }}>
          Active Overrides ({overrideEntries.length})
        </h4>
        {overrideEntries.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.82rem" }}>
            No local overrides. Add one above to test a custom Godot build for a specific SSU.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", paddingBottom: "0.25rem", color: "var(--muted)" }}>SSU ID</th>
                <th style={{ textAlign: "left", paddingBottom: "0.25rem", color: "var(--muted)" }}>Dev URL</th>
                <th style={{ textAlign: "left", paddingBottom: "0.25rem", color: "var(--muted)" }}>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {overrideEntries.map(([ssuId, entry]) => (
                <tr key={ssuId} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.25rem 0.5rem 0.25rem 0", fontFamily: "var(--font)" }}>
                    {ssuId.slice(0, 10)}...
                  </td>
                  <td style={{ padding: "0.25rem 0.5rem", wordBreak: "break-all", maxWidth: "240px" }}>
                    {entry.devUrl}
                  </td>
                  <td style={{ padding: "0.25rem 0.5rem", whiteSpace: "nowrap", color: "var(--muted)" }}>
                    {new Date(entry.addedAt).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: "0.25rem 0" }}>
                    <button
                      className="btn btn--danger btn--sm"
                      onClick={() => handleRemove(ssuId)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {overrideEntries.length > 0 && !clearConfirm && (
        <button
          className="btn btn--danger"
          style={{ marginTop: "1rem" }}
          onClick={() => setClearConfirm(true)}
        >
          Clear All Overrides
        </button>
      )}

      {clearConfirm && (
        <div className="action-card action-card--danger" style={{ marginTop: "1rem" }}>
          <p style={{ marginBottom: "0.5rem" }}>
            Remove all {overrideEntries.length} override{overrideEntries.length !== 1 ? "s" : ""}?
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn--danger btn--sm" onClick={handleClearAll}>Confirm</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setClearConfirm(false)}>Cancel</button>
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
