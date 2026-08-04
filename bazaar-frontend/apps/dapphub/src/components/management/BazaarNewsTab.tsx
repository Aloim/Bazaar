// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V31 — Bazaar News admin tab (DApp Management).
 *
 * Write: author a news post (title + body) with an optional poll (question + 2..8
 * options). Manage: list existing posts with live poll results + comments; delete a
 * whole post or moderate an individual comment. This is also where the owner reviews
 * poll results and comments. DappHub-EXEMPT — calls dAppKit directly.
 *
 * Lights up after the V31 fresh publish sets BAZAAR_NEWS_BOARD_ID (init_bazaar_news_board).
 */

import { useCallback, useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { BAZAAR_NEWS_BOARD_ID } from "@bazaar/shared/constants";
import {
  buildPostNews,
  buildDeleteNews,
  buildDeleteComment,
} from "@bazaar/shared/tx/dapp_hub/news-tx";
import {
  useBazaarNews,
  useNewsComments,
  type NewsPostFE,
} from "@bazaar/shared/hooks/dapp_hub/news-hooks";

interface Props { ownerCapId: string | null; }

const INPUT: React.CSSProperties = {
  background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)",
  color: "#e8e8e8", fontFamily: "monospace", padding: "0.3rem 0.5rem",
  fontSize: "0.8rem", width: "100%", boxSizing: "border-box",
};
const TEXTAREA: React.CSSProperties = { ...INPUT, minHeight: "4.5rem", resize: "vertical" };
const BTN: React.CSSProperties = {
  background: "rgba(204,112,0,0.15)", border: "1px solid rgba(204,112,0,0.6)",
  color: "#cc7000", padding: "0.35rem 0.85rem", fontFamily: "monospace",
  fontSize: "0.78rem", cursor: "pointer", alignSelf: "flex-start",
};
const DANGER_BTN: React.CSSProperties = {
  ...BTN, color: "#e55555", border: "1px solid rgba(229,85,85,0.6)", background: "rgba(229,85,85,0.12)",
};
const ERR: React.CSSProperties = { color: "#e55555", fontSize: "0.75rem" };
const CARD: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: "0.4rem",
  padding: "0.75rem", marginBottom: "0.75rem", display: "flex",
  flexDirection: "column", gap: "0.4rem",
};

async function sign(tx: ReturnType<typeof buildPostNews>): Promise<void> {
  await dAppKit.signAndExecuteTransaction({ transaction: tx });
}

function shortAddr(a: string): string {
  return a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// ─── Poll results bars ───────────────────────────────────────────────────────
function PollResults({ post }: { post: NewsPostFE }) {
  if (!post.hasPoll) return null;
  const total = post.totalVotes;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.25rem" }}>
      <div style={{ fontSize: "0.78rem", color: "#cc7000" }}>{post.pollQuestion}</div>
      {post.pollOptions.map((opt, i) => {
        const count = post.tallies[i] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={i} style={{ fontSize: "0.72rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{opt}</span><span className="muted">{count} · {pct}%</span>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#cc7000", borderRadius: 3 }} />
            </div>
          </div>
        );
      })}
      <div className="muted" style={{ fontSize: "0.68rem" }}>{total} vote{total === 1 ? "" : "s"}</div>
    </div>
  );
}

