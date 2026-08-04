// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V31 — Bazaar News read hooks (dapp_hub::bazaar_news), backing the BazaarBeacon.
 *
 *  - useBazaarNews()        → all news posts (newest first) + the comments Table id.
 *  - useNewsComments(...)    → comments for one post (keyed dynamic-field read).
 *  - useMyPollVotes(addr)    → Map<postId, optionIndex> for the connected wallet,
 *                             derived from PollVoted events. This is how the UI knows
 *                             whether YOU have voted (and your choice) so it can reveal
 *                             results only after you vote — no struct-keyed RPC reads.
 *
 * All disabled (return empty) until BAZAAR_NEWS_BOARD_ID is set post-publish.
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../sui-client";
import { BAZAAR_NEWS_BOARD_ID, PACKAGE_IDS, MODULES } from "@bazaar/shared/constants";

export interface NewsPostFE {
  id: number;
  title: string;
  body: string;
  postedAtMs: number;
  postedBy: string;
  hasPoll: boolean;
  pollQuestion: string;
  pollOptions: string[];
  tallies: number[];
  /** total votes = sum(tallies). */
  totalVotes: number;
}

export interface NewsCommentFE {
  id: number;
  author: string;
  body: string;
  postedAtMs: number;
}

export interface BazaarNewsData {
  posts: NewsPostFE[];
  commentsTableId: string | null;
}

type AnyFields = { fields?: Record<string, unknown> } | undefined;

function parsePost(raw: unknown): NewsPostFE | null {
  const f = (raw as AnyFields)?.fields;
  if (!f) return null;
  const pollOptions = Array.isArray(f.poll_options) ? (f.poll_options as unknown[]).map(String) : [];
  const tallies = Array.isArray(f.tallies) ? (f.tallies as unknown[]).map(v => Number(v)) : [];
  return {
    id: Number(f.id ?? 0),
    title: String(f.title ?? ""),
    body: String(f.body ?? ""),
    postedAtMs: Number(f.posted_at_ms ?? 0),
    postedBy: String(f.posted_by ?? ""),
    hasPoll: Boolean(f.has_poll ?? false),
    pollQuestion: String(f.poll_question ?? ""),
    pollOptions,
    tallies,
    totalVotes: tallies.reduce((a, b) => a + b, 0),
  };
}

export function useBazaarNews(pollMs = 30_000) {
  return useQuery<BazaarNewsData>({
    queryKey: ["dapphub", "bazaar-news", BAZAAR_NEWS_BOARD_ID],
    enabled: !!BAZAAR_NEWS_BOARD_ID,
    refetchInterval: pollMs,
    queryFn: async (): Promise<BazaarNewsData> => {
      const obj = await suiClient.getObject({ id: BAZAAR_NEWS_BOARD_ID, options: { showContent: true } });
      const fields = (obj.data?.content as AnyFields)?.fields;
      if (!fields) return { posts: [], commentsTableId: null };
      const rawPosts = Array.isArray(fields.posts) ? (fields.posts as unknown[]) : [];
      const posts = rawPosts
        .map(parsePost)
        .filter((p): p is NewsPostFE => p !== null)
        .sort((a, b) => b.id - a.id); // newest first
      const commentsTableId =
        ((fields.comments as { fields?: { id?: { id?: string } } } | undefined)?.fields?.id?.id) ?? null;
      return { posts, commentsTableId };
    },
  });
}

export function useNewsComments(commentsTableId: string | null, postId: number | null, pollMs = 30_000) {
  return useQuery<NewsCommentFE[]>({
    queryKey: ["dapphub", "bazaar-news-comments", commentsTableId, postId],
    enabled: !!commentsTableId && postId != null,
    refetchInterval: pollMs,
    queryFn: async (): Promise<NewsCommentFE[]> => {
      const r = await suiClient.getDynamicFieldObject({
        parentId: commentsTableId!,
        name: { type: "u64", value: String(postId) },
      });
      const list = (r.data?.content as AnyFields)?.fields?.value;
      if (!Array.isArray(list)) return [];
      return (list as unknown[])
        .map((raw): NewsCommentFE | null => {
          const f = (raw as AnyFields)?.fields;
          if (!f) return null;
          return {
            id: Number(f.id ?? 0),
            author: String(f.author ?? ""),
            body: String(f.body ?? ""),
            postedAtMs: Number(f.posted_at_ms ?? 0),
          };
        })
        .filter((c): c is NewsCommentFE => c !== null);
    },
  });
}

/**
 * Map of postId → the option index the wallet voted for. Derived from PollVoted events
 * (filtered client-side by voter). Lets the UI reveal results only after the user votes.
 */
export function useMyPollVotes(address: string | null) {
  return useQuery<Map<number, number>>({
    queryKey: ["dapphub", "bazaar-news-myvotes", address],
    enabled: !!address && !!BAZAAR_NEWS_BOARD_ID,
    queryFn: async (): Promise<Map<number, number>> => {
      const evType = `${PACKAGE_IDS.DAPP_HUB}::${MODULES.BAZAAR_NEWS}::PollVoted`;
      const res = await suiClient.queryEvents({
        query: { MoveEventType: evType },
        limit: 1000,
        order: "descending",
      });
      const out = new Map<number, number>();
      for (const e of res.data) {
        const p = e.parsedJson as { post_id?: unknown; voter?: unknown; option_index?: unknown } | null;
        if (!p) continue;
        if (String(p.voter).toLowerCase() !== address!.toLowerCase()) continue;
        const postId = Number(p.post_id);
        // descending order → first seen is the latest; don't overwrite.
        if (!out.has(postId)) out.set(postId, Number(p.option_index));
      }
      return out;
    },
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
