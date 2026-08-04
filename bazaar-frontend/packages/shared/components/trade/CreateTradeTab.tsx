// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * CreateTradeTab.tsx — Direct Trade creation form (shared primitive).
 *
 * Counterparty: address-only input (useUserSearch deferred to FP1-06).
 * Inventory: manual type-ID entry for I-Give and I-Get items.
 * EVE amounts entered as MIST (1 unit = 1 MIST) — no decimal-divisor conversion in MVP.
 *
 * bazaarType + tribeId are injected as props; shells pass the correct values:
 *   NoTribe  → bazaarType=0, tribeId=0
 *   Easy     → bazaarType=1, tribeId=<number>
 *   Advanced → bazaarType=2, tribeId=<number>
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useGatedTransaction } from "@bazaar/shared/hooks/announcements";
import { useSSUGovId } from "@bazaar/shared/hooks";
import { Transaction } from "@mysten/sui/transactions";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { buildCreateTradeProposal } from "@bazaar/shared/tx/bazaarcore/trade-tx";
import ItemRowEditor, { type ItemRow } from "./ItemRowEditor";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CreateTradeTabProps {
  myAddress:  string;
  ssuId:      string;
  bazaarType: 0 | 1 | 2;
  tribeId:    number;
  onSuccess:  () => void;
}

// ── CreateTradeTab ────────────────────────────────────────────────────────────

