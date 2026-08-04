// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * MissionCancelConfirm — 50/50 forfeit confirmation dialog.
 * Shared by MissionView and AcceptedMissionsList.
 * EVE-Frontier console look — mirrors existing confirm patterns in the codebase.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Z } from "@bazaar/shared/constants/zIndex";

interface Props {
  /** Display currency label ("EVE" or tribe-token symbol). */
  currency: string;
  collateralAmount: number;       // raw units (MIST or token units)
  priceScale: number;             // COIN_DECIMALS for EVE, 10^decimals for token
  isAdvanced: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function fmt(raw: number, scale: number): string {
  if (raw === 0) return "0";
  return Number((raw / scale).toFixed(6)).toString();
}

export default function MissionCancelConfirm({
  currency, collateralAmount, priceScale, isAdvanced: _adv, busy, onConfirm, onCancel,
}: Props) {
  const hasCollateral = collateralAmount > 0;
  const takerShare = Math.ceil(collateralAmount / 2);   // C - floor(C/2) = ceil(C/2)
  const giverShare = Math.floor(collateralAmount / 2);

  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, zIndex: Z.MODAL_2,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.7)" }}>
      <div className="floating-panel" style={{ maxWidth: 360, padding: "1.5rem" }}>
        <h4 style={{ color: "#c05040", marginBottom: "0.6rem" }}>Cancel this run?</h4>
        {hasCollateral ? (
          <>
            <p style={{ fontSize: "0.84rem", marginBottom: "0.5rem", color: "#e0a93f", fontWeight: 600 }}>
              ⚠ Manual cancellation refunds only 50% of your deposit.
            </p>
            <p style={{ fontSize: "0.82rem", marginBottom: "0.5rem" }}>
              Your collateral is split:
            </p>
            <ul style={{ fontSize: "0.82rem", marginBottom: "0.8rem", paddingLeft: "1.2rem" }}>
              <li>You receive back <strong>{fmt(takerShare, priceScale)} {currency}</strong> (50%)</li>
              <li>Mission giver keeps <strong>{fmt(giverShare, priceScale)} {currency}</strong> (50%)</li>
            </ul>
            <p className="muted" style={{ fontSize: "0.74rem", marginBottom: "1rem" }}>
              This frees the run for another taker.
            </p>
          </>
        ) : (
          <p style={{ fontSize: "0.84rem", marginBottom: "1rem" }}>
            This frees the run for another taker. No collateral was posted.
          </p>
        )}
        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
          <button className="btn btn--ghost btn--sm" onClick={onCancel} disabled={busy}>
            Keep run
          </button>
          <button className="btn btn--danger btn--sm" onClick={onConfirm} disabled={busy}>
            {busy ? "…" : "Cancel run"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment.
// ============================================================
