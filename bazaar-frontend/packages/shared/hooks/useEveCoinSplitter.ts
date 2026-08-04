// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * EVE coin splitter — resolves a wallet-owned Coin<EVE> object and produces
 * a tx.splitCoins(...) TransactionArgument for PTB payment calls.
 *
 * All payment TX builders in this project accept a pre-split `coinArg` parameter
 * (pattern A) so they remain synchronous. Callers must call splitEveCoin BEFORE
 * building the TX, then pass the resulting coinArg into the builder.
 *
 * RPC method used: suix_getCoins (via suiClient.getCoins — see sui-client.ts Section 5.C).
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import type { Transaction, TransactionArgument } from "@mysten/sui/transactions";
import { suiClient } from "./sui-client";
import { EVE_COIN_TYPE } from "../constants";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EveCoinSplit {
  /** TransactionArgument representing the split Coin<EVE> ready for a moveCall. */
  coinArg: TransactionArgument;
  /** The primary source coin object ID used (for diagnostics / logging). */
  sourceCoinId: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Paginate all Coin<EVE> objects owned by walletAddress.
 * Returns coins sorted descending by balance (largest first) for greedy selection.
 */
async function fetchAllEveCoins(
  walletAddress: string,
): Promise<Array<{ coinObjectId: string; balance: bigint }>> {
  const coins: Array<{ coinObjectId: string; balance: bigint }> = [];
  let cursor: string | null = null;

  do {
    // suiClient.getCoins wraps suix_getCoins — typed in sui-client.ts Section 5.C.
    const page = await suiClient.getCoins({
      owner: walletAddress,
      coinType: EVE_COIN_TYPE,
      cursor,
      limit: 50,
    });

    for (const coin of page.data) {
      coins.push({
        coinObjectId: coin.coinObjectId,
        balance: BigInt(coin.balance),
      });
    }

    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor !== null);

  // Sort descending — greedy: pick the largest coin first to minimise merges.
  coins.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
  return coins;
}

/**
 * Pick the id of a single Coin<EVE> whose balance covers `minMist`, for the
 * synchronous fee builders (which split the exact fee from one coin object).
 * Returns the largest such coin, or null if the wallet has none big enough.
 * Used by the V31 registration/creation-fee flows; skip the call when fee is 0.
 */
export async function pickEveCoinId(
  walletAddress: string,
  minMist: number,
): Promise<string | null> {
  if (minMist <= 0) return null;
  const coins = await fetchAllEveCoins(walletAddress);
  const need = BigInt(Math.round(minMist));
  const hit = coins.find(c => c.balance >= need);
  return hit ? hit.coinObjectId : null;
}

// ── splitEveCoin ──────────────────────────────────────────────────────────────

/**
 * Resolve a wallet-owned Coin<EVE> for PTB payment.
 *
 * Steps:
 * 1. Page suix_getCoins for all Coin<EVE> owned by walletAddress.
 * 2. If a single coin has balance >= amount: splitCoins from it and return.
 * 3. If multiple coins are needed: mergeCoins into the largest, then splitCoins.
 * 4. If total balance < amount: throw with a clear "Insufficient EVE balance" message.
 *
 * Zero-amount splits (amount = 0n) are valid — the Move trade contract accepts
 * Coin<EVE> with zero balance for zero-EVE trade proposals.
 *
 * The returned coinArg is a TransactionArgument that can be passed directly to
 * any moveCall that expects Coin<EVE> by value.
 *
 * IMPORTANT: The `tx` object passed here is the same Transaction that the caller
 * will sign and execute. The merge + split operations are appended in-place to tx.
 *
 * @param walletAddress  - Connected wallet address (from useConnection or component prop).
 * @param amount         - Required amount in MIST (bigint). 0n is valid.
 * @param tx             - The Transaction being built (mutated in place).
 * @returns EveCoinSplit  - { coinArg, sourceCoinId }
 * @throws Error          - If wallet has no EVE or insufficient balance.
 */
export async function splitEveCoin(
  walletAddress: string,
  amount: bigint,
  tx: Transaction,
): Promise<EveCoinSplit> {
  if (!walletAddress) {
    throw new Error("Wallet not connected. Connect your wallet before attempting a transaction.");
  }

  const coins = await fetchAllEveCoins(walletAddress);

  if (coins.length === 0) {
    throw new Error(
      "Insufficient EVE balance: no Coin<EVE> objects found in your wallet. " +
      "Obtain EVE on the testnet faucet before proceeding."
    );
  }

  const totalBalance = coins.reduce((sum, c) => sum + c.balance, 0n);
  if (totalBalance < amount) {
    const haveEve = Number(totalBalance) / 1_000_000_000;
    const needEve = Number(amount) / 1_000_000_000;
    throw new Error(
      `Insufficient EVE balance: need ${needEve.toFixed(4)} EVE, ` +
      `wallet holds ${haveEve.toFixed(4)} EVE.`
    );
  }

  // Greedy selection: accumulate coins until we have >= amount.
  let accumulated = 0n;
  const selectedCoins: Array<{ coinObjectId: string; balance: bigint }> = [];
  for (const coin of coins) {
    selectedCoins.push(coin);
    accumulated += coin.balance;
    if (accumulated >= amount) break;
  }

  const primaryCoin = selectedCoins[0];

  // If more than one coin needed, merge extras into the primary first.
  if (selectedCoins.length > 1) {
    const mergeArgs = selectedCoins.slice(1).map(c => tx.object(c.coinObjectId));
    tx.mergeCoins(tx.object(primaryCoin.coinObjectId), mergeArgs);
  }

  // Split the exact payment amount from the (possibly merged) primary coin.
  const [coinArg] = tx.splitCoins(
    tx.object(primaryCoin.coinObjectId),
    [tx.pure.u64(amount)],
  );

  return { coinArg, sourceCoinId: primaryCoin.coinObjectId };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
