// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { type CSSProperties, type ReactNode } from "react";

export type FloatingPanelPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

export interface FloatingPanelProps {
  /** Header title, rendered in the orange display font. Omit to suppress header. */
  title?: string;
  /** Close handler — renders × button in header only when provided. */
  onClose?: () => void;
  /** Corner / center preset. Resolves to absolute offsets. Default: "top-right". */
  position?: FloatingPanelPosition;
  /** Explicit panel width (CSS value or px number). */
  width?: number | string;
  /** Optional max-width cap. */
  maxWidth?: number | string;
  /** Body scroll region max-height. Default: "70vh". */
  maxHeight?: number | string;
  /** Override z-index (default 25). Keep below 50 to respect WalletBar / HUD. */
  zIndex?: number;
  /** Additive class on the outer element. Does not replace BEM root class. */
  className?: string;
  children: ReactNode;
}

const GUTTER = "16px";

function resolvePosition(pos: FloatingPanelPosition): CSSProperties {
  switch (pos) {
    case "top-left":     return { top: GUTTER, left: GUTTER };
    case "top-right":    return { top: GUTTER, right: GUTTER };
    case "bottom-left":  return { bottom: GUTTER, left: GUTTER };
    case "bottom-right": return { bottom: GUTTER, right: GUTTER };
    case "center":
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }
}

/**
 * FloatingPanel — in-canvas overlay shell.
 *
 * Reusable non-blocking panel that sits over the Godot canvas. Styled
 * to match Bazar1 `.floating-panel` (dark bg, orange border, 8px
 * radius, glow shadow). Distinct from FloatingWindow (modal scrim):
 *   - No backdrop / no portal — renders in-tree.
 *   - position: absolute — scoped to caller's positioning context.
 *   - z-index 25 by default (below WalletBar 50, HUD 60, Modal 100).
 *
 * @remarks
 *   CONTAINING-BLOCK CONTRACT: the parent element must establish a
 *   positioning context (position: relative | absolute | fixed |
 *   sticky). In NoTribe, `.bazaar-screen` uses `position: fixed;
 *   inset: 0` which satisfies this contract.
 *
 *   TRANSFORM / FILTER CAVEAT: if any ancestor has a `transform`,
 *   `filter`, `perspective`, or `will-change: transform` style, it
 *   becomes a new containing block and overrides the above contract.
 *   The `center` position preset relies on `translate(-50%, -50%)`
 *   which applies a local transform — this does NOT affect the
 *   containing-block resolution of *this* element's children.
 */
export default function FloatingPanel({
  title,
  onClose,
  position = "top-right",
  width,
  maxWidth,
  maxHeight = "70vh",
  zIndex = 25,
  className,
  children,
}: FloatingPanelProps) {
  if (import.meta.env.DEV && zIndex >= 50) {
    console.warn(
      `[FloatingPanel] zIndex ${zIndex} >= 50 breaks WalletBar / HUD overlay order. ` +
      `Keep zIndex < 50 unless you have an explicit reason.`
    );
  }

  const outerStyle: CSSProperties = {
    position: "absolute",
    zIndex,
    ...(width !== undefined     ? { width:    typeof width    === "number" ? `${width}px`    : width }    : {}),
    ...(maxWidth !== undefined  ? { maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth } : {}),
    ...resolvePosition(position),
  };

  const bodyStyle: CSSProperties = {
    maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
  };

  const showHeader = title !== undefined || onClose !== undefined;

  return (
    <div
      className={`floating-panel${className ? ` ${className}` : ""}`}
      style={outerStyle}
    >
      {showHeader && (
        <header className="floating-panel__header">
          {title !== undefined && (
            <h2 className="floating-panel__title">{title}</h2>
          )}
          {onClose !== undefined && (
            <button
              className="floating-panel__close"
              onClick={onClose}
              aria-label="Close panel"
            >
              &times;
            </button>
          )}
        </header>
      )}
      <div className="floating-panel__body" style={bodyStyle}>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
