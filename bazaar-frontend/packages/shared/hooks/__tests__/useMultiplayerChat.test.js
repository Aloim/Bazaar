// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * useMultiplayerChat.test.ts — live "type-out" proximity chat local state.
 *
 * MC-01: onChatChange broadcasts LOCAL_CHAT + updates value/ref.
 * MC-02: input keeps the FULL text (editable); only the broadcast tail rolls.
 * MC-03: 5 s idle auto-clear broadcasts an empty string.
 * MC-04: clearChat clears immediately and cancels the idle timer.
 * MC-05: submitChat (Enter) empties the field but keeps the bubble until it fades.
 * MC-06: submitChat commits the message to history + bumps the broadcast seq.
 *
 * LOCAL_CHAT now also carries `name` (the local speaker label) — default "".
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMultiplayerChat, CHAT_MAX_CHARS, CHAT_IDLE_MS, } from "../useMultiplayerChat";
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
describe("useMultiplayerChat", () => {
    it("MC-01: onChatChange updates value/ref and broadcasts LOCAL_CHAT", () => {
        const sendToGodot = vi.fn();
        const { result } = renderHook(() => useMultiplayerChat({ sendToGodot }));
        act(() => { result.current.onChatChange("hi"); });
        expect(result.current.chatText).toBe("hi");
        expect(result.current.chatTextRef.current).toBe("hi");
        expect(sendToGodot).toHaveBeenLastCalledWith("LOCAL_CHAT", { text: "hi", name: "" });
    });
    it("MC-02: input keeps the FULL text; only the broadcast tail rolls", () => {
        const sendToGodot = vi.fn();
        const { result } = renderHook(() => useMultiplayerChat({ sendToGodot }));
        const long = "x".repeat(CHAT_MAX_CHARS + 15);
        act(() => { result.current.onChatChange(long); });
        // The <input> value is the full text — fully editable, nothing vanishes.
        expect(result.current.chatText).toBe(long);
        expect(result.current.chatText).toHaveLength(CHAT_MAX_CHARS + 15);
        // The broadcast (ref + LOCAL_CHAT bubble) is the rolling tail only.
        expect(result.current.chatTextRef.current).toBe(long.slice(-CHAT_MAX_CHARS));
        expect(sendToGodot).toHaveBeenLastCalledWith("LOCAL_CHAT", {
            text: long.slice(-CHAT_MAX_CHARS),
            name: "",
        });
    });
    it("MC-02b: characters past the limit can still be deleted (no eaten input)", () => {
        const sendToGodot = vi.fn();
        const { result } = renderHook(() => useMultiplayerChat({ sendToGodot }));
        const long = "abcdefghij".repeat((CHAT_MAX_CHARS + 20) / 10);
        act(() => { result.current.onChatChange(long); });
        // Simulate a backspace: the input hands back its full value minus one char.
        act(() => { result.current.onChatChange(long.slice(0, -1)); });
        expect(result.current.chatText).toBe(long.slice(0, -1));
    });
    it("MC-03: clears automatically CHAT_IDLE_MS after the last keystroke", () => {
        const sendToGodot = vi.fn();
        const { result } = renderHook(() => useMultiplayerChat({ sendToGodot }));
        act(() => { result.current.onChatChange("typing"); });
        expect(result.current.chatText).toBe("typing");
        act(() => { vi.advanceTimersByTime(CHAT_IDLE_MS); });
        expect(result.current.chatText).toBe("");
        expect(result.current.chatTextRef.current).toBe("");
        expect(sendToGodot).toHaveBeenLastCalledWith("LOCAL_CHAT", { text: "", name: "" });
    });
    it("MC-03b: each keystroke re-arms the idle timer (no premature clear)", () => {
        const sendToGodot = vi.fn();
        const { result } = renderHook(() => useMultiplayerChat({ sendToGodot }));
        act(() => { result.current.onChatChange("a"); });
        act(() => { vi.advanceTimersByTime(CHAT_IDLE_MS - 500); });
        act(() => { result.current.onChatChange("ab"); }); // re-arm
        act(() => { vi.advanceTimersByTime(CHAT_IDLE_MS - 500); });
        expect(result.current.chatText).toBe("ab"); // not cleared yet
    });
    it("MC-04: clearChat clears immediately and cancels the idle timer", () => {
        const sendToGodot = vi.fn();
        const { result } = renderHook(() => useMultiplayerChat({ sendToGodot }));
        act(() => { result.current.onChatChange("bye"); });
        act(() => { result.current.clearChat(); });
        expect(result.current.chatText).toBe("");
        expect(sendToGodot).toHaveBeenLastCalledWith("LOCAL_CHAT", { text: "", name: "" });
        sendToGodot.mockClear();
        // The previously-armed 5 s timer must not fire after an explicit clear.
        act(() => { vi.advanceTimersByTime(CHAT_IDLE_MS); });
        expect(sendToGodot).not.toHaveBeenCalled();
    });
    it("MC-05: submitChat empties the field but the bubble stays then fades", () => {
        const sendToGodot = vi.fn();
        const { result } = renderHook(() => useMultiplayerChat({ sendToGodot }));
        act(() => { result.current.onChatChange("on a mission"); });
        sendToGodot.mockClear();
        // Enter: field clears, but the broadcast tail + bubble are untouched (no "" sent).
        act(() => { result.current.submitChat(); });
        expect(result.current.chatText).toBe("");
        expect(result.current.chatTextRef.current).toBe("on a mission");
        expect(sendToGodot).not.toHaveBeenCalled();
        // The bubble still fades on its own ~CHAT_IDLE_MS after the last keystroke.
        act(() => { vi.advanceTimersByTime(CHAT_IDLE_MS); });
        expect(result.current.chatTextRef.current).toBe("");
        expect(sendToGodot).toHaveBeenLastCalledWith("LOCAL_CHAT", { text: "", name: "" });
    });
    it("MC-06: submitChat commits to history (appendMessage) + bumps the broadcast seq", () => {
        const sendToGodot = vi.fn();
        const appendMessage = vi.fn();
        const { result } = renderHook(() => useMultiplayerChat({ sendToGodot, displayName: "Me", appendMessage }));
        act(() => { result.current.onChatChange("gm o7"); });
        expect(result.current.msgSeqRef.current).toBe(0);
        act(() => { result.current.submitChat(); });
        expect(appendMessage).toHaveBeenCalledWith("Me", "gm o7");
        expect(result.current.msgRef.current).toBe("gm o7");
        expect(result.current.msgSeqRef.current).toBe(1);
        expect(result.current.chatText).toBe("");
    });
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
