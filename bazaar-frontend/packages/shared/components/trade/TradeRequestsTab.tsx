// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * TradeRequestsTab.tsx — Trade requests list (incoming + outgoing + resolved).
 *
 * Single-phase only: no AWAITING section (FP1-01 deferred).
 * Derived from NoTribe's TradeRequestsTab.tsx; shared primitive for all bazaar types.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import type { TradeProposal } from "@bazaar/shared/types/bazaarcore";
import ProposalRow from "./ProposalRow";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TradeRequestsTabProps {
  proposals:  TradeProposal[];
  myAddress:  string;
  isLoading:  boolean;
  onOpen:     (p: TradeProposal) => void;
}

// ── TradeRequestsTab ──────────────────────────────────────────────────────────

export default function TradeRequestsTab({
  proposals,
  myAddress,
  isLoading,
  onOpen,
}: TradeRequestsTabProps) {
  const incoming = proposals.filter(p => p.counterparty === myAddress && p.status === 0);
  const outgoing = proposals.filter(p => p.proposer     === myAddress && p.status === 0);
  const resolved = proposals.filter(
    p => (p.proposer === myAddress || p.counterparty === myAddress) && p.status !== 0,
  );

  const noProposals = incoming.length === 0 && outgoing.length === 0 && resolved.length === 0;

  if (isLoading) {
    return (
      <div className="trade__body">
        <p className="muted" style={{ padding: "1rem 0" }}>Loading proposals...</p>
      </div>
    );
  }

  return (
    <div className="trade__body">
      {incoming.length > 0 && (
        <section className="trade__section">
          <h3>Incoming Trade Offers ({incoming.length})</h3>
          {incoming.map(p => (
            <ProposalRow key={p.id} proposal={p} myAddress={myAddress} onOpen={() => onOpen(p)} />
          ))}
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="trade__section">
          <h3>My Active Offers ({outgoing.length})</h3>
          {outgoing.map(p => (
            <ProposalRow key={p.id} proposal={p} myAddress={myAddress} onOpen={() => onOpen(p)} />
          ))}
        </section>
      )}

      {resolved.length > 0 && (
        <section className="trade__section">
          <h3>Resolved ({resolved.length})</h3>
          {resolved.map(p => (
            <ProposalRow key={p.id} proposal={p} myAddress={myAddress} onOpen={() => onOpen(p)} />
          ))}
        </section>
      )}

      {noProposals && (
        <div className="trade__empty muted">
          No trade proposals yet. Create one to start trading.
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
