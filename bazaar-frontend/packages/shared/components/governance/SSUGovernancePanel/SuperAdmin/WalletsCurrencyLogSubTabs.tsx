// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * WalletsCurrencyLogSubTabs — R6.6.4b OS-32
 *
 * SSUWalletsSubTab:
 *   Withdraw from tax wallet — active (buildWithdrawSSUTax).
 *   OS-39: Deposit to tax wallet — HIDDEN (deposit_ssu_tax is public(package) only;
 *   no external entry fn in BazaarCore. Re-enable when OS-39 Move fn ships).
 *
 * SSUCurrencyLogSubTab:
 *   SSU wallet TX event log table. Bazar1 reference: lines 1684-1782.
 *
 * TX_TYPE_LABEL + formatTribe — co-located per FA §2.1.
 *   Bazar1 reference: lines 2042-2055.
 *
 * "BAZ" currency literals replaced with "EVE" per CEF deliverable.
 *
 * Article XIV.2 exemption: adapted from Bazar1.
 * File limit: 500 lines | Constitution Article XIV.4
 *
 * ── EVE vs Tribe-Token currency split — INTERSECTION NOTICE ─────────────────
 * `SSUGovernance.tax_wallet` is `Balance<EVE>`. It is populated ONLY by NoTribe
 * + Easy shop ops (BazaarCore `shop_ops_{wts,wtb,de}::*` → `ssu_treasury::deposit_ssu_tax`).
 *
 * Advanced bazaars do NOT credit this wallet. Instead, BazaarEconomy
 * `ledger_shop_ops::*` credits the SSU's tax revenue as a tribe-token
 * ledger row keyed by `ssu_governance::ssu_id(ssu_gov)` (see
 * `ledger_shop_ops.move:150-153 / 238-241`). Redemption back to EVE goes
 * through `ledger_shop_ops::withdraw_ssu_tax_credits` (line 349).
 *
 * On Advanced bazaars the EVE displays here will always show 0 — the
 * Wallets sub-tab is gated below to surface this clearly instead of
 * showing misleading EVE controls. WIRING TODO: an Advanced-side
 * "Tribe Token Tax Credits" panel + `withdraw_ssu_tax_credits` button
 * (not in scope this dispatch).
 */

import React, { useState } from "react";
import { dAppKit, abbreviateAddress, useConnection } from "@evefrontier/dapp-kit";
import { buildWithdrawSSUTax } from "@bazaar/shared/tx/bazaarcore/ssu-governance-tx";
import { buildDepositSSUTaxExternal } from "@bazaar/shared/tx/bazaarcore/ssu-treasury-tx";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import { Transaction } from "@mysten/sui/transactions";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";
import type { SsuWalletTransaction } from "@bazaar/shared/hooks/useSSUGovernance";
import { AdvancedSSUWalletPanel } from "./AdvancedSSUWalletPanel";

// ── Module-level constants (co-located with their consumer per FA §2.1) ────────

/**
 * TX_TYPE_LABEL — maps SsuWalletTransaction.txType to human-readable label.
 * Bazar1 reference: lines 2042-2051.
 */
const TX_TYPE_LABEL: Record<number, string> = {
  0: "WTB Deposit",
  1: "WTB Payout",
  2: "Tax Transfer",
  3: "WTB Refund",
  4: "WTS Surcharge",
  5: "DE Surcharge",
  6: "Owner Withdrawal",
  7: "Manual Deposit",
};

/**
 * formatTribe — formats a raw bigint balance to a 4-decimal EVE display string.
 * Bazar1 reference: lines 2053-2055.
 * "BAZ" → "EVE" per CEF deliverable.
 */
function formatTribe(raw: bigint): string {
  return (Number(raw) / COIN_DECIMALS).toFixed(4);
}

// ── Prop types ─────────────────────────────────────────────────────────────────

interface SSUWalletsSubTabProps {
  ssuId: string;
  ownerCapId: string | null;
  hasOwnerCap: boolean;
  superAdminCapId: string | null;
  hasSuperAdminCap: boolean;
  taxWalletBalance: bigint;
  depositWalletBalance: bigint;
  /** senderAddress — wallet address for buildWithdrawSSUTax PTB transfer step. */
  senderAddress: string;
  /** ssuGovId — SSUGovernance shared object ID; required by buildDepositSSUTaxExternal. */
  ssuGovId: string;
  /**
   * isAdvanced — when true, this SSU's bazaar_type == 2 (Advanced) and the EVE
   * tax_wallet shown here is always 0 by design. See header notice.
   */
  isAdvanced: boolean;
  onRefetch: () => void;
}

