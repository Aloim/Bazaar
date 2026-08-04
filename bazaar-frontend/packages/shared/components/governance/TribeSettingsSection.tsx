// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// src/components/TribeSettingsSection.tsx
// Shown in GlobalGovernancePanel > SuperAdmin > Tribe Settings.
// Merged 2026-05-12: absorbed the former Accessibility sub-tab so Join Policy
// and Store Visibility live in one place (was duplicated across tabs).
//
// Visibility:
//   - Join Policy buttons          → TribeLeaderCap holder only.
//   - Tribe Store Visibility       → any of TribeLeaderCap / TribeSuperAdminCap /
//                                    TribeAdminCap. Higher tiers route to the
//                                    matching Move entry fn (added 2026-05-13).
//   - Pending Applications list    → anyone with leader/admin tier; actions
//                                    require leader cap (table-style reused
//                                    from Admin → Applications for parity).

import React, { useState } from "react";
import { EasyOrAdvanced } from "@bazaar/shared/components/BazaarFeature";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { buildSetJoinPolicyAsLeader } from "@bazaar/shared/tx";
import {
  buildSetTribeStoreVisibility,
  buildSetTribeStoreVisibilityAsLeader,
  buildSetTribeStoreVisibilityAsSuperAdmin,
} from "@bazaar/shared/tx/bazaarcore/tribe-governance-tx";
import { ApplicationsSubTab } from "@bazaar/shared/components/governance/TribeGovernancePanel/Admin/ApplicationsSubTab";

interface Props {
  leaderCapId:     string | null;
  /** TribeSuperAdminCap object ID — second-tier auth for store visibility. */
  superAdminCapId: string | null;
  /** TribeAdminCap object ID — third-tier auth for store visibility. */
  adminCapId:      string | null;
  /** TribeGovernance shared object ID — required for store visibility move call. */
  tribeGovId:      string | null;
  tribeIdx:        number;
  registryId:      string;
}

export default function TribeSettingsSection({
  leaderCapId,
  superAdminCapId,
  adminCapId,
  tribeGovId,
  tribeIdx,
  registryId,
}: Props) {
  const [policyLoading, setPolicyLoading] = useState(false);
  const [visLoading,    setVisLoading]    = useState(false);

  // Surface current join policy for the active-button affordance.
  const { tribes } = useTribeRegistry();
  const currentJoinPolicy: 0 | 1 | -1 =
    ((tribes.find(t => t.idx === tribeIdx)?.joinPolicy ?? -1) as 0 | 1 | -1);

  async function setPolicy(policy: 0 | 1) {
    if (!leaderCapId) return;
    setPolicyLoading(true);
    try {
      const tx = buildSetJoinPolicyAsLeader(registryId, leaderCapId, policy);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setPolicyLoading(false);
    }
  }

  // Cap precedence: Leader > SuperAdmin > Admin. Pick the highest-tier cap held
  // and route to the matching Move entry fn.
  const visibilityCap: { tier: "leader" | "super-admin" | "admin"; id: string } | null =
    leaderCapId    ? { tier: "leader",      id: leaderCapId    } :
    superAdminCapId? { tier: "super-admin", id: superAdminCapId } :
    adminCapId     ? { tier: "admin",       id: adminCapId     } :
    null;

  async function setVisibility(v: 0 | 1) {
    if (!visibilityCap || !tribeGovId) return;
    setVisLoading(true);
    try {
      const tx =
        visibilityCap.tier === "leader"
          ? buildSetTribeStoreVisibilityAsLeader({
              leaderCapId: visibilityCap.id, tribeGovId, visibility: v,
            })
          : visibilityCap.tier === "super-admin"
          ? buildSetTribeStoreVisibilityAsSuperAdmin({
              superAdminCapId: visibilityCap.id, tribeGovId, visibility: v,
            })
          : buildSetTribeStoreVisibility({
              adminCapId: visibilityCap.id, tribeGovId, visibility: v,
            });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setVisLoading(false);
    }
  }

  return (
    <EasyOrAdvanced>
    <div>
      {/* Join Policy — TribeLeaderCap only */}
      <div style={sectionStyle}>
        <h4 style={headingStyle}>Join Policy</h4>
        <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          Controls how new SSUs can join your tribe. "Open" lets anyone join
          immediately. "Application Required" routes new members through an
          approval queue (see Pending Applications below).
          {currentJoinPolicy !== -1 && (
            <span style={{ display: "block", marginTop: "0.25rem" }}>
              Current:{" "}
              <strong>{currentJoinPolicy === 0 ? "Open" : "Application Required"}</strong>
            </span>
          )}
        </p>
        {!leaderCapId && (
          <p style={{ color: "var(--color-warn, #f5a623)", fontSize: "0.78rem", marginBottom: "0.5rem" }}>
            TribeLeaderCap required to change join policy.
          </p>
        )}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setPolicy(0)}
            disabled={!leaderCapId || policyLoading || currentJoinPolicy === 0}
            style={{ flex: 1 }}
          >
            Open (anyone can join)
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setPolicy(1)}
            disabled={!leaderCapId || policyLoading || currentJoinPolicy === 1}
            style={{ flex: 1 }}
          >
            Application Required
          </button>
        </div>
        {policyLoading && (
          <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.4rem" }}>Updating...</p>
        )}
      </div>

      {/* Tribe Store Visibility — any of Leader / SuperAdmin / Admin caps */}
      <div style={sectionStyle}>
        <h4 style={headingStyle}>Tribe Store Visibility</h4>
        <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          Controls who can transact at this tribe's SSU. "Public" allows
          anyone; "Members Only" restricts buyers to tribe members.
        </p>
        {!visibilityCap && (
          <p style={{ color: "var(--color-warn, #f5a623)", fontSize: "0.78rem", marginBottom: "0.5rem" }}>
            TribeLeaderCap, TribeSuperAdminCap, or TribeAdminCap required to change store visibility.
          </p>
        )}
        {visibilityCap && (
          <p className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.5rem" }}>
            Acting as: <strong>{visibilityCap.tier === "leader" ? "TribeLeaderCap" : visibilityCap.tier === "super-admin" ? "TribeSuperAdminCap" : "TribeAdminCap"}</strong>
          </p>
        )}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn btn--ghost btn--sm"
            disabled={!visibilityCap || !tribeGovId || visLoading}
            onClick={() => setVisibility(0)}
            style={{ flex: 1 }}
          >
            {visLoading ? "..." : "Set Public"}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            disabled={!visibilityCap || !tribeGovId || visLoading}
            onClick={() => setVisibility(1)}
            style={{ flex: 1 }}
          >
            {visLoading ? "..." : "Set Members Only"}
          </button>
        </div>
      </div>

      {/* Pending Applications — reuses the Admin → Applications layout for parity */}
      <div style={sectionStyle}>
        <ApplicationsSubTab leaderCapId={leaderCapId} tribeIdx={tribeIdx} />
      </div>
    </div>
    </EasyOrAdvanced>
  );
}

const sectionStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 6,
  padding: "0.9rem 1rem",
  marginBottom: "0.75rem",
};

const headingStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "var(--accent, #cc7000)",
  fontFamily: "var(--font-display)",
  letterSpacing: "0.04em",
  marginBottom: "0.5rem",
};

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
