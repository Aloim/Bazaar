// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * useBanList.test.ts
 *
 * Vitest unit tests — BL-01, BL-02.
 * OS-54-followup FE-A Phase 1.
 *
 * Mock strategy:
 *   vi.mock("../sui-client") — hand-rolled JSON-RPC client singleton.
 *   vi.mock("../bazaarcore/governance-resolution-hooks") — useSSUSharedObjects.
 *   useConnection from @evefrontier/dapp-kit is NOT used by useBanList directly.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
// ── vi.hoisted mocks ──────────────────────────────────────────────────────────
const mockSuiClient = vi.hoisted(() => ({
    getObject: vi.fn(),
    getDynamicFields: vi.fn(),
    getDynamicFieldObject: vi.fn(),
}));
const mockUseSSUSharedObjects = vi.hoisted(() => vi.fn());
vi.mock("../sui-client", () => ({ suiClient: mockSuiClient }));
vi.mock("../bazaarcore/governance-resolution-hooks", () => ({
    useSSUSharedObjects: mockUseSSUSharedObjects,
}));
// ── Test constants ────────────────────────────────────────────────────────────
const MOCK_SSU_ID = "0xabc000000000000000000000000000000000000000000000000000000000001";
const MOCK_MEMBER_REG_ID = "0x0002222222222222222222222222222222222222222222222222222222222222";
const MOCK_TABLE_UID = "0xaaaa111111111111111111111111111111111111111111111111111111111111";
const PLAYER_BANNED = "0xbanned11111111111111111111111111111111111111111111111111111111";
const PLAYER_ACTIVE = "0xactive11111111111111111111111111111111111111111111111111111111";
// ── Mock response builders ────────────────────────────────────────────────────
function makeMemberRegistryObj(tableUid) {
    return {
        data: {
            content: {
                fields: {
                    members: {
                        fields: { id: { id: tableUid } },
                    },
                },
            },
        },
    };
}
function makeDynamicFieldsPage(entries) {
    return { data: entries, nextCursor: null, hasNextPage: false };
}
function makeMemberEntryObj(player, isBanned, registeredAtMs) {
    return {
        data: {
            content: {
                fields: {
                    key: player,
                    value: {
                        player,
                        ssu_role: 2,
                        tribe_role: 0,
                        is_banned: isBanned,
                        registered_at_ms: registeredAtMs,
                    },
                },
            },
        },
    };
}
// ── Import hook (after mocks declared) ───────────────────────────────────────
import { useBanList } from "../useBanList";
// ── Tests ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
    mockSuiClient.getObject.mockReset();
    mockSuiClient.getDynamicFields.mockReset();
    mockSuiClient.getDynamicFieldObject.mockReset();
    mockUseSSUSharedObjects.mockReset();
});
describe("useBanList", () => {
    // BL-01: null ssuId → sharedObjs null → banned stays empty, no RPC calls
    it("BL-01: returns empty banned list when ssuId is null (hook disabled)", async () => {
        mockUseSSUSharedObjects.mockReturnValue({ data: null });
        const { result } = renderHook(() => useBanList(null));
        // Give effect a chance to run — it should bail early.
        await waitFor(() => expect(result.current.banned).toEqual([]));
        expect(mockSuiClient.getObject).not.toHaveBeenCalled();
        expect(mockSuiClient.getDynamicFields).not.toHaveBeenCalled();
    });
    // BL-02: memberRegistry has 1 banned + 1 active → returns only the banned entry
    it("BL-02: filters to only is_banned=true entries and populates expiryMs from registered_at_ms", async () => {
        mockUseSSUSharedObjects.mockReturnValue({
            data: {
                ssuGovId: "0xgov",
                memberRegistryId: MOCK_MEMBER_REG_ID,
                widgetConfigId: "0xwcfg",
                announcementBoardId: "0xab",
                guestbookBoardId: "0xgb",
                userStorageId: "0xus",
            },
        });
        mockSuiClient.getObject.mockResolvedValue(makeMemberRegistryObj(MOCK_TABLE_UID));
        const dfEntries = [
            { name: { type: "address", value: PLAYER_BANNED } },
            { name: { type: "address", value: PLAYER_ACTIVE } },
        ];
        mockSuiClient.getDynamicFields.mockResolvedValue(makeDynamicFieldsPage(dfEntries));
        mockSuiClient.getDynamicFieldObject
            .mockResolvedValueOnce(makeMemberEntryObj(PLAYER_BANNED, true, 1700000000000))
            .mockResolvedValueOnce(makeMemberEntryObj(PLAYER_ACTIVE, false, 1699000000000));
        const { result } = renderHook(() => useBanList(MOCK_SSU_ID));
        await waitFor(() => expect(result.current.banned.length).toBe(1));
        const entry = result.current.banned[0];
        expect(entry.address).toBe(PLAYER_BANNED);
        expect(entry.expiryMs).toBe(1700000000000);
        expect(mockSuiClient.getObject).toHaveBeenCalledWith(expect.objectContaining({ id: MOCK_MEMBER_REG_ID }));
        expect(mockSuiClient.getDynamicFields).toHaveBeenCalledWith(expect.objectContaining({ parentId: MOCK_TABLE_UID, limit: 200 }));
        expect(mockSuiClient.getDynamicFieldObject).toHaveBeenCalledTimes(2);
    });
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
