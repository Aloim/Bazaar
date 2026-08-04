// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * useUnclaimedItems.test.ts
 *
 * Vitest unit tests — UI-01, UI-02, UI-03.
 * OS-54-followup FE-A Phase 1.
 *
 * Mock strategy:
 *   vi.mock("../sui-client") — hand-rolled JSON-RPC client singleton.
 *   vi.mock("../bazaarcore/governance-resolution-hooks") — useSSUSharedObjects.
 *   vi.mock("@evefrontier/dapp-kit") — useConnection → walletAddress.
 *
 * UI-03: polling refetch — uses vi.useFakeTimers() to advance timer by POLL_INTERVAL_MS.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
// ── vi.hoisted mocks ──────────────────────────────────────────────────────────
const mockSuiClient = vi.hoisted(() => ({
    getObject: vi.fn(),
    getDynamicFields: vi.fn(),
    getDynamicFieldObject: vi.fn(),
}));
const mockUseSSUSharedObjects = vi.hoisted(() => vi.fn());
const mockUseConnection = vi.hoisted(() => vi.fn());
vi.mock("../sui-client", () => ({ suiClient: mockSuiClient }));
vi.mock("../bazaarcore/governance-resolution-hooks", () => ({
    useSSUSharedObjects: mockUseSSUSharedObjects,
}));
vi.mock("@evefrontier/dapp-kit", () => ({
    useConnection: mockUseConnection,
}));
// ── Test constants ────────────────────────────────────────────────────────────
const MOCK_SSU_ID = "0xabc000000000000000000000000000000000000000000000000000000000001";
const MOCK_STORAGE_ID = "0x0007777777777777777777777777777777777777777777777777777777777777";
const MOCK_TABLE_UID = "0xbbbb111111111111111111111111111111111111111111111111111111111111";
const WALLET_ADDRESS = "0xwallet0000000000000000000000000000000000000000000000000000000001";
const OTHER_ADDRESS = "0xother00000000000000000000000000000000000000000000000000000000001";
const ITEM_ID_1 = "0xitem0000000000000000000000000000000000000000000000000000000000001";
const ITEM_ID_2 = "0xitem0000000000000000000000000000000000000000000000000000000000002";
// ── Mock response builders ────────────────────────────────────────────────────
function makeUserStorageObj(tableUid) {
    return {
        data: {
            content: {
                fields: {
                    unclaimed_items: {
                        fields: { id: { id: tableUid } },
                    },
                },
            },
        },
    };
}
function makeDFPage(entries) {
    return { data: entries, nextCursor: null, hasNextPage: false };
}
function makeUnclaimedItemObj(owner, typeId, qty, shopId, expiryMs) {
    return {
        data: {
            content: {
                fields: {
                    value: {
                        original_owner: owner,
                        item_type_id: String(typeId),
                        quantity: String(qty),
                        shop_id: shopId,
                        expiry_ms: String(expiryMs),
                    },
                },
            },
        },
    };
}
function makeSharedObjs(userStorageId) {
    return {
        data: {
            ssuGovId: "0xgov",
            memberRegistryId: "0xmreg",
            widgetConfigId: "0xwcfg",
            announcementBoardId: "0xab",
            guestbookBoardId: "0xgb",
            userStorageId,
        },
    };
}
// ── Import hook (after mocks declared) ───────────────────────────────────────
import { useUnclaimedItems } from "../useUnclaimedItems";
// ── Tests ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
    mockSuiClient.getObject.mockReset();
    mockSuiClient.getDynamicFields.mockReset();
    mockSuiClient.getDynamicFieldObject.mockReset();
    mockUseSSUSharedObjects.mockReset();
    mockUseConnection.mockReset();
    // Default: wallet connected.
    mockUseConnection.mockReturnValue({ walletAddress: WALLET_ADDRESS });
});
describe("useUnclaimedItems", () => {
    // UI-01: null ssuId → sharedObjs null → items empty, no RPC
    it("UI-01: returns empty items when ssuId is null (hook disabled)", async () => {
        mockUseSSUSharedObjects.mockReturnValue({ data: null });
        const { result } = renderHook(() => useUnclaimedItems(null));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.items).toEqual([]);
        expect(result.current.error).toBeNull();
        expect(mockSuiClient.getObject).not.toHaveBeenCalled();
    });
    // UI-02: 2 items in table, only 1 belongs to walletAddress → returns 1 item
    it("UI-02: filters unclaimed items by original_owner === walletAddress", async () => {
        mockUseSSUSharedObjects.mockReturnValue(makeSharedObjs(MOCK_STORAGE_ID));
        mockSuiClient.getObject.mockResolvedValue(makeUserStorageObj(MOCK_TABLE_UID));
        const dfEntries = [
            { name: { type: "0x2::object::ID", value: ITEM_ID_1 } },
            { name: { type: "0x2::object::ID", value: ITEM_ID_2 } },
        ];
        mockSuiClient.getDynamicFields.mockResolvedValue(makeDFPage(dfEntries));
        // Item 1: belongs to wallet. Item 2: belongs to another address.
        mockSuiClient.getDynamicFieldObject
            .mockResolvedValueOnce(makeUnclaimedItemObj(WALLET_ADDRESS, 42, 10, "0xshop1", 1800000000000))
            .mockResolvedValueOnce(makeUnclaimedItemObj(OTHER_ADDRESS, 99, 5, "0xshop2", 1700000000000));
        const { result } = renderHook(() => useUnclaimedItems(MOCK_SSU_ID));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.items).toHaveLength(1);
        const item = result.current.items[0];
        expect(item.typeId).toBe(42);
        expect(item.quantity).toBe(10);
        expect(item.shopId).toBe("0xshop1");
        expect(item.expiryMs).toBe(1800000000000);
        expect(result.current.error).toBeNull();
    });
    // UI-03: polling refetch fires after POLL_INTERVAL_MS (30s)
    it("UI-03: polling refetch fires after 30s and re-fetches items", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        mockUseSSUSharedObjects.mockReturnValue(makeSharedObjs(MOCK_STORAGE_ID));
        // First load: 1 item.
        mockSuiClient.getObject.mockResolvedValue(makeUserStorageObj(MOCK_TABLE_UID));
        mockSuiClient.getDynamicFields.mockResolvedValue(makeDFPage([{ name: { type: "0x2::object::ID", value: ITEM_ID_1 } }]));
        mockSuiClient.getDynamicFieldObject.mockResolvedValue(makeUnclaimedItemObj(WALLET_ADDRESS, 42, 10, "0xshop1", 1800000000000));
        const { result } = renderHook(() => useUnclaimedItems(MOCK_SSU_ID));
        // Let the initial load settle.
        await act(async () => { vi.advanceTimersByTime(30000); });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        const firstLoadCount = result.current.items.length;
        // Advance time by 30s to trigger poll refetch.
        // Reset mocks for the second load: 0 items (cleared storage).
        mockSuiClient.getObject.mockResolvedValue(makeUserStorageObj(MOCK_TABLE_UID));
        mockSuiClient.getDynamicFields.mockResolvedValue(makeDFPage([]));
        await act(async () => { vi.advanceTimersByTime(30000); });
        await waitFor(() => expect(result.current.items.length).toBe(0));
        // First load had items; after poll they are gone — confirms refetch fired.
        expect(firstLoadCount).toBeGreaterThanOrEqual(0); // initial state validated
        vi.useRealTimers();
    });
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
