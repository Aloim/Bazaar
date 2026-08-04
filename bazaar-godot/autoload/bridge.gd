# autoload/bridge.gd
extends Node
## Autoload: Bridge
##
## Handles all CustomEvent communication with the React host (canvas embed model).
## On HTML5 export: listens for CustomEvent("godot-in") on the shared window,
##   and dispatches CustomEvent("godot-out") back to React.
##   React and Godot share the same window — no iframe boundary, no postMessage.
## On desktop/editor: loads mock data after a short delay so the game is
##   testable without a React host.
##
## PUBLIC API — zero-break contract:
##   - All 9 notify_* methods preserved at identical signatures.
##   - var web_movement: Vector2 public property preserved.
##   - Bridge._set_web_movement(ix, iy) is the SOLE mutation site for web_movement
##     (called only by CommandDispatcher._handle_set_movement).
##
## INTERNAL ARCHITECTURE (v1):
##   - Inbound: _dispatch_raw -> envelope.gd::parse_envelope -> CommandDispatcher.dispatch
##   - Outbound: notify_* -> EventEmitter.emit_*
##   - Handshake: call_deferred("_emit_handshake_ack") from _ready() (GQ-7)
##   - SQ-2: CommandDispatcher injected with set_bridge(self) in _ready()
##   - SQ-4: external_input dual-parse lives in CommandDispatcher
##
## Constitution XIV.4: 500-line guard enforced.

# ---------------------------------------------------------------------------
# Nodes — set in _ready() from preloaded scripts
# ---------------------------------------------------------------------------

var _envelope: Node
var _dispatcher: Node
var _emitter: Node

# ---------------------------------------------------------------------------
# Private state
# ---------------------------------------------------------------------------

## Holds the JS callback object so it is not garbage collected.
var _listener_callback: JavaScriptObject

## True when running in HTML5 export, false on desktop/editor.
var _is_web: bool = false

# ---------------------------------------------------------------------------
# Public property
# ---------------------------------------------------------------------------

## Movement vector set by the React input overlay via set_movement command.
## player.gd reads this directly — bypasses Emscripten keyboard entirely.
## Public: read by player.gd. Mutated ONLY via _set_web_movement.
var web_movement: Vector2 = Vector2.ZERO

# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

func _ready() -> void:
	# Instantiate helper nodes (not autoloads — owned by Bridge)
	_envelope = preload("res://scripts/bridge/envelope.gd").new()
	_dispatcher = preload("res://scripts/bridge/command_dispatcher.gd").new()
	_emitter = preload("res://scripts/bridge/event_emitter.gd").new()
	add_child(_envelope)
	add_child(_dispatcher)
	add_child(_emitter)

	# Wire SQ-2: dispatcher needs the bridge reference for _set_web_movement
	_dispatcher.set_bridge(self)

	_is_web = OS.has_feature("web")
	_emitter.set_context(_is_web)

	if _is_web:
		_listener_callback = JavaScriptBridge.create_callback(_on_js_message_received)
		# Canvas embed: listen for CustomEvent("godot-in") on the shared window.
		JavaScriptBridge.get_interface("window").addEventListener("godot-in", _listener_callback)
		# GQ-7: defer handshake so React listener is attached before we emit.
		call_deferred("_emit_handshake_ack")
	else:
		# Desktop / editor: inject mock state so development does not require React.
		_load_mock_data.call_deferred()

# ---------------------------------------------------------------------------
# Handshake
# ---------------------------------------------------------------------------

## Emits protocol_handshake_ack on the next idle frame after _ready().
## Deferred via call_deferred in _ready() — mandatory per GQ-7.
func _emit_handshake_ack() -> void:
	_emitter.emit_protocol_handshake_ack()

# ---------------------------------------------------------------------------
# Inbound: JS -> GDScript
# ---------------------------------------------------------------------------

## Called by JavaScriptBridge when a "godot-in" CustomEvent fires in the browser.
## args[0] is the CustomEvent JS object.
func _on_js_message_received(args: Array) -> void:
	if args.is_empty():
		return
	var event: JavaScriptObject = args[0]
	var raw_data: Variant = event.detail
	if typeof(raw_data) != TYPE_STRING:
		push_warning("[Bridge] Received non-string CustomEvent detail, ignoring.")
		return
	_dispatch_raw(raw_data as String)

## Parse a raw JSON string and dispatch via CommandDispatcher.
## Also used by the desktop mock path.
func _dispatch_raw(raw: String) -> void:
	var envelope: Dictionary = _envelope.parse_envelope(raw)
	_dispatcher.dispatch(envelope)

# ---------------------------------------------------------------------------
# Public setter for web_movement (PREP-3 / SQ-2)
# ---------------------------------------------------------------------------

## Called ONLY by CommandDispatcher._handle_set_movement.
## Validates ix/iy are in {-1, 0, 1} and clamps; out-of-range logs warning + drops.
func _set_web_movement(ix: int, iy: int) -> void:
	if ix < -1 or ix > 1 or iy < -1 or iy > 1:
		push_warning(
			"[Bridge] set_movement out-of-range: ix=%d iy=%d — dropped." % [ix, iy]
		)
		return
	web_movement = Vector2(ix, iy)

# ---------------------------------------------------------------------------
# Public API — one method per Godot->React event type
# All signatures preserved unchanged (zero breaking change for consumers).
# ---------------------------------------------------------------------------

## Resend the handshake ack — exposed so callers can resend if needed.
func notify_ready() -> void:
	_emitter.emit_protocol_handshake_ack()