// ─── Write form ──────────────────────────────────────────────────────────────
function WriteNewsForm({ ownerCapId, onPosted }: { ownerCapId: string; onPosted: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [hasPoll, setHasPoll] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setOption = (i: number, v: string) =>
    setOptions(prev => prev.map((o, idx) => (idx === i ? v : o)));

  const submit = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const cleanOpts = options.map(o => o.trim()).filter(o => o.length > 0);
      if (hasPoll && cleanOpts.length < 2) throw new Error("A poll needs at least 2 non-empty options.");
      await sign(buildPostNews({
        ownerCapId, title: title.trim(), body: body.trim(),
        hasPoll, pollQuestion: hasPoll ? question.trim() : "",
        pollOptions: hasPoll ? cleanOpts : [],
      }));
      setTitle(""); setBody(""); setHasPoll(false); setQuestion(""); setOptions(["", ""]);
      onPosted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }, [ownerCapId, title, body, hasPoll, question, options, onPosted]);

  return (
    <div style={{ ...CARD, gap: "0.5rem" }}>
      <h3 style={{ margin: 0, color: "var(--accent)" }}>Write news</h3>
      <input style={INPUT} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea style={TEXTAREA} placeholder="Body" value={body} onChange={e => setBody(e.target.value)} />
      <label style={{ fontSize: "0.78rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
        <input type="checkbox" checked={hasPoll} onChange={e => setHasPoll(e.target.checked)} />
        Attach a poll
      </label>
      {hasPoll && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <input style={INPUT} placeholder="Poll question" value={question} onChange={e => setQuestion(e.target.value)} />
          {options.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: "0.4rem" }}>
              <input style={INPUT} placeholder={`Option ${i + 1}`} value={o} onChange={e => setOption(i, e.target.value)} />
              {options.length > 2 && (
                <button style={DANGER_BTN} onClick={() => setOptions(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
              )}
            </div>
          ))}
          {options.length < 8 && (
            <button style={BTN} onClick={() => setOptions(prev => [...prev, ""])}>+ Add option</button>
          )}
        </div>
      )}
      {error && <div style={ERR}>{error}</div>}
      <button style={BTN} disabled={busy || !title.trim()} onClick={submit}>
        {busy ? "Posting…" : "Post news"}
      </button>
    </div>
  );
}

// ─── Admin post card (results + comments + moderation) ───────────────────────
function AdminPostCard({
  post, commentsTableId, ownerCapId, onChange,
}: { post: NewsPostFE; commentsTableId: string | null; ownerCapId: string; onChange: () => void }) {
  const { data: comments, refetch } = useNewsComments(commentsTableId, post.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (tx: ReturnType<typeof buildDeleteNews>, after: () => void) => {
    setBusy(true); setError(null);
    try { await sign(tx); after(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, []);

  return (
    <div style={CARD}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
        <strong>#{post.id} · {post.title}</strong>
        <button style={DANGER_BTN} disabled={busy}
          onClick={() => run(buildDeleteNews({ ownerCapId, postId: post.id }), onChange)}>
          Delete post
        </button>
      </div>
      <div style={{ fontSize: "0.78rem", whiteSpace: "pre-wrap" }}>{post.body}</div>
      <PollResults post={post} />

      <div style={{ marginTop: "0.4rem" }}>
        <div className="muted" style={{ fontSize: "0.72rem" }}>
          Comments ({comments?.length ?? 0})
        </div>
        {(comments ?? []).map(c => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", fontSize: "0.74rem", padding: "0.2rem 0" }}>
            <span><span className="muted">{shortAddr(c.author)}:</span> {c.body}</span>
            <button style={DANGER_BTN} disabled={busy}
              onClick={() => run(buildDeleteComment({ ownerCapId, postId: post.id, commentId: c.id }), refetch)}>
              ✕
            </button>
          </div>
        ))}
      </div>
      {error && <div style={ERR}>{error}</div>}
    </div>
  );
}

// ─── Tab root ────────────────────────────────────────────────────────────────
export default function BazaarNewsTab({ ownerCapId }: Props) {
  const { data, isLoading, refetch } = useBazaarNews();

  if (!BAZAAR_NEWS_BOARD_ID) {
    return (
      <div className="panel__section">
        <h3 style={{ marginTop: 0 }}>Bazaar News</h3>
        <p className="muted">
          The Bazaar News board is not configured yet. It becomes available after the
          V31 fresh publish runs <code>init_bazaar_news_board</code> and its id is set
          in <code>VITE_BAZAAR_NEWS_BOARD_ID</code>.
        </p>
      </div>
    );
  }

  if (!ownerCapId) {
    return (
      <div className="panel__section">
        <p className="muted">Connect the DApp owner wallet (DAppOwnerCap) to manage news.</p>
      </div>
    );
  }

  return (
    <div className="panel__section" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <WriteNewsForm ownerCapId={ownerCapId} onPosted={refetch} />

      <h3 style={{ margin: "0.5rem 0 0", color: "var(--accent)" }}>Manage news</h3>
      {isLoading && <p className="muted">Loading…</p>}
      {!isLoading && (data?.posts.length ?? 0) === 0 && <p className="muted">No news posted yet.</p>}
      {(data?.posts ?? []).map(p => (
        <AdminPostCard
          key={p.id}
          post={p}
          commentsTableId={data?.commentsTableId ?? null}
          ownerCapId={ownerCapId}
          onChange={refetch}
        />
      ))}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
