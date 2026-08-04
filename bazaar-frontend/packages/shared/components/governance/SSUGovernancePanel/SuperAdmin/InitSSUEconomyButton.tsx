// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V27 Wave 2 — InitSSUEconomyButton
 *
 * SSUOwnerCap-gated button for the per-SSU init_ssu_economy entry. Hidden
 * once useSSUEconomyInitStatus reports `initialized: true`.
 *
 * Mounted by AdvancedSSUWalletPanel. Only renders when:
 *   - bazaarType === Advanced (panel already gates on that)
 *   - hasOwnerCap && ssuOwnerCapId resolved
 *   - tribeGovId + ledgerId resolved
 *   - status query has settled with initialized === false
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useSSUEconomyInitStatus } from "@bazaar/shared/hooks/bazaareconomy/useSSUEconomyInitStatus";
import { buildInitSsuEconomy } from "@bazaar/shared/tx/bazaareconomy/ssu-economy-init-tx";

interface Props {
  ssuId:         string;
  ssuGovId:      string;
  ssuOwnerCapId: string;
  tribeGovId:    string | null;
  ledgerId:      string | null;
  /** Tribe-token symbol for display (best-effort, falls back to "tokens"). */
  tokenSymbol?:  string;
  onSuccess?:    () => void;
}

export function InitSSUEconomyButton({
  ssuId, ssuGovId, ssuOwnerCapId, tribeGovId, ledgerId, tokenSymbol, onSuccess,
}: Props) {
  const { data: status, isLoading, refetch } = useSSUEconomyInitStatus(ssuId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");

  if (isLoading) return null;
  if (status?.initialized) return null;

  const missing: string[] = [];
  if (!tribeGovId) missing.push("tribe governance");
  if (!ledgerId)   missing.push("tribe token ledger");
  const blocked = missing.length > 0;

  async function go() {
    if (!tribeGovId || !ledgerId) return;
    setBusy(true);
    setErr("");
    try {
      const tx = new Transaction();
      buildInitSsuEconomy(
        { ssuGovId, ssuOwnerCapId, tribeGovId, ledgerId },
        tx,
      );
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      await refetch();
      onSuccess?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Initialization failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="action-card" style={{ marginTop: "1rem" }}>
      <h4>Initialize SSU Economy</h4>
      <p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.25rem" }}>
        Creates the per-SSU {tokenSymbol || "tribe-token"} WTB escrow pool and
        opens a zero-balance ledger row. Required before this SSU can host
        Advanced WTB shops or accumulate tax credits.
      </p>
      {blocked && (
        <p className="muted" style={{ fontSize: "0.72rem" }}>
          Waiting for {missing.join(" + ")} to resolve…
        </p>
      )}
      {err && (
        <p style={{ color: "var(--danger, #c33)", fontSize: "0.78rem", marginTop: "0.4rem" }}>
          {err}
        </p>
      )}
      <button
        className="btn btn--primary btn--sm"
        style={{ marginTop: "0.5rem" }}
        disabled={busy || blocked}
        onClick={go}
      >
        {busy ? "Initializing…" : "Initialize SSU Economy"}
      </button>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
