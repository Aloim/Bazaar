// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ItemLogSubTab — R6.6.4b OS-32
 *
 * SSUItemLogSubTab: item event log table.
 * Module-level constants (103 LOC of ITEM_EVENT_TYPES + KIND_LABEL + helpers)
 * co-located with their consumer per FA §2.1.
 *
 * Uses direct fetch() to suix_queryEvents (same as Bazar1 — not via useSuiQuery
 * because queryEvents requires multi-module fan-out with Promise.all, which
 * doesn't fit the single-query useSuiQuery shape).
 *
 * Bazar1 reference: lines 1783-1917 (constants) + 1918-2041 (component).
 *
 * Article XIV.2 exemption: adapted from Bazar1.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import React, { useState, useEffect } from "react";
import { abbreviateAddress } from "@evefrontier/dapp-kit";
import { PACKAGE_ID } from "@bazaar/shared/constants";

// ── RPC endpoint ───────────────────────────────────────────────────────────────

const SUI_RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

// ── ItemEventKind ──────────────────────────────────────────────────────────────
// Bazar1 reference: lines 1785-1794.

type ItemEventKind =
  | "ItemPurchased"
  | "ItemDelivered"
  | "ItemsExchanged"
  | "ShopCreated"
  | "ShopClosed"
  | "ShopClosedToUnclaimed"
  | "ShopForceRemoved"
  | "TradeCompleted"
  | "TradeCancelled";

// ── ItemLogEntry ───────────────────────────────────────────────────────────────

interface ItemLogEntry {
  kind: ItemEventKind;
  timestampMs: number;
  digest: string;
  fields: Record<string, unknown>;
}

// ── ITEM_EVENT_TYPES ───────────────────────────────────────────────────────────
// Bazar1 reference: lines 1803-1813.
// Module names map to the BazaarCore Move package modules.

const ITEM_EVENT_TYPES: { module: string; name: ItemEventKind }[] = [
  { module: "bazar_shops", name: "ItemPurchased"         },
  { module: "bazar_shops", name: "ItemDelivered"         },
  { module: "bazar_shops", name: "ItemsExchanged"        },
  { module: "bazar",       name: "ShopCreated"           },
  { module: "bazar",       name: "ShopClosed"            },
  { module: "bazar",       name: "ShopClosedToUnclaimed" },
  { module: "bazar",       name: "ShopForceRemoved"      },
  { module: "trade",       name: "TradeCompleted"        },
  { module: "trade",       name: "TradeCancelled"        },
];

// ── KIND_LABEL ─────────────────────────────────────────────────────────────────
// Bazar1 reference: lines 1906-1916.

const KIND_LABEL: Record<ItemEventKind, string> = {
  ItemPurchased:         "WTS Purchase",
  ItemDelivered:         "WTB Delivery",
  ItemsExchanged:        "DE Exchange",
  ShopCreated:           "Shop Created",
  ShopClosed:            "Shop Closed",
  ShopClosedToUnclaimed: "Closed→Unclaimed",
  ShopForceRemoved:      "Force Removed",
  TradeCompleted:        "Trade Completed",
  TradeCancelled:        "Trade Cancelled",
};

// ── Helper functions ───────────────────────────────────────────────────────────
// Bazar1 reference: lines 1865-1904.

function formatItemEventActor(entry: ItemLogEntry): string {
  const f = entry.fields;
  const addr = (
    f.buyer ?? f.seller ?? f.trader ?? f.owner ?? f.cancelled_by ?? f.initiator ?? ""
  ) as string;
  return addr ? abbreviateAddress(addr) : "—";
}

function formatItemEventDetails(entry: ItemLogEntry): string {
  const f = entry.fields;
  switch (entry.kind) {
    case "ItemPurchased":
      return `Bought ${f.qty ?? f.quantity ?? "?"}x Item#${f.item_type ?? "?"}`;
    case "ItemDelivered":
      return `Delivered ${f.qty ?? f.quantity ?? "?"}x Item#${f.item_type ?? "?"}`;
    case "ItemsExchanged":
      return `Exchanged ${f.offered_qty ?? "?"}x Item#${f.offered_type ?? "?"} → ${f.received_qty ?? "?"}x Item#${f.received_type ?? "?"}`;
    case "ShopCreated": {
      const kindNum = Number(f.kind ?? -1);
      const kindLabel =
        kindNum === 0 ? "WTS" : kindNum === 1 ? "WTB" : kindNum === 2 ? "DE" : `Kind#${kindNum}`;
      return `Created ${kindLabel} shop`;
    }
    case "ShopClosed":
      return "Shop closed";
    case "ShopClosedToUnclaimed":
      return `Shop closed, ${f.unclaimed_item_count ?? 0} items unclaimed`;
    case "ShopForceRemoved":
      return `Force removed by ${f.removed_by ? abbreviateAddress(f.removed_by as string) : "?"}, ${f.unclaimed_item_count ?? 0} items unclaimed`;
    case "TradeCompleted":
      return "Trade completed";
    case "TradeCancelled":
      return `Trade cancelled by ${f.cancelled_by ? abbreviateAddress(f.cancelled_by as string) : "?"}`;
    default:
      return "—";
  }
}

function formatItemEventShopOrTradeId(entry: ItemLogEntry): string {
  const f = entry.fields;
  const id = (f.shop_id ?? f.proposal_id ?? "") as string;
  return id ? `${id.slice(0, 8)}...` : "—";
}

// ── fetchItemEvents ────────────────────────────────────────────────────────────
// Bazar1 reference: lines 1815-1863.
// Fan-out across 9 event types via Promise.all, then sort descending + slice 100.

async function fetchItemEvents(pkg: string): Promise<ItemLogEntry[]> {
  const results: ItemLogEntry[] = [];

  await Promise.all(
    ITEM_EVENT_TYPES.map(async ({ module, name }) => {
      try {
        const body = {
          jsonrpc: "2.0",
          id: 1,
          method: "suix_queryEvents",
          params: [
            { MoveEventType: `${pkg}::${module}::${name}` },
            null,
            50,
            true, // descending
          ],
        };
        const res = await fetch(SUI_RPC, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) return;
        const data = await res.json();
        const events: unknown[] = data?.result?.data ?? [];
        for (const ev of events) {
          const e = ev as Record<string, unknown>;
          const parsedJson = e.parsedJson as Record<string, unknown> | undefined;
          const tsMs = e.timestampMs != null ? Number(e.timestampMs) : 0;
          const digest =
            typeof e.id === "object" && e.id !== null
              ? String((e.id as Record<string, unknown>).txDigest ?? "")
              : "";
          results.push({
            kind: name,
            timestampMs: tsMs,
            digest,
            fields: parsedJson ?? {},
          });
        }
      } catch {
        // Silently skip failed event types — partial results still shown.
      }
    })
  );

  results.sort((a, b) => b.timestampMs - a.timestampMs);
  return results.slice(0, 100);
}

// ── SSUItemLogSubTab ───────────────────────────────────────────────────────────
// Bazar1 reference: lines 1918-2041.
// ssuId is accepted as a prop (future: could filter events by ssuId field).

export function SSUItemLogSubTab({ ssuId: _ssuId }: { ssuId: string }) {
  const [entries, setEntries] = useState<ItemLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  async function load() {
    if (!PACKAGE_ID) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchItemEvents(PACKAGE_ID);
      setEntries(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load item events");
    } finally {
      setLoading(false);
    }
  }

  // Fetch on mount; refresh every 30 seconds.
  useEffect(() => {
    void load();
    const interval = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!PACKAGE_ID) {
    return (
      <div className="action-card">
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          PACKAGE_ID not configured. Set VITE_PACKAGE_ID after deployment.
        </p>
      </div>
    );
  }

  return (
    <div className="action-card">
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <h4 style={{ margin: 0 }}>Item Event Log</h4>
        <button
          className="btn btn--ghost btn--sm"
          disabled={loading}
          onClick={() => { void load(); }}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <p className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.75rem" }}>
        Item transactions across all shops and trades. Showing up to 100 most recent events.
      </p>

      {error && (
        <p style={{ color: "var(--color-error, #f44336)", fontSize: "0.78rem" }}>{error}</p>
      )}

      {loading && entries.length === 0 && (
        <p className="muted" style={{ fontSize: "0.78rem" }}>Loading item events...</p>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="muted" style={{ fontSize: "0.78rem" }}>No item events found.</p>
      )}

      {entries.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ fontSize: "0.75rem", minWidth: 640 }}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Type</th>
                <th>Actor</th>
                <th>Details</th>
                <th>Shop/Trade ID</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={`${entry.digest}-${i}`}>
                  <td style={{ whiteSpace: "nowrap", fontSize: "0.7rem" }}>
                    {entry.timestampMs
                      ? new Date(entry.timestampMs).toLocaleString()
                      : "—"}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className="muted" style={{ fontSize: "0.72rem" }}>
                      {KIND_LABEL[entry.kind] ?? entry.kind}
                    </span>
                  </td>
                  <td>
                    <span className="muted" style={{ fontSize: "0.72rem" }}>
                      {formatItemEventActor(entry)}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.72rem" }}>
                    {formatItemEventDetails(entry)}
                  </td>
                  <td>
                    <span
                      className="muted"
                      title={String(entry.fields.shop_id ?? entry.fields.proposal_id ?? "")}
                      style={{ fontSize: "0.7rem" }}
                    >
                      {formatItemEventShopOrTradeId(entry)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
