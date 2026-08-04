// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/components/godot — Barrel export for Godot banner components.
 *
 * Phase: AP2-E / FP1-30
 * File limit: 500 lines | Constitution Article XIV.4
 */

export { default as CustomClientBanner } from "./CustomClientBanner";
export type { CustomClientBannerProps } from "./CustomClientBanner";

// R2.4: GodotGameWrapper build stub (OS-14; full port in R3)
export { default as GodotGameWrapper }  from "./GodotGameWrapper";
export type { GodotGameWrapperProps }   from "./GodotGameWrapper";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
