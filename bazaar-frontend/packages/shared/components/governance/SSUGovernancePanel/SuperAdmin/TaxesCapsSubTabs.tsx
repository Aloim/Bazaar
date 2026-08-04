// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TaxesCapsSubTabs — V16 Session 3C: per-role tax grid
 *
 * SSUTaxesSubTab: 8-row × 3-col grid (role × {wts_pct, wtb_pct, de_flat_fee}).
 *   Per-row Apply (buildSetSSURoleTax) + Clear (buildClearSSURoleTax) + bottom
 *   "Set Uniform" button (buildSetSSUTaxUniform).
 *   Existing on-chain rows pre-populated via useSSURoleTaxTable.
 *   Move surface: bazaar_core::ssu_role_tax_admin (V16 — Session 3B).
 *
 * SSUCapsSubTab: Admin/Mod role grant + revoke via unified buildGrantSSURole.
 *   Bazar1 reference: SSUGovernancePanel.tsx lines 940-1236 (with redesign deltas).
 *
 * Unit convention: wts/wtb pct stored ×100 (525 = 5.25%). MAX_TAX_PCT = 1000 (= 10%).
 * UI shows "%" and 2 decimals; conversion `Math.round(input * 100)` at TX-build time.
 *
 * Article XIV.2 exemption: adapted from Bazar1.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import React, { useEffect, useMemo, useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import {
  buildSetSSURoleTax,
  buildClearSSURoleTax,
  buildSetSSUTaxUniform,
  buildSetSsuMissionFee,
} from "@bazaar/shared/tx/bazaarcore/ssu-governance-tx";
import { useDAppTaxConfig } from "@bazaar/shared/hooks/dapp_hub/governance-config-hooks";
import { useSSURoleTaxTable, useSSUGovernanceConfig } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import { BAZAAR_TYPE_NUM } from "@bazaar/shared/types";
import { ROLE_LABEL } from "@bazaar/shared/constants";
import type { TaxSurcharge } from "@bazaar/shared/hooks/useSSUGovernance";

// ── Prop types ─────────────────────────────────────────────────────────────────

interface SSUTaxesSubTabProps {
  /** ssuGovId — SSUGovernance shared object ID; required by buildSetSSURoleTax. */
  ssuGovId: string;
  /** Best available cap ID (ownerCapId preferred, else superAdminCapId). */
  capId: string;
  capType: "owner" | "super_admin";
  localTaxSurcharges: TaxSurcharge[];
  /** hasSuperAdminCap — distinguishes cap dispatch for OS-35 SA builder. */
  hasSuperAdminCap: boolean;
  onRefetch: () => void;
}

// ── SSUTaxesSubTab (V16 Session 3C — per-role 8-row grid) ──────────────────────
//
// Per-role tax editor. Each row holds wts_pct, wtb_pct, de_flat_fee for a single
// SSU role (Stranger=0..Owner=7). Apply / Clear per row + bottom Set Uniform.
//
// Pct inputs: percentage with 2 decimals; converted to u64 ×100 at TX time.

interface RoleRow { wtsPct: string; wtbPct: string; deFlatFee: string; }
const EMPTY_ROW: RoleRow = { wtsPct: "0", wtbPct: "0", deFlatFee: "0" };
const ROLE_INDICES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

function parsePctToScaled(input: string): number {
  const v = Number(input);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v * 100);
}

