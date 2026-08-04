# scripts/remote_player.gd
extends Node2D
## Represents another player's avatar in the world.
##
## Interpolates smoothly toward a target position received from React's
## PLAYER_POSITIONS relay. Auto-removes itself after STALE_TIMEOUT seconds
## if no update arrives (the remote player disconnected or is out of range).
##
## Attach to: the root Node2D of the remote_player scene.
## Required children:
##   - Label   (name: "NameLabel")  — shows truncated wallet address

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

## Seconds without an update before this node removes itself.
const STALE_TIMEOUT: float = 5.0

## Glow material for the owner's red-tribal skin (same resource the local player
## uses — shared instance, so the pulse stays in sync across avatars).
const TRIBAL_GLOW_MATERIAL: ShaderMaterial = preload("res://sprite/players/tribal_glow.tres")

## Lerp speed: 10 means the sprite covers ~90 % of remaining distance
## in ~0.23 seconds, which feels smooth at 10 Hz position updates.
const LERP_SPEED: float = 10.0

# ---------------------------------------------------------------------------
# Public state — set by RemotePlayerManager
# ---------------------------------------------------------------------------

var player_address: String = ""

# ---------------------------------------------------------------------------
# Private state
# ---------------------------------------------------------------------------

var _target_position: Vector2 = Vector2.ZERO
var _stale_timer: float = 0.0
var _direction: String = "idle"
var _is_moving: bool = false
var _skin: String = ""

# ---------------------------------------------------------------------------
# Node references
# ---------------------------------------------------------------------------

@onready var _name_label: Label = $NameLabel
@onready var _sprite: AnimatedSprite2D = $Sprite
@onready var _chat_bubble: Node2D = $ChatBubble

# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

func _ready() -> void:
	_target_position = global_position
	_sprite.play("idle_se")
	# Scale the chat bubble with the React HUD UI-scale. Seed with the cached value
	# (this avatar may have spawned after the last change) then track live updates.
	EventBus.ui_scale_changed.connect(_on_ui_scale_changed)
	if _chat_bubble != null:
		_chat_bubble.set_ui_scale(EventBus.current_ui_scale)

func _process(delta: float) -> void:
	# Smoothly interpolate toward the target position (frame-rate independent).
	var weight: float = 1.0 - exp(-LERP_SPEED * delta)
	global_position = global_position.lerp(_target_position, weight)

	_update_animation()

	# Stale check.
	_stale_timer += delta
	if _stale_timer >= STALE_TIMEOUT:
		queue_free()

# ---------------------------------------------------------------------------
# Public API — called by RemotePlayerManager
# ---------------------------------------------------------------------------

## Initialise the node for a given player.
## display_name should be the pre-truncated address string from the server.
func setup(address: String, display_name: String, start_pos: Vector2) -> void:
	player_address = address
	global_position = start_pos
	_target_position = start_pos
	_name_label.text = display_name
	_stale_timer = 0.0

## Update the floating chat bubble with this player's in-progress text + name.
## Empty text hides it. The name is repeated every 2nd line in the bubble so it is
## clear who is speaking. Called by RemotePlayerManager from the relay payload.
func set_chat(text: String, display_name: String = "") -> void:
	if _chat_bubble != null:
		_chat_bubble.set_text(text, display_name)

## Handles EventBus.ui_scale_changed — resize this remote player's chat bubble to
## match the React HUD UI-scale buttons.
func _on_ui_scale_changed(scale_factor: float) -> void:
	if _chat_bubble != null:
		_chat_bubble.set_ui_scale(scale_factor)

## Colour the name label by relationship tier (same colours as cross-SSU shops):
##   own (same SSU) = yellow/orange · tribe (same tribe / NoTribe↔NoTribe) = blue · other = red.
## `color_hex` is an HTML hex string from the relay payload (e.g. "#e0a64b"). Empty/invalid is ignored.
func set_tier_color(color_hex: String) -> void:
	if _name_label == null or color_hex.is_empty() or not Color.html_is_valid(color_hex):
		return
	_name_label.add_theme_color_override("font_color", Color.html(color_hex))

## Swaps this remote avatar's skin (broadcast over the relay) so each player's
## chosen look is visible to everyone. `slug` matches res://sprite/players/<slug>.tres.
func set_skin(slug: String) -> void:
	if slug.is_empty() or slug == _skin:
		return
	var path: String = "res://sprite/players/" + slug + ".tres"
	if not ResourceLoader.exists(path):
		return
	_skin = slug
	var cur: String = _sprite.animation
	_sprite.sprite_frames = load(path)
	# Glowing tribal markings for the owner's red-tribal skin; plain otherwise.
	_sprite.material = TRIBAL_GLOW_MATERIAL if slug == "red-tribal" else null
	if not cur.is_empty() and _sprite.sprite_frames.has_animation(cur):
		_sprite.play(cur)

## Update position/direction from a fresh server message and reset stale timer.
func update_from_server(new_pos: Vector2, new_direction: String) -> void:
	# Detect idle: if position hasn't changed, player is standing still
	var pos_same: bool = _target_position.distance_squared_to(new_pos) < 1.0
	_target_position = new_pos
	if new_direction != "idle":
		_direction = new_direction
	_is_moving = not pos_same
	_stale_timer = 0.0

# ---------------------------------------------------------------------------
# Animation
# ---------------------------------------------------------------------------

func _update_animation() -> void:
	var dir: String = _direction if _direction != "idle" else "se"
	var anim: String = ("walk_" if _is_moving else "idle_") + dir
	if _sprite.animation != anim:
		_sprite.play(anim)
