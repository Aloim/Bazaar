// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState } from "react";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import {
  buildCreateAnnouncement,
  buildEditAnnouncement,
} from "@bazaar/shared/tx";
import {
  ANNOUNCEMENT_BOARD_ID,
  PACKAGE_IDS,
} from "@bazaar/shared/constants";

interface Props {
  onClose:    () => void;
  onSuccess:  () => void;
  editMode?:  { id: number; title: string; body: string; visibility: number };
  maxVisibility: number;
  /** Per-SSU AnnouncementBoard id to post to (from SSUGovernance.announcement_board_id,
   *  resolved via useSSUSharedObjects). Falls back to the legacy global
   *  ANNOUNCEMENT_BOARD_ID when omitted (empty in current deployments). */
  boardId?: string;
}

const VISIBILITY_OPTIONS = [
  { label: "Public (everyone)", value: 0 },
  { label: "Member+ (members and above)", value: 1 },
  { label: "Admin+ (admins and above)", value: 2 },
] as const;

const TITLE_MAX = 100;
const BODY_MAX  = 500;

export default function WriteAnnouncementModal({
  onClose,
  onSuccess,
  editMode,
  maxVisibility,
  boardId,
}: Props) {
  const { walletAddress } = useConnection();
  const effectiveBoardId = (boardId ?? ANNOUNCEMENT_BOARD_ID) || "";
  const [title, setTitle]           = useState(editMode?.title ?? "");
  const [body, setBody]             = useState(editMode?.body ?? "");
  const [visibility, setVisibility] = useState(editMode?.visibility ?? 0);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const isEdit      = !!editMode;
  const allowedOpts = VISIBILITY_OPTIONS.filter(o => o.value <= maxVisibility);

  async function handleSubmit() {
    if (!title.trim()) { setError("Title is required."); return; }
    if (!body.trim())  { setError("Body is required.");  return; }
    if (!walletAddress) { setError("Wallet not connected."); return; }
    if (!effectiveBoardId) {
      setError("No announcement board is set up for this SSU yet. Bootstrap the SSU's shared objects first.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const tx = isEdit
        ? buildEditAnnouncement({
            boardId:        effectiveBoardId,
            callerPackage:  PACKAGE_IDS.BAZAAR_CORE,
            announcementId: editMode!.id,
            newTitle:       title.trim(),
            newBody:        body.trim(),
          })
        : buildCreateAnnouncement({
            boardId:       effectiveBoardId,
            callerPackage: PACKAGE_IDS.BAZAAR_CORE,
            title:         title.trim(),
            body:          body.trim(),
            visibility,
            author:        walletAddress,
          });

      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setSubmitting(false);
      setConfirming(true);
      await new Promise<void>(r => setTimeout(r, 3000));
      setConfirming(false);
      onSuccess();
      return;
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed.");
      setSubmitting(false);
    }
  }

  const isBusy = submitting || confirming;

  return (
    <div className="modal-overlay" onClick={isBusy ? undefined : onClose}>
      <div className="modal write-announcement" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h2>{isEdit ? "Edit Announcement" : "New Announcement"}</h2>
          <button className="btn btn--ghost btn--sm" onClick={isBusy ? undefined : onClose} disabled={isBusy}>X</button>
        </div>

        {confirming && (
          <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <p style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>
              Publishing announcement<span className="loading-dots">...</span>
            </p>
            <p className="muted" style={{ fontSize: "0.8rem" }}>
              Waiting for confirmation.
            </p>
          </div>
        )}

        {!confirming && <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Title</label>
          <input
            className="input"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            placeholder="Announcement title..."
          />
          <span style={{ fontSize: "0.68rem", color: "var(--muted)", textAlign: "right" }}>
            {title.length}/{TITLE_MAX}
          </span>
        </div>}

        {!confirming && <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Body</label>
          <textarea
            className="input"
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={BODY_MAX}
            placeholder="Announcement content..."
            rows={6}
            style={{ resize: "vertical", minHeight: "100px" }}
          />
          <span style={{ fontSize: "0.68rem", color: "var(--muted)", textAlign: "right" }}>
            {body.length}/{BODY_MAX}
          </span>
        </div>}

        {!confirming && !isEdit && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Visibility</label>
            <select
              className="input"
              value={visibility}
              onChange={e => setVisibility(Number(e.target.value))}
            >
              {allowedOpts.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {!confirming && error && (
          <p style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{error}</p>
        )}

        {!confirming && (
          <div className="modal__actions">
            <button className="btn btn--ghost btn--sm" onClick={onClose} disabled={isBusy}>
              Cancel
            </button>
            <button
              className="btn btn--primary"
              onClick={handleSubmit}
              disabled={isBusy || !title.trim() || !body.trim() || !walletAddress}
            >
              {submitting ? "Saving..." : isEdit ? "Save Changes" : "Publish"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
