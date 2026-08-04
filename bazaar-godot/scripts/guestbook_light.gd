# scripts/guestbook_light.gd
extends PointLight2D
## Slow pulsating light for the guestbook beacon.
## Stops pulsing and dims when hovered (signalled from React via Bridge).

## Base energy level (normal resting state).
@export var base_energy: float = 1.56
## Pulsation amplitude (energy varies +/- this amount).
@export var pulse_amplitude: float = 0.4
## Pulsation speed (lower = slower, dreamier pulse).
@export var pulse_speed: float = 1.5
## Energy when hovered (dimmer than base).
@export var hover_energy: float = 1.0
## Transition speed for hover dim/restore.
@export var transition_speed: float = 4.0

var _time: float = 0.0
var _hovered: bool = false

func _ready() -> void:
	EventBus.guestbook_hover_changed.connect(_on_hover_changed)

func _on_hover_changed(is_hovered: bool) -> void:
	_hovered = is_hovered

func _process(delta: float) -> void:
	if _hovered:
		# Stop pulsing, smoothly dim to hover energy
		energy = move_toward(energy, hover_energy, delta * transition_speed)
	else:
		# Slow sine pulsation
		_time = fmod(_time + delta * pulse_speed, TAU * 100.0)
		var target: float = base_energy + sin(_time) * pulse_amplitude
		energy = move_toward(energy, target, delta * transition_speed * 2.0)
