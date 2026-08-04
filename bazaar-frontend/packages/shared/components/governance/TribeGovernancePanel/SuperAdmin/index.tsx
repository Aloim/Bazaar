// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeSuperAdminTab — orchestrator for all SuperAdmin sub-tabs.
 * Ported from Bazar1 GlobalSuperAdminTab (lines 1245-1372).
 * Renamed: GlobalSuperAdminTab → TribeSuperAdminTab.
 *
 * R6.7.5.B: Added "accessibility" (OS-48 + OS-49a) and "caps-revocation" (Item 2).
 */

import { useState } from "react";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { useTribeGovernanceConfig } from "@bazaar/shared/hooks/bazaarcore/tribe-governance-hooks";
import { TaxTableSubTab } from "./TaxTableSubTab";
import { TribeCapsRevocationSubTab } from "./CapsRevocationSubTab";
import { TribeRolesSubTab } from "./TribeRolesSubTab";
import { TribeTaxWalletSubTab } from "./TribeTaxWalletSubTab";
import RegisteredSSUsSubTab from "./RegisteredSSUsSubTab";
import WidgetMenuTab from "@bazaar/shared/components/governance/WidgetMenuTab/index";
import TribeAssetsTab from "@bazaar/shared/components/governance/TribeAssetsTab";
// SSU Storage is SSU-governance territory and no longer lives in the tribe panel —
// it belongs to the per-SSU SSU Governance menu (SSUGovernancePanel). Removed here
// so it disappears from BOTH the in-game and DappHub tribe panels (shared component).
import TransactionLogTab from "@bazaar/shared/components/inventory/TransactionLogTab";
import TribeReserveVaultPanel from "@bazaar/shared/components/governance/TribeReserveVaultPanel";
import TribeSettingsSection from "@bazaar/shared/components/governance/TribeSettingsSection";
import { TRIBE_REGISTRY_ID } from "@bazaar/shared/constants";

// ── Types ──────────────────────────────────────────────────────────────────────

type SuperAdminSubTab =
  | "taxes"
  | "tribe-wallet"
  | "registered-ssus"
  | "widgets"
  | "assets"
  | "txlog"
  | "vault"
  | "tribe-settings"
  | "tribe-roles"
  | "caps-revocation";
  // V16: "coin" sub-tab retired — mint/burn UI moved to TribeAssetsTab as a delayed-execution queue.
  // V16-DESIGN-1: "tribe-wallet" sub-tab added — Leader + SuperAdmin EVE withdraw.

interface TribeSuperAdminTabProps {
  walletAddress:    string;
  hasSuperAdminCap: boolean;
  hasOwnerCap:      boolean;
  /** adminCapId forwarded from panel shell for OS-49a store-visibility (minimum cap). */
  adminCapId:       string | undefined;
  /**
   * DappHub tribe-only mode. Still accepted from the shell for API stability, but
   * no longer consumed here: the only SSU-scoped sub-tab (SSU Storage) was removed
   * from the tribe panel and moved to the SSU Governance menu (SSUGovernancePanel).
   */
  tribeOnly?:       boolean;
}

// ── TribeSuperAdminTab ────────────────────────────────────────────────────────

