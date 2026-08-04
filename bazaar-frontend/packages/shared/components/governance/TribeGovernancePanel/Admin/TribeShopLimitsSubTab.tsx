// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeShopLimitsSubTab — Phase 8 Wave A2 (AUD-ET-23).
 *
 * First editor UI for the V35 tribe-layer shop-limit config on TribeGovernance
 * (max_shops_override / shop_limits_by_role / shop_items_limit). Leader or
 * SuperAdmin caps drive the tribe_shop_config writers; items limit is
 * Leader-only. Reachable in tribeOnly mode (the config is tribe-scoped).
 *
 * AUD-ET-12 caveat: on live V35 these values are write-only config — on-chain
 * enforcement at the shop-create sites ships with V36. The banner says so.
 */

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { suiClient } from "@bazaar/shared/hooks/sui-client";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import {
  buildSetTribeMaxShops,
  buildSetTribeShopLimitForRole,
  buildSetTribeShopItemsLimit,
} from "@bazaar/shared/tx/bazaarcore/tribe-ban-tx";
import { ROLE_LABEL } from "@bazaar/shared/constants";

type AnyFields = { fields?: Record<string, unknown> } | undefined;

interface TribeLimitsState {
  maxShopsOverride: number | null;
  limitsByRole:     Record<number, number>;
  shopItemsLimit:   number;
}

function useTribeLimits(tribeGovId: string | null) {
  return useQuery<TribeLimitsState>({
    queryKey: ["bazaarcore", "tribe-shop-limits", tribeGovId],
    enabled: !!tribeGovId,
    queryFn: async (): Promise<TribeLimitsState> => {
      const gov = await suiClient.getObject({ id: tribeGovId!, options: { showContent: true } });
      const fields = (gov.data?.content as AnyFields)?.fields ?? {};
      const overrideRaw = fields.max_shops_override as unknown;
      const maxShopsOverride = overrideRaw === null || overrideRaw === undefined
        ? null
        : Number(overrideRaw);
      const shopItemsLimit = Number(fields.shop_items_limit ?? 0);
      const tableId =
        (fields.shop_limits_by_role as { fields?: { id?: { id?: string } } } | undefined)
          ?.fields?.id?.id;
      const limitsByRole: Record<number, number> = {};
      if (tableId) {
        await Promise.all(Array.from({ length: 8 }, (_, role) => role).map(async role => {
          try {
            const row = await suiClient.getDynamicFieldObject({
              parentId: tableId,
              name: { type: "u8", value: String(role) },
            });
            const v = (row.data?.content as { fields?: { value?: unknown } } | undefined)
              ?.fields?.value;
            if (v !== undefined) limitsByRole[role] = Number(v);
          } catch { /* role row unset → unlimited */ }
        }));
      }
      return { maxShopsOverride, limitsByRole, shopItemsLimit };
    },
    staleTime: 15_000,
  });
}

