# scripts/holo_panel.gd
extends Node2D
## Reusable animated holographic service-beacon panel (Issue 3).
##
## The VISUAL lives here in Godot now (an AnimatedSprite2D playing the diagenic
## holo-panel animation baked to a transparent sheet — the default is
## sprite/ui/holo_panel_v1.tres), with a centered title label. React renders only an INVISIBLE click/hover
## hit-area over it (ServiceBeaconHitArea.tsx), sized from the screenW/screenH this
## panel reports each frame via shop_manager's beacon dict.
##
## Active state = player proximity (self-computed from the parent anchor) OR a
## mouse hover relayed from React (set_beacon_hover -> EventBus.beacon_hover_changed,
## filtered by beacon_name). Active brightens + gently scales the panel.
##
## Spawned at runtime by shop_manager.gd onto each service-beacon anchor node.

## Native frame size of one cell in the panel sheet (px).
const FRAME_SIZE: Vector2 = Vector2(320.0, 180.0)

## Inner amber fill of the holo art, in HoloPanel-LOCAL px. The Title label is a
## SIBLING of the 0.8-scaled Sprite, so it is NOT affected by sprite_scale — these
## are the dimensions of the rendered (256x144) panel's amber fill, inside the
## glowing cyan border. The title must stay within this box or it spills past the art.
const TITLE_BOX: Vector2 = Vector2(184.0, 86.0)
## Resting title font; _fit_title() shrinks per-label down to TITLE_FONT_MIN so long
## labels (INVENTORY / GUESTBOOK) fit on one line within TITLE_BOX without overflowing.
const TITLE_FONT_MAX: int = 34
const TITLE_FONT_MIN: int = 18

## --- BEACON-TITLE FONT (matches the EVE Frontier site headlines) ------------
## The evefrontier.com headline face (their CSS calls it "Headline") IS Disket
## Mono. The FAQ section titles render as Disket Mono Regular, UPPERCASE, in a
## warm cream (#FAFAE5). We load it at RUNTIME from the bundled WOFF2 via
## load_dynamic_font (Godot supports WOFF2), so it needs NO Godot import step,
## and share it across all panels via a static cache.
##   CURRENT/DEFAULT was the engine's built-in sans, pure-white (no override).
##   REVERT: set TITLE_FONT_PATH = "" -> every title falls back to that default
##   (and the .tscn's white). Or git-checkout this file + delete res://fonts/.
const TITLE_FONT_PATH: String = "res://fonts/Disket-Mono-Regular.woff2"
## Warm cream the EVE Frontier headlines use (rgb 250,250,229).
const TITLE_FONT_COLOR: Color = Color(0.9804, 0.9804, 0.8980, 1.0)
static var _title_font_cache: FontFile = null
static var _title_font_loaded: bool = false

## Loads the title font once (static cache) and returns it, or null to use the
## engine default. load_dynamic_font reads the raw WOFF2/TTF, so no .import needed.
static func _resolve_title_font() -> FontFile:
	if _title_font_loaded:
		return _title_font_cache
	_title_font_loaded = true
	if TITLE_FONT_PATH == "" or not FileAccess.file_exists(TITLE_FONT_PATH):
		return null
	var ff := FontFile.new()
	if ff.load_dynamic_font(TITLE_FONT_PATH) != OK:
		return null
	_title_font_cache = ff
	return _title_font_cache

## Idle "floating hologram" bob — a gentle up/down sine on the whole panel. Amplitude
## is in the anchor's local space (world px ≈ amplitude × anchor scale), so it reads as
## a few px of slow hover. shop_manager projects the hit-area from panel.global_position,
## so the invisible React click-area floats in lockstep with the visual.
const FLOAT_AMPLITUDE: float = 7.0
const FLOAT_SPEED: float = 1.5   # rad/s → ~4.2s period

## Title drawn on the panel (e.g. "TRADE"). Set by shop_manager before add_child.
@export var beacon_title: String = ""
## Hover-routing key — must match the `beacon` value React sends in set_beacon_hover.
@export var beacon_name: String = ""
## World-pixel radius around the parent anchor that auto-activates the panel.
@export var proximity_radius: float = 220.0
## Base sprite scale (panel design size = FRAME_SIZE * sprite_scale).
@export var sprite_scale: float = 0.8
## When true, the panel is shown only in Advanced bazaars (e.g. the Exchange beacon).
## Bazaar type comes from the init payload; shop_manager only flags godotPanel when
## the panel is visible, so React falls back cleanly in non-Advanced worlds.
@export var advanced_only: bool = false
## Optional per-beacon panel-art override. When set, it replaces the scene's
## default panel sheet (holo_panel_v1.tres) so a beacon can show a different panel
## (e.g. BazaarInfo uses V4). Null -> the default sheet. Set by shop_manager before
## add_child (see PANEL_FRAME_OVERRIDES).
@export var frames_override: SpriteFrames = null

@onready var _sprite: AnimatedSprite2D = $Sprite
@onready var _title: Label = $Title

var _hovered: bool = false
var _player: Node2D
var _anchor: Node2D
var _active_t: float = 0.0
var _bazaar_type: String = ""
## Floating-bob state: spawn position to oscillate around + a random phase so
## adjacent panels don't bob in lockstep.
var _base_pos: Vector2 = Vector2.ZERO
var _float_t: float = 0.0
var _float_phase: float = 0.0

