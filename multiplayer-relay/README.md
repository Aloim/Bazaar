# Bazaar Multiplayer Relay

A tiny, **stateless** WebSocket broadcast server that powers Bazaar multiplayer
presence (remote player avatars) and the live "type-out" proximity chat.

It keeps **no game state**. Every JSON message a client sends is forwarded
verbatim to every *other* connected client. That's all the protocol needs:

```
{ "type": "position", "address": "0x..", "displayName": "Name",
  "x": 0, "y": 0, "direction": "se", "chat": "live typing…" }   // ~5 Hz
{ "type": "leave", "address": "0x.." }                           // on disconnect
```

The `chat` field carries the in-progress proximity-chat text (piggybacked on the
position message), so chat works without any relay change — the relay just fans
JSON out.

## Run locally

```bash
cd multiplayer-relay
npm install
PORT=8080 npm start
# → ws://localhost:8080   (health: http://localhost:8080/health)
```

Point the frontend at it for local testing (browser console on the bazaar app):

```js
localStorage.setItem("multiplayerServerUrl", "ws://localhost:8080")
```

…then enable the **Multiplayer** widget (widget index 3) so the client connects.

## Host it (get a public wss:// URL)

The server listens on plain `ws`/HTTP and reads `$PORT`. Run it behind any host
that terminates TLS, and clients connect over `wss://`.

- **Render / Railway / Fly.io / Heroku-style:** deploy this folder. Build:
  `npm install`; Start: `npm start`. They set `$PORT` and give you an
  `https://…` domain → use `wss://<that-domain>`.
- **Docker (any VPS / PaaS):**
  ```bash
  docker build -t bazaar-relay multiplayer-relay
  docker run -p 8080:8080 bazaar-relay
  ```
  Put it behind a TLS reverse proxy (Caddy/Nginx/Cloudflare) for `wss://`.
- **Bare VPS:** `node server.js` under pm2/systemd, TLS via your proxy.

Health check endpoint: `GET /health` → `200` with the current client count.

## Wire the frontend to your hosted relay (production)

The frontend reads the relay URL from **on-chain** `WidgetConfig.server_url`
(widget index 3) first, falling back to `localStorage["multiplayerServerUrl"]`.
For production, set the on-chain URL via the DappHub / SSU SuperAdmin **Widgets**
config (the multiplayer widget's server URL field) to your `wss://…` host, and
enable the multiplayer widget. The bazaar apps then connect automatically.

## Notes

- Stateless + idempotent: scaling beyond one instance requires sticky sessions or
  a shared pub/sub (Redis) fan-out — not needed for typical SSU-local crowds.
- `maxPayload` is 4 KB (position + chat are tiny); larger frames are rejected.
- 30 s ping/pong heartbeat drops dead sockets.
