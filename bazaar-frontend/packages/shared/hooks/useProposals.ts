// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { BAZAAR_MISSION_ORIGINAL_PACKAGE_ID } from "@bazaar/shared/constants";
import type { TradeProposal } from "@bazaar/shared/types";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

async function rpc(method: string, params: unknown[]): Promise<any> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const data = await resp.json();
  if (data?.error) throw new Error(data.error.message);
  return data.result;
}

// Two-phase commit status values (u8 on-chain):
//   0 = PENDING       — proposal created, awaiting counterparty
//   2 = CANCELLED     — cancelled by either party
//   4 = COMPLETED     — initiator confirmed, trade fully executed
//   5 = AWAITING      — counterparty accepted, waiting for initiator to confirm (15-min window)
//   6 = EXPIRED       — 15-min window elapsed without initiator confirmation
const STATUS_MAP: Record<number, TradeProposal["status"]> = {
  0: "pending",
  2: "cancelled",
  4: "completed",
  5: "awaiting",
  6: "expired",
};

function parseProposal(raw: any): TradeProposal | null {
  try {
    const f = raw.data.content.fields;
    const statusNum = Number(f.status);
    return {
      id:             raw.data.objectId,
      initiator:      f.initiator,
      counterparty:   f.counterparty,
      status:         STATUS_MAP[statusNum] ?? "pending",
      initiatorTribe: Number(f.initiator_tribe_amount ?? 0),
      initiatorItems: (f.initiator_items ?? []).map((i: any) => ({
        itemTypeId:   Number(i.fields.item_type_id),
        quantity:     Number(i.fields.quantity),
        itemObjectId: i.fields.item_object_id ?? undefined,
      })),
      counterTribe: Number(f.counter_tribe_amount ?? 0),
      counterItems: (f.counter_items ?? []).map((i: any) => ({
        itemTypeId:   Number(i.fields.item_type_id),
        quantity:     Number(i.fields.quantity),
        itemObjectId: i.fields.item_object_id ?? undefined,
      })),
      requestedTribe: Number(f.requested_tribe_amount ?? 0),
      requestedItems: (f.requested_items ?? []).map((i: any) => ({
        itemTypeId:   Number(i.fields.item_type_id),
        quantity:     Number(i.fields.quantity),
        itemObjectId: i.fields.item_object_id ?? undefined,
      })),
      // Timestamp when counterparty accepted — used to render the 15-min confirm countdown
      acceptedAtMs: Number(f.accepted_at_ms ?? 0),
    };
  } catch {
    return null;
  }
}

export function useProposals(address: string) {
  const [proposals, setProposals] = useState<TradeProposal[]>([]);

  const fetchProposals = useCallback(async () => {
    if (!address) { setProposals([]); return; }
    try {
      // Both outgoing and incoming proposals are discovered via events.
      // V35 split: `trade` now lives in bazaar_mission — events anchor to the
      // bazaar_mission defining package (Run-#9 invariant 1). The pre-V35 filter
      // here was DEAD twice over: it queried `ProposalCreated` (the Move event is
      // `TradeProposalCreated`) and matched `p.initiator` (the event field is
      // `proposer`). Names fixed at the V35 rotation. NOTE (pre-existing drift,
      // logged in the V35 session summary): the multiGetObjects step below still
      // treats proposal_id as an object id, but TradeProposal is a Table entry in
      // TradeRegistry — useTradeProposals (trade-hooks.ts) is the working hook.
      // TODO: paginate if events exceed 50
      const eventsRes = await rpc("suix_queryEvents", [
        { MoveEventType: `${BAZAAR_MISSION_ORIGINAL_PACKAGE_ID}::trade::TradeProposalCreated` },
        null,
        50,
        true,
      ]);

      const events: any[] = eventsRes?.data ?? [];

      // Collect proposal IDs relevant to this address (as proposer or counterparty)
      const relevantIds = events
        .filter((e: any) => {
          const p = e.parsedJson ?? {};
          return p.proposer === address || p.counterparty === address;
        })
        .map((e: any) => (e.parsedJson ?? {}).proposal_id as string)
        .filter(Boolean);

      if (relevantIds.length === 0) {
        setProposals([]);
        return;
      }

      // Fetch full object content for each proposal
      const objects = await rpc("sui_multiGetObjects", [
        relevantIds,
        { showContent: true, showType: true },
      ]);

      const parsed = (objects ?? [])
        .filter((o: any) => (o.data as any)?.type?.includes("::trade::TradeProposal"))
        .map(parseProposal)
        .filter(Boolean) as TradeProposal[];

      setProposals(parsed);
    } catch {
      // silently fail
    }
  }, [address]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  return { proposals, refetch: fetchProposals };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
