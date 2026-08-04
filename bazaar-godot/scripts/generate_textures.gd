@tool
extends EditorScript
## Run this once from Editor → Script → Run to generate particle textures.

func _run() -> void:
	_generate_smoke("res://textures/fx_smoke.png", 512)
	_generate_spark("res://textures/fx_spark.png", 128)
	_generate_glow("res://textures/fx_glow.png", 256)
	print("Particle textures generated!")

func _generate_smoke(path: String, size: int) -> void:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var center := Vector2(size / 2.0, size / 2.0)
	var radius := size / 2.0
	for y: int in range(size):
		for x: int in range(size):
			var dist: float = Vector2(x, y).distance_to(center) / radius
			# Soft falloff with noise-like variation
			var alpha: float = clampf(1.0 - dist * dist, 0.0, 1.0)
			alpha *= alpha  # extra softness
			img.set_pixel(x, y, Color(0.9, 0.9, 0.9, alpha))
	img.save_png(path)

func _generate_spark(path: String, size: int) -> void:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var center := Vector2(size / 2.0, size / 2.0)
	var radius := size / 2.0
	for y: int in range(size):
		for x: int in range(size):
			var dist: float = Vector2(x, y).distance_to(center) / radius
			var alpha: float = clampf(1.0 - dist, 0.0, 1.0)
			alpha = alpha * alpha * alpha  # sharp bright center
			img.set_pixel(x, y, Color(1, 1, 1, alpha))
	img.save_png(path)

func _generate_glow(path: String, size: int) -> void:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var center := Vector2(size / 2.0, size / 2.0)
	var radius := size / 2.0
	for y: int in range(size):
		for x: int in range(size):
			var dist: float = Vector2(x, y).distance_to(center) / radius
			var alpha: float = clampf(1.0 - dist * dist * dist, 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 1, alpha))
	img.save_png(path)
