// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";
import { useAnnouncements } from "@bazaar/shared/hooks/useAnnouncements";
import { useOwnedCaps } from "@bazaar/shared/hooks/useOwnedCaps";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import AnnouncementDetail from "@bazaar/shared/components/widgets/AnnouncementDetail";
import WriteAnnouncementModal from "@bazaar/shared/components/widgets/WriteAnnouncementModal";
import type { Screen } from "@bazaar/shared/types";
import type { AnnouncementData } from "@bazaar/shared/hooks/useAnnouncements";

interface Props {
  nav: (s: Screen) => void;
}

const PAGE_SIZE = 15;

const VISIBILITY_LABEL: Record<number, string> = {
  0: "Public",
  1: "Member+",
  2: "Admin+",
};

function formatDate(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default function ArchivePage({ nav }: Props) {
  const { isConnected } = useConnection();
  // AnnouncementBoards are per-SSU (id on SSUGovernance) — the legacy global
  // ANNOUNCEMENT_BOARD_ID is empty, so resolve the current SSU's board.
  const { data: sharedObjects } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const announcementBoardId = sharedObjects?.announcementBoardId ?? "";
  const { announcements, loading, refetch } = useAnnouncements(announcementBoardId || null);
  const { hasOwnerCap, hasSuperAdminCap, hasAdminCap, hasModCap } = useOwnedCaps();
  const canWrite = hasOwnerCap || hasSuperAdminCap || hasAdminCap || hasModCap;
  const maxVis = canWrite ? 2 : 1;

  const [page, setPage]             = useState(0);
  const [expanded, setExpanded]     = useState<number | null>(null);
  const [selected, setSelected]     = useState<AnnouncementData | null>(null);
  const [filterVis, setFilterVis]   = useState<number>(-1);
  const [showWrite, setShowWrite]   = useState(false);

  const readable = announcements.filter(a => {
    if (!isConnected && a.visibility > 0) return false;
    if (a.visibility > maxVis) return false;
    if (filterVis >= 0 && a.visibility !== filterVis) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(readable.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const pageItems  = readable.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function handlePageChange(delta: number) {
    setPage(p => Math.max(0, Math.min(totalPages - 1, p + delta)));
    setExpanded(null);
  }

  return (
    <div className="panel archive-page">
      <div className="panel__header">
        <button className="btn btn--ghost btn--sm" onClick={() => nav("landing")}>
          Back
        </button>
        <h2>News</h2>
        {canWrite && (
          <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
            <button className="btn btn--primary btn--sm" onClick={() => setShowWrite(true)}>
              Write
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => nav("manage-announcements")}>
              Manage
            </button>
          </div>
        )}
      </div>

      <div className="panel__section" style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Filter:</span>
        {([
          { label: "All", value: -1 },
          { label: "Public", value: 0 },
          { label: "Member+", value: 1 },
          { label: "Admin+", value: 2 },
        ] as const).map(opt => (
          opt.value <= maxVis || opt.value === -1 ? (
            <button
              key={opt.value}
              className={`btn btn--sm ${filterVis === opt.value ? "btn--primary" : "btn--ghost"}`}
              onClick={() => { setFilterVis(opt.value); setPage(0); }}
            >
              {opt.label}
            </button>
          ) : null
        ))}
        <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--muted)" }}>
          {readable.length} announcement{readable.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="panel__section" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1, overflowY: "auto" }}>
        {loading && <p className="muted">Loading...</p>}

        {!loading && pageItems.length === 0 && (
          <p className="muted">No announcements to display.</p>
        )}

        {!loading && pageItems.map(a => (
          <div
            key={a.id}
            className="archive-page__item"
            style={{
              background: "var(--surface2)",
              border: `1px solid ${a.isSticky ? "var(--accent)" : "rgba(204,112,0,0.2)"}`,
              borderRadius: "4px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                cursor: "pointer",
              }}
              onClick={() => setExpanded(prev => (prev === a.id ? null : a.id))}
            >
              {a.isSticky && (
                <span style={{ color: "var(--accent)", fontSize: "0.72rem" }}>[PIN]</span>
              )}
              <span style={{ flex: 1, fontWeight: "bold", fontSize: "0.88rem" }}>
                {a.title}
              </span>
              <span
                style={{
                  fontSize: "0.7rem",
                  background: "rgba(204,112,0,0.12)",
                  border: "1px solid var(--accent)",
                  borderRadius: "3px",
                  padding: "1px 5px",
                }}
              >
                {VISIBILITY_LABEL[a.visibility] ?? `Vis ${a.visibility}`}
              </span>
              <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>
                {formatDate(a.createdAtMs)}
              </span>
              <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                {expanded === a.id ? "[^]" : "[v]"}
              </span>
            </div>

            {expanded === a.id && (
              <div
                style={{
                  borderTop: "1px solid rgba(204,112,0,0.15)",
                  padding: "0.75rem",
                  fontSize: "0.85rem",
                  lineHeight: "1.6",
                }}
              >
                {a.body.split("\n").map((line, i) => (
                  <p key={i} style={{ marginBottom: "0.2rem" }}>{line || "\u00A0"}</p>
                ))}
                <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button className="btn btn--link" onClick={() => setSelected(a)}>
                    View comments ({a.comments.length})
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "1rem",
            padding: "0.75rem",
            borderTop: "1px solid rgba(204,112,0,0.2)",
            fontSize: "0.85rem",
          }}
        >
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => handlePageChange(-1)}
            disabled={safePage === 0}
          >
            Prev
          </button>
          <span style={{ color: "var(--muted)" }}>
            Page {safePage + 1} of {totalPages}
          </span>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => handlePageChange(1)}
            disabled={safePage >= totalPages - 1}
          >
            Next
          </button>
        </div>
      )}

      {selected && (
        <AnnouncementDetail
          announcement={selected}
          onClose={() => setSelected(null)}
          canComment={isConnected}
          canDelete={false}
          canEdit={false}
          onRefresh={() => { refetch(); setSelected(null); }}
          boardId={announcementBoardId}
        />
      )}

      {showWrite && (
        <WriteAnnouncementModal
          boardId={announcementBoardId}
          onClose={() => setShowWrite(false)}
          onSuccess={() => { setShowWrite(false); refetch(); }}
          maxVisibility={2}
        />
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
