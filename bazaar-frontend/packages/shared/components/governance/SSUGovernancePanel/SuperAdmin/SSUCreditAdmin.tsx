// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * SSUCreditAdmin — V26.
 *
 * Withdraw / Deposit controls for the per-SSU tribe-token tax credit row.
 * Mirrors the tribe-level TribeWalletAdmin pattern but operates on the
 * `ssu_governance::ssu_id(ssu_gov)` ledger row.
 *
 * Move entries (AUD-ADV-22: module attribution corrected — V26 D8 split):
 *   bazaar_economy::ledger_shop_ops_ssu_admin::transfer_ssu_credit_to_player  (SSUOwnerCap-gated)
 *   bazaar_economy::ledger_shop_ops_ssu_admin::deposit_to_ssu_credit          (permissionless)
 *
 * Recipient picker: AddressInput (name search + 0x fallback). A dedicated
 * SSU-member dropdown is deferred polish — AddressInput already supports
 * resolving registered members by name on this SSU.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import AddressInput from "@bazaar/shared/components/AddressInput";
import {
  buildTransferSSUCreditToPlayer,
  buildDepositToSSUCredit,
} from "@bazaar/shared/tx/bazaareconomy/ledger-tx";
import {
  formatTribeAmount,
  parseTribeAmountSafe,
  TRIBE_TOKEN_DECIMALS,
} from "@bazaar/shared/utils/tribeToken";
import { Z } from "@bazaar/shared/constants/zIndex";

interface SSUCreditAdminProps {
  ssuGovId:        string;
  ssuOwnerCapId:   string | null;
  ledgerId:        string;
  ssuBalance:      number;   // SSU tax row balance, raw scaled units
  callerBalance:   number;   // connected wallet's tribe-token balance, raw scaled
  tokenSymbol:     string;
  decimals?:       number;
  onSuccess:       () => void;
}

export default function SSUCreditAdmin({
  ssuGovId, ssuOwnerCapId, ledgerId,
  ssuBalance, callerBalance, tokenSymbol,
  decimals = TRIBE_TOKEN_DECIMALS,
  onSuccess,
}: SSUCreditAdminProps) {
  const [openModal, setOpenModal] = useState<"withdraw" | "deposit" | null>(null);
  const hasOwnerCap = !!ssuOwnerCapId;

  return (
    <>
      <div className="form-row" style={{ marginTop: "0.5rem", gap: "0.5rem" }}>
        <button
          className="btn btn--primary btn--sm"
          disabled={!hasOwnerCap || ssuBalance === 0}
          title={!hasOwnerCap ? "SSU Owner cap required" : ssuBalance === 0 ? "SSU tax row is empty" : ""}
          onClick={() => setOpenModal("withdraw")}
        >
          Withdraw (to player)
        </button>
        <button
          className="btn btn--ghost btn--sm"
          disabled={callerBalance === 0}
          title={callerBalance === 0 ? "Your balance is 0" : ""}
          onClick={() => setOpenModal("deposit")}
        >
          Deposit (from my wallet)
        </button>
      </div>
      {openModal === "withdraw" && hasOwnerCap && (
        <SSUCreditWithdrawModal
          ssuGovId={ssuGovId}
          ssuOwnerCapId={ssuOwnerCapId!}
          ledgerId={ledgerId}
          ssuBalance={ssuBalance}
          tokenSymbol={tokenSymbol}
          decimals={decimals}
          onClose={() => setOpenModal(null)}
          onSuccess={() => { onSuccess(); setOpenModal(null); }}
        />
      )}
      {openModal === "deposit" && (
        <SSUCreditDepositModal
          ssuGovId={ssuGovId}
          ledgerId={ledgerId}
          callerBalance={callerBalance}
          tokenSymbol={tokenSymbol}
          decimals={decimals}
          onClose={() => setOpenModal(null)}
          onSuccess={() => { onSuccess(); setOpenModal(null); }}
        />
      )}
    </>
  );
}

// ── Withdraw Modal ────────────────────────────────────────────────────────────

interface WithdrawProps {
  ssuGovId:      string;
  ssuOwnerCapId: string;
  ledgerId:      string;
  ssuBalance:    number;
  tokenSymbol:   string;
  decimals:      number;
  onClose:       () => void;
  onSuccess:     () => void;
}

