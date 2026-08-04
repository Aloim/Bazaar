// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — generic table-row-count hooks for the ceremony tab.
 *
 * Sui has no native `Table::length` accessor over RPC, so we paginate
 * `suix_getDynamicFields` and count rows up to a `MAX_COUNT` cap. Beyond the
 * cap the hook returns `{ count: MAX_COUNT, atLeast: true }`. For v1
 * cardinality (<1000 shops / proposals foreseeable) the cap is generous.
 *
 * `useShopCountSummary` — counts active shops in the BazarRegistry.
 * `useProposalCountSummary` — counts open trade proposals in TradeRegistry.
 * `useWithdrawalCountSummary` — counts open withdrawal rows in a board.
 *
 * Each polls every 15s. The summary is informational for the admin UI
 * (DrainBatchButton "Page X/Y: N shops closed (M remaining)") and the
 * Step 3 gate (`drainAllZero ≡ counts all === 0`).
 *
 * File limit: 500 lines | Constitution Article XIV.4.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { suiClient } from "../sui-client";
import {
  BAZAR_REGISTRY_ID,
  MISSION_REGISTRY_ID,
  SHARED_OBJECTS,
} from "../../constants";

const DEFAULT_POLL_MS = 15_000;
const MAX_COUNT = 1000;
const PAGE_LIMIT = 200;

export interface TableCountSummary {
  count: number;
  /** True when the count hit MAX_COUNT and there are more rows; admin should
   *  treat the displayed number as a lower bound. */
  atLeast: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

async function fetchTableUidFromField(
  parentObjectId: string,
  fieldName: string,
): Promise<string | null> {
  const obj = await suiClient.getObject({
    id: parentObjectId,
    options: { showContent: true },
  });
  const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
  const tbl = fields?.[fieldName] as { fields?: { id?: { id?: string } } } | undefined;
  return tbl?.fields?.id?.id ?? null;
}

async function countTableRows(tableUid: string): Promise<{ count: number; atLeast: boolean }> {
  let cursor: string | null = null;
  let total = 0;
  let atLeast = false;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page: { data: unknown[]; nextCursor: string | null; hasNextPage: boolean } =
      await suiClient.getDynamicFields({
        parentId: tableUid,
        cursor,
        limit: PAGE_LIMIT,
      });
    total += page.data.length;
    if (total >= MAX_COUNT) {
      atLeast = page.hasNextPage;
      total = MAX_COUNT;
      break;
    }
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return { count: total, atLeast };
}

/**
 * Count ACTIVE elements across a `Table<address, vector<ID>>` (e.g.
 * `BazarRegistry.shops_by_ssu` / `MissionRegistry.missions_by_ssu`). Unlike the
 * flat `shops` / `missions` tables — which retain rows set to `false` after
 * deactivation and therefore NEVER reach zero — these per-SSU vectors have ids
 * removed on close, so summing their lengths yields the true active count. This
 * is what the Step-3 ceremony gate must use.
 */
async function countVectorTableElements(tableUid: string): Promise<{ count: number; atLeast: boolean }> {
  let cursor: string | null = null;
  let total = 0;
  let atLeast = false;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page: { data: Array<{ objectId: string }>; nextCursor: string | null; hasNextPage: boolean } =
      await suiClient.getDynamicFields({ parentId: tableUid, cursor, limit: PAGE_LIMIT });
    if (page.data.length > 0) {
      const objs = await suiClient.multiGetObjects({
        ids: page.data.map((d) => d.objectId),
        options: { showContent: true },
      });
      for (const o of objs) {
        const fields = (o.data?.content as { fields?: { value?: unknown } } | undefined)?.fields;
        const vec = fields?.value;
        if (Array.isArray(vec)) total += vec.length;
        if (total >= MAX_COUNT) {
          atLeast = true;
          total = MAX_COUNT;
          break;
        }
      }
    }
    if (total >= MAX_COUNT) break;
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return { count: total, atLeast };
}

type CountFn = (tableUid: string) => Promise<{ count: number; atLeast: boolean }>;

function useTableCount(
  parentObjectId: string | null,
  fieldName: string,
  pollIntervalMs: number,
  counter: CountFn = countTableRows,
): TableCountSummary {
  const [count, setCount] = useState(0);
  const [atLeast, setAtLeast] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!parentObjectId) {
      setCount(0);
      setAtLeast(false);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const myReq = ++reqIdRef.current;

    async function loadOnce() {
      setIsLoading(true);
      try {
        const tableUid = await fetchTableUidFromField(parentObjectId!, fieldName);
        if (cancelled || myReq !== reqIdRef.current) return;
        if (!tableUid) {
          setCount(0);
          setAtLeast(false);
          setError(null);
          return;
        }
        const result = await counter(tableUid);
        if (cancelled || myReq !== reqIdRef.current) return;
        setCount(result.count);
        setAtLeast(result.atLeast);
        setError(null);
      } catch (err) {
        if (cancelled || myReq !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled && myReq === reqIdRef.current) setIsLoading(false);
      }
    }

    void loadOnce();
    const timer = window.setInterval(loadOnce, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [parentObjectId, fieldName, pollIntervalMs, tick, counter]);

  return { count, atLeast, isLoading, error, refetch };
}

export function useShopCountSummary(
  pollIntervalMs: number = DEFAULT_POLL_MS,
): TableCountSummary {
  return useTableCount(BAZAR_REGISTRY_ID, "shops", pollIntervalMs);
}

/** ACTIVE shop count — sums `BazarRegistry.shops_by_ssu` vectors (active-only).
 *  Use this for the Step-3 gate; `useShopCountSummary` over-counts (inactive rows). */
export function useActiveShopCountSummary(
  pollIntervalMs: number = DEFAULT_POLL_MS,
): TableCountSummary {
  return useTableCount(BAZAR_REGISTRY_ID, "shops_by_ssu", pollIntervalMs, countVectorTableElements);
}

/** ACTIVE mission count — sums `MissionRegistry.missions_by_ssu` vectors. */
export function useActiveMissionCountSummary(
  missionRegistryId: string = MISSION_REGISTRY_ID,
  pollIntervalMs: number = DEFAULT_POLL_MS,
): TableCountSummary {
  return useTableCount(missionRegistryId, "missions_by_ssu", pollIntervalMs, countVectorTableElements);
}

export function useProposalCountSummary(
  tradeRegistryId: string = SHARED_OBJECTS.TRADE_REGISTRY,
  pollIntervalMs: number = DEFAULT_POLL_MS,
): TableCountSummary {
  return useTableCount(tradeRegistryId, "proposals", pollIntervalMs);
}

export function useWithdrawalCountSummary(
  withdrawalBoardId: string | null,
  pollIntervalMs: number = DEFAULT_POLL_MS,
): TableCountSummary {
  return useTableCount(withdrawalBoardId, "requests", pollIntervalMs);
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
