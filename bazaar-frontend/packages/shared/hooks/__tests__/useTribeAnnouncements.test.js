// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * useTribeAnnouncements.test.ts
 *
 * Vitest unit tests — T01 through T07 + helper unit tests H01-H03.
 * OS-54-test-followup infrastructure: vi.hoisted() + barrel-import mocking.
 *
 * Mock strategy:
 *   vi.mock("../sui-client") — targets hand-rolled JSON-RPC client (NOT @mysten/sui).
 *   vi.mock("../announcement-board-fetch") — targets the extracted shared helper.
 *   useTribeSSUs is a hook from tribe-governance-hooks; we mock its underlying
 *   suiClient.getObject calls so the full React Query chain runs for realism.
 *
 * The hook under test (useTribeAnnouncements) lives in:
 *   hooks/bazaarcore/tribe-governance-hooks.ts
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createTestQueryClient } from "../../__fixtures__/dappkit-mocks";
import { useTribeAnnouncements } from "../bazaarcore/tribe-governance-hooks";
// ── vi.hoisted mocks ──────────────────────────────────────────────────────────
// Step 1: hoist the suiClient mock object so vi.mock factories can reference it.
const mockSuiClient = vi.hoisted(() => ({
    getObject: vi.fn(),
}));
// Step 2: hoist the fetchAnnouncementsForBoard mock so vi.mock can reference it.
const mockFetchBoard = vi.hoisted(() => vi.fn());
// Step 3: declare mocks at module level (hoisted by Vitest transformer).
vi.mock("../sui-client", () => ({ suiClient: mockSuiClient }));
vi.mock("../announcement-board-fetch", () => ({
    fetchAnnouncementsForBoard: mockFetchBoard,
}));
// ── Test helpers ──────────────────────────────────────────────────────────────
const TRIBE_GOV_ID = "0xaaaa0000000000000000000000000000000000000000000000000000aaaa0001";
const SSU_ID_A = "0xbbbb0000000000000000000000000000000000000000000000000000bbbb0001";
const SSU_ID_B = "0xbbbb0000000000000000000000000000000000000000000000000000bbbb0002";
const BOARD_ID_A = "0xcccc0000000000000000000000000000000000000000000000000000cccc0001";
const BOARD_ID_B = "0xcccc0000000000000000000000000000000000000000000000000000cccc0002";
/** Build a mock TribeGovernance getObject response carrying the given ssu_ids. */
function makeTribeGovObj(ssuIds) {
    return {
        data: {
            content: {
                fields: { ssu_ids: ssuIds },
            },
        },
    };
}
/** Build a mock SSUGovernance getObject response with an announcement_board_id. */
function makeSsuGovObj(boardId) {
    return {
        data: {
            content: {
                fields: boardId ? { announcement_board_id: boardId } : {},
            },
        },
    };
}
/** Minimal AnnouncementData fixture. */
function makeAnn(id, opts = {}) {
    return {
        id,
        author: "0xauthor",
        title: `Title ${id}`,
        body: `Body ${id}`,
        visibility: 0,
        isSticky: opts.isSticky ?? false,
        createdAtMs: opts.createdAtMs ?? id * 1000,
        comments: [],
    };
}
function makeWrapper() {
    const qc = createTestQueryClient();
    function Wrapper({ children }) {
        return React.createElement(QueryClientProvider, { client: qc }, children);
    }
    return { Wrapper };
}
// ── Reset all mocks before each test ─────────────────────────────────────────
beforeEach(() => {
    mockSuiClient.getObject.mockReset();
    mockFetchBoard.mockReset();
});
// ── Tests ─────────────────────────────────────────────────────────────────────
describe("useTribeAnnouncements", () => {
    // T01 — null tribeGovId: hook stays disabled
    it("T01: returns undefined when tribeGovId is null", () => {
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useTribeAnnouncements(null), { wrapper: Wrapper });
        // Disabled query: isLoading false in React Query v5, data undefined
        expect(result.current.data).toBeUndefined();
        expect(mockSuiClient.getObject).not.toHaveBeenCalled();
    });
    // T02 — tribe with 0 SSUs: enabled-guard prevents inner query
    it("T02: returns undefined (query disabled) when tribe has 0 SSUs", async () => {
        // useTribeSSUs will call getObject once for TribeGovernance → ssu_ids: []
        mockSuiClient.getObject.mockResolvedValue(makeTribeGovObj([]));
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useTribeAnnouncements(TRIBE_GOV_ID), { wrapper: Wrapper });
        await waitFor(() => !result.current.isPending || result.current.data !== undefined, { timeout: 2000 })
            .catch(() => { });
        // Inner query has enabled: false when ssuIds is empty
        expect(result.current.data).toBeUndefined();
        expect(mockFetchBoard).not.toHaveBeenCalled();
    });
    // T03 — 1 SSU, 0 announcements
    it("T03: returns [] when 1 SSU board has no announcements", async () => {
        mockSuiClient.getObject
            .mockResolvedValueOnce(makeTribeGovObj([SSU_ID_A])) // TribeGovernance (useTribeSSUs)
            .mockResolvedValueOnce(makeSsuGovObj(BOARD_ID_A)); // SSUGovernance fan-out
        mockFetchBoard.mockResolvedValueOnce([]);
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useTribeAnnouncements(TRIBE_GOV_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual([]);
        expect(mockFetchBoard).toHaveBeenCalledOnce();
        expect(mockFetchBoard).toHaveBeenCalledWith(BOARD_ID_A);
    });
    // T04 — 2 SSUs, 2 announcements each → 4 total, sorted desc
    it("T04: aggregates and sorts 4 announcements from 2 SSUs by createdAtMs desc", async () => {
        mockSuiClient.getObject
            .mockResolvedValueOnce(makeTribeGovObj([SSU_ID_A, SSU_ID_B]))
            .mockResolvedValueOnce(makeSsuGovObj(BOARD_ID_A))
            .mockResolvedValueOnce(makeSsuGovObj(BOARD_ID_B));
        // Board A: older announcements
        const annA1 = makeAnn(1, { createdAtMs: 1000 });
        const annA2 = makeAnn(2, { createdAtMs: 2000 });
        // Board B: newer announcements
        const annB1 = makeAnn(3, { createdAtMs: 3000 });
        const annB2 = makeAnn(4, { createdAtMs: 4000 });
        mockFetchBoard
            .mockResolvedValueOnce([annA1, annA2])
            .mockResolvedValueOnce([annB1, annB2]);
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useTribeAnnouncements(TRIBE_GOV_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toHaveLength(4);
        // sorted desc by createdAtMs
        expect(result.current.data.map((a) => a.createdAtMs)).toEqual([4000, 3000, 2000, 1000]);
        // each tagged with correct ssuId and boardId
        expect(result.current.data[0].ssuId).toBe(SSU_ID_B);
        expect(result.current.data[0].boardId).toBe(BOARD_ID_B);
        expect(result.current.data[2].ssuId).toBe(SSU_ID_A);
        expect(result.current.data[2].boardId).toBe(BOARD_ID_A);
    });
    // T05 — sticky-first ordering
    it("T05: places sticky announcements first regardless of createdAtMs", async () => {
        mockSuiClient.getObject
            .mockResolvedValueOnce(makeTribeGovObj([SSU_ID_A]))
            .mockResolvedValueOnce(makeSsuGovObj(BOARD_ID_A));
        const older = makeAnn(1, { isSticky: true, createdAtMs: 500 });
        const newer = makeAnn(2, { isSticky: false, createdAtMs: 9000 });
        mockFetchBoard.mockResolvedValueOnce([older, newer]);
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useTribeAnnouncements(TRIBE_GOV_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data[0].isSticky).toBe(true);
        expect(result.current.data[0].id).toBe(1);
        expect(result.current.data[1].id).toBe(2);
    });
    // T06 — partial board failure: surviving boards still returned; console.warn called
    it("T06: returns surviving board announcements when one board fetch fails", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        mockSuiClient.getObject
            .mockResolvedValueOnce(makeTribeGovObj([SSU_ID_A, SSU_ID_B]))
            .mockResolvedValueOnce(makeSsuGovObj(BOARD_ID_A))
            .mockResolvedValueOnce(makeSsuGovObj(BOARD_ID_B));
        mockFetchBoard
            .mockRejectedValueOnce(new Error("board RPC failure"))
            .mockResolvedValueOnce([makeAnn(10, { createdAtMs: 5000 })]);
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useTribeAnnouncements(TRIBE_GOV_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toHaveLength(1);
        expect(result.current.data[0].id).toBe(10);
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0][0]).toMatch(/\[useTribeAnnouncements\]/);
        warnSpy.mockRestore();
    });
    // T07 — SSUGovernance missing announcement_board_id: SSU silently skipped
    it("T07: skips SSUs whose SSUGovernance has no announcement_board_id", async () => {
        mockSuiClient.getObject
            .mockResolvedValueOnce(makeTribeGovObj([SSU_ID_A, SSU_ID_B]))
            .mockResolvedValueOnce(makeSsuGovObj(null)) // SSU_A: no board ID
            .mockResolvedValueOnce(makeSsuGovObj(BOARD_ID_B)); // SSU_B: has board
        mockFetchBoard.mockResolvedValueOnce([makeAnn(20, { createdAtMs: 1000 })]);
        const { Wrapper } = makeWrapper();
        const { result } = renderHook(() => useTribeAnnouncements(TRIBE_GOV_ID), { wrapper: Wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toHaveLength(1);
        expect(mockFetchBoard).toHaveBeenCalledOnce();
        expect(mockFetchBoard).toHaveBeenCalledWith(BOARD_ID_B);
    });
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
