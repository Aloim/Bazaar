// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * useLockerCapacity.test.ts — Multi-SSU Visibility Phase 3 capacity guard
 * (built in Phase 4). Verifies fetchLockerCapacity() parses the world
 * `Inventory { max_capacity, used_capacity }` dynamic field, the lazy-create
 * (no-field) fail-open path, and lockerWouldOverflow() decision logic.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchLockerCapacity, lockerWouldOverflow } from "../useLockerCapacity";
const SSU = "0x75b5a725fa62ad2978182e4d28fb6f6627e934b5efa070886a0aec24e85a13e4";
const KEY = "0xe61f15200dae7de8791a776741e4af88ce5fd792faa6b10774a3b940f0506bb2";
function fieldResponse(max, used) {
    return { result: { data: { content: { fields: { value: { fields: { max_capacity: max, used_capacity: used, items: {} } } } } } } };
}
function emptyResponse() {
    return { result: { data: null } };
}
function jsonOk(obj) {
    return { ok: true, status: 200, json: async () => obj };
}
beforeEach(() => { vi.restoreAllMocks(); });
describe("fetchLockerCapacity", () => {
    it("parses max/used and computes remaining for an existing locker", async () => {
        global.fetch = vi.fn(async () => jsonOk(fieldResponse("2000000", "25200")));
        const cap = await fetchLockerCapacity(SSU, KEY);
        expect(cap).toEqual({ maxCapacity: 2000000, usedCapacity: 25200, remaining: 1974800, exists: true });
    });
    it("returns exists=false when no Inventory field exists yet (lazy-create)", async () => {
        global.fetch = vi.fn(async () => jsonOk(emptyResponse()));
        const cap = await fetchLockerCapacity(SSU, KEY);
        expect(cap?.exists).toBe(false);
    });
    it("returns null without a network call for an empty key", async () => {
        const spy = vi.fn();
        global.fetch = spy;
        expect(await fetchLockerCapacity(SSU, "")).toBeNull();
        expect(spy).not.toHaveBeenCalled();
    });
});
describe("lockerWouldOverflow", () => {
    it("never blocks on null / non-existent locker (fail-open)", () => {
        expect(lockerWouldOverflow(null)).toBe(false);
        expect(lockerWouldOverflow({ maxCapacity: 0, usedCapacity: 0, remaining: 0, exists: false })).toBe(false);
    });
    it("blocks a full existing locker (remaining<=0) with no required volume", () => {
        expect(lockerWouldOverflow({ maxCapacity: 100, usedCapacity: 100, remaining: 0, exists: true })).toBe(true);
        expect(lockerWouldOverflow({ maxCapacity: 100, usedCapacity: 40, remaining: 60, exists: true })).toBe(false);
    });
    it("respects an explicit requiredVolume", () => {
        const cap = { maxCapacity: 100, usedCapacity: 40, remaining: 60, exists: true };
        expect(lockerWouldOverflow(cap, 60)).toBe(false);
        expect(lockerWouldOverflow(cap, 61)).toBe(true);
    });
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
