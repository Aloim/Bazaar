// ============================================================
// Bazaar multiplayer relay — identity-binding WebSocket broadcast server.
//
// V2 (AUD-UX-02): wallet-signature handshake + server-stamped identity.
//
// Auth flow:
//   Client sends auth_request → server issues nonce → client signs with wallet
//   → server verifies via @mysten/sui verifyPersonalMessageSignature → auth_ok.
//   Verified sockets have address/displayName/skin stamped server-side.
//
// Legacy tolerance (STRICT_AUTH != "true", the default):
//   Unverified/legacy clients still relay positions; red-tribal entitlement is
//   stripped via sanitizeSkin(skin, null). Name spoofing stays possible in legacy
//   mode but the primary cosmetic abuse (owner-only skin) is closed immediately.
//
// Strict mode (STRICT_AUTH=true):
//   Unverified sockets' position messages are dropped entirely. Enable after all
//   clients are on the auth-capable build.
//
// ENV:
//   PORT=8080
//   OWNER_ADDRESS=0x…            (DappHub owner wallet, case-insensitive)
//   PUBLIC_SKINS=grey,cracked-…  (comma-separated slug allow-list)
//   NONCE_TTL_MS=30000           (nonce validity window, default 30 s)
//   STRICT_AUTH=false            (set true after full client rollout)
//
// Run:  PORT=8080 node server.js
// ============================================================

"use strict";

const { WebSocketServer } = require("ws");
const http = require("http");
const { randomBytes } = require("crypto");

const PORT          = Number(process.env.PORT) || 8080;
const HEARTBEAT_MS  = 30_000;        // ping every 30 s; drop unresponsive sockets
const MAX_MSG_BYTES = 4 * 1024;      // chat + position are tiny; reject anything large
const NONCE_TTL_MS  = Number(process.env.NONCE_TTL_MS) || 30_000;
const STRICT_AUTH   = process.env.STRICT_AUTH === "true";
const OWNER_ADDRESS = (process.env.OWNER_ADDRESS || "").toLowerCase();
const PUBLIC_SKINS  = new Set(
  (process.env.PUBLIC_SKINS ||
    "grey,cracked-white,cracked-blue,cracked-grey-yellow,cracked-patchy," +
    "cracked-redish,green-haze,red-grey,white-black,white-orange")
    .split(",").map(s => s.trim()).filter(Boolean),
);
const RESERVED_OWNER_SKIN = "red-tribal";
const DEFAULT_SKIN        = "grey";

// Lazy-load @mysten/sui/verify — only present after `npm install` in the relay
// directory. Falls back to legacy mode (no auth; guest-tier for all) if absent.
let verifySig = null;
(async () => {
  try {
    const mod = await import("@mysten/sui/verify");
    verifySig = mod.verifyPersonalMessageSignature;
    console.log("[bazaar-relay] @mysten/sui signature verification loaded");
  } catch {
    console.warn("[bazaar-relay] @mysten/sui not found — running in legacy mode (no auth)");
  }
})();

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeNonce() {
  return randomBytes(32).toString("hex");
}

function abbreviateAddress(addr) {
  if (!addr || addr.length < 12) return addr || "";
  return addr.slice(0, 8) + "…" + addr.slice(-4);
}

/**
 * Validate + sanitize a client-supplied skin slug.
 * verifiedAddr: the server-verified wallet address (string) or null for guests.
 * red-tribal is forwarded ONLY when the verified address matches OWNER_ADDRESS;
 * everything else falls to the default. null verifiedAddr always blocks red-tribal.
 */
function sanitizeSkin(skin, verifiedAddr) {
  if (!skin || typeof skin !== "string") return DEFAULT_SKIN;
  if (skin === RESERVED_OWNER_SKIN) {
    if (OWNER_ADDRESS && verifiedAddr && verifiedAddr.toLowerCase() === OWNER_ADDRESS) {
      return RESERVED_OWNER_SKIN;
    }
    return DEFAULT_SKIN;
  }
  return PUBLIC_SKINS.has(skin) ? skin : DEFAULT_SKIN;
}

function unicast(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcastExcept(sender, data) {
  for (const client of wss.clients) {
    if (client !== sender && client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}

// ── HTTP health endpoint ─────────────────────────────────────────────────────

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`bazaar-relay ok — ${wss ? wss.clients.size : 0} client(s)\n`);
    return;
  }
  res.writeHead(404);
  res.end();
});

// ── WebSocket server ───────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_MSG_BYTES });