function SSUCreditWithdrawModal({
  ssuGovId, ssuOwnerCapId, ledgerId,
  ssuBalance, tokenSymbol, decimals,
  onClose, onSuccess,
}: WithdrawProps) {
  const [recipient, setRecipient] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState<string | null>(null);

  async function handleSubmit() {
    setErr(null);
    if (!recipient.trim().startsWith("0x") || recipient.trim().length < 10) {
      setErr("Recipient must be a 0x address or selected via name search.");
      return;
    }
    const parsed = parseTribeAmountSafe(amountStr, decimals);
    if (!parsed.ok) { setErr(`Invalid amount: ${parsed.reason}`); return; }
    if (parsed.value <= 0n) { setErr("Enter a positive amount."); return; }
    if (parsed.value > BigInt(ssuBalance)) {
      setErr(`Amount exceeds SSU balance (${formatTribeAmount(ssuBalance, { decimals })} ${tokenSymbol}).`);
      return;
    }
    setBusy(true);
    try {
      const tx = buildTransferSSUCreditToPlayer({
        ssuOwnerCapId, ssuGovId, ledgerId,
        recipient: recipient.trim(),
        amountScaled: Number(parsed.value),
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
    <Modal title="Withdraw from SSU Tax Wallet" onClose={onClose}>
      <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "1rem" }}>
        Moves tribe tokens from this SSU&apos;s tax row to a player wallet. Authority: <strong>SSUOwnerCap</strong>.
        Available: <strong>{formatTribeAmount(ssuBalance, { decimals })} {tokenSymbol}</strong>.
      </p>
      <div style={{ marginBottom: "0.75rem" }}>
        <label className="form-label">Recipient</label>
        <AddressInput value={recipient} onChange={setRecipient} placeholder="0x…" />
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
      {err && (
        <p style={{ color: "var(--danger-color, #f87171)", margin: "0 0 0.5rem 0", fontSize: "0.85rem" }}>
          {err}
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
        <button className="btn btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button
          className="btn btn--primary"
          onClick={handleSubmit}
          disabled={busy || !recipient || !amountStr}
        >
          {busy ? "Submitting…" : "Withdraw"}
        </button>
      </div>
    </Modal>
  );
}

// ── Deposit Modal ─────────────────────────────────────────────────────────────

interface DepositProps {
  ssuGovId:      string;
  ledgerId:      string;
  callerBalance: number;
  tokenSymbol:   string;
  decimals:      number;
  onClose:       () => void;
  onSuccess:     () => void;
}

function SSUCreditDepositModal({
  ssuGovId, ledgerId,
  callerBalance, tokenSymbol, decimals,
  onClose, onSuccess,
}: DepositProps) {
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState<string | null>(null);

  async function handleSubmit() {
    setErr(null);
    const parsed = parseTribeAmountSafe(amountStr, decimals);
    if (!parsed.ok) { setErr(`Invalid amount: ${parsed.reason}`); return; }
    if (parsed.value <= 0n) { setErr("Enter a positive amount."); return; }
    if (parsed.value > BigInt(callerBalance)) {
      setErr(`Amount exceeds your balance (${formatTribeAmount(callerBalance, { decimals })} ${tokenSymbol}).`);
      return;
    }
    setBusy(true);
    try {
      const tx = buildDepositToSSUCredit({
        ssuGovId, ledgerId,
        amountScaled: Number(parsed.value),
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
    <Modal title="Deposit into SSU Tax Wallet" onClose={onClose}>
      <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "1rem" }}>
        Moves tribe tokens from your wallet into this SSU&apos;s tax row. Permissionless —
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
            onChange={e => setAmountStr(e.target.value)}
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
        <button className="btn btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button
          className="btn btn--primary"
          onClick={handleSubmit}
          disabled={busy || !amountStr || callerBalance === 0}
        >
          {busy ? "Submitting…" : "Deposit"}
        </button>
      </div>
    </Modal>
  );
}

// ── Shared modal shell ────────────────────────────────────────────────────────

function Modal({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
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
        <h3 className="panel__heading" style={{ marginTop: 0 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
