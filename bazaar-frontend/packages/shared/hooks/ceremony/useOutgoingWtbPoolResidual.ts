// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — `useOutgoingWtbPoolResidual`.
 *
 * Returns the per-shop residual EVE escrow that the calling wallet (as the
 * shop owner) can rescue via `withdraw_legacy_wtb_pool_residual`. Filters the
 * pool's `deposits: Table<ID, Balance<EVE>>` dynamic fields to only those
 * shop_ids whose owner == walletAddress (looked up via the BazarRegistry).
 *
 * For each candidate shop_id we read:
 *   - the DF row (`Balance<EVE>` value → residual mist)
 *   - the shop's owner (via `bazar::shop_owner` → reads the shop's struct on
 *     BazarRegistry's dynamic fields)
 *
 * Polls every 15s. Returns empty when args are null.
 *
 * File limit: 500 lines | Constitution Article XIV.4.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { suiClient } from "../sui-client";
import { BAZAR_REGISTRY_ID } from "../../constants";

const DEFAULT_POLL_MS = 15_000;
const MAX_PAGE_LIMIT = 200;

export interface PerShopResidual {
  shopId: string;
  residualMist: bigint;
}

export interface UseOutgoingWtbPoolResidualResult {
  perShopResiduals: PerShopResidual[];
  totalMist: bigint;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

function toBigInt(raw: unknown): bigint {
  if (typeof raw === "bigint") return raw;
  if (typeof raw === "string") {
    try {
      return BigInt(raw);
    } catch {
      return 0n;
    }
  }
  if (typeof raw === "number") return BigInt(Math.trunc(raw));
  return 0n;
}

/** Look up the shop owner via the BazarRegistry. The `shops` table is a DF on
 *  the registry; each row's value is a Shop struct whose `owner: address`
 *  field we need. Single DF read per shop_id. */
async function fetchShopOwner(
  bazarRegistryId: string,
  shopsTableUid: string,
  shopId: string,
): Promise<string | null> {
  try {
    const obj = await suiClient.getDynamicFieldObject({
      parentId: shopsTableUid,
      name: { type: "0x2::object::ID", value: shopId },
    });
    const fields = (obj.data?.content as { fields?: { value?: { fields?: Record<string, unknown> } } } | undefined)?.fields?.value?.fields;
    const owner = fields?.owner as string | undefined;
    return owner ?? null;
  } catch {
    void bazarRegistryId; // referenced for grep'ability + future debug
    return null;
  }
}

async function fetchShopsTableUid(bazarRegistryId: string): Promise<string | null> {
  const reg = await suiClient.getObject({
    id: bazarRegistryId,
    options: { showContent: true },
  });
  const content = reg.data?.content as { fields?: Record<string, unknown> } | undefined;
  const shopsField = content?.fields?.shops as { fields?: { id?: { id?: string } } } | undefined;
  return shopsField?.fields?.id?.id ?? null;
}

export function useOutgoingWtbPoolResidual(
  wtbEscrowPoolId: string | null,
  walletAddress: string | null,
  pollIntervalMs: number = DEFAULT_POLL_MS,
): UseOutgoingWtbPoolResidualResult {
  const [perShopResiduals, setRows] = useState<PerShopResidual[]>([]);
  const [totalMist, setTotal] = useState<bigint>(0n);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!wtbEscrowPoolId || !walletAddress) {
      setRows([]);
      setTotal(0n);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const myReq = ++reqIdRef.current;

    async function loadAll() {
      setIsLoading(true);
      try {
        // 1. Pool object → deposits table UID
        const poolObj = await suiClient.getObject({
          id: wtbEscrowPoolId!,
          options: { showContent: true },
        });
        if (cancelled || myReq !== reqIdRef.current) return;
        const poolContent = poolObj.data?.content as { fields?: Record<string, unknown> } | undefined;
        const depositsField = poolContent?.fields?.deposits as { fields?: { id?: { id?: string } } } | undefined;
        const depositsUid = depositsField?.fields?.id?.id;
        if (!depositsUid) {
          setRows([]);
          setTotal(0n);
          setError(null);
          return;
        }

        // 2. BazarRegistry → shops table UID
        const shopsTableUid = await fetchShopsTableUid(BAZAR_REGISTRY_ID);
        if (cancelled || myReq !== reqIdRef.current) return;
        if (!shopsTableUid) {
          setRows([]);
          setTotal(0n);
          setError(null);
          return;
        }

        // 3. Enumerate pool.deposits — each DF key is the shop_id (ID).
        const dfPage = await suiClient.getDynamicFields({
          parentId: depositsUid,
          limit: MAX_PAGE_LIMIT,
        });
        if (cancelled || myReq !== reqIdRef.current) return;

        const candidates: Array<{ shopId: string; residualMist: bigint }> = [];
        for (const df of dfPage.data) {
          const shopId = (df.name?.value as string | undefined) ?? "";
          if (!shopId) continue;
          const dfObj = await suiClient.getDynamicFieldObject({
            parentId: depositsUid,
            name: df.name,
          });
          if (cancelled || myReq !== reqIdRef.current) return;
          // Balance<EVE> may render as `{ fields: { value: "..." } }` or as raw string.
          const valField = (dfObj.data?.content as { fields?: { value?: unknown } } | undefined)?.fields?.value;
          let mist: bigint;
          if (valField && typeof valField === "object") {
            const fields = (valField as { fields?: { value?: string } }).fields;
            mist = toBigInt(fields?.value);
          } else {
            mist = toBigInt(valField);
          }
          if (mist > 0n) candidates.push({ shopId, residualMist: mist });
        }

        // 4. Filter candidates by owner == walletAddress.
        const filtered: PerShopResidual[] = [];
        let total = 0n;
        for (const c of candidates) {
          const owner = await fetchShopOwner(BAZAR_REGISTRY_ID, shopsTableUid, c.shopId);
          if (cancelled || myReq !== reqIdRef.current) return;
          if (owner && owner.toLowerCase() === walletAddress!.toLowerCase()) {
            filtered.push(c);
            total += c.residualMist;
          }
        }
        filtered.sort((a, b) => (b.residualMist > a.residualMist ? 1 : -1));
        setRows(filtered);
        setTotal(total);
        setError(null);
      } catch (err) {
        if (cancelled || myReq !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled && myReq === reqIdRef.current) setIsLoading(false);
      }
    }

    void loadAll();
    const timer = window.setInterval(loadAll, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [wtbEscrowPoolId, walletAddress, pollIntervalMs, tick]);

  return { perShopResiduals, totalMist, isLoading, error, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
