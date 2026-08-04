IMPORTANT: Critical Insights and Instructions related to the contents of this folder MUST be documented below.
Ensure your information or instruction is accurate, you must never poison context here or elsewhere. No Hallucinations or Invention.
If you discover and confirm poisoned context you must remove it from here so it does not mislead other agents.
Language must be folder-specific, unambiguous, and kept current by agents.
The instructions and knowledge below are not mandates, treat them as guidance only.
---

## bazaar-godot — Godot 4.x Game Client

This directory contains the Godot 2D top-down marketplace visualization for the Bazaar. The game client renders shops as interactive nodes in a spatial environment and communicates with the React frontend via a JavaScript bridge.

### Structure
- `scripts/` — GDScript source files (13 scripts)
  - `shop_manager.gd` / `shop_node.gd` — Shop rendering and management
  - `beacon_config.gd` — Beacon/SSU configuration display
  - `hud.gd` — Heads-up display overlay
  - `player.gd` — Local player movement and interaction
  - `remote_player.gd` / `remote_player_manager.gd` — Multiplayer remote player sync
  - `flicker_light.gd` / `flicker_broken.gd` — Visual effects
  - `foreground_occlusion.gd` / `roof_trigger.gd` — Layer/visibility management
  - `walk_mask.gd` — Movement collision
  - `generate_textures.gd` / `guestbook_light.gd` — Utility scripts
- `scenes/` — Godot scene files (.tscn)
- `shaders/` — Visual shader files
- `textures/` / `sprite/` — Art assets
- `autoload/` — Autoloaded singletons
- `addons/` — Godot editor plugins

### Key Patterns
- JavaScript bridge: Godot embeds in the React frontend as a web export, communicating via `JavaScriptBridge` class
- Shop nodes are dynamically created based on blockchain data received through the bridge
- Beacons represent SSU locations in the game world
- The exchange beacon is a special Godot beacon, NOT a standalone UI window (per user feedback)

### Code Governance
- All files subject to 500-line limit (Constitution Article XII.3)
- GDScript proposals go through: godot-specialist → code-critic → code-executor
