# scripts/flicker_broken.gd
extends PointLight2D
## Broken light that cuts out and sputters back on.

## Energy when the light is on
@export var on_energy: float = 0.8
## Minimum time the light stays on (seconds)
@export var on_time_min: float = 1.0
## Maximum time the light stays on (seconds)
@export var on_time_max: float = 4.0
## Minimum time the light stays off (seconds)
@export var off_time_min: float = 0.3
## Maximum time the light stays off (seconds)
@export var off_time_max: float = 2.0
## Chance to do rapid on/off stutter before turning back on (0.0 - 1.0)
@export var stutter_chance: float = 0.5
## Number of rapid flashes during stutter
@export var stutter_count: int = 3

var _timer: float = 0.0
var _is_on: bool = true
var _stuttering: bool = false
var _stutter_left: int = 0

func _ready() -> void:
	_timer = randf_range(on_time_min, on_time_max)
	energy = on_energy

func _process(delta: float) -> void:
	if _stuttering:
		_do_stutter(delta)
		return

	_timer -= delta
	if _timer <= 0.0:
		if _is_on:
			# Turn off
			_is_on = false
			energy = 0.0
			_timer = randf_range(off_time_min, off_time_max)
		else:
			# Coming back on — maybe stutter first
			if randf() < stutter_chance:
				_stuttering = true
				_stutter_left = stutter_count
				_timer = 0.06
			else:
				_is_on = true
				energy = on_energy
				_timer = randf_range(on_time_min, on_time_max)

func _do_stutter(delta: float) -> void:
	_timer -= delta
	if _timer <= 0.0:
		_stutter_left -= 1
		if _stutter_left <= 0:
			# Done stuttering, turn on
			_stuttering = false
			_is_on = true
			energy = on_energy
			_timer = randf_range(on_time_min, on_time_max)
		else:
			# Rapid toggle
			energy = on_energy if energy < 0.1 else 0.0
			_timer = randf_range(0.04, 0.1)
