// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * SharedWidgets widget_config + guestbook TX builders.
 *
 * R4.5: rewritten against the actual SharedWidgets Move surface.
 * Original Bazar1 builders (buildSetServerUrl, buildExtendWidgets) targeted
 * fns that DO NOT EXIST in our 4-package SharedWidgets module — DELETED.
 * Godot URL routing lives in BazaarCore (buildSetSSUGodotUrl in tx/bazaarcore/
 * ssu-governance-tx.ts; buildSetTribeGodotUrl in tribe-governance-tx.ts).
 *
 * Move targets verified by grep against SharedWidgets/sources/.
 *
 * NOTE: widget_config::toggle_widget takes a `caller_package` address arg that
 * must equal the WidgetConfig.authorized_package. In our architecture, that's
 * @bazaar_core (set during create_widget_config call from ssu_bootstrap).
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS } from "@bazaar/shared/constants";

const SHARED_WIDGETS = "shared_widgets" as const;
void SHARED_WIDGETS;

/** Encode a UTF-8 string as a Move vector<u8>. */
function encodeText(tx: Transaction, text: string) {
  return tx.pure.vector("u8", Array.from(new TextEncoder().encode(text)));
}

// ── widget_config builders ───────────────────────────────────────────────────

/**
 * Create a new WidgetConfig (returned to caller, not auto-shared).
 * Move: shared_widgets::widget_config::create_widget_config (line 49)
 * Sig: (ssu_id, authorized_package, ctx) -> WidgetConfig
 *
 * NOTE: this fn returns the WidgetConfig object; the calling PTB must either
 * share it via transfer::public_share_object or pass it back to bazaar_core
 * for further setup. In typical bootstrap flows, ssu_bootstrap calls this
 * cross-package and shares the result.
 */
export function buildCreateWidgetConfig(params: {
  ssuId: string;
  authorizedPackage: string;       // typically PACKAGE_IDS.BAZAAR_CORE
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.SHARED_WIDGETS}::widget_config::create_widget_config`,
    arguments: [
      tx.pure.address(params.ssuId),
      tx.pure.address(params.authorizedPackage),
    ],
  });
  return tx;
}

// NOTE: buildSetServerUrl + buildExtendWidgets DELETED — Move fns don't exist.
// For godot URL: use buildSetSSUGodotUrl / buildClearSSUGodotUrl from
// tx/bazaarcore/ssu-governance-tx.ts (already wired since AP2-C / R3.4).

// ── guestbook builders ───────────────────────────────────────────────────────

/**
 * Add a guestbook entry.
 * Move: shared_widgets::guestbook::add_entry (line 72)
 * Sig: (board: &mut GuestbookBoard, caller_package: address,
 *       text: vector<u8>, author: address, clock: &Clock)
 *
 * callerPackage must equal GuestbookBoard.authorized_package (set during
 * ssu_bootstrap; equals PACKAGE_IDS.SHARED_WIDGETS).
 * authorAddress is the signer's wallet address (tx.sender equivalent on FE).
 *
 * NOTE: the legacy 4-arg shape (memberRegistryId, reordered clock/text) is
 * DELETED here — it never matched the Move function. See legacycode.md.
 */
export function buildAddGuestbookEntry(params: {
  guestbookBoardId: string;
  callerPackage: string;
  message: string;
  authorAddress: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.SHARED_WIDGETS}::guestbook::add_entry`,
    arguments: [
      tx.object(params.guestbookBoardId),
      tx.pure.address(params.callerPackage),
      encodeText(tx, params.message),
      tx.pure.address(params.authorAddress),
      tx.object("0x6"),
    ],
  });
  return tx;
}

/**
 * Delete a guestbook entry by its entry ID.
 * Move: shared_widgets::guestbook::delete_entry (line 104)
 * Sig: (board: &mut GuestbookBoard, caller_package: address, entry_id: u64)
 *
 * callerPackage must equal GuestbookBoard.authorized_package (= PACKAGE_IDS.BAZAAR_CORE).
 * Author-vs-moderator role checks are the caller's responsibility (Move comment line 102).
 */
export function buildDeleteGuestbookEntry(params: {
  guestbookBoardId: string;
  callerPackage: string;
  entryId: number;          // the monotonic GuestbookEntry.id (u64 Table key), NOT a positional index
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.SHARED_WIDGETS}::guestbook::delete_entry`,
    arguments: [
      tx.object(params.guestbookBoardId),
      tx.pure.address(params.callerPackage),
      tx.pure.u64(BigInt(params.entryId)),
    ],
  });
  return tx;
}

// NOTE: buildCreateGuestbook DELETED — guestbook board creation is not exposed
// as a public PTB-callable Move fn in our architecture. Boards are created
// during ssu_bootstrap cross-package call; see ssu_bootstrap.move.

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
