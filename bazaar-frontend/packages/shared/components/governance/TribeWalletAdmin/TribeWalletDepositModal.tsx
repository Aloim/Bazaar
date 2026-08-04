// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeWalletDepositModal — V20.
 *
 * Permissionless: moves tokens FROM the connected wallet's ledger row TO the
 * Tribe Token Wallet (gov.id_address row). No cap required. Caller's balance
 * must be >= amount.
 *
 * Move entry fn: bazaar_economy::tribe_token_ledger::deposit_to_tribe_wallet
 */

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { buildDepositToTribeWallet } from "@bazaar/shared/tx/bazaareconomy/ledger-tx";
import {
  formatTribeAmount,
  parseTribeAmountSafe,
  TRIBE_TOKEN_DECIMALS,
} from "@bazaar/shared/utils/tribeToken";
import { Z } from "@bazaar/shared/constants/zIndex";

interface Props {
  open:               boolean;
  onClose:            () => void;
  onSuccess:          () => void;
  tribeGovernanceId:  string;
  ledgerId:           string;
  callerBalance:      number;       // raw scaled units (V26+)
  tokenSymbol:        string;
  /** On-chain ledger decimals (V26+ default 2). */
  decimals?:          number;
}

export default function TribeWalletDepositModal({
  open, onClose, onSuccess,
  tribeGovernanceId, ledgerId,
  callerBalance, tokenSymbol,
  decimals = TRIBE_TOKEN_DECIMALS,
}: Props) {
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setAmountStr(""); setErr(null); setBusy(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setErr(null);
    const parsed = parseTribeAmountSafe(amountStr, decimals);
    if (!parsed.ok) {
      setErr(`Invalid amount: ${parsed.reason}`);
      return;
    }
    if (parsed.value <= 0n) {
      setErr("Enter a positive amount.");
      return;
    }
    if (parsed.value > BigInt(callerBalance)) {
      setErr(`Amount exceeds your balance (${formatTribeAmount(callerBalance, { decimals })} ${tokenSymbol}).`);
      return;
    }
    const amount = Number(parsed.value);
    setBusy(true);
    try {
      const tx = buildDepositToTribeWallet({
        tribeGovernanceId, ledgerId, amount,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      window.dispatchEvent(new Event("bazar-soft-refresh"));
      onSuccess();
      handleClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: Z.MODAL_2,
      }}
    >
      <div
        className="panel modal-card"
        style={{ width: "min(480px, 92vw)", padding: "1.25rem" }}
      >
        <h3 className="panel__heading" style={{ marginTop: 0 }}>
          Deposit into Tribe Wallet
        </h3>
        <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "1rem" }}>
          Moves tokens from your balance into the Tribe Wallet. Permissionless —
          any tribe-token holder can contribute. Your balance:{" "}
          <strong>{formatTribeAmount(callerBalance, { decimals })} {tokenSymbol}</strong>.
        </p>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="form-label">Amount ({tokenSymbol})</label>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder={`Up to ${formatTribeAmount(callerBalance, { decimals })}`}
              style={{ flex: 1 }}
              disabled={busy}
            />
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              disabled={busy || callerBalance === 0}
              onClick={() => setAmountStr(formatTribeAmount(callerBalance, { decimals, noGrouping: true }))}
            >
              Max
            </button>
          </div>
        </div>

        {err && (
          <p style={{ color: "var(--danger-color, #f87171)", margin: "0 0 0.5rem 0", fontSize: "0.85rem" }}>
            {err}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
          <button className="btn btn--ghost" onClick={handleClose} disabled={busy}>Cancel</button>
          <button
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={busy || !amountStr || callerBalance === 0}
          >
            {busy ? "Submitting…" : "Deposit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
