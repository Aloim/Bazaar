# scripts/flicker_light.gd
extends PointLight2D
## Flickering damaged light effect.

## Base energy level
@export var base_energy: float = 0.8
## How much the energy varies (0.0 - 1.0)
@export var flicker_intensity: float = 0.5
## How fast it flickers (higher = more erratic)
@export var flicker_speed: float = 15.0
## Chance per frame to briefly cut out (0.0 - 1.0)
@export var cutout_chance: float = 0.03

var _time: float = 0.0

func _process(delta: float) -> void:
	_time += delta * flicker_speed
	# Perlin-like flicker using layered sine waves
	var flicker: float = sin(_time) * 0.5 + sin(_time * 2.3) * 0.3 + sin(_time * 5.7) * 0.2
	energy = base_energy + flicker * flicker_intensity
	# Random brief cutout for damaged look
	if randf() < cutout_chance:
		energy = base_energy * 0.1
