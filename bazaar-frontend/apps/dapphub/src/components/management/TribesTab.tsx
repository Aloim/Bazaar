// TribesTab.tsx — Manage tribes registered in the DApp.
// Lists all tribes as an accordion. Each row expands to show SSUs.
// Details button opens TribeDetailsWindow for tax override and removal.

import { useState } from "react";
import { useTribes } from "@bazaar/shared/hooks";
import type { TribeSummary } from "@bazaar/shared/types";
import TribeAccordionRow from "./TribeAccordionRow";
import TribeDetailsWindow from "./TribeDetailsWindow";

// Re-export for TribeAccordionRow and TribeDetailsWindow compatibility
export type TribeRow = TribeSummary & {
  status: "active" | "frozen";
  createdAt: number;
};

interface TribesTabProps {
  ownerCapId: string | null;
}

export default function TribesTab({ ownerCapId }: TribesTabProps) {
  const { data: rawTribes = [], isLoading, refetch } = useTribes();
  // Map TribeSummary to TribeRow (add status/createdAt for display compatibility)
  const tribes: TribeRow[] = rawTribes.map(t => ({
    ...t,
    status: (t.isActive ? "active" : "frozen") as "active" | "frozen",
  }));
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>("name-asc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsTribe, setDetailsTribe] = useState<TribeRow | null>(null);

  const term = search.trim().toLowerCase();
  const filtered = tribes.filter(t => {
    if (!term) return true;
    return t.name.toLowerCase().includes(term) || t.id.toLowerCase().includes(term);
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "name-asc": return a.name.localeCompare(b.name);
      case "name-desc": return b.name.localeCompare(a.name);
      case "newest": return b.createdAt - a.createdAt;
      case "oldest": return a.createdAt - b.createdAt;
      case "members-desc": return b.memberCount - a.memberCount;
      case "members-asc": return a.memberCount - b.memberCount;
      default: return 0;
    }
  });

  function handleToggle(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  return (
    <div className="panel__section">
      <div className="action-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4>Registered Tribes ({tribes.length})</h4>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button className="btn btn--ghost btn--sm" onClick={refetch} disabled={isLoading}>
              {isLoading ? "..." : "Refresh"}
            </button>
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
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="members-desc">Members (most first)</option>
              <option value="members-asc">Members (least first)</option>
            </select>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or ID..."
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "3px",
                  padding: "0.25rem 1.6rem 0.25rem 0.5rem",
                  color: "var(--text)",
                  fontFamily: "var(--font)",
                  fontSize: "0.78rem",
                  width: "200px",
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{
                    position: "absolute", right: "0.3rem", background: "none",
                    border: "none", color: "var(--muted)", cursor: "pointer",
                    fontSize: "0.9rem", lineHeight: 1, padding: 0,
                  }}
                  aria-label="Clear search"
                >
                  x
                </button>
              )}
            </div>
          </div>
        </div>

        {isLoading && <p className="muted">Loading tribes...</p>}

        {!isLoading && sorted.length === 0 && (
          <p className="muted">No tribes match the current search.</p>
        )}

        {!isLoading && sorted.length > 0 && (
          <div className="accordion-list" style={{ marginTop: "0.75rem" }}>
            {sorted.map(tribe => (
              <TribeAccordionRow
                key={tribe.id}
                tribe={tribe}
                isExpanded={expandedId === tribe.id}
                onToggle={() => handleToggle(tribe.id)}
                onDetails={setDetailsTribe}
              />
            ))}
          </div>
        )}
      </div>

      {detailsTribe && (
        <TribeDetailsWindow
          tribe={detailsTribe}
          ownerCapId={ownerCapId}
          onClose={() => {
            setDetailsTribe(null);
            setTimeout(() => refetch(), 1500);
          }}
        />
      )}
    </div>
  );
}
