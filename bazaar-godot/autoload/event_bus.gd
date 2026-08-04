# autoload/event_bus.gd
extends Node
## Autoload: EventBus
##
## Central signal hub for the Bazaar game.
## Bridge.gd dispatches incoming React messages as signals here.
## Game systems connect to these signals — never call each other directly.
##
## Signal naming mirrors the React message types where applicable.

# ---------------------------------------------------------------------------
# React -> Godot signals
# Each signal is emitted by Bridge._on_message_received when the
# corresponding JSON message type arrives from the React parent.
# ---------------------------------------------------------------------------

## Full initial world state. Payload keys: wallet, shops, roles, balance,
## marketRole, isBanned, tradeProposals.
signal init_state_received(payload: Dictionary)

## Full replacement shop list. Emitted with the Array of shop Dictionaries.
signal shops_updated(shops: Array)

## Wallet connected. Payload keys: address, roles, marketRole, isBanned.
signal wallet_connected(payload: Dictionary)

## Wallet disconnected. No payload.
signal wallet_disconnected()

## TribeCoin balance changed. Carries the new integer balance.
signal balance_updated(balance: int)

## Periodic broadcast of all remote player positions. Carries Array of
## PlayerPosition Dictionaries (keys: address, x, y, direction, displayName).
signal player_positions_updated(players: Array)

## Outcome of a blockchain transaction or system lifecycle event.
## Payload keys: action, success, message, shopId (opt), txDigest (opt).
signal transaction_result(result: Dictionary)

## Full replacement trade proposal list. Carries Array of TradeProposal Dicts.
signal trade_proposals_updated(proposals: Array)

## Player has been banned while in-game. Payload keys: message, expiryMs.
signal player_banned(payload: Dictionary)

## Forwarded keyboard input from the React host (postMessage EXTERNAL_INPUT).
## Emitted when the outer EVE Frontier client intercepts keys and the React layer
## relays them via postMessage instead.
## Payload keys: "code" (String, e.g. "KeyW"), "pressed" (bool).
signal external_input_received(payload: Dictionary)

## Inventory data updated. Carries Array of item Dictionaries
## (keys: typeId, quantity, volume, lockedQuantity, lockingShopId).
signal inventory_updated(items: Array)

## Local player's own in-progress proximity-chat text + speaker name (React
## LOCAL_CHAT message). Drives the chat bubble above the LOCAL avatar so the typist
## sees what others see, with their name repeated every 2nd line. Empty text hides
## it. Remote players' chat rides player_positions_updated.
signal local_chat_updated(text: String, name: String)

## React -> Godot: the local player picked a skin in the Skin Picker window (or it
## was auto-assigned, e.g. the owner-only red-tribal). Carries the variant slug;
## player.gd applies it and the relay broadcasts it so other players see the change.
signal local_skin_changed(slug: String)

## React HUD UI-scale changed (the bottom-left UI-scale buttons). Multiplies the
## chat-bubble size so in-world proximity chat scales with the user's UI-scale
## setting. `current_ui_scale` caches the latest value so avatars that spawn AFTER
## the last change (e.g. remote players joining) pick up the right size at _ready.
signal ui_scale_changed(scale: float)
var current_ui_scale: float = 1.0

# ---------------------------------------------------------------------------
# Internal Godot signals
# Used for decoupled communication between game systems — never sent to React.
# ---------------------------------------------------------------------------

## Emitted by ShopNode when the player clicks on it (before Bridge forwards it).
signal shop_node_clicked(shop_id: String)

## Emitted by ShopManager when placement mode is toggled on or off.
signal placement_mode_toggled(active: bool)

## Emitted by HUD when the player requests to open a specific panel.
signal open_panel_requested(panel: String)

## Emitted when React hover state changes on the guestbook beacon.
signal guestbook_hover_changed(is_hovered: bool)

## Emitted when React relays a service-beacon mouse hover (set_beacon_hover).
## beacon_name matches HoloPanel.beacon_name (e.g. "trade", "inventory",
## "bazaar_news", "skin"); each HoloPanel filters for its own name. Issue 3.
signal beacon_hover_changed(beacon_name: String, is_hovered: bool)
