// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { WORLD_PACKAGE_ID } from "@bazaar/shared/constants";
import { debug } from "@bazaar/shared/utils/debug";

// ── Sui object-ID validator ───────────────────────────────────────────────────
// A canonical Sui object ID is "0x" + 64 lowercase hex characters (total 66).
// Fullnode returns "Invalid params" for anything shorter/longer or non-hex.
function isSuiObjectId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.startsWith("0x") &&
    id.length === 66 &&
    /^[0-9a-f]+$/i.test(id.slice(2))
  );
}

export interface PlayerCharacter {
  characterId:      string;
  ownerCapId:       string;
  ownerCapVersion:  string;
  ownerCapDigest:   string;
}

/**
 * Resolves the current wallet's Character and OwnerCap objects from the
 * EVE Frontier world contracts.
 *
 * Resolution chain (3-step):
 *   1. Query wallet for PlayerProfile → extract character_id
 *   2. Query Character (shared object) → extract owner_cap_id
 *   3. Query OwnerCap (owned by Character) → extract version + digest for Receiving
 */
export function usePlayerCharacter(): {
  character:     PlayerCharacter | null;
  isLoading:     boolean;
  error:         string | null;
  resolveCapRef: () => Promise<{ ownerCapVersion: string; ownerCapDigest: string }>;
} {
  const { walletAddress } = useConnection();
  const [character, setCharacter]   = useState<PlayerCharacter | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    const envCharId   = import.meta.env.VITE_CHARACTER_ID as string | undefined;
    const envCapId    = import.meta.env.VITE_OWNER_CAP_ID as string | undefined;
    const envCapVer   = import.meta.env.VITE_OWNER_CAP_VERSION as string | undefined;
    const envCapDig   = import.meta.env.VITE_OWNER_CAP_DIGEST as string | undefined;
    if (envCharId && envCapId && envCapVer && envCapDig) {
      setCharacter({ characterId: envCharId, ownerCapId: envCapId, ownerCapVersion: envCapVer, ownerCapDigest: envCapDig });
      setIsLoading(false);
      setError(null);
      return;
    }

    if (!walletAddress) {
      setCharacter(null);
      return;
    }

    const rpcUrl = import.meta.env.VITE_SUI_RPC_URL as string | undefined
      ?? "https://api.zan.top/public/sui-testnet";

    const playerProfileType = `${WORLD_PACKAGE_ID}::character::PlayerProfile`;
    debug("[usePlayerCharacter] Step 1: querying PlayerProfile type:", playerProfileType, "wallet:", walletAddress);

    setIsLoading(true);
    setError(null);

    async function rpc(method: string, params: unknown[]): Promise<any> {
      const r = await fetch(rpcUrl!, {
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
      const profileResult = await rpc("suix_getOwnedObjects", [
        walletAddress,
        { filter: { StructType: playerProfileType }, options: { showContent: true } },
        null, 1,
      ]);
      const profiles: any[] = profileResult?.data ?? [];
      debug("[usePlayerCharacter] Step 1 result: PlayerProfiles found:", profiles.length);
      if (profiles.length === 0) throw new Error("No PlayerProfile found for this wallet — character not created in EVE Frontier");

      const characterId = profiles[0]?.data?.content?.fields?.character_id as string | undefined;
      if (!characterId) throw new Error("PlayerProfile missing character_id field");
      if (!isSuiObjectId(characterId)) {
        console.error(
          "[usePlayerCharacter] characterId is not a valid Sui object ID:",
          JSON.stringify(characterId),
          "— skipping getObject to avoid Invalid params RPC error",
        );
        throw new Error(`PlayerProfile returned malformed character_id: "${characterId}"`);
      }
      debug("[usePlayerCharacter] Step 1: characterId =", characterId);

      const charResult = await rpc("sui_getObject", [characterId, { showContent: true, showType: true }]);
      const charFields = charResult?.data?.content?.fields as Record<string, any> | undefined;
      const ownerCapId = charFields?.owner_cap_id as string | undefined;
      if (!ownerCapId) throw new Error("Character object missing owner_cap_id field");
      if (!isSuiObjectId(ownerCapId)) {
        console.error(
          "[usePlayerCharacter] ownerCapId is not a valid Sui object ID:",
          JSON.stringify(ownerCapId),
          "— skipping getObject to avoid Invalid params RPC error",
        );
        throw new Error(`Character returned malformed owner_cap_id: "${ownerCapId}"`);
      }
      debug("[usePlayerCharacter] Step 2: ownerCapId =", ownerCapId);

      const capResult = await rpc("sui_getObject", [ownerCapId, { showType: true }]);
      const ownerCapVersion = String(capResult?.data?.version);
      const ownerCapDigest  = capResult?.data?.digest as string | undefined;
      if (!ownerCapVersion || !ownerCapDigest) throw new Error("Could not read OwnerCap version/digest");
      debug("[usePlayerCharacter] Step 3: resolved OwnerCap:", { ownerCapId, ownerCapVersion, ownerCapDigest });

      setCharacter({ characterId, ownerCapId, ownerCapVersion, ownerCapDigest });
      setError(null);
    })().catch((e: unknown) => {
      console.error("[usePlayerCharacter] FAILED:", e);
      setError(e instanceof Error ? e.message : "Failed to load player character");
      setCharacter(null);
    }).finally(() => setIsLoading(false));
  }, [walletAddress]);

  const resolveCapRef = useCallback(async (): Promise<{ ownerCapVersion: string; ownerCapDigest: string }> => {
    if (!character) throw new Error("Cannot resolve OwnerCap ref: character not loaded");
    const url = import.meta.env.VITE_SUI_RPC_URL as string | undefined
      ?? "https://api.zan.top/public/sui-testnet";
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "sui_getObject",
        params: [character.ownerCapId, { showType: true }],
      }),
    });
    if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
    const data = await resp.json();
    if (data?.error) throw new Error(data.error.message);
    const version = String(data?.result?.data?.version);
    const digest = data?.result?.data?.digest as string;
    if (!version || !digest) throw new Error(`Could not read OwnerCap version/digest for ${character.ownerCapId}`);
    return { ownerCapVersion: version, ownerCapDigest: digest };
  }, [character]);

  return { character, isLoading, error, resolveCapRef };
}

/**
 * One-shot async helper: resolve a wallet address to its EVE Frontier character_id.
 */
export async function resolveCharacterIdByWallet(walletAddress: string): Promise<string | null> {
  const rpcUrl = (import.meta.env.VITE_SUI_RPC_URL as string | undefined)
    ?? "https://api.zan.top/public/sui-testnet";
  const playerProfileType = `${WORLD_PACKAGE_ID}::character::PlayerProfile`;
  try {
    const resp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "suix_getOwnedObjects",
        params: [walletAddress, { filter: { StructType: playerProfileType }, options: { showContent: true } }, null, 1],
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const profiles: unknown[] = data?.result?.data ?? [];
    if (profiles.length === 0) return null;
    const characterId = (profiles[0] as any)?.data?.content?.fields?.character_id as string | undefined;
    if (!isSuiObjectId(characterId)) {
      console.warn("[resolveCharacterIdByWallet] character_id is missing or malformed:", JSON.stringify(characterId));
      return null;
    }
    return characterId;
  } catch {
    return null;
  }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
