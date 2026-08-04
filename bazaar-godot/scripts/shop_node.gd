# scripts/shop_node.gd
extends Node2D
## Visual representation of a single shop in the game world.
##
## Displays a zombie sprite playing idle_s and a hovering styled title panel
## showing the shop kind badge and title. Click detection is on the panel Area2D.

# ---------------------------------------------------------------------------
# Kind colors — badge text color
# ---------------------------------------------------------------------------

const COLOR_WTS:     Color = Color(0.1, 0.8, 0.1, 1.0)   # Green  — Want To Sell
const COLOR_WTB:     Color = Color(0.2, 0.5, 1.0, 1.0)   # Blue   — Want To Buy
const COLOR_DE:      Color = Color(0.9, 0.55, 0.1, 1.0)   # Orange — Direct Exchange
const COLOR_MIS:     Color = Color(0.65, 0.35, 0.95, 1.0)  # Purple — Mission (MIS)
const COLOR_UNKNOWN: Color = Color(0.7, 0.7, 0.7, 1.0)    # Grey fallback

# Panel style constants
const PANEL_BG_COLOR:     Color = Color(0.0, 0.0, 0.0, 0.72)
const PANEL_BORDER_COLOR: Color = Color(0.85, 0.55, 0.1, 1.0)

# ---------------------------------------------------------------------------
# Public state (set once by ShopManager after instantiation)
# ---------------------------------------------------------------------------

var shop_id: String   = ""
var shop_data: Dictionary = {}

# ---------------------------------------------------------------------------
# Node references (set in _ready)
# ---------------------------------------------------------------------------

@onready var _sprite:      AnimatedSprite2D = $Sprite
@onready var _panel:       PanelContainer   = $TitlePanel
@onready var _kind_badge:  Label            = $TitlePanel/HBoxContainer/KindBadge
@onready var _title_label: Label            = $TitlePanel/HBoxContainer/TitleLabel
@onready var _area:        Area2D           = $Area2D

# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

func _ready() -> void:
	assert(_area.input_pickable, "ShopNode Area2D must have input_pickable = true")
	_area.input_event.connect(_on_area_input_event)
	# Hide Godot panel — React renders holographic text overlay instead.
	_panel.visible = false
	_sprite.play("idle_s")

# ---------------------------------------------------------------------------
# Public API — called by ShopManager
# ---------------------------------------------------------------------------

## Initialise (or refresh) this node from a shop data Dictionary.
func setup(data: Dictionary) -> void:
	shop_data = data
	shop_id   = str(data.get("id", ""))

	var kind:  String = str(data.get("kind", ""))
	var title: String = str(data.get("title", "Shop"))

	_kind_badge.text = _badge_text_for_kind(kind)
	_kind_badge.add_theme_color_override("font_color", _color_for_kind(kind))
	_title_label.text = " " + title

	# Highlight shops owned by the local player.
	var owner: String = str(data.get("owner", ""))
	if GameManager.wallet_connected and owner == GameManager.wallet_address:
		_title_label.add_theme_color_override("font_color", Color.YELLOW)
	else:
		_title_label.remove_theme_color_override("font_color")

# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------

func _on_area_input_event(_viewport: Viewport, event: InputEvent, _shape_idx: int) -> void:
	if not (event is InputEventMouseButton):
		return
	var mb := event as InputEventMouseButton
	if mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
		if not GameManager.can_interact():
			return
		EventBus.shop_node_clicked.emit(shop_id)
		Bridge.notify_shop_clicked(shop_id)

# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

## Apply the StyleBoxFlat to the PanelContainer at runtime.
func _apply_panel_style() -> void:
	var style := StyleBoxFlat.new()
	style.bg_color           = PANEL_BG_COLOR
	style.border_width_left  = 4
	style.border_width_top   = 4
	style.border_width_right = 4
	style.border_width_bottom = 4
	style.border_color               = PANEL_BORDER_COLOR
	style.corner_radius_top_left     = 8
	style.corner_radius_top_right    = 8
	style.corner_radius_bottom_right = 8
	style.corner_radius_bottom_left  = 8
	style.content_margin_left   = 12.0
	style.content_margin_top    = 8.0
	style.content_margin_right  = 12.0
	style.content_margin_bottom = 8.0
	_panel.add_theme_stylebox_override("panel", style)

func _badge_text_for_kind(kind: String) -> String:
	match kind:
		"WTS": return "[WTS]"
		"WTB": return "[WTB]"
		"DE":  return "[DE]"
		"MIS": return "[MIS]"
	return "[???]"

func _color_for_kind(kind: String) -> Color:
	match kind:
		"WTS": return COLOR_WTS
		"WTB": return COLOR_WTB
		"DE":  return COLOR_DE
		"MIS": return COLOR_MIS
	return COLOR_UNKNOWN
