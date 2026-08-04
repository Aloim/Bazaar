// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect } from "react";
import { WORLD_PACKAGE_ID } from "@bazaar/shared/constants";

interface CharacterInfo {
  characterId: string | null;
  ownerCapId:  string | null;
  isLoading:   boolean;
  error:       string | null;
}

/**
 * Resolves an arbitrary wallet address to their Character ID and OwnerCap ID.
 * Only runs Steps 1-2 of the character resolution chain:
 *   1. wallet → PlayerProfile → character_id
 *   2. character_id → Character object → owner_cap_id
 */
export function useCharacterForAddress(walletAddress: string | undefined): CharacterInfo {
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [ownerCapId, setOwnerCapId]   = useState<string | null>(null);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setCharacterId(null);
      setOwnerCapId(null);
      setError(null);
      return;
    }

    const rpcUrl = (import.meta.env.VITE_SUI_RPC_URL as string | undefined)
      ?? "https://api.zan.top/public/sui-testnet";
    const playerProfileType = `${WORLD_PACKAGE_ID}::character::PlayerProfile`;

    let aborted = false;
    setIsLoading(true);
    setError(null);

    async function rpc(method: string, params: unknown[]): Promise<any> {
      const r = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
      const json = await r.json();
      if (json.error) throw new Error(`RPC error: ${json.error.message}`);
      return json.result;
    }

    (async () => {
      // Step 1: wallet → PlayerProfile → character_id
      const profileResult = await rpc("suix_getOwnedObjects", [
        walletAddress,
        { filter: { StructType: playerProfileType }, options: { showContent: true } },
        null, 1,
      ]);
      const profiles: any[] = profileResult?.data ?? [];
      if (profiles.length === 0) throw new Error("No EVE Frontier character found for this address");

      const charId = profiles[0]?.data?.content?.fields?.character_id as string | undefined;
      if (!charId) throw new Error("PlayerProfile missing character_id");

      // Step 2: character_id → Character → owner_cap_id
      const charResult = await rpc("sui_getObject", [
        charId,
        { showContent: true },
      ]);
      const capId = charResult?.data?.content?.fields?.owner_cap_id as string | undefined;
      if (!capId) throw new Error("Character missing owner_cap_id");

      if (!aborted) {
        setCharacterId(charId);
        setOwnerCapId(capId);
        setError(null);
      }
    })().catch(e => {
      if (!aborted) {
        setCharacterId(null);
        setOwnerCapId(null);
        setError(e instanceof Error ? e.message : "Failed to resolve character");
      }
    }).finally(() => {
      if (!aborted) setIsLoading(false);
    });

    return () => { aborted = true; };
  }, [walletAddress]);

  return { characterId, ownerCapId, isLoading, error };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
