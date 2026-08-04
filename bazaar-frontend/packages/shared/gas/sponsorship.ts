// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * sponsorship.ts — frontend half of Sui dual-signature gas sponsorship.
 *
 * installGasSponsorship() monkey-patches the @evefrontier/dapp-kit `dAppKit`
 * singleton's signAndExecuteTransaction so EVERY transaction in the app first
 * tries the sponsored path (sponsor pays gas — the player's wallet needs zero
 * SUI) and silently falls back to the original user-paid path on any
 * sponsorship failure. One wrap point covers all call sites, including the
 * useGatedTransaction chokepoint.
 *
 * Sponsored path (per SPONSORED_TRANSACTION_WORKFLOW_GUIDE):
 *   1. tx.build({ client, onlyTransactionKind: true })  — intent only, no gas
 *   2. POST kind bytes + sender to the gas-sponsor Netlify Function
 *   3. Function validates + attaches sponsor gas + co-signs → {txB64, sponsorSig}
 *   4. dAppKit.signTransaction (sign-only) — EVE Vault prompts the player
 *   5. client.core.executeTransaction with [playerSig, sponsorSig]
 *      → returns the SAME TransactionResult shape as the original method.
 *
 * Fallback rules:
 *   - 404/503 from the function (not deployed / disabled / no key): open the
 *     circuit breaker — stop trying for this session, run user-paid directly.
 *   - 403 (this tx not eligible) or any transient error: user-paid for this
 *     tx only; sponsorship stays on.
 *   - The player REJECTING the wallet prompt is NOT a fallback case — the
 *     rejection propagates (no double-prompting someone who said no).
 *
 * checkSponsorHealth() is the UI-facing probe (used by AlphaFaucetNotice to
 * decide whether the manual faucet card is needed at all).
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { dAppKit } from "@evefrontier/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { toBase64, fromBase64 } from "@mysten/sui/utils";
import { GAS_SPONSOR_FUNCTION_PATH } from "@bazaar/shared/constants";

const SPONSOR_TIMEOUT_MS = 8_000; // sponsor builds via RPC + Netlify cold start
const HEALTH_TIMEOUT_MS = 3_000;

let installed = false;
let breakerOpen = false;
let healthCache: boolean | null = null;

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/** Wallet-rejection detection (best effort across wallet error shapes). */
function isUserRejection(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /reject|denied|declin|cancel|dismiss/i.test(msg);
}

/**
 * True when the gas-sponsor function is deployed, enabled, and holds a key.
 * Cached for the session (the answer only changes on redeploys).
 */
export async function checkSponsorHealth(): Promise<boolean> {
  if (healthCache !== null) return healthCache;
  try {
    const r = await fetchWithTimeout(GAS_SPONSOR_FUNCTION_PATH, { method: "GET" }, HEALTH_TIMEOUT_MS);
    if (!r.ok) return (healthCache = false);
    const body = (await r.json()) as { sponsoring?: boolean };
    return (healthCache = body.sponsoring === true);
  } catch {
    return (healthCache = false);
  }
}

/** True once the wrapper has been installed AND the breaker hasn't tripped. */
export function isSponsorshipActive(): boolean {
  return installed && !breakerOpen;
}

type SignAndExecuteArgs = { transaction: Transaction | string } & Record<string, unknown>;

/**
 * Install the sponsored-execution wrapper on the dAppKit singleton.
 * Idempotent; no-ops when the dAppKit surface is absent (e.g. test mocks).
 * Call once per app, before the first transaction (apps/<app>/src/main.tsx).
 */
