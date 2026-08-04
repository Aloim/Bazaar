// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Shared announcement type — populated from `dapp_hub::announcements::DAppAnnouncements`.
 * Consumed by `useDAppAnnouncements`, `useDAppActionsEnabled`, `<AnnouncementBanner />`,
 * `<ActionBlockedModal />`, and `ActionBlockedError`.
 *
 * Schema matches the Move struct `dapp_hub::announcements::Announcement`:
 *   id: u64, tier: u8, title: String, body: String,
 *   posted_at_ms: u64, show_from_ms: u64, show_until_ms: u64, posted_by: address.
 *
 * Co-located here to break the `useDAppAnnouncements` ↔ `ActionBlockedError` cycle
 * — both modules type-import this without depending on the hook implementation.
 */

/** Tier 0 = Info (dismissible). Tier 1 = Warning (blocks mutating actions
 *  in NoTribe/Easy/Advanced; DappHub is EXEMPT). */
export type AnnouncementTier = 0 | 1;

export interface Announcement {
  id: number;
  tier: AnnouncementTier;
  title: string;
  body: string;
  postedAtMs: number;
  showFromMs: number;
  showUntilMs: number;
  postedBy: string;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
