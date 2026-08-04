// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * HelpMenu — a single HUD "New? Help ▾" button that opens a dropdown of the
 * three bazaar-type guides, each opening the HelpWindow on that type:
 *   • Solo (No Tribe)   • Standard Tribe   • Advanced Tribe
 * Opens on hover AND on click. Mirrors NewsMenu / MarketMenu; shares .hud-menu.
 */

import { useState, useRef, useCallback } from "react";
import { HELP_KIND_ORDER, HELP_KIND_META, type BazaarHelpKind } from "@bazaar/shared/components/help/HelpContent";

interface Props {
  /** Opens the Help window on the given bazaar type. */
  onOpen: (kind: BazaarHelpKind) => void;
}

export default function HelpMenu({ onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  }, [cancelClose]);

  const pick = (kind: BazaarHelpKind) => () => { setOpen(false); onOpen(kind); };

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
        New? Help <span className={`hud-menu__caret${open ? " hud-menu__caret--up" : ""}`} aria-hidden>▾</span>
      </button>

      {open && (
        <div className="hud-menu__dropdown" role="menu" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
          {HELP_KIND_ORDER.map(kind => (
            <button key={kind} type="button" className="hud-menu__item" onClick={pick(kind)}>
              <span className="hud-menu__item-label">{HELP_KIND_META[kind].label}</span>
              <span className="hud-menu__item-hint">{HELP_KIND_META[kind].hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
