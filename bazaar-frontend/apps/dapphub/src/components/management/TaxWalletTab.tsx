// TaxWalletTab.tsx — View and withdraw from the DApp tax wallet.
// Reads real DAppTaxWallet on-chain data. Withdrawal uses buildWithdrawDAppTax TX builder.

import { useState } from "react";
import { useConnection, dAppKit } from "@evefrontier/dapp-kit";
import { useTaxWallet } from "@bazaar/shared/hooks";
import { buildWithdrawDAppTax } from "@bazaar/shared/tx";

interface Props {
  ownerCapId: string | null;
}

interface StatusMsg {
  ok: boolean;
  msg: string;
}

// DAppTaxWallet holds Balance<EVE> (Move: DappHub/sources/tax_wallet.move).
// EVE has 9 decimals (same as SUI), so the precision constant value is unchanged
// from the prior "SUI" labelling — only the unit name was wrong.
const MIST_PER_EVE = 1_000_000_000;

function eveDisplay(mist: number): string {
  return (mist / MIST_PER_EVE).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
    </div>
  );
}

export default function TaxWalletTab({ ownerCapId }: Props) {
  const { walletAddress } = useConnection();
  const { data, isLoading, error, refetch } = useTaxWallet();

  const [withdrawInput, setWithdrawInput] = useState("");
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  async function handleWithdraw() {
    const amount = parseFloat(withdrawInput);
    if (isNaN(amount) || amount <= 0) {
      setStatus({ ok: false, msg: "Enter a positive amount." });
      return;
    }
    const amountMist = Math.round(amount * MIST_PER_EVE);
    if (data && amountMist > data.balance) {
      setStatus({ ok: false, msg: `Insufficient balance. Available: ${eveDisplay(data.balance)} EVE.` });
      return;
    }

    setWithdrawing(true);
    setStatus(null);

    try {
      const tx = buildWithdrawDAppTax(ownerCapId ?? "", amountMist, walletAddress ?? "");
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") {
        throw new Error("Transaction failed. Ensure you hold the DAppOwnerCap.");
      }
      setStatus({ ok: true, msg: `Withdrawn ${amount.toFixed(4)} EVE to your wallet.` });
      setWithdrawInput("");
      setTimeout(() => refetch(), 1500);
    } catch (e: unknown) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : "Withdrawal failed." });
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="panel__section">
      <div className="action-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4>DApp Tax Wallet</h4>
          <button className="btn btn--ghost btn--sm" onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? "..." : "Refresh"}
          </button>
        </div>

        {error && <p className="error-text">Error loading wallet data.</p>}
        {isLoading && <p className="muted">Loading wallet data...</p>}

        {data && !isLoading && (
          <div className="stats-row">
            <Stat label="Current Balance" value={`${eveDisplay(data.balance)} EVE`} />
            <Stat label="Total Collected" value={`${eveDisplay(data.totalCollected)} EVE`} />
            <Stat label="Total Withdrawn" value={`${eveDisplay(data.totalWithdrawn)} EVE`} />
            <Stat label="Deposit Count" value={String(data.depositCount)} />
          </div>
        )}
      </div>

      <div className="action-card">
        <h4>Withdraw Funds</h4>
        <p className="form-hint">
          Withdraw EVE from the DApp tax wallet to your connected wallet.
        </p>
        <div className="form-row">
          <input
            className="input input--sm"
            type="number"
            min="0.000000001"
            step="0.001"
            value={withdrawInput}
            onChange={e => setWithdrawInput(e.target.value)}
            placeholder="Amount in EVE"
            style={{ width: "160px" }}
          />
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>EVE</span>
          <button
            className="btn btn--primary btn--sm"
            disabled={withdrawing || !withdrawInput.trim() || Number(withdrawInput) <= 0}
            onClick={handleWithdraw}
          >
            {withdrawing ? "..." : "Withdraw"}
          </button>
          {data && !isLoading && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setWithdrawInput((data.balance / MIST_PER_EVE).toString())}
            >
              Max
            </button>
          )}
        </div>
        {status && (
          <p style={{ fontSize: "0.8rem", color: status.ok ? "var(--success)" : "var(--danger)" }}>
            {status.msg}
          </p>
        )}
      </div>
    </div>
  );
}
