// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// ExchangeWindow.tsx — Floating panel for TribeToken <-> EVE swaps.
// Uses useTribeExchange for real-time AMM quotes.
// dAppKit.signAndExecuteTransaction for all writes.
//
// V16 sweep B2 (2026-05-13): retired `useDAppTreasury` (read fictional fields
// off a non-existent `DAppTreasury` object). Effective swap fee is now derived
// from the canonical V15+ Move resolution — per-tribe `ExchangeConfig
// .exchange_fee_override_bps` if set, otherwise the dApp-global
// `GovernanceConfig.global_dapp_tax_bps`. Mirrors `effective_fee_bps` in
// `bazaar_economy::tribe_exchange`.
//
// V20 / V26 evolution: tribe-token on-chain `decimals` was 0 in V20-V25 and is
// now 2 in V26+ (tribe_token_ledger.move:40,111). EVE remains 9 decimals. The
// FE used to scale every amount by COIN_DECIMALS regardless of currency, which
// rendered tribe-token supply + balance + user input wrong. V26 reads
// `ledger.decimals` via `useTribeTokenBalance` and routes tribe-token displays
// through `@bazaar/shared/utils/tribeToken` (formatTribeAmount + parseTribeAmount).
// EVE side keeps `fmtEve` (was `fmtBaz`) backed by COIN_DECIMALS.

import { useState, useMemo } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { AdvancedOnly } from "@bazaar/shared/components/BazaarFeature";
import { dAppKit, useConnection } from "@evefrontier/dapp-kit";
import { useTribeExchange } from "@bazaar/shared/hooks/useTribeExchange";
import { useExchangeConfig } from "@bazaar/shared/hooks/bazaareconomy/exchange-hooks";
import { useDAppTaxConfig, useBalances } from "@bazaar/shared/hooks";
import { useTribeTokenBalance } from "@bazaar/shared/hooks/bazaareconomy/ledger-hooks";
import { buildSwapEveToTokens, buildSwapTokensToEve } from "@bazaar/shared/tx/bazaareconomy/exchange-tx";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import {
  formatTribeAmount,
  parseTribeAmountSafe,
  TRIBE_TOKEN_DECIMALS,
} from "@bazaar/shared/utils/tribeToken";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** TribeTokenLedger shared object ID (from useTribeEconomyObjects). null when tribe economy not initialised. */
  ledgerId:          string | null;
  /** TribeVault shared object ID (from useTribeEconomyObjects). null when tribe economy not initialised. */
  vaultId:           string | null;
  /** ExchangeConfig shared object ID (from useTribeEconomyObjects). null when tribe economy not initialised. */
  configId:          string | null;
  /** TribeGovernance shared object ID (from useTribeGovId). null when tribe not bootstrapped. */
  tribeGovernanceId: string | null;
  /** Tribe token symbol (from useTribeTokenSymbol). null until Phase 12 wires; falls back to "TRIBE". */
  currencyName:      string | null;
  onClose:           () => void;
}

type SwapDirection = "eve_to_token" | "token_to_eve";

