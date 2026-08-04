// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * abi-snapshot-helpers.ts — shared introspection helpers for the builder-ABI
 * snapshot tests (builder-abi-snapshots*.test.ts). NOT a test file itself.
 * Maps a built Transaction's MoveCall arg vector to "obj:<id>" / "pure" / "result"
 * so tests can pin the exact ordered ABI shape that must match the Move entry.
 */

import { expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";

export const ID = (n: number) => "0x" + n.toString(16).padStart(64, "0");
export const CLOCK = "0x6";
// 32 base58 "1"s decode to 32 zero bytes — a structurally valid object digest.
export const DIGEST = "11111111111111111111111111111111";

type AnyRec = Record<string, any>;

export function describeCalls(tx: Transaction): Array<{ target: string; args: string[] }> {
  const data = tx.getData() as AnyRec;
  const inputs: AnyRec[] = data.inputs ?? [];
  const calls: Array<{ target: string; args: string[] }> = [];
  for (const cmd of (data.commands ?? []) as AnyRec[]) {
    const mc = cmd.MoveCall;
    if (!mc) continue;
    const args = ((mc.arguments ?? []) as AnyRec[]).map(a => {
      const idx = typeof a.Input === "number" ? a.Input : undefined;
      if (idx !== undefined) {
        const input = inputs[idx] ?? {};
        const objId =
          input.UnresolvedObject?.objectId ??
          input.Object?.SharedObject?.objectId ??
          input.Object?.ImmOrOwnedObject?.objectId ??
          input.Object?.Receiving?.objectId;
        return objId ? `obj:${objId}` : "pure";
      }
      return "result"; // Result / NestedResult / GasCoin — an in-PTB value
    });
    calls.push({ target: `${mc.module}::${mc.function}`, args });
  }
  return calls;
}

export const lastCall = (tx: Transaction) => {
  const calls = describeCalls(tx);
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1];
};

/** Find the (single) MoveCall whose target is `module::function`. */
export const callByTarget = (tx: Transaction, target: string) => {
  const matches = describeCalls(tx).filter(c => c.target === target);
  expect(matches.length, `exactly one ${target} call`).toBe(1);
  return matches[0];
};

/** Expected entry: an object id string (compared numerically), "pure", or "result". */
export function expectArgs(actual: string[], expected: string[]) {
  expect(actual.length).toBe(expected.length);
  expected.forEach((exp, i) => {
    if (exp === "pure" || exp === "result") {
      expect(actual[i], `arg[${i}]`).toBe(exp);
    } else {
      expect(actual[i].startsWith("obj:"), `arg[${i}] should be an object`).toBe(true);
      expect(BigInt(actual[i].slice(4)), `arg[${i}] object id`).toBe(BigInt(exp));
    }
  });
}

export const coinArg = (tx: Transaction) => {
  const [c] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
  return c;
};

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