func notify_shop_clicked(shop_id: String) -> void:
	_emitter.emit_shop_clicked(shop_id)

func notify_shop_placement(x: int, y: int) -> void:
	_emitter.emit_shop_placement_request(x, y)

func notify_player_moved(x: float, y: float, direction: String) -> void:
	_emitter.emit_player_moved(x, y, direction)

func notify_open_panel(panel: String) -> void:
	_emitter.emit_open_panel(panel)

## Convenience wrapper — requests React to open the inventory panel.
func notify_open_inventory() -> void:
	_emitter.emit_open_panel("inventory")

func notify_shop_screen_rects(
	rects: Array,
	beacon: Dictionary = {},
	guestbook: Dictionary = {},
	archive: Dictionary = {},
	trade: Dictionary = {},
	inventory: Dictionary = {},
	exchange: Dictionary = {},
	finance_news: Dictionary = {},
	bazaar_news: Dictionary = {},
	skin: Dictionary = {},
	queen_messenger: Dictionary = {}
) -> void:
	_emitter.emit_shop_screen_rects(
		rects, beacon, guestbook, archive, trade,
		inventory,
		exchange, finance_news, bazaar_news, skin, queen_messenger
	)

func notify_shop_interaction(shop_id: String, action: String, index: int, quantity: int) -> void:
	_emitter.emit_shop_interaction(shop_id, action, index, quantity)

func notify_open_finance_news(tribe_idx: int) -> void:
	_emitter.emit_open_finance_news(tribe_idx)

# ---------------------------------------------------------------------------
# Desktop mock data
# ---------------------------------------------------------------------------

## Fires after a short delay so _ready() in scene nodes has run before signals.
## Mock uses v1 flat payload shape (walletAddress, ssuId) to validate PREP-4.
func _load_mock_data() -> void:
	await get_tree().create_timer(0.5).timeout

	# v1-shaped mock: flat walletAddress, ssuId (not nested wallet or currentSsuId)
	var mock_payload: Dictionary = {
		"walletAddress": "0xMOCKUSER000000000000000000000000",
		"ssuId": "0xSSU_A_MOCK_ADDRESS_0000000000000000",
		"bazaarType": "easy",
		"tribeId": null,
		"godotUrl": "http://localhost:5173/godot/",
		"protocolVersion": "1.0.0",
		"uiLocale": "en",
		"shops": [
			{
				"id": "mock_shop_wts_1",
				"owner": "0xMOCKUSER000000000000000000000000",
				"kind": "WTS",
				"title": "Weapons Emporium",
				"ssuId": "0xSSU_A_MOCK_ADDRESS_0000000000000000",
				"listings": [{"itemTypeId": 42, "quantity": 10, "priceTribe": 500}],
				"pairs": [],
				"escrowedTribe": 0,
				"createdAtMs": 0,
				"expiryMs": 0,
				"lastInteractionMs": 0,
				"mapPosition": {"x": 1500, "y": 800}
			},
			{
				"id": "mock_shop_wtb_1",
				"owner": "0xANOTHERPLAYER00000000000000000000",
				"kind": "WTB",
				"title": "Ore Buyer",
				"ssuId": "0xSSU_B_MOCK_ADDRESS_0000000000000000",
				"listings": [{"itemTypeId": 7, "quantity": 50, "priceTribe": 120}],
				"pairs": [],
				"escrowedTribe": 6000,
				"createdAtMs": 0,
				"expiryMs": 0,
				"lastInteractionMs": 0,
				"mapPosition": {"x": 2200, "y": 1100}
			},
			{
				"id": "mock_shop_de_1",
				"owner": "0xTHIRDPLAYER000000000000000000000",
				"kind": "DE",
				"title": "Swap Corner",
				"ssuId": "0xSSU_A_MOCK_ADDRESS_0000000000000000",
				"listings": [],
				"pairs": [{"offeredTypeId": 10, "offeredQty": 2, "requestedTypeId": 5, "requestedQty": 3}],
				"escrowedTribe": 0,
				"createdAtMs": 0,
				"expiryMs": 0,
				"lastInteractionMs": 0,
				"mapPosition": {"x": 900, "y": 1400}
			}
		],
		"roles": {
			"isSSUOwner": false,
			"isSSUSuperAdmin": false,
			"isSSUAdmin": true,
			"isSSUMod": false,
			"isTribeLeader": false,
			"isTribeSuperAdmin": false,
			"isTribeAdmin": false,
			"isTribeMod": false,
			"isTribeMember": true
		},
		"balance": 15000,
		"marketRole": "Officer",
		"isBanned": false,
		"tradeProposals": []
	}

	# Dispatch through the same EventBus path as real v1 init messages.
	EventBus.init_state_received.emit(mock_payload)

	# Inject mock inventory so the inventory panel has data on desktop.
	await get_tree().create_timer(0.1).timeout
	var mock_inventory: Array = [
		{"typeId": 42, "quantity": 5, "volume": 0.5, "lockedQuantity": 0, "lockingShopId": ""},
		{"typeId": 7, "quantity": 200, "volume": 0.1, "lockedQuantity": 50, "lockingShopId": "mock_shop_wtb_1"},
		{"typeId": 10, "quantity": 8, "volume": 2.0, "lockedQuantity": 2, "lockingShopId": "mock_shop_de_1"},
		{"typeId": 5, "quantity": 30, "volume": 0.25, "lockedQuantity": 0, "lockingShopId": ""}
	]
	EventBus.inventory_updated.emit(mock_inventory)

# ---------------------------------------------------------------------------
# 500-line guard (Constitution Article XIV.4)
# ---------------------------------------------------------------------------
