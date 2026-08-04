# ============================================================
# If this file reaches more than 500 lines, split it into
# 2 or more files to prevent bloating. Code belongs BELOW.
# ============================================================

# scripts/bridge/command_dispatcher.gd
extends Node
## Bridge: Command Dispatcher
##
## Receives a parsed envelope Dictionary from bridge.gd::_dispatch_raw and
## routes it to the correct EventBus signal by matching on envelope.type.
##
## RESPONSIBILITIES:
##   - Version MAJOR mismatch detection (warn + degrade, never halt) per spec §3.3.
##   - All int() casts mandated by spec §2.4 (GQ-1).
##   - set_movement clamp to {-1, 0, 1} via Bridge._set_web_movement (SQ-2).
##   - external_input permanent dual-parse shim (SQ-4 / spec §8.R5).
##   - inject_key deprecated receiver retained through v1.x (spec §5.1).
##   - Unknown type: silently dropped (Article VII / spec §2.3 forward-compat).
##   - Forbidden commands: silently dropped; see _FORBIDDEN_COMMANDS list.
##
## ARTICLE VII COMPLIANCE:
##   No eval, no HTTP, no DOM injection, no LocalStorage, no filesystem access,
##   no command-of-commands. Every branch handles a typed, narrowly-scoped payload.
##   Unknown types fall to the default branch and are silently dropped.
##
## INJECT PATTERN (SQ-2):
##   bridge.gd calls set_bridge(self) in its _ready(). The dispatcher holds a
##   weak reference (non-owning) via the typed variable _bridge. It calls
##   Bridge._set_web_movement(ix, iy) — the only mutation site for web_movement.
##
## Constitution XIV.4: 500-line guard enforced.

# ---------------------------------------------------------------------------
# Forbidden command list (Article VII)
# Any type matching these strings is silently dropped without logging,
# preventing information leakage about the block list itself.
# ---------------------------------------------------------------------------

const _FORBIDDEN_COMMANDS: Array[String] = [
	"eval_javascript", "eval_js", "run_script",
	"inject_html", "set_innerhtml",
	"fetch_arbitrary_url", "http_get", "http_post",
	"read_local_storage", "write_local_storage", "read_cookie",
	"read_file", "write_file",
	"dispatch_event", "dispatch_action",
	"import", "register_handler",
]

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

## Injected by bridge.gd._ready(). Typed as Node to avoid circular autoload dep.
var _bridge: Node = null

# ---------------------------------------------------------------------------
# Injector
# ---------------------------------------------------------------------------

## Called by bridge.gd._ready(): command_dispatcher.set_bridge(self).
## Provides access to Bridge._set_web_movement without a global autoload ref.
func set_bridge(bridge_node: Node) -> void:
	_bridge = bridge_node

# ---------------------------------------------------------------------------
# Main dispatch entry point
# ---------------------------------------------------------------------------

