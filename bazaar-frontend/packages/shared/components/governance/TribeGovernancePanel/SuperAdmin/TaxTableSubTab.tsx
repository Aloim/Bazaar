// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TaxTableSubTab — per-tribe per-role tax configuration form (V16 Session 3C).
 *
 * 8-row × 3-col grid (Tribe role × {wts_pct, wtb_pct, de_flat_fee}). Per-row
 * Apply (buildSetTribeRoleTax) + Clear (buildClearTribeRoleTax) + bottom
 * "Set Uniform" (buildSetTribeTaxUniform).
 *
 * Move surface: bazaar_core::tribe_role_tax_admin — auth via TribeLeaderCap.
 * Pre-condition (Move-side): tribe bazaar_type ∈ {Easy, Advanced}.
 *
 * Unit convention: wts/wtb pct stored ×100 (525 = 5.25%). MAX_TAX_PCT = 1000 (= 10%).
 * UI shows "%" with 2 decimals; conversion `Math.round(input * 100)` at TX time.
 *
 * "DApp Default" panel below shows useDAppTaxConfig.globalTaxBps for context.
 */

import React, { useEffect, useMemo, useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { useDAppTaxConfig } from "@bazaar/shared/hooks/dapp_hub/governance-config-hooks";
import { useTribeRoleTaxTable, useTribeGovernanceConfig } from "@bazaar/shared/hooks/bazaarcore/tribe-governance-hooks";
import {
  buildSetTribeRoleTax,
  buildClearTribeRoleTax,
  buildSetTribeTaxUniform,
  buildSetTribeMissionFee,
} from "@bazaar/shared/tx/bazaarcore/tribe-governance-tx";
import { ROLE_LABEL } from "@bazaar/shared/constants";
import { BAZAAR_TYPE_NUM } from "@bazaar/shared/types";

interface RoleRow { wtsPct: string; wtbPct: string; deFlatFee: string; }
const EMPTY_ROW: RoleRow = { wtsPct: "0", wtbPct: "0", deFlatFee: "0" };
const ROLE_INDICES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

function parsePctToScaled(input: string): number {
  const v = Number(input);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v * 100);
}

export function TaxTableSubTab() {
  const { leaderCapId, leaderTribeIdx } = useTribeCaps();
  const { tribes } = useTribeRegistry();
  const { data: dappTaxCfg } = useDAppTaxConfig();
  const dappGlobalBps = dappTaxCfg?.globalTaxBps ?? 0;

  const tribeGovId = leaderTribeIdx !== null
    ? (tribes.find(t => t.idx === leaderTribeIdx)?.tribeGovId ?? null)
    : null;
  const { data: roleTaxes, refetch: refetchRoleTaxes } = useTribeRoleTaxTable(tribeGovId);

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
  const canApply = !!(leaderCapId && tribeGovId);

  function updateRow(role: number, field: keyof RoleRow, val: string) {
    setRows(prev => ({ ...prev, [role]: { ...prev[role], [field]: val } }));
  }

  async function applyRole(role: number) {
    if (!leaderCapId || !tribeGovId) return;
    setBusyKey(`apply-${role}`);
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildSetTribeRoleTax({
          leaderCapId,
          tribeGovId,
          role,
          wtsPct: parsePctToScaled(rows[role].wtsPct),
          wtbPct: parsePctToScaled(rows[role].wtbPct),
          deFlatFee: Math.max(0, Math.trunc(Number(rows[role].deFlatFee) || 0)),
        }),
      });
      refetchRoleTaxes();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setBusyKey("");
    }
  }

  async function clearRole(role: number) {
    if (!leaderCapId || !tribeGovId) return;
    setBusyKey(`clear-${role}`);
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildClearTribeRoleTax({ leaderCapId, tribeGovId, role }),
      });
      refetchRoleTaxes();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setBusyKey("");
    }
  }

  async function applyUniform() {
    if (!leaderCapId || !tribeGovId) return;
    setBusyKey("uniform");
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildSetTribeTaxUniform({
          leaderCapId,
          tribeGovId,
          wtsPct: parsePctToScaled(uniform.wtsPct),
          wtbPct: parsePctToScaled(uniform.wtbPct),
          deFlatFee: Math.max(0, Math.trunc(Number(uniform.deFlatFee) || 0)),
        }),
      });
      refetchRoleTaxes();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div>
      <div className="action-card">
        <h4>Tribe Tax Configuration — Per Role</h4>
        <p className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.75rem" }}>
          Each row sets the tax rate charged when a player with that tribe role
          buys / fills / exchanges at any shop within this tribe. Stacks on top of
          the SSU-level rate (per-role) and the DApp global rate
          ({(dappGlobalBps / 100).toFixed(2)}%) for NoTribe + Easy shop trades.
          Unset roles pay 0%. Per-tier cap 10%. Requires TribeLeaderCap.
        </p>

        {!canApply && (
          <p className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.5rem" }}>
            {!leaderCapId
              ? "No TribeLeaderCap detected. Connect the leader wallet to configure tribe taxes."
              : "Tribe governance object not bootstrapped yet."}
          </p>
        )}

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
                    <button className="btn btn--primary btn--sm" disabled={!canApply || !!busyKey}
                      onClick={() => applyRole(role)}>
                      {busyKey === `apply-${role}` ? "..." : "Apply"}
                    </button>
                    <button className="btn btn--danger btn--sm" disabled={!canApply || !!busyKey}
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
            One-click write of the same rates to every tribe role.
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
            <button className="btn btn--primary btn--sm" disabled={!canApply || !!busyKey} onClick={applyUniform}>
              {busyKey === "uniform" ? "Applying..." : "Set Uniform"}
            </button>
          </div>
        </div>
      </div>

      <TribeMissionFeeCard leaderCapId={leaderCapId} tribeGovId={tribeGovId} />

      <div className="action-card" style={{ marginTop: "1rem" }}>
        <h4>DApp Default Tax Rate (read-only)</h4>
        <p className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.5rem" }}>
          Platform-wide rate set by DApp governance. Stacks on top of the
          per-tribe and per-SSU rates for NoTribe + Easy shop trades and
          Advanced Exchange-beacon swaps. Advanced shop trades skip this layer.
          Edit via DAppGovernancePanel.
        </p>
        <table className="table" style={{ fontSize: "0.78rem" }}>
          <tbody>
            <tr>
              <td>Global DApp rate</td>
              <td><strong>{(dappGlobalBps / 100).toFixed(2)}%</strong> ({dappGlobalBps} bps)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TribeMissionFeeCard (Slice 7) — per-hour Mission (MIS) listing fee, Tribe layer ──
