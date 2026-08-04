// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * RegisteredSSUsSubTab — "Tribe Network Members" sub-tab (GAS-06 stats rebuild).
 *
 * Tribe Gov → SuperAdmin sub-tab (Easy + Advanced). USER-CENTRIC view of the tribe
 * network: one collapsible row per registered USER (the SSU owners who registered
 * an SSU into the tribe), expanding to the SSUs that user registered. Each SSU has a
 * Detail button that opens a popup with the SSU's full trade-revenue breakdown —
 * trades, gross volume, net to sellers, SSU tax, tribe tax, and (Easy) DApp tax —
 * denominated by tribe type (Easy → EVE, Advanced → tribe token).
 *
 * Data: useTribeSSUTradeStats — derived from the trade event log (PurchaseEvent /
 * LedgerPurchaseEvent), NOT an on-chain counter. The old per-trade ssu_tax_accumulated
 * write was dropped in GAS-06 (it cost gas + contention on every trade for one display
 * number); the event-derived view is richer and free. Session-cached with a manual
 * Refresh. Owner names via useCharacterNames; token symbol via useTribeTokenSymbol
 * (Advanced); SSU solar-system name via useSolarSystemName.
 *
 * (File name retained for import/registry stability; the tab label is
 * "Tribe Network Members". The SuperAdmin tab already requires a SuperAdmin/Leader
 * cap, so this view is inherently SuperAdmin-only.)
 */

import { useMemo, useState } from "react";
import { useTribeSSUTradeStats } from "@bazaar/shared/hooks/bazaarcore/useTribeSSUTradeStats";
import { useCharacterNames } from "@bazaar/shared/hooks/useCharacterNames";
import { useSolarSystemName } from "@bazaar/shared/hooks/useSolarSystemName";
import { useTribeTokenSymbol } from "@bazaar/shared/hooks/bazaareconomy/useTribeTokenSymbol";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import { Z } from "@bazaar/shared/constants/zIndex";

interface Props {
  tribeGovId: string | null;
  /** numeric tribe id — used to resolve the token symbol on Advanced tribes. */
  tribeId: number | null;
}

interface Row {
  ssuId: string;
  ownerAddress: string | null;
  tradeCount: number;
  gross: number;
  ssuTax: number;
  tribeTax: number;
  dappTax: number;
  net: number;
}

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function copy(text: string) {
  try { navigator.clipboard?.writeText(text); } catch { /* clipboard unavailable */ }
}

function formatEve(mist: number): string {
  return (mist / COIN_DECIMALS).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

/** Denominate a money figure: Easy (1) → EVE; Advanced (2) → tribe token. */
function amountLabel(amount: number, bazaarType: number, tokenSymbol: string | null): string {
  return bazaarType === 2
    ? `${amount.toLocaleString()} ${tokenSymbol ?? "tokens"}`
    : `${formatEve(amount)} EVE`;
}

// ── Per-SSU detail popup ───────────────────────────────────────────────────────

interface DetailProps {
  row: Row;
  ownerLabel: string;
  bazaarType: number;
  tokenSymbol: string | null;
  onClose: () => void;
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="muted">{label}</span>
      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </>
  );
}

