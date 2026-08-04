// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * chatLines.test.ts — proximity-chat line layout helpers.
 *
 * CL-01: wrapText greedy word-wraps to <= cols.
 * CL-02: wrapText hard-splits an over-long word.
 * CL-03: wrapText returns [] for empty/whitespace.
 * CL-04: prefixSpeakerLines prepends "name: " on lines 0,2,4 only.
 * CL-05: empty name yields bare wrapped lines.
 */
import { describe, it, expect } from "vitest";
import { wrapText, prefixSpeakerLines } from "./chatLines";
describe("wrapText", () => {
    it("CL-01: greedy word-wraps to <= cols", () => {
        const lines = wrapText("the quick brown fox jumps", 10);
        expect(lines.every(l => l.length <= 10)).toBe(true);
        expect(lines.join(" ")).toBe("the quick brown fox jumps");
    });
    it("CL-02: hard-splits a word longer than cols", () => {
        const lines = wrapText("abcdefghijklmno", 5);
        expect(lines).toEqual(["abcde", "fghij", "klmno"]);
    });
    it("CL-03: empty / whitespace returns []", () => {
        expect(wrapText("", 10)).toEqual([]);
        expect(wrapText("   ", 10)).toEqual([]);
    });
});
describe("prefixSpeakerLines", () => {
    it("CL-04: prepends 'name: ' on every 2nd line starting with the first", () => {
        const lines = prefixSpeakerLines("Dracula", "aaaa bbbb cccc dddd eeee", 4);
        // 5 wrapped lines (each word is its own line at cols=4) → prefix 0,2,4.
        expect(lines[0].startsWith("Dracula: ")).toBe(true);
        expect(lines[1].startsWith("Dracula: ")).toBe(false);
        expect(lines[2].startsWith("Dracula: ")).toBe(true);
        expect(lines[3].startsWith("Dracula: ")).toBe(false);
        expect(lines[4].startsWith("Dracula: ")).toBe(true);
    });
    it("CL-05: empty name yields bare wrapped lines", () => {
        expect(prefixSpeakerLines("", "hello world", 20)).toEqual(["hello world"]);
    });
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
