// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * Unit tests for useSSUSharedObjects and useSSUGovId (governance-resolution-hooks.ts).
 * OS-54-test-followup: Test suite UT-01 through UT-09 (existing) + GH-10 through GH-14 (new).
 *
 * Mock strategy: vi.mock("../sui-client") for custom fetch-based suiClient.
 *   NOT @mysten/sui — this codebase uses a hand-rolled JSON-RPC wrapper.
 *
 * GH-10..GH-12: _findSSUGovernanceCreatedEvent tested indirectly via useSSUGovId
 *   (helper is module-private; not directly importable).
 * GH-13..GH-14: getObject SA-O1 defense tested via useSSUSharedObjects.
 *
 * CC-007: GH-12 waitFor uses two sequential await waitFor blocks (not && short-circuit).
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { MOCK_SSU_ID, MOCK_SSU_GOV_ID, MOCK_SSU_GOV_CREATED_EVENT, MOCK_SSU_GOV_CREATED_EVENT_V2, MOCK_INCOMPLETE_EVENT, MOCK_TX_BLOCK_WITH_SSU_GOV, MOCK_TX_BLOCK_WITHOUT_SSU_GOV, EXPECTED_SHARED_OBJECTS, MOCK_USER_STORAGE_ID, buildDummyEvents, } from "../../__fixtures__/event-payloads";
import { createMockSuiClient } from "../../__fixtures__/sui-mocks";
import { createTestQueryClient } from "../../__fixtures__/dappkit-mocks";
import { useSSUSharedObjects, useSSUGovId } from "./governance-resolution-hooks";
// ── Module mock — must be at top level (hoisted by Vitest) ───────────────────
const mockSuiClient = vi.hoisted(() => ({
    queryEvents: Object.assign((..._args) => Promise.resolve({ data: [] }), { mockResolvedValue: () => undefined, mockResolvedValueOnce: () => undefined, mockReset: () => undefined }),
    getTransactionBlock: Object.assign((..._args) => Promise.resolve({ objectChanges: [] }), { mockResolvedValue: () => undefined, mockResolvedValueOnce: () => undefined, mockReset: () => undefined }),
    getObject: Object.assign((..._args) => Promise.resolve({ data: {} }), { mockResolvedValue: () => undefined, mockResolvedValueOnce: () => undefined, mockReset: () => undefined }),
}));
mockSuiClient.queryEvents = vi.fn();
mockSuiClient.getTransactionBlock = vi.fn();
mockSuiClient.getObject = vi.fn();
vi.mock("../sui-client", () => ({ suiClient: mockSuiClient }));
vi.mock("../../constants/index", () => ({
    PACKAGE_IDS: {
        BAZAAR_CORE: "0xec77f064cfd8236019416001bf316d072a9b90ab8d947492a56d25fced2ef822",
        DAPP_HUB: "0xb9ce0bf5c3871afe6b217fc9218d4719f7b1ef9497031c00da6ac938457f2ad3",
        BAZAAR_ECONOMY: "0xdc2da118954f8eb36da580f0d54c47d87f535f232ff0ff435c6935cd7c55a3ae",
        SHARED_WIDGETS: "0x8555fe3362ca17191d2713e80395f378e2e8d1ef542f4747372eb2229925a45f",
    },
    // Sweep H: type-filter sites switched to ORIGINAL_PACKAGE_ID. For tests,
    // mirror PACKAGE_IDS.BAZAAR_CORE so existing event-type assertions remain
    // valid (the test's mock SSU/Tribe events are emitted with that same prefix).
    ORIGINAL_PACKAGE_ID: "0xec77f064cfd8236019416001bf316d072a9b90ab8d947492a56d25fced2ef822",
    NETWORK: { RPC_URL: "https://api.zan.top/public/sui-testnet", CHAIN: "sui:testnet" },
}));
// ── Wrapper helper ────────────────────────────────────────────────────────────
function makeWrapper() {
    const queryClient = createTestQueryClient();
    function Wrapper({ children }) {
        return React.createElement(QueryClientProvider, { client: queryClient }, children);
    }
    return { Wrapper, queryClient };
}
// ── SA-O1 getObject mock response builder ─────────────────────────────────────
function makeGovObjResponse(ssuId) {
    return {
        data: {
            content: {
                fields: { ssu_id: ssuId },
            },
        },
    };
}
// ── Shared setup ──────────────────────────────────────────────────────────────
beforeEach(() => {
    Object.assign(mockSuiClient, createMockSuiClient());
});
// ── Tests: useSSUSharedObjects ────────────────────────────────────────────────
describe("useSSUSharedObjects", () => {
    // UT-01: Happy path — all 7 IDs resolved correctly (including userStorageId + SA-O1 pass)
    it("UT-01: resolves all 7 IDs when event, TX block, and getObject ssu_id match", async () => {
        mockSuiClient.queryEvents.mockResolvedValue({
            data: [MOCK_SSU_GOV_CREATED_EVENT],
            nextCursor: null,
            hasNextPage: false,
        });
        mockSuiClient.getTransactionBlock.mockResolvedValue(MOCK_TX_BLOCK_WITH_SSU_GOV);
        mockSuiClient.getObject.mockResolvedValue(makeGovObjResponse(MOCK_SSU_ID));
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useSSUSharedObjects(MOCK_SSU_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data).toEqual(EXPECTED_SHARED_OBJECTS);
        expect(result.current.isError).toBe(false);
    });
    // UT-02: ssuId null — hook stays disabled, no RPC calls
    it("UT-02: returns disabled state (data undefined) when ssuId is null", async () => {
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useSSUSharedObjects(null), { wrapper: Wrapper });
        expect(result.current.isLoading).toBe(false);
        expect(result.current.data).toBeUndefined();
        expect(mockSuiClient.queryEvents).not.toHaveBeenCalled();
    });
    // UT-03: No event found — returns null
    it("UT-03: returns null when no SSUGovernanceCreated event matches ssuId", async () => {
        mockSuiClient.queryEvents.mockResolvedValue({
            data: [],
            nextCursor: null,
            hasNextPage: false,
        });
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useSSUSharedObjects(MOCK_SSU_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data).toBeNull();
        expect(mockSuiClient.getTransactionBlock).not.toHaveBeenCalled();
    });
    // UT-04: Multiple events — first-bootstrap-wins
    it("UT-04: uses the first matching event when multiple events exist for same ssuId", async () => {
        mockSuiClient.queryEvents.mockResolvedValue({
            data: [MOCK_SSU_GOV_CREATED_EVENT, MOCK_SSU_GOV_CREATED_EVENT_V2],
            nextCursor: null,
            hasNextPage: false,
        });
        mockSuiClient.getTransactionBlock.mockResolvedValue(MOCK_TX_BLOCK_WITH_SSU_GOV);
        mockSuiClient.getObject.mockResolvedValue(makeGovObjResponse(MOCK_SSU_ID));
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useSSUSharedObjects(MOCK_SSU_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data?.memberRegistryId).toBe(EXPECTED_SHARED_OBJECTS.memberRegistryId);
        expect(mockSuiClient.getTransactionBlock).toHaveBeenCalledWith(expect.objectContaining({ digest: MOCK_SSU_GOV_CREATED_EVENT.id.txDigest }));
    });
    // UT-05: parsedJson missing widget_config_id — returns null
    it("UT-05: returns null when parsedJson is missing widget_config_id", async () => {
        mockSuiClient.queryEvents.mockResolvedValue({
            data: [MOCK_INCOMPLETE_EVENT],
            nextCursor: null,
            hasNextPage: false,
        });
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useSSUSharedObjects(MOCK_SSU_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data).toBeNull();
        expect(mockSuiClient.getTransactionBlock).not.toHaveBeenCalled();
    });
    // UT-06: objectChanges has no SSUGovernance type match — returns null
    it("UT-06: returns null when TX objectChanges contains no SSUGovernance object", async () => {
        mockSuiClient.queryEvents.mockResolvedValue({
            data: [MOCK_SSU_GOV_CREATED_EVENT],
            nextCursor: null,
            hasNextPage: false,
        });
        mockSuiClient.getTransactionBlock.mockResolvedValue(MOCK_TX_BLOCK_WITHOUT_SSU_GOV);
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useSSUSharedObjects(MOCK_SSU_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data).toBeNull();
    });
    // UT-07: 1000 results — console.warn fires, still resolves if target event present
    it("UT-07: emits console.warn at 1000-result capacity and still resolves", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const pageOf1000 = [MOCK_SSU_GOV_CREATED_EVENT, ...buildDummyEvents(999)];
        mockSuiClient.queryEvents.mockResolvedValue({
            data: pageOf1000,
            nextCursor: null,
            hasNextPage: false,
        });
        mockSuiClient.getTransactionBlock.mockResolvedValue(MOCK_TX_BLOCK_WITH_SSU_GOV);
        mockSuiClient.getObject.mockResolvedValue(makeGovObjResponse(MOCK_SSU_ID));
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useSSUSharedObjects(MOCK_SSU_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0][0]).toMatch(/1000 results/);
        expect(result.current.data).toEqual(EXPECTED_SHARED_OBJECTS);
        warnSpy.mockRestore();
    });
    // UT-08: getTransactionBlock rejects — error propagates via React Query
    it("UT-08: propagates error when getTransactionBlock rejects", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
        mockSuiClient.queryEvents.mockResolvedValue({
            data: [MOCK_SSU_GOV_CREATED_EVENT],
            nextCursor: null,
            hasNextPage: false,
        });
        mockSuiClient.getTransactionBlock.mockRejectedValue(new Error("RPC 503"));
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useSSUSharedObjects(MOCK_SSU_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error?.message).toContain("RPC 503");
        errorSpy.mockRestore();
    });
    // UT-09: lowercase normalization — mixed-case ssuId matches lowercase event ssu_id
    it("UT-09: resolves when ssuId has mixed case (lowercased before comparison)", async () => {
        mockSuiClient.queryEvents.mockResolvedValue({
            data: [MOCK_SSU_GOV_CREATED_EVENT],
            nextCursor: null,
            hasNextPage: false,
        });
        mockSuiClient.getTransactionBlock.mockResolvedValue(MOCK_TX_BLOCK_WITH_SSU_GOV);
        // SA-O1: return lowercase ssu_id — comparison is lowercased both sides.
        mockSuiClient.getObject.mockResolvedValue(makeGovObjResponse(MOCK_SSU_ID.toLowerCase()));
        const mixedCaseSsuId = MOCK_SSU_ID.toUpperCase();
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useSSUSharedObjects(mixedCaseSsuId), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data).toEqual(EXPECTED_SHARED_OBJECTS);
    });
    // GH-13: getObject ssu_id matches → returns SSUSharedObjects with all 7 IDs
    it("GH-13: SA-O1 pass — getObject ssu_id matches queried ssuId → returns all 7 IDs", async () => {
        mockSuiClient.queryEvents.mockResolvedValue({
            data: [MOCK_SSU_GOV_CREATED_EVENT],
            nextCursor: null,
            hasNextPage: false,
        });
        mockSuiClient.getTransactionBlock.mockResolvedValue(MOCK_TX_BLOCK_WITH_SSU_GOV);
        // SA-O1: ssu_id matches (lowercased comparison).
        mockSuiClient.getObject.mockResolvedValue(makeGovObjResponse(MOCK_SSU_ID));
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useSSUSharedObjects(MOCK_SSU_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data).not.toBeNull();
        expect(result.current.data?.ssuGovId).toBe(MOCK_SSU_GOV_ID);
        expect(result.current.data?.userStorageId).toBe(MOCK_USER_STORAGE_ID);
        expect(result.current.data).toEqual(EXPECTED_SHARED_OBJECTS);
    });
    // GH-14: getObject ssu_id mismatches → returns null + logs error
    it("GH-14: SA-O1 fail — getObject ssu_id mismatch → returns null and logs error", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
        mockSuiClient.queryEvents.mockResolvedValue({
            data: [MOCK_SSU_GOV_CREATED_EVENT],
            nextCursor: null,
            hasNextPage: false,
        });
        mockSuiClient.getTransactionBlock.mockResolvedValue(MOCK_TX_BLOCK_WITH_SSU_GOV);
        // SA-O1: ssu_id is a DIFFERENT address — cross-SSU mismatch scenario.
        const wrongSsuId = "0xdeadbeef000000000000000000000000000000000000000000000000deadbeef";
        mockSuiClient.getObject.mockResolvedValue(makeGovObjResponse(wrongSsuId));
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useSSUSharedObjects(MOCK_SSU_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data).toBeNull();
        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy.mock.calls[0][0]).toMatch(/SA-O1 cross-SSU mismatch/);
        errorSpy.mockRestore();
    });
});
// ── Tests: _findSSUGovernanceCreatedEvent (via useSSUGovId) ───────────────────
describe("_findSSUGovernanceCreatedEvent (exercised via useSSUGovId)", () => {
    // GH-10: helper finds matching event — useSSUGovId resolves ssuGovId
    it("GH-10: helper finds matching event and useSSUGovId resolves ssuGovId", async () => {
        mockSuiClient.queryEvents.mockResolvedValue({
            data: [MOCK_SSU_GOV_CREATED_EVENT],
            nextCursor: null,
            hasNextPage: false,
        });
        mockSuiClient.getTransactionBlock.mockResolvedValue(MOCK_TX_BLOCK_WITH_SSU_GOV);
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useSSUGovId(MOCK_SSU_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data).toBe(MOCK_SSU_GOV_ID);
        // queryEvents was called with the correct MoveEventType
        expect(mockSuiClient.queryEvents).toHaveBeenCalledWith(expect.objectContaining({
            query: expect.objectContaining({
                MoveEventType: expect.stringContaining("SSUGovernanceCreated"),
            }),
            limit: 1000,
        }));
    });
    // GH-11: helper returns null when no event matches → useSSUGovId returns null
    it("GH-11: helper returns null when no event matches ssuId → useSSUGovId returns null", async () => {
        mockSuiClient.queryEvents.mockResolvedValue({
            data: [],
            nextCursor: null,
            hasNextPage: false,
        });
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useSSUGovId(MOCK_SSU_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.data).toBeNull();
        expect(mockSuiClient.getTransactionBlock).not.toHaveBeenCalled();
    });
    // GH-12: helper called via two different hooks; each issues queryEvents independently.
    // CC-007 fix: two sequential await waitFor blocks instead of && short-circuit.
    it("GH-12: helper issues independent queryEvents when called from two hooks", async () => {
        mockSuiClient.queryEvents.mockResolvedValue({
            data: [MOCK_SSU_GOV_CREATED_EVENT],
            nextCursor: null,
            hasNextPage: false,
        });
        mockSuiClient.getTransactionBlock.mockResolvedValue(MOCK_TX_BLOCK_WITH_SSU_GOV);
        // SA-O1 getObject for useSSUSharedObjects path — must return matching ssu_id.
        mockSuiClient.getObject.mockResolvedValue(makeGovObjResponse(MOCK_SSU_ID));
        // Separate QueryClient instances so caches don't interfere.
        const { Wrapper: WrapperA } = makeWrapper();
        const { Wrapper: WrapperB } = makeWrapper();
        const { result: rGov } = renderHook(() => useSSUGovId(MOCK_SSU_ID), { wrapper: WrapperA });
        const { result: rShared } = renderHook(() => useSSUSharedObjects(MOCK_SSU_ID), { wrapper: WrapperB });
        // CC-007: two sequential await waitFor blocks — avoids && short-circuit fragility.
        await waitFor(() => expect(rGov.current.isLoading).toBe(false));
        await waitFor(() => expect(rShared.current.isLoading).toBe(false));
        expect(rGov.current.data).toBe(MOCK_SSU_GOV_ID);
        expect(rShared.current.data).toEqual(EXPECTED_SHARED_OBJECTS);
        // Each hook issued its own queryEvents call.
        expect(mockSuiClient.queryEvents).toHaveBeenCalledTimes(2);
    });
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
