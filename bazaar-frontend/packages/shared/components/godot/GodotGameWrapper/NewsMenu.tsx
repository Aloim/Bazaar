// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * NewsMenu — a single HUD "News ▾" button that opens a dropdown of the three news
 * surfaces, replacing the separate "News" (announcements) + "Finance News" buttons:
 *   • Finance News — tribe ledger transparency (Advanced bazaars only).
 *   • Bazaar News  — DApp-wide news board (posts + polls + comments).
 *   • Tribe News   — the tribe announcement archive.
 * Opens on hover AND on click; each row opens its window and closes the menu.
 *
 * Matches the EVE-Frontier HUD language (orange-on-black, var(--font-display),
 * `.btn btn--ghost` trigger) — see news-menu.css.
 */

import { useState, useRef, useCallback } from "react";
import { AdvancedOnly } from "@bazaar/shared/components";

interface Props {
  /** Tribe ledger transparency — Advanced only (gated inside). */
  onOpenFinanceNews: () => void;
  /** DApp-wide Bazaar news board. */
  onOpenBazaarNews: () => void;
  /** Tribe announcement archive ("Tribe News"). */
  onOpenTribeNews: () => void;
}

export default function NewsMenu({ onOpenFinanceNews, onOpenBazaarNews, onOpenTribeNews }: Props) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Small leave-delay so a diagonal hover to a dropdown row doesn't drop the menu.
  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  }, [cancelClose]);

  const pick = (open: () => void) => () => { setOpen(false); open(); };

  const item = (label: string, hint: string, onClick: () => void) => (
    <button type="button" className="hud-menu__item" onClick={pick(onClick)}>
      <span className="hud-menu__item-label">{label}</span>
      <span className="hud-menu__item-hint">{hint}</span>
    </button>
  );

  return (
    <div
      className="hud-menu"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="btn btn--ghost btn--sm hud-menu__trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        News <span className={`hud-menu__caret${open ? " hud-menu__caret--up" : ""}`} aria-hidden>▾</span>
      </button>

      {open && (
        <div className="hud-menu__dropdown" role="menu" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
          <AdvancedOnly>
            {item("Finance News", "Tribe ledger & exchange activity", onOpenFinanceNews)}
          </AdvancedOnly>
          {item("Bazaar News", "DApp news, polls & comments", onOpenBazaarNews)}
          {item("Tribe News", "Tribe announcements", onOpenTribeNews)}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
