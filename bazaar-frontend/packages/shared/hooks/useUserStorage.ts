// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect } from "react";
import { useConnection } from "@evefrontier/dapp-kit";

export interface LockedItem {
  itemTypeId: number;
  quantity:   number;
  shopId:     string;
}

export interface UserStorageResult {
  usedVolume:  number;
  volumeLimit: number;
  lockedItems: LockedItem[];
  isLoading:   boolean;
  error:       string | null;
  refetch:     () => void;
}

/**
 * Reads the connected user's UserStorage entry from the UserStorageRegistry
 * via the Sui GraphQL endpoint.
 *
 * The UserStorageRegistry is a shared object whose dynamic fields are keyed
 * by player address. Each field value (a MoveObject) contains:
 *   - used_volume: u64
 *   - volume_limit: u64
 *   - locked_items: vector<LockedItem>  (each with item_type_id, quantity, shop_id)
 *
 * When the registry object ID is not configured (VITE_USER_STORAGE_REGISTRY_ID
 * absent) the hook returns zeroed state immediately — graceful degradation for
 * environments where the user storage module is not deployed.
 */
export function useUserStorage(): UserStorageResult {
  const { walletAddress } = useConnection();

  const [usedVolume,  setUsedVolume]  = useState(0);
  const [volumeLimit, setVolumeLimit] = useState(0);
  const [lockedItems, setLockedItems] = useState<LockedItem[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [tick,        setTick]        = useState(0);

  const refetch = () => setTick(t => t + 1);

  useEffect(() => {
    const registryId = import.meta.env.VITE_USER_STORAGE_REGISTRY_ID as string | undefined;
    const endpoint   = import.meta.env.VITE_SUI_GRAPHQL_ENDPOINT as string | undefined;

    // Graceful degradation — feature not deployed or wallet not connected.
    if (!registryId || !endpoint || !walletAddress) {
      setIsLoading(false);
      setUsedVolume(0);
      setVolumeLimit(0);
      setLockedItems([]);
      setError(null);
      return;
    }

    setIsLoading(true);

    // Query all dynamic fields of the UserStorageRegistry and find the one
    // whose key matches the connected wallet address.
    const query = `{
      object(address: "${registryId}") {
        dynamicFields {
          nodes {
            name { json }
            value {
              ... on MoveObject {
                contents { json }
              }
            }
          }
        }
      }
    }`;

    fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`GraphQL HTTP ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        const nodes: unknown[] =
          (data as any)?.data?.object?.dynamicFields?.nodes ?? [];

        // Find the dynamic field whose key is the connected wallet address.
        // GraphQL returns addresses as lowercase hex strings.
        const normalised = walletAddress.toLowerCase();
        const entry = nodes.find((n: any) => {
          const keyJson = n?.name?.json;
          if (typeof keyJson === "string") {
            return keyJson.toLowerCase() === normalised;
          }
          return false;
        }) as any | undefined;

        if (!entry) {
          // User has no storage entry yet — treat as zeroed state.
          setUsedVolume(0);
          setVolumeLimit(0);
          setLockedItems([]);
          setError(null);
          return;
        }

        const fields = entry?.value?.contents?.json ?? {};

        setUsedVolume(Number(fields.used_volume ?? 0));
        setVolumeLimit(Number(fields.volume_limit ?? 0));

        const rawLocked: any[] = Array.isArray(fields.locked_items)
          ? fields.locked_items
          : [];

        const locked: LockedItem[] = rawLocked.map(l => ({
          itemTypeId: Number(l.item_type_id ?? 0),
          quantity:   Number(l.quantity ?? 0),
          shopId:     String(l.shop_id ?? ""),
        }));

        setLockedItems(locked);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load user storage");
      })
      .finally(() => setIsLoading(false));
  }, [walletAddress, tick]);

  return { usedVolume, volumeLimit, lockedItems, isLoading, error, refetch };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
