// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeWalletLogsModal — V20.
 *
 * Paginated audit log of Tribe Wallet admin actions for the active tribe.
 * Reads two event streams:
 *   - bazaar_economy::tribe_token_ledger::TribeWalletWithdrawEvent
 *   - bazaar_economy::tribe_token_ledger::TribeWalletDepositEvent
 *
 * Uses BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID for the event-type filter per
 * Run-#9 invariant 1 — struct types in Sui retain the V1 publish ID.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { suiClient } from "@bazaar/shared/hooks/sui-client";
import { useCharacterNames } from "@bazaar/shared/hooks/useCharacterNames";
import { BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID } from "@bazaar/shared/constants";
import { formatTribeAmount, TRIBE_TOKEN_DECIMALS } from "@bazaar/shared/utils/tribeToken";
import { Z } from "@bazaar/shared/constants/zIndex";

interface Props {
  open:        boolean;
  onClose:     () => void;
  tribeId:     number | null;
  tokenSymbol: string;
  /** On-chain ledger decimals (V26+ default 2). */
  decimals?:   number;
}

type LogRow = {
  txDigest:      string;
  timestampMs:   number;
  kind:          "WITHDRAW" | "DEPOSIT";
  counterparty:  string;        // recipient (withdraw) or depositor (deposit)
  amount:        number;
  authorizedBy:  string;        // for deposit = depositor; for withdraw = sender
  capTierLabel:  string;        // "Leader" / "SuperAdmin" / "—"
};

async function fetchEvents(
  tribeId: number,
  eventType: string,
): Promise<Array<Record<string, unknown>>> {
  let cursor: string | null = null;
  let pages = 0;
  const all: Array<Record<string, unknown>> = [];
  do {
    const page = await suiClient.queryEvents({
      query: { MoveEventType: eventType },
      cursor,
      limit: 200,
      descending_order: true,
    });
    for (const e of page.data) {
      const p = e.parsedJson as { tribe_id?: string | number } | null;
      if (p != null && Number(p.tribe_id) === tribeId) {
        all.push({
          ...p,
          _txDigest:    e.id?.txDigest ?? "",
          _timestampMs: Number(e.timestampMs ?? 0),
        });
      }
    }
    cursor = page.hasNextPage && page.nextCursor ? page.nextCursor : null;
    pages++;
    if (pages > 20) break; // cap pagination — 4000 events worth
  } while (cursor !== null);
  return all;
}

export default function TribeWalletLogsModal({
  open, onClose, tribeId, tokenSymbol,
  decimals = TRIBE_TOKEN_DECIMALS,
}: Props) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const enabled = open && tribeId !== null && tribeId > 0;

  const q = useQuery<LogRow[]>({
    queryKey: ["tribewallet-logs", tribeId],
    enabled,
    queryFn: async (): Promise<LogRow[]> => {
      const withdrawType =
        `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::tribe_token_ledger::TribeWalletWithdrawEvent`;
      const depositType =
        `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::tribe_token_ledger::TribeWalletDepositEvent`;
      const [withdrawRaw, depositRaw] = await Promise.all([
        fetchEvents(tribeId!, withdrawType),
        fetchEvents(tribeId!, depositType),
      ]);
      const withdrawRows: LogRow[] = withdrawRaw.map((p) => ({
        txDigest:     String(p._txDigest ?? ""),
        timestampMs:  Number(p._timestampMs ?? p.timestamp_ms ?? 0),
        kind:         "WITHDRAW",
        counterparty: String(p.recipient ?? ""),
        amount:       Number(p.amount ?? 0),
        authorizedBy: String(p.authorized_by ?? ""),
        capTierLabel: Number(p.cap_tier ?? 0) === 1 ? "SuperAdmin" : "Leader",
      }));
      const depositRows: LogRow[] = depositRaw.map((p) => ({
        txDigest:     String(p._txDigest ?? ""),
        timestampMs:  Number(p._timestampMs ?? p.timestamp_ms ?? 0),
        kind:         "DEPOSIT",
        counterparty: String(p.depositor ?? ""),
        amount:       Number(p.amount ?? 0),
        authorizedBy: String(p.depositor ?? ""),
        capTierLabel: "—",
      }));
      return [...withdrawRows, ...depositRows].sort((a, b) => b.timestampMs - a.timestampMs);
    },
    staleTime: 30_000,
  });

  // Reset page when modal re-opens with a different tribe.
  useEffect(() => { if (open) setPage(0); }, [open, tribeId]);

  const allRows  = q.data ?? [];
  const slice    = allRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const numPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));

  // Resolve character names for counterparty + authorizer addresses.
  const knownAddresses = (() => {
    const set = new Set<string>();
    for (const r of slice) {
      if (r.counterparty) set.add(r.counterparty);
      if (r.authorizedBy && r.authorizedBy !== r.counterparty) set.add(r.authorizedBy);
    }
    return Array.from(set);
  })();
  const characterNames = useCharacterNames(knownAddresses);

  if (!open) return null;

  function nameOrShort(addr: string): string {
    if (!addr) return "—";
    const name = characterNames.get(addr);
    if (name) return name;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }

  function formatTs(ms: number): string {
    if (!ms) return "—";
    const d = new Date(ms);
    return d.toLocaleString();
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: Z.MODAL_2,
      }}
    >
      <div
        className="panel modal-card"
        style={{ width: "min(900px, 96vw)", maxHeight: "90vh", overflowY: "auto", padding: "1.25rem" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h3 className="panel__heading" style={{ margin: 0 }}>Tribe Wallet — Audit Log</h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
        </div>
        <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          Withdraw and Deposit events affecting the Tribe Wallet (gov.id_address ledger row).
          {q.isLoading && " Loading…"}
          {!q.isLoading && allRows.length === 0 && " No events recorded yet."}
        </p>

        {allRows.length > 0 && (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-color, #444)", textAlign: "left" }}>
                    <th style={{ padding: "0.4rem 0.5rem" }}>When</th>
                    <th style={{ padding: "0.4rem 0.5rem" }}>Type</th>
                    <th style={{ padding: "0.4rem 0.5rem" }}>Counterparty</th>
                    <th style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>Amount</th>
                    <th style={{ padding: "0.4rem 0.5rem" }}>Authorized By</th>
                    <th style={{ padding: "0.4rem 0.5rem" }}>Cap Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((row, i) => (
                    <tr key={`${row.txDigest}-${i}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding: "0.35rem 0.5rem" }}>{formatTs(row.timestampMs)}</td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>
                        <span style={{
                          color: row.kind === "DEPOSIT" ? "#4ade80" : "#fbbf24",
                          fontWeight: 600,
                        }}>
                          {row.kind}
                        </span>
                      </td>
                      <td style={{ padding: "0.35rem 0.5rem" }} title={row.counterparty}>
                        {nameOrShort(row.counterparty)}
                      </td>
                      <td style={{ padding: "0.35rem 0.5rem", textAlign: "right" }}>
                        {formatTribeAmount(row.amount, { decimals })} {tokenSymbol}
                      </td>
                      <td style={{ padding: "0.35rem 0.5rem" }} title={row.authorizedBy}>
                        {nameOrShort(row.authorizedBy)}
                      </td>
                      <td style={{ padding: "0.35rem 0.5rem" }} className="muted">
                        {row.capTierLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {numPages > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem" }}>
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  Page {page + 1} of {numPages} ({allRows.length} events)
                </span>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    Prev
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => setPage((p) => Math.min(numPages - 1, p + 1))}
                    disabled={page >= numPages - 1}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
