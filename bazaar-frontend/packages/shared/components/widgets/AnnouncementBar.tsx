// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useMemo } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useAnnouncements } from "@bazaar/shared/hooks/useAnnouncements";
import type { AnnouncementData } from "@bazaar/shared/hooks/useAnnouncements";
import { useCharacterNames } from "@bazaar/shared/hooks/useCharacterNames";
import AnnouncementDetail from "@bazaar/shared/components/widgets/AnnouncementDetail";
import { useOwnedCaps } from "@bazaar/shared/hooks/useOwnedCaps";

interface Props {
  onViewArchive: () => void;
  onWriteNew:    () => void;
  canWrite:      boolean;
  unreadCount:   number;
}

const MAX_TITLE_CHARS = 80;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

export default function AnnouncementBar({
  onViewArchive,
  onWriteNew,
  canWrite,
  unreadCount,
}: Props) {
  const { announcements, loading, refetch } = useAnnouncements();
  const { isConnected } = useConnection();
  const { hasOwnerCap, hasSuperAdminCap, hasAdminCap, hasModCap } = useOwnedCaps();
  const [selected, setSelected] = useState<AnnouncementData | null>(null);

  const maxVis = (hasOwnerCap || hasSuperAdminCap || hasAdminCap || hasModCap) ? 2 : 1;
  const visible = announcements.filter(a => {
    if (!isConnected && a.visibility > 0) return false;
    if (a.visibility > maxVis) return false;
    return true;
  }).slice(0, 3);

  const authorAddresses = useMemo(
    () => [...new Set(visible.map(a => a.author))],
    [visible],
  );
  const characterNames = useCharacterNames(authorAddresses);

  function authorName(addr: string): string {
    return characterNames.get(addr) || addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  return (
    <>
      <div className="announcement-bar">
        <div className="announcement-bar__titles">
          {loading && (
            <span className="announcement-bar__loading">Loading...</span>
          )}
          {!loading && visible.length === 0 && (
            <span className="announcement-bar__empty">No announcements.</span>
          )}
          {!loading && visible.map(a => (
            <button
              key={a.id}
              className="announcement-bar__title-item"
              onClick={() => setSelected(a)}
              title={a.title}
            >
              {a.isSticky && (
                <span className="announcement-bar__pin" aria-label="pinned">[PIN]</span>
              )}
              <span className="announcement-bar__title-text">{truncate(a.title, MAX_TITLE_CHARS)}</span>
              <span className="announcement-bar__author">{authorName(a.author)}</span>
            </button>
          ))}
        </div>

        <div className="announcement-bar__actions">
          {unreadCount > 0 && (
            <span className="announcement-badge" aria-label={`${unreadCount} unread`}>
              {unreadCount}
            </span>
          )}
          <button className="btn btn--ghost btn--sm" onClick={onViewArchive}>
            Archive
          </button>
          {canWrite && (
            <button className="btn btn--outline btn--sm" onClick={onWriteNew}>
              Write
            </button>
          )}
        </div>
      </div>

      {selected && (
        <AnnouncementDetail
          announcement={selected}
          onClose={() => setSelected(null)}
          canComment={true}
          canDelete={canWrite}
          canEdit={canWrite}
          onRefresh={() => { refetch(); setSelected(null); }}
        />
      )}
    </>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
