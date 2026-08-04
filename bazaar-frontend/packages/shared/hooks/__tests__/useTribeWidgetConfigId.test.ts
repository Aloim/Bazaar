// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useTribeWidgetConfigId.test.ts
 *
 * Vitest unit tests — T01 through T04.
 * OS-59-tribe-widgets: resolver hook for per-tribe WidgetConfig ID.
 *
 * Mock strategy:
 *   vi.mock("../sui-client") — targets hand-rolled JSON-RPC client singleton.
 *   Provides controlled getObject responses for TribeGovernance objects.
 *
 * Wrapper pattern: React.createElement (no JSX) — consistent with
 *   useTribeAnnouncements.test.ts:95-101 convention.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { createTestQueryClient } from "../../__fixtures__/dappkit-mocks";
import { useTribeWidgetConfigId } from "../bazaarcore/useTribeWidgetConfigId";

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const mockSuiClient = vi.hoisted(() => ({
  getObject: vi.fn(),
}));

vi.mock("../sui-client", () => ({ suiClient: mockSuiClient }));

// ── Test constants ────────────────────────────────────────────────────────────

const TRIBE_GOV_ID  = "0xaaaa0000000000000000000000000000000000000000000000000000aaaa0001";
const WIDGET_CFG_ID = "0xbbbb0000000000000000000000000000000000000000000000000000bbbb0001";

// ── Wrapper factory (React.createElement — no JSX, consistent with project convention) ──

function makeWrapper() {
  const qc = createTestQueryClient();
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  }
  return { Wrapper };
}

// ── Mock response builders ────────────────────────────────────────────────────

/** TribeGovernance response with Option<ID> populated (Some). */
function makeTribeGovWithWidgetConfig(widgetConfigId: string) {
  return {
    data: {
      content: {
        fields: {
          tribe_id: "1",
          widget_config_id: { vec: [widgetConfigId] },
        },
      },
    },
  };
}

/** TribeGovernance response with Option<ID> none (legacy v4 tribe). */
function makeTribeGovWithoutWidgetConfig() {
  return {
    data: {
      content: {
        fields: {
          tribe_id: "1",
          widget_config_id: { vec: [] },
        },
      },
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useTribeWidgetConfigId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T01 — returns null immediately when tribeGovId is null (query disabled)", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useTribeWidgetConfigId(null),
      { wrapper: Wrapper },
    );
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockSuiClient.getObject).not.toHaveBeenCalled();
  });

  it("T02 — returns widgetConfigId string when Option<ID> is populated", async () => {
    mockSuiClient.getObject.mockResolvedValueOnce(
      makeTribeGovWithWidgetConfig(WIDGET_CFG_ID),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useTribeWidgetConfigId(TRIBE_GOV_ID),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe(WIDGET_CFG_ID);
    expect(result.current.error).toBeNull();
    expect(mockSuiClient.getObject).toHaveBeenCalledWith({
      id:      TRIBE_GOV_ID,
      options: { showContent: true },
    });
  });

  it("T03 — returns null when Option<ID> is empty (legacy v4 tribe without widget_config_id)", async () => {
    mockSuiClient.getObject.mockResolvedValueOnce(
      makeTribeGovWithoutWidgetConfig(),
    );
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useTribeWidgetConfigId(TRIBE_GOV_ID),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("T04 — surfaces error when RPC call rejects", async () => {
    const rpcError = new Error("Network error: connection refused");
    mockSuiClient.getObject.mockRejectedValueOnce(rpcError);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useTribeWidgetConfigId(TRIBE_GOV_ID),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toContain("Network error");
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
