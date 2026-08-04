// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// useMultiplayerRelay.ts — WebSocket relay hook for real-time player position sharing.
//
// Transport: plain WebSocket broadcast to the relay URL. The URL comes from
// localStorage["multiplayerServerUrl"] (browser-local; the Move WidgetConfig has no
// server_url field, so the `serverUrl` prop is effectively always ""). Pasted https://
// / http:// / bare-host values are normalized to wss:// / ws:// (see normalizeRelayUrl).
//   React → relay server: { type: "position", address, sessionId, displayName, x, y, direction, chat }
//   React → relay server: { type: "leave",    address, sessionId }
//   relay server → React: same shapes, echoed from other clients
//
// sessionId (stable per hook mount) makes one wallet's TWO logins resolve to a
// SINGLE avatar for everyone else: the receiver locks each address's avatar to the
// owning session and only hands off to a rival session after the owner goes silent
// (~OWNER_HANDOFF_MS), so the avatar no longer rubber-bands between two clients.
// You never see your OWN second session — own echoes are dropped by address first.
//
// Live proximity chat PIGGYBACKS on the position message (the relay is external and only
// guaranteed to forward known types). `chat` carries the typist's in-progress text — the
// rolling tail written to chatTextRef by useMultiplayerChat. Empty string clears the bubble.
//
// Only active when:
//   - enabled === true  (widget index 3 from useWidgetConfig)
//   - serverUrl is a non-empty string (from useWidgetConfig → on-chain WidgetConfig.server_url)
//   - playerAddress is non-empty (wallet connected)
//
// Reconnection: exponential backoff 1s → 2s → 4s → ... → 30s cap.
// On intentional disconnect: sends { type: "leave" } before ws.close(1000).
// Own echoes are silently dropped (incoming address === playerAddress).

import { useEffect, useRef, useState, useCallback } from "react";
import type { PlayerPosition } from "./useGodotBridge";
import { useCurrentSsuContext } from "./useCurrentSsuContext";
import { classifyShopTier, TIER_COLOR, type ShopTierContext } from "../utils/shopTier";
import type { BazaarTypeName } from "./useBazaarType";