func _ready() -> void:
	_anchor = get_parent() as Node2D
	_base_pos = position    # shop_manager set position (0, OFFSET_Y) before add_child
	_float_phase = randf() * TAU
	_sprite.scale = Vector2(sprite_scale, sprite_scale)
	# Swap in the per-beacon preview sheet (if any) before playing so the desync
	# below reads the override's frame count. All override sheets carry an "idle"
	# animation, so play("idle") stays valid.
	if frames_override != null:
		_sprite.sprite_frames = frames_override
	# Guard against a missing sheet so a bad/absent resource can't crash _ready.
	if _sprite.sprite_frames != null:
		_sprite.play("idle")
		# Desync adjacent panels so they don't pulse in lockstep.
		var fc: int = _sprite.sprite_frames.get_frame_count("idle")
		if fc > 0:
			_sprite.frame = randi() % fc
	# Apply the display font + EVE-headline cream (if configured) BEFORE fitting so
	# the size search measures the real font. Null -> engine default (prior look).
	var title_font: FontFile = _resolve_title_font()
	if title_font != null:
		_title.add_theme_font_override("font", title_font)
		_title.add_theme_color_override("font_color", TITLE_FONT_COLOR)
	_fit_title()
	EventBus.beacon_hover_changed.connect(_on_beacon_hover)
	EventBus.init_state_received.connect(_on_init_state)
	_apply_visibility()

func _on_init_state(payload: Dictionary) -> void:
	_bazaar_type = str(payload.get("bazaarType", "")).to_lower()
	_apply_visibility()

## advanced_only panels stay hidden until init confirms an Advanced bazaar.
func _apply_visibility() -> void:
	if advanced_only:
		visible = _bazaar_type == "advanced"

## Sets the title and shrinks the font until the (single-line) label fits inside
## TITLE_BOX — so long words like INVENTORY / GUESTBOOK stay within the amber fill
## instead of overflowing the panel art. Measures the live theme font, so it is
## correct regardless of the font's metrics. WORD_SMART autowrap (set in the scene)
## is a safety net for any future multi-word title; current single-word labels fit
## on one line once shrunk.
func _fit_title() -> void:
	if _title == null:
		return
	_title.text = beacon_title
	var font: Font = _title.get_theme_font("font")
	if font == null:
		return
	# Shrink the font until the title fits inside the amber fill. Multi-line titles
	# (e.g. "FINANCE\nNEWS") are fit per-line on WIDTH and on TOTAL HEIGHT, so a
	# 2-line label stays large instead of being crushed onto one line. The -20/-12
	# pads leave room for the ~5px outline bleed + breathing room before the clip box.
	# get_string_size measures glyph advance only, one line at a time. Verified
	# in-editor: "INVENTORY" sits inside the amber fill at ~28-30px.
	var lines: PackedStringArray = beacon_title.split("\n")
	var max_w: float = TITLE_BOX.x - 20.0
	var max_h: float = TITLE_BOX.y - 12.0
	var fs: int = TITLE_FONT_MAX
	while fs > TITLE_FONT_MIN:
		var widest: float = 0.0
		for ln: String in lines:
			widest = maxf(widest, font.get_string_size(ln, HORIZONTAL_ALIGNMENT_CENTER, -1.0, fs).x)
		var total_h: float = font.get_height(fs) * float(lines.size())
		if widest <= max_w and total_h <= max_h:
			break
		fs -= 1
	_title.add_theme_font_size_override("font_size", fs)

## Design size of the panel in WORLD px — shop_manager projects this to screen
## space so the React hit-area matches the rendered panel exactly. Includes the
## parent anchor's scale (the world.tscn beacon anchors carry 0.7/0.8 scales),
## so the hit-area tracks the on-screen panel and never sits oversized.
func get_design_size() -> Vector2:
	var anchor_scale: Vector2 = _anchor.scale if _anchor != null else Vector2.ONE
	return FRAME_SIZE * sprite_scale * anchor_scale

func _on_beacon_hover(target_beacon: String, is_hovered: bool) -> void:
	if target_beacon == beacon_name:
		_hovered = is_hovered

func _process(delta: float) -> void:
	# Proximity self-activation — measured from the anchor (where the player walks),
	# not the floating panel, so it matches the React-side proximity cue.
	if _player == null:
		_player = get_tree().get_first_node_in_group("player") as Node2D
	var near: bool = false
	if _player != null and _anchor != null and proximity_radius > 0.0:
		near = _anchor.global_position.distance_to(_player.global_position) <= proximity_radius
	var target: float = 1.0 if (_hovered or near) else 0.0
	_active_t = move_toward(_active_t, target, delta * 6.0)
	# Brighten the cyan border + gently scale up when active; idle dims slightly.
	var b: float = lerp(0.82, 1.18, _active_t)
	_sprite.modulate = Color(b, b, b, 1.0)
	var s: float = sprite_scale * lerp(1.0, 1.06, _active_t)
	_sprite.scale = Vector2(s, s)
	# Idle floating-hologram bob — gentle up/down sine on the whole panel (visual +
	# title + reported hit-area all move together). Proximity is anchor-based, so this
	# never affects activation.
	_float_t += delta
	position.y = _base_pos.y + sin(_float_t * FLOAT_SPEED + _float_phase) * FLOAT_AMPLITUDE
