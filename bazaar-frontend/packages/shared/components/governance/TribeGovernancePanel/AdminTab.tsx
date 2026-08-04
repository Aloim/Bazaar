// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState } from "react";
import { useSuiQuery } from "@bazaar/shared/hooks/useSuiQuery";
import ManageUsersTab from "@bazaar/shared/components/governance/ManageUsersTab";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { StorageLimitsTab } from "./Admin/StorageApplicationsSubTabs";
import { ApplicationsSubTab } from "./Admin/ApplicationsSubTab";
import { TribeShopLimitsSubTab } from "./Admin/TribeShopLimitsSubTab";
import { TribeAnnouncementSubTab } from "./Admin/TribeAnnouncementSubTab";
import {
  BAZAR_CONFIG_ID,
  ROLE_LABEL,
} from "@bazaar/shared/constants";

// ── Types ─────────────────────────────────────────────────────────────────────

type AdminSubTab = "users" | "announce" | "shops" | "tribelimits" | "storage" | "applications";

export interface TribeAdminTabProps {
  /** Forwarded to the read-only Shop Settings sub-tab (non-tribeOnly only). */
  adminCapId:       string | undefined;
  walletAddress:    string;
  /** DappHub tribe-only mode: hide SSU-scoped sub-tabs (Shops/Storage). */
  tribeOnly?:       boolean;
}

// ── TribeAdminTab ─────────────────────────────────────────────────────────────
// Renamed from GlobalAdminTab (Bazar1 lines 718-785).
// OS-50a: Applications restored as per-tribe sub-tab — see Admin/ApplicationsSubTab.tsx.
// 2026-06-14: Users & Roles is now tribe-wide (useTribeMembers) and shown on both
// surfaces; the old SSU-cap props it consumed were dropped.

export function TribeAdminTab({
  adminCapId,
  walletAddress,
  tribeOnly = false,
}: TribeAdminTabProps) {
  const { leaderCapId, leaderTribeIdx, superAdminTribeIdx } = useTribeCaps();

  // Users & Roles is now TRIBE-WIDE (aggregates members across every SSU of the
  // tribe via useTribeMembers), so it belongs on BOTH surfaces — including DappHub
  // tribeOnly mode, which has no single SSU context. Shops/Storage remain
  // SSU-government elements and stay hidden in tribeOnly.
  const subTabs: { key: AdminSubTab; label: string }[] = tribeOnly
    ? [
        { key: "users",        label: "Users & Roles" },
        { key: "announce",     label: "Tribe Announcement" },
        { key: "applications", label: "Applications" },
        { key: "tribelimits",  label: "Tribe Limits" },
      ]
    : [
        { key: "users",        label: "Users & Roles" },
        { key: "announce",     label: "Tribe Announcement" },
        { key: "shops",        label: "Shop Settings" },
        { key: "tribelimits",  label: "Tribe Limits" },
        { key: "storage",      label: "Storage Limits" },
        { key: "applications", label: "Applications" },
      ];

  const [subTab, setSubTab] = useState<AdminSubTab>("users");

  // Tribe id the connected wallet leads or co-admins — drives the tribe-wide
  // member aggregation. Leader cap takes precedence over a SuperAdmin cap.
  const tribeIdx = leaderTribeIdx ?? superAdminTribeIdx ?? null;

  return (
    <div className="panel__section">
      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {subTabs.map(st => (
          <button
            key={st.key}
            className={`btn btn--sm ${subTab === st.key ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setSubTab(st.key)}
          >
            {st.label}
          </button>
        ))}
      </div>

      {subTab === "users" && (
        <ManageUsersTab
          tribeIdx={tribeIdx}
          connectedAddress={walletAddress}
        />
      )}

      {subTab === "announce" && (
        <TribeAnnouncementSubTab tribeIdx={tribeIdx} />
      )}

      {subTab === "shops" && (
        <ShopSettingsTab adminCapId={adminCapId ?? ""} />
      )}

      {subTab === "tribelimits" && (
        <TribeShopLimitsSubTab />
      )}

      {subTab === "storage" && (
        <StorageLimitsTab />
      )}

      {subTab === "applications" && (
        <ApplicationsSubTab
          leaderCapId={leaderCapId}
          tribeIdx={leaderTribeIdx}
        />
      )}
    </div>
  );
}

// ── ShopSettingsTab ───────────────────────────────────────────────────────────
// Bazar1 lines 789-932. Mutating forms HIDDEN per OS-44 + OS-45.
// Display tables (read-only) retained via live useSuiQuery(BAZAR_CONFIG_ID).

function ShopSettingsTab({ adminCapId: _ }: { adminCapId: string }) {
  const { data: configObj, isLoading } = useSuiQuery<any>("getObject", {
    id: BAZAR_CONFIG_ID,
    options: { showContent: true },
  });

  const shopLimits: number[] = (() => {
    const fields = (configObj?.data?.content as any)?.fields ?? {};
    const raw    = fields.max_shops_by_role;
    if (Array.isArray(raw) && raw.length >= 5) {
      return raw.slice(0, 5).map(Number);
    }
    return [0, 0, 0, 0, 0];
  })();

  const maxItemsPerShop: number = (() => {
    const fields = (configObj?.data?.content as any)?.fields ?? {};
    return Number(fields.max_items_per_shop ?? 0);
  })();

  const autoExpiryDays: number | null = (() => {
    const fields = (configObj?.data?.content as any)?.fields ?? {};
    const ms     = Number(fields.auto_expiry_ms ?? 0);
    if (ms <= 0) return null;
    return Math.round(ms / 86_400_000);
  })();

  return (
    <div>
      <div className="action-card">
        <h4>Current Shop Limits per Role</h4>
        {isLoading ? (
          <p className="muted">Loading limits...</p>
        ) : (
          <table className="tax-grid">
            <thead>
              <tr>
                <th>Role</th>
                <th>Max Shops</th>
              </tr>
            </thead>
            <tbody>
              {shopLimits.map((limit, i) => (
                <tr key={i}>
                  <td>{ROLE_LABEL[i] ?? String(i)}</td>
                  <td>{limit === 0 ? "Unlimited" : limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="action-card" style={{ marginTop: "1rem" }}>
        <h4>Items Limit &amp; Auto-Expiry</h4>
        {isLoading ? (
          <p className="muted">Loading config...</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: "0.78rem" }}>
              Max items per shop:{" "}
              <strong>{maxItemsPerShop === 0 ? "Unlimited" : maxItemsPerShop}</strong>
            </p>
            <p className="muted" style={{ fontSize: "0.78rem" }}>
              Auto-expiry:{" "}
              <strong>{autoExpiryDays === null ? "Never" : `${autoExpiryDays} day(s)`}</strong>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
