// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V31 — Bazaar News TX builders (dapp_hub::bazaar_news), backing the BazaarBeacon.
 *
 * Admin builders (post/delete news, delete comment) take an ownerCapId and target the
 * DAppOwnerCap-gated entries. User builders (vote, comment) need no cap. Each follows the
 * canonical `(params, tx?) → Transaction` shape so callers can chain into a PTB.
 *
 * File limit: 500 lines | Constitution Article XIV.4.
 */

import { Transaction } from "@mysten/sui/transactions";
import {
  PACKAGE_IDS,
  MODULES,
  BAZAAR_NEWS_BOARD_ID,
  SUI_CLOCK_ID,
} from "@bazaar/shared/constants";

const target = (fn: string) => `${PACKAGE_IDS.DAPP_HUB}::${MODULES.BAZAAR_NEWS}::${fn}`;

// ─── init_bazaar_news_board (one-shot post-publish init) ─────────────────────
export function buildInitBazaarNewsBoard(
  params: { ownerCapId: string },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({ target: target("init_bazaar_news_board"), arguments: [tx.object(params.ownerCapId)] });
  return tx;
}

// ─── post_news (admin) ───────────────────────────────────────────────────────
export function buildPostNews(
  params: {
    ownerCapId: string;
    boardId?: string;
    title: string;
    body: string;
    hasPoll: boolean;
    pollQuestion: string;
    pollOptions: string[];
  },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: target("post_news"),
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.boardId ?? BAZAAR_NEWS_BOARD_ID),
      tx.pure.string(params.title),
      tx.pure.string(params.body),
      tx.pure.bool(params.hasPoll),
      tx.pure.string(params.pollQuestion),
      tx.pure.vector("string", params.pollOptions),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─── delete_news (admin) ─────────────────────────────────────────────────────
export function buildDeleteNews(
  params: { ownerCapId: string; boardId?: string; postId: number | bigint },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: target("delete_news"),
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.boardId ?? BAZAAR_NEWS_BOARD_ID),
      tx.pure.u64(typeof params.postId === "bigint" ? params.postId : BigInt(params.postId)),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─── delete_comment (admin moderation) ───────────────────────────────────────
export function buildDeleteComment(
  params: { ownerCapId: string; boardId?: string; postId: number | bigint; commentId: number | bigint },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: target("delete_comment"),
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(params.boardId ?? BAZAAR_NEWS_BOARD_ID),
      tx.pure.u64(typeof params.postId === "bigint" ? params.postId : BigInt(params.postId)),
      tx.pure.u64(typeof params.commentId === "bigint" ? params.commentId : BigInt(params.commentId)),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─── vote_poll (user) ────────────────────────────────────────────────────────
export function buildVotePoll(
  params: { boardId?: string; postId: number | bigint; optionIndex: number },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: target("vote_poll"),
    arguments: [
      tx.object(params.boardId ?? BAZAAR_NEWS_BOARD_ID),
      tx.pure.u64(typeof params.postId === "bigint" ? params.postId : BigInt(params.postId)),
      tx.pure.u8(params.optionIndex),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ─── post_comment (user) ─────────────────────────────────────────────────────
export function buildPostComment(
  params: { boardId?: string; postId: number | bigint; body: string },
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: target("post_comment"),
    arguments: [
      tx.object(params.boardId ?? BAZAAR_NEWS_BOARD_ID),
      tx.pure.u64(typeof params.postId === "bigint" ? params.postId : BigInt(params.postId)),
      tx.pure.string(params.body),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