## Receives the parsed envelope dict from envelope.gd::parse_envelope.
## Empty dict (parse failure) is silently dropped.
func dispatch(envelope: Dictionary) -> void:
	if envelope.is_empty():
		return
	# React emits envelope.type as SCREAMING_SNAKE_CASE (INIT_STATE, SHOPS_UPDATED, …);
	# this dispatcher's case arms are lower_snake_case. Normalize once here so every
	# inbound command routes correctly. Without this, every envelope falls through to
	# the `_:` default branch and is silently dropped — the bug that made shops,
	# wallet, balance, inventory, and SET_MOVEMENT all no-op on the Godot side.
	var env_type: String = String(envelope.get("type", "")).to_lower()
	# Name alias: React's INIT_STATE → dispatcher's existing "init" case.
	if env_type == "init_state":
		env_type = "init"
	var env_version: String = envelope.get("version", "0.x")
	var payload: Dictionary = envelope.get("payload", {})

	# Silent drop for Article VII forbidden commands
	if env_type in _FORBIDDEN_COMMANDS:
		return

	# MAJOR version mismatch: warn + degrade (spec §3.3)
	_check_version(env_version)

	match env_type:
		# ---- Active commands ----
		"init":
			EventBus.init_state_received.emit(payload)
		"inventory_updated":
			EventBus.inventory_updated.emit(payload.get("items", []))
		"shops_updated":
			EventBus.shops_updated.emit(payload.get("shops", []))
		"balance_updated":
			var raw_balance: Variant = payload.get("balance", 0)
			EventBus.balance_updated.emit(int(raw_balance))
		"wallet_connected":
			EventBus.wallet_connected.emit(payload)
		"wallet_disconnected":
			EventBus.wallet_disconnected.emit()
		"set_movement":
			_handle_set_movement(payload)
		# ---- Reserved commands (receiver branches per spec §8.2) ----
		"transaction_result":
			EventBus.transaction_result.emit(payload)
		"trade_proposals_updated":
			EventBus.trade_proposals_updated.emit(payload.get("proposals", []))
		"player_banned":
			EventBus.player_banned.emit(payload)
		"player_positions":
			EventBus.player_positions_updated.emit(payload.get("players", []))
		"set_guestbook_hover":
			EventBus.guestbook_hover_changed.emit(bool(payload.get("hovered", false)))
		"set_beacon_hover":
			EventBus.beacon_hover_changed.emit(str(payload.get("beacon", "")), bool(payload.get("hovered", false)))
		"local_chat":
			EventBus.local_chat_updated.emit(str(payload.get("text", "")), str(payload.get("name", "")))
		"set_skin":
			EventBus.local_skin_changed.emit(str(payload.get("skin", "")))
		"ui_scale":
			# React HUD UI-scale → scale in-world chat bubbles. Cache + broadcast.
			var ui_scale_val: float = float(payload.get("scale", 1.0))
			if ui_scale_val <= 0.0:
				ui_scale_val = 1.0
			EventBus.current_ui_scale = ui_scale_val
			EventBus.ui_scale_changed.emit(ui_scale_val)
		# ---- Permanent dual-parse shim (SQ-4 / spec §8.R5) ----
		"external_input":
			_handle_external_input(envelope, payload)
		# ---- Deprecated (inject_key) — retained through v1.x (spec §5.1) ----
		"inject_key":
			## @deprecated 1.0.0 — removed at 2.0.0. Superseded by set_movement.
			_handle_inject_key(payload)
		# ---- Unknown: silently drop (forward-compatibility, spec §2.3) ----
		_:
			pass

# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

func _handle_set_movement(payload: Dictionary) -> void:
	# GQ-1: int() cast; SQ-2: clamp via setter; PREP-2: read from payload not parsed
	var raw_ix: Variant = payload.get("ix", 0)
	var raw_iy: Variant = payload.get("iy", 0)
	var ix: int = int(raw_ix)
	var iy: int = int(raw_iy)
	if _bridge == null:
		push_warning("[CommandDispatcher] Bridge ref not set; set_movement dropped.")
		return
	_bridge._set_web_movement(ix, iy)

func _handle_external_input(envelope: Dictionary, payload: Dictionary) -> void:
	# PERMANENT dual-parse shim (SQ-4 / spec §8.R5):
	# Try nested payload first (v1 conformant). Fall back to top-level (EVE outer client).
	# The EVE Frontier outer client is outside our control; both paths are permanent.
	var code_val: Variant = payload.get("code", null)
	var pressed_val: Variant = payload.get("pressed", null)
	if code_val == null:
		# Fall back to top-level (outer EVE client legacy format)
		code_val = envelope.get("code", "")
	if pressed_val == null:
		pressed_val = envelope.get("pressed", false)
	var input_payload: Dictionary = {
		"code": str(code_val),
		"pressed": bool(pressed_val),
	}
	EventBus.external_input_received.emit(input_payload)

func _handle_inject_key(payload: Dictionary) -> void:
	# @deprecated 1.0.0 — PREP-2: read from payload not parsed (v1 normalization)
	var kc: int = int(payload.get("keycode", 0))
	var pr: bool = bool(payload.get("pressed", false))
	var ev := InputEventKey.new()
	ev.physical_keycode = kc as Key
	ev.keycode = kc as Key
	ev.pressed = pr
	ev.echo = false
	Input.parse_input_event(ev)

# ---------------------------------------------------------------------------
# Version check
# ---------------------------------------------------------------------------

func _check_version(env_version: String) -> void:
	# Extract MAJOR component (first segment before ".").
	# Spec §3.3: MAJOR mismatch → warn + degrade, never halt.
	var own_major: String = _major_of(Envelope.PROTOCOL_VERSION if Engine.has_singleton("Envelope") else "1.0.0")
	var their_major: String = _major_of(env_version)
	if own_major != their_major:
		push_warning(
			"[Bridge] Protocol MAJOR mismatch: received version %s, own version %s. Degrading gracefully." \
			% [env_version, "1.0.0"]
		)

func _major_of(semver: String) -> String:
	var parts: PackedStringArray = semver.split(".")
	if parts.size() == 0:
		return "0"
	return parts[0]

# ---------------------------------------------------------------------------
# 500-line guard (Constitution Article XIV.4)
# ---------------------------------------------------------------------------
