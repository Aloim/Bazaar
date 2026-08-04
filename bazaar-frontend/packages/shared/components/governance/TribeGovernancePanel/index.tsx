// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeGovernancePanel — top-level shell + 4-tab dispatcher.
 *
 * ⚠ SHARED-SURFACE RULE (AI + humans, READ THIS): this component is rendered on
 * TWO surfaces from ONE source — the in-game Godot client
 * (packages/shared/components/godot/GodotGameWrapper/index.tsx, Panel #14) and the
 * DappHub host (apps/dapphub/src/components/hub/TribeGovernanceScreen.tsx). Any
 * change to tribe-governance behavior MUST be made HERE (or its tab children) so
 * it lands on BOTH surfaces automatically — never fork one surface. The SSU twin
 * is SSUGovernancePanel (same rule). Host-level wiring differences (the DappHub
 * `tribeOnly` flag, the ClaimBoxProvider wrap) must be mirrored on both hosts.
 *
 * Port of Bazar1 GlobalGovernancePanel lines 84-191 with drift adaptations:
 *   - Renamed GlobalGovernancePanel → TribeGovernancePanel (R6.6.4c semantic rename).
 *   - Uses @bazaar/shared/hooks imports (not relative ../hooks/*).
 *   - NoTribe gating is handled at the wrapper level (GodotGameWrapper) — this
 *     component may assume Easy/Advanced context when mounted.
 *
 * R6.6.4c — OS-33 (TribeGovernancePanel port)
 * Tabs: moderation (all caps) | admin (admin+) | superadmin (SA+) | owner (owner only)
 */

import { useState } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useOwnedCaps } from "@bazaar/shared/hooks/useOwnedCaps";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import type { TribeGovTab } from "./util";
import { TribeModerationTab } from "./ModerationTab";
import { TribeAdminTab } from "./AdminTab";
import { TribeSuperAdminTab } from "./SuperAdmin/index";
import { TribeOwnerTab } from "./OwnerTab";
import { ActivateGovernanceCard } from "./ActivateGovernanceCard";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface Props {
  onClose: () => void;
  /**
   * DappHub "tribe-only" mode. When true, the panel is being driven from the
   * DappHub (no SSU context): SSU-scoped Admin / SuperAdmin sub-tabs are hidden,
   * leaving tribe governance (Moderation = tribe-wide timed bans, Owner,
   * SuperAdmin tribe sub-tabs, Admin → Applications + Tribe Limits). Phase 8 A2
   * (AUD-ET-20): Moderation is tribe-scoped since the V35 timed-ban rewire and
   * is NO LONGER hidden here — SSU-less leaders can ban/unban. Access + tab
   * tiers are derived from tribe caps. Default false preserves the in-game
   * (SSU) panel exactly.
   */
  tribeOnly?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TribeGovernancePanel({ onClose, tribeOnly = false }: Props) {
  const { walletAddress } = useConnection();

  const {
    hasOwnerCap, hasSuperAdminCap, hasAdminCap, hasModCap,
    ownerCapId, superAdminCapId, adminCapId, modCapId,
  } = useOwnedCaps();

  // Tribe caps (TribeLeaderCap / TribeSuperAdminCap / TribeAdminCap). A tribe
  // leader who never bootstrapped an SSU holds these but no membership::SSU*Cap,
  // so the panel must accept them too — otherwise SSU-less tribe leaders are
  // locked out. Additive: in-game (SSU) behavior is unchanged.
  const {
    hasLeaderCap, hasSuperAdminCap: hasTribeSuperAdmin, hasAdminCap: hasTribeAdmin,
    leaderCapId, superAdminCapId: tribeSuperAdminCapId, adminCapId: tribeAdminCapId,
  } = useTribeCaps();

  // Effective governance tiers = SSU cap OR tribe cap (higher tiers imply lower).
  const ownerTier      = hasOwnerCap || hasLeaderCap;
  const superAdminTier = hasSuperAdminCap || hasTribeSuperAdmin || ownerTier;
  const adminTier      = hasAdminCap || hasTribeAdmin || superAdminTier;
  const modTier        = hasModCap || adminTier;

  const hasAnyAccess = ownerTier || superAdminTier || adminTier || modTier;

  // Resolve best available capId (moderation / ban calls use the most-privileged
  // cap). In tribeOnly mode prefer the tribe caps (set_tribe_ban expects a tribe
  // cap); otherwise prefer the SSU caps as before.
  const capId = tribeOnly
    ? (leaderCapId ?? tribeSuperAdminCapId ?? tribeAdminCapId ?? "")
    : (modCapId ?? adminCapId ?? superAdminCapId ?? ownerCapId ?? "");

  // ── Tab list (tier-gated; AUD-ET-20: moderation available in tribeOnly too —
  // the V35 ban system is tribe-scoped, not SSU-scoped) ────────────────────────
  const tabs: TribeGovTab[] = [];
  tabs.push("moderation");
  if (adminTier)      tabs.push("admin");
  if (superAdminTier) tabs.push("superadmin");
  if (ownerTier)      tabs.push("owner");

  const [tab, setTab] = useState<TribeGovTab>(tribeOnly ? "owner" : "moderation");
  // Fall back to the first available tab if the current one isn't in the list
  // (e.g. tribeOnly default "owner" but the wallet is only a tribe admin).
  const activeTab: TribeGovTab = tabs.includes(tab) ? tab : (tabs[0] ?? "owner");

  // ── No-access guard ──────────────────────────────────────────────────────────

  if (!hasAnyAccess) {
    return (
      <div className="panel" style={{ maxWidth: 800 }}>
        <div className="panel__header">
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Back</button>
          <h2>Tribe Governance</h2>
        </div>
        <div className="panel__section">
          <p className="muted">
            No tribe governance capability detected. You need a ModCap, AdminCap,
            SuperAdminCap, or OwnerCap.
          </p>
        </div>
      </div>
    );
  }

  const tabLabel: Record<TribeGovTab, string> = {
    moderation: "Moderation",
    admin:      "Admin",
    superadmin: "SuperAdmin",
    owner:      "Owner",
  };

  // capType for moderation-tab delegate; proxy for OS-50 Remove gate.
  const capType = ownerTier ? "owner"
    : superAdminTier ? "superadmin"
    : adminTier ? "admin"
    : "mod";

  const addr = walletAddress ?? "";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="panel" style={{ maxWidth: 800 }}>
      <div className="panel__header">
        <button className="btn btn--ghost btn--sm" onClick={onClose}>Back</button>
        <h2>Tribe Governance</h2>
        <button
          className="btn btn--ghost btn--sm"
          style={{ marginLeft: "auto" }}
          onClick={onClose}
          aria-label="Close Tribe Governance panel"
        >&#x2715;</button>
      </div>

      {/* Phase 6 W2 (LEAD-09): healing banner for governance-less legacy
          tribes — self-detecting, renders only while tribe_gov_id is unset.
          Shared-surface: lands on the DappHub AND in-game hosts. */}
      <ActivateGovernanceCard onGoToOwnerTab={() => setTab("owner")} />

      <div className="panel__tabs">
        {tabs.map(t => (
          <button
            key={t}
            className={`tab ${activeTab === t ? "tab--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {tabLabel[t]}
          </button>
        ))}
      </div>

      {activeTab === "moderation" && (
        <TribeModerationTab
          capId={capId}
          capType={capType}
          superAdminCapId={superAdminCapId ?? undefined}
          adminCapId={adminCapId ?? undefined}
          modCapId={modCapId ?? undefined}
        />
      )}

      {activeTab === "admin" && adminTier && (
        <TribeAdminTab
          adminCapId={adminCapId ?? undefined}
          walletAddress={addr}
          tribeOnly={tribeOnly}
        />
      )}

      {activeTab === "superadmin" && superAdminTier && (
        <TribeSuperAdminTab
          walletAddress={addr}
          hasSuperAdminCap={hasSuperAdminCap}
          hasOwnerCap={hasOwnerCap}
          adminCapId={adminCapId ?? undefined}
          tribeOnly={tribeOnly}
        />
      )}

      {activeTab === "owner" && ownerTier && (
        <TribeOwnerTab
          ownerCapId={ownerCapId ?? ""}
          walletAddress={addr}
        />
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
