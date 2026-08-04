# scripts/player.gd
extends CharacterBody2D
## Local player controller.
##
## Handles WASD / arrow-key isometric movement using the confirmed
## 128x64 tile isometric basis vectors, and throttles PLAYER_MOVED
## messages to Bridge at approximately 10 messages per second.
##
## Attach to: CharacterBody2D (player scene root).
## Requires: CollisionShape2D child.
##
## Input actions required in project.godot:
##   move_right — D + Right arrow
##   move_left  — A + Left arrow
##   move_down  — S + Down arrow
##   move_up    — W + Up arrow

# ---------------------------------------------------------------------------
# Export tweakables
# ---------------------------------------------------------------------------

@export var move_speed: float = 200.0
@export var send_interval: float = 0.1   # seconds between PLAYER_MOVED sends
## Speed multiplier while the sprint key (Shift) is held and moving.
@export var sprint_multiplier: float = 1.7
## World-space offset from the body origin to the model's bottom-center (the
## "feet"). ONLY this point is tested against the walk mask, so the upper body
## may overhang blocked areas. It is added directly to global_position (WORLD
## space), so it must include the LocalPlayer instance scale (6x in world.tscn).
## Skins' in-frame feet (128x128 frame, feet ~y102, char-centre x64) resolve to
## player-LOCAL (0, 17) via the Sprite's position(0,30)/scale(0.5)/offset(-64,-128);
## x6 instance scale → world (0, 102). (Was (0,17): the missing x6 made the mask
## sample 85px above the real feet, so the model rendered past the bottom edge and
## short of the top.) Tune in the editor if art or the LocalPlayer scale shifts.
@export var foot_offset: Vector2 = Vector2(0, 102)
## Half-width (px) of the foot line sampled HORIZONTALLY around foot_offset —
## roughly half the character's on-screen width, so feet can't sideways-clip a
## wall. There is no vertical component, so only the bottom row is the boundary.
@export var foot_radius: float = 8.0
## Active skin variant slug (file under res://sprite/players/<slug>.tres).
@export var skin: String = "grey"

const SKIN_DIR: String = "res://sprite/players/"
## Owner-only skin whose tribal markings glow. Its sprite gets the tribal_glow
## ShaderMaterial; every other skin clears the material. red-tribal is auto-equipped
## for the DappHub owner and never selectable by others, so the glow == the owner.
const GLOW_SKIN: String = "red-tribal"
const TRIBAL_GLOW_MATERIAL: ShaderMaterial = preload("res://sprite/players/tribal_glow.tres")

# ---------------------------------------------------------------------------
# Isometric basis vectors
##
## Confirmed from bazaar/CLAUDE.md:
##   Iso X axis: Vector2(64, 32)  — right input moves SE on screen
##   Iso Y axis: Vector2(-64, 32) — down input moves SW on screen
## Normalized before applying speed so diagonal speed equals cardinal speed.
# ---------------------------------------------------------------------------

const ISO_X: Vector2 = Vector2(64.0, 32.0)
const ISO_Y: Vector2 = Vector2(-64.0, 32.0)

@onready var _sprite: AnimatedSprite2D = $Sprite
@onready var _chat_bubble: Node2D = $ChatBubble

# ---------------------------------------------------------------------------
# Private state
# ---------------------------------------------------------------------------

var _send_timer: float = 0.0
var _last_sent_position: Vector2 = Vector2.ZERO
var _last_direction: String = "n"
var _is_moving: bool = false
var _was_moving: bool = false
var _is_sprinting: bool = false

## Current non-looping emote being played ("" = none, "jump", "salute").
var _action: String = ""
## Bridge (web) action input state — Godot's own Input is unreliable on web,
## so React forwards Space/F/Shift via EventBus.external_input_received.
var _ext_sprint: bool = false
var _ext_jump_pending: bool = false
var _ext_salute_pending: bool = false
var _ext_space_down: bool = false
var _ext_f_down: bool = false

## Accumulates directional input forwarded from React via postMessage.
## Updated by _on_external_input(); merged into _read_input() each frame.
var _external_dir: Vector2 = Vector2.ZERO
var _walk_mask: Node = null

# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

func _ready() -> void:
	_last_sent_position = global_position
	# Restore movement/idle anim after a one-shot emote (jump/salute) finishes.
	_sprite.animation_finished.connect(_on_anim_finished)
	# Load the configured skin (falls back to the scene's frames if missing).
	apply_skin(skin)
	EventBus.external_input_received.connect(_on_external_input)
	# React picker (or owner auto-assign) → swap this avatar's skin.
	EventBus.local_skin_changed.connect(_on_local_skin_changed)
	# Mirror the local player's own proximity chat above their head (what others see).
	EventBus.local_chat_updated.connect(_on_local_chat_updated)
	# Scale the chat bubble with the React HUD UI-scale (seed with the cached value).
	EventBus.ui_scale_changed.connect(_on_ui_scale_changed)
	if _chat_bubble != null:
		_chat_bubble.set_ui_scale(EventBus.current_ui_scale)
	# Find the WalkMask node
	_walk_mask = get_node_or_null("/root/World/WalkMask")
	if _walk_mask != null:
		print("Player: WalkMask found!")
	else:
		push_warning("Player: WalkMask NOT found — movement unrestricted")
	# Push spawn position so React's playerPositionRef is seeded before the player moves —
	# otherwise CreateShopModal reads the React-side initial (0,0) and beacons land top-left.
	_send_moved()

