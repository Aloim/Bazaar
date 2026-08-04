// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * SSUGovernancePanel — R6.6.4b OS-32 (Rev 2 — post CC-R6.6.4b-combined-review)
 *
 * ⚠ SHARED-SURFACE RULE (AI + humans, READ THIS): this component is rendered on
 * TWO surfaces from ONE source — the in-game Godot client
 * (packages/shared/components/godot/GodotGameWrapper/index.tsx, Panel #13) and the
 * DappHub host (apps/dapphub/src/components/hub/SSUGovernanceScreen.tsx). Any
 * change to SSU-governance behavior MUST be made HERE (or its tab children) so it
 * lands on BOTH surfaces automatically — never fork one surface. The tribe twin is
 * TribeGovernancePanel (same rule). Host-level wiring (ClaimBoxProvider wrap, the
 * ssuId source) must be mirrored on both hosts.
 *
 * Top-level shell + 4-tab dispatcher.
 * Verbatim from Bazar1 SSUGovernancePanel.tsx lines 51-298 with
 * adaptations per FA §3 (import paths, TX builder renames, OS-34).
 *
 * Rev 2 changes (vs Shard A):
 *   CC-A001/A002: Named imports for SSUSuperAdminTab + SSUOwnerTab.
 *   CC-A002: Props type preserved as SSUGovernancePanelProps (not Props).
 *   CC-A003: SSUOwnerTab mounts all 13 props; ClaimSSUGovernanceButton removed
 *            (Shard C's OwnerTab renders disabled Claim card when !hasGovernance).
 *   CC-A004: SSUSuperAdminTab receives memberRegistryId + senderAddress + ssuGovId;
 *            drops ssuTreasuryAddress + maxShopsOverride (not on interface).
 *   CC-A005: Dead dAppKit import removed; useConnection retained (used for senderAddress).
 *   CC-A006: useSSUGovId + useSSUGovernanceConfig + ssuGovId null-guard added.
 *
 * OS-34: ClaimSSUGovernanceButton rendered disabled by Shard C OwnerTab internally.
 *        This file no longer defines or imports ClaimSSUGovernanceButton.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState, useMemo } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useSSUGovernance } from "@bazaar/shared/hooks/useSSUGovernance";
import { useSSUGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useSSUGovernanceConfig, useSSURoles } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import { useShops } from "@bazaar/shared/hooks";
import { useCharacterNames } from "@bazaar/shared/hooks";
// SSU_GOVERNANCE_REGISTRY_ID import removed (OS-54-followup Phase 2):
// runtime guard via useSSUGovId(ssuId) supersedes env-presence check.
import type { SSUGovTab } from "./util";
// CC-A001: Named imports (both are named exports, NOT default exports).
import { SSUModerationTab } from "./ModerationTab";
import { SSUAdminTab } from "./AdminTab";
import { SSUSuperAdminTab } from "./SuperAdmin/index";
import { SSUOwnerTab } from "./OwnerTab";

// ── Props type ─────────────────────────────────────────────────────────────────

// CC-A002: Type name PRESERVED as SSUGovernancePanelProps.
// The directory barrel (index.ts) re-exports this name — must match.
export interface SSUGovernancePanelProps {
  ssuId: string;
  onClose: () => void;
}

// ── SSUGovernancePanel (default export) ───────────────────────────────────────

