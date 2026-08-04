// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useAnnouncements } from "@bazaar/shared/hooks/useAnnouncements";
import { useOwnedCaps } from "@bazaar/shared/hooks/useOwnedCaps";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import {
  buildDeleteAnnouncement,
  buildSetSticky,
  buildUnsetSticky,
} from "@bazaar/shared/tx/shared_widgets/announcements-tx";
import {
  SSU_OBJECT_ID,
  PACKAGE_IDS,
} from "@bazaar/shared/constants";
import WriteAnnouncementModal from "@bazaar/shared/components/widgets/WriteAnnouncementModal";
import type { Screen } from "@bazaar/shared/types";
import type { AnnouncementData } from "@bazaar/shared/hooks/useAnnouncements";

interface Props {
  nav: (s: Screen) => void;
}

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

export default function ManageAnnouncements({ nav }: Props) {
  // Per-SSU AnnouncementBoard id (the legacy global ANNOUNCEMENT_BOARD_ID is empty).
  const { data: sharedObjects } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const announcementBoardId = sharedObjects?.announcementBoardId ?? "";
  const { announcements, loading, refetch } = useAnnouncements(announcementBoardId || null);
  const { hasOwnerCap, hasSuperAdminCap, hasAdminCap, hasModCap } = useOwnedCaps();

  const canManage = hasOwnerCap || hasSuperAdminCap || hasAdminCap || hasModCap;

  const [expanded, setExpanded]     = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<AnnouncementData | null>(null);
  const [error, setError]           = useState<string | null>(null);

  function toggleExpand(id: number) {
    setExpanded(prev => (prev === id ? null : id));
  }

  async function handleDelete(a: AnnouncementData) {
    if (!announcementBoardId) { setError("No announcement board for this SSU."); return; }
    if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      const tx = buildDeleteAnnouncement({
        boardId:        announcementBoardId,
        callerPackage:  PACKAGE_IDS.BAZAAR_CORE,
        announcementId: a.id,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      refetch();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed.");
    }
  }

  async function handleSetSticky(a: AnnouncementData) {
    if (!announcementBoardId) { setError("No announcement board for this SSU."); return; }
    setError(null);
    try {
      const tx = buildSetSticky({
        boardId:        announcementBoardId,
        callerPackage:  PACKAGE_IDS.BAZAAR_CORE,
        announcementId: a.id,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      refetch();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed.");
    }
  }

  async function handleUnsetSticky() {
    if (!announcementBoardId) { setError("No announcement board for this SSU."); return; }
    setError(null);
    try {
      const tx = buildUnsetSticky({
        boardId:       announcementBoardId,
        callerPackage: PACKAGE_IDS.BAZAAR_CORE,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      refetch();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed.");
    }
  }

  return (
    <div className="panel manage-announcements">
      <div className="panel__header">
        <button className="btn btn--ghost btn--sm" onClick={() => nav("landing")}>
          Back
        </button>
        <h2>Manage Announcements</h2>
      </div>

      {!canManage && (
        <div className="panel__section">
          <p className="muted">
            You need a ModCap, AdminCap, SuperAdminCap, or OwnerCap to manage announcements.
          </p>
        </div>
      )}

      {canManage && (
        <div className="panel__section" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {error && (
            <p style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{error}</p>
          )}

          {loading && <p className="muted">Loading...</p>}

          {!loading && announcements.length === 0 && (
            <p className="muted">No announcements yet.</p>
          )}

          {!loading && announcements.map(a => (
            <div
              key={a.id}
              className="manage-announcements__item"
              style={{
                background: "var(--surface2)",
                border: "1px solid rgba(204,112,0,0.25)",
                borderRadius: "4px",
              }}
            >
              <div
                className="manage-announcements__row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 0.75rem",
                  cursor: "pointer",
                }}
                onClick={() => toggleExpand(a.id)}
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
                    background: "rgba(204,112,0,0.18)",
                    border: "1px solid var(--accent)",
                    borderRadius: "3px",
                    padding: "1px 6px",
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
                    padding: "0.5rem 0.75rem",
                    display: "flex",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  <button className="btn btn--outline btn--sm" onClick={() => setEditTarget(a)}>
                    Edit
                  </button>
                  <button className="btn btn--danger btn--sm" onClick={() => handleDelete(a)}>
                    Delete
                  </button>
                  {a.isSticky ? (
                    <button className="btn btn--ghost btn--sm" onClick={handleUnsetSticky}>
                      Unpin
                    </button>
                  ) : (
                    <button className="btn btn--ghost btn--sm" onClick={() => handleSetSticky(a)}>
                      Pin as Sticky
                    </button>
                  )}
                  <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: "0.72rem", alignSelf: "center" }}>
                    {a.comments.length} comment{a.comments.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editTarget && (
        <WriteAnnouncementModal
          boardId={announcementBoardId}
          onClose={() => setEditTarget(null)}
          onSuccess={() => { setEditTarget(null); refetch(); }}
          editMode={{
            id:         editTarget.id,
            title:      editTarget.title,
            body:       editTarget.body,
            visibility: editTarget.visibility,
          }}
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