function SSUDetailModal({ row, ownerLabel, bazaarType, tokenSymbol, onClose }: DetailProps) {
  const { info } = useSolarSystemName(row.ssuId);
  const systemLabel = info?.name ?? null;
  const amt = (n: number) => amountLabel(n, bazaarType, tokenSymbol);

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
      <div className="panel modal-card" style={{ width: "min(520px, 96vw)", padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h3 className="panel__heading" style={{ margin: 0 }}>SSU Detail</h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.4rem 0.75rem", fontSize: "0.85rem" }}>
          <span className="muted">Solar system</span>
          <span>{systemLabel ?? "—"}</span>

          <span className="muted">SSU id</span>
          <span style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <span style={{ fontFamily: "monospace", fontSize: "0.78rem" }} title={row.ssuId}>{shortAddr(row.ssuId)}</span>
            <button className="btn btn--ghost btn--sm" style={{ padding: "0 0.35rem" }} onClick={() => copy(row.ssuId)} title="Copy SSU id">⧉</button>
          </span>

          <span className="muted">Owner</span>
          <span>{ownerLabel}</span>
        </div>

        <div className="action-card" style={{ marginTop: "1rem" }}>
          <h4 style={{ marginTop: 0, marginBottom: "0.35rem", fontSize: "0.9rem" }}>
            Trade Activity &amp; Revenue
          </h4>
          <p className="muted" style={{ fontSize: "0.72rem", marginTop: 0, marginBottom: "0.6rem" }}>
            Totals across all trades routed through this SSU&apos;s shops
            {bazaarType === 2 ? " (Advanced — tribe token)" : " (Easy — EVE)"}.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.35rem 1rem", fontSize: "0.85rem" }}>
            <StatLine label="Trades" value={row.tradeCount.toLocaleString()} />
            <StatLine label="Gross volume" value={amt(row.gross)} />
            <StatLine label="Net to sellers" value={amt(row.net)} />
            <StatLine label="SSU tax (this SSU&apos;s cut)" value={amt(row.ssuTax)} />
            <StatLine label="Tribe tax (to the tribe)" value={amt(row.tribeTax)} />
            {bazaarType !== 2 && <StatLine label="DApp tax (platform)" value={amt(row.dappTax)} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── One SSU row inside an expanded user group ──────────────────────────────────

function SSURow({ row, bazaarType, tokenSymbol, onDetail }:
  { row: Row; bazaarType: number; tokenSymbol: string | null; onDetail: (r: Row) => void }) {
  const { info } = useSolarSystemName(row.ssuId);
  const systemLabel = info?.name ?? null;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "0.6rem",
        padding: "0.4rem 0.6rem 0.4rem 1.6rem",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <div>{systemLabel ?? shortAddr(row.ssuId)}</div>
        <div className="muted" style={{ fontSize: "0.7rem", display: "flex", gap: "0.35rem", alignItems: "center" }}>
          <span title={row.ssuId}>{shortAddr(row.ssuId)}</span>
          <button className="btn btn--ghost btn--sm" style={{ padding: "0 0.35rem", lineHeight: 1.4 }}
            onClick={() => copy(row.ssuId)} title="Copy SSU id">⧉</button>
        </div>
      </span>
      <span className="muted" style={{ fontSize: "0.72rem", fontVariantNumeric: "tabular-nums" }} title="Trades · tribe tax generated">
        {row.tradeCount.toLocaleString()} trade{row.tradeCount === 1 ? "" : "s"} · {amountLabel(row.tribeTax, bazaarType, tokenSymbol)}
      </span>
      <button className="btn btn--ghost btn--sm" onClick={() => onDetail(row)}>Detail</button>
    </div>
  );
}

// ── One collapsible user group ─────────────────────────────────────────────────

interface UserGroupProps {
  ownerAddress: string;
  ownerName: string;
  rows: Row[];
  bazaarType: number;
  tokenSymbol: string | null;
  onDetail: (r: Row) => void;
}

function UserGroup({ ownerAddress, ownerName, rows, bazaarType, tokenSymbol, onDetail }: UserGroupProps) {
  const [open, setOpen] = useState(false);
  const totalTax = rows.reduce((n, r) => n + r.tribeTax, 0);
  const totalTrades = rows.reduce((n, r) => n + r.tradeCount, 0);

  return (
    <div style={{ border: "1px solid var(--border-color, #444)", borderRadius: 4, marginBottom: "0.5rem", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "0.6rem",
          padding: "0.5rem 0.7rem", background: "none", border: "none", color: "inherit",
          cursor: "pointer", textAlign: "left",
        }}
        aria-expanded={open}
      >
        <span style={{ width: "1rem" }}>{open ? "▼" : "▶"}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{ownerName}</div>
          <div className="muted" style={{ fontSize: "0.7rem", display: "flex", gap: "0.35rem", alignItems: "center" }}>
            <span title={ownerAddress}>{shortAddr(ownerAddress)}</span>
            <span
              role="button"
              tabIndex={0}
              className="btn btn--ghost btn--sm"
              style={{ padding: "0 0.35rem", lineHeight: 1.4 }}
              onClick={(e) => { e.stopPropagation(); copy(ownerAddress); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); copy(ownerAddress); } }}
              title="Copy wallet address"
            >⧉</span>
          </div>
        </span>
        <span className="muted" style={{ fontSize: "0.75rem" }}>{rows.length} SSU{rows.length === 1 ? "" : "s"}</span>
        <span style={{ fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }} title="Total trades · tribe tax generated">
          {totalTrades.toLocaleString()} · {amountLabel(totalTax, bazaarType, tokenSymbol)}
        </span>
      </button>
      {open && rows.map(r => (
        <SSURow key={r.ssuId} row={r} bazaarType={bazaarType} tokenSymbol={tokenSymbol} onDetail={onDetail} />
      ))}
    </div>
  );
}

// ── Tribe Network Members sub-tab ──────────────────────────────────────────────

export default function RegisteredSSUsSubTab({ tribeGovId, tribeId }: Props) {
  // Canonical tribe→SSU index lives on the dapp_hub Tribe object (Tribe.ssu_ids),
  // NOT on bazaar_core TribeGovernance.ssu_ids (never written during normal
  // registration). Resolve the live list here and feed it to the stats hook.
  const { tribes } = useTribeRegistry();
  const ssuIds = useMemo(
    () => (tribeId !== null ? (tribes.find(t => t.idx === tribeId)?.ssuIds ?? []) : []),
    [tribes, tribeId],
  );

  const { data, isLoading, isFetching, refetch } = useTribeSSUTradeStats(tribeGovId, ssuIds);
  const bazaarType = data?.bazaarType ?? 0;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const truncated = data?.truncated ?? false;

  const { symbol: tokenSymbol } = useTribeTokenSymbol(bazaarType === 2 ? tribeId : null);

  // Group SSUs by owner → user-centric view.
  const groups = useMemo(() => {
    const byOwner = new Map<string, Row[]>();
    for (const r of rows) {
      const owner = r.ownerAddress ?? "unknown";
      byOwner.set(owner, [...(byOwner.get(owner) ?? []), r]);
    }
    return Array.from(byOwner.entries())
      .map(([owner, list]) => ({ owner, rows: list }))
      .sort((a, b) => b.rows.length - a.rows.length || a.owner.localeCompare(b.owner));
  }, [rows]);

  const ownerAddrs = useMemo(
    () => groups.map(g => g.owner).filter(o => o !== "unknown"),
    [groups],
  );
  const names = useCharacterNames(ownerAddrs);

  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const detailOwnerLabel = detailRow
    ? (detailRow.ownerAddress
        ? (names.get(detailRow.ownerAddress) ?? shortAddr(detailRow.ownerAddress))
        : "Unknown")
    : "";

  return (
    <div className="panel__section">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem" }}>
        <h3 style={{ margin: 0 }}>Tribe Network Members</h3>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => refetch()}
          disabled={isFetching}
          title="Re-read the trade log"
        >
          {isFetching ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>
      <p className="muted" style={{ marginTop: "0.35rem" }}>
        Everyone who registered an SSU into this tribe. Expand a member to see their
        SSUs; open an SSU&apos;s Detail for its trade-revenue breakdown
        ({bazaarType === 2 ? "tribe token" : "EVE"}).
      </p>

      {truncated && (
        <p className="muted" style={{ marginTop: 0, fontSize: "0.72rem" }}>
          Showing the most recent trades only (large history) — figures are a recent-activity subset.
        </p>
      )}

      {isLoading && <p className="muted">Loading tribe network…</p>}

      {!isLoading && groups.length === 0 && (
        <p className="muted">No members have registered an SSU to this tribe yet.</p>
      )}

      {!isLoading && groups.map(g => (
        <UserGroup
          key={g.owner}
          ownerAddress={g.owner === "unknown" ? "" : g.owner}
          ownerName={
            g.owner === "unknown"
              ? "Unknown owner"
              : (names.get(g.owner) ?? shortAddr(g.owner))
          }
          rows={g.rows}
          bazaarType={bazaarType}
          tokenSymbol={tokenSymbol}
          onDetail={setDetailRow}
        />
      ))}

      {detailRow && (
        <SSUDetailModal
          row={detailRow}
          ownerLabel={detailOwnerLabel}
          bazaarType={bazaarType}
          tokenSymbol={tokenSymbol}
          onClose={() => setDetailRow(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
