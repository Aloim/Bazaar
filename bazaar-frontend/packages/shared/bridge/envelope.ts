// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/bridge/envelope — Bridge Protocol v1.0.0 envelope types.
 *
 * Defines the invariant three-field wire wrapper `{type, version, payload}`,
 * the discriminator union types for every cataloged command and event, all
 * payload interfaces, and the base `isEnvelope` type guard.
 *
 * Hand-rolled validators — no zod dependency.
 * Reference: Documentation/Knowledge/Godot-Bridge-Protocol.md §2, §7, §8, §9
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

// ── Protocol Version ─────────────────────────────────────────────────────────

/**
 * Canonical semver string for Bridge Protocol v1.
 * Must be updated in lockstep with bazaar-godot/scripts/bridge/envelope.gd
 * on every MAJOR bump per Godot-Bridge-Protocol.md §3.
 */
export const PROTOCOL_VERSION = "1.0.0" as const;

// ── Discriminator Unions ──────────────────────────────────────────────────────

/** Every legal command type (React → Godot direction). Lowercase snake_case. */
export type CommandType =
  | "init"
  | "inventory_updated"
  | "shops_updated"
  | "balance_updated"
  | "wallet_connected"
  | "wallet_disconnected"
  | "set_movement"
  | "set_skin"
  // Reserved — receiver exists in Godot bridge.gd; no React sender in v1.0.0
  | "transaction_result"
  | "trade_proposals_updated"
  | "player_banned"
  | "player_positions"
  | "external_input"
  | "set_guestbook_hover"
  | "set_beacon_hover"
  /** @deprecated v1.0.0 — superseded by set_movement; removal at v2.0.0 */
  | "inject_key";

/** Every legal event type (Godot → React direction). Lowercase snake_case. */
export type EventType =
  | "protocol_handshake_ack"
  | "shop_clicked"
  | "shop_placement_request"
  | "player_moved"
  | "open_panel"
  | "shop_interaction"
  | "shop_screen_rects"
  | "open_finance_news";

// ── Generic Envelope ──────────────────────────────────────────────────────────

/**
 * Invariant three-field wire wrapper for all bridge messages.
 * Exactly three top-level keys: type, version, payload. No extras.
 * `payload` is always a JSON object — never array, never primitive.
 * Reference: Godot-Bridge-Protocol.md §2.1
 */
export interface Envelope<
  TType extends string = string,
  TPayload = Record<string, unknown>,
> {
  /** Lowercase snake_case discriminator. */
  type: TType;
  /** Semver string of the sender; receiver compares MAJOR only. */
  version: string;
  /** Always present (use {} for empty). Never undefined. Never spread at top level. */
  payload: TPayload;
}

// ── Base Guard ────────────────────────────────────────────────────────────────

/**
 * Runtime type guard: checks the invariant three-field shape.
 * Does NOT validate type/version semantics — callers do that in per-type guards.
 */
export function isEnvelope(v: unknown): v is Envelope {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["type"] === "string" &&
    typeof o["version"] === "string" &&
    typeof o["payload"] === "object" &&
    o["payload"] !== null &&
    !Array.isArray(o["payload"])
  );
}

// ── Command Payload Types ─────────────────────────────────────────────────────

export type BazaarType = "notribe" | "easy" | "advanced";

/**
 * All 9 role booleans for the init envelope.
 * Follows Constitution Article XII.2 4-tier + XII.5 role naming convention.
 * isSSUSuperAdmin is stub-false until FP1-23 wires useSSUCaps RPC.
 */
export interface InitRoles {
  // SSU capability tier (4-tier per Constitution XII.2)
  isSSUOwner: boolean;
  isSSUSuperAdmin: boolean;
  isSSUAdmin: boolean;
  isSSUMod: boolean;
  // Tribe capability tier (4-tier per Constitution XII.2)
  isTribeLeader: boolean;
  isTribeSuperAdmin: boolean;
  isTribeAdmin: boolean;
  isTribeMod: boolean;
  // Membership flag — not a capability
  isTribeMember: boolean;
}

/** Payload for the `init` command. Reference: Godot-Bridge-Protocol.md §7 */
export interface InitPayload {
  bazaarType: BazaarType;
  ssuId: string;                  // 0x-hex Sui address
  tribeId: string | null;         // u64-as-string; null when notribe
  walletAddress: string | null;   // null when wallet not connected
  godotUrl: string;               // AP2-E forward-looking; v1 default: origin+/godot/
  protocolVersion: string;        // echoes envelope.version
  roles: InitRoles;
  uiLocale: string;               // BCP-47; v1 ships "en"
  marketRole: string;             // consumed by game_manager.gd:101-103 (OQ-1 kept)
  isBanned: boolean;              // moderator ban flag (OQ-1 kept)
}

