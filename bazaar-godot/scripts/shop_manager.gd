# scripts/shop_manager.gd
extends Node
## Manages all shop nodes in the world scene.
##
## Listens to EventBus.shops_updated and keeps the scene tree in sync:
## new shops are spawned, removed shops are freed, existing shops are
## refreshed with the latest data.
##
## Also owns placement mode: when active, mouse clicks on the world are
## intercepted and forwarded to React as SHOP_PLACEMENT_REQUEST (pixel coords).
##
## Attach to: a Node child of the World scene.
## Requires:
##   - @export var shop_scene: PackedScene   (the shop scene to instantiate)
##
## Editor group: add this node to the group "shop_manager" so hud.gd can
## locate it via get_first_node_in_group("shop_manager").

# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------

@export var shop_scene: PackedScene

## Native cell height (px) of the Queen's Messenger courier sprite-sheet
## (188x320; matches COURIER_ASPECT = 188/320 in QueenMessengerBeacon.tsx). The
## on-screen figure height = this × the Courier's world scale, projected to screen
## space each frame so the React hover hit-area + nameplate line up with the sprite.
const QUEEN_MESSENGER_CELL_H: float = 320.0

## Issue 3 — in-Godot animated holographic service-beacon panels. Spawned onto the
## service anchors below; React then renders only an invisible click/hover hit-area
## (gated on the `godotPanel` flag this manager adds to each beacon dict).
const HOLO_PANEL_SCENE: PackedScene = preload("res://scenes/holo_panel.tscn")
## Local Y offset so the panel hovers above the anchor (like the old React beacons).
const HOLO_PANEL_OFFSET_Y: float = -130.0

## --- BEACON PANEL ART -------------------------------------------------------
## Every beacon shows the default panel (holo_panel.tscn -> holo_panel_v1.tres)
## EXCEPT those listed here, which override it via HoloPanel.frames_override.
## In-game size is unchanged (override sheets share the 320x180 FRAME_SIZE).
##   Beacon names: trade, inventory, bazaar_news (BAZAAR INFO), skin, exchange,
##   finance_news, guestbook.
const PANEL_FRAME_OVERRIDES: Dictionary = {
	"bazaar_news": "res://sprite/ui/holo_panel_v4.tres",  # BAZAAR INFO -> V4
}

# ---------------------------------------------------------------------------
# Private state
# ---------------------------------------------------------------------------

## Map from shop_id (String) -> ShopNode instance.
var _shop_nodes: Dictionary = {}

var _placement_mode: bool = false

# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

func _ready() -> void:
	EventBus.shops_updated.connect(_on_shops_updated)
	EventBus.init_state_received.connect(_on_init_state_received)
	# Defer so the sibling beacon anchors are in the tree before we attach panels.
	call_deferred("_spawn_service_beacon_panels")

## Attach an animated HoloPanel to each service-beacon anchor (Issue 3). Idempotent.
func _spawn_service_beacon_panels() -> void:
	var specs: Array = [
		{"node": get_tree().get_first_node_in_group("trade_beacon"),       "title": "TRADE",     "name": "trade"},
		{"node": get_tree().get_first_node_in_group("inventory_beacon"),   "title": "INVENTORY", "name": "inventory"},
		{"node": get_tree().get_first_node_in_group("bazaar_news_beacon"), "title": "BAZAAR\nINFO", "name": "bazaar_news"},
		{"node": get_node_or_null("../SkinBeacon"),                        "title": "SKINS",     "name": "skin"},
		{"node": get_tree().get_first_node_in_group("exchange_beacon"),    "title": "EXCHANGE",  "name": "exchange", "advanced": true},
		{"node": get_tree().get_first_node_in_group("finance_news_beacon"),"title": "FINANCE\nNEWS", "name": "finance_news", "advanced": true},
		{"node": get_tree().get_first_node_in_group("guestbook_beacon"),   "title": "GUESTBOOK", "name": "guestbook"},
	]
	for spec: Dictionary in specs:
		var anchor: Node2D = spec["node"] as Node2D
		if anchor == null or anchor.has_node("HoloPanel"):
			continue
		var panel: Node2D = HOLO_PANEL_SCENE.instantiate() as Node2D
		panel.name = "HoloPanel"
		panel.set("beacon_title", spec["title"])
		panel.set("beacon_name", spec["name"])
		if spec.get("advanced", false):
			panel.set("advanced_only", true)
		# Beacons listed in PANEL_FRAME_OVERRIDES use a different panel sheet;
		# everything else keeps the scene default (V1).
		if PANEL_FRAME_OVERRIDES.has(spec["name"]):
			var frames_res: SpriteFrames = load(PANEL_FRAME_OVERRIDES[spec["name"]]) as SpriteFrames
			if frames_res != null:
				panel.set("frames_override", frames_res)
		var pr: Variant = anchor.get("proximity_radius")
		if pr is float and pr > 0.0:
			panel.set("proximity_radius", pr)
		panel.position = Vector2(0.0, HOLO_PANEL_OFFSET_Y)
		anchor.add_child(panel)
		anchor.add_to_group("godot_panel_beacon")

