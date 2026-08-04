// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V26 D6 — Single Advanced DirectTrade proposal row.

import { useState } from "react";
import { dAppKit, abbreviateAddress } from "@evefrontier/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { COIN_DECIMALS } from "@bazaar/shared/constants";
import { formatTribeAmount } from "@bazaar/shared/utils/tribeToken";
import type { AdvancedTradeProposal } from "@bazaar/shared/hooks/bazaareconomy/advanced-direct-trade-hooks";
import {
  buildAcceptAdvancedTrade,
  buildRejectAdvancedTrade,
  buildCancelAdvancedTrade,
  buildExpireAdvancedTrade,
} from "@bazaar/shared/tx/bazaareconomy/advanced-direct-trade-tx";

interface ProposalRowProps {
  proposal: AdvancedTradeProposal;
  myAddress: string;
  registryId: string;
  ssuGovId: string;
  tribeGovId?: string;   // V36 R-C: TribeGovernance for ban/binding checks
  ledgerId: string;
  tokenSymbol: string;
  tokenDecimals: number;
  onChanged: () => void;
}

function fmtEve(mist: bigint) {
  const eve = Number(mist) / COIN_DECIMALS;
  return `${eve.toLocaleString("en-US", { maximumFractionDigits: 4 })} EVE`;
}

export default function ProposalRow({
  proposal, myAddress, registryId, ssuGovId, ledgerId, tokenSymbol, tokenDecimals, onChanged,
}: ProposalRowProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isProposer = proposal.proposer === myAddress;
  const isReceiver = proposal.receiver === myAddress;
  const other = isProposer ? proposal.receiver : proposal.proposer;
  const expired = Date.now() > proposal.expiryMs && proposal.status === "pending";

  async function run(label: string, build: (tx: Transaction) => void) {
    setErr(null);
    setBusy(label);
    try {
      const tx = new Transaction();
      build(tx);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function onAccept() {
    run("accept", tx => buildAcceptAdvancedTrade({
      registryId, ssuGovId, tribeGovId, ledgerId,
      proposalId: proposal.proposalId,
      requestEveMist: proposal.requestEveMist,
    }, tx));
  }
  function onReject() {
    run("reject", tx => buildRejectAdvancedTrade({
      registryId, ssuGovId, tribeGovId, ledgerId,
      proposalId: proposal.proposalId,
    }, tx));
  }
  function onCancel() {
    run("cancel", tx => buildCancelAdvancedTrade({
      registryId, ssuGovId, tribeGovId, ledgerId,
      proposalId: proposal.proposalId,
    }, tx));
  }
  function onExpire() {
    run("expire", tx => buildExpireAdvancedTrade({
      registryId, ssuGovId, tribeGovId, ledgerId,
      proposalId: proposal.proposalId,
    }, tx));
  }

  return (
    <div className="adv-trade-row">
      <div className="adv-trade-row__head">
        <span className="adv-trade-row__role">{isProposer ? "Sent to" : "Received from"}</span>
        <span className="adv-trade-row__who" title={other}>{abbreviateAddress(other)}</span>
        <span className={`badge badge--status-${proposal.status}`}>{proposal.status}</span>
      </div>
      <div className="adv-trade-row__body">
        <div className="adv-trade-row__leg">
          <strong>{isProposer ? "You give" : "They give"}</strong>
          <span>{fmtEve(proposal.offerEveMist)}</span>
          <span>{formatTribeAmount(proposal.offerTokensScaled, { decimals: tokenDecimals, symbol: tokenSymbol })}</span>
        </div>
        <div className="adv-trade-row__leg">
          <strong>{isProposer ? "They give" : "You give"}</strong>
          <span>{fmtEve(proposal.requestEveMist)}</span>
          <span>{formatTribeAmount(proposal.requestTokensScaled, { decimals: tokenDecimals, symbol: tokenSymbol })}</span>
        </div>
      </div>
      <div className="adv-trade-row__actions">
        {proposal.status === "pending" && isReceiver && (
          <>
            <button className="btn btn--primary btn--sm" disabled={!!busy} onClick={onAccept}>
              {busy === "accept" ? "Accepting…" : "Accept"}
            </button>
            <button className="btn btn--outline btn--sm" disabled={!!busy} onClick={onReject}>
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </>
        )}
        {proposal.status === "pending" && isProposer && (
          <button className="btn btn--outline btn--sm" disabled={!!busy} onClick={onCancel}>
            {busy === "cancel" ? "Cancelling…" : "Cancel"}
          </button>
        )}
        {expired && (
          <button className="btn btn--outline btn--sm" disabled={!!busy} onClick={onExpire}>
            {busy === "expire" ? "Expiring…" : "Mark expired"}
          </button>
        )}
      </div>
      {err && <div className="adv-trade-row__err" role="alert">{err}</div>}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
