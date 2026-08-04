# Multiplayer & live proximity chat

Bazaar renders other players in the same SSU bazaar in real time, and adds a
distinctive **live "type-out" proximity chat**.

## How it works

- **Transport:** a tiny **stateless WebSocket broadcast relay** (`multiplayer-relay/`).
  It keeps no game state — it just forwards every JSON message to all *other*
  connected clients.
- **Presence:** each client sends its position ~5×/second:
  `{ type: "position", address, displayName, x, y, direction, chat }`. Remote clients
  render an avatar per address and interpolate it; avatars expire if updates stop.
- **Chat:** the in-progress chat text is carried in the `chat` field of that same
  position message — so chat needs no extra protocol and no relay change. Every
  keystroke is broadcast (no Enter required) and appears above the typist's avatar for
  everyone nearby: three lines, newest at the bottom (opaque) fading upward, wrapping
  ~20 characters per line, rolling past 60, and clearing ~5 s after typing stops. The
  typist also sees their own bubble. A bottom-left textbar captures input.

Chat is intentionally ephemeral — nothing is stored or put on-chain.

## Running the relay

Local:

```bash
cd multiplayer-relay
npm install
PORT=8080 npm start          # ws://localhost:8080  (health: /health)
```

Point a client at it (browser console on a bazaar app), then enable the Multiplayer
widget:

```js
localStorage.setItem("multiplayerServerUrl", "ws://localhost:8080")
```

## Hosting (production)

The relay reads `$PORT` and serves plain `ws` + an HTTP health check. Host it anywhere
that gives a public `wss://` URL (most platforms terminate TLS for you):

- **Container:** `docker build -t bazaar-relay multiplayer-relay && docker run -p 8080:8080 bazaar-relay`
- **PaaS:** deploy the `multiplayer-relay/` folder; build `npm install`, start `npm start`.
  Prefer an always-on instance — free tiers that idle out will drop WebSocket connections.
- **VPS:** run under pm2/systemd behind a TLS reverse proxy (Caddy/Nginx) for `wss://`.

Then set the `wss://` URL for the bazaar to use: on-chain via the widget config
(authoritative), or `localStorage["multiplayerServerUrl"]` for quick tests.

## Scaling

One instance handles hundreds of concurrent players (in-memory broadcast). Multiple
instances would need sticky sessions plus a shared pub/sub (e.g. Redis) to fan out
across nodes — not required for typical SSU-local crowds.