export function SSUTaxesSubTab({
  ssuGovId,
  capId,
  capType,
  localTaxSurcharges: _localTaxSurcharges,
  hasSuperAdminCap: _hasSuperAdminCap,
  onRefetch,
}: SSUTaxesSubTabProps) {
  const { data: roleTaxes, refetch: refetchRoleTaxes } = useSSURoleTaxTable(ssuGovId);
  const initialRows = useMemo<Record<number, RoleRow>>(() => {
    const out: Record<number, RoleRow> = {} as Record<number, RoleRow>;
    for (const r of ROLE_INDICES) {
      const row = roleTaxes?.[r] ?? null;
      out[r] = row
        ? {
            wtsPct: (row.wtsPct / 100).toFixed(2),
            wtbPct: (row.wtbPct / 100).toFixed(2),
            deFlatFee: String(row.deFlatFee),
          }
        : { ...EMPTY_ROW };
    }
    return out;
  }, [roleTaxes]);
  const [rows, setRows] = useState<Record<number, RoleRow>>(initialRows);
  useEffect(() => { setRows(initialRows); }, [initialRows]);

  const [uniform, setUniform] = useState<RoleRow>({ ...EMPTY_ROW });
  const [busyKey, setBusyKey] = useState<string>("");

  const { data: dappTaxCfg } = useDAppTaxConfig();
  const dappGlobalBps = dappTaxCfg?.globalTaxBps ?? 0;

  function updateRow(role: number, field: keyof RoleRow, val: string) {
    setRows(prev => ({ ...prev, [role]: { ...prev[role], [field]: val } }));
  }

  async function applyRole(role: number) {
    if (!capId) return;
    setBusyKey(`apply-${role}`);
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildSetSSURoleTax({
          ownerCapId: capId,
          ssuGovId,
          role,
          wtsPct: parsePctToScaled(rows[role].wtsPct),
          wtbPct: parsePctToScaled(rows[role].wtbPct),
          deFlatFee: Math.max(0, Math.trunc(Number(rows[role].deFlatFee) || 0)),
        }),
      });
      refetchRoleTaxes();
      onRefetch();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? "Transaction failed");
    } finally {
      setBusyKey("");
    }
  }

  async function clearRole(role: number) {
    if (!capId) return;
    setBusyKey(`clear-${role}`);
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildClearSSURoleTax({ ownerCapId: capId, ssuGovId, role }),
      });
      refetchRoleTaxes();
      onRefetch();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? "Transaction failed");
    } finally {
      setBusyKey("");
    }
  }

  async function applyUniform() {
    if (!capId) return;
    setBusyKey("uniform");
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildSetSSUTaxUniform({
          ownerCapId: capId,
          ssuGovId,
          wtsPct: parsePctToScaled(uniform.wtsPct),
          wtbPct: parsePctToScaled(uniform.wtbPct),
          deFlatFee: Math.max(0, Math.trunc(Number(uniform.deFlatFee) || 0)),
        }),
      });
      refetchRoleTaxes();
      onRefetch();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? "Transaction failed");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div>
      <div className="action-card">
        <h4>SSU Tax Configuration — Per Role</h4>
        <p className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.5rem" }}>
          Each row sets the tax rate charged when a player with that role buys (WTS),
          fills (WTB), or exchanges (DE) at one of this SSU's shops. Stacks with the
          tribe rate (Easy/Advanced) and the DApp global rate ({(dappGlobalBps / 100).toFixed(2)}%)
          for NoTribe + Easy shop trades. Advanced shop trades route through the tribe
          ledger and do NOT pay the DApp layer. Unset roles pay 0%. Per-tier cap 10%.
        </p>

        <table className="table" style={{ fontSize: "0.78rem" }}>
          <thead>
            <tr>
              <th>Role</th>
              <th>WTS %</th>
              <th>WTB %</th>
              <th>DE flat fee</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ROLE_INDICES.map(role => {
              const r = rows[role];
              return (
                <tr key={role}>
                  <td>{ROLE_LABEL[role]}</td>
                  <td><input className="input input--xs" type="number" step="0.01" min={0} max={10}
                    value={r.wtsPct} onChange={e => updateRow(role, "wtsPct", e.target.value)} style={{ width: "5rem" }} /></td>
                  <td><input className="input input--xs" type="number" step="0.01" min={0} max={10}
                    value={r.wtbPct} onChange={e => updateRow(role, "wtbPct", e.target.value)} style={{ width: "5rem" }} /></td>
                  <td><input className="input input--xs" type="number" min={0}
                    value={r.deFlatFee} onChange={e => updateRow(role, "deFlatFee", e.target.value)} style={{ width: "7rem" }} /></td>
                  <td style={{ display: "flex", gap: "0.35rem" }}>
                    <button className="btn btn--primary btn--sm" disabled={!capId || !!busyKey}
                      onClick={() => applyRole(role)}>
                      {busyKey === `apply-${role}` ? "..." : "Apply"}
                    </button>
                    <button className="btn btn--danger btn--sm" disabled={!capId || !!busyKey}
                      onClick={() => clearRole(role)}>
                      {busyKey === `clear-${role}` ? "..." : "Clear"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ borderTop: "1px solid var(--accent2-faint, #334)", marginTop: "0.75rem", paddingTop: "0.5rem" }}>
          <h5 style={{ fontSize: "0.85rem", marginBottom: "0.35rem" }}>Set Uniform (all 8 roles)</h5>
          <p className="muted" style={{ fontSize: "0.72rem", marginBottom: "0.35rem" }}>
            One-click write of the same rates to every role (legacy-equivalent quick-setup).
          </p>
          <div className="form-row" style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", fontSize: "0.72rem" }}>
              <span className="muted">WTS %</span>
              <input className="input input--xs" type="number" step="0.01" min={0} max={10}
                value={uniform.wtsPct} onChange={e => setUniform(u => ({ ...u, wtsPct: e.target.value }))} style={{ width: "5rem" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontSize: "0.72rem" }}>
              <span className="muted">WTB %</span>
              <input className="input input--xs" type="number" step="0.01" min={0} max={10}
                value={uniform.wtbPct} onChange={e => setUniform(u => ({ ...u, wtbPct: e.target.value }))} style={{ width: "5rem" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontSize: "0.72rem" }}>
              <span className="muted">DE flat fee</span>
              <input className="input input--xs" type="number" min={0}
                value={uniform.deFlatFee} onChange={e => setUniform(u => ({ ...u, deFlatFee: e.target.value }))} style={{ width: "7rem" }} />
            </label>
            <button className="btn btn--primary btn--sm" disabled={!capId || !!busyKey} onClick={applyUniform}>
              {busyKey === "uniform" ? "Applying..." : "Set Uniform"}
            </button>
          </div>
        </div>

        {capType === "super_admin" && (
          <p className="muted" style={{ fontSize: "0.72rem", marginTop: "0.35rem" }}>
            Note: requires SSUOwnerCap. SuperAdmin cap cannot set tax config directly.
          </p>
        )}
      </div>

      <SSUMissionFeeCard ssuGovId={ssuGovId} capId={capId} capType={capType} onRefetch={onRefetch} />
    </div>
  );
}

