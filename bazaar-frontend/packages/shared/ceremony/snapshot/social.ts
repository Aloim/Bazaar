// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Social-widget readers: per-SSU AnnouncementBoard ("news") + GuestbookBoard,
 * and the global BazaarNewsBoard.
 *
 * - AnnouncementBoard.announcements: Table<u64, Announcement>; title/body are
 *   `vector<u8>` (byte-decoded). Each Announcement carries a vector<Comment>.
 * - GuestbookBoard.entries: vector<GuestbookEntry> (inline, capped — no table).
 * - BazaarNewsBoard.posts: vector<NewsPost>; title/body are Move `String`.
 */

import { getObjectFields, tableId, walkStructTable, bytesToString } from "./readers";
import type { AnnouncementRow, CommentRow, GuestbookRow } from "./types";

type Fields = Record<string, unknown>;
/** A vector-of-struct element renders as either {fields:{...}} or the fields inline. */
function structFields(el: unknown): Fields {
  const o = el as { fields?: Fields } | Fields;
  return ((o as { fields?: Fields }).fields ?? (o as Fields)) ?? {};
}

function parseComment(el: unknown): CommentRow {
  const f = structFields(el);
  return {
    author: String(f.author ?? ""),
    text: bytesToString(f.text),
    createdAtMs: String(f.created_at_ms ?? "0"),
  };
}

function parseAnnouncement(value: Fields): AnnouncementRow {
  const comments = Array.isArray(value.comments) ? (value.comments as unknown[]).map(parseComment) : [];
  return {
    id: String(value.id ?? "0"),
    author: String(value.author ?? ""),
    title: bytesToString(value.title),
    body: bytesToString(value.body),
    visibility: Number(value.visibility ?? 0),
    isSticky: value.is_sticky === true,
    createdAtMs: String(value.created_at_ms ?? "0"),
    comments,
  };
}

/** Read all posts from a per-SSU AnnouncementBoard (the in-world "News" feed). */
export async function readAnnouncements(boardId: string | null): Promise<AnnouncementRow[]> {
  if (!boardId) return [];
  const fields = await getObjectFields(boardId);
  if (!fields) return [];
  const rows = await walkStructTable(tableId(fields.announcements));
  return rows
    .map(({ value }) => parseAnnouncement(value))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

/** Read all entries from a per-SSU GuestbookBoard.
 *  C2/GAS-11 (V39): entries is now Table<u64,GuestbookEntry> — walk its DFs
 *  (mirrors readAnnouncements), not an inline vector. */
export async function readGuestbook(boardId: string | null): Promise<GuestbookRow[]> {
  if (!boardId) return [];
  const fields = await getObjectFields(boardId);
  if (!fields) return [];
  const rows = await walkStructTable(tableId(fields.entries));
  return rows
    .map(({ value }) => {
      const f = value as Record<string, unknown>;
      return {
        id: String(f.id ?? "0"),
        author: String(f.author ?? ""),
        message: bytesToString(f.message),
        createdAtMs: String(f.created_at_ms ?? "0"),
      };
    })
    .sort((a, b) => Number(a.id) - Number(b.id));
}

/** Read the global BazaarNewsBoard posts (String title/body; capture-only). */
export async function readBazaarNews(boardId: string | null): Promise<AnnouncementRow[]> {
  if (!boardId) return [];
  const fields = await getObjectFields(boardId);
  if (!fields) return [];
  const posts = Array.isArray(fields.posts) ? (fields.posts as unknown[]) : [];
  return posts.map((el) => {
    const f = structFields(el);
    return {
      id: String(f.id ?? "0"),
      author: String(f.posted_by ?? ""),
      title: String(f.title ?? ""),
      body: String(f.body ?? ""),
      visibility: 0,
      isSticky: f.has_poll === true,
      createdAtMs: String(f.posted_at_ms ?? "0"),
      comments: [],
    };
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
