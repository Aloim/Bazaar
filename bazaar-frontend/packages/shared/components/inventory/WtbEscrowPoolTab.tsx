// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useWtbEscrowPool } from "@bazaar/shared/hooks/useWtbEscrowPool";
import { useTribeTokenWtbPool } from "@bazaar/shared/hooks/useTribeTokenWtbPool";
import { useTribeTokenWtbPoolId } from "@bazaar/shared/hooks";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useBazaarType } from "@bazaar/shared/hooks/useBazaarType";
import { useSSUGovernanceConfig } from "@bazaar/shared/hooks";
import { useTribeTokenSymbol } from "@bazaar/shared/hooks/bazaareconomy/useTribeTokenSymbol";
import { useTribeEconomyObjects, useTribeTokenLedger } from "@bazaar/shared/hooks";
import { COIN_DECIMALS, SSU_OBJECT_ID } from "@bazaar/shared/constants";
import { Stat } from "@bazaar/shared/components/Stat";
import { formatTribeAmount, TRIBE_TOKEN_DECIMALS } from "@bazaar/shared/utils/tribeToken";

// ── WTB Pool Tab ──────────────────────────────────────────────────────────────
//
// Two-tier display:
//   - NoTribe / Easy bazaars: show the EVE-side WtbEscrowPool (Balance<EVE>).
//   - Advanced bazaars: show the TribeTokenWtbPool.total_escrowed (raw ledger
//     units, NO COIN_DECIMALS division — tribe tokens are 0-decimal ledger ints).
export function WtbEscrowPoolTab({ ownerCapId: _ownerCapId }: { ownerCapId: string }) {
  const { data: shared } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const { bazaarType } = useBazaarType(SSU_OBJECT_ID || null);
  const isAdvanced = bazaarType === "Advanced";

  // NoTribe / Easy path — EVE escrow pool.
  const { poolBalance, totalLedger, surplus, loading: eveLoading, refetch: eveRefetch } =
    useWtbEscrowPool(isAdvanced ? null : shared?.wtbEscrowPoolId);

  // Advanced path — tribe-token escrow pool.
  const { data: tribePoolId } = useTribeTokenWtbPoolId(isAdvanced ? (SSU_OBJECT_ID || null) : null);
  const { totalEscrowed, loading: tribeLoading, refetch: tribeRefetch } =
    useTribeTokenWtbPool(isAdvanced ? tribePoolId : null);
  // Resolve tribe token symbol via SSU governance config → tribeId → ledger.
  const { data: govConfig } = useSSUGovernanceConfig(isAdvanced ? (shared?.ssuGovId ?? null) : null);
  const tribeIdNum = govConfig?.tribeId ?? null;
  const { symbol: resolvedSymbol } = useTribeTokenSymbol(tribeIdNum);
  const tokenSymbol = resolvedSymbol || "Tribe Tokens";
  // V26+ — read ledger decimals for the Advanced total-escrowed display.
  const tribeIdStr = tribeIdNum != null && tribeIdNum > 0 ? String(tribeIdNum) : null;
  const { data: economyIds } = useTribeEconomyObjects(isAdvanced ? tribeIdStr : null);
  const { data: ledger } = useTribeTokenLedger(isAdvanced ? (economyIds?.ledgerId ?? null) : null);
  const tribeTokenDecimals = ledger?.decimals ?? TRIBE_TOKEN_DECIMALS;

  if (isAdvanced) {
    const loading = tribeLoading;
    return (
      <div className="panel__section">
        <div className="action-card">
          <h4>WTB Pool — Tribe Token</h4>
          <p className="muted" style={{ fontSize: "0.78rem" }}>
            Advanced WTB shops escrow {tokenSymbol} burned from the owner&apos;s ledger row.
            The pool aggregates all active WTB shops on this SSU until they are filled or closed.
          </p>
          {!tribePoolId && !loading && (
            <p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.5rem", color: "var(--warning, #c8a84b)" }}>
              No tribe-token WTB pool bootstrapped for this SSU yet. The pool is
              created lazily on the first Advanced WTB shop create.
            </p>
          )}
          <button
            className="btn btn--ghost btn--sm"
            style={{ marginTop: "0.5rem" }}
            onClick={tribeRefetch}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {tribePoolId && !loading && (
          <div className="action-card">
            <div className="stats-row">
              <Stat
                label={`Total Escrowed (${tokenSymbol})`}
                value={formatTribeAmount(totalEscrowed, { decimals: tribeTokenDecimals })}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // NoTribe / Easy — original EVE display.
  const loading = eveLoading;
  return (
    <div className="panel__section">
      <div className="action-card">
        <h4>WTB Pool</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          All WTB shop escrow funds are held in this shared pool. The ledger tracks per-shop allocations.
        </p>
        <button
          className="btn btn--ghost btn--sm"
          style={{ marginTop: "0.5rem" }}
          onClick={eveRefetch}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {!loading && (
        <div className="action-card">
          <div className="stats-row">
            <Stat label="Pool Balance" value={(poolBalance / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 })} />
            <Stat label="Active Ledger" value={(totalLedger / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 })} />
            <Stat label="Surplus" value={(surplus / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 })} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
