// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * WidgetsSubTab — OS-59 Commit 2 (Issue 5 SSU-side only).
 *
 * Renders 4 widget toggle controls for the SSUOwnerCap holder of a NoTribe SSU.
 * Each toggle fires `bazaar_core::widget_governance::toggle_ssu_widget` with the
 * desired post-state (not a flip) so the UI and on-chain state stay in sync even
 * on double-click races (the Move callee sets an explicit value, not XOR).
 *
 * Widget index mapping (0..3, matches SharedWidgets WIDGET_COUNT=4):
 *   0 = Announcements | 1 = Guestbook | 2 = Donate | 3 = Multiplayer
 *
 * Gate: NoTribe only (bazaarType === "NoTribe"). Parent SSUSuperAdminTab filters
 * the SUB_TABS entry; this component adds a defensive fallback for stale-URL access.
 *
 * Constitution Article XIV.4: file limit 500 lines.
 */

import React, { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useWidgetConfig } from "@bazaar/shared/hooks";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useBazaarType } from "@bazaar/shared/hooks";
import { buildToggleSSUWidget } from "@bazaar/shared/tx/bazaarcore/widget-governance-tx";

// ── Constants ─────────────────────────────────────────────────────────────────

const WIDGET_LABELS: string[] = [
  "Announcements",
  "Guestbook",
  "Donate",
  "Multiplayer",
];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WidgetsSubTabProps {
  ssuId: string;
  /** ownerCapId — null when connected wallet does not hold SSUOwnerCap. */
  ownerCapId: string | null;
  onRefetch: () => void;
}

// ── WidgetsSubTab ──────────────────────────────────────────────────────────────

export function WidgetsSubTab({ ssuId, ownerCapId, onRefetch }: WidgetsSubTabProps) {
  const [togglingIdx, setTogglingIdx] = useState<number | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // Resolve per-SSU shared object IDs (ssuGovId + widgetConfigId).
  const { data: sharedObjs, isLoading: objsLoading } = useSSUSharedObjects(ssuId);

  // Read current widget enabled states from chain.
  // Pass per-SSU widgetConfigId (extended hook signature; falls back to global WIDGET_CONFIG_ID
  // if widgetConfigId is undefined — safe during initial object load).
  const { enabledWidgets, loading: widgetsLoading, refetch: refetchWidgets } = useWidgetConfig(
    sharedObjs?.widgetConfigId ?? undefined,
  );

  // Defensive NoTribe gate. Parent SUB_TABS already hides this tab for Easy/Advanced;
  // this guard handles stale-URL / direct-mount cases.
  // useBazaarType returns { bazaarType: "NoTribe" | "Easy" | "Advanced" | null, isLoading }
  const { bazaarType, isLoading: typeLoading } = useBazaarType(ssuId);
  if (!typeLoading && bazaarType !== null && bazaarType !== "NoTribe") {
    return (
      <div className="panel__section">
        <p className="muted">Widgets are managed by Tribe Leader.</p>
      </div>
    );
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (objsLoading || widgetsLoading || typeLoading) {
    return (
      <div className="panel__section">
        <p className="muted" style={{ fontSize: "0.85rem" }}>Loading widget configuration...</p>
      </div>
    );
  }

  // ── Missing shared objects (SSU not bootstrapped) ──────────────────────────
  if (!sharedObjs) {
    return (
      <div className="panel__section">
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Widget configuration not available. This SSU may not have been bootstrapped yet.
        </p>
      </div>
    );
  }

  // ── Missing owner cap ──────────────────────────────────────────────────────
  if (!ownerCapId) {
    return (
      <div className="panel__section">
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          SSUOwnerCap required to manage widgets.
        </p>
      </div>
    );
  }

  // ── Toggle handler ─────────────────────────────────────────────────────────

  async function handleToggle(idx: number) {
    if (!ownerCapId || !sharedObjs) return;
    const desiredState = !enabledWidgets[idx];
    setTogglingIdx(idx);
    setTxError(null);
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildToggleSSUWidget({
          ownerCapId,
          ssuGovId:      sharedObjs.ssuGovId,
          widgetConfigId: sharedObjs.widgetConfigId,
          widgetIdx:     idx,
          enabled:       desiredState,
        }),
      });
      refetchWidgets();
      onRefetch();
    } catch (e: unknown) {
      setTxError((e as Error)?.message ?? "Transaction failed");
    } finally {
      setTogglingIdx(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="panel__section">
      <h3 style={{ marginBottom: "0.25rem" }}>Widget Configuration</h3>
      <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "1rem" }}>
        Toggle which widgets are available at this SSU landing page.
      </p>

      <div className="widget-toggle-list">
        {WIDGET_LABELS.map((label, idx) => {
          const isOn      = enabledWidgets[idx] === true;
          const isBusy    = togglingIdx !== null;
          const isThisOne = togglingIdx === idx;
          return (
            <div key={label} className="widget-toggle">
              <span className="widget-toggle__label">{label}</span>
              <button
                className={`widget-toggle__btn ${
                  isOn ? "widget-toggle__btn--on" : "widget-toggle__btn--off"
                }`}
                disabled={isBusy}
                onClick={() => handleToggle(idx)}
              >
                {isThisOne ? "…" : isOn ? "ON" : "OFF"}
              </button>
            </div>
          );
        })}
      </div>

      {txError && (
        <p
          style={{
            marginTop: "0.75rem",
            fontSize: "0.8rem",
            color: "var(--error, #e55)",
          }}
        >
          {txError}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
