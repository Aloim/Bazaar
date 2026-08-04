// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V26 D6 — Advanced DirectTrade trade-requests list grouped by direction +
// status. Reuses ProposalRow for each entry.

import type { AdvancedTradeProposal } from "@bazaar/shared/hooks/bazaareconomy/advanced-direct-trade-hooks";
import ProposalRow from "./ProposalRow";

interface TradeRequestsTabProps {
  proposals: AdvancedTradeProposal[];
  myAddress: string;
  registryId: string;
  ssuGovId: string;
  tribeGovId?: string;   // V36 R-C: TribeGovernance for ban/binding checks
  ledgerId: string;
  tokenSymbol: string;
  tokenDecimals: number;
  onChanged: () => void;
}

export default function TradeRequestsTab(props: TradeRequestsTabProps) {
  const { proposals, myAddress } = props;
  const incoming = proposals.filter(p => p.receiver === myAddress && p.status === "pending");
  const outgoing = proposals.filter(p => p.proposer === myAddress && p.status === "pending");
  const closed   = proposals.filter(p => p.status !== "pending");

  const renderRow = (p: AdvancedTradeProposal) => (
    <ProposalRow
      key={p.proposalId}
      proposal={p}
      myAddress={myAddress}
      registryId={props.registryId}
      ssuGovId={props.ssuGovId}
      tribeGovId={props.tribeGovId}
      ledgerId={props.ledgerId}
      tokenSymbol={props.tokenSymbol}
      tokenDecimals={props.tokenDecimals}
      onChanged={props.onChanged}
    />
  );

  const empty = incoming.length === 0 && outgoing.length === 0 && closed.length === 0;

  return (
    <div className="adv-trade-list">
      {incoming.length > 0 && (
        <section className="adv-trade-list__section">
          <h3>Incoming ({incoming.length})</h3>
          {incoming.map(renderRow)}
        </section>
      )}
      {outgoing.length > 0 && (
        <section className="adv-trade-list__section">
          <h3>Outgoing ({outgoing.length})</h3>
          {outgoing.map(renderRow)}
        </section>
      )}
      {closed.length > 0 && (
        <section className="adv-trade-list__section">
          <h3>Closed ({closed.length})</h3>
          {closed.slice(0, 20).map(renderRow)}
        </section>
      )}
      {empty && (
        <div className="adv-trade-list__empty muted">No proposals yet. Create one in the Create tab.</div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
