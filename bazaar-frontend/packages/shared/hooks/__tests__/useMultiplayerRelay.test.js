// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * useMultiplayerRelay.test.ts — chat piggybacks on the position message.
 *
 * RL-01: outbound `position` carries chatTextRef.current.
 * RL-02: inbound `position.chat` propagates into the PLAYER_POSITIONS payload.
 *
 * Uses a minimal FakeWebSocket + fake timers (the send loop runs at 5 Hz).
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createRef } from "react";
// useCurrentSsuContext hits react-query/RPC — mock it so the relay hook stays unit-testable.
// Local viewer is a NoTribe SSU "0xself", so a NoTribe peer classifies as "tribe" (blue).
vi.mock("../useCurrentSsuContext", () => ({
    useCurrentSsuContext: () => ({ ssuId: "0xself", bazaarType: "NoTribe", tribeId: null, isLoading: false }),
}));
// ── Fake WebSocket ──────────────────────────────────────────────────────────
let lastSocket = null;
class FakeWebSocket {
    constructor(url) {
        this.CONNECTING = 0;
        this.OPEN = 1;
        this.CLOSING = 2;
        this.CLOSED = 3;
        this.readyState = 0;
        this.sent = [];
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;
        this.url = url;
        lastSocket = this;
    }
    send(data) { this.sent.push(data); }
    close() { this.readyState = FakeWebSocket.CLOSED; this.onclose?.(); }
    // Test helpers
    _open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
    _message(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}
FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSING = 2;
FakeWebSocket.CLOSED = 3;
import { useMultiplayerRelay, normalizeRelayUrl } from "../useMultiplayerRelay";
const LOCAL = "0xlocal";
const REMOTE = "0xremote";
beforeEach(() => {
    vi.useFakeTimers();
    lastSocket = null;
    vi.stubGlobal("WebSocket", FakeWebSocket);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});
function setup(chat) {
    const sendToGodot = vi.fn();
    const playerPositionRef = createRef();
    playerPositionRef.current = { x: 5, y: 7, direction: "se" };
    const chatTextRef = { current: chat };
    const hook = renderHook(() => useMultiplayerRelay({
        enabled: true,
        serverUrl: "ws://relay.test",
        playerAddress: LOCAL,
        displayName: "Me",
        playerPositionRef,
        sendToGodot,
        chatTextRef,
    }));
    return { sendToGodot, chatTextRef, hook };
}
describe("useMultiplayerRelay — chat piggyback", () => {
    it("RL-01: outbound position message includes chatTextRef text", () => {
        const { chatTextRef } = setup("hel");
        act(() => { lastSocket?._open(); });
        chatTextRef.current = "hello";
        act(() => { vi.advanceTimersByTime(250); }); // one 5 Hz send tick
        expect(lastSocket).not.toBeNull();
        const msgs = lastSocket.sent.map((s) => JSON.parse(s));
        const pos = msgs.find((m) => m.type === "position");
        expect(pos).toBeTruthy();
        expect(pos.chat).toBe("hello");
        expect(pos.x).toBe(5);
    });
    it("RL-02: inbound position.chat flows into the PLAYER_POSITIONS payload", () => {
        const { sendToGodot } = setup("");
        act(() => { lastSocket?._open(); });
        act(() => {
            lastSocket._message({
                type: "position",
                address: REMOTE,
                displayName: "Them",
                x: 1, y: 2, direction: "nw",
                chat: "gm o7",
            });
        });
        const call = sendToGodot.mock.calls.find((c) => c[0] === "PLAYER_POSITIONS");
        expect(call).toBeTruthy();
        const players = call[1].players;
        const remote = players.find((p) => p.address === REMOTE);
        expect(remote?.chat).toBe("gm o7");
    });
    it("RL-02b: missing inbound chat defaults to empty string", () => {
        const { sendToGodot } = setup("");
        act(() => { lastSocket?._open(); });
        act(() => {
            lastSocket._message({
                type: "position",
                address: REMOTE,
                displayName: "Them",
                x: 1, y: 2, direction: "nw",
            });
        });
        const call = sendToGodot.mock.calls.find((c) => c[0] === "PLAYER_POSITIONS");
        const players = call[1].players;
        expect(players.find((p) => p.address === REMOTE)?.chat).toBe("");
    });
});
describe("useMultiplayerRelay — relationship colour (own/tribe/other)", () => {
    function remotePlayer(sendToGodot) {
        const call = sendToGodot.mock.calls.filter((c) => c[0] === "PLAYER_POSITIONS").pop();
        const players = call[1].players;
        return players.find((p) => p.address === REMOTE);
    }
    it("same SSU → own (yellow/orange)", () => {
        const { sendToGodot } = setup("");
        act(() => { lastSocket?._open(); });
        act(() => {
            lastSocket._message({
                type: "position", address: REMOTE, displayName: "Them", x: 1, y: 2, direction: "n",
                ssuId: "0xself", bazaarType: 0, tribeId: 0,
            });
        });
        const r = remotePlayer(sendToGodot);
        expect(r?.tier).toBe("own");
        expect(r?.color).toBe("#e0a64b");
    });
    it("NoTribe viewer + NoTribe peer on another SSU → tribe (blue)", () => {
        const { sendToGodot } = setup("");
        act(() => { lastSocket?._open(); });
        act(() => {
            lastSocket._message({
                type: "position", address: REMOTE, displayName: "Them", x: 1, y: 2, direction: "n",
                ssuId: "0xother", bazaarType: 0, tribeId: 0,
            });
        });
        const r = remotePlayer(sendToGodot);
        expect(r?.tier).toBe("tribe");
        expect(r?.color).toBe("#4a8fd4");
    });
    it("different SSU + Easy/tribe peer → other (red)", () => {
        const { sendToGodot } = setup("");
        act(() => { lastSocket?._open(); });
        act(() => {
            lastSocket._message({
                type: "position", address: REMOTE, displayName: "Them", x: 1, y: 2, direction: "n",
                ssuId: "0xother", bazaarType: 1, tribeId: 5,
            });
        });
        const r = remotePlayer(sendToGodot);
        expect(r?.tier).toBe("other");
        expect(r?.color).toBe("#cc4b4b");
    });
    it("outbound position carries self ssuId + bazaarType", () => {
        setup("");
        act(() => { lastSocket?._open(); });
        act(() => { vi.advanceTimersByTime(250); });
        const pos = lastSocket.sent.map((s) => JSON.parse(s)).find((m) => m.type === "position");
        expect(pos.ssuId).toBe("0xself");
        expect(pos.bazaarType).toBe(0);
    });
});
describe("useMultiplayerRelay — committed-message history piggyback", () => {
    it("RL-03: a peer msgSeq increment fires onRemoteMessage (first sighting skipped, no dupes)", () => {
        const sendToGodot = vi.fn();
        const onRemoteMessage = vi.fn();
        const playerPositionRef = { current: { x: 0, y: 0, direction: "se" } };
        renderHook(() => useMultiplayerRelay({
            enabled: true,
            serverUrl: "ws://relay.test",
            playerAddress: LOCAL,
            displayName: "Me",
            playerPositionRef,
            sendToGodot,
            onRemoteMessage,
        }));
        act(() => { lastSocket?._open(); });
        // First sighting (seq=2) is NOT replayed — could be a pre-join message.
        act(() => {
            lastSocket._message({
                type: "position", address: REMOTE, displayName: "Them", x: 1, y: 2, direction: "n",
                msg: "old one", msgSeq: 2,
            });
        });
        expect(onRemoteMessage).not.toHaveBeenCalled();
        // A higher seq → appended once.
        act(() => {
            lastSocket._message({
                type: "position", address: REMOTE, displayName: "Them", x: 1, y: 2, direction: "n",
                msg: "gm o7", msgSeq: 3,
            });
        });
        expect(onRemoteMessage).toHaveBeenCalledWith("Them", "gm o7");
        // Same seq re-broadcast at 5 Hz → no duplicate.
        act(() => {
            lastSocket._message({
                type: "position", address: REMOTE, displayName: "Them", x: 1, y: 2, direction: "n",
                msg: "gm o7", msgSeq: 3,
            });
        });
        expect(onRemoteMessage).toHaveBeenCalledTimes(1);
    });
});
describe("useMultiplayerRelay — double-login (active session wins)", () => {
    function setupRelay() {
        const sendToGodot = vi.fn();
        const playerPositionRef = { current: { x: 0, y: 0, direction: "se" } };
        renderHook(() => useMultiplayerRelay({
            enabled: true, serverUrl: "ws://relay.test", playerAddress: LOCAL,
            displayName: "Me", playerPositionRef, sendToGodot,
        }));
        act(() => { lastSocket?._open(); });
        return sendToGodot;
    }
    function lastPlayers(sendToGodot) {
        const call = sendToGodot.mock.calls.filter((c) => c[0] === "PLAYER_POSITIONS").pop();
        return call[1].players;
    }
    const remoteX = (s) => lastPlayers(s).find((p) => p.address === REMOTE)?.x;
    it("DL-01: a rival session is ignored while the owner is active (no rubber-band)", () => {
        const sendToGodot = setupRelay();
        // Session A claims REMOTE's avatar at x=10.
        act(() => {
            lastSocket._message({
                type: "position", address: REMOTE, sessionId: "A", displayName: "Them", x: 10, y: 0, direction: "n"
            });
        });
        expect(remoteX(sendToGodot)).toBe(10);
        // Session B (same wallet, 2nd client) immediately reports x=99 → IGNORED.
        act(() => {
            lastSocket._message({
                type: "position", address: REMOTE, sessionId: "B", displayName: "Them", x: 99, y: 0, direction: "n"
            });
        });
        expect(remoteX(sendToGodot)).toBe(10);
        // Owner A keeps driving → accepted.
        act(() => {
            lastSocket._message({
                type: "position", address: REMOTE, sessionId: "A", displayName: "Them", x: 11, y: 0, direction: "n"
            });
        });
        expect(remoteX(sendToGodot)).toBe(11);
    });
    it("DL-02: a rival session takes over once the owner goes silent past the hand-off window", () => {
        const sendToGodot = setupRelay();
        act(() => {
            lastSocket._message({
                type: "position", address: REMOTE, sessionId: "A", displayName: "Them", x: 10, y: 0, direction: "n"
            });
        });
        act(() => { vi.advanceTimersByTime(3000); }); // owner A silent > OWNER_HANDOFF_MS (2.5s)
        act(() => {
            lastSocket._message({
                type: "position", address: REMOTE, sessionId: "B", displayName: "Them", x: 99, y: 0, direction: "n"
            });
        });
        expect(remoteX(sendToGodot)).toBe(99);
    });
    it("DL-03: only the owning session's leave clears the avatar", () => {
        const sendToGodot = setupRelay();
        act(() => {
            lastSocket._message({
                type: "position", address: REMOTE, sessionId: "A", displayName: "Them", x: 10, y: 0, direction: "n"
            });
        });
        // Rival B leaves → avatar stays (A still owns it).
        act(() => { lastSocket._message({ type: "leave", address: REMOTE, sessionId: "B" }); });
        expect(lastPlayers(sendToGodot).length).toBe(1);
        // Owner A leaves → avatar removed.
        act(() => { lastSocket._message({ type: "leave", address: REMOTE, sessionId: "A" }); });
        expect(lastPlayers(sendToGodot).length).toBe(0);
    });
});
describe("useMultiplayerRelay — identity binding (AUD-UX-02 / B5)", () => {
    function setupWithSign(signFn) {
        const sendToGodot = vi.fn();
        const playerPositionRef = { current: { x: 1, y: 1, direction: "se" } };
        renderHook(() => useMultiplayerRelay({
            enabled: true,
            serverUrl: "ws://relay.test",
            playerAddress: LOCAL,
            displayName: "Me",
            playerPositionRef,
            sendToGodot,
            signMessage: signFn,
        }));
        act(() => { lastSocket?._open(); });
        return sendToGodot;
    }
    const sentTypes = () => lastSocket.sent.map((s) => JSON.parse(s));
    it("IB-01: with signMessage, the first outbound frame is auth_request, not position", () => {
        setupWithSign(vi.fn().mockResolvedValue({ signature: "sig_abc" }));
        act(() => { vi.advanceTimersByTime(500); });
        const msgs = sentTypes();
        expect(msgs.find((m) => m.type === "auth_request")).toBeTruthy();
        expect(msgs.find((m) => m.type === "position")).toBeUndefined();
    });
    it("IB-02: auth_challenge → auth_response carries nonce + signature, no publicKey", async () => {
        const signFn = vi.fn().mockResolvedValue({ signature: "sig_abc" });
        setupWithSign(signFn);
        await act(async () => {
            lastSocket._message({ type: "auth_challenge", nonce: "deadbeef1234" });
            await Promise.resolve();
            await Promise.resolve();
        });
        const resp = lastSocket.sent
            .map((s) => JSON.parse(s))
            .find((m) => m.type === "auth_response");
        expect(resp).toBeTruthy();
        expect(resp.nonce).toBe("deadbeef1234");
        expect(resp.signature).toBe("sig_abc");
        expect("publicKey" in resp).toBe(false); // CC-B5-04
        expect(signFn).toHaveBeenCalledWith("deadbeef1234");
    });
    it("IB-03: on auth_ok the send loop starts and position messages flow", async () => {
        setupWithSign(vi.fn().mockResolvedValue({ signature: "sig_abc" }));
        await act(async () => {
            lastSocket._message({ type: "auth_challenge", nonce: "abc" });
            await Promise.resolve();
            await Promise.resolve();
        });
        act(() => { lastSocket._message({ type: "auth_ok", verifiedAddress: LOCAL }); });
        act(() => { vi.advanceTimersByTime(300); });
        expect(sentTypes().some((m) => m.type === "position")).toBe(true);
    });
    it("IB-04: without signMessage the send loop starts immediately (legacy mode)", () => {
        setupWithSign(undefined);
        expect(sentTypes().find((m) => m.type === "auth_request")).toBeUndefined();
        act(() => { vi.advanceTimersByTime(300); });
        expect(sentTypes().some((m) => m.type === "position")).toBe(true);
    });
    it("IB-05: auth_fail logs a warning and still starts the send loop (graceful degradation)", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        setupWithSign(vi.fn().mockResolvedValue({ signature: "bad_sig" }));
        act(() => { lastSocket._message({ type: "auth_fail", reason: "invalid_signature" }); });
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("auth_fail"), "invalid_signature");
        act(() => { vi.advanceTimersByTime(300); });
        expect(sentTypes().some((m) => m.type === "position")).toBe(true);
        warnSpy.mockRestore();
    });
    it("IB-06: a cancelled signature degrades to guest and still starts the loop", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const signFn = vi.fn().mockRejectedValue(new Error("user rejected"));
        setupWithSign(signFn);
        await act(async () => {
            lastSocket._message({ type: "auth_challenge", nonce: "abc" });
            await Promise.resolve();
            await Promise.resolve();
        });
        // No auth_response sent; the loop started anyway.
        expect(sentTypes().find((m) => m.type === "auth_response")).toBeUndefined();
        act(() => { vi.advanceTimersByTime(300); });
        expect(sentTypes().some((m) => m.type === "position")).toBe(true);
        warnSpy.mockRestore();
    });
});
describe("normalizeRelayUrl", () => {
    it("converts https:// to wss:// (the Render/PaaS case)", () => {
        expect(normalizeRelayUrl("https://bazar-pw69.onrender.com")).toBe("wss://bazar-pw69.onrender.com");
    });
    it("converts http:// to ws://", () => {
        expect(normalizeRelayUrl("http://example.com:8080")).toBe("ws://example.com:8080");
    });
    it("keeps ws:// and wss:// untouched", () => {
        expect(normalizeRelayUrl("wss://host")).toBe("wss://host");
        expect(normalizeRelayUrl("ws://host")).toBe("ws://host");
    });
    it("prefixes a bare host with wss://", () => {
        expect(normalizeRelayUrl("bazar-pw69.onrender.com")).toBe("wss://bazar-pw69.onrender.com");
    });
    it("uses ws:// for bare localhost/127.0.0.1 dev hosts", () => {
        expect(normalizeRelayUrl("localhost:8080")).toBe("ws://localhost:8080");
        expect(normalizeRelayUrl("127.0.0.1:8080")).toBe("ws://127.0.0.1:8080");
    });
    it("trims whitespace and returns '' for empty input", () => {
        expect(normalizeRelayUrl("  wss://host  ")).toBe("wss://host");
        expect(normalizeRelayUrl("   ")).toBe("");
        expect(normalizeRelayUrl("")).toBe("");
    });
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
