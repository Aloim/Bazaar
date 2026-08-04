// bazaar-frontend | vitest coverage for the depreciated SSU union hook signals
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Unit tests for useDepreciatedSSUs (V41 SSU depreciation/prune delist hook).
 *
 * Mock strategy: vi.mock("../sui-client") — mirrors useTribeSSUTradeStats.test.ts.
 * Verifies the certified-event scan, the existence probe (missing `.data` = gone),
 * the union, the enabled=false full gate, and the empty-candidate no-probe path.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import React from "react";

const mockSuiClient = vi.hoisted(() => ({
  queryEvents: vi.fn(),
  multiGetObjects: vi.fn(),
}));
vi.mock("../sui-client", () => ({ suiClient: mockSuiClient }));
vi.mock("../../constants", () => ({ ORIGINAL_PACKAGE_ID: "0xcore" }));

import { useDepreciatedSSUs } from "./useDepreciatedSSUs";

const SSU_A = "0xa11";
const SSU_B = "0xb22";
const SSU_C = "0xc33";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

function eventPage(rows: Record<string, unknown>[]) {
  return { data: rows.map((parsedJson) => ({ parsedJson })), nextCursor: null, hasNextPage: false };
}

beforeEach(() => {
  mockSuiClient.queryEvents.mockReset();
  mockSuiClient.multiGetObjects.mockReset();
});

describe("useDepreciatedSSUs", () => {
  it("unions certified events + probe-gone ids, lowercased", async () => {
    mockSuiClient.queryEvents.mockResolvedValueOnce(eventPage([{ ssu_id: SSU_A }]));
    mockSuiClient.multiGetObjects.mockResolvedValueOnce([
      { data: { objectId: SSU_B } }, // SSU_B still exists
      { error: { code: "deleted" } }, // SSU_C gone — no .data
    ]);

    const { result } = renderHook(
      () => useDepreciatedSSUs([SSU_B, SSU_C]),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.depreciated.has(SSU_A.toLowerCase())).toBe(true);
    expect(result.current.depreciated.has(SSU_B.toLowerCase())).toBe(false);
    expect(result.current.depreciated.has(SSU_C.toLowerCase())).toBe(true);
  });

  it("splits certified vs probedGone for janitor branching", async () => {
    mockSuiClient.queryEvents.mockResolvedValueOnce(eventPage([{ ssu_id: SSU_A }]));
    mockSuiClient.multiGetObjects.mockResolvedValueOnce([{ error: { code: "deleted" } }]);

    const { result } = renderHook(
      () => useDepreciatedSSUs([SSU_C]),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.certified.has(SSU_A.toLowerCase())).toBe(true);
    expect(result.current.probedGone.has(SSU_C.toLowerCase())).toBe(true);
    expect(result.current.certified.has(SSU_C.toLowerCase())).toBe(false);
  });

  it("does not probe when candidateSsuIds is empty", async () => {
    mockSuiClient.queryEvents.mockResolvedValueOnce(eventPage([]));

    const { result } = renderHook(() => useDepreciatedSSUs([]), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockSuiClient.multiGetObjects).not.toHaveBeenCalled();
    expect(result.current.depreciated.size).toBe(0);
  });

  it("skips all RPC when enabled=false", async () => {
    const { result } = renderHook(
      () => useDepreciatedSSUs([SSU_A], false),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockSuiClient.queryEvents).not.toHaveBeenCalled();
    expect(mockSuiClient.multiGetObjects).not.toHaveBeenCalled();
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