interface SSUCurrencyLogSubTabProps {
  walletTransactions: SsuWalletTransaction[];
}

// ── SSUWalletsSubTab ───────────────────────────────────────────────────────────
//
// Bazar1 reference: lines 2057-2240.
// Drift: buildWithdrawSSUTax replaces buildWithdrawSsuTaxWallet (paramshape rename +
//        senderAddress added for PTB transfer step).
// OS-39: Deposit form section HIDDEN — deposit_ssu_tax is public(package) only;
//         no public entry fn for external deposits in BazaarCore.
//         Module-level comment above documents the Move-side gap.

export function SSUWalletsSubTab({
  ssuId,
  ownerCapId,
  hasOwnerCap,
  taxWalletBalance,
  depositWalletBalance,
  senderAddress,
  ssuGovId,
  isAdvanced,
  onRefetch,
}: SSUWalletsSubTabProps) {
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [loading, setLoading] = useState("");

  // Advanced bazaars route SSU tax through bazaar_economy::ledger_shop_ops →
  // tribe-token ledger row keyed on ssu_addr. Render the real ledger balance
  // here. Withdraw / Deposit dialogs are gated on V26 (new ledger entries
  // bazaar_economy::ledger_shop_ops::{transfer_ssu_credit_to_player,
  // deposit_to_ssu_credit}). Until V26 ships, buttons are disabled with a tip.
  if (isAdvanced) {
    return (
      <AdvancedSSUWalletPanel
        ssuId={ssuId}
        ssuGovId={ssuGovId}
        hasOwnerCap={hasOwnerCap}
        ssuOwnerCapId={ownerCapId}
      />
    );
  }

  async function doWithdraw() {
    if (!ownerCapId || !withdrawAmount || !senderAddress) return;
    const raw = Math.floor(parseFloat(withdrawAmount) * COIN_DECIMALS);
    if (!raw || raw <= 0) return;
    setLoading("withdraw");
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildWithdrawSSUTax({
          ownerCapId,
          ssuGovId: ssuId,
          amount: raw,
          senderAddress,
        }),
      });
      setWithdrawAmount("");
      onRefetch();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? "Transaction failed");
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="panel__section">

      {/* ── Balances ── */}
      <div className="action-card">
        <h4>SSU Wallet Balances</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
          <div>
            <span className="muted" style={{ fontSize: "0.75rem", display: "block" }}>Tax Wallet</span>
            <span style={{ fontSize: "1.1rem", fontFamily: "var(--font-display)", color: "var(--accent2)" }}>
              {formatTribe(taxWalletBalance)} EVE
            </span>
            <span className="muted" style={{ fontSize: "0.72rem" }}>Surcharge revenue</span>
          </div>
          <div>
            <span className="muted" style={{ fontSize: "0.75rem", display: "block" }}>Deposit Wallet</span>
            <span style={{ fontSize: "1.1rem", fontFamily: "var(--font-display)", color: "var(--accent2)" }}>
              {formatTribe(depositWalletBalance)} EVE
            </span>
            <span className="muted" style={{ fontSize: "0.72rem" }}>WTB escrow</span>
          </div>
        </div>
      </div>

      {/* ── Withdraw (Owner only) ── */}
      <div className="action-card" style={{ marginTop: "1rem" }}>
        <h4>Withdraw from Tax Wallet</h4>
        {!hasOwnerCap ? (
          <p className="muted" style={{ fontSize: "0.78rem" }}>
            SSU Owner cap required to withdraw.
          </p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: "0.78rem" }}>
              Withdraws EVE from the tax wallet to your wallet.
            </p>
            <div className="form-row" style={{ marginTop: "0.5rem" }}>
              <input
                className="input input--xs"
                type="number"
                min="0"
                step="0.0001"
                placeholder="Amount (EVE)"
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
                style={{ width: "10rem" }}
              />
              <button
                className="btn btn--primary btn--sm"
                disabled={
                  !ownerCapId ||
                  !withdrawAmount ||
                  parseFloat(withdrawAmount) <= 0 ||
                  loading === "withdraw" ||
                  taxWalletBalance === 0n
                }
                onClick={doWithdraw}
              >
                {loading === "withdraw" ? "Withdrawing..." : "Withdraw"}
              </button>
            </div>
            {taxWalletBalance === 0n && (
              <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.35rem" }}>
                Tax wallet is empty.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── OS-39: Deposit to Tax Wallet (permissionless) ── */}
      <DepositTaxForm ssuGovId={ssuGovId} onRefetch={onRefetch} />

    </div>
  );
}

// ── DepositTaxForm (OS-39) ────────────────────────────────────────────────────

interface DepositTaxFormProps {
  ssuGovId: string;
  onRefetch: () => void;
}

