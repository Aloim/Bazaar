// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V7 Phase 4.7: DepositModal now receives leaderCapId + tribeGovernanceId + vaultId from
// TribeAssetsTab (which resolves them via useTribeCaps + useTribeAssets). Coin<EVE> is
// split via splitEveCoin before buildDepositEve is called.
// useBalances eveBalance replaces tribeBalance for display.

import { useState } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useGatedTransaction } from "@bazaar/shared/hooks/announcements";
import { useBalances } from "@bazaar/shared/hooks/useBalances";
import { buildDepositEve } from "@bazaar/shared/tx/bazaareconomy/vault-tx";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import { Transaction } from "@mysten/sui/transactions";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";

interface Props {
  onClose:   () => void;
  onSuccess: () => void;
  /** leaderCapId — TribeLeaderCap object ID from useTribeCaps(). Required for buildDepositEve. */
  leaderCapId:       string;
  /** tribeGovernanceId — TribeGovernance shared object ID from useTribeAssets(). */
  tribeGovernanceId: string;
  /** vaultId — TribeVault shared object ID from useTribeAssets(). */
  vaultId:           string;
  /** ledgerId — TribeTokenLedger shared object ID (V15 — needed for FinanceEvent circulation snapshot). */
  ledgerId:          string;
}

export default function DepositModal({ onClose, onSuccess, leaderCapId, tribeGovernanceId, vaultId, ledgerId }: Props) {
  const { signGated } = useGatedTransaction();
  const { walletAddress } = useConnection();
  const { eveBalance } = useBalances();

  const [amount,  setAmount]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleDeposit() {
    const parsedAmount = parseFloat(amount);
    const rawAmount = Math.round(parsedAmount * COIN_DECIMALS);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!walletAddress) {
      setError("Wallet not connected.");
      return;
    }

    // Guard: all four vault IDs must be resolved before dispatching PTB.
    if (!leaderCapId || !tribeGovernanceId || !vaultId || !ledgerId) {
      setError("Tribe vault not fully bootstrapped — please try again shortly.");
      setLoading(false);
      return;
    }
    const tx = new Transaction();
    let split;
    setLoading(true);
    setError(null);
    try {
      split = await splitEveCoin(walletAddress, BigInt(rawAmount), tx);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Insufficient EVE balance.");
      setLoading(false);
      return;
    }
    try {
      buildDepositEve({
        leaderCapId,
        tribeGovernanceId,
        vaultId,
        ledgerId,
        amountMist:  rawAmount,
        paymentCoin: split.coinArg,
      }, tx);
      await signGated(tx);
      window.dispatchEvent(new Event("bazar-soft-refresh"));
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={loading ? undefined : onClose}>
      <div className="modal deposit-modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h3>Deposit EVE to Treasury</h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose} disabled={loading}>
            Close
          </button>
        </div>

        <div className="form-group">
          <label className="form-label">
            Your EVE Balance:{" "}
            <span style={{ color: "var(--accent2)" }}>
              {(eveBalance / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 })} EVE
            </span>
          </label>
        </div>

        <div className="form-group">
          <label className="form-label">Amount (EVE)</label>
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

        {error && (
          <p className="error-text" style={{ fontSize: "0.85rem" }}>{error}</p>
        )}

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={handleDeposit}
            disabled={loading || !amount || parseFloat(amount) <= 0}
          >
            {loading ? "Depositing..." : "Deposit"}
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
