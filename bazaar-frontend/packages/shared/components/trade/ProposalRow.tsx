// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ProposalRow.tsx — Single row in the trade requests list.
 *
 * Status pill uses .badge--status-{pending,accepted,rejected,cancelled,expired}.
 * No useCharacterNames in MVP — address abbreviated inline (FP1-06 future).
 * Derived from NoTribe ProposalRow.tsx; shared primitive for all bazaar types.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import type { TradeProposal, TradeStatus } from "@bazaar/shared/types/bazaarcore";

// ── Status display helpers ────────────────────────────────────────────────────

const STATUS_LABEL: Record<TradeStatus, string> = {
  0: "pending",
  1: "accepted",
  2: "rejected",
  3: "cancelled",
  4: "expired",
};

function abbreviate(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProposalRowProps {
  proposal:  TradeProposal;
  myAddress: string;
  onOpen:    () => void;
}

// ── ProposalRow ───────────────────────────────────────────────────────────────

export default function ProposalRow({ proposal, myAddress, onOpen }: ProposalRowProps) {
  const isProposer  = proposal.proposer === myAddress;
  const otherAddr   = isProposer ? proposal.counterparty : proposal.proposer;
  const statusLabel = STATUS_LABEL[proposal.status] ?? "pending";

  return (
    <div className="proposal-row">
      <span className="proposal-row__who">{abbreviate(otherAddr)}</span>
      <span className={`badge badge--status-${statusLabel}`}>{statusLabel}</span>
      <span className="muted proposal-row__role">{isProposer ? "Sent" : "Received"}</span>
      <button className="btn btn--outline btn--sm" onClick={onOpen} type="button">
        View
      </button>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
