// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * MarketMenu — a single HUD "Market & Missions ▾" button that opens a dropdown of
 * the window's three tabs, each a quick-jump that opens MarketWindow on that tab:
 *   • Filter              — shop tier filter + "hide all missions".
 *   • My Stalls           — your active shops + mission stalls (Close / Cancel).
 *   • My Accepted Missions — missions you've accepted (countdown, what to bring).
 * Opens on hover AND on click. Mirrors NewsMenu; shares the .hud-menu styles.
 */

import { useState, useRef, useCallback } from "react";
import type { MarketTab } from "@bazaar/shared/components/windows/MarketWindow";

interface Props {
  /** Opens the Market & Missions window on the given tab. */
  onOpen: (tab: MarketTab) => void;
}

export default function MarketMenu({ onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  }, [cancelClose]);

  const pick = (tab: MarketTab) => () => { setOpen(false); onOpen(tab); };

  const item = (tab: MarketTab, label: string, hint: string) => (
    <button type="button" className="hud-menu__item" onClick={pick(tab)}>
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
        Market &amp; Missions <span className={`hud-menu__caret${open ? " hud-menu__caret--up" : ""}`} aria-hidden>▾</span>
      </button>

      {open && (
        <div className="hud-menu__dropdown" role="menu" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
          {item("filter", "Filter", "Shops by tier + hide missions")}
          {item("mystalls", "My Stalls", "Your shops & mission stalls")}
          {item("accepted", "My Accepted Missions", "Missions you've accepted")}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
