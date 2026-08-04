// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ShopStorageConfigSubTab — R6.7.5.A OS-44 + OS-45 + OS-46
 *
 * Hosts three SSU-scoped configuration forms relocated from TribeGovernancePanel
 * per Decision 1 Round-1:
 *   OS-44: Per-role shop count limit (SA-primary + Owner overload)
 *   OS-45: Max items per shop + auto-expiry (SA-primary + Owner overload)
 *   OS-46: Per-role volume limit (Owner-only)
 *
 * These forms were previously HIDDEN in TribeGovernancePanel/AdminTab.tsx
 * (OS-44, OS-45) and TribeGovernancePanel/Admin/StorageApplicationsSubTabs.tsx
 * (OS-46). The originals will be STRIPPED in R6.7.5.B.
 *
 * Article XIV.2 ad-hoc exemption per user direct authorization 2026-04-29.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import React, { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import {
  buildSetSSUShopLimitForRoleAsSuperAdmin,
  buildSetSSUShopLimitForRoleAsOwner,
  buildSetSSUShopConfigAsSuperAdmin,
  buildSetSSUShopConfigAsOwner,
} from "@bazaar/shared/tx/bazaarcore/ssu-shop-config-tx";
import { buildSetVolumeLimitForRole } from "@bazaar/shared/tx/bazaarcore/user-storage-tx";
import { ROLE_LABEL } from "@bazaar/shared/constants";
import { MaxShopsForm } from "./TaxesCapsSubTabs.part2";

// ── Prop types ─────────────────────────────────────────────────────────────────

export interface ShopStorageConfigSubTabProps {
  ssuGovId: string;
  /** Best available cap ID: ownerCapId preferred, else superAdminCapId. */
  capId: string;
  capType: "owner" | "super_admin";
  /** ownerCapId — null when connected wallet does not hold SSUOwnerCap. */
  ownerCapId: string | null;
  /** superAdminCapId — null when connected wallet does not hold SSUSuperAdminCap. */
  superAdminCapId: string | null;
  /** maxShopsOverride — current per-SSU shop count override (OS-35); relocated here from the Tax Settings sub-tab. */
  maxShopsOverride: number | null;
  onRefetch: () => void;
}

// ── ShopStorageConfigSubTab ────────────────────────────────────────────────────

export function ShopStorageConfigSubTab({
  ssuGovId,
  capId,
  capType,
  ownerCapId,
  superAdminCapId,
  maxShopsOverride,
  onRefetch,
}: ShopStorageConfigSubTabProps) {
  return (
    <div>
      <MaxShopsForm
        ssuGovId={ssuGovId}
        capId={capId}
        capType={capType}
        superAdminCapId={superAdminCapId}
        maxShopsOverride={maxShopsOverride}
        onRefetch={onRefetch}
      />
      <div style={{ marginTop: "1rem" }}>
        <ShopLimitForm
          ssuGovId={ssuGovId}
          capId={capId}
          capType={capType}
          ownerCapId={ownerCapId}
          superAdminCapId={superAdminCapId}
          onRefetch={onRefetch}
        />
      </div>
      <div style={{ marginTop: "1rem" }}>
        <ShopConfigForm
          ssuGovId={ssuGovId}
          capId={capId}
          capType={capType}
          ownerCapId={ownerCapId}
          superAdminCapId={superAdminCapId}
          onRefetch={onRefetch}
        />
      </div>
      <div style={{ marginTop: "1rem" }}>
        <VolumeLimitForm
          ssuGovId={ssuGovId}
          ownerCapId={ownerCapId}
          onRefetch={onRefetch}
        />
      </div>
    </div>
  );
}

// ── ShopLimitForm (OS-44) ─────────────────────────────────────────────────────
// Sets per-role max shop count for this SSU.
// SA-primary (SuperAdminCap) + Owner overload.

interface CapFormProps {
  ssuGovId: string;
  capId: string;
  capType: "owner" | "super_admin";
  ownerCapId: string | null;
  superAdminCapId: string | null;
  onRefetch: () => void;
}

function ShopLimitForm({ ssuGovId, capType, ownerCapId, superAdminCapId, onRefetch }: CapFormProps) {
  const [role,    setRole]    = useState("0");
  const [max,     setMax]     = useState("");
  const [loading, setLoading] = useState(false);

  async function apply() {
    const roleNum = Number(role);
    const maxNum  = Number(max);
    if (isNaN(roleNum) || isNaN(maxNum) || maxNum < 0 || roleNum < 0 || roleNum > 7) return;
    setLoading(true);
    try {
      const tx = capType === "owner" && ownerCapId
        ? buildSetSSUShopLimitForRoleAsOwner({ ownerCapId, ssuGovId, role: roleNum, max: maxNum })
        : superAdminCapId
        ? buildSetSSUShopLimitForRoleAsSuperAdmin({ superAdminCapId, ssuGovId, role: roleNum, max: maxNum })
        : null;
      if (!tx) { alert("No eligible cap available."); return; }
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setMax("");
      onRefetch();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="action-card">
      <h4>Set Per-Role Shop Limit (OS-44)</h4>
      <p className="muted" style={{ fontSize: "0.78rem" }}>
        Override the maximum number of shops a role may open at this SSU.
        0 = unlimited. Max 1000 per role.
      </p>
      <div className="form-row" style={{ flexWrap: "wrap", gap: "0.75rem", marginTop: "0.5rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.78rem" }}>
          <span className="muted">Role</span>
          <select
            className="input input--xs"
            value={role}
            onChange={e => setRole(e.target.value)}
            style={{ width: "9rem" }}
          >
            {Object.entries(ROLE_LABEL).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.78rem" }}>
          <span className="muted">Max Shops (0 = unlimited)</span>
          <input
            className="input input--xs"
            type="number"
            min={0}
            max={1000}
            placeholder="e.g. 5"
            value={max}
            onChange={e => setMax(e.target.value)}
            style={{ width: "7rem" }}
          />
        </label>
      </div>
      <div className="form-row" style={{ marginTop: "0.5rem" }}>
        <button
          className="btn btn--primary btn--sm"
          disabled={loading || !max || !ssuGovId || (!ownerCapId && !superAdminCapId)}
          onClick={apply}
        >
          {loading ? "Applying..." : "Set Shop Limit"}
        </button>
      </div>
    </div>
  );
}

// ── ShopConfigForm (OS-45) ────────────────────────────────────────────────────
// Sets max items per shop + auto-expiry duration.

function ShopConfigForm({ ssuGovId, capType, ownerCapId, superAdminCapId, onRefetch }: CapFormProps) {
  const [maxItems,     setMaxItems]     = useState("");
  const [expiryDays,   setExpiryDays]   = useState("");
  const [loading,      setLoading]      = useState(false);

  async function apply() {
    const maxItemsNum  = Number(maxItems);
    const expiryDaysNum = expiryDays ? Number(expiryDays) : 0;
    if (isNaN(maxItemsNum) || isNaN(expiryDaysNum)) return;
    const autoExpiryMs = expiryDaysNum > 0 ? expiryDaysNum * 86_400_000 : 0;
    setLoading(true);
    try {
      const tx = capType === "owner" && ownerCapId
        ? buildSetSSUShopConfigAsOwner({ ownerCapId, ssuGovId, maxItems: maxItemsNum, autoExpiryMs })
        : superAdminCapId
        ? buildSetSSUShopConfigAsSuperAdmin({ superAdminCapId, ssuGovId, maxItems: maxItemsNum, autoExpiryMs })
        : null;
      if (!tx) { alert("No eligible cap available."); return; }
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setMaxItems("");
      setExpiryDays("");
      onRefetch();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="action-card">
      <h4>Set Shop Config (OS-45)</h4>
      <p className="muted" style={{ fontSize: "0.78rem" }}>
        Max items per shop (0 = no limit). Auto-expiry in days (0 = no expiry).
      </p>
      <div className="form-row" style={{ flexWrap: "wrap", gap: "0.75rem", marginTop: "0.5rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.78rem" }}>
          <span className="muted">Max Items</span>
          <input
            className="input input--xs"
            type="number"
            min={0}
            placeholder="0 = unlimited"
            value={maxItems}
            onChange={e => setMaxItems(e.target.value)}
            style={{ width: "8rem" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.78rem" }}>
          <span className="muted">Auto-expiry (days, 0 = off)</span>
          <input
            className="input input--xs"
            type="number"
            min={0}
            placeholder="0 = none"
            value={expiryDays}
            onChange={e => setExpiryDays(e.target.value)}
            style={{ width: "8rem" }}
          />
        </label>
      </div>
      <div className="form-row" style={{ marginTop: "0.5rem" }}>
        <button
          className="btn btn--primary btn--sm"
          disabled={loading || !maxItems || !ssuGovId || (!ownerCapId && !superAdminCapId)}
          onClick={apply}
        >
          {loading ? "Applying..." : "Set Shop Config"}
        </button>
      </div>
    </div>
  );
}

// ── VolumeLimitForm (OS-46) ───────────────────────────────────────────────────
// Sets per-role volume limit on the per-SSU UserStorage object. Owner-only.

interface VolumeLimitFormProps {
  ssuGovId: string;
  ownerCapId: string | null;
  onRefetch: () => void;
}

function VolumeLimitForm({ ssuGovId, ownerCapId, onRefetch }: VolumeLimitFormProps) {
  const [userStorageId, setUserStorageId] = useState("");
  const [role,          setRole]          = useState("0");
  const [limit,         setLimit]         = useState("");
  const [loading,       setLoading]       = useState(false);

  async function apply() {
    if (!ownerCapId || !userStorageId.trim() || !ssuGovId) return;
    const roleNum  = Number(role);
    const limitNum = Number(limit);
    if (isNaN(roleNum) || isNaN(limitNum) || limitNum < 0) return;
    setLoading(true);
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildSetVolumeLimitForRole({
          ownerCapId,
          userStorageId: userStorageId.trim(),
          role: roleNum,
          limit: limitNum,
          ssuGovId,
        }),
      });
      setLimit("");
      onRefetch();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="action-card">
      <h4>Set Volume Limit per Role (OS-46)</h4>
      <p className="muted" style={{ fontSize: "0.78rem" }}>
        Owner-only. Sets per-role inventory volume limit on this SSU&apos;s UserStorage object.
        0 = unlimited. Enter the UserStorage object ID (not the registry ID).
      </p>
      {!ownerCapId && (
        <p style={{ color: "var(--color-warn, #f5a623)", fontSize: "0.78rem", marginTop: "0.25rem" }}>
          SSUOwnerCap required for this action.
        </p>
      )}
      <div className="form-row" style={{ flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
        <input
          className="input"
          placeholder="UserStorage object ID 0x..."
          value={userStorageId}
          onChange={e => setUserStorageId(e.target.value)}
          disabled={!ownerCapId}
        />
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.78rem" }}>
            <span className="muted">Role</span>
            <select
              className="input input--xs"
              value={role}
              onChange={e => setRole(e.target.value)}
              disabled={!ownerCapId}
              style={{ width: "9rem" }}
            >
              {Object.entries(ROLE_LABEL).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.78rem" }}>
            <span className="muted">Volume Limit (0 = unlimited)</span>
            <input
              className="input input--xs"
              type="number"
              min={0}
              placeholder="e.g. 10000"
              value={limit}
              onChange={e => setLimit(e.target.value)}
              disabled={!ownerCapId}
              style={{ width: "8rem" }}
            />
          </label>
        </div>
      </div>
      <div className="form-row" style={{ marginTop: "0.5rem" }}>
        <button
          className="btn btn--primary btn--sm"
          disabled={!ownerCapId || !userStorageId.trim() || !limit || loading}
          onClick={apply}
        >
          {loading ? "Applying..." : "Set Volume Limit"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
