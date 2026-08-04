IMPORTANT: Critical Insights and Instructions related to the contents of this module MUST be documented below.
Ensure your information or instruction is accurate, you must never poison context here or elsewhere. No Hallucinations or Invention.
If you discover and confirm poisoned context you must remove it from here so it does not mislead other agents.
Language must be module-specific, unambiguous, and kept current by agents.
The instructions and knowledge below are not mandates, treat them as guidance only.
---

## multiplayer-relay — Node.js WebSocket relay (Render-deployed)

Created at the 2026-07-10 Phanes v2.1.1 migration (this module previously lacked a CLAUDE.md).

- **DEPLOY GOTCHA (load-bearing):** the live relay `wss://bazar-pw69.onrender.com/` auto-deploys
  from a SEPARATE public repo — `github.com/Aloim/Bazaar` branch `public`, root `multiplayer-relay/`.
  This working repo has NO remote, so relay changes MUST be pushed to that repo or Render stays
  stale (2026-06-30 "MP 0 players" incident: stale relay ignored the FE's `auth_request` handshake,
  so clients never broadcast).
- **Auth handshake (B5 identity):** FE sends `auth_request` and defers its send loop until
  `auth_ok`; verify a deployed relay with `auth_request` → expect `auth_challenge`. `STRICT_AUTH`
  is off; `OWNER_ADDRESS` gates the red-tribal skin.
- **Traffic model:** 5 Hz position relay; live chat + skins piggyback the same messages (no relay
  change needed for FE chat features).
- **Dependency note:** package.json includes `@mysten/sui` (wallet-signature verification).
