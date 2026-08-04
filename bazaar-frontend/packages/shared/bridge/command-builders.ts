// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/bridge/command-builders — Typed command envelope factories.
 *
 * Each `buildXxx(...)` constructs a validated Envelope<CommandType, Payload>
 * ready for JSON.stringify and dispatch via CustomEvent("godot-in").
 *
 * Article VII conformance: no eval, no fetch, no DOM injection, no FS access,
 * no command-of-commands. All payloads are fixed-shape DTOs.
 *
 * Reference: Documentation/Knowledge/Godot-Bridge-Protocol.md §8
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { PROTOCOL_VERSION } from "./envelope";
import type {
  Envelope,
  InitPayload,
  InventoryItem,
  Shop,
  InjectKeyPayload,
  SetMovementPayload,
} from "./envelope";

// ── Internal helper ───────────────────────────────────────────────────────────

function makeEnvelope<TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
): Envelope<TType, TPayload> {
  return { type, version: PROTOCOL_VERSION, payload };
}

// ── Active command builders ───────────────────────────────────────────────────

/**
 * Build the `init` envelope — first message sent after protocol_handshake_ack.
 * Idempotent: re-sending overwrites GameManager state in Godot.
 *
 * godotUrl defaults to `${window.location.origin}/godot/` when not supplied.
 * This default will be replaced by the AP2-E 4-tier URL resolver (FP1-30).
 */
export function buildInit(
  payload: Omit<InitPayload, "protocolVersion" | "godotUrl"> & {
    godotUrl?: string;
  },
): Envelope<"init", InitPayload> {
  const godotUrl =
    payload.godotUrl ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/godot/`
      : "/godot/");
  return makeEnvelope("init", {
    ...payload,
    godotUrl,
    protocolVersion: PROTOCOL_VERSION,
  });
}

/**
 * Build the `inventory_updated` envelope.
 * Full replacement — not delta. Idempotent.
 */
export function buildInventoryUpdated(
  items: InventoryItem[],
): Envelope<"inventory_updated", { items: InventoryItem[] }> {
  return makeEnvelope("inventory_updated", { items });
}

/**
 * Build the `shops_updated` envelope.
 * Full replacement list. Idempotent.
 */
export function buildShopsUpdated(
  shops: Shop[],
): Envelope<"shops_updated", { shops: Shop[] }> {
  return makeEnvelope("shops_updated", { shops });
}

/**
 * Build the `balance_updated` envelope.
 * TribeCoin balance push. Idempotent (last-write-wins).
 * Note: Godot side casts this with int() — send integer values only.
 */
export function buildBalanceUpdated(
  balance: number,
): Envelope<"balance_updated", { balance: number }> {
  return makeEnvelope("balance_updated", { balance });
}

/**
 * Build the `wallet_connected` envelope.
 * Idempotent re-emit on each connect event.
 */
export function buildWalletConnected(
  address: string,
): Envelope<"wallet_connected", { address: string }> {
  return makeEnvelope("wallet_connected", { address });
}

/**
 * Build the `wallet_disconnected` envelope.
 * Empty payload. Idempotent.
 */
export function buildWalletDisconnected(): Envelope<
  "wallet_disconnected",
  Record<string, never>
> {
  return makeEnvelope("wallet_disconnected", {} as Record<string, never>);
}

/**
 * Build the `set_movement` envelope.
 * High-frequency (~60 Hz rAF); non-idempotent (snapshot of held keys).
 *
 * useInputCapture uses this builder and dispatches DIRECTLY via CustomEvent
 * without routing through the useGodotBridge send queue.
 * Per spec §8.1 bypass path: preserved — only the envelope shape changes.
 *
 * Godot side casts ix/iy with int() and clamps to {-1, 0, 1}.
 */
export function buildSetMovement(
  ix: SetMovementPayload["ix"],
  iy: SetMovementPayload["iy"],
): Envelope<"set_movement", SetMovementPayload> {
  return makeEnvelope("set_movement", { ix, iy });
}

// ── Deprecated command builder ────────────────────────────────────────────────

/**
 * Build the `inject_key` envelope.
 *
 * @deprecated v1.0.0 — superseded by set_movement; removal at v2.0.0.
 * Article VII: raw keycode injection is broad-surface.
 * Receiver branch persists through all of v1.x per semver policy.
 */
export function buildInjectKey(
  keycode: number,
  pressed: boolean,
): Envelope<"inject_key", InjectKeyPayload> {
  return makeEnvelope("inject_key", { keycode, pressed });
}
// ============================================================
// 500-line guard — do not add code below this line.
// ============================================================
