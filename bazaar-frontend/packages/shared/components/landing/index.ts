// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * landing/index.ts — Barrel re-export for all landing sub-components.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

// Landing sub-components.
// Import via "@bazaar/shared/components/landing" or the root "@bazaar/shared".
// The legacy BootScan → HalGate → Recognized → Docked flow (and its constants)
// was retired with the matrix-rain IntroSequence; only the live pieces remain.

export { default as ConnectPrompt }   from "./ConnectPrompt";

export { default as Portal }          from "./Portal";
export type { PortalProps, PortalCapabilities, PortalWidgets } from "./Portal";

export { default as ManagedSsusView } from "./ManagedSsusView";
export type { ManagedSsusViewProps, ManagedTribe, RegisteredSsuEntry } from "./ManagedSsusView";

// LandingScreen default export — used by bazaar app App.tsx files.
// LandingScreen lives at ./LandingScreen/index.tsx (folder-index pattern).
export { default as LandingScreen } from "./LandingScreen";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
