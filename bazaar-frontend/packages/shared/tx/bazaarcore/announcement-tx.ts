// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore announcement_proxy TX builders.
 *
 * R4.3.f — Migration from deleted ghost tx/bazaar_core/ssu-governance/announcements-tx.ts.
 * V7 — package_id: address inserted at position [3] (after board/gov, before content args)
 * in all 8 builders to match Phase 2 Move ABI change.
 * buildDeleteSSUAnnouncement also gains ssuGovId param (pre-existing Move requirement).
 *
 * Real Move targets (BazaarCore/sources/announcement_proxy.move):
 *   ssu_post_announcement    — cap[0], gov[1], board[2], pkg[3], title[4], body[5], vis[6], clk[7]
 *   ssu_delete_announcement  — cap[0], gov[1], board[2], pkg[3], ann_id[4]
 *   ssu_set_sticky           — cap[0], gov[1], board[2], pkg[3], ann_id[4]
 *   ssu_add_comment          — cap[0], gov[1], board[2], pkg[3], ann_id[4], text[5], clk[6]
 *   tribe_post_announcement  — cap[0], gov[1], board[2], pkg[3], title[4], body[5], vis[6], clk[7]
 *   tribe_delete_announcement — cap[0], gov[1], board[2], pkg[3], ann_id[4]
 *   tribe_set_sticky          — cap[0], gov[1], board[2], pkg[3], ann_id[4]
 *   tribe_add_comment         — cap[0], gov[1], board[2], pkg[3], ann_id[4], text[5], clk[6]
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES } from "../../constants";

const ANNOUNCEMENT_PROXY = "announcement_proxy";

// ── SSU-side announcement builders ────────────────────────────────────────────

/**
 * Post an SSU announcement (SSUOwnerCap-gated, R3.5 freeze-guarded).
 * Move: bazaar_mission::announcement_proxy:: (V35 split) ssu_post_announcement
 * Args: cap[0], gov[1], board[2], package_id[3], title[4], body[5], visibility[6], clock[7]
 * Visibility u8: 0 = public, 1 = members-only (per SharedWidgets enum).
 */
export function buildPostSSUAnnouncement(params: {
  ssuOwnerCapId: string;
  ssuGovId: string;
  announcementBoardId: string;
  title: string;
  body: string;
  visibility: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${ANNOUNCEMENT_PROXY}::ssu_post_announcement`,
    arguments: [
      tx.object(params.ssuOwnerCapId),                                            // cap [0]
      tx.object(params.ssuGovId),                                                  // gov [1]
      tx.object(params.announcementBoardId),                                       // board [2]
      tx.pure.address(PACKAGE_IDS.BAZAAR_CORE),                                   // package_id [3] V7
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.title))),   // title [4]
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.body))),    // body [5]
      tx.pure.u8(params.visibility),                                               // visibility [6]
      tx.object("0x6"),                                                            // clock [7]
    ],
  });
  return tx;
}

/**
 * Delete an SSU announcement by ID (SSUOwnerCap-gated, freeze-guarded).
 * Move: bazaar_mission::announcement_proxy:: (V35 split) ssu_delete_announcement
 * Args: cap[0], gov[1], board[2], package_id[3], ann_id[4]
 * V7: ssuGovId param added (pre-existing Move requirement); package_id inserted at [3].
 */
export function buildDeleteSSUAnnouncement(params: {
  ssuOwnerCapId: string;
  ssuGovId: string;
  announcementBoardId: string;
  annId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${ANNOUNCEMENT_PROXY}::ssu_delete_announcement`,
    arguments: [
      tx.object(params.ssuOwnerCapId),              // cap [0]
      tx.object(params.ssuGovId),                   // gov [1] V7: was missing
      tx.object(params.announcementBoardId),         // board [2]
      tx.pure.address(PACKAGE_IDS.BAZAAR_CORE),     // package_id [3] V7
      tx.pure.u64(BigInt(params.annId)),            // ann_id [4]
    ],
  });
  return tx;
}

/**
 * Pin an SSU announcement as sticky (SSUOwnerCap, R3.5 freeze-guarded).
 * Move: bazaar_mission::announcement_proxy:: (V35 split) ssu_set_sticky
 * Args: cap[0], gov[1], board[2], package_id[3], ann_id[4]
 */
