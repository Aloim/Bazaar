// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Stat — single key-value display card.
 *
 * Used in admin panel dashboards: circulating supply, treasury balance,
 * vault stats, WTB escrow balances, dApp tax rate.
 *
 * Extracted from governance/CoinTab.tsx in R6.5.3 (OverhaulPlan1) so that
 * CoinTab.tsx can be deleted in R6.5.4 (OS-27) without breaking
 * WtbEscrowPoolTab.tsx import.
 *
 * CSS classes:
 *   .stat        — card container
 *   .stat__label — dimmed label row
 *   .stat__value — bold value row
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

export interface StatProps {
  label:   string;
  value:   number | string;
  suffix?: string;
}

export function Stat({ label, value, suffix }: StatProps) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}{suffix ? ` ${suffix}` : ""}</span>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
