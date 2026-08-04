// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// zIndex.ts — the documented z-index scale for every floating surface rendered
// over the running Godot canvas (Systems Audit Phase 7, LEAD-06). The CSS twin
// lives in css/bazar1/z-scale.css (:root custom properties) — KEEP IN SYNC.
//
// Strata (low → high):
//   CANVAS      0     Godot canvas wrapper; beacon layers use local 1–3 inside it
//   HUD         5     HUD chrome row (.game-hud)
//   PANEL       300   in-HUD panels: market/missions/news windows + in-game inline panels
//   CHAT        310   multiplayer chat bar (above panels, below menus)
//   DROPDOWN    400   HUD nav dropdown menus (.hud-menu__dropdown)
//   BANNER      500   top-center banners (trade-confirm)
//   OVERLAY     600   beacon-opened full overlays (Queen Messenger)
//   MODAL       700   centered .modal-overlay / FloatingWindow family
//   MODAL_2     710   modals stacked over modals (detail windows, wallet modals)
//   MODAL_3     720   modals opened from detail windows (join/application)
//   FULLSCREEN  800   full-screen takeovers (Nexus hub, arrival, foreign-dapp iframe)
//   NOTICE      950   corner notices (faucet card, bug-report button)
//   POPOUT      980   portaled dropdowns/context menus that must escape modal overflow
//   GATE        990   blocking gates (stranger gate, action-blocked)
//   TOAST       1000  toasts — top of normal UI
//   LOCK        2_000_000_000  ceremony hard lock — DELIBERATELY above everything
//                              incl. toasts (UpdateCeremony invariant; do not lower)

export const Z = {
  CANVAS: 0,
  HUD: 5,
  PANEL: 300,
  CHAT: 310,
  DROPDOWN: 400,
  BANNER: 500,
  OVERLAY: 600,
  MODAL: 700,
  MODAL_2: 710,
  MODAL_3: 720,
  FULLSCREEN: 800,
  NOTICE: 950,
  POPOUT: 980,
  GATE: 990,
  TOAST: 1000,
  LOCK: 2_000_000_000,
} as const;

export type ZStratum = keyof typeof Z;

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
