// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * WindowHeader — the shared title-bar chrome for floating windows (Systems
 * Audit Phase 7, Slice 7.3). Unifies the close-button AFFORDANCE (one ✕ glyph,
 * aria-labelled) and title typography across the .market-window family and
 * FloatingWindow modals, while each window keeps its own skin via the
 * className props (market-window__header vs modal__header). Drill-down views
 * pass onBack instead of onClose to swap the ✕ for a ‹ Back affordance.
 */

import type { ReactNode } from "react";

export interface WindowHeaderProps {
  title: ReactNode;
  /** Renders the ✕ close affordance. */
  onClose?: () => void;
  /** Renders a ‹ Back affordance INSTEAD of the ✕ (drill-down views). */
  onBack?: () => void;
  backLabel?: string;
  /** Extra header actions rendered between the title and the close button. */
  actions?: ReactNode;
  /** Skin: defaults to the .market-window family chrome. */
  className?: string;
  titleClassName?: string;
  /** Accent for the affordance glyphs (matches each window's palette). */
  accent?: string;
}

export default function WindowHeader({
  title,
  onClose,
  onBack,
  backLabel = "‹ Back",
  actions,
  className = "market-window__header",
  titleClassName = "market-window__title",
  accent = "var(--accent, #cc7000)",
}: WindowHeaderProps) {
  return (
    <div className={className}>
      <h2 className={titleClassName} style={{ margin: 0 }}>{title}</h2>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        {actions}
        {onBack ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onBack}
            style={{ color: accent }}
          >
            {backLabel}
          </button>
        ) : onClose ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            style={{ color: accent }}
          >
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
