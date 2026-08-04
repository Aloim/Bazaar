// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V26 D6 — Advanced DirectTrade create form. Currency-only in v1 (EVE +
// tribe-token). Items deferred to V27.

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import { formatTribeAmount, parseTribeAmountSafe } from "@bazaar/shared/utils/tribeToken";
import { buildProposeAdvancedTrade } from "@bazaar/shared/tx/bazaareconomy/advanced-direct-trade-tx";

interface CreateTradeTabProps {
  registryId: string;
  ssuGovId: string;
  tribeGovId?: string;   // V36 R-C: TribeGovernance for ban/binding checks
  ledgerId: string;
  tokenSymbol: string;
  tokenDecimals: number;
  myAddress: string;
  myTribeBalanceScaled: bigint;
  onSuccess: () => void;
}

const HOUR_MS = 3_600_000;

function parseEveMist(input: string): { ok: true; value: bigint } | { ok: false; reason: string } {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, value: 0n };
  if (!/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) return { ok: false, reason: "invalid number" };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return { ok: false, reason: "negative or NaN" };
  return { ok: true, value: BigInt(Math.round(n * COIN_DECIMALS)) };
}

export default function CreateTradeTab({
  registryId, ssuGovId, tribeGovId, ledgerId, tokenSymbol, tokenDecimals,
  myAddress, myTribeBalanceScaled, onSuccess,
}: CreateTradeTabProps) {
  const [receiver, setReceiver] = useState("");
  const [offerEve, setOfferEve] = useState("0");
  const [offerTok, setOfferTok] = useState("0");
  const [requestEve, setRequestEve] = useState("0");
  const [requestTok, setRequestTok] = useState("0");
  const [expiryHours, setExpiryHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!receiver.trim().startsWith("0x") || receiver.trim().length < 10) {
      setErr("Recipient must be a 0x… address.");
      return;
    }
    if (receiver.trim() === myAddress) {
      setErr("Cannot trade with yourself.");
      return;
    }
    const oe = parseEveMist(offerEve);
    if (!oe.ok) { setErr(`Offer EVE: ${oe.reason}`); return; }
    const re = parseEveMist(requestEve);
    if (!re.ok) { setErr(`Request EVE: ${re.reason}`); return; }
    const ot = parseTribeAmountSafe(offerTok, tokenDecimals);
    if (!ot.ok) { setErr(`Offer ${tokenSymbol}: ${ot.reason}`); return; }
    const rt = parseTribeAmountSafe(requestTok, tokenDecimals);
    if (!rt.ok) { setErr(`Request ${tokenSymbol}: ${rt.reason}`); return; }
    if (oe.value === 0n && ot.value === 0n && re.value === 0n && rt.value === 0n) {
      setErr("Trade is empty — set at least one offer or request amount.");
      return;
    }
    if (ot.value > myTribeBalanceScaled) {
      const haveDisplay = formatTribeAmount(myTribeBalanceScaled, { decimals: tokenDecimals, symbol: tokenSymbol });
      setErr(`Insufficient ${tokenSymbol} balance — you have ${haveDisplay}.`);
      return;
    }
    setBusy(true);
    try {
      const tx = new Transaction();
      buildProposeAdvancedTrade({
        registryId, ssuGovId, tribeGovId, ledgerId,
        receiver: receiver.trim(),
        offerEveMist: oe.value,
        offerTokensScaled: ot.value,
        requestEveMist: re.value,
        requestTokensScaled: rt.value,
        expiryMs: BigInt(Date.now() + expiryHours * HOUR_MS),
      }, tx);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setReceiver(""); setOfferEve("0"); setOfferTok("0"); setRequestEve("0"); setRequestTok("0");
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adv-trade-create">
      <div className="form-row">
        <label>Recipient address</label>
        <input value={receiver} onChange={e => setReceiver(e.target.value)} placeholder="0x…" />
      </div>

      <fieldset className="form-fieldset">
        <legend>You offer</legend>
        <div className="form-row">
          <label>EVE</label>
          <input value={offerEve} onChange={e => setOfferEve(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-row">
          <label>{tokenSymbol}</label>
          <input value={offerTok} onChange={e => setOfferTok(e.target.value)} inputMode="decimal" />
          <span className="muted small">
            Balance: {formatTribeAmount(myTribeBalanceScaled, { decimals: tokenDecimals, symbol: tokenSymbol })}
          </span>
        </div>
      </fieldset>

      <fieldset className="form-fieldset">
        <legend>You request</legend>
        <div className="form-row">
          <label>EVE</label>
          <input value={requestEve} onChange={e => setRequestEve(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-row">
          <label>{tokenSymbol}</label>
          <input value={requestTok} onChange={e => setRequestTok(e.target.value)} inputMode="decimal" />
        </div>
      </fieldset>

      <div className="form-row">
        <label>Expires in (hours)</label>
        <input
          type="number" min={1} max={168}
          value={expiryHours}
          onChange={e => setExpiryHours(Math.max(1, Math.min(168, Number(e.target.value) || 24)))}
        />
      </div>

      {err && <div className="form-error" role="alert">{err}</div>}

      <button className="btn btn--primary" disabled={busy} onClick={submit}>
        {busy ? "Submitting…" : "Propose Trade"}
      </button>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
