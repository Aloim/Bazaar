// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// SSUGovernanceNavButton — topbar navigation button for SSU Governance panel.
// CEF deliverable 2: mounted in all 3 app App.tsx instances.
// Visibility gated by caller (App.tsx checks useOwnedCaps().hasOwnerCap).
// This component renders unconditionally when mounted — the gate lives in App.tsx.
// Rationale: separation of concerns; the button itself has no RPC dependency.

import type { CSSProperties } from "react";

export interface SSUGovernanceNavButtonProps {
  /** Called when the button is clicked. App.tsx opens the gov panel via local state. */
  onOpen: () => void;
  /** Optional CSS class override. Defaults to btn btn--outline styling. */
  className?: string;
  style?: CSSProperties;
}

export default function SSUGovernanceNavButton({
  onOpen,
  className,
  style,
}: SSUGovernanceNavButtonProps) {
  return (
    <button
      className={className ?? "btn btn--outline btn--sm"}
      style={style}
      onClick={onOpen}
      title="Open SSU Governance panel"
      aria-label="SSU Governance"
    >
      SSU GOV
    </button>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
