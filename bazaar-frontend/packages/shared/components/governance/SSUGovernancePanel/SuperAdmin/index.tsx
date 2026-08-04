// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * SSUSuperAdminTab — R6.6.4b OS-32
 * Updated R6.7.5.A: Added "Shop & Storage" sub-tab (OS-44/45/46).
 * Updated OS-59 Commit 2: Added "Widgets" sub-tab (NoTribe-only; Issue 5).
 *
 * SuperAdmin role orchestrator (7 sub-tab dispatcher; 6 base + 1 NoTribe-gated).
 * Bazar1 reference: SSUGovernancePanel.tsx lines 850-926.
 *
 * Article XIV.2 exemption: verbatim-adapted from Bazar1.
 * Article XIV.2 ad-hoc exemption per user direct authorization 2026-04-29.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import React, { useState } from "react";
import { SSUTaxesSubTab } from "./TaxesCapsSubTabs";
import { SSUWalletsSubTab, SSUCurrencyLogSubTab } from "./WalletsCurrencyLogSubTabs";
import { SSUItemLogSubTab } from "./ItemLogSubTab";
import { ShopStorageConfigSubTab } from "./ShopStorageConfigSubTab";
import { WidgetsSubTab } from "./WidgetsSubTab";
import { useBazaarType } from "@bazaar/shared/hooks";
import type { TaxSurcharge, SsuWalletTransaction } from "@bazaar/shared/hooks/useSSUGovernance";

// ── Types ──────────────────────────────────────────────────────────────────────

type SASubTab =
  | "taxes"
  | "wallets"
  | "currencylog"
  | "itemlog"
  | "shopconfig"
  | "widgets";

export interface SSUSuperAdminTabProps {
  ssuId: string;
  /** ssuGovId — SSUGovernance shared object ID, threaded from parent index.tsx via CC-A004. */
  ssuGovId: string;
  /** Best available cap ID (ownerCapId preferred, else superAdminCapId). */
  capId: string;
  capType: "owner" | "super_admin";
  localTaxSurcharges: TaxSurcharge[];
  /** maxShopsOverride — current per-SSU shop count override; source: gov.maxShopsOverride. */
  maxShopsOverride: number | null;
  ssuAdmins: string[];
  characterNames: Map<string, string>;
  walletTransactions: SsuWalletTransaction[];
  /** ownerCapId — null when connected wallet does not hold SSUOwnerCap. */
  ownerCapId: string | null;
  hasOwnerCap: boolean;
  /** superAdminCapId — null when connected wallet does not hold SSUSuperAdminCap. */
  superAdminCapId: string | null;
  hasSuperAdminCap: boolean;
  taxWalletBalance: bigint;
  depositWalletBalance: bigint;
  /**
   * memberRegistryId — MemberRegistry shared object ID for this SSU.
   * Sourced from useSSUGovernanceConfig.memberRegistryId in the parent index.tsx.
   * Required by buildGrantSSURole (SSUCapsSubTab).
   */
  memberRegistryId: string;
  /** senderAddress — connected wallet address; required by buildWithdrawSSUTax PTB. */
  senderAddress: string;
  onRefetch: () => void;
}

// ── SSUSuperAdminTab ───────────────────────────────────────────────────────────

export function SSUSuperAdminTab({
  ssuId,
  ssuGovId,
  capId,
  capType,
  localTaxSurcharges,
  maxShopsOverride,
  ssuAdmins,
  characterNames,
  walletTransactions,
  ownerCapId,
  hasOwnerCap,
  superAdminCapId,
  hasSuperAdminCap,
  taxWalletBalance,
  depositWalletBalance,
  memberRegistryId,
  senderAddress,
  onRefetch,
}: SSUSuperAdminTabProps) {
  const [subTab, setSubTab] = useState<SASubTab>("taxes");

  // OS-59 Commit 2: Widgets sub-tab is NoTribe-only.
  // useBazaarType returns { bazaarType: "NoTribe" | "Easy" | "Advanced" | null, isLoading }
  // Also used to gate the EVE Wallets view (Advanced routes tax through
  // tribe-token ledger, NOT through SSUGovernance.tax_wallet:Balance<EVE>) —
  // see WalletsCurrencyLogSubTabs.tsx header notice for the full split.
  const { bazaarType } = useBazaarType(ssuId);
  const isNoTribe  = bazaarType === "NoTribe";
  const isAdvanced = bazaarType === "Advanced";

  // Sub-tab manifest — Widgets entry is conditional on NoTribe bazaar type.
  const SUB_TABS: { key: SASubTab; label: string }[] = [
    { key: "taxes",       label: "Tax Settings"      },
    { key: "wallets",     label: "Wallets"            },
    { key: "currencylog", label: "Currency Log"       },
    { key: "itemlog",     label: "Item Log"           },
    { key: "shopconfig",  label: "Shop & Storage"     },
    ...(isNoTribe ? [{ key: "widgets" as SASubTab, label: "Widgets" }] : []),
  ];

  return (
    <div className="panel__section">
      {/* Sub-tab bar */}
      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {SUB_TABS.map(st => (
          <button
            key={st.key}
            className={`btn btn--sm ${subTab === st.key ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setSubTab(st.key)}
          >
            {st.label}
          </button>
        ))}
      </div>

      {subTab === "taxes" && (
        <SSUTaxesSubTab
          ssuGovId={ssuGovId}
          capId={capId}
          capType={capType}
          localTaxSurcharges={localTaxSurcharges}
          hasSuperAdminCap={hasSuperAdminCap}
          onRefetch={onRefetch}
        />
      )}

      {subTab === "wallets" && (
        <SSUWalletsSubTab
          ssuId={ssuId}
          ownerCapId={ownerCapId}
          hasOwnerCap={hasOwnerCap}
          superAdminCapId={superAdminCapId}
          hasSuperAdminCap={hasSuperAdminCap}
          taxWalletBalance={taxWalletBalance}
          depositWalletBalance={depositWalletBalance}
          senderAddress={senderAddress}
          ssuGovId={ssuGovId}
          isAdvanced={isAdvanced}
          onRefetch={onRefetch}
        />
      )}

      {subTab === "currencylog" && (
        <SSUCurrencyLogSubTab walletTransactions={walletTransactions} />
      )}

      {subTab === "itemlog" && (
        <SSUItemLogSubTab ssuId={ssuId} />
      )}

      {subTab === "shopconfig" && (
        <ShopStorageConfigSubTab
          ssuGovId={ssuGovId}
          capId={capId}
          capType={capType}
          ownerCapId={ownerCapId}
          superAdminCapId={superAdminCapId}
          maxShopsOverride={maxShopsOverride}
          onRefetch={onRefetch}
        />
      )}

      {subTab === "widgets" && (
        <WidgetsSubTab
          ssuId={ssuId}
          ownerCapId={ownerCapId}
          onRefetch={onRefetch}
        />
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