export function TribeSuperAdminTab({
  walletAddress,
  hasSuperAdminCap,
  hasOwnerCap,
  adminCapId,
}: TribeSuperAdminTabProps) {
  const { leaderTribeIdx, superAdminTribeIdx, leaderCapId, superAdminCapId } = useTribeCaps();
  const { tribes } = useTribeRegistry();

  const vaultTribeIdx = leaderTribeIdx ?? superAdminTribeIdx ?? null;
  const vaultTribe = vaultTribeIdx !== null
    ? tribes.find(t => t.idx === vaultTribeIdx)
    : undefined;

  // Resolve tribeGovId for new sub-tabs (accessibility + caps-revocation).
  const govTribeIdx = leaderTribeIdx ?? superAdminTribeIdx ?? null;
  const govTribe = govTribeIdx !== null
    ? tribes.find(t => t.idx === govTribeIdx)
    : undefined;
  const tribeGovId = govTribe?.tribeGovId ?? "";

  const { data: govConfig } = useTribeGovernanceConfig(tribeGovId || null);
  const isAdvancedBazaar = govConfig?.bazaarType === 2;

  const hasAdminOrLeader = !!(adminCapId ?? leaderCapId);
  const hasSAOrLeader    = hasSuperAdminCap || hasOwnerCap;

  const subTabs: { key: SuperAdminSubTab; label: string }[] = [
    { key: "taxes",   label: "Tax Rates" },
    // V16-DESIGN-1: Tribe Wallet (EVE) shown to Leader OR SuperAdmin only (Admin/Mod
    // tiers cannot withdraw on-chain).
    // Hidden on Advanced bazaars — Advanced shop tax routes to TribeTokenLedger, not
    // this EVE Balance, so the wallet is dormant by design. Token-side wallet
    // admin (Withdraw/Deposit/Logs) lives in Tribe Assets sub-tab instead.
    ...(hasSAOrLeader && !isAdvancedBazaar
      ? [{ key: "tribe-wallet" as SuperAdminSubTab, label: "Tribe Wallet" }]
      : []),
    // Tribe Network Members (2026-06-23 rebuild of the old "Registered SSUs"): a
    // user-centric view — members → their SSUs → per-SSU tribe-tax-income detail.
    // SuperAdmin-only (reaching this tab already requires a SuperAdmin/Leader cap).
    ...(tribeGovId ? [{ key: "registered-ssus" as SuperAdminSubTab, label: "Tribe Network Members" }] : []),
    // Widgets tab hidden for now (relay URL is set on-chain via DappHub → Taxes/Fees →
    // Multiplayer Relay URL; the localStorage-only field here was redundant/confusing).
    // Re-enable by restoring: { key: "widgets", label: "Widgets" },
    { key: "assets",  label: "Tribe Assets" },
    // SSU Storage removed from the tribe panel entirely — it now lives in the
    // per-SSU SSU Governance menu (SSUGovernancePanel). See the import note above.
    { key: "txlog",   label: "TX Log" },
    { key: "vault",   label: "Reserve Vault" },
    // Merged 2026-05-12: Tribe Settings now absorbs Store Visibility (formerly the
    // separate Accessibility tab). Shown to leader OR admin tier (admin sees
    // visibility controls + applications list; leader sees everything).
    ...(hasAdminOrLeader
      ? [{ key: "tribe-settings" as SuperAdminSubTab, label: "Tribe Settings" }]
      : []),
    // V16: Coin sub-tab retired (was Phase 9 — Advanced bazaar mint/burn UI).
    // The mint/burn queue lives in TribeAssetsTab now, alongside the tribe wallet card.
    // Phase 6 W4 (AUD-ET-21): tribe-level role granting — first consumer of
    // buildGrantTribeRole. Reachable in tribeOnly mode (no SSU dependency);
    // the sub-tab enables only the grant levels the wallet's caps authorize.
    ...(tribeGovId
      ? [{ key: "tribe-roles" as SuperAdminSubTab, label: "Tribe Roles" }]
      : []),
    // Item 2: show cap revocation when caller has SA or leader cap.
    ...(hasSAOrLeader && tribeGovId
      ? [{ key: "caps-revocation" as SuperAdminSubTab, label: "Cap Revocation" }]
      : []),
  ];

  const [subTab, setSubTab] = useState<SuperAdminSubTab>("taxes");

  const validSubTab = subTabs.some(st => st.key === subTab) ? subTab : "taxes";

  return (
    <div className="panel__section">
      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {subTabs.map(st => (
          <button
            key={st.key}
            className={`btn btn--sm ${validSubTab === st.key ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setSubTab(st.key)}
          >
            {st.label}
          </button>
        ))}
      </div>

      {validSubTab === "taxes" && <TaxTableSubTab />}

      {validSubTab === "tribe-wallet" && <TribeTaxWalletSubTab />}

      {validSubTab === "registered-ssus" && (
        <RegisteredSSUsSubTab
          tribeGovId={tribeGovId || null}
          tribeId={govConfig?.tribeId ?? null}
        />
      )}

      {validSubTab === "widgets" && <WidgetMenuTab />}

      {validSubTab === "assets" && <TribeAssetsTab />}

      {validSubTab === "txlog" && <TransactionLogTab />}

      {validSubTab === "vault" && (
        vaultTribe ? (
          <TribeReserveVaultPanel
            walletId={vaultTribe.tribeGovId ?? ""}
            tribeIdx={vaultTribe.idx}
            tribeName={vaultTribe.name}
            walletAddress={walletAddress}
          />
        ) : (
          <div className="panel__section">
            <p className="muted">
              No tribe leadership or SuperAdmin cap detected for the connected wallet.
              You need a TribeLeaderCap or TribeSuperAdminCap to access the reserve vault.
            </p>
          </div>
        )
      )}

      {validSubTab === "tribe-settings" && govTribeIdx !== null && (
        <TribeSettingsSection
          leaderCapId={leaderCapId}
          superAdminCapId={superAdminCapId ?? null}
          adminCapId={adminCapId ?? null}
          tribeGovId={tribeGovId || null}
          tribeIdx={govTribeIdx}
          registryId={TRIBE_REGISTRY_ID}
        />
      )}

      {validSubTab === "tribe-roles" && tribeGovId && (
        <TribeRolesSubTab tribeGovId={tribeGovId} />
      )}

      {validSubTab === "caps-revocation" && tribeGovId && (
        <TribeCapsRevocationSubTab
          tribeGovId={tribeGovId}
          superAdminCapId={superAdminCapId}
          adminCapId={adminCapId ?? null}
        />
      )}

    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
