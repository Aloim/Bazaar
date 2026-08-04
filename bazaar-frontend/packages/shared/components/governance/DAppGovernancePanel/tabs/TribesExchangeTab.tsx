// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/DAppGovernancePanel.tsx (lines 1030-1169; split for 500-line guard, section: TribesExchangeTab).

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { buildSetExchangeFeeOverride } from "@bazaar/shared/tx";
import type { TribeInfo } from "@bazaar/shared/hooks";
import { useTribeAssets } from "@bazaar/shared/hooks/useTribeAssets";
import { useTribeTokenLedger } from "@bazaar/shared/hooks/bazaareconomy/ledger-hooks";

interface TribesExchangeTabProps {
  tribes:       TribeInfo[];
  isDAppOwner:  boolean;
  ownerCapId:   string | null;
  onRefresh:    () => void;
}

export function TribesExchangeTab({
  tribes,
  isDAppOwner,
  ownerCapId,
  onRefresh,
}: TribesExchangeTabProps) {
  const [loading, setLoading] = useState<string>("");
  const [feeInputs, setFeeInputs] = useState<Record<number, string>>({});

  function getFeeInput(idx: number): string {
    return feeInputs[idx] ?? "";
  }

  function setFeeInput(idx: number, val: string) {
    setFeeInputs(prev => ({ ...prev, [idx]: val }));
  }

  async function handleSetOverride(tribe: TribeInfo) {
    if (!ownerCapId) return;
    if (!tribe.tribeGovId || !tribe.exchangeConfigId) {
      alert("This tribe has no TribeGovernance or ExchangeConfig object yet. Bootstrap the tribe first.");
      return;
    }
    const inputVal = getFeeInput(tribe.idx);
    const bps = Math.round(Number(inputVal) * 100);
    if (isNaN(bps) || bps < 0 || bps > 1000) {
      alert("Fee must be between 0% and 10%.");
      return;
    }
    setLoading(`set-${tribe.idx}`);
    try {
      const tx = buildSetExchangeFeeOverride({
        ownerCapId,
        tribeGovernanceId: tribe.tribeGovId,
        configId: tribe.exchangeConfigId,
        overrideBps: bps,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setFeeInput(tribe.idx, "");
      onRefresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("");
    }
  }

  async function handleRemoveOverride(tribe: TribeInfo) {
    if (!ownerCapId) return;
    if (!tribe.tribeGovId || !tribe.exchangeConfigId) {
      alert("This tribe has no TribeGovernance or ExchangeConfig object yet.");
      return;
    }
    setLoading(`remove-${tribe.idx}`);
    try {
      // Pass overrideBps: null to revert to the global dApp rate (option::none() in Move).
      const tx = buildSetExchangeFeeOverride({
        ownerCapId,
        tribeGovernanceId: tribe.tribeGovId,
        configId: tribe.exchangeConfigId,
        overrideBps: null,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onRefresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading("");
    }
  }

  // Filter to Advanced currency tribes only (bazaarType === 2 + exchangeConfigId populated)
  const currencyTribes = tribes.filter(t => t.bazaarType === 2 && !!t.exchangeConfigId);

  return (
    <div className="panel__section">
      <div className="action-card">
        <h4>Per-Tribe Exchange Fee Overrides</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          Override the per-tribe exchange fee for specific tribe pools. Useful for promotional or
          tiered fee structures. Owner only. Max 10% (1000 bps). Pass no override to revert to the
          dApp default rate.
        </p>
        <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
          Only tribes with active exchange pools and bootstrapped TribeGovernance are listed.
        </p>
      </div>

      {currencyTribes.length === 0 && (
        <p className="muted" style={{ fontSize: "0.82rem" }}>
          No currency tribes registered.
        </p>
      )}

      {currencyTribes.map(tribe => (
        <CurrencyTribeRow
          key={tribe.idx}
          tribe={tribe}
          isDAppOwner={isDAppOwner}
          loading={loading}
          getFeeInput={getFeeInput}
          setFeeInput={setFeeInput}
          onSetOverride={handleSetOverride}
          onRemoveOverride={handleRemoveOverride}
        />
      ))}
    </div>
  );
}

// ── CurrencyTribeRow sub-component ────────────────────────────────────────────
// Extracted to satisfy Rules of Hooks: useTribeTokenLedger must be called at
// the top level of a component, not inside a .map() callback (FA-OS28-RISK-05).

interface CurrencyTribeRowProps {
  tribe:            TribeInfo;
  isDAppOwner:      boolean;
  loading:          string;
  getFeeInput:      (idx: number) => string;
  setFeeInput:      (idx: number, val: string) => void;
  onSetOverride:    (tribe: TribeInfo) => Promise<void>;
  onRemoveOverride: (tribe: TribeInfo) => Promise<void>;
}

function CurrencyTribeRow({
  tribe,
  isDAppOwner,
  loading,
  getFeeInput,
  setFeeInput,
  onSetOverride,
  onRemoveOverride,
}: CurrencyTribeRowProps) {
  const tribeAssets = useTribeAssets(tribe.idx);
  const { data: ledger } = useTribeTokenLedger(tribeAssets.tokenLedgerId);
  const tokenSymbol = ledger?.tokenSymbol ?? "—";

  return (
    <div className="action-card" style={{ padding: "0.6rem 0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "0.88rem" }}>
          #{tribe.idx} — {tribe.name}
        </strong>
        <span className="muted" style={{ fontSize: "0.76rem" }}>
          ({tokenSymbol})
        </span>
        <span className="muted" style={{ fontSize: "0.75rem", marginLeft: "auto" }}>
          {tribe.tribeGovId ? "Override eligible" : "Bootstrap required"}
        </span>
      </div>

      {isDAppOwner && (
        <div className="form-row" style={{ marginTop: "0.5rem" }}>
          <input
            className="input input--sm"
            type="number"
            min="0"
            max="10"
            step="0.01"
            value={getFeeInput(tribe.idx)}
            onChange={e => setFeeInput(tribe.idx, e.target.value)}
            placeholder="Override % (0–10)"
            style={{ width: 120 }}
          />
          <button
            className="btn btn--primary btn--sm"
            disabled={!!loading || !getFeeInput(tribe.idx)}
            onClick={() => onSetOverride(tribe)}
          >
            {loading === `set-${tribe.idx}` ? "..." : "Set Override"}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            disabled={!!loading}
            onClick={() => onRemoveOverride(tribe)}
            title="Remove override — reverts to global standard fee"
          >
            {loading === `remove-${tribe.idx}` ? "..." : "Remove Override"}
          </button>
        </div>
      )}

      {!isDAppOwner && (
        <p className="muted" style={{ fontSize: "0.76rem", marginTop: "0.3rem" }}>
          Owner-only setting.
        </p>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