func _process(_delta: float) -> void:
	_send_shop_screen_rects()

func _unhandled_input(event: InputEvent) -> void:
	if not _placement_mode:
		return

	if event.is_action_pressed("cancel_placement"):
		set_placement_mode(false)
		get_viewport().set_input_as_handled()
		return

	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
			_handle_placement_click(mb.global_position)
			get_viewport().set_input_as_handled()

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

## Toggle shop placement mode on or off.
func set_placement_mode(active: bool) -> void:
	if _placement_mode == active:
		return
	_placement_mode = active
	EventBus.placement_mode_toggled.emit(active)

func toggle_placement_mode() -> void:
	set_placement_mode(not _placement_mode)

# ---------------------------------------------------------------------------
# Signal handlers
# ---------------------------------------------------------------------------

func _on_init_state_received(payload: Dictionary) -> void:
	var shops: Array = payload.get("shops", [])
	_sync_shops(shops)

func _on_shops_updated(shops: Array) -> void:
	_sync_shops(shops)
	# Exit placement mode automatically when a shop arrives.
	if _placement_mode:
		set_placement_mode(false)

# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

## Diff the incoming shop list against the current nodes.
func _sync_shops(shops: Array) -> void:
	if shop_scene == null:
		push_warning("ShopManager: shop_scene is not set.")
		return

	# Collect ids from the incoming list.
	var incoming_ids: Dictionary = {}
	for shop_data: Variant in shops:
		if not shop_data is Dictionary:
			continue
		var sid: String = str(shop_data.get("id", ""))
		if sid.is_empty():
			continue
		incoming_ids[sid] = shop_data

	# Remove nodes that no longer exist.
	for sid: String in _shop_nodes.keys():
		if not incoming_ids.has(sid):
			_shop_nodes[sid].queue_free()
			_shop_nodes.erase(sid)

	# Add or refresh.
	for sid: String in incoming_ids:
		var data: Dictionary = incoming_ids[sid]
		if _shop_nodes.has(sid):
			_shop_nodes[sid].setup(data)
		else:
			_spawn_shop(sid, data)

func _spawn_shop(sid: String, data: Dictionary) -> void:
	var node: Node2D = shop_scene.instantiate() as Node2D
	if node == null:
		push_error("ShopManager: shop_scene did not instantiate a Node2D.")
		return

	add_child(node)
	node.setup(data)
	var desired: Vector2 = _world_position_for_shop(data)
	node.global_position = desired
	_shop_nodes[sid] = node

## Resolve world-space position for a shop beacon.
## Priority 1: positionX / positionY from on-chain Shop struct (Phase 8).
## Priority 2: mapPosition dict (legacy field, pre-Phase-8 data).
## Fallback: (200, 200).
func _world_position_for_shop(data: Dictionary) -> Vector2:
	# Phase 8: on-chain position fields take priority.
	var px: Variant = data.get("positionX", null)
	var py: Variant = data.get("positionY", null)
	if px != null and py != null:
		return Vector2(float(px), float(py))
	# Legacy fallback: mapPosition dict.
	var map_pos: Variant = data.get("mapPosition", null)
	if map_pos != null and map_pos is Dictionary:
		return Vector2(float(map_pos.get("x", 200.0)), float(map_pos.get("y", 200.0)))
	return Vector2(200.0, 200.0)