// ── SSUMissionFeeCard (Slice 7) — per-hour Mission (MIS) listing fee, SSU layer ──
// Denomination follows the SSU's bazaarType (EVE for NoTribe/Easy, tribe tokens for
// Advanced). Requires the SSUOwnerCap (the Move setter is owner-gated).
function SSUMissionFeeCard({ ssuGovId, capId, capType, onRefetch }: {
  ssuGovId: string; capId: string; capType: "owner" | "super_admin"; onRefetch: () => void;
}) {
  const { data: cfg, refetch } = useSSUGovernanceConfig(ssuGovId);
  const isAdvanced = cfg?.bazaarType === BAZAAR_TYPE_NUM.ADVANCED;
  const unit = isAdvanced ? "tokens" : "EVE";
  const scale = isAdvanced ? 1 : 1_000_000_000;
  const current = (cfg?.missionListingFeePerHour ?? 0) / scale;
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canApply = capType === "owner" && !!capId;

  async function save() {
    const v = Number(input);
    if (!Number.isFinite(v) || v < 0) { setMsg({ ok: false, text: "Fee must be 0 or greater." }); return; }
    setBusy(true); setMsg(null);
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildSetSsuMissionFee({ ownerCapId: capId, ssuGovId, feePerHour: Math.round(v * scale) }),
      });
      setMsg({ ok: true, text: "SSU Mission listing fee updated." });
      setTimeout(() => { refetch(); onRefetch(); }, 1500);
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Transaction failed." });
    } finally { setBusy(false); }
  }

  return (
    <div className="action-card" style={{ marginTop: "1rem" }}>
      <h4>Mission Listing Fee (per hour)</h4>
      <p className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.5rem" }}>
        SSU-layer per-hour fee for posting a Mission (MIS) at this SSU, charged at creation
        as fee/hour × listing-hours. Applies to all bazaar types; denominated in {unit} for
        this SSU. Set 0 to make the SSU layer free. Requires SSUOwnerCap (V33).
      </p>
      <div className="stats-row">
        <span>Current: <strong>{current} {unit} / hour</strong></span>
      </div>
      {!canApply && (
        <p className="muted" style={{ fontSize: "0.72rem" }}>
          Requires SSUOwnerCap — the SuperAdmin cap cannot set this.
        </p>
      )}
      <div className="form-row" style={{ gap: "0.5rem", alignItems: "flex-end", marginTop: "0.5rem" }}>
        <label style={{ display: "flex", flexDirection: "column", fontSize: "0.72rem" }}>
          <span className="muted">Fee / hour ({unit})</span>
          <input className="input input--sm" type="number" min={0} step="0.0001" value={input}
            onChange={e => setInput(e.target.value)} placeholder={String(current)} style={{ width: "10rem" }} />
        </label>
        <button className="btn btn--primary btn--sm" disabled={!canApply || busy} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {msg && <p style={{ fontSize: "0.78rem", color: msg.ok ? "var(--success)" : "var(--danger)" }}>{msg.text}</p>}
    </div>
  );
}

// SSUCapsSubTab (SuperAdmin "Admin & Mod Roles" sub-tab) REMOVED in V30:
// the SuperAdmin tab was retired (role management lives in Admin → Users & Roles),
// and its grant form was buggy (it granted role 4=Moderator under "Appoint Admin"
// and role 6=SuperAdmin under "Appoint Mod"). The canonical role UI is
// SSUManageUsersTab, sourced from MemberRegistry.

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
