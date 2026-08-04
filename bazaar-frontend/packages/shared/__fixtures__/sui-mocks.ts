// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Mock factory for the custom fetch-based suiClient singleton.
 *
 * IMPORTANT: This mock targets the LOCAL module path "../sui-client" (or
 * "../../hooks/sui-client" etc., depending on the test file's location).
 * It does NOT mock "@mysten/sui" — that package is NOT used by this codebase.
 * The suiClient in this repo is a hand-rolled JSON-RPC 2.0 wrapper over fetch.
 *
 * Usage in tests:
 *   import { createMockSuiClient } from "../../__fixtures__/sui-mocks";
 *   vi.mock("../sui-client", () => ({ suiClient: mockSuiClient }));
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { vi } from "vitest";
import type { SuiEventPage, SuiTransactionBlockResponse, SuiObjectResponse, DynamicFieldPage } from "../hooks/sui-client";

// ── Default empty responses ───────────────────────────────────────────────────

const DEFAULT_EVENT_PAGE: SuiEventPage = {
  data: [],
  nextCursor: null,
  hasNextPage: false,
};

const DEFAULT_TX_BLOCK: SuiTransactionBlockResponse = {
  digest: "",
  objectChanges: [],
};

const DEFAULT_OBJECT: SuiObjectResponse = {
  data: {},
};

const DEFAULT_OWNED_OBJECTS: { data: SuiObjectResponse[]; nextCursor: null; hasNextPage: false } = {
  data: [],
  nextCursor: null,
  hasNextPage: false,
};

const DEFAULT_DYNAMIC_FIELDS: DynamicFieldPage = {
  data: [],
  nextCursor: null,
  hasNextPage: false,
};

// ── Mock factory ──────────────────────────────────────────────────────────────

/**
 * Creates a fresh mock suiClient with all methods as vi.fn() spies.
 * Default return values match the "empty / not found" state.
 * Override per-test using mockResolvedValueOnce or mockResolvedValue.
 *
 * @example
 * const mock = createMockSuiClient();
 * mock.queryEvents.mockResolvedValueOnce({ data: [MOCK_SSU_GOV_CREATED_EVENT], ... });
 */
export function createMockSuiClient() {
  return {
    queryEvents:          vi.fn<() => Promise<SuiEventPage>>().mockResolvedValue(DEFAULT_EVENT_PAGE),
    getTransactionBlock:  vi.fn<() => Promise<SuiTransactionBlockResponse>>().mockResolvedValue(DEFAULT_TX_BLOCK),
    getObject:            vi.fn<() => Promise<SuiObjectResponse>>().mockResolvedValue(DEFAULT_OBJECT),
    multiGetObjects:      vi.fn<() => Promise<SuiObjectResponse[]>>().mockResolvedValue([]),
    getOwnedObjects:      vi.fn<() => Promise<typeof DEFAULT_OWNED_OBJECTS>>().mockResolvedValue(DEFAULT_OWNED_OBJECTS),
    getDynamicFields:     vi.fn<() => Promise<DynamicFieldPage>>().mockResolvedValue(DEFAULT_DYNAMIC_FIELDS),
    getDynamicFieldObject: vi.fn<() => Promise<SuiObjectResponse>>().mockResolvedValue(DEFAULT_OBJECT),
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
