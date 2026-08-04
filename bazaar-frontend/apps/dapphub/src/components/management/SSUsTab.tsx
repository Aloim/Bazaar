// SSUsTab.tsx — List and manage all SSUs registered in the DApp.
// Displays SSU ID, tribe affiliation, owner, status, and admin actions.

import { useMemo, useState } from "react";
import { useAllSSUs, useCharacterNames } from "@bazaar/shared/hooks";
import { useDepreciatedSSUs } from "@bazaar/shared/hooks/bazaarcore/useDepreciatedSSUs";
import { truncateAddress } from "@bazaar/shared/utils";
import type { SSUSummary } from "@bazaar/shared/types";
import SSUDetailsWindow from "./SSUDetailsWindow";

// Re-export for SSUDetailsWindow compatibility
export type SSURow = SSUSummary & {
  status: "active" | "inactive" | "pending";
  registeredAt: number;
  /** V41 SSU depreciation/prune — union of the certificate + the existence probe
   *  (useDepreciatedSSUs). Drives the "Depreciated" badge (the ONLY surface that
   *  shows this status — plan §5). */
  isDepreciated: boolean;
  /** true only once SSUDepreciatedEvent has fired for this SSU. Gates
   *  DepreciationDrainRow's branch (prune-page flow vs "Mark depreciated" step) —
   *  NOT the same signal as isDepreciated (which also includes probe-only ghosts). */
  isCertifiedDepreciated: boolean;
};

function formatDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(ms));
}

/** Owner column: EVE Frontier character name + a truncated, copyable wallet address. */
function OwnerCell({ address, name }: { address: string; name?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    try {
      navigator.clipboard?.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
      <span style={{ fontSize: "0.8rem", color: "var(--text)" }}>
        {name ?? <span className="muted">Unknown character</span>}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
        <span
          style={{ fontFamily: "monospace", fontSize: "0.68rem", color: "var(--muted)" }}
          title={address}
        >
          {truncateAddress(address, 6)}
        </span>
        <button
          className="btn btn--ghost btn--sm"
          style={{ padding: "0 0.3rem", lineHeight: 1.3, fontSize: "0.7rem" }}
          onClick={handleCopy}
          title="Copy full wallet address"
        >
          {copied ? "✓" : "⧉"}
        </button>
      </span>
    </span>
  );
}

interface SSUsTabProps {
  ownerCapId: string | null;
}

export default function SSUsTab({ ownerCapId }: SSUsTabProps) {
  const { data: rawSSUs = [], isLoading, refetch } = useAllSSUs();
  const candidateSsuIds = useMemo(() => rawSSUs.map(s => s.ssuId), [rawSSUs]);
  const { depreciated, certified } = useDepreciatedSSUs(candidateSsuIds);
  const ssus: SSURow[] = rawSSUs.map(s => ({
    ...s,
    status: (s.isActive ? "active" : "inactive") as "active" | "inactive" | "pending",
    isDepreciated: depreciated.has(s.ssuId.toLowerCase()),
    isCertifiedDepreciated: certified.has(s.ssuId.toLowerCase()),
  }));
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>("id-asc");
  const [detailsSSU, setDetailsSSU] = useState<SSURow | null>(null);

  // Resolve owner wallet → EVE Frontier character name (deduped; the hook caches
  // per address). Names render in the Owner column with a copyable short address.
  const ownerAddresses = useMemo(
    () => Array.from(new Set(ssus.map(s => s.ownerAddress).filter(Boolean))),
    [ssus],
  );
  const ownerNames = useCharacterNames(ownerAddresses);

  const term = search.trim().toLowerCase();
  const filtered = ssus.filter(s => {
    if (!term) return true;
    return (
      s.ssuId.toLowerCase().includes(term) ||
      s.ownerAddress.toLowerCase().includes(term) ||
      (s.tribeName ?? "").toLowerCase().includes(term)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "id-asc": return a.ssuId.localeCompare(b.ssuId);
      case "id-desc": return b.ssuId.localeCompare(a.ssuId);
      case "newest": return b.registeredAt - a.registeredAt;
      case "oldest": return a.registeredAt - b.registeredAt;
      case "status": return (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0);
      default: return 0;
    }
  });

  return (
    <div className="panel__section">
      <div className="action-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4>Registered SSUs ({ssus.length})</h4>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by SSU ID, owner, or name..."
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "3px",
                  padding: "0.25rem 1.6rem 0.25rem 0.5rem",
                  color: "var(--text)",
                  fontFamily: "var(--font)",
                  fontSize: "0.78rem",
                  width: "260px",
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{
                    position: "absolute",
                    right: "0.3rem",
                    background: "none",
                    border: "none",
                    color: "var(--muted)",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    lineHeight: 1,
                    padding: 0,
                  }}
                  aria-label="Clear search"
                >
                  x
                </button>
              )}
            </div>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "3px",
                padding: "0.25rem 0.5rem",
                color: "var(--text)",
                fontFamily: "var(--font)",
                fontSize: "0.78rem",
              }}
            >
              <option value="id-asc">SSU ID (A-Z)</option>
              <option value="id-desc">SSU ID (Z-A)</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="status">Active first</option>
            </select>
            <button className="btn btn--ghost btn--sm" onClick={refetch} disabled={isLoading}>
              {isLoading ? "..." : "Refresh"}
            </button>
          </div>
        </div>

        {isLoading && <p className="muted">Loading SSUs...</p>}

        {!isLoading && sorted.length === 0 && (
          <p className="muted">No SSUs match the current search.</p>
        )}

        {!isLoading && sorted.length > 0 && (
          <div style={{ overflowX: "auto", maxHeight: "500px", overflowY: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>SSU ID</th>
                  <th>Owner</th>
                  <th>Tribe</th>
                  <th>Status</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(ssu => (
                  <tr key={ssu.ssuId}>
                    <td style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--accent2)" }}>
                      {ssu.ssuId}
                    </td>
                    <td>
                      <OwnerCell address={ssu.ownerAddress} name={ownerNames.get(ssu.ownerAddress)} />
                    </td>
                    <td style={{ fontSize: "0.8rem" }}>
                      {ssu.tribeName ?? <span className="muted">NoTribe</span>}
                    </td>
                    <td>
                      <span className={`badge badge--${ssu.status}`}>
                        {ssu.status}
                      </span>
                      {ssu.isDepreciated && (
                        <span className="badge badge--depreciated" style={{ marginLeft: "0.3rem" }}>
                          Depreciated
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {formatDate(ssu.registeredAt)}
                    </td>
                    <td>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => setDetailsSSU(ssu)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailsSSU && (
        <SSUDetailsWindow
          ssu={detailsSSU}
          ownerCapId={ownerCapId}
          onClose={() => {
            setDetailsSSU(null);
            setTimeout(() => refetch(), 1500);
          }}
        />
      )}
    </div>
  );
}