func _physics_process(delta: float) -> void:
	if GameManager.is_banned:
		velocity = Vector2.ZERO
		move_and_slide()
		return

	var input_dir: Vector2 = _read_input()
	_is_moving = input_dir.length_squared() > 0.0
	_is_sprinting = _is_moving and _sprint_held()

	# Only update direction when moving so idle inherits last facing
	if _is_moving:
		_last_direction = _compute_direction(input_dir)

	# One-shot emotes (jump = Space, salute = F): trigger on key edge, play fully.
	if _action == "":
		if _consume_jump():
			_start_action("jump")
		elif _consume_salute():
			_start_action("salute")

	if _is_moving:
		var speed: float = move_speed * (sprint_multiplier if _is_sprinting else 1.0)
		var iso_velocity: Vector2 = (ISO_X * input_dir.x + ISO_Y * input_dir.y).normalized() * speed
		velocity = iso_velocity
	else:
		velocity = Vector2.ZERO

	# Walk mask: predict next position and block if not walkable (tested at the feet)
	if _walk_mask != null and _is_moving:
		var next_pos: Vector2 = global_position + velocity * delta
		if not _is_feet_walkable(next_pos):
			# Try sliding along each axis individually
			var try_x: Vector2 = global_position + Vector2(velocity.x, 0) * delta
			var try_y: Vector2 = global_position + Vector2(0, velocity.y) * delta
			if _is_feet_walkable(try_x):
				velocity = Vector2(velocity.x, 0)
			elif _is_feet_walkable(try_y):
				velocity = Vector2(0, velocity.y)
			else:
				velocity = Vector2.ZERO

	var prev_pos: Vector2 = global_position
	move_and_slide()

	# Safety net: if we still ended up in a blocked area, revert
	if _walk_mask != null and not _is_feet_walkable(global_position):
		global_position = prev_pos
		velocity = Vector2.ZERO

	# Animation
	_update_animation()

	# Throttle: send when the interval elapses and the position changed,
	# OR once when the player just stopped (so React receives a final idle update).
	var just_stopped: bool = _was_moving and not _is_moving
	_was_moving = _is_moving

	_send_timer -= delta
	if _send_timer <= 0.0:
		_send_timer = send_interval
		var pos_changed: bool = global_position.distance_squared_to(_last_sent_position) > 0.25
		if pos_changed or just_stopped:
			_send_moved()
			_last_sent_position = global_position

# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

## Walkability tested at the model's feet (origin + foot_offset) with a small
## foot footprint, so the upper body may overhang blocked areas. Returns true
## when no mask is loaded (movement unrestricted).
func _is_feet_walkable(origin_pos: Vector2) -> bool:
	if _walk_mask == null:
		return true
	return _walk_mask.is_walkable(origin_pos + foot_offset, foot_radius)

func _update_animation() -> void:
	# A one-shot emote owns the sprite until it finishes (_on_anim_finished).
	if _action != "":
		return
	var base: String = "idle_"
	if _is_moving:
		base = "run_" if _is_sprinting else "walk_"
	var anim: String = base + _last_direction
	if _sprite.animation != anim or not _sprite.is_playing():
		_sprite.play(anim)

## Begins a non-looping emote animation (jump/salute) facing the last direction.
func _start_action(action: String) -> void:
	_action = action
	_sprite.play(action + "_" + _last_direction)

## Returns to the movement/idle animation once an emote finishes.
func _on_anim_finished() -> void:
	if _action != "":
		_action = ""
		_update_animation()

## True while the sprint key (Shift) is held — native input or React bridge.
func _sprint_held() -> bool:
	return Input.is_action_pressed("sprint") or _ext_sprint

func _consume_jump() -> bool:
	var v: bool = Input.is_action_just_pressed("jump") or _ext_jump_pending
	_ext_jump_pending = false
	return v

func _consume_salute() -> bool:
	var v: bool = Input.is_action_just_pressed("salute") or _ext_salute_pending
	_ext_salute_pending = false
	return v

## Handles EventBus.local_skin_changed — applies a skin chosen in the React picker.
func _on_local_skin_changed(slug: String) -> void:
	apply_skin(slug)

