// hubStyle.ts — Design tokens + shared inline-style objects for the redesigned
// DappHub "Station Hub" surface. Ported from design-reference/BazaarDappHub
// (orange-on-near-black, Frontier Disket Mono, corner-bracket chrome).
//
// These are plain constants/objects (no JSX) so they can be shared across the
// hub landing + every overlay without re-declaring the vocabulary.

import type { CSSProperties } from "react";

// ── Palette ──────────────────────────────────────────────────────────────────
export const HUB = {
  BG:       "#080604",
  PANEL:    "#0e0a06",
  ORANGE:   "#ff9030",
  DIM:      "#b86620",
  GREEN:    "#3ad278",
  RED:      "#ff5a30",
  FG:       "#f2efe8",
  FG2:      "#c8bda9",
  MUTED:    "#8a7a66",
  BORDER:   "#2e1f10",
} as const;

export const HUB_FONT = '"Frontier Disket Mono", ui-monospace, monospace';
export const HUB_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

// ── Shared field styles ──────────────────────────────────────────────────────
export const fieldLabel: CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.04em",
  color: HUB.FG2,
  marginBottom: 8,
  display: "block",
};

export const counterStyle: CSSProperties = { color: HUB.MUTED, fontWeight: 400 };

export const inputBase: CSSProperties = {
  width: "100%",
  background: "rgba(8,6,4,0.85)",
  border: `1px solid ${HUB.DIM}`,
  color: HUB.FG,
  fontFamily: HUB_MONO,
  fontSize: 14,
  letterSpacing: "0.02em",
  padding: "12px 14px",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 120ms ease, box-shadow 120ms ease",
};

// Standard floating-window card shell (inner panel of an overlay).
export const overlayPanel: CSSProperties = {
  background: HUB.PANEL,
  border: `1.5px solid ${HUB.ORANGE}`,
  boxShadow:
    "0 0 0 1px rgba(255,144,48,0.12), 0 0 60px rgba(255,144,48,0.18), 0 24px 80px rgba(0,0,0,0.6)",
  padding: "28px 32px 30px",
  position: "relative",
};

// Full-screen dimmed backdrop behind an overlay panel.
export const overlayBackdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  background: "rgba(8,6,4,0.72)",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 40px",
  animation: "hubFade 160ms ease-out",
};
