// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState } from "react";
import { useGatedTransaction } from "@bazaar/shared/hooks/announcements";
import { buildRequestWithdrawal } from "@bazaar/shared/tx/bazaareconomy/withdrawal-tx";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import { useClaimBoxContext } from "@bazaar/shared/contexts/ClaimBoxContext";

export interface WithdrawModalProps {
  treasuryBalance:   number;
  tribeLeaderCapId:  string;
  /** TribeGovernance shared object. */
  tribeGovernanceId: string;
  /** WithdrawalBoard shared object. */
  boardId:           string;
  /** TribeVault shared object. */
  vaultId:           string;
  /** TribeTokenLedger shared object (V15 FinanceEvent circulation snapshot). */
  ledgerId:          string;
  onClose:          () => void;
  onSuccess:        () => void;
}

export default function WithdrawModal({
  treasuryBalance, tribeLeaderCapId, tribeGovernanceId, boardId, vaultId, ledgerId,
  onClose, onSuccess,
}: WithdrawModalProps) {
  const { signGated } = useGatedTransaction();
  const { currencyName } = useClaimBoxContext();
  const displayCurrency = currencyName || "EVE";

  const [amount,  setAmount]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const parsedAmount = parseFloat(amount);
  const rawAmount    = Math.round(parsedAmount * COIN_DECIMALS);
  const isValid      = !isNaN(parsedAmount) && parsedAmount > 0 && rawAmount <= treasuryBalance;

  async function handleWithdraw() {
    if (!isValid) {
      setError("Enter a valid amount within vault balance.");
      return;
    }
    if (!tribeGovernanceId || !boardId || !vaultId || !ledgerId) {
      setError("Tribe economy not fully bootstrapped.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const tx = buildRequestWithdrawal({
        leaderCapId: tribeLeaderCapId,
        tribeGovernanceId,
        boardId,
        vaultId,
        ledgerId,
        amountMist: rawAmount,
        reason: "Withdrawal request",
      });
      await signGated(tx);
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={loading ? undefined : onClose}>
      <div className="modal withdraw-modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h3>Request Withdrawal (24h delay)</h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose} disabled={loading}>
            Close
          </button>
        </div>

        <div className="form-group">
          <label className="form-label">
            Treasury Balance:{" "}
            <span style={{ color: "var(--accent2)" }}>
              {(treasuryBalance / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 2 })} {displayCurrency}
            </span>
          </label>
        </div>

        <div className="form-group">
          <label className="form-label">Amount</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.000000001"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={loading}
          />
        </div>

        <p className="muted" style={{ fontSize: "0.78rem", marginBottom: "0.5rem" }}>
          Submits a withdrawal request. Funds available after 24h.
        </p>

        {error && (
          <p className="error-text" style={{ fontSize: "0.85rem" }}>{error}</p>
        )}

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={handleWithdraw}
            disabled={loading || !isValid}
          >
            {loading ? "Submitting..." : "Submit Request"}
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
