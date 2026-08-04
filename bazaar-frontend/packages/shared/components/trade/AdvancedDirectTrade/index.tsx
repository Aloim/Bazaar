// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// V26 D6 — Advanced DirectTrade container.
// Resolves per-tribe shared object IDs (registry + ledger + ssu_gov) and
// hands them to the sub-tabs. Hidden / shown by the parent App.tsx
// (only mounted on Advanced bazaars).

import { useState } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";
import { useSSUGovId, useTribeGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useSSUGovernanceConfig } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import { useTribeEconomyObjects } from "@bazaar/shared/hooks/bazaareconomy/economy-resolution-hooks";
import { useTribeTokenBalance } from "@bazaar/shared/hooks/bazaareconomy/ledger-hooks";
import { useTribeTokenSymbol } from "@bazaar/shared/hooks/bazaareconomy/useTribeTokenSymbol";
import { useAdvancedTradeProposals } from "@bazaar/shared/hooks/bazaareconomy/advanced-direct-trade-hooks";
import type { Screen } from "@bazaar/shared/types";
import CreateTradeTab from "./CreateTradeTab";
import TradeRequestsTab from "./TradeRequestsTab";
import type { AdvancedTab } from "./trade-types";

interface Props { nav: (s: Screen) => void; onClose?: () => void }

export default function AdvancedDirectTrade({ nav, onClose }: Props) {
  const { walletAddress } = useConnection();
  const me = walletAddress ?? "";

  const { data: ssuGovId } = useSSUGovId(SSU_OBJECT_ID ?? null);
  const { data: ssuGov } = useSSUGovernanceConfig(ssuGovId ?? null);
  const tribeId = ssuGov?.tribeId ?? null;

  const { data: econ } = useTribeEconomyObjects(tribeId !== null ? String(tribeId) : null);
  const { data: balance } = useTribeTokenBalance(econ?.ledgerId ?? null, me);
  const { symbol: resolvedSymbol } = useTribeTokenSymbol(tribeId ?? null);
  const tokenSymbol = resolvedSymbol ?? "TOKEN";
  const tokenDecimals = balance?.decimals ?? 2;

  const tribeIdNum = tribeId ?? null;
  // V36 R-C: advanced_direct_trade entries need the tribe's TribeGovernance for ban/binding checks.
  const { data: tribeGovId } = useTribeGovId(tribeIdNum !== null ? String(tribeIdNum) : null);
  const { proposals, refetch } = useAdvancedTradeProposals(tribeIdNum, me);

  const [tab, setTab] = useState<AdvancedTab>("create");

  const incomingCount = proposals.filter(p => p.receiver === me && p.status === "pending").length;

  // Guard rails: surfaces a friendly message when the tribe is not yet
  // bootstrapped on V26+ (advancedTradeRegistryId missing).
  if (ssuGovId === null || ssuGovId === undefined) {
    return <Wrapper nav={nav} onClose={onClose}><Empty>Resolving SSU governance…</Empty></Wrapper>;
  }
  if (tribeIdNum === null) {
    return <Wrapper nav={nav} onClose={onClose}><Empty>SSU has no tribe assigned.</Empty></Wrapper>;
  }
  if (!econ) {
    return <Wrapper nav={nav} onClose={onClose}><Empty>Resolving tribe economy objects…</Empty></Wrapper>;
  }
  if (!econ.advancedTradeRegistryId) {
    return (
      <Wrapper nav={nav} onClose={onClose}>
        <Empty>
          Advanced DirectTrade not available for this tribe.<br />
          The trade registry is created at tribe economy bootstrap (V26+).
        </Empty>
      </Wrapper>
    );
  }

  return (
    <Wrapper nav={nav} onClose={onClose}>
      <div className="trade-tabs">
        <button
          className={`trade-tab${tab === "create" ? " trade-tab--active" : ""}`}
          onClick={() => setTab("create")}
        >Create Trade</button>
        <button
          className={`trade-tab${tab === "requests" ? " trade-tab--active" : ""}`}
          onClick={() => setTab("requests")}
        >
          Trade Requests
          {incomingCount > 0 && <span className="trade-tab__badge">{incomingCount}</span>}
        </button>
      </div>
      {tab === "create" && (
        <CreateTradeTab
          registryId={econ.advancedTradeRegistryId}
          ssuGovId={ssuGovId}
          tribeGovId={tribeGovId ?? undefined}
          ledgerId={econ.ledgerId}
          tokenSymbol={tokenSymbol}
          tokenDecimals={tokenDecimals}
          myAddress={me}
          myTribeBalanceScaled={BigInt(balance?.balance ?? 0)}
          onSuccess={() => { refetch(); setTab("requests"); }}
        />
      )}
      {tab === "requests" && (
        <TradeRequestsTab
          proposals={proposals}
          myAddress={me}
          registryId={econ.advancedTradeRegistryId}
          ssuGovId={ssuGovId}
          tribeGovId={tribeGovId ?? undefined}
          ledgerId={econ.ledgerId}
          tokenSymbol={tokenSymbol}
          tokenDecimals={tokenDecimals}
          onChanged={() => refetch()}
        />
      )}
      <div className="trade__footer muted">
        Advanced DirectTrade — settles EVE + tribe-token instantly. No fees in v1. Item trades arrive in V27.
      </div>
    </Wrapper>
  );
}

interface WrapperProps { nav: (s: Screen) => void; onClose?: () => void; children: React.ReactNode }
function Wrapper({ nav, onClose, children }: WrapperProps) {
  return (
    <div className="trade">
      <div className="trade__header">
        <h2>Advanced Direct Trade</h2>
        {onClose
          ? <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ color: "#cc7000" }}>X</button>
          : <button className="btn btn--ghost btn--sm" onClick={() => nav("landing")}>Back</button>
        }
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="trade__body"><div className="trade__empty muted">{children}</div></div>;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