export function buildSetSSUSticky(params: {
  ssuOwnerCapId: string;
  ssuGovId: string;
  announcementBoardId: string;
  annId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${ANNOUNCEMENT_PROXY}::ssu_set_sticky`,
    arguments: [
      tx.object(params.ssuOwnerCapId),              // cap [0]
      tx.object(params.ssuGovId),                   // gov [1]
      tx.object(params.announcementBoardId),         // board [2]
      tx.pure.address(PACKAGE_IDS.BAZAAR_CORE),     // package_id [3] V7
      tx.pure.u64(BigInt(params.annId)),            // ann_id [4]
    ],
  });
  return tx;
}

/**
 * Add a comment to an SSU announcement (SSUOwnerCap, R3.5 freeze-guarded).
 * Move: bazaar_mission::announcement_proxy:: (V35 split) ssu_add_comment
 * Args: cap[0], gov[1], board[2], package_id[3], ann_id[4], text[5], clock[6]
 */
export function buildAddSSUComment(params: {
  ssuOwnerCapId: string;
  ssuGovId: string;
  announcementBoardId: string;
  annId: number;
  text: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${ANNOUNCEMENT_PROXY}::ssu_add_comment`,
    arguments: [
      tx.object(params.ssuOwnerCapId),                                             // cap [0]
      tx.object(params.ssuGovId),                                                  // gov [1]
      tx.object(params.announcementBoardId),                                        // board [2]
      tx.pure.address(PACKAGE_IDS.BAZAAR_CORE),                                   // package_id [3] V7
      tx.pure.u64(BigInt(params.annId)),                                           // ann_id [4]
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.text))),    // text [5]
      tx.object("0x6"),                                                             // clock [6]
    ],
  });
  return tx;
}

// ── Tribe-side announcement builders ──────────────────────────────────────────

/**
 * Post a tribe announcement (TribeAdminCap-gated; bazaar-type + tribe-id checked on-chain).
 * Move: bazaar_mission::announcement_proxy:: (V35 split) tribe_post_announcement
 * Args: cap[0], tribe_gov[1], board[2], package_id[3], title[4], body[5], visibility[6], clock[7]
 */
export function buildPostTribeAnnouncement(params: {
  tribeAdminCapId: string;
  tribeGovernanceId: string;
  announcementBoardId: string;
  title: string;
  body: string;
  visibility: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${ANNOUNCEMENT_PROXY}::tribe_post_announcement`,
    arguments: [
      tx.object(params.tribeAdminCapId),                                           // cap [0]
      tx.object(params.tribeGovernanceId),                                         // tribe_gov [1]
      tx.object(params.announcementBoardId),                                        // board [2]
      tx.pure.address(PACKAGE_IDS.BAZAAR_CORE),                                   // package_id [3] V7
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.title))),   // title [4]
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.body))),    // body [5]
      tx.pure.u8(params.visibility),                                               // visibility [6]
      tx.object("0x6"),                                                            // clock [7]
    ],
  });
  return tx;
}

/**
 * Broadcast a tribe announcement to EVERY SSU board in the tribe in ONE PTB.
 *
 * Fans `tribe_post_announcement` out across `boardIds`, reusing the same
 * TribeAdminCap + TribeGovernance + content args for each call. This is how a
 * tribe-wide announcement reaches every SSU's single news feed without any new
 * Move function: `tribe_post_announcement` gates only on the TribeAdminCap's
 * tribe_id matching the passed TribeGovernance — it performs NO board↔SSU
 * ownership check (announcement_proxy.move:139), and the board only enforces its
 * authorized-package (all tribe SSU boards share PACKAGE_IDS.BAZAAR_CORE).
 *
 * Atomic: if any single call aborts (e.g. a board with a mismatched authorized
 * package), the whole PTB reverts and no SSU receives the post. Per-SSU
 * freeze/active state does NOT block the broadcast — the tribe entry has no SSU
 * gate. Caller resolves `boardIds` via useTribeBoardIds(tribeIdx).
 *
 * Move (per board): cap[0], tribe_gov[1], board[2], package_id[3], title[4],
 *   body[5], visibility[6], clock[7] — identical to buildPostTribeAnnouncement.
 */
export function buildBroadcastTribeAnnouncement(params: {
  tribeAdminCapId: string;
  tribeGovernanceId: string;
  boardIds: string[];
  title: string;
  body: string;
  visibility: number;
}): Transaction {
  const tx = new Transaction();
  // Shared inputs — created once, reused across every per-board call (the SDK
  // dedupes object inputs by id and lets a pure Argument be referenced N times).
  const cap   = tx.object(params.tribeAdminCapId);
  const gov   = tx.object(params.tribeGovernanceId);
  const pkg   = tx.pure.address(PACKAGE_IDS.BAZAAR_CORE);
  const title = tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.title)));
  const body  = tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.body)));
  const vis   = tx.pure.u8(params.visibility);
  const clock = tx.object("0x6");

  for (const boardId of params.boardIds) {
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_MISSION}::${ANNOUNCEMENT_PROXY}::tribe_post_announcement`,
      arguments: [cap, gov, tx.object(boardId), pkg, title, body, vis, clock],
    });
  }
  return tx;
}

