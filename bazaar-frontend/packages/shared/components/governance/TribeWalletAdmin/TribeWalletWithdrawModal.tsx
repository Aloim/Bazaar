// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TribeWalletWithdrawModal — V20.
 *
 * Moves tokens FROM the Tribe Token Wallet (ledger row at gov.id_address) TO
 * a recipient player. Leader-cap preferred; falls back to SuperAdmin-cap.
 *
 * Move entry fns:
 *   bazaar_economy::tribe_token_ledger::withdraw_from_tribe_wallet_as_leader
 *   bazaar_economy::tribe_token_ledger::withdraw_from_tribe_wallet_as_super_admin
 *
 * Recipient picker reuses AddressInput (name search + 0x fallback).
 */

import { useState } from "react";
import { dAppKit } from "@evefrontier/dapp-kit";
import AddressInput from "@bazaar/shared/components/AddressInput";
import {
  buildWithdrawFromTribeWalletAsLeader,
  buildWithdrawFromTribeWalletAsSuperAdmin,
} from "@bazaar/shared/tx/bazaareconomy/ledger-tx";
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
  leaderCapId:        string | null;
  superAdminCapId:    string | null;
  tribeGovernanceId:  string;
  ledgerId:           string;
  walletBalance:      number;       // current Tribe Wallet balance, raw scaled units (V26+)
  tokenSymbol:        string;
  /** On-chain ledger decimals (V26+ default 2). */
  decimals?:          number;
}

export default function TribeWalletWithdrawModal({
  open, onClose, onSuccess,
  leaderCapId, superAdminCapId,
  tribeGovernanceId, ledgerId,
  walletBalance, tokenSymbol,
  decimals = TRIBE_TOKEN_DECIMALS,
}: Props) {
  const [recipient, setRecipient] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState<string | null>(null);

  if (!open) return null;

  // Prefer Leader over SuperAdmin. Admin/Mod tiers cannot withdraw on-chain.
  const effectiveLeader = leaderCapId ?? null;
  const effectiveSA     = !effectiveLeader ? (superAdminCapId ?? null) : null;
  const canWithdraw     = !!(effectiveLeader || effectiveSA);
  const capLabel        = effectiveLeader ? "TribeLeaderCap"
                        : effectiveSA     ? "TribeSuperAdminCap"
                        : "(no auth)";

  function reset() {
    setRecipient(""); setAmountStr(""); setErr(null); setBusy(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setErr(null);
    if (!recipient.trim().startsWith("0x") || recipient.trim().length < 10) {
      setErr("Recipient must be a 0x address or selected via name search.");
      return;
    }
    const parsed = parseTribeAmountSafe(amountStr, decimals);
    if (!parsed.ok) {
      setErr(`Invalid amount: ${parsed.reason}`);
      return;
    }
    if (parsed.value <= 0n) {
      setErr("Enter a positive amount.");
      return;
    }
    // walletBalance is raw scaled units (number); compare in bigint domain.
    if (parsed.value > BigInt(walletBalance)) {
      setErr(`Amount exceeds wallet balance (${formatTribeAmount(walletBalance, { decimals })} ${tokenSymbol}).`);
      return;
    }
    const amount = Number(parsed.value);
    if (!canWithdraw) {
      setErr("No Leader or SuperAdmin cap held — cannot withdraw.");
      return;
    }
    setBusy(true);
    try {
      const tx = effectiveLeader
        ? buildWithdrawFromTribeWalletAsLeader({
            leaderCapId: effectiveLeader,
            tribeGovernanceId, ledgerId,
            recipient: recipient.trim(),
            amount,
          })
        : buildWithdrawFromTribeWalletAsSuperAdmin({
            superAdminCapId: effectiveSA!,
            tribeGovernanceId, ledgerId,
            recipient: recipient.trim(),
            amount,
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
        style={{ width: "min(520px, 92vw)", maxHeight: "92vh", overflowY: "auto", padding: "1.25rem" }}
      >
        <h3 className="panel__heading" style={{ marginTop: 0 }}>
          Withdraw from Tribe Wallet
        </h3>
        <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "1rem" }}>
          Moves tokens from the Tribe Wallet to a player. Authority: <strong>{capLabel}</strong>.
          Available: <strong>{formatTribeAmount(walletBalance, { decimals })} {tokenSymbol}</strong>.
        </p>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="form-label">Recipient</label>
          <AddressInput
            value={recipient}
            onChange={setRecipient}
            placeholder="0x…"
          />
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label className="form-label">Amount ({tokenSymbol})</label>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder={`Up to ${formatTribeAmount(walletBalance, { decimals })}`}
              style={{ flex: 1 }}
              disabled={busy}
            />
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              disabled={busy || walletBalance === 0}
              onClick={() => setAmountStr(formatTribeAmount(walletBalance, { decimals, noGrouping: true }))}
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
            disabled={busy || !canWithdraw || !recipient || !amountStr}
          >
            {busy ? "Submitting…" : "Withdraw"}
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