/** Build the sanitized, server-stamped position envelope to broadcast. */
function buildPositionOut(msg, verifiedAddr, displayName) {
  return {
    type:        "position",
    address:     verifiedAddr ?? (typeof msg.address === "string" ? msg.address : ""),
    displayName: verifiedAddr
      ? displayName
      : (typeof msg.displayName === "string" ? msg.displayName : "Unknown"),
    sessionId:   typeof msg.sessionId === "string" ? msg.sessionId : "",
    x:           typeof msg.x === "number" ? msg.x : 0,
    y:           typeof msg.y === "number" ? msg.y : 0,
    direction:   typeof msg.direction === "string" ? msg.direction : "s",
    chat:        typeof msg.chat === "string" ? msg.chat.slice(0, 200) : "",
    skin:        sanitizeSkin(msg.skin, verifiedAddr),
    msg:         typeof msg.msg === "string" ? msg.msg.slice(0, 500) : "",
    msgSeq:      typeof msg.msgSeq === "number" ? msg.msgSeq : 0,
    ssuId:       typeof msg.ssuId === "string" ? msg.ssuId : "",
    bazaarType:  typeof msg.bazaarType === "number" ? msg.bazaarType : 0,
    tribeId:     typeof msg.tribeId === "number" ? msg.tribeId : 0,
  };
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  // Per-socket relay state. verifiedAddress stays null until auth_ok.
  ws._relay = { nonce: null, nonceExpiry: 0, verifiedAddress: null, displayName: null };
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", async (raw, isBinary) => {
    if (isBinary) return;                 // protocol is JSON text only
    const data = raw.toString();
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.type !== "string") return;
    const relay = ws._relay;

    switch (msg.type) {

      case "auth_request": {
        // Legacy mode (no @mysten/sui): grant a guest slot immediately so old
        // behavior is preserved, but red-tribal stays blocked (not OWNER_ADDRESS).
        if (!verifySig) {
          relay.verifiedAddress = "guest-legacy";
          relay.displayName     = "Unknown";
          unicast(ws, { type: "auth_ok", verifiedAddress: "guest-legacy" });
          return;
        }
        const nonce = makeNonce();
        relay.nonce       = nonce;
        relay.nonceExpiry = Date.now() + NONCE_TTL_MS;
        unicast(ws, { type: "auth_challenge", nonce });
        return;
      }

      case "auth_response": {
        if (!verifySig) return;           // legacy mode — nothing to verify
        if (!relay.nonce) {
          unicast(ws, { type: "auth_fail", reason: "no_challenge_issued" });
          return;
        }
        if (Date.now() > relay.nonceExpiry) {
          relay.nonce = null;
          unicast(ws, { type: "auth_fail", reason: "nonce_expired" });
          return;
        }
        const { signature } = msg;
        if (typeof signature !== "string" || !signature) {
          unicast(ws, { type: "auth_fail", reason: "missing_fields" });
          return;
        }
        let verifiedAddr;
        try {
          // The signed message is the UTF-8 bytes of the nonce string we issued.
          const msgBytes = new TextEncoder().encode(relay.nonce);
          const pubKey   = await verifySig(msgBytes, signature);
          verifiedAddr   = pubKey.toSuiAddress().toLowerCase();
        } catch {
          unicast(ws, { type: "auth_fail", reason: "invalid_signature" });
          return;
        }
        relay.nonce           = null;     // single-use
        relay.verifiedAddress = verifiedAddr;
        relay.displayName     = abbreviateAddress(verifiedAddr);
        unicast(ws, { type: "auth_ok", verifiedAddress: verifiedAddr });
        return;
      }

      case "position": {
        if (!relay.verifiedAddress) {
          // CC-B5-02: legacy-tolerance folded into the single deliverable.
          if (STRICT_AUTH) return;        // strict: drop unverified sockets
          // Default: forward but strip owner-skin entitlement (red-tribal → grey).
          broadcastExcept(ws, JSON.stringify(buildPositionOut(msg, null, null)));
          return;
        }
        // Verified socket: stamp server-authoritative identity; client-supplied
        // address / displayName are ignored.
        broadcastExcept(
          ws,
          JSON.stringify(buildPositionOut(msg, relay.verifiedAddress, relay.displayName)),
        );
        return;
      }

      case "leave": {
        // Legacy guests may send leave so peers clean up their avatars; strict
        // mode drops unverified leaves.
        if (!relay.verifiedAddress && STRICT_AUTH) return;
        const addr = relay.verifiedAddress
          ? relay.verifiedAddress
          : (typeof msg.address === "string" ? msg.address : "");
        if (!addr) return;
        broadcastExcept(ws, JSON.stringify({
          type:      "leave",
          address:   addr,
          sessionId: typeof msg.sessionId === "string" ? msg.sessionId : "",
        }));
        return;
      }

      default:
        return;
    }
  });

  ws.on("error", () => { /* ignore — 'close' handles cleanup */ });
});

// ── Heartbeat ──────────────────────────────────────────────────────────────────

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

wss.on("close", () => clearInterval(heartbeat));

httpServer.listen(PORT, () => {
  console.log(
    `[bazaar-relay] listening on :${PORT} (ws + http health) ` +
    `strict=${STRICT_AUTH}`,
  );
});

// ── Graceful shutdown ────────────────────────────────────────────────────────

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`[bazaar-relay] ${sig} — closing`);
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.close(1001);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
  });
}
