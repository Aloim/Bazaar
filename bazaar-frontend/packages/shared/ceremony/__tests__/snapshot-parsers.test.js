// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * Unit tests for the snapshot generator's pure parsers — the bug-prone field-shape
 * handling (Balance<EVE>, Option, vector<u8>, BigInt sums) and member dedupe.
 * These run with no RPC.
 */
import { describe, it, expect } from "vitest";
import { balanceMist, unwrapOption, bytesToString, sumMist } from "../snapshot/readers";
import { dedupeMembers } from "../snapshot/members";
describe("balanceMist", () => {
    it("parses the multiple shapes a Balance<EVE> field can take", () => {
        expect(balanceMist("12345")).toBe("12345"); // bare string (typical)
        expect(balanceMist(67890)).toBe("67890"); // number
        expect(balanceMist({ value: "42" })).toBe("42"); // { value }
        expect(balanceMist({ fields: { value: "7" } })).toBe("7"); // { fields: { value } }
        expect(balanceMist(null)).toBe("0");
        expect(balanceMist(undefined)).toBe("0");
    });
});
describe("unwrapOption", () => {
    it("unwraps Move Option<address|String> shapes", () => {
        expect(unwrapOption({ vec: ["0xabc"] })).toBe("0xabc");
        expect(unwrapOption({ fields: { vec: ["0xdef"] } })).toBe("0xdef");
        expect(unwrapOption({ vec: [] })).toBeNull();
        expect(unwrapOption("0x123")).toBe("0x123");
        expect(unwrapOption(null)).toBeNull();
        expect(unwrapOption("")).toBeNull();
    });
});
describe("bytesToString", () => {
    it("decodes a vector<u8> number array to UTF-8", () => {
        // "Hi" = [72, 105]
        expect(bytesToString([72, 105])).toBe("Hi");
        expect(bytesToString([])).toBe("");
        expect(bytesToString(null)).toBe("");
    });
});
describe("sumMist", () => {
    it("sums u64 strings with BigInt precision", () => {
        expect(sumMist(["1", "2", "3"])).toBe("6");
        expect(sumMist(["18446744073709551615", "1"])).toBe("18446744073709551616"); // > 2^64
        expect(sumMist(["", "5", "bad"])).toBe("5"); // skips empty/garbage
        expect(sumMist([])).toBe("0");
    });
});
describe("dedupeMembers", () => {
    it("dedupes by address keeping max roles and OR-ed ban", () => {
        const rows = [
            { address: "0xa", ssuRole: 2, tribeRole: 1, isBanned: false },
            { address: "0xa", ssuRole: 5, tribeRole: 0, isBanned: true },
            { address: "0xb", ssuRole: 1, tribeRole: 0, isBanned: false },
        ];
        const out = dedupeMembers(rows);
        expect(out).toHaveLength(2);
        const a = out.find((m) => m.address === "0xa");
        expect(a.ssuRole).toBe(5);
        expect(a.tribeRole).toBe(1);
        expect(a.isBanned).toBe(true);
        // sorted by ssuRole desc → 0xa (5) before 0xb (1)
        expect(out[0].address).toBe("0xa");
    });
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
