# scripts/beacon_config.gd
extends Node2D
## Configurable beacon for React hologram overlays.
## Adjust color, scale, and rotation in the Godot editor inspector.
## The values are sent to React every frame via SHOP_SCREEN_RECTS.
## A preview rectangle + label is drawn in-editor and at runtime so you can
## see where the beacon is and how it's rotated.

@export var beacon_color: Color = Color(1.0, 0.6, 0.0)  ## Text + matrix rain color
@export var beacon_scale: float = 1.0                     ## Overall scale multiplier
@export_range(-180.0, 180.0, 0.1) var beacon_rotation_deg: float = 0.0  ## Rotation in degrees
@export var proximity_radius: float = 200.0   ## Distance in world pixels to trigger hover
@export var rect_width: float = 0.0            ## Overlay rect width (0 = default/unused)
@export var rect_height: float = 0.0           ## Overlay rect height (0 = default/unused)

func _draw() -> void:
	# Only draw the preview in the editor, not at runtime
	if not Engine.is_editor_hint():
		return
	var half_w: float = (rect_width * 0.5) if rect_width > 0.0 else (60.0 * beacon_scale)
	var half_h: float = (rect_height * 0.5) if rect_height > 0.0 else (40.0 * beacon_scale)
	var rect := Rect2(-half_w, -half_h, half_w * 2.0, half_h * 2.0)
	var preview_color := Color(beacon_color, 0.25)
	var border_color := Color(beacon_color, 0.7)
	draw_rect(rect, preview_color, true)
	draw_rect(rect, border_color, false, 1.5)
	var label_text: String = name if name else "Beacon"
	draw_string(ThemeDB.fallback_font, Vector2(-half_w + 4, -2), label_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, border_color)

func _process(_delta: float) -> void:
	rotation_degrees = beacon_rotation_deg
	if Engine.is_editor_hint():
		queue_redraw()
