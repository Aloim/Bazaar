// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useMemo, useState } from "react";
import { useTransactionLog } from "@bazaar/shared/hooks/useTransactionLog";
import { useCharacterNames } from "@bazaar/shared/hooks/useCharacterNames";
import { useItemTypes } from "@bazaar/shared/hooks/useItemTypes";
import { useClaimBoxContext } from "@bazaar/shared/contexts/ClaimBoxContext";
import { COIN_DECIMALS } from "@bazaar/shared/constants";

const PAGE_SIZE = 15;

function formatTs(ms: number): string {
  if (!ms) return "\u2014";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function fmtAddr(addr: string | undefined, names: Map<string, string>): string {
  if (!addr) return "\u2014";
  return names.get(addr) ?? `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function fmtCoin(raw: number, symbol: string): string {
  const val = raw / COIN_DECIMALS;
  return `${val.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`;
}

export default function TransactionLogTab() {
  const { entries, isLoading, error, refetch } = useTransactionLog();
  const { currencyName } = useClaimBoxContext();
  const symbol = currencyName || "EVE";
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pageEntries = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const actorAddresses = useMemo(
    () => [...new Set(entries.map(e => e.actor).filter((a): a is string => !!a))],
    [entries],
  );
  const itemTypeIds = useMemo(
    () => [
      ...new Set(
        entries.map(e => e.itemTypeId).filter((id): id is number => id != null),
      ),
    ],
    [entries],
  );

  const names = useCharacterNames(actorAddresses);
  const itemTypes = useItemTypes(itemTypeIds);

  function handleRefetch() {
    setPage(0);
    refetch();
  }

  return (
    <div className="panel__section">
      <div className="action-card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <h4 style={{ margin: 0 }}>Transaction Log</h4>
          <button
            className="btn btn--ghost btn--sm"
            onClick={handleRefetch}
            disabled={isLoading}
          >
            {isLoading ? "Loading\u2026" : "Refresh"}
          </button>
        </div>

        {error && (
          <p className="status--error">{error}</p>
        )}
        {!isLoading && entries.length === 0 && !error && (
          <p className="muted">No financial events found.</p>
        )}

        {pageEntries.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8rem",
              }}
            >
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid var(--border, #333)",
                  }}
                >
                  <th style={{ padding: "0.4rem 0.5rem" }}>Time</th>
                  <th style={{ padding: "0.4rem 0.5rem" }}>Type</th>
                  <th style={{ padding: "0.4rem 0.5rem" }}>Dir</th>
                  <th style={{ padding: "0.4rem 0.5rem" }}>Player</th>
                  <th style={{ padding: "0.4rem 0.5rem" }}>Amount / Item</th>
                </tr>
              </thead>
              <tbody>
                {pageEntries.map(entry => {
                  const dirColor =
                    entry.direction === "in"
                      ? "var(--color-success, #4c4)"
                      : "var(--color-warning, #fa4)";

                  let amountCell = "\u2014";
                  if (entry.coinAmount != null && entry.coinAmount > 0) {
                    amountCell = fmtCoin(entry.coinAmount, symbol);
                  } else if (entry.itemTypeId != null) {
                    const info = itemTypes.get(entry.itemTypeId);
                    const itemName = info?.name ?? `#${entry.itemTypeId}`;
                    amountCell =
                      entry.itemQuantity != null
                        ? `${entry.itemQuantity}x ${itemName}`
                        : itemName;
                  }

                  return (
                    <tr
                      key={entry.id}
                      style={{
                        borderBottom: "1px solid var(--border, #222)",
                      }}
                    >
                      <td
                        style={{
                          padding: "0.35rem 0.5rem",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatTs(entry.timestamp)}
                      </td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>
                        {entry.type}
                      </td>
                      <td
                        style={{
                          padding: "0.35rem 0.5rem",
                          color: dirColor,
                          fontWeight: 600,
                        }}
                      >
                        {entry.direction === "in" ? "IN" : "OUT"}
                      </td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>
                        {fmtAddr(entry.actor, names)}
                      </td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>
                        {amountCell}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginTop: "0.75rem",
            }}
          >
            <button
              className="btn btn--ghost btn--sm"
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              className="btn btn--ghost btn--sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </button>
          </div>
        )}

        {entries.length > 0 && (
          <p
            className="muted"
            style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}
          >
            Showing {pageEntries.length} of {entries.length} events (newest
            first, up to 50 per module).
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