export default function ExchangeWindow({
  ledgerId, vaultId, configId, tribeGovernanceId, currencyName, onClose,
}: Props) {
  const { walletAddress } = useConnection();

  const exchange       = useTribeExchange(
    configId ?? "", vaultId ?? "", ledgerId ?? "", tribeGovernanceId ?? "",
  );
  const exchangeConfig = useExchangeConfig(configId);
  const dappTaxCfg     = useDAppTaxConfig();
  const tokenBalQ      = useTribeTokenBalance(ledgerId, walletAddress ?? null);
  const { eveBalance: userEveBalance, refetch: refetchEve } = useBalances();

  const [direction, setDirection] = useState<SwapDirection>("eve_to_token");
  const [amountInput, setAmountInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Effective swap fee — mirrors `bazaar_economy::tribe_exchange::effective_fee_bps`:
  // per-tribe `ExchangeConfig.exchange_fee_override_bps` if Some(v), otherwise
  // the per-type `advanced_exchange_dapp_tax_bps` (Phase 5, V36-gated; null on
  // live V35), otherwise the dApp-global `global_dapp_tax_bps`.
  const feeBps =
    exchangeConfig.data?.exchangeFeeOverrideBps ??
    dappTaxCfg.data?.advancedExchangeDappBps ??
    dappTaxCfg.data?.globalTaxBps ??
    0;
  const symbol = currencyName ?? "TRIBE";
  const tokenBalance = tokenBalQ.data?.balance ?? 0;
  const tokenDecimals = tokenBalQ.data?.decimals ?? TRIBE_TOKEN_DECIMALS;

  // V26+ — user types display amount ("5", "1.50", "1,234.56"). Parse to scaled
  // bigint via parseTribeAmountSafe, then convert to Number for the AMM hook +
  // Move-call arg (both expect raw scaled u64). Negative / over-precision input
  // yields `parsed.ok === false` and an `inputError` string for the UI.
  const inputParsed = useMemo(
    () => parseTribeAmountSafe(amountInput, tokenDecimals),
    [amountInput, tokenDecimals],
  );
  const inputAmount = useMemo(() => {
    if (!inputParsed.ok) return 0;
    return inputParsed.value <= 0n ? 0 : Number(inputParsed.value);
  }, [inputParsed]);
  // V26 D8 polish: bigint form used for the Move-call arg path so amounts past
  // 2^53 scaled units (= 90 trillion display tokens at decimals=2) don't lose
  // precision. The `inputAmount` number above is retained for UI math + AMM
  // quotes which remain in JS-number arithmetic.
  const inputAmountBigInt = useMemo(() => {
    if (!inputParsed.ok) return 0n;
    return inputParsed.value <= 0n ? 0n : inputParsed.value;
  }, [inputParsed]);
  const inputError =
    amountInput && !inputParsed.ok ? `Invalid amount: ${inputParsed.reason}` : null;

  // estimatedOutput meaning depends on direction:
  //   Buy  (eve_to_token): EVE (MIST) the user must pay for `inputAmount` tokens
  //   Sell (token_to_eve): EVE (MIST) the user receives for burning `inputAmount` tokens
  const estimatedOutput = useMemo(() => {
    if (inputAmount <= 0) return 0;
    if (direction === "eve_to_token") {
      return exchange.quoteEveCostForTokens(inputAmount, feeBps);
    } else {
      return exchange.quoteTokensToEve(inputAmount, feeBps);
    }
  }, [direction, inputAmount, exchange, feeBps]);

  const priceImpact = useMemo(() => {
    const available = exchange.eveBalance - exchange.reserveMist;
    if (inputAmount <= 0 || available <= 0) return 0;
    if (direction === "eve_to_token") {
      // For Buy, impact is EVE cost vs available pool depth.
      if (estimatedOutput <= 0) return 0;
      return (estimatedOutput / (available + estimatedOutput)) * 100;
    } else {
      // V28: sold tokens return to the tribe wallet — depth is the wallet
      // stock, not total supply (AUD-ADV-18 denominator fix).
      return (inputAmount / (exchange.tribeWalletBalance + inputAmount)) * 100;
    }
  }, [direction, inputAmount, estimatedOutput, exchange]);

  const idsReady =
    !!ledgerId && !!vaultId && !!configId && !!tribeGovernanceId && !!walletAddress;

  async function handleSwap() {
    if (inputAmount <= 0 || !exchange.isActive) return;
    if (!idsReady) {
      setResult({ ok: false, msg: "Exchange not yet initialised for this tribe." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const tx = new Transaction();
      if (direction === "eve_to_token") {
        // Buy: user typed token count; estimatedOutput is the EVE (MIST) cost.
        // Send exactly the quoted EVE so Move-side delivers ~inputAmount tokens
        // (subject to standard AMM slippage between quote-time and exec-time).
        const eveCostMist = estimatedOutput;
        if (eveCostMist <= 0) {
          setResult({ ok: false, msg: "Unable to quote — pool may be empty." });
          return;
        }
        let split;
        try {
          split = await splitEveCoin(walletAddress!, BigInt(eveCostMist), tx);
        } catch (e: unknown) {
          setResult({
            ok: false,
            msg: e instanceof Error ? e.message : "Insufficient EVE balance.",
          });
          return;
        }
        buildSwapEveToTokens(
          {
            ledgerId:         ledgerId!,
            vaultId:          vaultId!,
            configId:         configId!,
            tribeGovernanceId: tribeGovernanceId!,
            paymentAmountMist: eveCostMist,
            paymentCoin:      split.coinArg,
          },
          tx,
        );
      } else {
        buildSwapTokensToEve(
          {
            ledgerId:          ledgerId!,
            vaultId:           vaultId!,
            configId:          configId!,
            tribeGovernanceId: tribeGovernanceId!,
            // V26 D8 polish: bigint path (precision-safe past 2^53 scaled units).
            tokensToBurn:      inputAmountBigInt,
          },
          tx,
        );
      }
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setResult({ ok: true, msg: "Swap successful!" });
      setAmountInput("");
      exchange.refetch();
      tokenBalQ.refetch();
      refetchEve();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ ok: false, msg });
    } finally {
      setBusy(false);
    }
  }

  // Smart EVE formatter. EVE has 9 decimals on Sui. In hyperinflated tribe
  // economies (supply ≫ available reserve) a 1-token swap costs only a few
  // thousand MIST — `.toFixed(4)` rounds that to "0.0000" and gives the
  // false impression the cost is zero. Show 4 decimals when the amount is at
  // least 0.0001 EVE (normal range), otherwise expand up to 9 decimals and
  // strip trailing zeros so micro-amounts remain readable.
  const fmtEve   = (raw: number) => {
    const eve = raw / COIN_DECIMALS;
    if (eve === 0) return "0.0000";
    if (eve >= 0.0001) return eve.toFixed(4);
    return eve.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
  };
  // V26+ — render tribe-token scaled units via formatTribeAmount (e.g. "100,000.00").
  const fmtToken = (raw: number) => formatTribeAmount(raw, { decimals: tokenDecimals });
  // Rate = EVE per 1 *display* token. `exchange.tokenPriceInEve` is MIST per 1
  // scaled token unit. Convert: MIST/scaled-unit × scaled-units-per-display-token
  // ÷ MIST-per-EVE = EVE/display-token. Equivalent: (mist × 10^decimals) / 1e9.
  const fmtRate  = (mistPerScaledUnit: number) =>
    (mistPerScaledUnit * Math.pow(10, tokenDecimals) / COIN_DECIMALS).toFixed(8);

  // After the Buy-tab rework, the user always types a TOKEN COUNT — the input
  // label is the same in both directions. The "output side" caption flips
  // meaning: for Buy it's the EVE cost; for Sell it's the EVE received.
  const inputLabel       = symbol;
  const outputCaption    = direction === "eve_to_token" ? "EVE cost" : "EVE you receive";
  const swapButtonLabel  = direction === "eve_to_token" ? `Buy ${symbol}` : `Sell ${symbol}`;

  return (
    <AdvancedOnly>
    <div className="panel" style={{ maxWidth: 480 }}>
      <div className="panel__header">
        <button className="btn btn--ghost btn--sm" onClick={onClose}>Back</button>
        <h2>Exchange</h2>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => { exchange.refetch(); exchangeConfig.refetch(); dappTaxCfg.refetch(); tokenBalQ.refetch(); refetchEve(); }}
          style={{ marginLeft: "auto" }}
        >
          Refresh
        </button>
      </div>

      <div className="panel__section">
        {/* Pool status */}
        {!exchange.isActive && (
          <div style={{
            background: "rgba(204,0,0,0.12)",
            border: "1px solid rgba(204,0,0,0.4)",
            borderRadius: "6px",
            padding: "0.6rem 0.8rem",
            marginBottom: "0.75rem",
            fontSize: "0.82rem",
            color: "#e88",
          }}>
            Exchange pool is currently disabled by the Tribe Leader.
          </div>
        )}

        {/* Direction toggle */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            className={`btn btn--sm ${direction === "eve_to_token" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => { setDirection("eve_to_token"); setAmountInput(""); setResult(null); }}
          >
            Buy {symbol}
          </button>
          <button
            className={`btn btn--sm ${direction === "token_to_eve" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => { setDirection("token_to_eve"); setAmountInput(""); setResult(null); }}
          >
            Sell {symbol}
          </button>
        </div>

        {/* Pool info */}
        <div className="stats-row" style={{ marginBottom: "1rem" }}>
          <div className="stat">
            <span className="stat__label">EVE Balance</span>
            <span className="stat__value">{fmtEve(exchange.eveBalance)}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Token Supply</span>
            <span className="stat__value">{fmtToken(exchange.totalSupply)}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Rate</span>
            <span className="stat__value">
              {exchange.tokenPriceInEve > 0
                ? `1 ${symbol} = ${fmtRate(exchange.tokenPriceInEve)} EVE`
                : "—"
              }
            </span>
          </div>
        </div>

        {/* User balances — shown for both Buy and Sell so the user can see what
            they own going in. EVE balance includes any locked / pending coins. */}
        <div style={{ display: "flex", gap: "1.25rem", marginBottom: "0.75rem", fontSize: "0.8rem", flexWrap: "wrap" }}>
          <span className="muted">
            Your EVE: <strong style={{ color: "var(--accent)" }}>{fmtEve(userEveBalance)}</strong>
          </span>
          <span className="muted">
            Your {symbol}: <strong style={{ color: "var(--accent)" }}>{fmtToken(tokenBalance)}</strong>
          </span>
        </div>

        {/* Amount input — always tribe tokens (integer), in both Buy and Sell.
            Buy → cost EVE shown below; Sell → received EVE shown below. */}
        <div style={{ marginBottom: "0.75rem" }}>
          <label style={{ fontSize: "0.78rem", color: "#aaa", display: "block", marginBottom: "0.3rem" }}>
            {direction === "eve_to_token"
              ? `${symbol} to buy`
              : `${symbol} to sell`}
          </label>
          <input
            className="input"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amountInput}
            onChange={e => { setAmountInput(e.target.value); setResult(null); }}
          />
          {inputError && (
            <p style={{ color: "var(--danger, #e55)", fontSize: "0.78rem", marginTop: "0.25rem" }}>
              {inputError}
            </p>
          )}
        </div>

        {/* Estimated output (cost or proceeds) */}
        {inputAmount > 0 && (
          <div className="action-card" style={{ marginBottom: "0.75rem", padding: "0.6rem 0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
              <span className="muted">{outputCaption}</span>
              <strong style={{ color: "var(--accent)" }}>
                {estimatedOutput > 0 ? `${fmtEve(estimatedOutput)} EVE` : "—"}
              </strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginTop: "0.3rem" }}>
              <span className="muted">Exchange fee</span>
              <span className="muted">{(feeBps / 100).toFixed(2)}% to dApp Tax Wallet</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginTop: "0.2rem" }}>
              <span className="muted">Price impact</span>
              <span style={{ color: priceImpact > 2 ? "var(--danger, #e55)" : "#aaa" }}>
                ~{priceImpact.toFixed(2)}%
              </span>
            </div>
            {direction === "eve_to_token" && estimatedOutput > 0 && estimatedOutput > userEveBalance && (
              <div style={{
                marginTop: "0.4rem",
                fontSize: "0.75rem",
                color: "var(--danger, #e55)",
                background: "rgba(204,0,0,0.08)",
                padding: "0.3rem 0.5rem",
                borderRadius: "4px",
              }}>
                Insufficient EVE: you need {fmtEve(estimatedOutput)} but hold {fmtEve(userEveBalance)}.
              </div>
            )}
            {direction === "token_to_eve" && inputAmount > tokenBalance && (
              <div style={{
                marginTop: "0.4rem",
                fontSize: "0.75rem",
                color: "var(--danger, #e55)",
                background: "rgba(204,0,0,0.08)",
                padding: "0.3rem 0.5rem",
                borderRadius: "4px",
              }}>
                Insufficient {symbol}: you want to sell {fmtToken(inputAmount)} but hold {fmtToken(tokenBalance)}.
              </div>
            )}
            {priceImpact > 2 && (
              <div style={{
                marginTop: "0.4rem",
                fontSize: "0.75rem",
                color: "var(--danger, #e55)",
                background: "rgba(204,0,0,0.08)",
                padding: "0.3rem 0.5rem",
                borderRadius: "4px",
              }}>
                High price impact! Consider swapping a smaller amount.
              </div>
            )}
          </div>
        )}

        {/* Swap button */}
        <button
          className="btn btn--primary"
          style={{ width: "100%" }}
          disabled={
            busy || !exchange.isActive || inputAmount <= 0 || exchange.loading || !idsReady ||
            estimatedOutput <= 0 ||
            (direction === "eve_to_token" && estimatedOutput > userEveBalance) ||
            (direction === "token_to_eve" && inputAmount > tokenBalance)
          }
          onClick={handleSwap}
        >
          {busy ? "Swapping..." : swapButtonLabel}
        </button>

        {result && (
          <div style={{
            marginTop: "0.75rem",
            padding: "0.5rem 0.75rem",
            borderRadius: "6px",
            fontSize: "0.82rem",
            background: result.ok ? "rgba(0,128,64,0.12)" : "rgba(204,0,0,0.12)",
            color: result.ok ? "#8f8" : "#e88",
            border: `1px solid ${result.ok ? "rgba(0,200,64,0.3)" : "rgba(200,0,0,0.3)"}`,
          }}>
            {result.msg}
          </div>
        )}
      </div>
    </div>
    </AdvancedOnly>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
