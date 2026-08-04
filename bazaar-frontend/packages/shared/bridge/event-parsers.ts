// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/bridge/event-parsers — Typed Godot event union parser.
 *
 * Central entry point: `parseGodotEvent(raw: string): GodotEvent | null`
 * Returns the discriminated union or null on any parse failure (silently dropped).
 * Null results preserve forward-compatibility: unknown event types from newer
 * Godot builds never throw, they are ignored.
 *
 * Per-type `isXxxEvent(env)` guards provide TypeScript narrowing.
 *
 * Hand-rolled discriminated narrowing — no zod dependency.
 * Reference: Documentation/Knowledge/Godot-Bridge-Protocol.md §9, §3.3
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { isEnvelope } from "./envelope";
import type {
  Envelope,
  HandshakeAckPayload,
  ShopClickedPayload,
  ShopPlacementRequestPayload,
  PlayerMovedPayload,
  OpenPanelPayload,
  ShopInteractionPayload,
  ShopScreenRectsPayload,
  OpenFinanceNewsPayload,
} from "./envelope";

// ── Typed Event Envelope Aliases ─────────────────────────────────────────────

export interface HandshakeAckEvent
  extends Envelope<"protocol_handshake_ack", HandshakeAckPayload> {}
export interface ShopClickedEvent
  extends Envelope<"shop_clicked", ShopClickedPayload> {}
export interface ShopPlacementRequestEvent
  extends Envelope<"shop_placement_request", ShopPlacementRequestPayload> {}
export interface PlayerMovedEvent
  extends Envelope<"player_moved", PlayerMovedPayload> {}
export interface OpenPanelEvent
  extends Envelope<"open_panel", OpenPanelPayload> {}
export interface ShopInteractionEvent
  extends Envelope<"shop_interaction", ShopInteractionPayload> {}
export interface ShopScreenRectsEvent
  extends Envelope<"shop_screen_rects", ShopScreenRectsPayload> {}
export interface OpenFinanceNewsEvent
  extends Envelope<"open_finance_news", OpenFinanceNewsPayload> {}

/** Discriminated union of all cataloged Godot → React events. */
export type GodotEvent =
  | HandshakeAckEvent
  | ShopClickedEvent
  | ShopPlacementRequestEvent
  | PlayerMovedEvent
  | OpenPanelEvent
  | ShopInteractionEvent
  | ShopScreenRectsEvent
  | OpenFinanceNewsEvent;

// ── Per-type Guards ───────────────────────────────────────────────────────────

function asPayload(env: Envelope): Record<string, unknown> {
  return env.payload as Record<string, unknown>;
}

export function isHandshakeAckEvent(env: unknown): env is HandshakeAckEvent {
  if (!isEnvelope(env)) return false;
  if (env.type !== "protocol_handshake_ack") return false;
  return typeof asPayload(env)["version"] === "string";
}

export function isShopClickedEvent(env: unknown): env is ShopClickedEvent {
  if (!isEnvelope(env)) return false;
  if (env.type !== "shop_clicked") return false;
  return typeof asPayload(env)["shopId"] === "string";
}

export function isShopPlacementRequestEvent(
  env: unknown,
): env is ShopPlacementRequestEvent {
  if (!isEnvelope(env)) return false;
  if (env.type !== "shop_placement_request") return false;
  const p = asPayload(env);
  return typeof p["x"] === "number" && typeof p["y"] === "number";
}

export function isPlayerMovedEvent(env: unknown): env is PlayerMovedEvent {
  if (!isEnvelope(env)) return false;
  if (env.type !== "player_moved") return false;
  const p = asPayload(env);
  return (
    typeof p["x"] === "number" &&
    typeof p["y"] === "number" &&
    typeof p["direction"] === "string"
  );
}

export function isOpenPanelEvent(env: unknown): env is OpenPanelEvent {
  if (!isEnvelope(env)) return false;
  if (env.type !== "open_panel") return false;
  return typeof asPayload(env)["panel"] === "string";
}

export function isShopInteractionEvent(
  env: unknown,
): env is ShopInteractionEvent {
  if (!isEnvelope(env)) return false;
  if (env.type !== "shop_interaction") return false;
  const p = asPayload(env);
  return (
    typeof p["shopId"] === "string" &&
    typeof p["action"] === "string" &&
    typeof p["index"] === "number" &&
    typeof p["quantity"] === "number"
  );
}