## Convert a screen-space click to world pixel coordinates and notify React.
func _handle_placement_click(screen_pos: Vector2) -> void:
	var canvas_xform: Transform2D = get_viewport().get_canvas_transform()
	var world_pos: Vector2 = canvas_xform.affine_inverse() * screen_pos
	Bridge.notify_shop_placement(int(world_pos.x), int(world_pos.y))

## Project each shop's title panel from world space to viewport (canvas) space
## using get_canvas_transform(), which includes camera position, smoothing, zoom,
## AND stretch mode scaling. Projects two corners so all scaling is automatic.
## Sends SHOP_SCREEN_RECTS to React every frame so overlay divs track perfectly.
func _send_shop_screen_rects() -> void:
	var canvas_xform: Transform2D = get_viewport().get_canvas_transform()
	var vp_size: Vector2 = get_viewport().get_visible_rect().size
	var player_node: CharacterBody2D = get_tree().get_first_node_in_group("player") as CharacterBody2D
	var player_pos: Vector2 = player_node.global_position if player_node else Vector2(-99999.0, -99999.0)
	var rects: Array = []
	# Title panel: 420x90 world pixels, centered horizontally, at y=-415 above shop origin.
	for sid: String in _shop_nodes:
		var node: Node2D = _shop_nodes[sid]
		var origin: Vector2 = node.global_position
		# Project top-left and bottom-right corners of the panel through the full transform
		var tl_world: Vector2 = origin + Vector2(-210.0, -460.0)
		var br_world: Vector2 = origin + Vector2(210.0, -370.0)
		var tl_screen: Vector2 = canvas_xform * tl_world
		var br_screen: Vector2 = canvas_xform * br_world
		rects.append({
			"id": sid,
			"x": tl_screen.x,
			"y": tl_screen.y,
			"w": br_screen.x - tl_screen.x,
			"h": br_screen.y - tl_screen.y,
			"vpW": vp_size.x,
			"vpH": vp_size.y,
		})
	# Project beacons (announcement + guestbook) with configurable color/scale
	var beacon_data: Dictionary = {}
	var beacon_node: Node2D = get_tree().get_first_node_in_group("announcement_beacon") as Node2D
	if beacon_node:
		beacon_data = _build_beacon_dict(beacon_node, canvas_xform, vp_size, player_pos)
	var guestbook_data: Dictionary = {}
	var guestbook_node: Node2D = get_tree().get_first_node_in_group("guestbook_beacon") as Node2D
	if guestbook_node:
		guestbook_data = _build_beacon_dict(guestbook_node, canvas_xform, vp_size, player_pos)
	var archive_data: Dictionary = {}
	var archive_node: Node2D = get_tree().get_first_node_in_group("archive_beacon") as Node2D
	if archive_node:
		archive_data = _build_beacon_dict(archive_node, canvas_xform, vp_size, player_pos)
	var trade_data: Dictionary = {}
	var trade_node: Node2D = get_tree().get_first_node_in_group("trade_beacon") as Node2D
	if trade_node:
		trade_data = _build_beacon_dict(trade_node, canvas_xform, vp_size, player_pos)
	var inventory_data: Dictionary = {}
	var inventory_node: Node2D = get_tree().get_first_node_in_group("inventory_beacon") as Node2D
	if inventory_node:
		inventory_data = _build_beacon_dict(inventory_node, canvas_xform, vp_size, player_pos)
	var exchange_data: Dictionary = {}
	var exchange_node: Node2D = get_tree().get_first_node_in_group("exchange_beacon") as Node2D
	if exchange_node:
		exchange_data = _build_beacon_dict(exchange_node, canvas_xform, vp_size, player_pos)
	var finance_news_data: Dictionary = {}
	var finance_news_node: Node2D = get_tree().get_first_node_in_group("finance_news_beacon") as Node2D
	if finance_news_node:
		finance_news_data = _build_beacon_dict(finance_news_node, canvas_xform, vp_size, player_pos)
	var bazaar_news_data: Dictionary = {}
	var bazaar_news_node: Node2D = get_tree().get_first_node_in_group("bazaar_news_beacon") as Node2D
	if bazaar_news_node:
		bazaar_news_data = _build_beacon_dict(bazaar_news_node, canvas_xform, vp_size, player_pos)
	var skin_data: Dictionary = {}
	var skin_node: Node2D = get_node_or_null("../SkinBeacon") as Node2D
	if skin_node:
		skin_data = _build_beacon_dict(skin_node, canvas_xform, vp_size, player_pos)
	var queen_messenger_data: Dictionary = {}
	var queen_messenger_node: Node2D = get_node_or_null("../QueenMessengerBeacon") as Node2D
	if queen_messenger_node:
		queen_messenger_data = _build_beacon_dict(queen_messenger_node, canvas_xform, vp_size, player_pos)
		# Anchor the React hit-area + nameplate to the Courier SPRITE's actual feet
		# and head — NOT the beacon origin. The Courier child carries its own
		# position/scale (tweakable in world.tscn); with centered=false +
		# offset(-94,-320) on a 188x320 cell, the sprite's feet (bottom-centre) sit
		# exactly at the Courier node origin, so courier.global_position IS the feet.
		# Projecting the sprite directly keeps the label on him regardless of that
		# offset, the Courier's scale, or the window's stretch (fixes the drift after
		# the 720x720 base change). Falls back to the beacon-origin dict if absent.
		var courier: Node2D = queen_messenger_node.get_node_or_null("Courier") as Node2D
		if courier != null:
			var qm_feet: Vector2 = canvas_xform * courier.global_position
			var fig_h: float = QUEEN_MESSENGER_CELL_H * absf(courier.global_transform.get_scale().y)
			var qm_head: Vector2 = canvas_xform * (courier.global_position - Vector2(0.0, fig_h))
			queen_messenger_data["bx"] = qm_feet.x
			queen_messenger_data["by"] = qm_feet.y
			queen_messenger_data["screenH"] = qm_feet.y - qm_head.y
	Bridge.notify_shop_screen_rects(rects, beacon_data, guestbook_data, archive_data, trade_data, inventory_data, exchange_data, finance_news_data, bazaar_news_data, skin_data, queen_messenger_data)

