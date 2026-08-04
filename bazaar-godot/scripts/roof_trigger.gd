extends Area2D

@export var roof_layer: TileMapLayer

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		var tween = create_tween()
		tween.tween_property(roof_layer, "modulate:a", 0.15, 0.3)

func _on_body_exited(body: Node2D) -> void:
	if body.is_in_group("player"):
		var tween = create_tween()
		tween.tween_property(roof_layer, "modulate:a", 1.0, 1.0)
