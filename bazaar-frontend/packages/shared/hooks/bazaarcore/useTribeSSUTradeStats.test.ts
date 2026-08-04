// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Unit tests for useTribeSSUTradeStats (GAS-06 event-derived per-SSU stats).
 *
 * Mock strategy: vi.mock("../sui-client") — the hand-rolled JSON-RPC client.
 * Verifies the per-ssu event aggregation (filter by ssu_id ∈ tribe set, sum
 * gross/tax/net + trade count), the Easy (PurchaseEvent) vs Advanced
 * (LedgerPurchaseEvent) field maps, owner resolution, and the empty path.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import React from "react";

const mockSuiClient = vi.hoisted(() => ({
  getObject: vi.fn(),
  getDynamicFieldObject: vi.fn(),
  queryEvents: vi.fn(),
}));
vi.mock("../sui-client", () => ({ suiClient: mockSuiClient }));
vi.mock("../../constants", () => ({
  SHARED_OBJECTS: { SSU_REGISTRY: "0xssureg" },
  ORIGINAL_PACKAGE_ID: "0xcore",
  BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID: "0xecon",
}));

import { useTribeSSUTradeStats } from "./useTribeSSUTradeStats";

const TRIBE_GOV = "0xtribegov";
const REG_TABLE = "0xregtable";
const SSU_A = "0xa11";
const SSU_B = "0xb22";
const SSU_OTHER = "0xccc";
const OWNER_A = "0xownera";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

function govObj(bazaarType: number, ssuIds: string[]) {
  return { data: { content: { fields: { bazaar_type: bazaarType, ssu_ids: ssuIds } } } };
}
function regObj() {
  return { data: { content: { fields: { registrations: { fields: { id: { id: REG_TABLE } } } } } } };
}
function regField(owner: string) {
  return { data: { content: { fields: { value: { fields: { owner } } } } } };
}
function eventPage(rows: Record<string, unknown>[]) {
  return { data: rows.map(parsedJson => ({ parsedJson })), nextCursor: null, hasNextPage: false };
}

beforeEach(() => {
  mockSuiClient.getObject.mockReset();
  mockSuiClient.getDynamicFieldObject.mockReset();
  mockSuiClient.queryEvents.mockReset();
});

describe("useTribeSSUTradeStats", () => {
  it("aggregates Easy PurchaseEvents per SSU, ignores other SSUs, resolves owners", async () => {
    mockSuiClient.getObject
      .mockResolvedValueOnce(govObj(1, [SSU_A, SSU_B])) // gov
      .mockResolvedValueOnce(regObj());                  // SSU_REGISTRY

    mockSuiClient.queryEvents.mockResolvedValueOnce(eventPage([
      { ssu_id: SSU_A, gross_amount: "1000", ssu_tax: "50", tribe_tax: "30", dapp_tax: "20", net_amount: "900" },
      { ssu_id: SSU_A, gross_amount: "500",  ssu_tax: "25", tribe_tax: "15", dapp_tax: "10", net_amount: "450" },
      { ssu_id: SSU_B, gross_amount: "200",  ssu_tax: "10", tribe_tax: "6",  dapp_tax: "4",  net_amount: "180" },
      { ssu_id: SSU_OTHER, gross_amount: "9999", ssu_tax: "9", tribe_tax: "9", dapp_tax: "9", net_amount: "9" }, // filtered
    ]));

    mockSuiClient.getDynamicFieldObject.mockImplementation(
      async ({ name }: { parentId: string; name: { value: string } }) => {
        if (name.value === SSU_A) return regField(OWNER_A);
        throw new Error("no registration"); // SSU_B → null owner
      },
    );

    const { result } = renderHook(() => useTribeSSUTradeStats(TRIBE_GOV, [SSU_A, SSU_B]), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data?.rows.length).toBe(2));
    const data = result.current.data!;
    expect(data.bazaarType).toBe(1);
    expect(data.truncated).toBe(false);

    // queried the Easy PurchaseEvent type, anchored to the core original id.
    expect(mockSuiClient.queryEvents).toHaveBeenCalledWith(
      expect.objectContaining({ query: { MoveEventType: "0xcore::shop_ops_helpers::PurchaseEvent" } }),
    );

    const a = data.rows.find(r => r.ssuId === SSU_A)!;
    expect(a.tradeCount).toBe(2);
    expect(a.gross).toBe(1500);
    expect(a.ssuTax).toBe(75);
    expect(a.tribeTax).toBe(45);
    expect(a.dappTax).toBe(30);
    expect(a.net).toBe(1350);
    expect(a.ownerAddress).toBe(OWNER_A);

    const b = data.rows.find(r => r.ssuId === SSU_B)!;
    expect(b.tradeCount).toBe(1);
    expect(b.gross).toBe(200);
    expect(b.tribeTax).toBe(6);
    expect(b.ownerAddress).toBeNull();
  });

  it("maps Advanced LedgerPurchaseEvent token fields with zero dapp tax", async () => {
    mockSuiClient.getObject
      .mockResolvedValueOnce(govObj(2, [SSU_A]))
      .mockResolvedValueOnce(regObj());
    mockSuiClient.queryEvents.mockResolvedValueOnce(eventPage([
      { ssu_id: SSU_A, gross_tokens: "300", ssu_tax_tokens: "9", tribe_tax_tokens: "6", net_tokens: "285" },
    ]));
    mockSuiClient.getDynamicFieldObject.mockResolvedValue(regField(OWNER_A));

    const { result } = renderHook(() => useTribeSSUTradeStats(TRIBE_GOV, [SSU_A]), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data?.rows.length).toBe(1));
    expect(mockSuiClient.queryEvents).toHaveBeenCalledWith(
      expect.objectContaining({ query: { MoveEventType: "0xecon::ledger_shop_ops::LedgerPurchaseEvent" } }),
    );
    const a = result.current.data!.rows[0];
    expect(a.gross).toBe(300);
    expect(a.tribeTax).toBe(6);
    expect(a.dappTax).toBe(0); // Advanced internal trades carry no DApp tax
    expect(a.net).toBe(285);
  });

  it("returns empty rows when the tribe gov has no content", async () => {
    mockSuiClient.getObject.mockResolvedValueOnce({ data: { content: null } });
    const { result } = renderHook(() => useTribeSSUTradeStats(TRIBE_GOV, [SSU_A]), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data!.rows).toEqual([]);
    expect(mockSuiClient.queryEvents).not.toHaveBeenCalled();
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
