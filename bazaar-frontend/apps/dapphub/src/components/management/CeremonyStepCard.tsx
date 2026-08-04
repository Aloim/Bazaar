// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — UI: per-step wrapper card for <UpdateCeremonyTab />.
 *
 * Renders the step number + title + an optional gating notice + a body slot.
 * Used 7× by the ceremony tab — once per timeline step in plan §10.
 *
 * Constitution Article XIV.4 (500 LOC) exempt during UpdateCeremonyPlan.
 */

import type { ReactNode } from "react";

export interface CeremonyStepCardProps {
  step: number;
  title: string;
  /** Optional gating message rendered above the body (e.g. "Disabled until
   *  all drains report zero rows."). */
  gatedNotice?: string | null;
  /** Visual cue that this step is currently inert in v1 (e.g. Step 5
   *  Populate ReclaimRegistry → v2). */
  inert?: boolean;
  children?: ReactNode;
}

const ROOT_STYLE: React.CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.08)",
  background: "rgba(255, 255, 255, 0.02)",
  padding: "0.85rem 1rem",
  marginBottom: "0.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.55rem",
  fontFamily: "var(--font-body, monospace)",
};

const HEADER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "0.6rem",
};

const STEP_PILL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display, monospace)",
  color: "var(--accent, #cc7000)",
  fontSize: "0.8rem",
  letterSpacing: "0.1em",
};

const TITLE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display, monospace)",
  fontSize: "0.95rem",
  letterSpacing: "0.06em",
};

const NOTICE_STYLE: React.CSSProperties = {
  background: "rgba(255, 215, 0, 0.08)",
  borderLeft: "2px solid rgba(255, 215, 0, 0.6)",
  color: "rgba(255, 215, 0, 0.9)",
  padding: "0.35rem 0.6rem",
  fontSize: "0.78rem",
};

const INERT_BADGE_STYLE: React.CSSProperties = {
  marginLeft: "auto",
  fontSize: "0.7rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(255, 255, 255, 0.4)",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  padding: "0.1rem 0.4rem",
};

export default function CeremonyStepCard({
  step,
  title,
  gatedNotice,
  inert,
  children,
}: CeremonyStepCardProps) {
  return (
    <div style={ROOT_STYLE}>
      <div style={HEADER_STYLE}>
        <span style={STEP_PILL_STYLE}>STEP {step}</span>
        <span style={TITLE_STYLE}>{title}</span>
        {inert && <span style={INERT_BADGE_STYLE}>v2-only</span>}
      </div>
      {gatedNotice && <div style={NOTICE_STYLE}>{gatedNotice}</div>}
      {children && <div>{children}</div>}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
