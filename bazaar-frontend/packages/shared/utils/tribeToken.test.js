// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * Vitest for @bazaar/shared/utils/tribeToken.
 *
 * Covers format roundtrip, strict-parse rejection cases, and edge values.
 * V26+ tribe-token decimals = 2 unless overridden via opts.decimals.
 */
import { describe, it, expect } from "vitest";
import { TRIBE_TOKEN_DECIMALS, TRIBE_TOKEN_SCALE, formatTribeAmount, parseTribeAmount, parseTribeAmountSafe, TribeAmountParseError, } from "./tribeToken";
describe("tribeToken constants", () => {
    it("defaults to 2 decimals", () => {
        expect(TRIBE_TOKEN_DECIMALS).toBe(2);
        expect(TRIBE_TOKEN_SCALE).toBe(100n);
    });
});
describe("formatTribeAmount", () => {
    it("formats integer scaled units to display tokens", () => {
        expect(formatTribeAmount(0n)).toBe("0.00");
        expect(formatTribeAmount(1n)).toBe("0.01");
        expect(formatTribeAmount(99n)).toBe("0.99");
        expect(formatTribeAmount(100n)).toBe("1.00");
        expect(formatTribeAmount(150n)).toBe("1.50");
        expect(formatTribeAmount(12345n)).toBe("123.45");
    });
    it("applies en-US thousands separator by default", () => {
        expect(formatTribeAmount(100000n)).toBe("1,000.00");
        expect(formatTribeAmount(10000000n)).toBe("100,000.00");
        expect(formatTribeAmount(12345678n)).toBe("123,456.78");
    });
    it("appends symbol when provided", () => {
        expect(formatTribeAmount(100n, { symbol: "TOKEN" })).toBe("1.00 TOKEN");
        expect(formatTribeAmount(100000n, { symbol: "SYM" })).toBe("1,000.00 SYM");
    });
    it("honors noGrouping for re-injection into input fields", () => {
        expect(formatTribeAmount(100000n, { noGrouping: true })).toBe("1000.00");
        expect(formatTribeAmount(12345678n, { noGrouping: true })).toBe("123456.78");
    });
    it("respects opts.decimals override", () => {
        expect(formatTribeAmount(12345n, { decimals: 4 })).toBe("1.2345");
        expect(formatTribeAmount(100n, { decimals: 0 })).toBe("100");
    });
    it("accepts number and string raw inputs", () => {
        expect(formatTribeAmount(100)).toBe("1.00");
        expect(formatTribeAmount("100")).toBe("1.00");
        expect(formatTribeAmount("12345")).toBe("123.45");
    });
    it("handles negatives (uncommon but should not crash)", () => {
        expect(formatTribeAmount(-150n)).toBe("-1.50");
    });
    it("renders the V19 genesis mint constant correctly", () => {
        // 10_000_000 scaled units = 100,000.00 display tokens
        expect(formatTribeAmount(10000000n)).toBe("100,000.00");
    });
});
describe("parseTribeAmount — accepting cases", () => {
    it("parses integer strings", () => {
        expect(parseTribeAmount("0")).toBe(0n);
        expect(parseTribeAmount("1")).toBe(100n);
        expect(parseTribeAmount("1000")).toBe(100000n);
    });
    it("parses single-decimal strings", () => {
        expect(parseTribeAmount("1.5")).toBe(150n);
        expect(parseTribeAmount("0.5")).toBe(50n);
        expect(parseTribeAmount(".5")).toBe(50n);
    });
    it("parses two-decimal strings (max precision under decimals=2)", () => {
        expect(parseTribeAmount("1.50")).toBe(150n);
        expect(parseTribeAmount("1.05")).toBe(105n);
        expect(parseTribeAmount("0.01")).toBe(1n);
        expect(parseTribeAmount("123.45")).toBe(12345n);
    });
    it("strips US-style thousands separators", () => {
        expect(parseTribeAmount("1,000")).toBe(100000n);
        expect(parseTribeAmount("1,234.56")).toBe(123456n);
        expect(parseTribeAmount("100,000.00")).toBe(10000000n);
    });
    it("respects custom decimals", () => {
        expect(parseTribeAmount("1.2345", 4)).toBe(12345n);
        expect(parseTribeAmount("1", 0)).toBe(1n);
    });
});
describe("parseTribeAmount — rejecting cases", () => {
    it("rejects empty input", () => {
        expect(() => parseTribeAmount("")).toThrow(TribeAmountParseError);
        expect(() => parseTribeAmount("   ")).toThrow(/empty/);
    });
    it("rejects negative numbers", () => {
        expect(() => parseTribeAmount("-1")).toThrow(/negative/);
        expect(() => parseTribeAmount("-1.50")).toThrow(/negative/);
    });
    it("rejects more decimal places than decimals", () => {
        expect(() => parseTribeAmount("1.234")).toThrow(/max 2 decimal places/);
        expect(() => parseTribeAmount("0.001")).toThrow(/max 2 decimal places/);
        expect(() => parseTribeAmount("1.23456", 4)).toThrow(/max 4 decimal places/);
    });
    it("rejects continental-style comma-as-decimal", () => {
        expect(() => parseTribeAmount("1,50")).toThrow(/use '\.' as decimal separator/);
        expect(() => parseTribeAmount("0,5")).toThrow(/use '\.' as decimal separator/);
    });
    it("rejects comma after decimal point", () => {
        expect(() => parseTribeAmount("1.50,5")).toThrow(/',' after '\.'/);
    });
    it("rejects non-numeric input", () => {
        expect(() => parseTribeAmount("abc")).toThrow(/non-numeric/);
        expect(() => parseTribeAmount("1abc")).toThrow(/non-numeric/);
        expect(() => parseTribeAmount("$5")).toThrow(/non-numeric/);
    });
    it("rejects multiple decimal points", () => {
        expect(() => parseTribeAmount("1.2.3")).toThrow(/multiple decimal points/);
    });
    it("rejects scientific notation", () => {
        expect(() => parseTribeAmount("1e3")).toThrow(/scientific notation/);
        expect(() => parseTribeAmount("1.5E2")).toThrow(/scientific notation/);
    });
});
describe("parseTribeAmountSafe", () => {
    it("returns ok shape on success", () => {
        expect(parseTribeAmountSafe("1.50")).toEqual({ ok: true, value: 150n });
        expect(parseTribeAmountSafe("0")).toEqual({ ok: true, value: 0n });
    });
    it("returns reason on failure (no throw)", () => {
        const r1 = parseTribeAmountSafe("1.234");
        expect(r1.ok).toBe(false);
        if (!r1.ok)
            expect(r1.reason).toMatch(/max 2 decimal places/);
        const r2 = parseTribeAmountSafe("-1");
        expect(r2.ok).toBe(false);
        if (!r2.ok)
            expect(r2.reason).toMatch(/negative/);
        const r3 = parseTribeAmountSafe("");
        expect(r3.ok).toBe(false);
        if (!r3.ok)
            expect(r3.reason).toMatch(/empty/);
    });
});
describe("format/parse round-trip", () => {
    it("format(parse(s)) returns canonical form", () => {
        for (const canonical of ["0.00", "1.00", "1.50", "123.45", "1,000.00", "100,000.00"]) {
            const scaled = parseTribeAmount(canonical);
            expect(formatTribeAmount(scaled)).toBe(canonical);
        }
    });
    it("parse(format(n)) returns the same scaled-unit bigint", () => {
        for (const scaled of [0n, 1n, 99n, 100n, 150n, 12345n, 10000000n]) {
            const display = formatTribeAmount(scaled);
            expect(parseTribeAmount(display)).toBe(scaled);
        }
    });
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