## Swaps the active skin variant. `slug` matches res://sprite/players/<slug>.tres.
## No-op (keeps current frames) if the resource does not exist.
func apply_skin(slug: String) -> void:
	var path: String = SKIN_DIR + slug + ".tres"
	if ResourceLoader.exists(path):
		skin = slug
		_sprite.sprite_frames = load(path)
		# Glowing tribal markings for the owner's red-tribal skin; plain otherwise.
		_sprite.material = TRIBAL_GLOW_MATERIAL if slug == GLOW_SKIN else null
		_action = ""
		_update_animation()

func _read_input() -> Vector2:
	var dir: Vector2 = Vector2.ZERO
	if Input.is_action_pressed("move_right"):
		dir.x += 1.0
	if Input.is_action_pressed("move_left"):
		dir.x -= 1.0
	if Input.is_action_pressed("move_down"):
		dir.y += 1.0
	if Input.is_action_pressed("move_up"):
		dir.y -= 1.0
	# Merge React input overlay movement (SET_MOVEMENT from bridge.gd).
	# This is the primary input path on web — bypasses Emscripten entirely.
	dir += Bridge.web_movement
	# Also merge legacy external input for backwards compat.
	dir += _external_dir
	# Clamp per-axis so simultaneous inputs cannot exceed unit.
	dir.x = clampf(dir.x, -1.0, 1.0)
	dir.y = clampf(dir.y, -1.0, 1.0)
	return dir

## Handles EventBus.external_input_received signal.
## Updates _external_dir based on key-code and press/release state.
## Key codes match the KeyboardEvent.code values the React layer forwards.
func _on_external_input(payload: Dictionary) -> void:
	var code: String    = str(payload.get("code", ""))
	# JSON Booleans arrive as bool Variants; str->bool coercion is not reliable,
	# so compare TYPE directly to handle both bool and potential int (0/1) forms.
	var raw_pressed: Variant = payload.get("pressed", false)
	var pressed: bool = bool(raw_pressed)

	match code:
		"KeyW", "ArrowUp":
			_external_dir.y = -1.0 if pressed else 0.0
		"KeyS", "ArrowDown":
			_external_dir.y =  1.0 if pressed else 0.0
		"KeyA", "ArrowLeft":
			_external_dir.x = -1.0 if pressed else 0.0
		"KeyD", "ArrowRight":
			_external_dir.x =  1.0 if pressed else 0.0
		"Space":
			if pressed and not _ext_space_down:
				_ext_jump_pending = true
			_ext_space_down = pressed
		"KeyF":
			if pressed and not _ext_f_down:
				_ext_salute_pending = true
			_ext_f_down = pressed
		"ShiftLeft", "ShiftRight":
			_ext_sprint = pressed

## Map a 2D input axis vector to one of the 9 API direction strings.
##
## Input axis  →  isometric visual direction:
##   right (+x)              → SE
##   left  (-x)              → NW
##   down  (+y)              → SW
##   up    (-y)              → NE
##   right+down              → S
##   right+up                → E
##   left+down               → W
##   left+up                 → N
##
## This mapping is derived from the confirmed ISO_X/ISO_Y basis: pressing right
## moves the sprite south-east on screen, so the direction is "se".
func _compute_direction(input: Vector2) -> String:
	if input.length_squared() < 0.01:
		return "idle"

	# Use the angle of the raw input vector to snap to the nearest 45° sector.
	var angle_deg: float = rad_to_deg(input.angle())
	if angle_deg < 0.0:
		angle_deg += 360.0

	# Sector index 0..7 clockwise from right (east).
	var sector: int = int(round(angle_deg / 45.0)) % 8

	# Map input-space sectors to isometric visual directions.
	# Input right (+x) moves along ISO_X = (64,32) = SE on screen, etc.
	# Sector 0  = right (input East)  → iso SE
	# Sector 1  = right+down          → iso S
	# Sector 2  = down (input South)  → iso SW
	# Sector 3  = left+down           → iso W
	# Sector 4  = left (input West)   → iso NW
	# Sector 5  = left+up             → iso N
	# Sector 6  = up (input North)    → iso NE
	# Sector 7  = right+up            → iso E
	match sector:
		0: return "se"
		1: return "s"
		2: return "sw"
		3: return "w"
		4: return "nw"
		5: return "n"
		6: return "ne"
		7: return "e"
	return "idle"

func _send_moved() -> void:
	Bridge.notify_player_moved(
		global_position.x,
		global_position.y,
		_last_direction
	)

## Handles EventBus.local_chat_updated — shows the typist's own in-progress text
## (with their name repeated every 2nd line) above their avatar; empty text hides.
func _on_local_chat_updated(text: String, name: String) -> void:
	if _chat_bubble != null:
		_chat_bubble.set_text(text, name)

## Handles EventBus.ui_scale_changed — resize the own chat bubble to match the
## React HUD UI-scale buttons.
func _on_ui_scale_changed(scale_factor: float) -> void:
	if _chat_bubble != null:
		_chat_bubble.set_ui_scale(scale_factor)
