// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCustomizationTab — Parent tab component with sub-tab switcher.
 *
 * Renders two sub-tabs:
 *   - Production Host: on-chain godot_url setter (cap-gated TX)
 *   - Developer Override: localStorage-only per-SSU URL map (UX cap-gated)
 *
 * Exported predicates (isSSUCustomizationTabVisible, isTribeCustomizationTabVisible)
 * are used by GovernanceButton wrappers BEFORE this tab is mounted to guard visibility.
 *
 * Phase: AP2-D / FP1-29
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState } from "react";
import type { SSUCaps, TribeCaps, BazaarTypeNum } from "@bazaar/shared/types/bazaarcore";
import ProductionHostPanel from "./BazaarCustomizationTab/ProductionHostPanel";
import DeveloperOverridePanel from "./BazaarCustomizationTab/DeveloperOverridePanel";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CustomizationScope = "ssu" | "tribe";

export interface BazaarCustomizationTabProps {
  scope: CustomizationScope;
  /**
   * SSUGovernance shared object ID (scope="ssu") or
   * TribeGovernance shared object ID (scope="tribe").
   */
  govId: string;
  /**
   * SSUOwnerCap ID (scope="ssu") or TribeLeaderCap ID (scope="tribe").
   * null = SuperAdmin-only holder — Production Host renders read-only.
   */
  capId: string | null;
  /**
   * Whether the Dev Override sub-tab is accessible (UX gate only — see Article VII).
   * true when wallet holds SSUSuperAdminCap, SSUOwnerCap, TribeSuperAdminCap, or TribeLeaderCap.
   */
  devOverrideEnabled: boolean;
}

// ── Visibility predicates (exported for unit testing) ─────────────────────────

/**
 * SSU-scope visibility predicate for the Bazaar Customization tab.
 * Tab appears inside an SSUGovernanceButton only when:
 *   - the SSU is a NoTribe bazaar (bazaar_type === 0), AND
 *   - the wallet holds either SSUSuperAdminCap or SSUOwnerCap.
 *
 * bazaarType=null (hook still loading / RPC stubbed) → false (safe default).
 * Pre-FP1-23 stubs: all cap flags false → always false → tab hides. No visual regression.
 */
export function isSSUCustomizationTabVisible(
  bazaarType: BazaarTypeNum | null | undefined,
  caps: SSUCaps | null | undefined,
): boolean {
  if (bazaarType !== 0) return false;
  return !!(caps?.hasSSUOwnerCap || caps?.hasSSUSuperAdminCap);
}

/**
 * Tribe-scope visibility predicate for the Bazaar Customization tab.
 * Tab appears inside a TribeGovernanceButton only when:
 *   - tribeGovId is resolvable (FP1-24 done), AND
 *   - the wallet holds either TribeSuperAdminCap or TribeLeaderCap.
 *
 * tribeGovId=null (FP1-24 not yet shipped) → false (safe default).
 */
export function isTribeCustomizationTabVisible(
  tribeGovId: string | null | undefined,
  caps: TribeCaps | null | undefined,
): boolean {
  if (!tribeGovId) return false;
  return !!(caps?.hasTribeLeaderCap || caps?.hasTribeSuperAdminCap);
}

// ── Component ─────────────────────────────────────────────────────────────────

type SubTab = "production" | "dev";

export default function BazaarCustomizationTab({
  scope,
  govId,
  capId,
  devOverrideEnabled,
}: BazaarCustomizationTabProps) {
  const [subTab, setSubTab] = useState<SubTab>("production");

  function handleDevTabClick() {
    if (!devOverrideEnabled) return;
    setSubTab("dev");
  }

  return (
    <div className="panel__section">
      <div className="panel__tabs" style={{ marginBottom: "1rem" }}>
        <button
          className={`tab ${subTab === "production" ? "tab--active" : ""}`}
          onClick={() => setSubTab("production")}
        >
          Production Host
        </button>
        <button
          className={`tab ${subTab === "dev" ? "tab--active" : ""}`}
          onClick={handleDevTabClick}
          aria-disabled={!devOverrideEnabled}
          title={!devOverrideEnabled ? "Requires SSUOwnerCap, SSUSuperAdminCap, TribeLeaderCap, or TribeSuperAdminCap" : undefined}
          style={{ opacity: devOverrideEnabled ? 1 : 0.45, cursor: devOverrideEnabled ? "pointer" : "not-allowed" }}
        >
          Developer Override
        </button>
      </div>

      {subTab === "production" && (
        <ProductionHostPanel scope={scope} govId={govId} capId={capId} />
      )}
      {subTab === "dev" && devOverrideEnabled && (
        <DeveloperOverridePanel defaultSsuId={scope === "ssu" ? govId : ""} />
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
