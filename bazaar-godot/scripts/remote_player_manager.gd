# scripts/remote_player_manager.gd
extends Node
## Manages remote player avatar nodes.
##
## Listens to EventBus.player_positions_updated and keeps the scene tree
## in sync: spawn new avatars, update existing ones, and let stale avatars
## remove themselves via their built-in timeout.
##
## The local player's address (GameManager.wallet_address) is always
## excluded from the remote set so we never render a duplicate.
##
## Attach to: a Node child of the World scene.
## Requires:
##   - @export var remote_player_scene: PackedScene

# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------

@export var remote_player_scene: PackedScene

# ---------------------------------------------------------------------------
# Private state
# ---------------------------------------------------------------------------

## Map from player_address (String) -> RemotePlayer node.
var _remote_players: Dictionary = {}

# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

func _ready() -> void:
	EventBus.player_positions_updated.connect(_on_player_positions_updated)

# ---------------------------------------------------------------------------
# Signal handlers
# ---------------------------------------------------------------------------

func _on_player_positions_updated(players: Array) -> void:
	if remote_player_scene == null:
		push_warning("RemotePlayerManager: remote_player_scene is not set.")
		return

	var local_address: String = GameManager.wallet_address

	for player_data: Variant in players:
		if not player_data is Dictionary:
			continue

		var address: String = str(player_data.get("address", ""))
		if address.is_empty():
			continue

		# Never render the local player as a remote avatar.
		if address == local_address:
			continue

		var world_x: float = float(player_data.get("x", 0.0))
		var world_y: float = float(player_data.get("y", 0.0))
		var direction: String = str(player_data.get("direction", "idle"))
		var display_name: String = str(player_data.get("displayName", _truncate_address(address)))
		var chat: String = str(player_data.get("chat", ""))
		var new_pos: Vector2 = Vector2(world_x, world_y)

		if _remote_players.has(address):
			var node: Node2D = _remote_players[address]
			# The node may have freed itself via its stale timer — check validity.
			if is_instance_valid(node):
				node.update_from_server(new_pos, direction)
			else:
				_remote_players.erase(address)
				_spawn_remote_player(address, display_name, new_pos, direction)
		else:
			_spawn_remote_player(address, display_name, new_pos, direction)

		# Push the in-progress chat text (piggybacked on the position payload) to
		# the avatar's floating bubble, plus the speaker's display name so the bubble
		# can label every 2nd line. Empty text hides it.
		var avatar: Variant = _remote_players.get(address, null)
		if is_instance_valid(avatar) and avatar.has_method("set_chat"):
			avatar.set_chat(chat, display_name)

		# Colour the name label by relationship tier (own/tribe/other) — the relay
		# classifies each peer relative to the local SSU and sends a hex colour.
		var tier_color: String = str(player_data.get("color", ""))
		if is_instance_valid(avatar) and avatar.has_method("set_tier_color"):
			avatar.set_tier_color(tier_color)

		# Apply this peer's chosen skin (relayed in the position payload) so every
		# player sees the same avatar look. Empty/unknown slug keeps the default.
		var skin: String = str(player_data.get("skin", ""))
		if is_instance_valid(avatar) and avatar.has_method("set_skin"):
			avatar.set_skin(skin)

# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

func _spawn_remote_player(address: String, display_name: String, pos: Vector2, direction: String) -> void:
	var node: Node2D = remote_player_scene.instantiate() as Node2D
	if node == null:
		push_error("RemotePlayerManager: remote_player_scene did not produce a Node2D.")
		return

	add_child(node)
	node.setup(address, display_name, pos)
	node.update_from_server(pos, direction)
	_remote_players[address] = node

	# Clean up the dictionary entry when the node is freed (stale timeout).
	node.tree_exited.connect(_on_remote_player_exited.bind(address))

func _on_remote_player_exited(address: String) -> void:
	_remote_players.erase(address)

## Produce a display-friendly truncated address if the server did not supply one.
## E.g.  "0xabcdef1234567890" -> "0xabcd...7890"
func _truncate_address(address: String) -> String:
	if address.length() <= 10:
		return address
	return "%s...%s" % [address.left(6), address.right(4)]
