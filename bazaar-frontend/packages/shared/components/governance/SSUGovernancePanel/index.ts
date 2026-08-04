// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * SSUGovernancePanel — directory barrel (R6.6.4b OS-32)
 *
 * Re-exports the default component and its Props type so consumers can import
 * from the directory path without knowing the internal file layout.
 *
 * Usage:
 *   import { SSUGovernancePanel } from "@bazaar/shared/components/governance/SSUGovernancePanel";
 *   import type { SSUGovernancePanelProps } from "@bazaar/shared/components/governance/SSUGovernancePanel";
 */

export { default as SSUGovernancePanel, default } from "./index.tsx";
export type { SSUGovernancePanelProps } from "./index.tsx";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
