// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ProductionHostPanel — On-chain Godot URL setter.
 *
 * Reads current on-chain godot_url via useSSUGodotUrl / useTribeGodotUrl.
 * Writes via buildSetSSU/TribeGodotUrl TX builder on Save.
 * Clears via buildClearSSU/TribeGodotUrl TX builder on Reset.
 *
 * capId=null → read-only mode (SuperAdmin-only holder; Owner required for TX).
 * Validation via validateGodotUrlForStorage (shared, matches on-chain 256-byte cap).
 * Event log deferred to AP2-E (FP1-30).
 *
 * Phase: AP2-D / FP1-29
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState, useEffect } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import {
  useSSUGodotUrl,
  useTribeGodotUrl,
} from "@bazaar/shared/hooks/bazaarcore/godot-url-hooks";
import {
  buildSetSSUGodotUrl,
  buildClearSSUGodotUrl,
} from "@bazaar/shared/tx/bazaarcore/ssu-governance-tx";
import {
  buildSetTribeGodotUrl,
  buildClearTribeGodotUrl,
} from "@bazaar/shared/tx/bazaarcore/tribe-governance-tx";
import { validateGodotUrlForStorage } from "@bazaar/shared/godot/url-config";
import type { CustomizationScope } from "../BazaarCustomizationTab";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProductionHostPanelProps {
  scope: CustomizationScope;
  govId: string;
  capId: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductionHostPanel({ scope, govId, capId }: ProductionHostPanelProps) {
  const ssuResult  = useSSUGodotUrl(scope === "ssu" ? govId : null);
  const tribeResult = useTribeGodotUrl(scope === "tribe" ? govId : null);
  const { url: currentUrl, isLoading, refetch } = scope === "ssu" ? ssuResult : tribeResult;

  const [useCustom, setUseCustom]   = useState(false);
  const [draftUrl, setDraftUrl]     = useState("");
  const [txStatus, setTxStatus]     = useState<string | null>(null);
  const [txError, setTxError]       = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy]             = useState(false);

  // Sync checkbox to current on-chain state after load
  useEffect(() => {
    if (!isLoading) {
      setUseCustom(currentUrl !== null);
      setDraftUrl(currentUrl ?? "");
    }
  }, [isLoading, currentUrl]);

  const validation = draftUrl.trim() ? validateGodotUrlForStorage(draftUrl) : { ok: false, reason: "URL cannot be empty" };

  const validationColor =
    !validation.ok ? "var(--danger)"
    : validation.reason ? "var(--accent2)"
    : "var(--success)";

  const canSave =
    useCustom &&
    validation.ok &&
    draftUrl.trim() !== (currentUrl ?? "") &&
    capId !== null &&
    !isLoading &&
    !busy;

  const canClear = currentUrl !== null && capId !== null && !isLoading && !busy;

  async function handleSave() {
    if (!canSave || !capId) return;
    setBusy(true);
    setTxStatus(null);
    setTxError(null);
    const tx = scope === "ssu"
      ? buildSetSSUGodotUrl({ ssuGovId: govId, ownerCapId: capId, url: draftUrl.trim() })
      : buildSetTribeGodotUrl({ tribeGovId: govId, leaderCapId: capId, url: draftUrl.trim() });
    try {
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setTxStatus("URL updated on-chain.");
      refetch();
    } catch (e: unknown) {
      setTxError((e as Error)?.message ?? "Transaction failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleClear() {
    if (!canClear || !capId) return;
    setConfirming(true);
  }

  async function confirmClear() {
    if (!capId) return;
    setConfirming(false);
    setBusy(true);
    setTxStatus(null);
    setTxError(null);
    const tx = scope === "ssu"
      ? buildClearSSUGodotUrl({ ssuGovId: govId, ownerCapId: capId })
      : buildClearTribeGodotUrl({ tribeGovId: govId, leaderCapId: capId });
    try {
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setTxStatus("Custom URL cleared. Platform default will be used.");
      setUseCustom(false);
      setDraftUrl("");
      refetch();
    } catch (e: unknown) {
      setTxError((e as Error)?.message ?? "Transaction failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3>Production Host</h3>
      <p className="muted" style={{ marginBottom: "1rem", fontSize: "0.82rem" }}>
        This URL is served to every player who visits this bazaar. Changes are on-chain
        and emit a GodotUrlChangedEvent.
      </p>

      {capId === null && (
        <div className="action-card action-card--warn" style={{ marginBottom: "1rem" }}>
          Owner cap required to change host URL. You can view the current setting but not modify it.
        </div>
      )}

      <div className="panel__field">
        <label style={{ fontSize: "0.82rem", color: "var(--muted)" }}>Current on-chain URL</label>
        {isLoading ? (
          <p className="muted" style={{ fontSize: "0.82rem" }}>Loading...</p>
        ) : currentUrl ? (
          <code style={{ wordBreak: "break-all", fontSize: "0.8rem" }}>{currentUrl}</code>
        ) : (
          <span className="muted" style={{ fontSize: "0.82rem" }}>— (not set; using platform default)</span>
        )}
      </div>

      <label className="filter-check" style={{ margin: "0.75rem 0" }}>
        <input
          type="checkbox"
          checked={useCustom}
          disabled={capId === null || isLoading}
          onChange={(e) => {
            setUseCustom(e.target.checked);
            if (!e.target.checked) setDraftUrl("");
          }}
        />
        <span>Use custom Godot host URL</span>
      </label>

      {useCustom && (
        <div className="panel__field">
          <input
            type="text"
            className="input"
            placeholder="https://..."
            maxLength={256}
            value={draftUrl}
            disabled={capId === null || isLoading || busy}
            onChange={(e) => setDraftUrl(e.target.value)}
          />
          {draftUrl.trim() && (
            <p style={{ fontSize: "0.78rem", color: validationColor, marginTop: "0.25rem" }}>
              {validation.reason ?? (validation.ok ? "URL OK" : "")}
            </p>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <button className="btn btn--primary" onClick={handleSave} disabled={!canSave}>
          {busy ? "Saving..." : "Save"}
        </button>
        <button className="btn btn--outline" onClick={handleClear} disabled={!canClear}>
          Reset to Default
        </button>
      </div>

      {txStatus && (
        <p style={{ color: "var(--success)", fontSize: "0.82rem", marginTop: "0.5rem" }}>{txStatus}</p>
      )}
      {txError && (
        <p style={{ color: "var(--danger)", fontSize: "0.82rem", marginTop: "0.5rem" }}>{txError}</p>
      )}

      {confirming && (
        <div className="action-card action-card--danger" style={{ marginTop: "1rem" }}>
          <p style={{ marginBottom: "0.5rem" }}>
            Clear custom URL? Players will fall back to the platform default.
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn--danger btn--sm" onClick={confirmClear}>Confirm Clear</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}

      <p className="muted" style={{ fontSize: "0.78rem", marginTop: "1.5rem" }}>
        Event log available after AP2-E ships.
      </p>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
