// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1.1 — Step-2 "force-close everything" enumeration panel.
 *
 * Replaces the old CLI-only posture: this lists every active shop (grouped by
 * owner) + every active mission (with its live takers), each as a one-click
 * PTB-shaped drain unit. Each row resolves its own shared objects / Character
 * and drives the matching DAppOwnerCap-gated Move entry:
 *   - shops    → close_all_shops_batch (allow_ssu_owner=true) → owner locker
 *   - missions → settle takers (collateral 100% → takers) then cancel (reward → giver)
 *
 * Work one row at a time top-to-bottom; the live counts in Step 2 + the Step-3
 * gate go to zero as rows clear. DappHub-EXEMPT (rows sign via dAppKit directly).
 */

import { useForceClosePlan } from "@bazaar/shared/hooks/ceremony";
import ShopOwnerDrainRow from "./ShopOwnerDrainRow";
import MissionDrainRow from "./MissionDrainRow";

interface Props {
  ownerCapId: string;
}

const WRAP_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  fontFamily: "monospace",
  fontSize: "0.78rem",
  marginTop: "0.5rem",
};

const BAR_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const SUMMARY_STYLE: React.CSSProperties = { color: "rgba(255,255,255,0.8)" };
const SECTION_HDR_STYLE: React.CSSProperties = {
  color: "#cc7000",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontSize: "0.72rem",
  marginTop: "0.35rem",
};
const EMPTY_STYLE: React.CSSProperties = { color: "#7fc97f", fontSize: "0.74rem" };
const ERR_STYLE: React.CSSProperties = { color: "#e55555", fontSize: "0.74rem" };

const REFRESH_BTN: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.2)",
  color: "#e8e8e8",
  padding: "0.25rem 0.7rem",
  fontFamily: "monospace",
  fontSize: "0.72rem",
  cursor: "pointer",
};

export default function Step2ForceCloseEverything({ ownerCapId }: Props) {
  const plan = useForceClosePlan();
  const nothingLeft = plan.shopGroups.length === 0 && plan.missions.length === 0;

  return (
    <div style={WRAP_STYLE}>
      <div style={BAR_STYLE}>
        <span style={SUMMARY_STYLE}>
          Force-close plan:{" "}
          <strong>{plan.totalShops}</strong> shop{plan.totalShops === 1 ? "" : "s"} in{" "}
          <strong>{plan.shopGroups.length}</strong> owner group{plan.shopGroups.length === 1 ? "" : "s"},{" "}
          <strong>{plan.totalMissions}</strong> mission{plan.totalMissions === 1 ? "" : "s"}
          {plan.isFetching && " · refreshing…"}
        </span>
        <button style={REFRESH_BTN} onClick={plan.refetch} disabled={plan.isFetching}>
          {plan.isFetching ? "…" : "↻ Refresh"}
        </button>
      </div>

      {plan.error && <span style={ERR_STYLE}>Error enumerating plan: {plan.error}</span>}

      {plan.isLoading && <span style={SUMMARY_STYLE}>Enumerating active shops + missions…</span>}

      {!plan.isLoading && nothingLeft && !plan.error && (
        <span style={EMPTY_STYLE}>✓ Nothing active to force-close — all shops + missions are clear.</span>
      )}

      {plan.shopGroups.length > 0 && (
        <>
          <div style={SECTION_HDR_STYLE}>Shops ({plan.shopGroups.length} owner groups)</div>
          {plan.shopGroups.map((g) => (
            <ShopOwnerDrainRow key={g.key} group={g} ownerCapId={ownerCapId} onSettled={plan.refetch} />
          ))}
        </>
      )}

      {plan.missions.length > 0 && (
        <>
          <div style={SECTION_HDR_STYLE}>Missions ({plan.missions.length})</div>
          {plan.missions.map((m) => (
            <MissionDrainRow key={m.missionId} item={m} ownerCapId={ownerCapId} onSettled={plan.refetch} />
          ))}
        </>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
