# scripts/walk_mask.gd
extends Node2D
## Pixel-based walkability check using a painted mask image.
##
## Opaque pixels (alpha > 0.5) = walkable.
## Transparent pixels = blocked.
##
## Uses Godot's BitMap for fast 1-bit-per-pixel lookups.

## The walk mask texture (assigned in scene). Used as fallback for web export.
@export var walk_mask_texture: Texture2D
## Path to the walk mask WEBP for raw loading (bypasses import compression).
## Lossless WEBP: ~49KB vs ~159KB PNG, byte-identical alpha at the 0.5 threshold.
@export var mask_path: String = "res://textures/BazaarWalkMask.webp"
## Radius in pixels to check around the position. Accounts for player sprite size.
@export var check_radius: float = 30.0

var _bitmap: BitMap
var _mask_width: int = 0
var _mask_height: int = 0
var _debug_timer: float = 0.0

func _unhandled_input(event: InputEvent) -> void:
	# F3 toggles mask overlay visibility at runtime
	if event is InputEventKey and event.pressed and event.keycode == KEY_F3:
		var overlay: Node = get_node_or_null("../MaskOverlay")
		if overlay != null:
			overlay.visible = not overlay.visible
			print("MaskOverlay: %s" % ("visible" if overlay.visible else "hidden"))
		get_viewport().set_input_as_handled()

func _ready() -> void:
	var image: Image = null

	# Method 1: Load raw PNG bytes (bypasses import system entirely)
	var file := FileAccess.open(mask_path, FileAccess.READ)
	if file != null:
		var bytes := file.get_buffer(file.get_length())
		file.close()
		image = Image.new()
		var err: Error = image.load_webp_from_buffer(bytes)
		if err != OK:
			push_warning("WalkMask: raw WEBP load failed (error %d), trying texture fallback" % err)
			image = null
		else:
			print("WalkMask: loaded raw WEBP %dx%d" % [image.get_width(), image.get_height()])

	# Method 2: Fallback to texture resource (works in web export)
	if image == null and walk_mask_texture != null:
		image = walk_mask_texture.get_image()
		if image != null:
			print("WalkMask: loaded from texture resource %dx%d" % [image.get_width(), image.get_height()])

	if image == null:
		push_error("WalkMask: failed to load mask image from any source!")
		return

	# Convert to BitMap using alpha threshold — opaque = walkable (true), transparent = blocked (false)
	_bitmap = BitMap.new()
	_bitmap.create_from_image_alpha(image, 0.5)
	_mask_width = image.get_width()
	_mask_height = image.get_height()
	print("WalkMask: BitMap ready %dx%d" % [_mask_width, _mask_height])

	# Sample to verify
	print("  (0,0)=%s  (center)=%s" % [
		_bitmap.get_bit(0, 0),
		_bitmap.get_bit(_mask_width / 2, _mask_height / 2)
	])

## Check if a world position is walkable.
## Samples only `world_pos` plus a HORIZONTAL span of +/- `radius` (the foot
## half-width) — there are deliberately NO vertical samples, so the boundary is
## the single bottom row of the model: the rest of the body (legs, torso, head)
## may hang freely over blocked areas as long as the feet stay on the path.
## `radius` overrides check_radius when >= 0.
func is_walkable(world_pos: Vector2, radius: float = -1.0) -> bool:
	if _bitmap == null:
		return true
	var r: float = radius if radius >= 0.0 else check_radius
	var points: Array[Vector2] = [
		world_pos,
		world_pos + Vector2(r, 0),
		world_pos + Vector2(-r, 0),
	]
	for pt: Vector2 in points:
		if not _is_pixel_walkable(pt):
			return false
	return true

func _is_pixel_walkable(pos: Vector2) -> bool:
	var px: int = int(pos.x)
	var py: int = int(pos.y)
	if px < 0 or py < 0 or px >= _mask_width or py >= _mask_height:
		return false
	return _bitmap.get_bit(px, py)
