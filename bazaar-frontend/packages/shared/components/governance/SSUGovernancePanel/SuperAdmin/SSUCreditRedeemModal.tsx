// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * SSUCreditRedeemModal — SSU tax-credit → EVE redemption (Phase 6 W6,
 * AUD-ADV-19 / LEAD-03 close-out).
 *
 * First UI consumer of buildWithdrawSSUTaxCredits. Calls
 * bazaar_economy::ledger_shop_ops::withdraw_ssu_tax_credits (:419-467):
 * SSUOwnerCap-gated, BURNS the redeemed tokens (supply decreases), pays EVE
 * from the TribeVault to the caller's wallet, reserve floor enforced.
 *
 * RATE WARNING (AUD-ADV-07, intentional Move behavior): redemption prices at
 * the LEGACY exchange_rate_scaled — (vault − reserve) / TOTAL SUPPLY — which
 * differs from the V28 wallet-stock rate players get on Exchange swaps.
 * Whenever the tribe wallet holds less than the full supply, redemption pays
 * LESS per token than a swap (vault-favorable). The quote panel shows both
 * numbers so the owner can choose the better route deliberately.
 */

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { buildWithdrawSSUTaxCredits } from "@bazaar/shared/tx/bazaareconomy/ledger-shop-tx";
import {
  quoteLegacyRedeemEveOut,
  quoteTokensToEveV28,
} from "@bazaar/shared/utils/exchangeQuotes";
import {
  formatTribeAmount,
  parseTribeAmountSafe,
} from "@bazaar/shared/utils/tribeToken";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import { Z } from "@bazaar/shared/constants/zIndex";

interface SSUCreditRedeemModalProps {
  ssuGovId:      string;
  ssuOwnerCapId: string;
  ledgerId:      string;
  vaultId:       string;
  configId:      string;
  /** SSU tax row balance, raw scaled token units. */
  ssuBalance:    number;
  /** Pool reads for the quote (from useTribeExchange). */
  vaultEveBalance: number;
  reserveMist:     number;
  totalSupply:     number;
  tribeWalletBalance: number;
  tokenSymbol:   string;
  decimals:      number;
  onClose:       () => void;
  onSuccess:     () => void;
}

const fmtEve = (raw: bigint) => {
  const eve = Number(raw) / COIN_DECIMALS;
  if (eve === 0) return "0.0000";
  if (eve >= 0.0001) return eve.toFixed(4);
  return eve.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
};

export default function SSUCreditRedeemModal({
  ssuGovId, ssuOwnerCapId, ledgerId, vaultId, configId,
  ssuBalance, vaultEveBalance, reserveMist, totalSupply, tribeWalletBalance,
  tokenSymbol, decimals,
  onClose, onSuccess,
}: SSUCreditRedeemModalProps) {
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState<string | null>(null);

  const parsed = parseTribeAmountSafe(amountStr, decimals);
  const tokens = parsed.ok && parsed.value > 0n ? parsed.value : 0n;

  const legacyPool = {
    eveBalance:  BigInt(Math.floor(vaultEveBalance)),
    reserveMist: BigInt(Math.floor(reserveMist)),
    totalSupply: BigInt(Math.floor(totalSupply)),
  };
  const eveOut = quoteLegacyRedeemEveOut(legacyPool, tokens);
  // Comparison quote: what the SAME tokens fetch on the Exchange (V28 rate,
  // pre-fee) — surfaced so the divergence is visible, per AUD-ADV-07.
  const swapEveOut = quoteTokensToEveV28(
    {
      eveBalance:         legacyPool.eveBalance,
      reserveMist:        legacyPool.reserveMist,
      tribeWalletBalance: BigInt(Math.floor(tribeWalletBalance)),
    },
    tokens,
    0,
  );

  const overBalance = tokens > BigInt(ssuBalance);
  const reserveBlocked = tokens > 0n && eveOut === 0n;
  const canSubmit = tokens > 0n && !overBalance && eveOut > 0n && !busy;

  async function handleSubmit() {
    setErr(null);
    if (!parsed.ok) { setErr(`Invalid amount: ${parsed.reason}`); return; }
    if (tokens <= 0n) { setErr("Enter a positive amount."); return; }
    if (overBalance) {
      setErr(`Amount exceeds SSU credit balance (${formatTribeAmount(ssuBalance, { decimals })} ${tokenSymbol}).`);
      return;
    }
    setBusy(true);
    try {
      const tx = buildWithdrawSSUTaxCredits({
        ownerCapId: ssuOwnerCapId,
        ssuGovId,
        ledgerId,
        vaultId,
        configId,
        tokenAmount: tokens,
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      window.dispatchEvent(new Event("bazar-soft-refresh"));
      onSuccess();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: Z.MODAL_2,
      }}
    >
      <div
        className="panel modal-card"
        style={{ width: "min(520px, 92vw)", maxHeight: "92vh", overflowY: "auto", padding: "1.25rem" }}
      >
        <h3 className="panel__heading" style={{ marginTop: 0 }}>Redeem Tax Credits for EVE</h3>
        <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          Burns tribe tokens from this SSU&apos;s tax row and pays EVE from the
          Tribe Vault to your wallet. Authority: <strong>SSUOwnerCap</strong>.
          Available: <strong>{formatTribeAmount(ssuBalance, { decimals })} {tokenSymbol}</strong>.
        </p>

        <div
          style={{
            border: "1px solid var(--color-warn, #f5a623)",
            borderRadius: 4,
            padding: "0.6rem 0.75rem",
            marginBottom: "0.9rem",
            fontSize: "0.76rem",
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: "var(--color-warn, #f5a623)" }}>Rate notice:</strong>{" "}
          redemption uses the ledger rate (vault ÷ <em>total supply</em>), NOT the
          Exchange swap rate (vault ÷ tribe-wallet stock). When the tribe wallet
          holds less than the full supply, an Exchange swap pays more per token —
          compare the two quotes below. Redeemed tokens are <strong>burned</strong>.
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="form-label">Amount ({tokenSymbol})</label>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              value={amountStr}
              onChange={e => setAmountStr(e.target.value)}
              placeholder={`Up to ${formatTribeAmount(ssuBalance, { decimals })}`}
              style={{ flex: 1 }}
              disabled={busy}
            />
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              disabled={busy || ssuBalance === 0}
              onClick={() => setAmountStr(formatTribeAmount(ssuBalance, { decimals, noGrouping: true }))}
            >
              Max
            </button>
          </div>
        </div>

        {tokens > 0n && !overBalance && (
          <div className="action-card" style={{ marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
              <span className="muted">Redemption pays (ledger rate)</span>
              <strong style={{ color: "var(--accent2)" }}>{fmtEve(eveOut)} EVE</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem", marginTop: "0.25rem" }}>
              <span className="muted">Same tokens via Exchange swap (pre-fee)</span>
              <span className="muted">{fmtEve(swapEveOut)} EVE</span>
            </div>
            {reserveBlocked && (
              <p style={{ color: "var(--color-danger, #f44336)", fontSize: "0.76rem", marginTop: "0.4rem" }}>
                The vault cannot cover this redemption without breaching its
                reserve floor — try a smaller amount.
              </p>
            )}
          </div>
        )}
        {overBalance && (
          <p style={{ color: "var(--color-danger, #f44336)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
            Amount exceeds the SSU credit balance.
          </p>
        )}
        {err && (
          <p style={{ color: "var(--color-danger, #f44336)", margin: "0 0 0.5rem 0", fontSize: "0.85rem" }}>
            {err}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {busy ? "Redeeming…" : "Redeem for EVE"}
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
