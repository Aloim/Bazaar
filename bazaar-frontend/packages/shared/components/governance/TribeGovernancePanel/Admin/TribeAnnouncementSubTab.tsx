// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeAnnouncementSubTab — Tribe-Governance → Admin → "Tribe Announcement".
 *
 * A title+body form that BROADCASTS one tribe announcement to every SSU in the
 * tribe in a single PTB (buildBroadcastTribeAnnouncement → one
 * bazaar_mission::announcement_proxy::tribe_post_announcement per SSU board).
 * Because the post is physically written into each SSU's AnnouncementBoard, it
 * shows up in that SSU's single in-world news feed alongside SSU-local news —
 * there is no separate tribe column anymore.
 *
 * Gate: requires a TribeAdminCap whose tribe_id matches the tribe being governed
 * (the Move entry asserts cap.tribe_id == gov.tribe_id). Higher tribe caps
 * (Leader/SuperAdmin) do NOT substitute at the Move layer — a leader who wants
 * to post must hold/grant themselves a TribeAdminCap (SuperAdmin → Caps). This
 * is the same gate the old in-world "Write Tribe News" button used.
 *
 * Shared-surface: rendered under TribeAdminTab, so it lands on BOTH the in-game
 * Godot host and the DappHub host.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeBoardIds } from "@bazaar/shared/hooks/useTribeBoardIds";
import { buildBroadcastTribeAnnouncement } from "@bazaar/shared/tx/bazaarcore/announcement-tx";

const TITLE_MAX = 100;
const BODY_MAX  = 500;

export interface TribeAnnouncementSubTabProps {
  /** The tribe being governed (panel context: leader/superadmin tribe idx). */
  tribeIdx: number | null;
}

export function TribeAnnouncementSubTab({ tribeIdx }: TribeAnnouncementSubTabProps) {
  const { adminCapId, adminTribeIdx } = useTribeCaps();
  const { boardIds, tribeGovId, ssuCount, isLoading, refetch } = useTribeBoardIds(tribeIdx);

  const [title, setTitle]           = useState("");
  const [body, setBody]             = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [done, setDone]             = useState<number | null>(null);

  // The Move entry requires a TribeAdminCap matching THIS tribe's TribeGovernance.
  const hasMatchingAdminCap =
    !!adminCapId && adminTribeIdx != null && tribeIdx != null && adminTribeIdx === tribeIdx;
  const canPost = hasMatchingAdminCap && !!tribeGovId && boardIds.length > 0;
  const isBusy  = submitting || confirming;

  async function handlePublish() {
    if (!title.trim()) { setError("Title is required."); return; }
    if (!body.trim())  { setError("Body is required.");  return; }
    if (!adminCapId || !tribeGovId || boardIds.length === 0) {
      setError("Tribe announcement target not resolved yet.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setDone(null);
    try {
      const tx = buildBroadcastTribeAnnouncement({
        tribeAdminCapId:   adminCapId,
        tribeGovernanceId: tribeGovId,
        boardIds,
        title:      title.trim(),
        body:       body.trim(),
        visibility: 0, // public — every tribe member
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setSubmitting(false);
      setConfirming(true);
      await new Promise<void>(r => setTimeout(r, 3000));
      setConfirming(false);
      setDone(boardIds.length);
      setTitle("");
      setBody("");
      refetch();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed.");
      setSubmitting(false);
      setConfirming(false);
    }
  }

  // ── No-cap guard ───────────────────────────────────────────────────────────
  if (!hasMatchingAdminCap) {
    return (
      <div className="action-card">
        <h4>Tribe Announcement</h4>
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          Posting a tribe-wide announcement requires a <strong>Tribe Admin</strong>{" "}
          capability for this tribe. Grant one to your wallet in{" "}
          <strong>SuperAdmin → Caps</strong>, then return here.
        </p>
      </div>
    );
  }

  return (
    <div className="action-card">
      <h4>Tribe Announcement</h4>
      <p className="muted" style={{ fontSize: "0.8rem" }}>
        Publishes to the news feed of{" "}
        <strong>{isLoading ? "…" : `${ssuCount} SSU${ssuCount === 1 ? "" : "s"}`}</strong>{" "}
        in this tribe at once. It appears as ordinary news in each SSU's in-world
        News beacon, listed alongside that SSU's own announcements.
      </p>

      {confirming && (
        <p style={{ fontSize: "0.9rem" }}>
          Broadcasting to {boardIds.length} SSU feed{boardIds.length === 1 ? "" : "s"}
          <span className="loading-dots">...</span>
        </p>
      )}

      {!confirming && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.5rem" }}>
            <label style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Title</label>
            <input
              className="input"
              type="text"
              value={title}
              onChange={e => { setTitle(e.target.value); setDone(null); }}
              maxLength={TITLE_MAX}
              placeholder="Tribe announcement title..."
              disabled={isBusy}
            />
            <span style={{ fontSize: "0.68rem", color: "var(--muted)", textAlign: "right" }}>
              {title.length}/{TITLE_MAX}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.5rem" }}>
            <label style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Body</label>
            <textarea
              className="input"
              value={body}
              onChange={e => { setBody(e.target.value); setDone(null); }}
              maxLength={BODY_MAX}
              placeholder="Announcement content..."
              rows={6}
              style={{ resize: "vertical", minHeight: "100px" }}
              disabled={isBusy}
            />
            <span style={{ fontSize: "0.68rem", color: "var(--muted)", textAlign: "right" }}>
              {body.length}/{BODY_MAX}
            </span>
          </div>

          {error && <p style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{error}</p>}
          {done !== null && !error && (
            <p style={{ color: "var(--accent, #cc7000)", fontSize: "0.8rem" }}>
              Published to {done} SSU feed{done === 1 ? "" : "s"}.
            </p>
          )}
          {!isLoading && boardIds.length === 0 && (
            <p className="muted" style={{ fontSize: "0.78rem" }}>
              No SSU news boards resolved for this tribe yet — nothing to broadcast to.
            </p>
          )}

          <div style={{ marginTop: "0.75rem" }}>
            <button
              className="btn btn--primary"
              onClick={handlePublish}
              disabled={isBusy || !canPost || !title.trim() || !body.trim()}
            >
              {submitting
                ? "Publishing..."
                : `Publish to ${boardIds.length} SSU feed${boardIds.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