export default function CreateTradeTab({
  myAddress,
  ssuId,
  bazaarType,
  tribeId,
  onSuccess,
}: CreateTradeTabProps) {
  const { signGated } = useGatedTransaction();
  const [counterparty, setCounterparty] = useState("");
  const [giveItems,    setGiveItems]    = useState<ItemRow[]>([]);
  const [requestItems, setRequestItems] = useState<ItemRow[]>([]);
  const [giveEve,      setGiveEve]      = useState("0");
  const [requestEve,   setRequestEve]   = useState("0");
  const [expiryHours,  setExpiryHours]  = useState(24);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  const { walletAddress } = useConnection();
  const { data: ssuGovId } = useSSUGovId(ssuId ?? null);

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!counterparty.trim()) return "Counterparty address is required.";
    if (counterparty.trim() === myAddress) return "You cannot trade with yourself.";
    if (!counterparty.trim().startsWith("0x")) return "Counterparty must be a 0x... address.";

    const giveEveMist    = Number(giveEve);
    const requestEveMist = Number(requestEve);
    if (Number.isNaN(giveEveMist)    || giveEveMist    < 0) return "Give EVE amount must be >= 0.";
    if (Number.isNaN(requestEveMist) || requestEveMist < 0) return "Request EVE amount must be >= 0.";

    const hasGiveItems = giveItems.some(r => r.typeId > 0 && r.qty > 0);
    if (!hasGiveItems && giveEveMist === 0) {
      return "You must offer something (items with valid Type ID, or EVE > 0).";
    }

    const invalidGive    = giveItems.find(r => r.typeId <= 0 || r.qty <= 0);
    if (invalidGive) return "All I-Give items must have a Type ID > 0 and quantity >= 1.";

    const invalidRequest = requestItems.find(r => r.typeId <= 0 || r.qty <= 0);
    if (invalidRequest) return "All I-Get items must have a Type ID > 0 and quantity >= 1.";

    if (expiryHours < 1 || expiryHours > 168) return "Expiry must be between 1 and 168 hours.";
    return null;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError("");
    const giveEveMistNum = Math.round(Number(giveEve));
    if (!ssuGovId) { setError("SSU governance data not loaded yet. Please wait."); setLoading(false); return; }
    const tx = new Transaction();
    let eveSplit;
    try {
      eveSplit = await splitEveCoin(walletAddress!, BigInt(giveEveMistNum), tx);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Insufficient EVE balance.");
      setLoading(false);
      return;
    }
    try {
      const expiryMs = Date.now() + expiryHours * 60 * 60 * 1000;
      buildCreateTradeProposal({
        counterparty: counterparty.trim(),
        ssuId,
        ssuGovId,
        tribeId,
        bazaarType,
        giveItems:    giveItems.filter(r => r.typeId > 0).map(r => ({ typeId: r.typeId, qty: r.qty })),
        requestItems: requestItems.filter(r => r.typeId > 0).map(r => ({ typeId: r.typeId, qty: r.qty })),
        giveEveMist:    giveEveMistNum,
        evePaymentCoin: eveSplit.coinArg,
        requestEveMist: Math.round(Number(requestEve)),
        expiryMs,
      }, tx);
      const result = await signGated(tx);
      if (result.$kind === "FailedTransaction") {
        throw new Error("Transaction failed on-chain. Ensure TradeRegistry is deployed (FP1-09) and your wallet is funded.");
      }
      setCounterparty("");
      setGiveItems([]);
      setRequestItems([]);
      setGiveEve("0");
      setRequestEve("0");
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setLoading(false);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const hasAnyOffer   = giveItems.some(r => r.typeId > 0) || Number(giveEve) > 0;
  const hasAnyRequest = requestItems.some(r => r.typeId > 0) || Number(requestEve) > 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="trade__body">

      {/* Counterparty address */}
      <div className="form-group">
        <label className="form-label">Counterparty Wallet Address</label>
        <input
          className="input"
          type="text"
          placeholder="0x..."
          value={counterparty}
          onChange={e => setCounterparty(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <span className="muted" style={{ fontSize: "0.75rem" }}>
          Username search (FP1-06) not yet available — enter address directly.
        </span>
      </div>

      {/* Expiry */}
      <div className="form-group">
        <label className="form-label">Expiry (hours from now)</label>
        <input
          className="input input--sm"
          type="number"
          min={1}
          max={168}
          value={expiryHours}
          onChange={e => setExpiryHours(Math.max(1, Math.min(168, Number(e.target.value))))}
        />
        <span className="muted" style={{ fontSize: "0.75rem" }}>
          Default: 24 hours. Maximum: 168 hours (7 days).
        </span>
      </div>

      {/* Two-column trade layout */}
      <div className="trade-columns">

        {/* I Give */}
        <div className="trade-column">
          <div className="trade-column__header">I Give</div>
          <div className="form-group">
            <label className="form-label">EVE Amount (MIST)</label>
            <input
              className="input input--sm"
              type="number"
              min={0}
              value={giveEve}
              onChange={e => setGiveEve(e.target.value)}
            />
          </div>
          <ItemRowEditor label="Items" rows={giveItems} onChange={setGiveItems} />
        </div>

        {/* I Get */}
        <div className="trade-column">
          <div className="trade-column__header">I Get</div>
          <div className="form-group">
            <label className="form-label">EVE Amount (MIST)</label>
            <input
              className="input input--sm"
              type="number"
              min={0}
              value={requestEve}
              onChange={e => setRequestEve(e.target.value)}
            />
            <span className="muted" style={{ fontSize: "0.75rem" }}>
              Counterparty will send this amount on accept.
            </span>
          </div>
          <ItemRowEditor label="Items" rows={requestItems} onChange={setRequestItems} />
          <span className="muted" style={{ fontSize: "0.72rem" }}>
            Counterparty inventory browse (FP1-06) not yet available — enter item Type IDs directly.
          </span>
        </div>
      </div>

      {/* Proposal summary */}
      {(hasAnyOffer || hasAnyRequest) && (
        <div className="proposal-summary">
          <div className="proposal-summary__row">
            <span className="proposal-summary__label">I give:</span>
            <span className="proposal-summary__value">
              {Number(giveEve) > 0 && (
                <span>
                  {Number(giveEve).toLocaleString()} MIST EVE
                  {giveItems.some(r => r.typeId > 0) ? " + " : ""}
                </span>
              )}
              {giveItems.filter(r => r.typeId > 0).map((r, i, arr) => (
                <span key={r.typeId}>
                  {r.qty}x #{r.typeId}{i < arr.length - 1 ? ", " : ""}
                </span>
              ))}
              {!hasAnyOffer && <span className="muted">nothing</span>}
            </span>
          </div>
          <div className="proposal-summary__row">
            <span className="proposal-summary__label">I want:</span>
            <span className="proposal-summary__value">
              {Number(requestEve) > 0 && (
                <span>
                  {Number(requestEve).toLocaleString()} MIST EVE
                  {requestItems.some(r => r.typeId > 0) ? " + " : ""}
                </span>
              )}
              {requestItems.filter(r => r.typeId > 0).map((r, i, arr) => (
                <span key={r.typeId}>
                  {r.qty}x #{r.typeId}{i < arr.length - 1 ? ", " : ""}
                </span>
              ))}
              {!hasAnyRequest && <span className="muted">nothing</span>}
            </span>
          </div>
        </div>
      )}

      {error && <div className="error-text">{error}</div>}

      <div style={{ padding: "0 0 1rem" }}>
        <button
          className="btn btn--primary"
          onClick={handleSubmit}
          disabled={loading || !counterparty.trim()}
          type="button"
        >
          {loading ? "Sending..." : "Send Trade Offer"}
        </button>
      </div>

      <div className="muted" style={{ fontSize: "0.72rem", padding: "0 0 0.5rem" }}>
        If your trade fails, ensure you have joined this SSU's bazaar first.
        Auto-registration (FP1-future) not yet active.
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
