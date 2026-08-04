// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — `useLegacySsuEveBalance`.
 *
 * Reads the `tax_wallet: Balance<EVE>` field on `bazaar_core::ssu_governance::SSUGovernance`.
 * Returned via `Balance.value` (u64 string). Polls every 15s while mounted
 * (matches existing SSUGovernance hooks). Returns `0n` when `ssuGovId` is
 * null / empty.
 *
 * Drives the `<LegacySSUWithdrawButton />` visibility logic — Phase B's drain
 * batch should leave this at zero; the button only renders when residual
 * remains.
 *
 * File limit: 500 lines | Constitution Article XIV.4.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { suiClient } from "../sui-client";

const DEFAULT_POLL_MS = 15_000;

export interface UseLegacySsuEveBalanceResult {
  balanceMist: bigint;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useLegacySsuEveBalance(
  ssuGovId: string | null,
  pollIntervalMs: number = DEFAULT_POLL_MS,
): UseLegacySsuEveBalanceResult {
  const [balanceMist, setBalance] = useState<bigint>(0n);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!ssuGovId) {
      setBalance(0n);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const myReq = ++reqIdRef.current;

    async function fetchOnce() {
      setIsLoading(true);
      try {
        const obj = await suiClient.getObject({
          id: ssuGovId!,
          options: { showContent: true },
        });
        if (cancelled || myReq !== reqIdRef.current) return;
        const content = obj.data?.content as { fields?: Record<string, unknown> } | undefined;
        const tw = content?.fields?.tax_wallet as { fields?: { value?: string } } | string | undefined;
        // Balance<EVE> sometimes renders as `{ fields: { value: "..." } }` and
        // sometimes as the raw u64 string depending on RPC.
        let val: string | undefined;
        if (typeof tw === "string") val = tw;
        else val = tw?.fields?.value;
        const parsed = val ? BigInt(val) : 0n;
        setBalance(parsed);
        setError(null);
      } catch (err) {
        if (cancelled || myReq !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled && myReq === reqIdRef.current) setIsLoading(false);
      }
    }

    void fetchOnce();
    const timer = window.setInterval(fetchOnce, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ssuGovId, pollIntervalMs, tick]);

  return { balanceMist, isLoading, error, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
