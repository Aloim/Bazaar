// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useLockerCapacity — read the connected player's locker capacity at a given
 * SSU, for the Multi-SSU Visibility Phase-3 pre-flight guard (deferred into
 * Phase 4). Mitigates the documented residual risk: a cross-SSU buy/exchange
 * payout `deposit_to_owned` ABORTS (`EInventoryInsufficientCapacity`) when the
 * recipient locker is full.
 *
 * On-chain (verified live 2026-06-06): the SSU object holds one `Inventory`
 * per owner-cap as a dynamic field keyed by `ID`. The world `Inventory` struct
 * is `{ max_capacity: u64, used_capacity: u64, items }` — a deposit asserts
 * `volume*qty <= max_capacity - used_capacity`. We read that field for the
 * player's locker key with a single keyed `getDynamicFieldObject` (O(1)).
 *
 * Behaviour is FAIL-OPEN: a missing locker (lazy-created at payout, inheriting
 * Main Storage's large capacity), an RPC error, or an unset key all yield
 * `exists=false` / null so the caller never blocks a legitimate trade.
 *
 * @param ssuId        the SSU whose storage receives the payout (the SELLER's SSU)
 * @param inventoryKey the recipient's locker key — the SSU OwnerCap id when the
 *                     recipient owns that SSU (Main Storage), else the player's
 *                     global `character.ownerCapId` (Player Locker).
 */

import { useState, useEffect } from "react";

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

export interface LockerCapacity {
  maxCapacity: number;
  usedCapacity: number;
  /** maxCapacity - usedCapacity (never negative). */
  remaining: number;
  /** true when an Inventory field already exists for this key on the SSU. */
  exists: boolean;
}

export interface UseLockerCapacityResult {
  data: LockerCapacity | null;
  isLoading: boolean;
}

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

/** Resolve locker capacity for one key, or null if it cannot be read. */
export async function fetchLockerCapacity(
  ssuId: string,
  inventoryKey: string,
): Promise<LockerCapacity | null> {
  if (!ssuId || !inventoryKey) return null;
  const result = await rpc("suix_getDynamicFieldObject", [
    ssuId,
    { type: "0x2::object::ID", value: inventoryKey },
  ]);
  const inv = result?.data?.content?.fields?.value?.fields;
  if (!inv || inv.max_capacity == null) {
    // No Inventory field yet → lazy-created at payout (inherits Main Storage cap).
    return { maxCapacity: 0, usedCapacity: 0, remaining: 0, exists: false };
  }
  const maxCapacity = Number(inv.max_capacity ?? 0);
  const usedCapacity = Number(inv.used_capacity ?? 0);
  const remaining = Math.max(0, maxCapacity - usedCapacity);
  return { maxCapacity, usedCapacity, remaining, exists: true };
}

export function useLockerCapacity(
  ssuId: string | undefined,
  inventoryKey: string | undefined,
): UseLockerCapacityResult {
  const [data, setData] = useState<LockerCapacity | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!ssuId || !inventoryKey) { setData(null); setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);
    fetchLockerCapacity(ssuId, inventoryKey)
      .then(r => { if (!cancelled) { setData(r); setIsLoading(false); } })
      .catch(e => {
        // FAIL-OPEN: on a read error, return null so callers don't block trades.
        console.warn("[useLockerCapacity] read failed:", e);
        if (!cancelled) { setData(null); setIsLoading(false); }
      });
    return () => { cancelled = true; };
  }, [ssuId, inventoryKey]);

  return { data, isLoading };
}

/**
 * Caller helper: should the trade be blocked for a full recipient locker?
 * Blocks ONLY when the locker exists and has no remaining room (`remaining<=0`),
 * or — when a conservative `requiredVolume` is supplied — when it won't fit.
 * Fail-open everywhere else (null data, non-existent locker).
 */
export function lockerWouldOverflow(
  cap: LockerCapacity | null,
  requiredVolume?: number,
): boolean {
  if (!cap || !cap.exists) return false;
  if (requiredVolume != null && requiredVolume > 0) return requiredVolume > cap.remaining;
  return cap.remaining <= 0;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
