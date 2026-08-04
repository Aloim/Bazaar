// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/DirectTrade.tsx (lines 733-755; split for 500-line guard, section: ProposalRow).
// Re-imported into ./TradeRequestsTab.tsx.

import { abbreviateAddress } from "@evefrontier/dapp-kit";
import type { TradeProposal } from "@bazaar/shared/types";

interface ProposalRowProps {
  proposal:  TradeProposal;
  myAddress: string;
  names:     Map<string, string>;
  onOpen:    () => void;
}

export default function ProposalRow({ proposal, myAddress, names, onOpen }: ProposalRowProps) {
  const isInitiator = proposal.initiator === myAddress;
  const other       = isInitiator ? proposal.counterparty : proposal.initiator;
  const otherName   = names.get(other) ?? abbreviateAddress(other);

  return (
    <div className="proposal-row">
      <span className="proposal-row__who">{otherName}</span>
      <span className={`badge badge--status-${proposal.status}`}>{proposal.status}</span>
      <span className="muted proposal-row__role">{isInitiator ? "Sent" : "Received"}</span>
      <button className="btn btn--outline btn--sm" onClick={onOpen}>View</button>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