/**
 * Delete a tribe announcement by ID (TribeAdminCap).
 * Move: bazaar_mission::announcement_proxy:: (V35 split) tribe_delete_announcement
 * Args: cap[0], tribe_gov[1], board[2], package_id[3], ann_id[4]
 */
export function buildDeleteTribeAnnouncement(params: {
  tribeAdminCapId: string;
  tribeGovernanceId: string;
  announcementBoardId: string;
  annId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${ANNOUNCEMENT_PROXY}::tribe_delete_announcement`,
    arguments: [
      tx.object(params.tribeAdminCapId),            // cap [0]
      tx.object(params.tribeGovernanceId),           // tribe_gov [1]
      tx.object(params.announcementBoardId),         // board [2]
      tx.pure.address(PACKAGE_IDS.BAZAAR_CORE),     // package_id [3] V7
      tx.pure.u64(BigInt(params.annId)),            // ann_id [4]
    ],
  });
  return tx;
}

// ── Tribe announcement builders (added R5.2.b.3) ──────────────────────────────

/**
 * Pin a tribe announcement as sticky (TribeAdminCap-gated).
 * Move: bazaar_mission::announcement_proxy:: (V35 split) tribe_set_sticky
 * Args: cap[0], tribe_gov[1], board[2], package_id[3], ann_id[4]
 */
export function buildSetTribeSticky(params: {
  tribeAdminCapId: string;
  tribeGovernanceId: string;
  announcementBoardId: string;
  annId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${ANNOUNCEMENT_PROXY}::tribe_set_sticky`,
    arguments: [
      tx.object(params.tribeAdminCapId),            // cap [0]
      tx.object(params.tribeGovernanceId),           // tribe_gov [1]
      tx.object(params.announcementBoardId),         // board [2]
      tx.pure.address(PACKAGE_IDS.BAZAAR_CORE),     // package_id [3] V7
      tx.pure.u64(BigInt(params.annId)),            // ann_id [4]
    ],
  });
  return tx;
}

/**
 * Add a comment to a tribe announcement (TribeAdminCap-gated).
 * Move: bazaar_mission::announcement_proxy:: (V35 split) tribe_add_comment
 * Args: cap[0], tribe_gov[1], board[2], package_id[3], ann_id[4], text[5], clock[6]
 */
export function buildAddTribeComment(params: {
  tribeAdminCapId: string;
  tribeGovernanceId: string;
  announcementBoardId: string;
  annId: number;
  text: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::${ANNOUNCEMENT_PROXY}::tribe_add_comment`,
    arguments: [
      tx.object(params.tribeAdminCapId),                                           // cap [0]
      tx.object(params.tribeGovernanceId),                                         // tribe_gov [1]
      tx.object(params.announcementBoardId),                                        // board [2]
      tx.pure.address(PACKAGE_IDS.BAZAAR_CORE),                                   // package_id [3] V7
      tx.pure.u64(BigInt(params.annId)),                                           // ann_id [4]
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.text))),    // text [5]
      tx.object("0x6"),                                                             // clock [6]
    ],
  });
  return tx;
}

void MODULES;

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
