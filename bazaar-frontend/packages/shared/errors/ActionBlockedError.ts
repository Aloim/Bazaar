// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — error class thrown by `useGatedTransaction.executeGated()`
 * when an active Warning announcement is in force and the calling app is NOT
 * DappHub (the DappHub-EXEMPT enforcement is import-side; this error is thrown
 * only inside the 3 bazaar apps).
 *
 * Consumed by `<ActionBlockedModal />` — when `executeGated` catches an
 * `ActionBlockedError`, it surfaces the `blockingWarning` payload to the modal
 * via React Context so the user sees title + body + estimated resume time.
 */

import type { Announcement } from "../types/announcement";

export class ActionBlockedError extends Error {
  /** The Warning announcement that blocked this mutating action. */
  public readonly blockingWarning: Announcement;

  constructor(blockingWarning: Announcement, message?: string) {
    super(message ?? `Action blocked by active Warning announcement: ${blockingWarning.title}`);
    this.name = "ActionBlockedError";
    this.blockingWarning = blockingWarning;
    // Restore prototype chain for `instanceof` checks across TypeScript downlevel
    // emit (target < ES2015). Cheap and harmless.
    Object.setPrototypeOf(this, ActionBlockedError.prototype);
  }
}

/** Narrowing helper — preferred over `err instanceof ActionBlockedError` at
 *  call sites where TypeScript's structural typing already infers `Error`. */
export function isActionBlockedError(err: unknown): err is ActionBlockedError {
  return err instanceof ActionBlockedError;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
