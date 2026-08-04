# ============================================================
# If this file reaches more than 500 lines, split it into
# 2 or more files to prevent bloating. Code belongs BELOW.
# ============================================================

# scripts/bridge/event_emitter.gd
extends Node
## Bridge: Event Emitter
##
## One emit_* method per Godot->React event in the v1 event catalog (spec §9).
## Each method builds a typed envelope and dispatches it to React via
## _send_to_react, which uses the load-bearing double-stringify eval pattern.
##
## DOUBLE-STRINGIFY PATTERN — LOAD-BEARING (GQ-2):
##   _send_to_react calls:
##     JavaScriptBridge.eval(
##       "window.dispatchEvent(new CustomEvent('godot-out',{detail:%s}))"
##       % JSON.stringify(envelope_string)
##     )
##   The outer JSON.stringify wraps the already-JSON-stringified envelope in
##   a quoted, escaped string literal. React then JSON.parses it from
##   (e as CustomEvent<string>).detail. Without the outer stringify, React
##   receives a raw JS object, not a string, breaking all event parsing.
##   DO NOT collapse these two stringify calls into one.
##
## INJECT PATTERN:
##   bridge.gd sets _bridge_node = self and _is_web = OS.has_feature("web")
##   via set_context() in _ready(). The emitter must not call autoloads
##   that are not yet guaranteed to be initialised.
##
## Article VII: All payloads are fixed-shape DTOs. No eval of user data,
##   no DOM injection, no network calls, no LocalStorage access.
## Constitution XIV.4: 500-line guard enforced.

# ---------------------------------------------------------------------------
# State injected by bridge.gd
# ---------------------------------------------------------------------------

var _is_web: bool = false

# ---------------------------------------------------------------------------
# Context injector
# ---------------------------------------------------------------------------

## Called by bridge.gd._ready().
func set_context(is_web: bool) -> void:
	_is_web = is_web

# ---------------------------------------------------------------------------
# Active event emitters (spec §9.1)
# ---------------------------------------------------------------------------

## protocol_handshake_ack — emitted once per boot via call_deferred (GQ-7).
## Payload echoes PROTOCOL_VERSION so React can compare MAJOR.
func emit_protocol_handshake_ack() -> void:
	_send_to_react("protocol_handshake_ack", {"version": Envelope.PROTOCOL_VERSION})

## shop_clicked — player clicked a shop node.
func emit_shop_clicked(shop_id: String) -> void:
	_send_to_react("shop_clicked", {"shopId": shop_id})

## shop_placement_request — player placed a new shop at world coordinates.
func emit_shop_placement_request(x: int, y: int) -> void:
	_send_to_react("shop_placement_request", {"x": x, "y": y})

## player_moved — player position update (high-frequency; React throttles).
func emit_player_moved(x: float, y: float, direction: String) -> void:
	_send_to_react("player_moved", {"x": x, "y": y, "direction": direction})

## open_panel — navigation hint to React to open a named panel.
## panel is an open string (forward-compat); known values: trade, inventory, admin, moderator.
func emit_open_panel(panel: String) -> void:
	_send_to_react("open_panel", {"panel": panel})

## shop_screen_rects — full replacement of shop screen-space rects + beacon dicts.
## All optional beacon dicts default to {} when not provided.
func emit_shop_screen_rects(
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
	_send_to_react("shop_screen_rects", {
		"rects": rects,
		"beacon": beacon,
		"guestbook": guestbook,
		"archive": archive,
		"trade": trade,
		"inventory": inventory,
		"exchange": exchange,
		"finance_news": finance_news,
		"bazaar_news": bazaar_news,
		"skin_picker": skin,
		"queen_messenger": queen_messenger,
	})

## shop_interaction — player performed an action on a shop (reserved; no GD call site yet).
func emit_shop_interaction(shop_id: String, action: String, index: int, quantity: int) -> void:
	_send_to_react("shop_interaction", {
		"shopId": shop_id,
		"action": action,
		"index": index,
		"quantity": quantity,
	})

## open_finance_news — reserved; no call site yet in v1.0.0.
func emit_open_finance_news(tribe_idx: int) -> void:
	_send_to_react("open_finance_news", {"tribe_idx": tribe_idx})

# ---------------------------------------------------------------------------
# Low-level send (internal)
# ---------------------------------------------------------------------------

## Serialize the envelope and dispatch a CustomEvent("godot-out") on window.
## On desktop/editor: prints to output — does not crash.
## See module header for double-stringify rationale.
func _send_to_react(env_type: String, payload: Dictionary) -> void:
	var envelope_str: String = Envelope.build_envelope(env_type, payload)
	if not _is_web:
		print("[Bridge] SEND %s -> %s" % [env_type, envelope_str])
		return
	JavaScriptBridge.eval(
		"window.dispatchEvent(new CustomEvent('godot-out',{detail:%s}))" \
		% JSON.stringify(envelope_str)
	)

# ---------------------------------------------------------------------------
# 500-line guard (Constitution Article XIV.4)
# ---------------------------------------------------------------------------
