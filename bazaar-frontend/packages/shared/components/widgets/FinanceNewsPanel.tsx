// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/components/FinanceNewsPanel.tsx
// Floating panel showing paginated FinanceEvent data for a tribe.
// Used for tribe leader transparency — shows mints, burns, vault deposits, withdrawals.
// Only shown for currency tribes (not EVE-only, which have no exchange pool).
// Follows panel patterns established by GlobalGovernancePanel.

import { useMemo } from "react";
import { abbreviateAddress } from "@evefrontier/dapp-kit";
import { useFinanceEvents, formatFinanceEventLabel } from "@bazaar/shared/hooks/useFinanceEvents";
import { useCharacterNames } from "@bazaar/shared/hooks/useCharacterNames";
import { COIN_DECIMALS } from "@bazaar/shared/constants";

interface Props {
  tribeIdx:     number;
  tribeName:    string;
  currencyName: string;  // e.g. "GOLD" — used for display
  onClose:      () => void;
}

function formatTs(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-US", {
    month:  "short",
    day:    "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

function formatAmount(amount: number): string {
  return (amount / COIN_DECIMALS).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function computeImpact(
  reserveBefore: number,
  reserveAfter: number,
  circulationBefore: number,
  circulationAfter: number,
): string {
  // Rate = eve_reserve / circulation (backing per token)
  const rateBefore = circulationBefore > 0 ? reserveBefore / circulationBefore : 0;
  const rateAfter  = circulationAfter  > 0 ? reserveAfter  / circulationAfter  : 0;
  if (rateBefore === 0) return "—";
  const pct = ((rateAfter - rateBefore) / rateBefore) * 100;
  if (isNaN(pct) || !isFinite(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function getEventBadgeClass(eventType: number): string {
  switch (eventType) {
    case 0:  return "badge--green";   // MINT
    case 1:  return "badge--danger";  // BURN
    case 2:  return "badge--green";   // VAULT DEPOSIT
    case 6:  return "badge--muted";   // EXECUTED
    case 9:  return "badge--accent";  // EVE → TOKEN swap
    case 10: return "badge--accent";  // TOKEN → EVE swap
    default: return "badge--warn";
  }
}

export default function FinanceNewsPanel({ tribeIdx, tribeName, currencyName, onClose }: Props) {
  const { events, loading, error, page, hasNextPage, hasPrevPage, goNext, goPrev, refetch } =
    useFinanceEvents(tribeIdx);

  // Collect unique actor addresses for name resolution
  const actorAddresses = useMemo(
    () => Array.from(new Set(events.map(e => e.actor).filter(Boolean))),
    [events],
  );
  const nameMap = useCharacterNames(actorAddresses);

  function resolveActor(addr: string): string {
    return nameMap.get(addr) ?? abbreviateAddress(addr);
  }

  return (
    <div
      className="panel"
      style={{
        maxWidth: 640,
        background: "var(--surface)",
        position: "relative",
      }}
    >
      <div className="panel__header">
        <button className="btn btn--ghost btn--sm" onClick={onClose}>Back</button>
        <h2 style={{ fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}>
          Finance News — {tribeName}
        </h2>
        <span className="muted" style={{ fontSize: "0.76rem", marginLeft: "0.5rem" }}>
          {currencyName}
        </span>
        <button
          className="btn btn--ghost btn--sm"
          onClick={refetch}
          style={{ marginLeft: "auto" }}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div className="panel__section">
        {error && (
          <p style={{ color: "var(--danger)", fontSize: "0.82rem", marginBottom: "0.75rem" }}>
            {error}
          </p>
        )}

        {!loading && !error && events.length === 0 && (
          <p className="muted" style={{ fontSize: "0.82rem" }}>
            No finance events found for this tribe.
          </p>
        )}

        {events.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {events.map(ev => {
              const label = formatFinanceEventLabel(ev.eventType, currencyName);
              const impact = computeImpact(
                ev.eveReserveBefore,
                ev.eveReserveAfter,
                ev.circulationBefore,
                ev.circulationAfter,
              );
              const impactColor = impact.startsWith("+") ? "var(--success, #4caf50)"
                : impact.startsWith("-") ? "var(--danger, #f44336)"
                : "var(--muted)";

              return (
                <div key={ev.id} className="action-card" style={{ padding: "0.6rem 0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span className={`badge ${getEventBadgeClass(ev.eventType)}`}
                      style={{ fontSize: "0.7rem", letterSpacing: "0.05em" }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.82rem",
                        color: "var(--accent)",
                      }}
                    >
                      {formatAmount(ev.amount)}
                    </span>
                    <span className="muted" style={{ fontSize: "0.76rem", marginLeft: "auto" }}>
                      {formatTs(ev.timestampMs)}
                    </span>
                  </div>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginTop: "0.3rem",
                    fontSize: "0.76rem",
                  }}>
                    <span className="muted">
                      By: <strong style={{ color: "#ccc" }}>{resolveActor(ev.actor)}</strong>
                    </span>
                    {impact !== "—" && (
                      <span style={{ color: impactColor, fontFamily: "var(--font-mono)" }}>
                        Rate impact: {impact}
                      </span>
                    )}
                    <a
                      href={`https://suiscan.xyz/testnet/tx/${ev.txDigest}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        marginLeft: "auto",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.7rem",
                        color: "var(--accent)",
                        opacity: 0.7,
                      }}
                    >
                      {ev.txDigest.slice(0, 6)}...{ev.txDigest.slice(-4)}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {(hasPrevPage || hasNextPage) && (
          <div style={{
            display: "flex",
            gap: "0.5rem",
            marginTop: "0.75rem",
            justifyContent: "center",
            alignItems: "center",
          }}>
            <button
              className="btn btn--ghost btn--sm"
              disabled={!hasPrevPage || loading}
              onClick={goPrev}
            >
              Prev
            </button>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              Page {page + 1}
            </span>
            <button
              className="btn btn--ghost btn--sm"
              disabled={!hasNextPage || loading}
              onClick={goNext}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