export default function SSUGovernancePanel({ ssuId, onClose }: SSUGovernancePanelProps) {
  // ── Core governance data + caps ────────────────────────────────────────────
  const gov = useSSUGovernance(ssuId);

  // CC-A006: Resolve SSUGovernance shared object ID (needed by SSUSuperAdminTab
  // and SSUOwnerTab for TX builders that require ssuGovId, not ssuId).
  const { data: ssuGovId } = useSSUGovId(ssuId);

  // CC-A004: Source memberRegistryId for SSUSuperAdminTab → SSUCapsSubTab.
  // useSSUGovernanceConfig is disabled when ssuGovId is null/empty (enabled guard).
  const { data: govConfig } = useSSUGovernanceConfig(ssuGovId ?? "");
  const memberRegistryId = govConfig?.memberRegistryId ?? "";

  // CC-A005: useConnection used for senderAddress (buildWithdrawSSUTax PTB step).
  // dAppKit import removed — this file does not execute transactions directly.
  const { walletAddress } = useConnection();
  const senderAddress = walletAddress ?? "";

  // Caller's own SSU registry role. SSU Admin/Mod caps are never minted, so the
  // registry role is the only way a non-Owner/non-SuperAdmin reaches this panel.
  // Moderation = Moderator(4)+, Admin tab = Admin(5)+. SuperAdmin tab stays
  // cap-gated (its tax controls require the SSUOwnerCap on-chain).
  const { data: callerRoles } = useSSURoles(walletAddress ?? null, memberRegistryId || null);
  const registryRole = callerRoles?.ssuRole ?? 0;

  // ── Shops + character names ────────────────────────────────────────────────
  const { shops, refetch: refetchShops } = useShops();

  const {
    hasSSUOwnerCap, hasSSUSuperAdminCap, hasSSUAdminCap, hasSSUModCap,
    ssuOwnerCapId, ssuSuperAdminCapId, ssuAdminCapId, ssuModCapId,
    hasGovernance, isLoading, refetchGovernance,
    // ssuSuperAdminCapIds: Map<string, string> from HookExt (lands in same commit)
    ssuSuperAdminCapIds,
  } = gov;

  // Filter shops to only ACTIVE ones at this SSU. Closing a shop deactivates it
  // (bazar_close::finalize_close → deactivate_shop_by_id) rather than deleting the
  // record, so a closed shop stays in the registry with is_active = false. Without
  // the isActive filter it would keep showing in the moderation list (and its
  // Remove button would just abort with E_SHOP_NOT_ACTIVE).
  const ssuShops = useMemo(() => shops.filter(s => s.ssuId === ssuId && s.isActive), [shops, ssuId]);

  // Collect all known addresses for character name resolution.
  const allKnownAddresses = useMemo(() => {
    const addrs = new Set<string>();
    gov.localBanList.forEach((_, addr) => addrs.add(addr));
    gov.ssuMods.forEach(a => addrs.add(a));
    gov.ssuAdmins.forEach(a => addrs.add(a));
    gov.ssuSuperAdmins.forEach(a => addrs.add(a));
    if (gov.ssuOwner) addrs.add(gov.ssuOwner);
    ssuShops.forEach(s => addrs.add(s.owner));
    return Array.from(addrs);
  }, [gov.localBanList, gov.ssuMods, gov.ssuAdmins, gov.ssuSuperAdmins, gov.ssuOwner, ssuShops]);

  const characterNames = useCharacterNames(allKnownAddresses);

  function handleRefetch() {
    refetchGovernance();
    refetchShops();
  }

  const [tab, setTab] = useState<SSUGovTab>("moderation");

  // CC-A006: Guard against ssuGovId not yet resolved.
  // Show loading state while the governance-resolution-hooks React Query fires.
  // "Governance not available" is shown only if the query settled with null
  // (no SSUGovernanceCreated event for this SSU).
  if (ssuGovId === undefined) {
    // Still loading ssuGovId (React Query in-flight) — show panel skeleton.
    return (
      <div className="panel" style={{ maxWidth: 520 }}>
        <div className="panel__header">
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Back</button>
          <h2>SSU Governance</h2>
          <span className="muted" style={{ fontSize: "0.75rem" }}> Resolving...</span>
        </div>
        <div className="panel__section">
          <p className="muted" style={{ fontSize: "0.78rem" }}>
            Resolving SSU governance object ID...
          </p>
        </div>
      </div>
    );
  }

  if (ssuGovId === null) {
    // Query settled: no SSUGovernanceCreated event found for this SSU.
    // This SSU has not been bootstrapped yet.
    return (
      <div className="panel" style={{ maxWidth: 520 }}>
        <div className="panel__header">
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Back</button>
          <h2>SSU Governance</h2>
        </div>
        <div className="panel__section">
          <p className="muted" style={{ fontSize: "0.78rem" }}>
            Governance not available for this SSU. No SSUGovernanceCreated event found.
            Contact support if your SSU has not been bootstrapped via FP1-43.
          </p>
        </div>
      </div>
    );
  }

  const hasAnyAccess = hasSSUOwnerCap || hasSSUSuperAdminCap || hasSSUAdminCap || hasSSUModCap || registryRole >= 4;
  // Unclaimed SSUs show all tabs to everyone (claim banner in Owner tab)
  const isUnclaimed = !hasGovernance && !isLoading;

  // ── Early exit: governance exists but caller has no cap ────────────────────
  if (!hasAnyAccess && hasGovernance) {
    return (
      <div className="panel" style={{ maxWidth: 520 }}>
        <div className="panel__header">
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Back</button>
          <h2>SSU Governance</h2>
          <span className="muted" style={{ fontSize: "0.75rem" }}>{ssuId.slice(0, 10)}...</span>
        </div>
        <div className="panel__section">
          <p className="muted">
            No SSU governance capability detected for this SSU. You need an SSUModCap,
            SSUAdminCap, SSUSuperAdminCap, or SSUOwnerCap for SSU {ssuId.slice(0, 10)}...
          </p>
        </div>
      </div>
    );
  }

  // Build visible tab list based on caps.
  const tabs: SSUGovTab[] = ["moderation"];
  if (isUnclaimed || hasSSUAdminCap || hasSSUSuperAdminCap || hasSSUOwnerCap || registryRole >= 5) tabs.push("admin");
  if (isUnclaimed || hasSSUSuperAdminCap || hasSSUOwnerCap) tabs.push("superadmin");
  tabs.push("owner");

  const tabLabel: Record<SSUGovTab, string> = {
    moderation: "Moderation",
    admin: "Admin",
    superadmin: "SuperAdmin",
    owner: "Owner",
  };

  // Best cap available (most privileged) for generic moderation calls.
  const bestCapId = ssuOwnerCapId ?? ssuSuperAdminCapId ?? ssuAdminCapId ?? ssuModCapId ?? "";
  const bestCapType: "owner" | "super_admin" | "admin" | "mod" =
    ssuOwnerCapId ? "owner"
    : ssuSuperAdminCapId ? "super_admin"
    : ssuAdminCapId ? "admin"
    : "mod";

  return (
    <div className="panel" style={{ maxWidth: 700 }}>
      <div className="panel__header">
        <button className="btn btn--ghost btn--sm" onClick={onClose}>Back</button>
        <h2>SSU Governance</h2>
        <span className="muted" style={{ fontSize: "0.72rem" }}>{ssuId.slice(0, 12)}...</span>
        {isLoading && <span className="muted" style={{ fontSize: "0.72rem" }}> Loading...</span>}
        <button
          className="btn btn--ghost btn--sm"
          style={{ marginLeft: "auto" }}
          onClick={onClose}
          aria-label="Close SSU Governance panel"
        >&#x2715;</button>
      </div>

      <div className="panel__tabs">
        {tabs.map(t => (
          <button
            key={t}
            className={`tab ${tab === t ? "tab--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {tabLabel[t]}
          </button>
        ))}
      </div>

      {tab === "moderation" && (
        <SSUModerationTab
          ssuId={ssuId}
          capId={bestCapId}
          capType={bestCapType}
          localBanList={gov.localBanList}
          ssuShops={ssuShops}
          maxShopsOverride={gov.maxShopsOverride}
          characterNames={characterNames}
          ssuGovId={ssuGovId ?? ""}
          onRefetch={handleRefetch}
        />
      )}

      {tab === "admin" && (hasSSUAdminCap || hasSSUSuperAdminCap || hasSSUOwnerCap || registryRole >= 5) && (
        <SSUAdminTab
          ssuId={ssuId}
          ssuOwner={gov.ssuOwner}
          ssuSuperAdmins={gov.ssuSuperAdmins}
          ssuAdmins={gov.ssuAdmins}
          ssuMods={gov.ssuMods}
          localUsers={gov.localUsers}
          localBanList={gov.localBanList}
          hasSSUOwnerCap={hasSSUOwnerCap}
          hasSSUSuperAdminCap={hasSSUSuperAdminCap}
          hasSSUAdminCap={hasSSUAdminCap}
          hasSSUModCap={hasSSUModCap}
          characterNames={characterNames}
          ownerCapId={ssuOwnerCapId ?? undefined}
          superAdminCapId={ssuSuperAdminCapId ?? undefined}
          adminCapId={ssuAdminCapId ?? undefined}
          ssuModCapId={ssuModCapId ?? undefined}
          connectedAddress={walletAddress}
          onRefetch={handleRefetch}
        />
      )}

      {tab === "superadmin" && (hasSSUSuperAdminCap || hasSSUOwnerCap) && (
        // CC-A004: SSUSuperAdminTab receives ssuGovId, memberRegistryId, senderAddress.
        // R6.7.5.A: adds maxShopsOverride (V2.R3).
        <SSUSuperAdminTab
          ssuId={ssuId}
          ssuGovId={ssuGovId}
          capId={ssuOwnerCapId ?? ssuSuperAdminCapId ?? ""}
          capType={ssuOwnerCapId ? "owner" : "super_admin"}
          localTaxSurcharges={gov.localTaxSurcharges}
          maxShopsOverride={gov.maxShopsOverride ?? null}
          ssuAdmins={gov.ssuAdmins}
          characterNames={characterNames}
          walletTransactions={gov.walletTransactions}
          ownerCapId={ssuOwnerCapId ?? null}
          hasOwnerCap={hasSSUOwnerCap}
          superAdminCapId={ssuSuperAdminCapId ?? null}
          hasSuperAdminCap={hasSSUSuperAdminCap}
          taxWalletBalance={gov.taxWalletBalance}
          depositWalletBalance={gov.depositWalletBalance}
          memberRegistryId={memberRegistryId}
          senderAddress={senderAddress}
          onRefetch={handleRefetch}
        />
      )}

      {tab === "owner" && (
        // CC-A003: SSUOwnerTab mounts with all 13 props.
        // ClaimSSUGovernanceButton is rendered INTERNALLY by OwnerTab when !hasGovernance.
        // This file does NOT pass children or define ClaimSSUGovernanceButton.
        // R6.7.5.A: isActive sourced from govConfig (useSSUGovernanceConfig, line 65) — V2.R1.
        <SSUOwnerTab
          ssuId={ssuId}
          ownerCapId={ssuOwnerCapId ?? null}
          ssuSuperAdmins={gov.ssuSuperAdmins}
          ssuSuperAdminCapIds={ssuSuperAdminCapIds}
          ssuOwner={gov.ssuOwner}
          isFrozen={gov.isFrozen}
          isActive={govConfig?.isActive ?? true}
          hasGovernance={hasGovernance}
          hasSSUSuperAdminCap={hasSSUSuperAdminCap}
          hasSSUOwnerCap={hasSSUOwnerCap}
          ssuSuperAdminCapId={ssuSuperAdminCapId ?? null}
          ssuGovId={ssuGovId}
          characterNames={characterNames}
          onRefetch={handleRefetch}
        />
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
