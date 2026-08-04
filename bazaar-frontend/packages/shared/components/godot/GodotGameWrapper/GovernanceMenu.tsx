// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * GovernanceMenu — a single role-gated HUD "Governance ▾" button whose dropdown
 * lists the governance panels the connected wallet may open:
 *   • SSU Governance   — when `canSSUGov`  (SSU owner/super-admin/admin/mod or
 *                        registry role ≥ staff).
 *   • Tribe Governance — when `canTribeGov` (Easy/Advanced bazaar + a tribe
 *                        mod/admin/super-admin/owner cap).
 *
 * The button itself is HIDDEN for normal users (renders null when neither applies),
 * so only moderators / admins / super-admins / owners ever see it. The per-item
 * gating mirrors the previous standalone SSU Gov / Tribe Gov buttons exactly —
 * the caller computes the same booleans. Opens on hover AND click; shares the
 * .hud-menu styles with News / Market menus.
 */

import { useState, useRef, useCallback } from "react";

interface Props {
  canSSUGov: boolean;
  canTribeGov: boolean;
  onOpenSSUGov: () => void;
  onOpenTribeGov: () => void;
}

export default function GovernanceMenu({ canSSUGov, canTribeGov, onOpenSSUGov, onOpenTribeGov }: Props) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  }, [cancelClose]);

  // Normal users (no governance role) never see the button.
  if (!canSSUGov && !canTribeGov) return null;

  const pick = (fn: () => void) => () => { setOpen(false); fn(); };

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
        Governance <span className={`hud-menu__caret${open ? " hud-menu__caret--up" : ""}`} aria-hidden>▾</span>
      </button>

      {open && (
        <div className="hud-menu__dropdown" role="menu" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
          {canSSUGov && item("SSU Governance", "Roles, tax & registration", onOpenSSUGov)}
          {canTribeGov && item("Tribe Governance", "Tribe roles, token & treasury", onOpenTribeGov)}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
