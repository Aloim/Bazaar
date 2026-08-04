// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeGovernancePanel — directory barrel.
 * Re-exports the default component and the public Props type.
 *
 * R6.6.4c — OS-33 (TribeGovernancePanel port)
 * Pattern: .ts barrel (NOT .tsx) per R6.6.4b lesson learned.
 */

// Default export re-export — name is assigned for tree-shaking clarity.
export { default as TribeGovernancePanel } from "./index.tsx";

// Props type re-export — consumers may import TribeGovernancePanelProps from
// "@bazaar/shared/components/governance/TribeGovernancePanel" without a deep path.
export type { Props as TribeGovernancePanelProps } from "./index.tsx";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
