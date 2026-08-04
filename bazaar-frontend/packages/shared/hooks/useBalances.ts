// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// OS-29 R6.6.5: tribe_coin type deleted. Hook retargeted to EVE-only.
// tribeBalance removed from return shape (Decision #5: no silent-zero against deleted type).
// bazar-soft-refresh replaces tribe-balance-changed (CC-005).

import { useEffect, useMemo } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useSuiQuery } from "./useSuiQuery";
import { EVE_COIN_TYPE } from "../constants";

export function useBalances() {
  const { walletAddress } = useConnection();

  const { data: eveData, isLoading, refetch } = useSuiQuery<{ totalBalance: string }>(
    "getBalance",
    {
      owner:    walletAddress ?? "",
      coinType: EVE_COIN_TYPE,
    },
    { enabled: !!walletAddress }
  );

  const eveBalance = useMemo(
    () => Number(eveData?.totalBalance ?? 0),
    [eveData]
  );

  useEffect(() => {
    const handler = () => { setTimeout(refetch, 1500); };
    window.addEventListener("bazar-soft-refresh", handler);
    return () => window.removeEventListener("bazar-soft-refresh", handler);
  }, [refetch]);

  // Poll balance every 15s so incoming payments (from other users) are reflected
  useEffect(() => {
    if (!walletAddress) return;
    const interval = setInterval(refetch, 15_000);
    return () => clearInterval(interval);
  }, [walletAddress, refetch]);

  return { eveBalance, isLoading, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
