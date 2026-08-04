// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// TaxIndicator — EconomyFixplan Phase 6 (2026-05-08)
// Inline single-total tax/fee readout with hover-revealed per-layer infocard.
// Replaces previous per-bps-line tax labels at 6 sites (CreateShopModal × 3 +
// ShopView × 3). CSS hover only — no tooltip library dependency.

import "./TaxIndicator.css";

import { COIN_DECIMALS } from "@bazaar/shared/constants";

export interface TaxLayer {
  name:         "SSU" | "Tribe" | "DApp";
  bps?:         number;   // mode === "bps" | "locked"
  amountScaled?: number;  // mode === "bps" | "locked" — per-layer raw amount (optional)
  amount?:      number;   // mode === "flat" — per-layer flat fee, raw scaled units
  destination?: string;   // optional wallet abbreviation; if present rendered as "→ 0x…"
}

export interface TaxIndicatorProps {
  mode:               "bps" | "flat" | "locked";
  totalBps?:          number;     // mode === "bps" | "locked"
  totalAmount?:       number;     // mode === "flat" — total fee, raw scaled units (sum of layer amounts)
  totalAmountScaled?: number;     // mode === "bps" — total tax amount, raw scaled units (informational)
  grossScaled?:       number;     // mode === "bps" — items cost, raw scaled units (informational)
  currency:           string;     // "EVE" or tribe-token symbol
  layers:             TaxLayer[]; // already filtered to non-zero relevant layers; empty = no hover
  label?:             string;     // override; default by mode
  contextNote?:       string;     // optional inline parenthetical (e.g. "(Stranger)")
  className?:         string;
  /**
   * On-chain decimals for the displayed currency (V26+). Default 9 = EVE/MIST
   * (legacy callers unchanged). Pass `2` (or `ledger.decimals`) for Advanced
   * tribe-token amounts. The formatter divides every raw amount by 10^decimals.
   */
  decimals?:          number;
}

function fmtRaw(raw: number, decimals: number, maxFrac = 4): string {
  // Divide by 10^decimals to convert raw scaled units → display.
  // For decimals=9 (EVE) this matches the legacy COIN_DECIMALS behaviour.
  // For decimals=2 (V26+ tribe-token) this renders scaled units as 2dp display.
  const scale = decimals === 9 ? COIN_DECIMALS : Math.pow(10, decimals);
  return (raw / scale).toLocaleString(undefined, {
    maximumFractionDigits: maxFrac,
    minimumFractionDigits: Math.min(maxFrac, decimals),
  });
}

function fmtBps(bps: number): string {
  return `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

export function TaxIndicator(props: TaxIndicatorProps) {
  const { mode, totalBps = 0, totalAmount = 0, totalAmountScaled, grossScaled,
          currency, layers, label, contextNote, className, decimals = 9 } = props;

  const headLabel = label ?? (mode === "flat" ? "Fee" : mode === "locked" ? "Tax pre-paid" : "Tax");
  const isFlat = mode === "flat";
  const headValue = isFlat ? `${fmtRaw(totalAmount, decimals)} ${currency}` : fmtBps(totalBps);
  const hasHover = layers.length > 0;

  return (
    <span className={`tax-indicator${hasHover ? " tax-indicator--hoverable" : ""}${className ? ` ${className}` : ""}`}>
      <span className="tax-indicator__head muted">
        {headLabel}: <strong>{headValue}</strong>
        {contextNote && <span className="tax-indicator__context muted"> {contextNote}</span>}
      </span>
      {hasHover && (
        <span className="tax-indicator__card" role="tooltip">
          <span className="tax-indicator__card-title">Tax breakdown</span>
          <ul className="tax-indicator__layers">
            {layers.map((l, i) => (
              <li key={`${l.name}-${i}`} className="tax-indicator__layer">
                <span className="tax-indicator__layer-name">{l.name}</span>
                <span className="tax-indicator__layer-value">
                  {isFlat
                    ? `${fmtRaw(l.amount ?? 0, decimals)} ${currency}`
                    : `${fmtBps(l.bps ?? 0)}${l.amountScaled != null ? ` (${fmtRaw(l.amountScaled, decimals)} ${currency})` : ""}`}
                </span>
                {l.destination && <span className="tax-indicator__layer-dest muted">→ {l.destination}</span>}
              </li>
            ))}
          </ul>
          {!isFlat && grossScaled != null && totalAmountScaled != null && (
            <div className="tax-indicator__totals muted">
              On {fmtRaw(grossScaled, decimals)} {currency} → tax {fmtRaw(totalAmountScaled, decimals)} {currency}
            </div>
          )}
          {mode === "locked" && (
            <div className="tax-indicator__locked muted">Locked at shop creation. Filler receives full listed price.</div>
          )}
        </span>
      )}
    </span>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
