# Bazaar Godot — Handoff Package

## Quick Start

1. Open this folder (`bazaar/`) in **Godot 4.6** (GL Compatibility renderer)
2. Hit Play (F5) — the game should run with mock data (no React needed)
3. WASD/arrows to move the player character in isometric directions
4. Three mock shops should appear on the map (green WTS, blue WTB, orange DE)
5. HUD bar at top shows balance, address, role, and action buttons

## What's In the Box

### Autoloads (loaded automatically via project.godot)
| Autoload | File | Purpose |
|---|---|---|
| EventBus | `autoload/event_bus.gd` | Signal hub — all systems communicate through here |
| Bridge | `autoload/bridge.gd` | postMessage send/receive with React. Desktop mode sends mock data |
| GameManager | `autoload/game_manager.gd` | Session state store (wallet, roles, balance, ban status) |

### Scenes
| Scene | File | Purpose |
|---|---|---|
| World | `scenes/world.tscn` | Main scene — tilemap container, managers, player, HUD |
| Player | `scenes/player.tscn` | Local player with CharacterBody2D, collision, camera |
| ShopNode | `scenes/shop_node.tscn` | Single shop visual — colored rect + title label + click area |
| RemotePlayer | `scenes/remote_player.tscn` | Other player avatar with name label |
| HUD | `scenes/hud.tscn` | Top bar (balance, address, buttons) + toast system + ban overlay |

### Scripts
| Script | Attached To | Purpose |
|---|---|---|
| `scripts/player.gd` | Player scene | 8-dir isometric movement, sends PLAYER_MOVED |
| `scripts/shop_node.gd` | ShopNode scene | Display shop data, handle clicks |
| `scripts/shop_manager.gd` | ShopManager node | Spawn/remove shops, placement mode |
| `scripts/remote_player.gd` | RemotePlayer scene | Interpolated movement, stale timeout |
| `scripts/remote_player_manager.gd` | RemotePlayerManager node | Spawn/update remote players |
| `scripts/hud.gd` | HUD scene | Balance display, role buttons, toasts, ban overlay |

### Input Map
| Action | Keys |
|---|---|
| `move_up` | W, Up Arrow |
| `move_down` | S, Down Arrow |
| `move_left` | A, Left Arrow |
| `move_right` | D, Right Arrow |
| `cancel_placement` | Escape |

## What YOU Need To Do

### Must-Do (to get it running properly)

1. **Set up the TileSet** — The `GroundLayer` TileMapLayer has no TileSet resource yet. You need to:
   - Create a new TileSet resource (isometric, 128x64 tile size)
   - Add atlas sources from `Assets/INDUSTRIAL_isoTiles11/isoTiles11/` PNGs
   - Assign it to GroundLayer (and optionally DecoLayer)
   - Paint some floor tiles so the world has visible ground

2. **Set up player animations** — The Player and RemotePlayer `AnimatedSprite2D` nodes have no SpriteFrames resource. You need to:
   - Create a `SpriteFrames` resource with 16 animations:
     - `walk_n`, `walk_ne`, `walk_e`, `walk_se`, `walk_s`, `walk_sw`, `walk_w`, `walk_nw`
     - `idle_n`, `idle_ne`, `idle_e`, `idle_se`, `idle_s`, `idle_sw`, `idle_w`, `idle_nw`
   - Load frames from `Assets/ZOMBIE 1/WALK/{DIR}/128/` (14 frames each)
   - Load frames from `Assets/ZOMBIE 1/IDLE/{DIR}/128/` (use first ~8 frames for hackathon)
   - Assign the SpriteFrames to both Player/Sprite and RemotePlayer/Sprite

3. **Wire ShopManager tilemap** — Open `world.tscn`, select ShopManager, set the `tilemap` export to point to `TileMap/GroundLayer`

### Nice-To-Have

- Add building sprites from `Assets/CyberCity_Outskirts_*/` as decoration
- Tweak camera zoom on Player/Camera2D
- Style the HUD buttons with a cyberpunk theme
- Add a placement ghost sprite (translucent green diamond) to the World scene

## Architecture

The Godot game is a **visual layer only**. It communicates with a React parent app via `window.postMessage()` (iframe architecture).

- **React → Godot:** Shop data, wallet state, balances, player positions, transaction results
- **Godot → React:** Shop clicks, placement requests, player movement, panel open requests

All blockchain/wallet/transaction logic lives in React. Godot never touches the chain.

Full API spec: `../docs/react-godot-api-architecture.md`

## Desktop Testing

When running in the Godot editor (not in a browser), the Bridge autoload automatically injects mock data after 0.5 seconds:
- A connected wallet with Admin role
- Three mock shops (WTS, WTB, DE) at different tile positions
- 15,000 TRIBE balance

This means you can develop and test without the React app running.
