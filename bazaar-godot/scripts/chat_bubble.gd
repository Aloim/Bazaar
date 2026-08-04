# ============================================================
# If this file reaches more than 500 lines, split it into
# 2 or more files to prevent bloating. Code belongs BELOW.
# ============================================================

# scripts/chat_bubble.gd
extends Node2D
## A 3-line "type-out" chat bubble that floats above a player avatar.
##
## Mirrors the live proximity chat: the text is the typist's in-progress
## message (broadcast letter-by-letter, piggybacked on the position relay).
##
## Layout: newest text sits on the BOTTOM line (fully opaque); older wrapped
## lines stack above it and fade UPWARD (middle 75 %, top 40 %). Text wraps at
## ~CHARS_PER_LINE columns and shows a rolling window of the most recent
## MAX_LINES lines. An empty string hides the bubble; a HIDE_AFTER backstop
## hides it if updates stop arriving (the React side normally clears it ~5 s
## after the player stops typing by broadcasting an empty string).
##
## Reused by both player.tscn (local) and remote_player.tscn (others).
## Required children: Line1 (top), Line2 (middle), Line3 (bottom), HideTimer.

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

## Slightly widened vs the old 20 to leave room beside the "name: " speaker prefix
## (the prefix is added AFTER wrapping, like the React chatLines.ts spec).
const CHARS_PER_LINE: int = 22
const MAX_LINES: int = 3
## Backstop: hide if no fresh (non-empty) text arrives within this many seconds.
const HIDE_AFTER: float = 5.0

# ---------------------------------------------------------------------------
# Node references
# ---------------------------------------------------------------------------

@onready var _line_top: Label = $Line1     # oldest visible — 40 % opacity
@onready var _line_mid: Label = $Line2     # middle        — 75 % opacity
@onready var _line_bot: Label = $Line3     # newest        — 100 % opacity
@onready var _hide_timer: Timer = $HideTimer

# ---------------------------------------------------------------------------
# Private state
# ---------------------------------------------------------------------------

var _current_text: String = ""
## The speaker name currently shown (so a re-broadcast of identical text+name is a no-op).
var _current_speaker: String = ""

## The per-scene authored scale (player.tscn = 0.28, remote_player.tscn = 0.167).
## Captured at _ready so set_ui_scale() can multiply it by the React UI-scale
## without losing the counter-scale that keeps bubble text the right world size.
var _base_scale: Vector2 = Vector2.ONE

# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

func _ready() -> void:
	_base_scale = scale
	_hide_timer.wait_time = HIDE_AFTER
	_hide_timer.one_shot = true
	_hide_timer.timeout.connect(_hide)
	_apply_alpha(_line_top, 0.40)
	_apply_alpha(_line_mid, 0.75)
	_apply_alpha(_line_bot, 1.0)
	_hide()

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

## Set the full in-progress text plus the speaker's name. Empty text hides
## immediately; otherwise the bubble shows the last MAX_LINES wrapped lines, with
## the name repeated in front of every 2nd VISIBLE line, and (re)arms the backstop.
func set_text(full_text: String, speaker_name: String = "") -> void:
	var text: String = full_text.strip_edges()
	var speaker: String = speaker_name.strip_edges()
	if text == _current_text and speaker == _current_speaker:
		# Same text+name re-broadcast at relay rate — just keep the backstop alive.
		if not text.is_empty():
			_hide_timer.start()
		return
	_current_text = text
	_current_speaker = speaker

	if text.is_empty():
		_hide()
		return

	var lines: Array = _wrap(text)
	# Keep only the most recent MAX_LINES (rolling window).
	if lines.size() > MAX_LINES:
		lines = lines.slice(lines.size() - MAX_LINES)

	# Prefix "name: " on every 2nd VISIBLE line starting with the top (window
	# positions 0, 2 …) so a reader scanning the bubble always sees who is talking.
	# Mirrors prefixSpeakerLines() in packages/shared/utils/chatLines.ts — keep the
	# two in lock-step (the React history panel uses the same rule).
	if not speaker.is_empty():
		for i in range(lines.size()):
			if i % 2 == 0:
				lines[i] = "%s: %s" % [speaker, lines[i]]

	# Assign newest -> bottom; older lines climb and fade.
	var n: int = lines.size()
	_line_bot.text = lines[n - 1]
	_line_mid.text = lines[n - 2] if n >= 2 else ""
	_line_top.text = lines[n - 3] if n >= 3 else ""

	visible = true
	_hide_timer.start()

## Scale the bubble by the React HUD UI-scale factor (1.0 = authored size).
## Multiplies the per-scene authored counter-scale so the bubble grows/shrinks
## together with the user's UI-scale buttons. Non-positive factors are ignored.
func set_ui_scale(factor: float) -> void:
	if factor <= 0.0:
		factor = 1.0
	scale = _base_scale * factor

# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

func _hide() -> void:
	visible = false
	_current_text = ""
	_current_speaker = ""
	_line_top.text = ""
	_line_mid.text = ""
	_line_bot.text = ""

## Char-wrap into CHARS_PER_LINE-wide chunks (the rolling tail is already capped
## React-side, so this is a deterministic safety wrap).
func _wrap(text: String) -> Array:
	var out: Array = []
	var i: int = 0
	while i < text.length():
		out.append(text.substr(i, CHARS_PER_LINE))
		i += CHARS_PER_LINE
	return out

func _apply_alpha(label: Label, a: float) -> void:
	if label != null:
		label.modulate = Color(1.0, 1.0, 1.0, a)

# ============================================================
# Code belongs ABOVE this comment. If this file reaches more
# than 500 lines, split it into 2 or more files.
# ============================================================
