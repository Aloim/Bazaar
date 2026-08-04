// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS } from "@bazaar/shared/constants";

const pkg = PACKAGE_IDS.SHARED_WIDGETS;

/** Encode a UTF-8 string as a Move vector<u8>. */
function encodeText(tx: Transaction, text: string) {
  return tx.pure.vector("u8", Array.from(new TextEncoder().encode(text)));
}

/**
 * Create a new AnnouncementBoard shared object.
 * Move: shared_widgets::announcements::create_board
 * Sig: (ssu_id: address, authorized_package: address, ctx)
 */
export function buildCreateBoard(params: {
  ssuId: string;
  authorizedPackage: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::announcements::create_board`,
    arguments: [
      tx.pure.address(params.ssuId),
      tx.pure.address(params.authorizedPackage),
    ],
  });
  return tx;
}

/**
 * Create a new announcement on the board.
 * Move: shared_widgets::announcements::create_announcement
 * Sig: (board, caller_package: address, title, body, visibility, author: address, clock)
 *
 * callerPackage must equal AnnouncementBoard.authorized_package (= PACKAGE_IDS.BAZAAR_CORE).
 * author is the connected wallet address (tx signer).
 */
export function buildCreateAnnouncement(params: {
  boardId: string;
  callerPackage: string;
  title: string;
  body: string;
  visibility: number;
  author: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::announcements::create_announcement`,
    arguments: [
      tx.object(params.boardId),
      tx.pure.address(params.callerPackage),
      encodeText(tx, params.title),
      encodeText(tx, params.body),
      tx.pure.u8(params.visibility),
      tx.pure.address(params.author),
      tx.object("0x6"),
    ],
  });
  return tx;
}

/**
 * Delete an announcement by its numeric ID.
 * Move: shared_widgets::announcements::delete_announcement
 * Sig: (board, caller_package: address, ann_id: u64)
 */
export function buildDeleteAnnouncement(params: {
  boardId: string;
  callerPackage: string;
  announcementId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::announcements::delete_announcement`,
    arguments: [
      tx.object(params.boardId),
      tx.pure.address(params.callerPackage),
      tx.pure.u64(BigInt(params.announcementId)),
    ],
  });
  return tx;
}

/**
 * Edit title and body of an existing announcement.
 * Move: shared_widgets::announcements::edit_announcement
 * WARNING: this Move function is NOT present in SharedWidgets/sources/announcements.move
 * as of V9. Calling this builder will produce a "function not found" transaction error.
 * A follow-up is required: either add edit_announcement to the Move contract, or
 * remove this builder and its call sites.
 * Sig (anticipated): (board, caller_package: address, ann_id: u64, title, body)
 */
// TODO STUB-03: edit_announcement Move fn not implemented in V9 — calls revert; pending design call (implement vs. remove). See Documentation/stubs.md.
export function buildEditAnnouncement(params: {
  boardId: string;
  callerPackage: string;
  announcementId: number;
  newTitle: string;
  newBody: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::announcements::edit_announcement`,
    arguments: [
      tx.object(params.boardId),
      tx.pure.address(params.callerPackage),
      tx.pure.u64(BigInt(params.announcementId)),
      encodeText(tx, params.newTitle),
      encodeText(tx, params.newBody),
    ],
  });
  return tx;
}

/**
 * Pin an announcement as sticky.
 * Move: shared_widgets::announcements::set_sticky
 * Sig: (board, caller_package: address, ann_id: u64)
 */
export function buildSetSticky(params: {
  boardId: string;
  callerPackage: string;
  announcementId: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::announcements::set_sticky`,
    arguments: [
      tx.object(params.boardId),
      tx.pure.address(params.callerPackage),
      tx.pure.u64(BigInt(params.announcementId)),
    ],
  });
  return tx;
}

/**
 * Clear the current sticky announcement.
 * Move: shared_widgets::announcements::unset_sticky
 * WARNING: this Move function is NOT present in SharedWidgets/sources/announcements.move
 * as of V9. Calling this builder will produce a "function not found" transaction error.
 * A follow-up is required: either add unset_sticky to the Move contract, or
 * remove this builder and its call sites.
 * Sig (anticipated): (board, caller_package: address)
 */
// TODO STUB-04: unset_sticky Move fn not implemented in V9 — calls revert; pending design call (implement vs. remove). See Documentation/stubs.md.
export function buildUnsetSticky(params: {
  boardId: string;
  callerPackage: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::announcements::unset_sticky`,
    arguments: [
      tx.object(params.boardId),
      tx.pure.address(params.callerPackage),
    ],
  });
  return tx;
}

/**
 * Add a comment to an announcement.
 * Move: shared_widgets::announcements::add_comment
 * Sig: (board, caller_package: address, ann_id: u64, text, author: address, clock)
 *
 * author is the connected wallet address (tx signer).
 */
export function buildAddComment(params: {
  boardId: string;
  callerPackage: string;
  announcementId: number;
  text: string;
  author: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::announcements::add_comment`,
    arguments: [
      tx.object(params.boardId),
      tx.pure.address(params.callerPackage),
      tx.pure.u64(BigInt(params.announcementId)),
      encodeText(tx, params.text),
      tx.pure.address(params.author),
      tx.object("0x6"),
    ],
  });
  return tx;
}

/**
 * Delete a comment by its index within an announcement's comments vector.
 * Move: shared_widgets::announcements::delete_comment
 * WARNING: this Move function is NOT present in SharedWidgets/sources/announcements.move
 * as of V9. Calling this builder will produce a "function not found" transaction error.
 * A follow-up is required: either add delete_comment to the Move contract, or
 * remove this builder and its call sites.
 * Sig (anticipated): (board, caller_package: address, ann_id: u64, comment_idx: u64)
 */
// TODO STUB-05: delete_comment Move fn not implemented in V9 — calls revert; pending design call (implement vs. remove). See Documentation/stubs.md.
export function buildDeleteComment(params: {
  boardId: string;
  callerPackage: string;
  announcementId: number;
  commentIdx: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${pkg}::announcements::delete_comment`,
    arguments: [
      tx.object(params.boardId),
      tx.pure.address(params.callerPackage),
      tx.pure.u64(BigInt(params.announcementId)),
      tx.pure.u64(BigInt(params.commentIdx)),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
