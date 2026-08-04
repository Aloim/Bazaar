# scripts/foreground_occlusion.gd
extends Node2D
## Fades the foreground layer when the player is fully occluded behind it.

## Alpha the foreground fades to when player is fully occluded.
@export var fade_alpha: float = 0.45
## Transition speed (higher = faster fade).
@export var fade_speed: float = 5.0
## Radius around the player to sample for occlusion check.
@export var check_radius: float = 40.0
## Path to foreground WEBP for raw loading (bypasses import; needed for HTML5,
## where get_image() returns null). Points at the real shipped webp so the
## occlusion fade also works on web (previously referenced a non-existent PNG).
@export var fg_mask_path: String = "res://textures/BazaarForegroundLayer.webp"

@onready var _fg_sprite: Sprite2D = $ForegroundSprite

var _fg_image: Image
var _fg_width: int = 0
var _fg_height: int = 0
var _player: Node2D
var _is_occluded: bool = false

func _ready() -> void:
	# Load foreground image for alpha sampling.
	# Method 1: Raw WEBP bytes (works on HTML5 where get_image() returns null).
	var image: Image = null
	var file := FileAccess.open(fg_mask_path, FileAccess.READ)
	if file != null:
		var bytes := file.get_buffer(file.get_length())
		file.close()
		image = Image.new()
		var err: Error = image.load_webp_from_buffer(bytes)
		if err != OK:
			push_warning("ForegroundOcclusion: raw WEBP load failed (error %d), trying texture fallback" % err)
			image = null
		else:
			print("ForegroundOcclusion: loaded raw WEBP %dx%d" % [image.get_width(), image.get_height()])

	# Method 2: Fallback to texture resource (works in editor).
	if image == null and _fg_sprite.texture != null:
		image = _fg_sprite.texture.get_image()
		if image != null:
			print("ForegroundOcclusion: loaded from texture resource %dx%d" % [image.get_width(), image.get_height()])

	if image == null:
		push_error("ForegroundOcclusion: failed to load foreground image!")
		return

	_fg_image = image
	_fg_width = image.get_width()
	_fg_height = image.get_height()

func _process(delta: float) -> void:
	if _fg_image == null:
		return

	if _player == null:
		_player = get_tree().get_first_node_in_group("player")
		if _player == null:
			return

	_is_occluded = _check_fully_occluded()

	# Smooth foreground alpha transition (starts immediately on occlusion)
	var fg_target: float = fade_alpha if _is_occluded else 1.0
	_fg_sprite.modulate.a = move_toward(_fg_sprite.modulate.a, fg_target, delta * fade_speed)

func _check_fully_occluded() -> bool:
	var pos: Vector2 = _player.global_position
	# Sample center + 4 cardinal points around the player
	var points: Array[Vector2] = [
		pos,
		pos + Vector2(0, -check_radius),
		pos + Vector2(0, check_radius),
		pos + Vector2(-check_radius, 0),
		pos + Vector2(check_radius, 0),
	]
	for pt: Vector2 in points:
		if not _is_fg_opaque(pt):
			return false
	return true

func _is_fg_opaque(world_pos: Vector2) -> bool:
	var px: int = int(world_pos.x)
	var py: int = int(world_pos.y)
	if px < 0 or py < 0 or px >= _fg_width or py >= _fg_height:
		return false
	return _fg_image.get_pixel(px, py).a > 0.5
