// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/DirectTrade.tsx (lines 661-731; split for 500-line guard, section: TradeRequestsTab).
// Re-imported into ./index.tsx.

import { useMemo } from "react";
import { useCharacterNames } from "@bazaar/shared/hooks";
import type { TradeProposal } from "@bazaar/shared/types";
import ProposalRow from "./ProposalRow";

interface TradeRequestsTabProps {
  proposals:  TradeProposal[];
  myAddress:  string;
  onOpen:     (p: TradeProposal) => void;
}

export default function TradeRequestsTab({ proposals, myAddress, onOpen }: TradeRequestsTabProps) {
  const proposalAddresses = useMemo(() => {
    const addrs = new Set<string>();
    proposals.forEach(p => { addrs.add(p.initiator); addrs.add(p.counterparty); });
    return Array.from(addrs);
  }, [proposals]);
  const names = useCharacterNames(proposalAddresses);

  const incoming       = proposals.filter(p => p.counterparty === myAddress && p.status === "pending");
  const outgoing       = proposals.filter(p => p.initiator   === myAddress && p.status === "pending");
  const awaitingConfirm = proposals.filter(p => p.initiator === myAddress && p.status === "awaiting");
  const accepted       = proposals.filter(p => p.counterparty === myAddress && p.status === "awaiting");
  const noProposals    = incoming.length === 0 && outgoing.length === 0 && awaitingConfirm.length === 0 && accepted.length === 0;

  return (
    <div className="trade__body">
      {accepted.length > 0 && (
        <section className="trade__section">
          <h3>Awaiting Initiator Confirmation ({accepted.length})</h3>
          {accepted.map(p => <ProposalRow key={p.id} proposal={p} myAddress={myAddress} names={names} onOpen={() => onOpen(p)} />)}
        </section>
      )}
      {awaitingConfirm.length > 0 && (
        <section className="trade__section">
          <h3>Awaiting Your Confirmation ({awaitingConfirm.length})</h3>
          {awaitingConfirm.map(p => <ProposalRow key={p.id} proposal={p} myAddress={myAddress} names={names} onOpen={() => onOpen(p)} />)}
        </section>
      )}
      {incoming.length > 0 && (
        <section className="trade__section">
          <h3>Incoming Trade Offers ({incoming.length})</h3>
          {incoming.map(p => <ProposalRow key={p.id} proposal={p} myAddress={myAddress} names={names} onOpen={() => onOpen(p)} />)}
        </section>
      )}
      {outgoing.length > 0 && (
        <section className="trade__section">
          <h3>My Active Offers ({outgoing.length})</h3>
          {outgoing.map(p => <ProposalRow key={p.id} proposal={p} myAddress={myAddress} names={names} onOpen={() => onOpen(p)} />)}
        </section>
      )}
      {noProposals && <div className="trade__empty muted">No active trade proposals. Create one to start trading.</div>}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
