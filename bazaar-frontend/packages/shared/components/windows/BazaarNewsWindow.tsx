// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarNewsWindow — V31 in-world BazaarBeacon panel (opened by clicking the
 * in-world Bazaar News beacon). Shows the latest DApp news; each post may carry a
 * poll (vote → results revealed only after you vote) and a comment thread.
 *
 * Reuses the .market-window chrome so it matches the in-game Bazaar aesthetic and is
 * CEF-clickable over the Godot canvas. Votes/comments are on-chain (own gas) via dAppKit.
 */

import { useState, useCallback } from "react";
import { useConnection, dAppKit, abbreviateAddress } from "@evefrontier/dapp-kit";
import { BAZAAR_NEWS_BOARD_ID } from "@bazaar/shared/constants";
import { buildVotePoll, buildPostComment } from "@bazaar/shared/tx/dapp_hub/news-tx";
import {
  useBazaarNews,
  useNewsComments,
  useMyPollVotes,
  type NewsPostFE,
} from "@bazaar/shared/hooks/dapp_hub/news-hooks";
import WindowHeader from "@bazaar/shared/components/windows/WindowHeader";

interface Props { onClose: () => void; }

const ACCENT = "#cc7000";

function fmtTime(ms: number): string {
  if (!ms) return "";
  try { return new Date(ms).toLocaleString(); } catch { return ""; }
}

// ─── Poll: vote buttons (pre-vote) or result bars (post-vote) ────────────────
function PollBlock({
  post, myChoice, boardReady, onVoted,
}: { post: NewsPostFE; myChoice: number | undefined; boardReady: boolean; onVoted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vote = useCallback(async (optionIndex: number) => {
    setBusy(true); setError(null);
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildVotePoll({ postId: post.id, optionIndex }),
      });
      onVoted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }, [post.id, onVoted]);

  if (!post.hasPoll) return null;

  const voted = myChoice != null;
  const total = post.totalVotes;

  return (
    <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <div style={{ fontSize: "0.8rem", color: ACCENT }}>{post.pollQuestion}</div>
      {post.pollOptions.map((opt, i) => {
        if (voted) {
          const count = post.tallies[i] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={i} style={{ fontSize: "0.74rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: myChoice === i ? 700 : 400 }}>
                  {opt}{myChoice === i ? " ✓" : ""}
                </span>
                <span className="muted">{count} · {pct}%</span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
                <div style={{ width: `${pct}%`, height: "100%", background: ACCENT, borderRadius: 3 }} />
              </div>
            </div>
          );
        }
        return (
          <button
            key={i}
            className="btn btn--ghost btn--sm"
            disabled={busy || !boardReady}
            onClick={() => vote(i)}
            style={{ textAlign: "left" }}
          >
            {opt}
          </button>
        );
      })}
      {voted && <div className="muted" style={{ fontSize: "0.7rem" }}>{total} vote{total === 1 ? "" : "s"}</div>}
      {!voted && <div className="muted" style={{ fontSize: "0.68rem" }}>Vote to see results.</div>}
      {error && <div style={{ color: "#e55555", fontSize: "0.72rem" }}>{error}</div>}
    </div>
  );
}

// ─── Comments thread + add box ───────────────────────────────────────────────
function CommentsBlock({
  postId, commentsTableId, boardReady,
}: { postId: number; commentsTableId: string | null; boardReady: boolean }) {
  const { data: comments, refetch } = useNewsComments(commentsTableId, postId);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!body.trim()) return;
    setBusy(true); setError(null);
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildPostComment({ postId, body: body.trim() }),
      });
      setBody("");
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }, [postId, body, refetch]);

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div className="muted" style={{ fontSize: "0.72rem" }}>Comments ({comments?.length ?? 0})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", margin: "0.25rem 0" }}>
        {(comments ?? []).map(c => (
          <div key={c.id} style={{ fontSize: "0.74rem" }}>
            <span className="muted">{abbreviateAddress(c.author)}:</span> {c.body}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <input
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Add a comment…"
          style={{
            flex: 1, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)",
            color: "#e8e8e8", padding: "0.25rem 0.5rem", fontSize: "0.76rem",
          }}
        />
        <button className="btn btn--ghost btn--sm" disabled={busy || !boardReady || !body.trim()} onClick={submit}>
          Send
        </button>
      </div>
      {error && <div style={{ color: "#e55555", fontSize: "0.72rem" }}>{error}</div>}
    </div>
  );
}

export default function BazaarNewsWindow({ onClose }: Props) {
  const { walletAddress } = useConnection();
  const { data, isLoading, refetch } = useBazaarNews();
  const { data: myVotes, refetch: refetchVotes } = useMyPollVotes(walletAddress ?? null);
  const boardReady = !!BAZAAR_NEWS_BOARD_ID;

  const onVoted = useCallback(() => { refetch(); refetchVotes(); }, [refetch, refetchVotes]);

  return (
    <div className="market-window">
      <WindowHeader title="BAZAAR NEWS" onClose={onClose} />

      <div className="market-window__body scroll-area">
        {!boardReady && (
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            Bazaar News is not live yet — available after the next DApp publish.
          </p>
        )}
        {boardReady && isLoading && <p className="muted" style={{ fontSize: "0.8rem" }}>Loading news…</p>}
        {boardReady && !isLoading && (data?.posts.length ?? 0) === 0 && (
          <p className="muted" style={{ fontSize: "0.82rem" }}>No news yet. Check back soon.</p>
        )}

        {(data?.posts ?? []).map(post => (
          <div
            key={post.id}
            style={{
              border: "1px solid rgba(255,255,255,0.12)", borderRadius: "0.4rem",
              padding: "0.7rem", marginBottom: "0.6rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
              <strong style={{ color: ACCENT }}>{post.title}</strong>
              <span className="muted" style={{ fontSize: "0.66rem", whiteSpace: "nowrap" }}>{fmtTime(post.postedAtMs)}</span>
            </div>
            <div style={{ fontSize: "0.8rem", whiteSpace: "pre-wrap", marginTop: "0.25rem" }}>{post.body}</div>

            <PollBlock post={post} myChoice={myVotes?.get(post.id)} boardReady={boardReady} onVoted={onVoted} />
            <CommentsBlock postId={post.id} commentsTableId={data?.commentsTableId ?? null} boardReady={boardReady} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
