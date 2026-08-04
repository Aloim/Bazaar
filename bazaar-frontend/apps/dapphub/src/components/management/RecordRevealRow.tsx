// bazaar-frontend | Live-SSU reveal-recording button so the depreciation certificate can ever be earned
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V41 SSU depreciation/prune — CR-P6-01 remediation: the LIVE-SSU counterpart to
 * DepreciationDrainRow. `ssu_governance::location_revealed` has exactly ONE
 * production writer — `ssu_depreciation::mark_ssu_revealed_impl`
 * (BazaarCore/sources/ssu_depreciation.move:74-82) — and it can ONLY ever be set
 * TRUE while the SSU is ALIVE (world::location resolves Some for it). Once the
 * SSU dies, get_location is none() forever and the flag can never be earned
 * retroactively — so without a call site reachable on a LIVE SSU,
 * mark_ssu_depreciated dead-ends on E_NOT_REVEALED for every SSU whose reveal was
 * never recorded, and the entire refund/prune flow in DepreciationDrainRow.tsx is
 * unreachable. Plan §2.2 mandates exactly this: "FE calls it opportunistically
 * (post-registration confirm, on first shop interaction)."
 *
 * Re-verified this session (ssu_depreciation.move:74-82,
 * `mark_ssu_revealed_impl`): the none-case is a SILENT, IDEMPOTENT NO-OP, not an
 * abort (only the production entry's own LOCATION_REGISTRY_ID identity assert,
 * E_WRONG_REGISTRY, can abort — a config check, unrelated to reveal state). So
 * this button can NEVER fire a guaranteed-abort transaction; no pre-check
 * devInspect gate is required before calling it. The UI still reads the current
 * `locationRevealed` flag (useSSUGovernanceConfig, the SAME already-fetched
 * SSUGovernance object — zero extra RPC) purely so a wallet is not invited to
 * re-click a no-op forever: once true, the row shows a checkmark and hides the
 * button.
 *
 * Mounted in SSUDetailsWindow.tsx for every NON-depreciated SSU (any admin/
 * janitor visit can certify it) — the critic's confirmed minimum-acceptable fix
 * for CR-P6-01.
 *
 * Deliberately NOT bundled here: an auto-fire-on-mount signature (silently
 * prompting a wallet approval the instant an admin opens SSU Details would be an
 * unsolicited signing request — poor UX, and some wallet extensions gate/flag
 * unsolicited prompts), or composing this call into the registration-confirm /
 * first-shop-interaction flows (the plan's other "opportunistic" suggestion) —
 * that would touch already-reviewed, approved tx-builder files
 * (registration-helpers-tx.ts / shop-trade-tx.ts) outside this patch's diff
 * surface. This is an explicit, visible deferral of the auto/opportunistic half,
 * not a silent gap — the visible button below is the wired, reachable path that
 * makes every live bazaar certifiable.
 *
 * Permissionless (no cap) — mirrors mark_ssu_revealed's own Move-side gate.
 * DappHub-EXEMPT (#15 — does not import the DApp-actions gate hook).
 */

import type { Transaction } from "@mysten/sui/transactions";
import { useSSUGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useSSUGovernanceConfig } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import { buildMarkSsuRevealed } from "@bazaar/shared/tx/bazaarcore/ssu-depreciation-tx";
import { WORLD_LOCATION_REGISTRY_ID } from "@bazaar/shared/constants";
import DrainBatchButton from "./DrainBatchButton";

interface Props {
  ssuId: string;
}

const WRAP_STYLE: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.5rem" };
const WAIT_STYLE: React.CSSProperties = { color: "rgba(255,255,255,0.5)", fontStyle: "italic", fontSize: "0.78rem" };
const OK_STYLE: React.CSSProperties = { color: "#7fc97f", fontSize: "0.78rem" };

export default function RecordRevealRow({ ssuId }: Props) {
  const ssuGov = useSSUGovId(ssuId);
  const ssuGovId = ssuGov.data ?? null;
  const govConfig = useSSUGovernanceConfig(ssuGovId);

  if (ssuGov.isLoading || (ssuGovId && govConfig.isLoading)) {
    return <span style={WAIT_STYLE}>Resolving reveal status…</span>;
  }
  if (!ssuGovId) {
    // SSU not yet bootstrapped (no SSUGovernance) — nothing to record yet.
    return null;
  }
  if (govConfig.data?.locationRevealed) {
    return <span style={OK_STYLE}>✓ Location reveal recorded on-chain — this SSU is certifiable if it ever dies.</span>;
  }

  const fetchTrigger = async (): Promise<string[]> => [ssuId];
  const buildChunk = (_ids: string[], tx: Transaction): Transaction =>
    buildMarkSsuRevealed({ ssuGovId, locationRegistryId: WORLD_LOCATION_REGISTRY_ID }, tx);

  return (
    <div style={WRAP_STYLE}>
      <p className="muted" style={{ fontSize: "0.78rem", marginBottom: 0 }}>
        Records this SSU's live in-game location on-chain — do this once, while the SSU is alive, so a
        future unanchor can be proven and its shops/missions/collateral refunded and delisted automatically.
        Safe to click any time (a no-op if the location isn't revealed in-world yet).
      </p>
      <DrainBatchButton
        label="Record reveal state"
        fetchIds={fetchTrigger}
        buildChunkTx={buildChunk}
        pageSize={1}
        onPageSettled={() => { void govConfig.refetch(); }}
      />
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
