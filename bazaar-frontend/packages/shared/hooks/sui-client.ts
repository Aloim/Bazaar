// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Shared Sui RPC client singleton — JSON-RPC 2.0 over HTTP.
 *
 * Replaces the broken @mysten/sui/client SuiClient (removed in v2.16.0).
 * Uses raw fetch calls to the Sui JSON-RPC endpoint, matching the interface
 * already used by all hooks in this package.
 *
 * Bazar1 reference: BazaarLight/dapp/frontend/src/hooks/useSuiQuery.ts
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */
import { NETWORK } from "../constants";

let _rpcId = 0;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(NETWORK.RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++_rpcId,
      method,
      params,
    }),
  });
  if (!res.ok) throw new Error(`Sui RPC HTTP ${res.status} for ${method}`);
  const json = await res.json();
  if (json.error) {
    throw new Error(
      `Sui RPC error [${method}]: ${json.error.message ?? JSON.stringify(json.error)}`
    );
  }
  return json.result as T;
}

// ── Type definitions matching the old SuiClient interface ──────────────────────

export interface SuiObjectResponse {
  data?: {
    content?: { dataType?: string; fields?: Record<string, unknown> } | { dataType: string; fields: Record<string, unknown> };
    objectId?: string;
    type?: string;
  };
}

export interface DynamicFieldPage {
  data: Array<{ name: { type: string; value: unknown }; objectId?: string }>;
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface SuiEventPage {
  data: Array<{
    id: { txDigest: string; eventSeq: string };
    packageId: string;
    transactionModule: string;
    parsedJson: Record<string, unknown> | null;
  }>;
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface SuiTransactionBlockResponse {
  digest: string;
  objectChanges?: Array<{
    type: string;
    objectId: string;
    objectType?: string;
    [key: string]: unknown;
  }>;
  /**
   * Transaction effects. Unlike objectChanges, effects are NOT pruned by Sui
   * fullnodes — they survive for the life of the transaction. `created` carries
   * only the object reference (id/version/digest), NOT the type; recover types
   * via multiGetObjects(showType). Used as the fallback when objectChanges is
   * null (pruned). See governance-resolution-hooks._resolveCreatedIdsBySuffix.
   */
  effects?: {
    created?: Array<{ reference: { objectId: string; version?: string | number; digest?: string } }>;
    [key: string]: unknown;
  };
}

// ── Client object ──────────────────────────────────────────────────────────────

export const suiClient = {
  /** sui_getObject */
  getObject(input: {
    id: string;
    options?: Record<string, boolean>;
  }): Promise<SuiObjectResponse> {
    return rpc<SuiObjectResponse>("sui_getObject", [
      input.id,
      input.options ?? { showContent: true },
    ]);
  },

  /** sui_multiGetObjects — batch-fetch many objects in one RPC. */
  multiGetObjects(input: {
    ids: string[];
    options?: Record<string, boolean>;
  }): Promise<SuiObjectResponse[]> {
    return rpc<SuiObjectResponse[]>("sui_multiGetObjects", [
      input.ids,
      input.options ?? { showContent: true },
    ]);
  },

  /** suix_getDynamicFields */
  getDynamicFields(input: {
    parentId: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<DynamicFieldPage> {
    return rpc<DynamicFieldPage>("suix_getDynamicFields", [
      input.parentId,
      input.cursor ?? null,
      input.limit ?? null,
    ]);
  },

  /** suix_getDynamicFieldObject */
  getDynamicFieldObject(input: {
    parentId: string;
    name: { type: string; value: unknown } | string;
  }): Promise<SuiObjectResponse> {
    return rpc<SuiObjectResponse>("suix_getDynamicFieldObject", [
      input.parentId,
      input.name,
    ]);
  },

  /** suix_queryEvents */
  queryEvents(input: {
    query: Record<string, unknown>;
    cursor?: string | null;
    limit?: number;
    descending_order?: boolean;
  }): Promise<SuiEventPage> {
    return rpc<SuiEventPage>("suix_queryEvents", [
      input.query,
      input.cursor ?? null,
      input.limit ?? null,
      input.descending_order ?? false,
    ]);
  },

  /** suix_getOwnedObjects */
  getOwnedObjects(input: {
    owner: string;
    filter?: Record<string, unknown>;
    options?: Record<string, boolean>;
    cursor?: string | null;
    limit?: number;
  }): Promise<{ data: SuiObjectResponse[]; nextCursor: string | null; hasNextPage: boolean }> {
    return rpc<{ data: SuiObjectResponse[]; nextCursor: string | null; hasNextPage: boolean }>(
      "suix_getOwnedObjects",
      [
        input.owner,
        { filter: input.filter, options: input.options ?? { showContent: true } },
        input.cursor ?? null,
        input.limit ?? null,
      ],
    );
  },

  /** sui_getTransactionBlock */
  getTransactionBlock(input: {
    digest: string;
    options?: Record<string, boolean>;
  }): Promise<SuiTransactionBlockResponse> {
    return rpc<SuiTransactionBlockResponse>("sui_getTransactionBlock", [
      input.digest,
      input.options ?? { showObjectChanges: true },
    ]);
  },

  /** suix_getCoins — page Coin<T> objects owned by an address. */
  getCoins(input: {
    owner: string;
    coinType?: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<{ data: Array<{ coinObjectId: string; balance: string; coinType: string }>; nextCursor: string | null; hasNextPage: boolean }> {
    return rpc<{ data: Array<{ coinObjectId: string; balance: string; coinType: string }>; nextCursor: string | null; hasNextPage: boolean }>(
      "suix_getCoins",
      [
        input.owner,
        input.coinType ?? null,
        input.cursor ?? null,
        input.limit ?? null,
      ],
    );
  },
};

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
