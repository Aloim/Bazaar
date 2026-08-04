// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — `useGatedTransaction`.
 *
 * Canonical wrapper around `dAppKit.signAndExecuteTransaction` for the 3
 * bazaar apps (NoTribe / Easy / Advanced). Reads the announcement state via
 * Context and short-circuits with `ActionBlockedError` when an active Warning
 * is in force — also surfaces the blocking warning to
 * `<ActionBlockedModal />` via `signalBlocked`.
 *
 * Refactor pattern at every mutating call site:
 *
 *   // Before:
 *   const tx = buildWTSBuy(params);
 *   await dAppKit.signAndExecuteTransaction({ transaction: tx });
 *
 *   // After:
 *   const { executeGated } = useGatedTransaction();
 *   await executeGated((tx) => buildWTSBuy(params, tx));
 *
 * IMPORTANT: Per CLAUDE.md Run #12 DappHub-EXEMPT posture, this hook MUST NOT
 * be imported by any file under `apps/dapphub/src/`. Enforced by the vitest
 * static-grep at `packages/shared/__tests__/dapphub-exempt.test.ts`.
 *
 * File limit: 500 lines | Constitution Article XIV.4.
 */

import { useCallback, useRef, useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { dAppKit } from "@evefrontier/dapp-kit";
import { useDAppAnnouncementsContext } from "../../contexts/DAppAnnouncementsContext";
import { ActionBlockedError } from "../../errors/ActionBlockedError";

/** Builder shape: receives the in-flight Transaction; returns it after
 *  appending moveCalls. Matches EconomyFixplan Phase 11 builder convention. */
export type GatedBuilderFn = (tx: Transaction) => Transaction;

export interface GatedTxOptions {
  /** Intentionally typed as `never` so any caller attempting
   *  `bypassWarning: true` is a TypeScript compile error. The bypass path
   *  doesn't exist in code; the exemption lives at the import boundary
   *  (DappHub source never imports this hook). */
  bypassWarning?: never;
}

export interface UseGatedTransactionResult {
  /** Build + (when allowed) sign + execute. Throws `ActionBlockedError` if the
   *  global announcement state has an active Warning. */
  executeGated: (builder: GatedBuilderFn, opts?: GatedTxOptions) => Promise<unknown>;
  /** Retrofit-friendly variant — accepts an already-built Transaction.
   *  Useful for existing call sites that compose `const tx = new Transaction();
   *  …append moveCalls…; await dAppKit.signAndExecuteTransaction({ transaction: tx })`
   *  — the migration step is a 2-line swap (add the hook + replace the await).
   *  Same gate semantics as `executeGated`. */
  signGated: (tx: Transaction, opts?: GatedTxOptions) => Promise<unknown>;
  isExecuting: boolean;
  lastError: Error | null;
}

export function useGatedTransaction(): UseGatedTransactionResult {
  const { activeWarning, signalBlocked } = useDAppAnnouncementsContext();
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  // Stash the current activeWarning in a ref so executeGated reads a fresh
  // value at call time (not the value captured when the hook last ran). React
  // guarantees state freshness on re-render, but the ref makes the
  // post-await branch use the latest snapshot.
  const activeWarningRef = useRef(activeWarning);
  activeWarningRef.current = activeWarning;

  const checkAndThrowIfBlocked = useCallback(() => {
    const warning = activeWarningRef.current;
    if (warning) {
      const err = new ActionBlockedError(warning);
      signalBlocked(warning);
      setLastError(err);
      throw err;
    }
  }, [signalBlocked]);

  const executeGated = useCallback(
    async (builder: GatedBuilderFn, _opts?: GatedTxOptions): Promise<unknown> => {
      checkAndThrowIfBlocked();
      setIsExecuting(true);
      setLastError(null);
      try {
        const tx = new Transaction();
        builder(tx);
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        return result;
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setLastError(wrapped);
        throw wrapped;
      } finally {
        setIsExecuting(false);
      }
    },
    [checkAndThrowIfBlocked],
  );

  const signGated = useCallback(
    async (tx: Transaction, _opts?: GatedTxOptions): Promise<unknown> => {
      checkAndThrowIfBlocked();
      setIsExecuting(true);
      setLastError(null);
      try {
        const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
        return result;
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setLastError(wrapped);
        throw wrapped;
      } finally {
        setIsExecuting(false);
      }
    },
    [checkAndThrowIfBlocked],
  );

  return { executeGated, signGated, isExecuting, lastError };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