// Denomination follows the tribe's bazaarType (EVE for Easy, tribe tokens for Advanced).
// Requires the TribeLeaderCap (the Move setter is leader-gated; Easy/Advanced only).
function TribeMissionFeeCard({ leaderCapId, tribeGovId }: {
  leaderCapId: string | null; tribeGovId: string | null;
}) {
  const { data: cfg, refetch } = useTribeGovernanceConfig(tribeGovId);
  const isAdvanced = cfg?.bazaarType === BAZAAR_TYPE_NUM.ADVANCED;
  const unit = isAdvanced ? "tokens" : "EVE";
  const scale = isAdvanced ? 1 : 1_000_000_000;
  const current = (cfg?.missionListingFeePerHour ?? 0) / scale;
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canApply = !!(leaderCapId && tribeGovId);

  async function save() {
    if (!leaderCapId || !tribeGovId) return;
    const v = Number(input);
    if (!Number.isFinite(v) || v < 0) { setMsg({ ok: false, text: "Fee must be 0 or greater." }); return; }
    setBusy(true); setMsg(null);
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildSetTribeMissionFee({ leaderCapId, tribeGovId, feePerHour: Math.round(v * scale) }),
      });
      setMsg({ ok: true, text: "Tribe Mission listing fee updated." });
      setTimeout(() => refetch(), 1500);
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Transaction failed." });
    } finally { setBusy(false); }
  }

  return (
    <div className="action-card" style={{ marginTop: "1rem" }}>
      <h4>Mission Listing Fee (per hour)</h4>
      <p className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.5rem" }}>
        Tribe-layer per-hour fee for posting a Mission (MIS) within this tribe, charged at
        creation as fee/hour × listing-hours. Applies to Easy + Advanced; denominated in
        {" "}{unit} for this tribe. Set 0 to make the tribe layer free. Requires TribeLeaderCap (V33).
      </p>
      <div className="stats-row">
        <span>Current: <strong>{current} {unit} / hour</strong></span>
      </div>
      {!canApply && (
        <p className="muted" style={{ fontSize: "0.72rem" }}>
          {!leaderCapId ? "No TribeLeaderCap detected." : "Tribe governance not bootstrapped yet."}
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

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
