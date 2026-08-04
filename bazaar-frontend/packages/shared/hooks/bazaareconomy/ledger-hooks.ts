// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy ledger hooks.
 *
 * useTribeTokenBalance  — player's token balance from ledger Table
 * useTribeTokenLedger   — full TribeTokenLedger shared object
 * useLedgerFrozen       — lightweight frozen-state check
 *
 * @depends useTribeEconomyObjects for ledgerId
 *
 * Move accessors:
 *   tribe_token_ledger::balance_of(ledger, player): u64
 *   tribe_token_ledger::total_supply(ledger): u64
 *   tribe_token_ledger::is_frozen(ledger): bool
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { suiClient } from "../sui-client";
import type { TribeTokenLedger, TribeTokenBalance } from "../../types/bazaareconomy";
import { BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID } from "../../constants";

// ── useTribeTokenBalance ───────────────────────────────────────────────────────

/**
 * Fetch a player's tribe token balance from the ledger Table.
 *
 * RPC: suiClient.getDynamicFieldObject with:
 *   parentId = ledgerId
 *   name     = { type: "address", value: walletAddress }
 *
 * The ledger.balances field is a Table<address, u64> in Move.
 * Returns 0 when the player has no account entry in the table.
 */
export function useTribeTokenBalance(
  ledgerId: string | null,
  walletAddress: string | null
) {
  const queryClient = useQueryClient();

  // Live-refresh on the global "bazar-soft-refresh" event (dispatched after a
  // claim / mint / burn) so the HUD wallet card updates without a page reload.
  useEffect(() => {
    const handler = () =>
      queryClient.invalidateQueries({ queryKey: ["bazaareconomy", "token-balance"] });
    window.addEventListener("bazar-soft-refresh", handler);
    return () => window.removeEventListener("bazar-soft-refresh", handler);
  }, [queryClient]);

  return useQuery<TribeTokenBalance | null>({
    queryKey: ["bazaareconomy", "token-balance", ledgerId, walletAddress],
    enabled: !!(ledgerId && walletAddress),
    queryFn: async (): Promise<TribeTokenBalance | null> => {
      // Fetch the ledger to extract the nested `balances` Table UID.
      // `TribeTokenLedger.balances: Table<address, u64>` is a NESTED Table
      // object; its dynamic fields live under `balances.id` (the Table's own
      // UID), NOT under the ledger's UID. The earlier revision queried
      // `parentId: ledgerId`, which always returned not-found → balance 0.
      // That hid the 100k genesis_mint credit at `gov_addr` (and every other
      // ledger row) on every read.
      const ledgerResult = await suiClient.getObject({
        id: ledgerId!,
        options: { showContent: true },
      });
      if (!ledgerResult.data?.content || ledgerResult.data.content.dataType !== "moveObject") {
        return { player: walletAddress!, balance: 0, decimals: 2, tribeId: 0, tokenSymbol: "" };
      }
      const lf = ledgerResult.data.content.fields as Record<string, unknown>;
      const balancesField = lf.balances as
        | { fields?: { id?: { id?: string } } }
        | undefined;
      const balancesTableId = balancesField?.fields?.id?.id;
      const ledgerMeta = {
        player: walletAddress!,
        tribeId: Number(lf.tribe_id),
        tokenSymbol: lf.token_symbol as string,
        decimals: Number(lf.decimals ?? 2),
      };
      if (!balancesTableId) {
        return { ...ledgerMeta, balance: 0 };
      }
      // Query the balances Table's dynamic field for this address.
      const balResult = await suiClient.getDynamicFieldObject({
        parentId: balancesTableId,
        name: { type: "address", value: walletAddress! },
      });
      if (!balResult.data?.content || balResult.data.content.dataType !== "moveObject") {
        return { ...ledgerMeta, balance: 0 };
      }
      const bf = balResult.data.content.fields as Record<string, unknown>;
      return { ...ledgerMeta, balance: Number(bf.value ?? 0) };
    },
    staleTime: 10_000,
  });
}

// ── useTribeTokenLedger ────────────────────────────────────────────────────────

/**
 * Fetch the full TribeTokenLedger shared object.
 *
 * RPC: suiClient.getObject({ id: ledgerId, options: { showContent: true } })
 * Maps Move snake_case fields to camelCase TypeScript fields.
 *
 * NOTE: The balances Table field is excluded — fetch individual balances
 * via useTribeTokenBalance or getDynamicField directly.
 */
