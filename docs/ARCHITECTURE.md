# Architecture

Bazaar is a decentralized marketplace dApp for EVE Frontier. It has three layers:
on-chain Move contracts (authoritative), a React frontend, and an embedded Godot
game client. Trust and access control live on-chain; the client is a renderer.

## On-chain (Sui Move)

Six independently deployable packages. `dapp_hub` and `shared_widgets` are leaves;
`bazaar_core` depends on both; `bazaar_mission` and `bazaar_shop_ops` each depend on
`bazaar_core` (plus `dapp_hub`/`shared_widgets`); `bazaar_economy` depends on both
`bazaar_core` and `bazaar_mission`. See the dependency graph in the root
[README](../README.md#package-dependency-graph) for the full picture:

- **`dapp_hub`** — global governance: SSU registration, tribe registry, the DApp tax
  wallet + escrow wallet, registration/creation fees, announcements, anchor registry,
  and the on-chain **Bazaar News** board (news + polls + comments).
- **`bazaar_core`** — the marketplace core: shops (WTS / WTB / Direct-Exchange /
  FREE), the global trade registry, membership/roles, per-SSU governance, the WTB
  escrow pool, and the quicktrade vault.
- **`bazaar_mission`** — the Mission (MIS) shop type: escrowed reward-per-run jobs
  with item-proof/giver-confirmed completion, collateral pools, and mission lifecycle.
- **`bazaar_economy`** — the Advanced tier economy: a per-tribe token ledger, an
  EVE⇄token exchange, a vault, and ledger-based shop operations.
- **`bazaar_shop_ops`** — shop execution, moderation, and close/recovery entries
  (split out of `bazaar_core` to stay under Sui's package size limit), gated by a
  dedicated `ShopOpsCap`.
- **`shared_widgets`** — social widgets (guestbook, donations, announcements).

Capabilities (`DAppOwnerCap`, per-SSU and per-tribe caps, `UpgradeCap`s) gate every
privileged action. Object/package IDs rotate on each fresh publish; struct **type**
filters are anchored to the original (first) publish ID.

## Frontend (React + TypeScript)

An npm-workspace monorepo (`bazaar-frontend/`):

- **`apps/dapphub`** — admin: SSU registration, tribe/SSU governance, tax & fee config,
  Bazaar News authoring.
- **`apps/notribe` / `apps/easy` / `apps/advanced`** — the three player-facing bazaar
  tiers. They share UI but differ in governance, shop variants, and tax model.
- **`packages/shared`** (`@bazaar/shared`) — React hooks (Sui RPC reads), TX builders
  (PTB construction), types, constants, and shared components. This is where most of
  the logic lives; the apps are thin shells.
- **`netlify-functions/`** — a `gas-sponsor` serverless function: validates a proposed
  transaction's intent (command-kind allowlist, GasCoin-theft detection, package
  allowlist), attaches sponsor gas, and co-signs it, so players don't need to hold SUI.

Each app embeds the same Godot client and bridges to it via window `CustomEvent`s.

## Game client (Godot 4.x)

`bazaar-godot/` is a 2D top-down world. It renders shops, mission boards, and feature
beacons from on-chain data passed in over the JS bridge, handles local player movement,
and draws remote players + the live proximity-chat bubble. It is exported to a web build
(`Bazaar.pck`/`.wasm`/`.js`, checked in alongside the source) and served as a shared
static bundle by all four apps.

## Multiplayer

Player presence and live chat are **not** on-chain (they are ephemeral, high-frequency,
and free). They ride a small stateless WebSocket relay (`multiplayer-relay/`): the
client broadcasts its position ~5×/second, and the in-progress chat text is piggybacked
on that same message, so chat needs no extra protocol. See
[MULTIPLAYER.md](MULTIPLAYER.md).

## Data flow (a shop purchase)

1. React reads shop state from Sui via `@bazaar/shared` hooks and passes it to Godot.
2. The player clicks a shop beacon in Godot → bridged back to React.
3. React builds a Programmable Transaction Block (PTB); either the player signs it
   directly, or (if gas sponsorship is enabled) the intent is sent to the `gas-sponsor`
   function, which validates and co-signs it before the player's wallet signs.
4. The contract validates capabilities/tax/payment on-chain and moves items via the
   EVE Frontier world storage primitives.
5. React re-reads state and updates the world.
