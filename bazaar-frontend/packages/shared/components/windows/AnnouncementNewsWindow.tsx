// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * AnnouncementNewsWindow — the in-world News beacon window.
 *
 * Opened by clicking the in-world News/Announcement beacon OR the HUD News →
 * "Tribe News" menu item. Shows ONE combined news feed for this SSU: tribe
 * announcements and SSU-local announcements listed consecutively, newest first
 * (sticky pinned to top). There is no tribe/SSU split — a tribe-wide
 * announcement is physically written into every SSU's AnnouncementBoard by the
 * Tribe-Governance → Admin → "Tribe Announcement" broadcast
 * (buildBroadcastTribeAnnouncement), so it already lives in this SSU's board and
 * appears inline as ordinary news.
 *
 * Write button (role-gated, header toolbar):
 *   • Write SSU News — shown to SSU admin+ (canWriteSSU). Posts via the
 *     soft-check shared_widgets::create_announcement path (FE-enforced role).
 * Tribe-wide posting now lives in Tribe Governance (Admin → Tribe Announcement),
 * not here — that surface broadcasts to every SSU at once.
 *
 * Reuses the .market-window chrome (CEF-clickable over the Godot canvas) + the
 * shared AnnouncementDetail modal for the per-item read/comment view.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState, useCallback } from "react";
import WindowHeader from "@bazaar/shared/components/windows/WindowHeader";
import AnnouncementDetail from "@bazaar/shared/components/widgets/AnnouncementDetail";
import WriteAnnouncementModal from "@bazaar/shared/components/widgets/WriteAnnouncementModal";
import { useAnnouncements, type AnnouncementData } from "@bazaar/shared/hooks/useAnnouncements";

const ACCENT = "#cc7000";
const PREVIEW_COUNT = 8;

interface Props {
  /** This SSU's AnnouncementBoard id (SSUGovernance.announcement_board_id). */
  ssuBoardId?: string;
  /** True for SSU admin+ — shows "Write SSU News". */
  canWriteSSU: boolean;
  /** Connected wallet (gates commenting in the detail view). */
  walletAddress: string | null;
  onClose: () => void;
}

export default function AnnouncementNewsWindow({
  ssuBoardId, canWriteSSU, walletAddress, onClose,
}: Props) {
  const { announcements, loading, refetch } = useAnnouncements(ssuBoardId);

  const [selected, setSelected]   = useState<AnnouncementData | null>(null);
  const [writeSSU, setWriteSSU]   = useState(false);
  const [archiveOpen, setArchive] = useState(false);

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  const shown   = archiveOpen ? announcements : announcements.slice(0, PREVIEW_COUNT);
  const hasMore = announcements.length > PREVIEW_COUNT;

  return (
    <div className="market-window">
      <WindowHeader title="NEWS" onClose={onClose} />

      <div className="market-window__body scroll-area">
        {/* Write toolbar (role-gated) */}
        {canWriteSSU && (
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.7rem" }}>
            <button className="btn btn--primary btn--sm" onClick={() => setWriteSSU(true)}>
              + Write SSU News
            </button>
          </div>
        )}

        {/* Single combined feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {loading && announcements.length === 0 && (
            <p className="muted" style={{ fontSize: "0.78rem" }}>Loading…</p>
          )}
          {!loading && announcements.length === 0 && (
            <p className="muted" style={{ fontSize: "0.78rem" }}>
              {ssuBoardId ? "No news yet." : "This SSU has no news board yet."}
            </p>
          )}

          {shown.map((ann, i) => (
            <div
              key={ann.id ?? i}
              onClick={() => setSelected(ann)}
              style={{
                cursor: "pointer", padding: "0.5rem 0.6rem",
                background: "rgba(204,112,0,0.06)",
                border: "1px solid rgba(204,112,0,0.15)", borderRadius: "0.3rem",
                transition: "background 0.2s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(204,112,0,0.14)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(204,112,0,0.06)"; }}
            >
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "baseline" }}>
                {ann.isSticky && <span style={{ color: ACCENT, fontSize: "0.66rem" }}>[PIN]</span>}
                <span style={{ color: ACCENT, fontSize: "0.85rem", fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ann.title}
                </span>
              </div>
              <div style={{ color: "#888", fontSize: "0.72rem", marginTop: "0.15rem" }}>
                {ann.body.length > 90 ? ann.body.slice(0, 90) + "…" : ann.body}
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setArchive(o => !o)}
              style={{ alignSelf: "flex-start", marginTop: "0.1rem" }}
            >
              {archiveOpen ? "Show recent ▴" : `Archive — ${announcements.length} total ▾`}
            </button>
          )}
        </div>
      </div>

      {/* Per-item read / comment view (shared modal) */}
      {selected && (
        <AnnouncementDetail
          announcement={selected}
          boardId={ssuBoardId ?? ""}
          canComment={!!walletAddress}
          canDelete={false}
          canEdit={false}
          onRefresh={onRefresh}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Write SSU News — soft-check path, FE role-gated */}
      {writeSSU && (
        <WriteAnnouncementModal
          boardId={ssuBoardId}
          maxVisibility={2}
          onClose={() => setWriteSSU(false)}
          onSuccess={() => { setWriteSSU(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
