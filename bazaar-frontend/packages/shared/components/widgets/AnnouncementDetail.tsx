// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState } from "react";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import type { AnnouncementData } from "@bazaar/shared/hooks/useAnnouncements";
import {
  buildAddComment,
  buildDeleteComment,
  buildDeleteAnnouncement,
} from "@bazaar/shared/tx/shared_widgets/announcements-tx";
import {
  ANNOUNCEMENT_BOARD_ID,
  PACKAGE_IDS,
} from "@bazaar/shared/constants";
import WriteAnnouncementModal from "@bazaar/shared/components/widgets/WriteAnnouncementModal";

interface Props {
  announcement: AnnouncementData;
  onClose:      () => void;
  canComment:   boolean;
  canDelete:    boolean;
  canEdit:      boolean;
  onRefresh:    () => void;
  /** Per-SSU AnnouncementBoard id (from SSUGovernance). Falls back to the legacy
   *  global ANNOUNCEMENT_BOARD_ID (empty in current deployments) when omitted. */
  boardId?:     string;
}

const VISIBILITY_LABEL: Record<number, string> = {
  0: "Public",
  1: "Member+",
  2: "Admin+",
};

function formatDate(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const COMMENTS_PAGE_SIZE = 10;

export default function AnnouncementDetail({
  announcement,
  onClose,
  canComment,
  canDelete,
  canEdit,
  onRefresh,
  boardId,
}: Props) {
  const { isConnected, walletAddress } = useConnection();
  const effectiveBoardId = (boardId ?? ANNOUNCEMENT_BOARD_ID) || "";
  const [commentText, setCommentText]     = useState("");
  const [submitting, setSubmitting]       = useState(false);
  const [showAll, setShowAll]             = useState(false);
  const [editOpen, setEditOpen]           = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const visibleComments = showAll
    ? announcement.comments
    : announcement.comments.slice(0, COMMENTS_PAGE_SIZE);

  const hasMoreComments =
    !showAll && announcement.comments.length > COMMENTS_PAGE_SIZE;

  async function handleSubmitComment() {
    if (!commentText.trim()) return;
    if (!walletAddress) { setError("Wallet not connected."); return; }
    if (!effectiveBoardId) { setError("No announcement board for this SSU."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const tx = buildAddComment({
        boardId:        effectiveBoardId,
        callerPackage:  PACKAGE_IDS.BAZAAR_CORE,
        announcementId: announcement.id,
        text:           commentText.trim(),
        author:         walletAddress,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setCommentText("");
      onRefresh();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteComment(idx: number) {
    if (!effectiveBoardId) { setError("No announcement board for this SSU."); return; }
    if (!confirm("Delete this comment?")) return;
    setError(null);
    try {
      const tx = buildDeleteComment({
        boardId:        effectiveBoardId,
        callerPackage:  PACKAGE_IDS.BAZAAR_CORE,
        announcementId: announcement.id,
        commentIdx:     idx,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onRefresh();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed.");
    }
  }

  async function handleDelete() {
    if (!effectiveBoardId) { setError("No announcement board for this SSU."); return; }
    if (!confirm(`Delete announcement "${announcement.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      const tx = buildDeleteAnnouncement({
        boardId:        effectiveBoardId,
        callerPackage:  PACKAGE_IDS.BAZAAR_CORE,
        announcementId: announcement.id,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onRefresh();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed.");
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal modal--wide announcement-detail"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="modal__header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
              {announcement.isSticky && (
                <span className="announcement-bar__pin">[PIN]</span>
              )}
              <h2 style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {announcement.title}
              </h2>
            </div>
            <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
              {canEdit && (
                <button className="btn btn--ghost btn--sm" onClick={() => setEditOpen(true)}>
                  Edit
                </button>
              )}
              {canDelete && (
                <button className="btn btn--danger btn--sm" onClick={handleDelete}>
                  Delete
                </button>
              )}
              <button className="btn btn--ghost btn--sm" onClick={onClose}>
                X
              </button>
            </div>
          </div>

          {/* Meta */}
          <div style={{ display: "flex", gap: "1rem", fontSize: "0.78rem", color: "var(--muted)" }}>
            <span>By {truncateAddress(announcement.author)}</span>
            <span>{formatDate(announcement.createdAtMs)}</span>
            <span className={`badge--visibility badge--visibility-${announcement.visibility}`}>
              {VISIBILITY_LABEL[announcement.visibility] ?? `Vis ${announcement.visibility}`}
            </span>
          </div>

          {/* Body */}
          <div className="announcement-detail__body">
            {announcement.body.split("\n").map((line, i) => (
              <p key={i} style={{ lineHeight: "1.6", marginBottom: "0.25rem" }}>
                {line || "\u00A0"}
              </p>
            ))}
          </div>

          {/* Error */}
          {error && (
            <p style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{error}</p>
          )}

          {/* Comments */}
          <div className="announcement-detail__comments">
            <h3 style={{ fontSize: "0.85rem", letterSpacing: "0.06em", color: "var(--accent)", marginBottom: "0.5rem" }}>
              COMMENTS ({announcement.comments.length})
            </h3>

            {visibleComments.length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>No comments yet.</p>
            )}

            {visibleComments.map((c, i) => (
              <div key={i} className="announcement-comment">
                <div className="announcement-comment__meta">
                  <span>{truncateAddress(c.author)}</span>
                  <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>{formatDate(c.createdAtMs)}</span>
                  {canDelete && (
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => handleDeleteComment(i)}
                      style={{ marginLeft: "auto", fontSize: "0.7rem" }}
                    >
                      Del
                    </button>
                  )}
                </div>
                <p className="announcement-comment__text">{c.text}</p>
              </div>
            ))}

            {hasMoreComments && (
              <button className="btn btn--link" onClick={() => setShowAll(true)}>
                Load more ({announcement.comments.length - COMMENTS_PAGE_SIZE} remaining)
              </button>
            )}
          </div>

          {/* Comment input */}
          {canComment && isConnected && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <textarea
                className="input"
                placeholder="Write a comment..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                rows={3}
                maxLength={300}
                style={{ resize: "vertical", minHeight: "60px" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  {commentText.length}/300
                </span>
                <button
                  className="btn btn--primary btn--sm"
                  onClick={handleSubmitComment}
                  disabled={submitting || !commentText.trim()}
                >
                  {submitting ? "Posting..." : "Post Comment"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <WriteAnnouncementModal
          boardId={effectiveBoardId}
          onClose={() => setEditOpen(false)}
          onSuccess={() => { setEditOpen(false); onRefresh(); }}
          editMode={{
            id:         announcement.id,
            title:      announcement.title,
            body:       announcement.body,
            visibility: announcement.visibility,
          }}
          maxVisibility={2}
        />
      )}
    </>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