export interface InventoryItem {
  typeId: number;
  quantity: number;
  volume: number;        // float — do NOT cast on Godot side
  lockedQuantity: number;
  lockingShopId: string;
}

export interface InventoryUpdatedPayload { items: InventoryItem[]; }

export interface ShopListing {
  itemTypeId: number;
  quantity: number;
  priceTribe: number;
}

export interface ShopPair {
  offeredTypeId: number;
  offeredQty: number;       // total offered stock (= offerPerLot × bundles remaining)
  requestedTypeId: number;
  requestedQty: number;     // requested items per bundle
  offerPerLot: number;      // offered items per bundle (1 = legacy per-single-offered)
}

export interface MapPosition { x: number; y: number; }

export interface Shop {
  id: string;
  owner: string;
  kind: "WTS" | "WTB" | "DE";
  title: string;
  ssuId: string;
  listings: ShopListing[];
  pairs: ShopPair[];
  escrowedTribe: number;
  createdAtMs: number;
  expiryMs: number;
  lastInteractionMs: number;
  mapPosition: MapPosition;
}

export interface ShopsUpdatedPayload { shops: Shop[]; }
export interface BalanceUpdatedPayload { balance: number; }
export interface WalletConnectedPayload { address: string; }
export type WalletDisconnectedPayload = Record<string, never>;
export interface SetMovementPayload { ix: -1 | 0 | 1; iy: -1 | 0 | 1; }

/** Payload for the `set_skin` command (React → Godot): chosen avatar variant slug. */
export interface SetSkinPayload { skin: string; }

/** @deprecated v1.0.0 — superseded by set_movement; removal at v2.0.0 */
export interface InjectKeyPayload { keycode: number; pressed: boolean; }

// ── Event Payload Types ───────────────────────────────────────────────────────

export interface HandshakeAckPayload { version: string; }

export interface ShopClickedPayload { shopId: string; }

export interface ShopPlacementRequestPayload { x: number; y: number; }

export interface PlayerMovedPayload {
  x: number;
  y: number;
  direction: "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw" | "idle";
}

/** panel is an open string for forward-compatibility — React treats unknown values as no-op. */
export interface OpenPanelPayload { panel: string; }

export interface ShopInteractionPayload {
  shopId: string;
  action: string;   // known: "buy", "sell", "swap", "cancel"; open string
  index: number;
  quantity: number;
}

export interface BeaconScreenPos {
  bx: number; by: number;
  vpW: number; vpH: number;
  color?: string;
  scale?: number;
  rotation?: number;
  proximity?: boolean;
  rectW?: number;
  rectH?: number;
  /** On-screen height (Godot viewport px) of the in-world sprite at this anchor,
   *  projected so a React hit-area/label can match it exactly. Used by the
   *  Queen's Messenger NPC, whose visual is an in-Godot AnimatedSprite2D. */
  screenH?: number;
  /** On-screen WIDTH (Godot viewport px) of an in-world panel at this anchor.
   *  Paired with screenH for beacons whose visual is an in-Godot HoloPanel. */
  screenW?: number;
  /** True when Godot renders an animated HoloPanel at this anchor (Issue 3).
   *  React then draws only an invisible click/hover hit-area (sized to
   *  screenW×screenH) instead of its own holographic button. */
  godotPanel?: boolean;
}

export interface ShopScreenRect {
  shopId: string;
  bx: number; by: number;
  vpW: number; vpH: number;
}

export interface ShopScreenRectsPayload {
  rects: ShopScreenRect[];
  beacon?: BeaconScreenPos | null;
  guestbook?: BeaconScreenPos | null;
  archive?: BeaconScreenPos | null;
  trade?: BeaconScreenPos | null;
  inventory?: BeaconScreenPos | null;
  exchange?: BeaconScreenPos | null;
  finance_news?: BeaconScreenPos | null;
  bazaar_news?: BeaconScreenPos | null;
  mission?: BeaconScreenPos | null;
  skin_picker?: BeaconScreenPos | null;
  /** In-world "A Queen's Messenger" NPC anchor (QueenMessengerBeacon). */
  queen_messenger?: BeaconScreenPos | null;
}

export interface OpenFinanceNewsPayload { tribe_idx: number; }

// ── Typed Envelope Aliases ────────────────────────────────────────────────────

export interface InitEnvelope extends Envelope<"init", InitPayload> {}
// ============================================================
// 500-line guard — do not add code below this line.
// ============================================================