## Build a beacon dictionary with screen position + optional color/scale from beacon_config.gd.
## player_pos is the world-space position of the local player, used for proximity detection.
func _build_beacon_dict(node: Node2D, canvas_xform: Transform2D, vp_size: Vector2, player_pos: Vector2) -> Dictionary:
	var screen: Vector2 = canvas_xform * node.global_position
	var data: Dictionary = {
		"bx": screen.x,
		"by": screen.y,
		"vpW": vp_size.x,
		"vpH": vp_size.y,
	}
	var col: Variant = node.get("beacon_color")
	if col is Color:
		data["color"] = (col as Color).to_html(false)
	var sc: Variant = node.get("beacon_scale")
	if sc is float:
		data["scale"] = sc
	var rot: Variant = node.get("beacon_rotation_deg")
	if rot is float:
		data["rotation"] = rot
	var prox_radius: Variant = node.get("proximity_radius")
	if prox_radius is float and prox_radius > 0.0:
		var dist: float = node.global_position.distance_to(player_pos)
		data["proximity"] = dist <= prox_radius
	var rw: Variant = node.get("rect_width")
	if rw is float and rw > 0.0:
		data["rectW"] = rw
	var rh: Variant = node.get("rect_height")
	if rh is float and rh > 0.0:
		data["rectH"] = rh
	# Issue 3 — if this anchor carries an in-Godot HoloPanel, report its projected
	# screen rect (center + size) + the godotPanel flag so React renders only an
	# invisible hit-area sized to the rendered panel instead of its own holo button.
	if node.is_in_group("godot_panel_beacon"):
		var panel: Node2D = node.get_node_or_null("HoloPanel") as Node2D
		# panel.visible gates Advanced-only beacons (e.g. Exchange) off in other worlds.
		if panel != null and panel.visible and panel.has_method("get_design_size"):
			var sz: Vector2 = panel.get_design_size()
			var center: Vector2 = panel.global_position
			var tl: Vector2 = canvas_xform * (center - sz * 0.5)
			var br: Vector2 = canvas_xform * (center + sz * 0.5)
			data["bx"] = (tl.x + br.x) * 0.5
			data["by"] = (tl.y + br.y) * 0.5
			data["screenW"] = br.x - tl.x
			data["screenH"] = br.y - tl.y
			data["godotPanel"] = true
	return data