export function installGasSponsorship(): void {
  if (installed) return;

  // Defensive surface check — vitest mocks and future dapp-kit versions may
  // not expose everything the wrapper needs; in that case leave it unpatched.
  const dk = dAppKit as unknown as {
    signAndExecuteTransaction?: (args: SignAndExecuteArgs) => Promise<unknown>;
    signTransaction?: (args: { transaction: Transaction }) => Promise<{ bytes: string; signature: string }>;
    getClient?: () => unknown;
    stores?: { $connection?: { get?: () => { account?: { address?: string } } } };
  };
  if (
    typeof dk.signAndExecuteTransaction !== "function" ||
    typeof dk.signTransaction !== "function" ||
    typeof dk.getClient !== "function"
  ) {
    return;
  }

  installed = true;
  const original = dk.signAndExecuteTransaction.bind(dAppKit);

  dk.signAndExecuteTransaction = async (args: SignAndExecuteArgs) => {
    if (breakerOpen) return original(args);

    const tx = args?.transaction;
    const sender = dk.stores?.$connection?.get?.()?.account?.address;
    // String-serialized transactions and missing connections: rare paths we
    // don't try to sponsor — hand straight to the original implementation.
    if (!sender || !tx || typeof tx === "string") return original(args);

    let walletPromptShown = false;
    try {
      const client = dk.getClient!() as {
        core: {
          executeTransaction: (opts: {
            transaction: Uint8Array;
            signatures: string[];
            include?: Record<string, boolean>;
          }) => Promise<unknown>;
        };
      };

      // Set the sender BEFORE building. The @mysten/sui v2 gRPC client
      // simulates the transaction during build() to resolve inputs; with no
      // sender it simulates as 0x0 and the node rejects ANY owned-object input
      // — e.g. a buy's payment Coin<EVE> — with "Transaction was not signed by
      // the correct sender", which throws here and silently drops the tx to the
      // user-paid fallback (fatal for a zero-SUI player). onlyTransactionKind
      // still omits the sender from the emitted bytes, so the sponsor remains
      // free to set sender + gas on its side. (Actions with no owned-object
      // input — register, shop-create — dodged this, which is why only BUYS
      // failed.) See memory reference_sponsored_build_sender_0x0.
      tx.setSender(sender);

      // 1. Intent only — no gas info; the sponsor controls gas-coin selection.
      const kindBytes = await tx.build({ client: client as never, onlyTransactionKind: true });

      // 2. Ask the sponsor service to validate + attach gas + co-sign.
      const r = await fetchWithTimeout(
        GAS_SPONSOR_FUNCTION_PATH,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txKindB64: toBase64(kindBytes), sender, timestamp: Date.now() }),
        },
        SPONSOR_TIMEOUT_MS,
      );
      if (r.status === 404 || r.status === 503) {
        breakerOpen = true; // not deployed / disabled — stop asking this session
        return original(args);
      }
      if (!r.ok) return original(args); // 403 not-eligible etc. — this tx only

      const { txB64, sponsorSignature } = (await r.json()) as { txB64: string; sponsorSignature: string };

      // 3. Player signs the sponsor-built bytes (sign-only — no execution).
      walletPromptShown = true;
      const signed = await dk.signTransaction!({ transaction: Transaction.from(fromBase64(txB64)) });

      // 4. Execute with both signatures; same include set as the native path
      //    so callers get the identical TransactionResult shape.
      return await client.core.executeTransaction({
        transaction: fromBase64(signed.bytes),
        signatures: [signed.signature, sponsorSignature],
        include: { effects: true, transaction: true, bcs: true },
      });
    } catch (e) {
      // The player said no — propagate; re-prompting via fallback would be hostile.
      if (walletPromptShown && isUserRejection(e)) throw e;
      // Anything else (sponsor down, wallet refused the sponsored SHAPE, RPC
      // hiccup): fall back to the normal user-paid prompt. Log WHY first — a
      // zero-SUI player otherwise only ever sees the downstream "insufficient
      // SUI" from the fallback, which masks the real cause (this exact failure
      // mode hid behind that message and took a long investigation to find).
      console.warn("[gas-sponsorship] sponsored path failed; falling back to user-paid gas:", e);
      return original(args);
    }
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
