// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/bridge — Bridge Protocol v1.0.0 public surface.
 *
 * Re-exports the protocol version constant, all envelope types,
 * all command builder factories, and the event parser + per-type guards.
 *
 * Import directly: import { buildInit, parseGodotEvent } from "@bazaar/shared/bridge"
 * Or via package: import { buildInit } from "@bazaar/shared"
 *
 * Reference: Documentation/Knowledge/Godot-Bridge-Protocol.md
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

export {
  PROTOCOL_VERSION,
  isEnvelope,
} from "./envelope";

export type {
  Envelope,
  CommandType,
  EventType,
  BazaarType,
  InitRoles,
  InitPayload,
  InitEnvelope,
  InventoryItem,
  InventoryUpdatedPayload,
  Shop,
  ShopListing,
  ShopPair,
  MapPosition,
  ShopsUpdatedPayload,
  BalanceUpdatedPayload,
  WalletConnectedPayload,
  WalletDisconnectedPayload,
  SetMovementPayload,
  InjectKeyPayload,
  HandshakeAckPayload,
  ShopClickedPayload,
  ShopPlacementRequestPayload,
  PlayerMovedPayload,
  OpenPanelPayload,
  ShopInteractionPayload,
  BeaconScreenPos,
  ShopScreenRect,
  ShopScreenRectsPayload,
  OpenFinanceNewsPayload,
} from "./envelope";

export {
  buildInit,
  buildInventoryUpdated,
  buildShopsUpdated,
  buildBalanceUpdated,
  buildWalletConnected,
  buildWalletDisconnected,
  buildSetMovement,
  buildInjectKey,
} from "./command-builders";

export {
  parseGodotEvent,
  isHandshakeAckEvent,
  isShopClickedEvent,
  isShopPlacementRequestEvent,
  isPlayerMovedEvent,
  isOpenPanelEvent,
  isShopInteractionEvent,
  isShopScreenRectsEvent,
  isOpenFinanceNewsEvent,
} from "./event-parsers";

export type {
  GodotEvent,
  HandshakeAckEvent,
  ShopClickedEvent,
  ShopPlacementRequestEvent,
  PlayerMovedEvent,
  OpenPanelEvent,
  ShopInteractionEvent,
  ShopScreenRectsEvent,
  OpenFinanceNewsEvent,
} from "./event-parsers";
// ============================================================
// 500-line guard — do not add code below this line.
// ============================================================
