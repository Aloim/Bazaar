// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ActivateGovernanceCard — legacy-tribe healing banner (Phase 6 W2, LEAD-09).
 *
 * Tribes created through the pre-bundle builders (TribeRegistrationForm until
 * Phase 6 W1) have NO TribeGovernance object — every governance surface dead-
 * ends. This card self-detects the state (led tribe with `tribeGovId === null`
 * via useTribeCaps + useTribeRegistry) and offers the heal:
 *   Easy     → one-click bootstrap_tribe_governance (leader-cap-gated,
 *              fee-free, one-shot — double-run aborts E_ALREADY_SET).
 *   Advanced → routes to Owner → Bootstrap Economy (needs the ≥1 EVE vault
 *              seed + withdrawal quorum; bootstrap_advanced_complete).
 * Rendered by the SHARED TribeGovernancePanel shell so it lands on both hosts
 * (DappHub tribeOnly + in-game) per the shared-surface rule.
 *
 * NOT the same control as Owner → General → "Activate Governance" (the
 * lifecycle re-activate toggle on an EXISTING gov object) — this card creates
 * the missing object and only renders while it is missing.
 *
 * Known limitation (pre-existing, all surfaces): useTribeCaps resolves the
 * FIRST leader cap found — multi-tribe leaders heal one tribe per wallet.
 */

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { buildBootstrapTribeGovernance } from "@bazaar/shared/tx/bazaarcore/tribe-governance-tx";
import { TRIBE_REGISTRY_ID } from "@bazaar/shared/constants";
import { useToast } from "@bazaar/shared/components";

const BAZAAR_TYPE_EASY = 1;
const BAZAAR_TYPE_ADVANCED = 2;

interface ActivateGovernanceCardProps {
  /** Routes the Advanced heal to the Owner tab (Bootstrap Economy form). */
  onGoToOwnerTab: () => void;
}

export function ActivateGovernanceCard({ onGoToOwnerTab }: ActivateGovernanceCardProps) {
  const { leaderCapId, leaderTribeIdx } = useTribeCaps();
  const { tribes, refetch: refetchRegistry } = useTribeRegistry();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const tribe = leaderTribeIdx !== null
    ? tribes.find(t => t.idx === leaderTribeIdx)
    : null;

  // Render only for the broken state: led tribe, governance never bootstrapped.
  if (!leaderCapId || !tribe || tribe.tribeGovId !== null) return null;

  const isEasy = tribe.bazaarType === BAZAAR_TYPE_EASY;
  const isAdvanced = tribe.bazaarType === BAZAAR_TYPE_ADVANCED;

  async function handleActivateEasy() {
    if (!leaderCapId) return;
    setBusy(true);
    setError("");
    try {
      const tx = buildBootstrapTribeGovernance({
        tribeRegistryId: TRIBE_REGISTRY_ID,
        leaderCapId,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      refetchRegistry();
      toast.success("Governance activated", {
        detail: `"${tribe?.name ?? "Tribe"}" now has its TribeGovernance — all panel tabs are live.`,
        duration: 7000,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Activation transaction failed.";
      setError(msg);
      toast.error("Activation failed", { detail: msg, duration: 9000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="action-card"
      style={{
        margin: "0.75rem 1rem 0",
        borderLeft: "3px solid var(--color-warn, #f5a623)",
        background: "rgba(245, 166, 35, 0.06)",
      }}
    >
      <h4 style={{ color: "var(--color-warn, #f5a623)", marginBottom: "0.25rem" }}>
        ⚠ Governance not activated — {tribe.name}
        <span className="muted" style={{ fontWeight: "normal", fontSize: "0.72rem", marginLeft: "0.5rem" }}>
          tribe #{tribe.idx}
        </span>
      </h4>
      <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.6rem" }}>
        This tribe was created before bundled bootstrapping — its governance
        object was never created, so taxes, roles, bans and wallets are
        unavailable. As Tribe Leader you can activate it now
        {isEasy ? " in one click (free, one transaction)." :
         isAdvanced ? " — the Advanced bootstrap needs your ≥1 EVE vault seed and a withdrawal quorum." :
         "."}
      </p>
      {isEasy && (
        <button
          className="btn btn--primary btn--sm"
          disabled={busy}
          onClick={handleActivateEasy}
        >
          {busy ? "Activating…" : "Activate Governance"}
        </button>
      )}
      {isAdvanced && (
        <button
          className="btn btn--primary btn--sm"
          onClick={onGoToOwnerTab}
        >
          Set up in Bootstrap Economy →
        </button>
      )}
      {error && (
        <p style={{ color: "var(--color-danger, #f44336)", fontSize: "0.8rem", marginTop: "0.4rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