export function isShopScreenRectsEvent(
  env: unknown,
): env is ShopScreenRectsEvent {
  if (!isEnvelope(env)) return false;
  if (env.type !== "shop_screen_rects") return false;
  return Array.isArray(asPayload(env)["rects"]);
}

export function isOpenFinanceNewsEvent(
  env: unknown,
): env is OpenFinanceNewsEvent {
  if (!isEnvelope(env)) return false;
  if (env.type !== "open_finance_news") return false;
  return typeof asPayload(env)["tribe_idx"] === "number";
}

// ── Legacy READY tolerance ────────────────────────────────────────────────────

/**
 * Tolerates the legacy `READY` event name from pre-v1 Godot builds.
 * Deprecated at v1.0.0; removal at v2.0.0.
 * Logs once per session via sessionStorage flag to avoid log spam.
 * Returns a synthetic HandshakeAckEvent with implicit version "0.x".
 */
function tolerateLegacyReady(raw: unknown): HandshakeAckEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o["type"] !== "READY") return null;

  const flagKey = "__bazaar_bridge_ready_deprecation_warned__";
  if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(flagKey)) {
    sessionStorage.setItem(flagKey, "1");
    console.warn(
      "[Bridge] Received legacy READY event (deprecated v1.0.0 — removal v2.0.0). " +
        "Godot build does not implement protocol_handshake_ack. " +
        "Treating as handshake with implicit version 0.x.",
    );
  }

  return {
    type: "protocol_handshake_ack",
    version: "0.x",
    payload: { version: "0.x" },
  };
}

// ── MAJOR version mismatch guard ──────────────────────────────────────────────

function checkMajorVersion(env: Envelope): void {
  const senderMajor = parseInt(env.version.split(".")[0] ?? "0", 10);
  const ourMajor = 1; // PROTOCOL_VERSION major
  if (senderMajor !== ourMajor) {
    console.warn(
      `[Bridge] Protocol MAJOR mismatch: got ${env.version}, expected 1.x. ` +
        "Attempting fallback rendering.",
    );
    console.error(
      `[Bridge] MAJOR mismatch — sender=${env.version} receiver=1.x. ` +
        "Check that React and Godot are on the same protocol major version.",
    );
  }
}

// ── Central dispatcher ────────────────────────────────────────────────────────

/**
 * Parse a raw JSON string received from the `godot-out` CustomEvent.
 * Returns a narrowed GodotEvent or null.
 *
 * Null is returned (silently) for:
 * - Malformed JSON
 * - Missing envelope fields
 * - Unknown event type (forward-compatibility: newer Godot builds)
 * - Failed per-type payload validation
 *
 * The legacy READY event is tolerated with a once-per-session deprecation warning.
 */
export function parseGodotEvent(raw: string): GodotEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // Legacy READY tolerance path (before full envelope validation)
  const legacyAck = tolerateLegacyReady(parsed);
  if (legacyAck !== null) return legacyAck;

  if (!isEnvelope(parsed)) return null;

  checkMajorVersion(parsed);

  switch (parsed.type) {
    case "protocol_handshake_ack":
      return isHandshakeAckEvent(parsed) ? parsed : null;
    case "shop_clicked":
      return isShopClickedEvent(parsed) ? parsed : null;
    case "shop_placement_request":
      return isShopPlacementRequestEvent(parsed) ? parsed : null;
    case "player_moved":
      return isPlayerMovedEvent(parsed) ? parsed : null;
    case "open_panel":
      return isOpenPanelEvent(parsed) ? parsed : null;
    case "shop_interaction":
      return isShopInteractionEvent(parsed) ? parsed : null;
    case "shop_screen_rects":
      return isShopScreenRectsEvent(parsed) ? parsed : null;
    case "open_finance_news":
      return isOpenFinanceNewsEvent(parsed) ? parsed : null;
    default:
      // Unknown type — silent drop for forward-compatibility
      return null;
  }
}
// ============================================================
// 500-line guard — do not add code below this line.
// ============================================================