export function TribeShopLimitsSubTab() {
  const { hasLeaderCap, hasSuperAdminCap, leaderCapId, superAdminCapId,
          leaderTribeIdx, superAdminTribeIdx } = useTribeCaps();
  const { tribes } = useTribeRegistry();
  const govTribeIdx = leaderTribeIdx ?? superAdminTribeIdx ?? null;
  const tribeGovId = govTribeIdx !== null
    ? (tribes.find(t => t.idx === govTribeIdx)?.tribeGovId ?? null)
    : null;
  const { data: limits, refetch, isLoading } = useTribeLimits(tribeGovId);

  const capTier: "leader" | "super_admin" | null =
    hasLeaderCap ? "leader" : hasSuperAdminCap ? "super_admin" : null;
  const capId = hasLeaderCap ? leaderCapId : superAdminCapId;

  const [maxShops, setMaxShops]   = useState("");
  const [roleSel, setRoleSel]     = useState(0);
  const [roleMax, setRoleMax]     = useState("");
  const [itemsLimit, setItemsLimit] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(label: string, txFactory: () => ReturnType<typeof buildSetTribeMaxShops>) {
    setBusy(label); setError("");
    try {
      await dAppKit.signAndExecuteTransaction({ transaction: txFactory() });
      await refetch();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!capTier || !capId || !tribeGovId) {
    return <p className="muted">Tribe shop limits need a TribeLeaderCap or TribeSuperAdminCap.</p>;
  }

  return (
    <div>
      <p className="muted" style={{ fontSize: "0.78rem" }}>
        Tribe-layer shop limits. On live V35 these are saved config only — on-chain
        enforcement at shop creation arrives with the V36 publish.
      </p>
      {error && <div className="currency-selector__warning" style={{ marginBottom: "0.5rem" }}>{error}</div>}

      <div className="action-card">
        <h4>Tribe Max Shops (per owner)</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          Current: <strong>{isLoading ? "…" : limits?.maxShopsOverride == null ? "No cap" : limits.maxShopsOverride}</strong>
        </p>
        <div className="form-row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
          <input className="input input--xs" type="number" min={1} placeholder="e.g. 5"
            value={maxShops} onChange={e => setMaxShops(e.target.value)} />
          <button className="btn btn--primary btn--sm" disabled={busy !== null || !maxShops}
            onClick={() => run("max", () => buildSetTribeMaxShops({
              capTier, capId: capId!, tribeGovId, maxShops: Math.max(1, parseInt(maxShops, 10) || 1),
            }))}>{busy === "max" ? "..." : "Set cap"}</button>
          <button className="btn btn--ghost btn--sm" disabled={busy !== null}
            onClick={() => run("max", () => buildSetTribeMaxShops({
              capTier, capId: capId!, tribeGovId, maxShops: null,
            }))}>Clear cap</button>
        </div>
      </div>

      <div className="action-card" style={{ marginTop: "1rem" }}>
        <h4>Per-Role Shop Limit</h4>
        <table className="tax-grid">
          <thead><tr><th>Role</th><th>Max shops</th></tr></thead>
          <tbody>
            {Array.from({ length: 8 }, (_, i) => i).map(i => (
              <tr key={i}>
                <td>{ROLE_LABEL[i] ?? `Role ${i}`}</td>
                <td>{isLoading ? "…" : (limits?.limitsByRole[i] ?? 0) === 0 ? "Unlimited" : limits?.limitsByRole[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-row" style={{ gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
          <select className="input input--xs" value={roleSel} onChange={e => setRoleSel(Number(e.target.value))}>
            {Array.from({ length: 8 }, (_, i) => i).map(i => (
              <option key={i} value={i}>{ROLE_LABEL[i] ?? `Role ${i}`}</option>
            ))}
          </select>
          <input className="input input--xs" type="number" min={0} placeholder="0 = unlimited"
            value={roleMax} onChange={e => setRoleMax(e.target.value)} />
          <button className="btn btn--primary btn--sm" disabled={busy !== null || roleMax === ""}
            onClick={() => run("role", () => buildSetTribeShopLimitForRole({
              capTier, capId: capId!, tribeGovId, role: roleSel, max: Math.max(0, parseInt(roleMax, 10) || 0),
            }))}>{busy === "role" ? "..." : "Set role limit"}</button>
        </div>
      </div>

      <div className="action-card" style={{ marginTop: "1rem" }}>
        <h4>Items per Shop (FE-advisory)</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          Current: <strong>{isLoading ? "…" : (limits?.shopItemsLimit ?? 0) === 0 ? "No limit" : limits?.shopItemsLimit}</strong>
          {" "}— Leader only.
        </p>
        <div className="form-row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
          <input className="input input--xs" type="number" min={0} placeholder="0 = no limit"
            value={itemsLimit} onChange={e => setItemsLimit(e.target.value)} />
          <button className="btn btn--primary btn--sm"
            disabled={busy !== null || itemsLimit === "" || !hasLeaderCap || !leaderCapId}
            title={!hasLeaderCap ? "Leader only" : undefined}
            onClick={() => run("items", () => buildSetTribeShopItemsLimit({
              leaderCapId: leaderCapId!, tribeGovId, limit: Math.max(0, parseInt(itemsLimit, 10) || 0),
            }))}>{busy === "items" ? "..." : "Set items limit"}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
