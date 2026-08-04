// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/DirectTrade.tsx (lines 35-109; split for 500-line guard, section: DirectTrade main container + Tab router).
// Sub-components in ./CreateTradeTab.tsx, ./TradeRequestsTab.tsx, ./ProposalRow.tsx, ./trade-types.ts.

import { useState } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useProposals } from "@bazaar/shared/hooks";
import type { Screen, TradeProposal } from "@bazaar/shared/types";
import TradeProposalView from "@bazaar/shared/components/trade/TradeProposalView";
import CreateTradeTab from "./CreateTradeTab";
import TradeRequestsTab from "./TradeRequestsTab";

interface Props { nav: (s: Screen) => void; onClose?: () => void }

export default function DirectTrade({ nav, onClose }: Props) {
  const { walletAddress } = useConnection();
  const { proposals, refetch } = useProposals(walletAddress ?? "");
  const [activeTab, setActiveTab] = useState<"create" | "requests">("create");
  const [selected, setSelected]   = useState<TradeProposal | null>(null);

  const incoming     = proposals.filter(p => p.counterparty === walletAddress && p.status === "pending");
  const pendingCount = incoming.length;

  if (selected) {
    return (
      <TradeProposalView
        proposal={selected}
        myAddress={walletAddress ?? ""}
        onBack={() => { setSelected(null); refetch(); }}
      />
    );
  }

  return (
    <div className="trade">
      <div className="trade__header">
        <h2>Direct Trade</h2>
        {onClose
          ? <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ color: "#cc7000" }}>X</button>
          : <button className="btn btn--ghost btn--sm" onClick={() => nav("landing")}>Back</button>
        }
      </div>
      <div className="trade-tabs">
        <button className={`trade-tab${activeTab === "create" ? " trade-tab--active" : ""}`} onClick={() => setActiveTab("create")}>
          Create Trade
        </button>
        <button className={`trade-tab${activeTab === "requests" ? " trade-tab--active" : ""}`} onClick={() => setActiveTab("requests")}>
          Trade Requests
          {pendingCount > 0 && <span className="trade-tab__badge">{pendingCount}</span>}
        </button>
      </div>
      {activeTab === "create" && <CreateTradeTab myAddress={walletAddress ?? ""} onSuccess={refetch} />}
      {activeTab === "requests" && <TradeRequestsTab proposals={proposals} myAddress={walletAddress ?? ""} onOpen={p => setSelected(p)} />}
      <div className="trade__footer muted">No fees on Direct Trade. All items and Tribe Coin transfer 1:1.</div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