export function useTribeTokenLedger(ledgerId: string | null) {

  return useQuery<TribeTokenLedger | null>({
    queryKey: ["bazaareconomy", "ledger", ledgerId],
    enabled: !!ledgerId,
    queryFn: async (): Promise<TribeTokenLedger | null> => {
      const obj = await suiClient.getObject({
        id: ledgerId!,
        options: { showContent: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") return null;
      const f = obj.data.content.fields as Record<string, unknown>;
      return {
        id: ledgerId!,
        tribeId: Number(f.tribe_id),
        totalSupply: Number(f.total_supply),
        supplyCap: Number(f.supply_cap),
        tokenName: f.token_name as string,
        tokenSymbol: f.token_symbol as string,
        decimals: Number(f.decimals),
        isFrozen: f.is_frozen as boolean,
        createdAtMs: Number(f.created_at_ms),
      };
    },
    staleTime: 15_000,
  });
}

// ── useTribeTokenSupply ────────────────────────────────────────────────────────

/**
 * Lightweight hook for total supply only. Shares the same query key as
 * useTribeTokenLedger but extracts only the supply field for components
 * that only need that value (ExchangeTab rate display).
 */
export function useTribeTokenSupply(ledgerId: string | null): number {
  const { data } = useTribeTokenLedger(ledgerId);
  return data?.totalSupply ?? 0;
}

// ── useLedgerFrozen ────────────────────────────────────────────────────────────

/**
 * Lightweight frozen-state check. Useful for disabling swap UI when ledger
 * is frozen by DApp owner emergency action (Constitution Article XIII emergency).
 */
export function useLedgerFrozen(ledgerId: string | null): boolean {
  const { data } = useTribeTokenLedger(ledgerId);
  return data?.isFrozen ?? false;
}

// ── useLifetimeMintTotal ───────────────────────────────────────────────────────

/**
 * Reconstructs the lifetime total tokens minted for a given tribeId by
 * paginating LedgerMintEvent events from the BazaarEconomy package.
 *
 * Uses BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID (V1-frozen) for the event-type filter
 * per Run-#9 invariant 1 — struct types in Sui retain the original publish ID.
 *
 * Subscribes to bazar-soft-refresh to invalidate on mint success.
 * Caps pagination at 50 pages (50,000 events) to prevent runaway queries.
 *
 * Returns: number (raw scaled units — V26+ tribe-token decimals = 2; consumers
 * that render this value should pass it through `formatTribeAmount(raw, { decimals: 2 })`
 * for human display).
 */
export function useLifetimeMintTotal(tribeId: number | null): number {
  const queryClient = useQueryClient();
  const q = useQuery<number>({
    queryKey: ["bazaareconomy", "lifetime-mint", tribeId],
    enabled: tribeId !== null && tribeId > 0,
    queryFn: async (): Promise<number> => {
      const eventType =
        `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::tribe_token_ledger::LedgerMintEvent`;
      let cursor: string | null = null;
      let total = BigInt(0);
      let pages = 0;
      do {
        const page = await suiClient.queryEvents({
          query: { MoveEventType: eventType },
          cursor,
          limit: 1000,
          descending_order: false,
        });
        for (const e of page.data) {
          const p = e.parsedJson as { tribe_id?: string | number; amount?: string | number } | null;
          if (p != null && Number(p.tribe_id) === tribeId) {
            total += BigInt(String(p.amount ?? 0));
          }
        }
        cursor = page.hasNextPage && page.nextCursor ? page.nextCursor : null;
        pages++;
        if (pages > 50) break;
      } while (cursor !== null);
      return Number(total);
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const handler = () =>
      queryClient.invalidateQueries({
        queryKey: ["bazaareconomy", "lifetime-mint", tribeId],
      });
    window.addEventListener("bazar-soft-refresh", handler);
    return () => window.removeEventListener("bazar-soft-refresh", handler);
  }, [queryClient, tribeId]);

  return q.data ?? 0;
}

// ── useLifetimeBurnTotal ───────────────────────────────────────────────────────

/**
 * Reconstructs the lifetime total tokens burned for a given tribeId by
 * paginating LedgerBurnEvent events from the BazaarEconomy package.
 *
 * Same pattern as useLifetimeMintTotal — see that hook's JSDoc for rationale.
 *
 * Returns: number (raw scaled units — V26+ tribe-token decimals = 2; consumers
 * that render this value should pass it through `formatTribeAmount(raw, { decimals: 2 })`
 * for human display).
 */
export function useLifetimeBurnTotal(tribeId: number | null): number {
  const queryClient = useQueryClient();
  const q = useQuery<number>({
    queryKey: ["bazaareconomy", "lifetime-burn", tribeId],
    enabled: tribeId !== null && tribeId > 0,
    queryFn: async (): Promise<number> => {
      const eventType =
        `${BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID}::tribe_token_ledger::LedgerBurnEvent`;
      let cursor: string | null = null;
      let total = BigInt(0);
      let pages = 0;
      do {
        const page = await suiClient.queryEvents({
          query: { MoveEventType: eventType },
          cursor,
          limit: 1000,
          descending_order: false,
        });
        for (const e of page.data) {
          const p = e.parsedJson as { tribe_id?: string | number; amount?: string | number } | null;
          if (p != null && Number(p.tribe_id) === tribeId) {
            total += BigInt(String(p.amount ?? 0));
          }
        }
        cursor = page.hasNextPage && page.nextCursor ? page.nextCursor : null;
        pages++;
        if (pages > 50) break;
      } while (cursor !== null);
      return Number(total);
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const handler = () =>
      queryClient.invalidateQueries({
        queryKey: ["bazaareconomy", "lifetime-burn", tribeId],
      });
    window.addEventListener("bazar-soft-refresh", handler);
    return () => window.removeEventListener("bazar-soft-refresh", handler);
  }, [queryClient, tribeId]);

  return q.data ?? 0;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
