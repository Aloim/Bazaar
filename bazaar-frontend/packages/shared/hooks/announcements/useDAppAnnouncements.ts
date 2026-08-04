// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — `useDAppAnnouncements`.
 *
 * Direct Sui RPC reader for the global `dapp_hub::announcements::DAppAnnouncements`
 * shared object. The provider polls every 30s (matches plan §9); call sites
 * normally consume via `DAppAnnouncementsContext`. The hook is exported
 * directly here for tests + the optional manual-refetch path used by
 * `<ActionBlockedModal />`'s "Refresh status" button.
 *
 * `announcements: vector<Announcement>` is embedded directly in the shared
 * object — single `sui_getObject` round-trip returns the whole list, no per-row
 * DF reads needed.
 *
 * File limit: 500 lines | Constitution Article XIV.4 (exempt under UpdateCeremonyPlan).
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { suiClient } from "../sui-client";
import { DAPP_ANNOUNCEMENTS_ID } from "../../constants";
import type { Announcement, AnnouncementTier } from "../../types/announcement";

export interface UseDAppAnnouncementsOptions {
  /** Polling interval in milliseconds. Default 30_000 (plan §9). */
  pollIntervalMs?: number;
  /** Override the global ID — useful for tests / staging environments. */
  announcementsId?: string;
}

export interface UseDAppAnnouncementsResult {
  announcements: Announcement[];
  /** First currently-active Warning row (tier=1, show_from_ms <= now <= show_until_ms). */
  activeWarning: Announcement | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const DEFAULT_POLL_MS = 30_000;

function toNumber(raw: unknown, fallback = 0): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function parseAnnouncementRow(raw: unknown): Announcement | null {
  if (!raw || typeof raw !== "object") return null;
  // Sui RPC returns `{ type: ..., fields: { ... } }` for struct rows in a vector.
  const fields = (raw as { fields?: Record<string, unknown> }).fields
    ?? (raw as Record<string, unknown>);
  const tierNum = toNumber(fields.tier);
  const tier: AnnouncementTier = tierNum === 1 ? 1 : 0;
  return {
    id: toNumber(fields.id),
    tier,
    title: (fields.title as string) ?? "",
    body: (fields.body as string) ?? "",
    postedAtMs: toNumber(fields.posted_at_ms),
    showFromMs: toNumber(fields.show_from_ms),
    showUntilMs: toNumber(fields.show_until_ms),
    postedBy: (fields.posted_by as string) ?? "",
  };
}

function pickActiveWarning(rows: Announcement[]): Announcement | null {
  const now = Date.now();
  // Lowest-id wins if multiple Warnings overlap (per architect §3.4).
  let best: Announcement | null = null;
  for (const a of rows) {
    if (a.tier !== 1) continue;
    if (a.showFromMs > now || now > a.showUntilMs) continue;
    if (!best || a.id < best.id) best = a;
  }
  return best;
}

export function useDAppAnnouncements(
  opts?: UseDAppAnnouncementsOptions,
): UseDAppAnnouncementsResult {
  const announcementsId = opts?.announcementsId ?? DAPP_ANNOUNCEMENTS_ID;
  const pollMs = opts?.pollIntervalMs ?? DEFAULT_POLL_MS;

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // refetch counter to bust the effect's memo without re-creating the timer.
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);

  // Prevent a stale fetch's result from replacing a newer fetch's state.
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!announcementsId) {
      setAnnouncements([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const myReqId = ++reqIdRef.current;

    async function fetchOnce() {
      setIsLoading(true);
      try {
        const obj = await suiClient.getObject({
          id: announcementsId,
          options: { showContent: true },
        });
        if (cancelled || myReqId !== reqIdRef.current) return;
        const content = obj.data?.content as { fields?: Record<string, unknown> } | undefined;
        const rawList = (content?.fields?.announcements as unknown[] | undefined) ?? [];
        const parsed = rawList
          .map(parseAnnouncementRow)
          .filter((a): a is Announcement => a !== null);
        setAnnouncements(parsed);
        setError(null);
      } catch (err) {
        if (cancelled || myReqId !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled && myReqId === reqIdRef.current) {
          setIsLoading(false);
        }
      }
    }

    void fetchOnce();
    const timer = window.setInterval(fetchOnce, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [announcementsId, pollMs, tick]);

  const activeWarning = useMemo(() => pickActiveWarning(announcements), [announcements]);

  return { announcements, activeWarning, isLoading, error, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