// Bazaar-type name → on-chain u8 (mirrors useCurrentSsuContext's BAZAAR_TYPE_MAP, inverted).
function bazaarTypeToNum(name: BazaarTypeName | null): number {
  return name === "Advanced" ? 2 : name === "Easy" ? 1 : 0;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseMultiplayerRelayParams {
  enabled:           boolean;
  serverUrl:         string;
  playerAddress:     string;
  displayName:       string;
  playerPositionRef: React.MutableRefObject<PlayerPosition | null>;
  sendToGodot:       (type: string, payload: Record<string, unknown>) => void;
  // Live proximity chat: the local player's current in-progress text (rolling tail).
  // Read every send tick and piggybacked onto the position message. Optional so the
  // hook works without chat wired.
  chatTextRef?:      React.MutableRefObject<string>;
  // The local player's current skin slug (rolling). Piggybacked onto the position
  // message so every peer sees the chosen avatar. Optional.
  skinRef?:          React.MutableRefObject<string>;
  // Committed-message history piggyback: the local player's last SUBMITTED message
  // (msgRef) + a monotonic sequence (msgSeqRef). Both ride the position message; when
  // a peer's msgSeq increments, onRemoteMessage(name, text) fires so the listener can
  // append it to the shared chat log. All optional so the hook works without chat.
  msgRef?:           React.MutableRefObject<string>;
  msgSeqRef?:        React.MutableRefObject<number>;
  onRemoteMessage?:  (name: string, text: string) => void;
  // AUD-UX-02 (B5): optional callback that signs a UTF-8 string with the connected
  // wallet (dAppKit.signPersonalMessage). Resolves to { signature } — the base64
  // compact-with-scheme-byte value. When present, the hook performs the relay
  // identity-binding handshake (auth_request → sign nonce → auth_response) before
  // the position loop starts. When absent, the hook runs in legacy mode (no auth).
  signMessage?:      (message: string) => Promise<{ signature: string }>;
}

export interface UseMultiplayerRelayResult {
  connected:   boolean;
  playerCount: number;
}

interface RemotePlayer {
  address:     string;
  displayName: string;
  x:           number;
  y:           number;
  direction:   string;
  chat:        string;
  // The peer's chosen avatar skin slug (piggybacked).
  skin:        string;
  // Last committed-message sequence seen from this peer (history dedupe).
  msgSeq:      number;
  // Relationship-colour inputs (piggybacked): the peer's SSU/tribe identity.
  ssuId:       string;
  bazaarType:  number;  // 0 NoTribe | 1 Easy | 2 Advanced
  tribeId:     number;  // 0 for NoTribe
  // Double-login arbitration: the session that currently OWNS this address's
  // avatar, and the wall-clock of its last accepted update. A rival session (same
  // wallet, second client) is ignored until the owner is silent > OWNER_HANDOFF_MS.
  ownerSessionId: string;
  lastUpdateMs:   number;
}

// Outbound envelope
interface OutboundPositionMsg {
  type:        "position";
  address:     string;
  // Stable per-mount session id — distinguishes a second login of the same wallet.
  sessionId:   string;
  displayName: string;
  x:           number;
  y:           number;
  direction:   string;
  chat:        string;
  skin:        string;
  // Last committed message + its sequence (piggybacked history; see msgRef/msgSeqRef).
  msg:         string;
  msgSeq:      number;
  // Self identity so peers can colour this player own/tribe/other (same tiers as shops).
  ssuId:       string;
  bazaarType:  number;
  tribeId:     number;
}

interface OutboundLeaveMsg {
  type:      "leave";
  address:   string;
  sessionId: string;
}

type OutboundMsg = OutboundPositionMsg | OutboundLeaveMsg;

// Inbound envelopes — discriminated union, unknown fields ignored.
// sessionId is optional for backward-compat: legacy peers omit it, so the receiver
// falls back to the address as a stable session id (one stable avatar per legacy peer).
type InboundMsg =
  | { type: "position"; address: string; sessionId?: string; displayName: string; x: number; y: number; direction: string; chat?: string; skin?: string; msg?: string; msgSeq?: number; ssuId?: string; bazaarType?: number; tribeId?: number }
  | { type: "leave";    address: string; sessionId?: string }
  // AUD-UX-02 (B5) identity-binding handshake frames.
  | { type: "auth_challenge"; nonce: string }
  | { type: "auth_ok";   verifiedAddress: string }
  | { type: "auth_fail"; reason: string };

// The send loop is stashed on the socket so the auth_ok handler can defer-start it.
type AuthAwareSocket = WebSocket & { _startSendLoop?: () => void };

// ── Constants ─────────────────────────────────────────────────────────────────

const SEND_INTERVAL_MS  = 200;   // 5 Hz
const BACKOFF_INITIAL   = 1_000; // ms
const BACKOFF_MAX       = 30_000;
// Double-login hand-off: a rival session (same wallet, second client) only takes
// over an address's avatar once the current owner has been silent this long. Must
// exceed the 200 ms send interval by a wide margin so a single dropped tick never
// triggers a hand-off. 2.5 s ≈ a dozen missed ticks.
const OWNER_HANDOFF_MS  = 2_500;

/** Stable, collision-resistant per-mount session id (no crypto dependency). */
function makeSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// localStorage key shared with WidgetMenuTab. NOTE: the Move `WidgetConfig` struct has NO
// `server_url` field (only `enabled_widgets`), so `useWidgetConfig().serverUrl` is always "".
// In practice this localStorage value is the ONLY source of the relay URL — it is browser-local,
// so each player sets it in their own browser.
const LS_RELAY_KEY = "multiplayerServerUrl";

/**
 * Normalize a user-entered relay URL to a WebSocket URL the browser will accept.
 *   https://host  → wss://host      http://host → ws://host      (PaaS gives https domains; WS needs wss)
 *   ws:// / wss:// → kept as-is
 *   bare host (no scheme) → wss://host  (ws://host for localhost/127.0.0.1 dev)
 *   empty / whitespace    → "" (caller treats as "no URL")
 * Exported so the WidgetMenuTab input and this hook stay in lock-step.
 */
export function normalizeRelayUrl(raw: string): string {
  const url = (raw ?? "").trim();
  if (!url) return "";
  if (/^wss?:\/\//i.test(url))   return url;
  if (/^https:\/\//i.test(url))  return url.replace(/^https:\/\//i, "wss://");
  if (/^http:\/\//i.test(url))   return url.replace(/^http:\/\//i, "ws://");
  // No scheme — default to secure, except obvious local-dev hosts.
  const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(url);
  return (isLocal ? "ws://" : "wss://") + url;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMultiplayerRelay({
  enabled,
  serverUrl,
  playerAddress,
  displayName,
  playerPositionRef,
  sendToGodot,
  chatTextRef,
  skinRef,
  msgRef,
  msgSeqRef,
  onRemoteMessage,
  signMessage,
}: UseMultiplayerRelayParams): UseMultiplayerRelayResult {
  const [connected,   setConnected]   = useState(false);
  const [playerCount, setPlayerCount] = useState(0);

  // Keep onRemoteMessage current without re-creating the socket closures.
  const onRemoteMessageRef = useRef(onRemoteMessage);
  useEffect(() => { onRemoteMessageRef.current = onRemoteMessage; }, [onRemoteMessage]);

  // AUD-UX-02 (B5): ref-wrapped signMessage so the async ws closures see the
  // latest value without re-creating the socket on prop change.
  const signMessageRef = useRef(signMessage);
  useEffect(() => { signMessageRef.current = signMessage; }, [signMessage]);

  // Stable session id for THIS hook mount (one per client tab/login). Lazily
  // initialized once; never changes for the life of the mount.
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) sessionIdRef.current = makeSessionId();

  // Mutable state shared between closures — no re-renders needed
  const wsRef             = useRef<WebSocket | null>(null);
  const remotePlayers     = useRef<Map<string, RemotePlayer>>(new Map());
  const sendIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef        = useRef<number>(BACKOFF_INITIAL);
  const unmountedRef      = useRef(false);

  const serverUrlRef = useRef(serverUrl);
  useEffect(() => { serverUrlRef.current = serverUrl; }, [serverUrl]);

  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const playerAddressRef = useRef(playerAddress);
  useEffect(() => { playerAddressRef.current = playerAddress; }, [playerAddress]);

  const displayNameRef = useRef(displayName);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);

  // Local SSU/tribe context — used BOTH to broadcast this player's identity AND to
  // classify incoming peers into own (yellow) / tribe (blue) / other (red), the same
  // tier system as cross-SSU shops (see shopTier.ts).
  const localCtx = useCurrentSsuContext();
  const tierCtxRef = useRef<ShopTierContext>({
    currentSsuId: localCtx.ssuId, currentBazaarType: localCtx.bazaarType, currentTribeId: localCtx.tribeId,
  });
  const selfTribeRef = useRef<{ ssuId: string; bazaarType: number; tribeId: number }>({
    ssuId: localCtx.ssuId, bazaarType: bazaarTypeToNum(localCtx.bazaarType), tribeId: localCtx.tribeId ?? 0,
  });
  useEffect(() => {
    tierCtxRef.current = { currentSsuId: localCtx.ssuId, currentBazaarType: localCtx.bazaarType, currentTribeId: localCtx.tribeId };
    selfTribeRef.current = { ssuId: localCtx.ssuId, bazaarType: bazaarTypeToNum(localCtx.bazaarType), tribeId: localCtx.tribeId ?? 0 };
  }, [localCtx.ssuId, localCtx.bazaarType, localCtx.tribeId]);

  const flushToGodot = useCallback(() => {
    const players = Array.from(remotePlayers.current.values()).map(p => {
      const tier = classifyShopTier({ ssuId: p.ssuId, bazaarType: p.bazaarType, tribeId: p.tribeId }, tierCtxRef.current);
      return {
        address:     p.address,
        displayName: p.displayName,
        x:           p.x,
        y:           p.y,
        direction:   p.direction,
        chat:        p.chat,
        skin:        p.skin,
        tier,                       // "own" | "tribe" | "other"
        color:       TIER_COLOR[tier],
      };
    });
    sendToGodot("PLAYER_POSITIONS", { players });
    setPlayerCount(players.length);
  }, [sendToGodot]);

  const closeSocket = useCallback((ws: WebSocket) => {
    if (ws.readyState === WebSocket.OPEN && playerAddressRef.current) {
      const leave: OutboundLeaveMsg = { type: "leave", address: playerAddressRef.current, sessionId: sessionIdRef.current ?? "" };
      ws.send(JSON.stringify(leave));
    }
    ws.onopen    = null;
    ws.onmessage = null;
    ws.onerror   = null;
    ws.onclose   = null;
    if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
      ws.close(1000);
    }
  }, []);

  const stopSendLoop = useCallback(() => {
    if (sendIntervalRef.current !== null) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
  }, []);

  const cancelReconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- recursive via onclose timer
  const connect = useCallback(() => {
    // On-chain URL is authoritative; localStorage value is a fallback for dev/local testing
    // when the on-chain field has not yet been configured.
    const onChainUrl = serverUrlRef.current;
    const url = normalizeRelayUrl(onChainUrl || localStorage.getItem(LS_RELAY_KEY) || "");
    if (!url || !enabledRef.current || !playerAddressRef.current || unmountedRef.current) {
      return;
    }

    // After normalization `url` always starts with ws://|wss:// — this is a defensive backstop.
    if (!/^wss?:\/\//i.test(url)) {
      console.warn("[useMultiplayerRelay] Invalid URL (must start with ws:// or wss://):", url);
      return;
    }

    if (wsRef.current) {
      closeSocket(wsRef.current);
      wsRef.current = null;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.warn("[useMultiplayerRelay] WebSocket constructor failed:", e);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) { closeSocket(ws); return; }
      backoffRef.current = BACKOFF_INITIAL;
      setConnected(true);

      // AUD-UX-02 (B5): the position send loop is extracted so it can be deferred
      // until the identity handshake completes (auth_ok). startSendLoop is
      // idempotent (stopSendLoop first) so a late auth_ok safely (re)starts it.
      const startSendLoop = () => {
        stopSendLoop();
        sendIntervalRef.current = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const addr = playerAddressRef.current;
          if (!addr) return;
          const pos = playerPositionRef.current;
          if (!pos) return;

          const self = selfTribeRef.current;
          const msg: OutboundMsg = {
            type:        "position",
            address:     addr,
            sessionId:   sessionIdRef.current ?? "",
            displayName: displayNameRef.current,
            x:           pos.x,
            y:           pos.y,
            direction:   pos.direction,
            chat:        chatTextRef?.current ?? "",
            skin:        skinRef?.current ?? "",
            msg:         msgRef?.current ?? "",
            msgSeq:      msgSeqRef?.current ?? 0,
            ssuId:       self.ssuId,
            bazaarType:  self.bazaarType,
            tribeId:     self.tribeId,
          };
          ws.send(JSON.stringify(msg));
        }, SEND_INTERVAL_MS);
      };
      (ws as AuthAwareSocket)._startSendLoop = startSendLoop;

      if (signMessageRef.current) {
        // Auth-capable: request a nonce; the send loop waits for auth_ok.
        ws.send(JSON.stringify({ type: "auth_request" }));
      } else {
        // Legacy mode (no signing surface / no wallet): start immediately.
        startSendLoop();
      }
    };

    ws.onmessage = async (event: MessageEvent<string>) => {
      if (unmountedRef.current) return;

      let msg: InboundMsg;
      try {
        msg = JSON.parse(event.data) as InboundMsg;
      } catch {
        return;
      }

      if (!msg?.type) return;

      switch (msg.type) {
        // ── AUD-UX-02 (B5) identity-binding handshake ─────────────────────────
        case "auth_challenge": {
          const nonce = msg.nonce;
          const sign  = signMessageRef.current;
          if (typeof nonce !== "string" || !sign) return;
          try {
            const { signature } = await sign(nonce);
            if (ws.readyState !== WebSocket.OPEN) return;
            ws.send(JSON.stringify({
              type:      "auth_response",
              nonce,
              address:   playerAddressRef.current,
              signature,
              // No publicKey field (CC-B5-04) — the server recovers it from the sig.
            }));
          } catch (e) {
            // User cancelled / wallet has no signing feature → degrade to guest.
            console.warn("[useMultiplayerRelay] signMessage failed — proceeding as guest:", e);
            (ws as AuthAwareSocket)._startSendLoop?.();
          }
          break;
        }
        case "auth_ok": {
          // Server confirmed our identity — start the deferred send loop.
          (ws as AuthAwareSocket)._startSendLoop?.();
          break;
        }
        case "auth_fail": {
          console.warn("[useMultiplayerRelay] auth_fail:", msg.reason ?? "unknown");
          // Start anyway: in legacy-tolerance mode positions still flow (skin
          // stripped); in strict mode they are dropped server-side — acceptable
          // degradation vs. leaving the client silent.
          (ws as AuthAwareSocket)._startSendLoop?.();
          break;
        }

        case "position": {
          if (msg.address === playerAddressRef.current) return;
          // Legacy peers omit sessionId — fall back to the address so each one is a
          // single stable session (one avatar, no spurious hand-offs).
          const sid = (typeof msg.sessionId === "string" && msg.sessionId) ? msg.sessionId : msg.address;
          const now = Date.now();
          const prev = remotePlayers.current.get(msg.address);

          // Double-login arbitration: one avatar per address. While the owning
          // session is still active, IGNORE updates from a rival session (same
          // wallet, second client) — this is what stops the rubber-banding. A rival
          // only takes over once the owner has been silent > OWNER_HANDOFF_MS.
          if (prev && prev.ownerSessionId !== sid && (now - prev.lastUpdateMs) <= OWNER_HANDOFF_MS) {
            break;
          }
          const isOwnerContinuation = !!prev && prev.ownerSessionId === sid;

          const incomingSeq = typeof msg.msgSeq === "number" ? msg.msgSeq : 0;
          const committed = typeof msg.msg === "string" ? msg.msg : "";
          // Append a committed message only when it's a NEW seq from the SAME owning
          // session. First sighting and session hand-offs reset the baseline silently
          // (their seq counters are unrelated), so we never replay or double-append.
          if (isOwnerContinuation && incomingSeq > prev!.msgSeq && committed) {
            onRemoteMessageRef.current?.(msg.displayName, committed);
          }
          remotePlayers.current.set(msg.address, {
            address:        msg.address,
            displayName:    msg.displayName,
            x:              msg.x,
            y:              msg.y,
            direction:      msg.direction,
            chat:           typeof msg.chat === "string" ? msg.chat : "",
            skin:           typeof msg.skin === "string" ? msg.skin : "",
            msgSeq:         incomingSeq,
            ssuId:          typeof msg.ssuId === "string" ? msg.ssuId : "",
            bazaarType:     typeof msg.bazaarType === "number" ? msg.bazaarType : 0,
            tribeId:        typeof msg.tribeId === "number" ? msg.tribeId : 0,
            ownerSessionId: sid,
            lastUpdateMs:   now,
          });
          flushToGodot();
          break;
        }
        case "leave": {
          // Only the OWNING session's leave clears the avatar. A rival session
          // (the player's second client) leaving must NOT remove the avatar the
          // active session is still driving.
          const sid = (typeof msg.sessionId === "string" && msg.sessionId) ? msg.sessionId : msg.address;
          const prev = remotePlayers.current.get(msg.address);
          if (prev && prev.ownerSessionId === sid) {
            remotePlayers.current.delete(msg.address);
            flushToGodot();
          }
          break;
        }
        default:
          break;
      }
    };

    ws.onerror = () => {
      // The "close" event always fires after "error"; reconnect logic lives in onclose.
    };

    ws.onclose = () => {
      stopSendLoop();
      setConnected(false);

      if (remotePlayers.current.size > 0) {
        remotePlayers.current.clear();
        flushToGodot();
      }

      if (unmountedRef.current || !enabledRef.current) return;

      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, BACKOFF_MAX);

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (!unmountedRef.current && enabledRef.current) {
          connect();
        }
      }, delay);
    };
  }, [closeSocket, stopSendLoop, flushToGodot, playerPositionRef]);

  useEffect(() => {
    unmountedRef.current = false;

    const effectiveUrl = normalizeRelayUrl(serverUrl || localStorage.getItem(LS_RELAY_KEY) || "");
    if (!enabled || !effectiveUrl || !playerAddress) {
      stopSendLoop();
      cancelReconnect();
      if (wsRef.current) {
        closeSocket(wsRef.current);
        wsRef.current = null;
      }
      if (remotePlayers.current.size > 0) {
        remotePlayers.current.clear();
        sendToGodot("PLAYER_POSITIONS", { players: [] });
      }
      setConnected(false);
      setPlayerCount(0);
      return;
    }

    connect();

    return () => {
      unmountedRef.current = true;
      stopSendLoop();
      cancelReconnect();
      if (wsRef.current) {
        closeSocket(wsRef.current);
        wsRef.current = null;
      }
      remotePlayers.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, serverUrl, playerAddress, connect, closeSocket, stopSendLoop, cancelReconnect]);

  return { connected, playerCount };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