function DepositTaxForm({ ssuGovId, onRefetch }: DepositTaxFormProps) {
  const [amount,  setAmount]  = useState("");
  const [loading, setLoading] = useState(false);
  const { walletAddress } = useConnection();

  async function doDeposit() {
    if (!ssuGovId || !amount) return;
    const raw = Math.floor(parseFloat(amount) * COIN_DECIMALS);
    if (!raw || raw <= 0) return;
    if (!walletAddress) { alert("Wallet not connected."); return; }
    setLoading(true);
    const tx = new Transaction();
    let split;
    try {
      split = await splitEveCoin(walletAddress, BigInt(raw), tx);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Insufficient EVE balance.");
      setLoading(false);
      return;
    }
    try {
      buildDepositSSUTaxExternal({ ssuGovId, amount: raw, eveCoin: split.coinArg }, tx);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setAmount("");
      onRefetch();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="action-card" style={{ marginTop: "1rem" }}>
      <h4>Deposit to Tax Wallet (OS-39)</h4>
      <p className="muted" style={{ fontSize: "0.78rem" }}>
        Permissionless external deposit. Any wallet can donate EVE to this SSU&apos;s
        tax wallet. SSU must be active and not frozen.
      </p>
      <div className="form-row" style={{ marginTop: "0.5rem" }}>
        <input
          className="input input--xs"
          type="number"
          min="0"
          step="0.0001"
          placeholder="Amount (EVE)"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{ width: "10rem" }}
        />
        <button
          className="btn btn--primary btn--sm"
          disabled={!ssuGovId || !amount || parseFloat(amount) <= 0 || loading}
          onClick={doDeposit}
        >
          {loading ? "Depositing..." : "Deposit"}
        </button>
      </div>
    </div>
  );
}

// ── SSUCurrencyLogSubTab ───────────────────────────────────────────────────────
//
// Bazar1 reference: lines 1684-1782.
// "BAZ" → "EVE" in amount column per CEF deliverable.

type CurrencyWalletFilter = 0 | 1; // 0 = deposit_wallet, 1 = tax_wallet

export function SSUCurrencyLogSubTab({ walletTransactions }: SSUCurrencyLogSubTabProps) {
  const [logFilter, setLogFilter] = useState<CurrencyWalletFilter>(1);

  const filteredTxs = walletTransactions.filter(t => t.walletType === logFilter);

  return (
    <div className="action-card">
      <h4>Currency Transaction Log</h4>

      <div className="form-row" style={{ marginBottom: "0.75rem" }}>
        <button
          className={`btn btn--sm ${logFilter === 1 ? "btn--primary" : "btn--ghost"}`}
          onClick={() => setLogFilter(1)}
        >
          Tax Wallet
        </button>
        <button
          className={`btn btn--sm ${logFilter === 0 ? "btn--primary" : "btn--ghost"}`}
          onClick={() => setLogFilter(0)}
        >
          Deposit Wallet
        </button>
      </div>

      {filteredTxs.length === 0 ? (
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          No transactions recorded for this wallet yet.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ fontSize: "0.75rem", minWidth: 560 }}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Dir</th>
                <th>Amount</th>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Shop</th>
              </tr>
            </thead>
            <tbody>
              {filteredTxs.map((tx, i) => (
                <tr key={`${tx.digest}-${i}`}>
                  <td style={{ whiteSpace: "nowrap", fontSize: "0.7rem" }}>
                    {tx.timestampMs ? new Date(tx.timestampMs).toLocaleString() : "—"}
                  </td>
                  <td>
                    <span
                      style={{
                        color: tx.direction === 0 ? "var(--success)" : "var(--muted)",
                        fontWeight: "bold",
                        fontSize: "0.7rem",
                      }}
                    >
                      {tx.direction === 0 ? "IN" : "OUT"}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {formatTribe(tx.amount)} EVE
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {TX_TYPE_LABEL[tx.txType] ?? `Type ${tx.txType}`}
                  </td>
                  <td>
                    <span className="muted" title={tx.fromAddr}>
                      {abbreviateAddress(tx.fromAddr)}
                    </span>
                  </td>
                  <td>
                    <span className="muted" title={tx.toAddr}>
                      {abbreviateAddress(tx.toAddr)}
                    </span>
                  </td>
                  <td>
                    {tx.shopId ? (
                      <span className="muted" title={tx.shopId} style={{ fontSize: "0.7rem" }}>
                        {tx.shopId.slice(0, 8)}...
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ fontSize: "0.72rem", marginTop: "0.5rem" }}>
        Showing up to 50 most recent events. Events are filtered client-side from the global event log.
      </p>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
