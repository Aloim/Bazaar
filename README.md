# Bazaar

A decentralized, in-world marketplace for [EVE Frontier](https://www.evefrontier.com/) — built on the **Sui** blockchain, with a **React** UI and a 2D **Godot** game client embedded directly in the EVE Frontier dApp browser.

Players run shops, complete missions, trade, govern tribes, and **see and chat with each other live** inside a shared bazaar rendered around their Smart Storage Units (SSUs).

> **Status:** live on **Sui testnet**. On-chain IDs in the config are public and point at the current testnet deployment.

> [!IMPORTANT]
> **Deploying your own copy?** The DApp-owner wallet is not auto-detected — you must
> claim/set it to **your own** wallet, or your deployment still treats the original
> maintainer's testnet wallet as "the owner." See
> [Deploying to Sui testnet](#deploying-to-sui-testnet) below before you publish.

---

## What it does

- **Shops** — list items to sell (WTS), post buy orders (WTB), set up barter pairs (Direct Exchange, whole-bundle N:M ratios), or give items away (FREE). Shops appear as in-world beacons around the SSU.
- **Missions (MIS)** — escrowed reward-per-run jobs with item-proof/giver-confirmed completion, per-hour listing fees, and an in-world beacon.
- **Three bazaar tiers** — `NoTribe` (no affiliation), `Easy` (tribe-affiliated, simple governance), and `Advanced` (full economy: a tribe-token ledger, EVE⇄token exchange, vault). Plus **DappHub**, the admin app for SSU registration, tribe management, tax/fee config, and the on-chain news board.
- **Governance & tax** — per-SSU and per-tribe role-based tax, timed/permanent bans, configurable registration/creation fees with an escrow flow, moderation, and capability-gated admin actions enforced on-chain.
- **Zero-SUI onboarding** — an optional gas-sponsorship service lets new players sign transactions without holding any SUI; a fail-closed Netlify Function validates and co-signs each transaction before attaching sponsor gas.
- **Multiplayer** — real-time player presence (avatars move in a shared world) plus a distinctive **live "type-out" proximity chat**: every letter you type appears instantly above your avatar for everyone nearby, fading over three lines and clearing a few seconds after you stop.
- **Bazaar News** — an on-chain news board with polls and comments, surfaced both in DappHub and as an in-world beacon.

## Architecture

```
On-chain (Sui Move)              Frontend (React/TS)            Game client (Godot)
───────────────────────          ────────────────────           ───────────────────
DappHub          ── governance,  apps/dapphub    (admin)        bazaar-godot/
                  registry, fees apps/notribe                   2D top-down world,
BazaarCore       ── shops,       apps/easy                      shop/mission/news
                  trade, roles   apps/advanced                  beacons, local +
BazaarMission    ── mission                                     remote players,
                  shop type      packages/shared (hooks, TX     proximity-chat bubble.
BazaarEconomy    ── token ledger, builders, types, UI)          Talks to React over a
                  exchange, vault                               JS bridge.
BazaarShopOps    ── shop execution
                  / moderation / close
SharedWidgets    ── social widgets

multiplayer-relay/  ── a tiny stateless WebSocket broadcast server that fans player
                       position + live-chat messages out to everyone in the bazaar.
```

The Move side is split into **six** independently deployable packages (capability-gated;
`bazaar_mission` and `bazaar_shop_ops` both depend on `bazaar_core`). The frontend is an
npm-workspace monorepo: four Vite apps sharing one `@bazaar/shared` package and one Godot
client. Security lives on-chain (capability gates), not in the client.

### Package dependency graph

Six independent Sui packages, published in this order (each fresh publish rotates all
downstream package IDs):

```
        dapp_hub                    shared_widgets
   global governance,                 guestbook,
   registry, tax wallet             donations, news
        │     │                            │
        │     └─────────────┬──────────────┘
        │                   ▼
        │            bazaar_core
        │      shops · trade · membership
        │      SSU + tribe governance
        │                   │
        │        ┌──────────┴───────────┐
        │        ▼                      ▼
        │  bazaar_mission        bazaar_shop_ops
        │  Mission (MIS)         shop execution /
        │  shop type             moderation / close
        │        │
        └────────┴──────┐
                        ▼
                  bazaar_economy
             Advanced tier: token
             ledger, EVE⇄token
             exchange, vault
```

`bazaar_economy` depends directly on **both** `bazaar_core` and `bazaar_mission` (its
ledger-based shop ops need mission escrow types); `bazaar_shop_ops` and `bazaar_core`
itself both also depend on `dapp_hub` + `shared_widgets` — those edges are omitted above
since they'd just clutter the diagram with lines already implied by the layering.
`bazaar_shop_ops` exists purely to keep `bazaar_core` under Sui's package size limit;
nothing depends on it.

## Taxation layers

Every trade splits its gross price four ways on-chain, capped so the four cuts can never
exceed the full price:

```
      A TRADE (WTS / WTB / Direct-Exchange)
           buyer pays the gross price
                        │
                        ▼
compute_taxes(gross, ssu_bps, tribe_bps, dapp_bps)
seller_net + ssu_tax + tribe_tax + dapp_tax = gross
 (all three bps together capped at 10000 = 100%)
                        │
      ┬─────────────────┼──────────────────────┬──────────────────────┬
      ▼                 ▼                      ▼                      ▼
┌──────────┐   ┌─────────────────┐   ┌───────────────────┐   ┌─────────────────┐
│ seller   │   │ SSUGovernance   │   │ TribeGovernance   │   │ DAppTaxWallet   │
│ (net)    │   │ .tax_wallet     │   │ tax pot           │   │ (global)        │
└──────────┘   │ per-SSU,        │   │ per-tribe,        │   │ per-bazaar-     │
               │ per-role %      │   │ per-role %        │   │ type % (or      │
               │ (owner-set)     │   │ (leader-set,      │   │ global          │
               └─────────────────┘   │ Easy tribes       │   │ fallback)       │
                                     │ only)             │   └─────────────────┘
                                     └───────────────────┘

Flat (non-%) fees also land in DAppTaxWallet, not split: ssu_registration ·
tribe_join · easy_tribe_creation · advanced_tribe_creation.

Advanced tribes additionally run a TribeVault — EVE backing the internal
tribe-token ⇄ EVE exchange, separate from trade tax, gated by a multisig
WithdrawalBoard (24h timelock, 72h expiry). A legacy WtbEscrowPool exists
per-SSU but is inactive for new trades (residual-drain only, superseded 2025).
```

Per-role tax (both the SSU and tribe cuts) is configurable per governance rank
(0–7, see the role table below), not a single flat SSU/tribe rate — an SSU or tribe
owner can charge Members a different `%` than Strangers.

## Governance & roles

Three independent authority layers. DApp sits above both trees via the tax rates and
fees it sets — it never touches tribe or SSU objects directly. Tribe roles can reach
*down* into their member SSUs (force-close shops, tribe-wide bans); SSU roles are
self-contained and never reach up into tribe or DApp settings.

```
                    DAppOwnerCap  (single cap, no admin tier)
          sets global/per-type tax %, fees, relay URL, mission fee/hr
               FE: DAppGovernancePanel -> Tribes / Wallet / Tribe Fees
                                    │
     (funds/rates apply to both trees -- no direct object access)
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
TRIBE  (Easy / Advanced only)          SSU  (every SSU)
─────────────────────────────          ─────────────────
TribeLeaderCap       rank 7            SSUOwnerCap        rank 7
TribeSuperAdminCap   rank 6            SSUSuperAdminCap   rank 6
TribeAdminCap        rank 5            SSUAdminCap        rank 5
TribeModCap          rank 4            SSUModCap          rank 4
(any rank can unban; higher ranks include all lower-rank powers)
```

**Tribe roles** (Easy/Advanced tribes only; FE = `TribeGovernancePanel`):

| Rank | Cap | Can do | FE tab |
|---|---|---|---|
| 7 | `TribeLeaderCap` | Deactivate tribe · add/remove SSU · withdraw tribe tax · grant SuperAdmin · set per-role tribe tax · ban as leader | superadmin: Tax Rates, Tribe Wallet¹, Network Members, Assets, TX Log, Reserve Vault, Settings, Roles, Cap Revocation |
| 6 | `TribeSuperAdminCap` | Withdraw tax as SA · grant/revoke Admin · ban as SA · **force-close ANY shop in the tribe** (reaches into member SSUs) | superadmin (same tab, rank-gated) |
| 5 | `TribeAdminCap` | Grant/revoke Mod · ban as admin · set store visibility · force-close shop | admin: Applications, Storage Apps, Announcements, Shop Limits |
| 4 | `TribeModCap` | Ban as mod · force-close shop | moderation |

**SSU roles** (every SSU, regardless of tribe; FE = `SSUGovernancePanel`):

| Rank | Cap | Can do | FE tab |
|---|---|---|---|
| 7 | `SSUOwnerCap` | Per-role tax · shop config/limits · issue SSU SuperAdmin cap · mission fee · unfreeze | superadmin: Tax Settings, Wallets, Currency Log, Item Log, Shop & Storage, Widgets² |
| 6 | `SSUSuperAdminCap` | Freeze/unfreeze SSU · shop config/limits as SA · force-close shop | superadmin (same tab, rank-gated) |
| 5 | `SSUAdminCap` | Ban/unban · force-close shop (no tax/config authority) | admin |
| 4 | `SSUModCap` | Ban/unban · force-close shop | moderation |

Both panels gate `moderation` on any cap (rank ≥ 4) and `admin`/`superadmin` on the matching rank.

¹ hidden on Advanced tribes (the token ledger replaces the plain EVE wallet view).
² NoTribe-only subtab. A `NoTribe` SSU has no `TribeGovernance` object at all — it
skips the tribe layer entirely and answers only to its own SSU roles + the DApp-level
per-type tax, so it's a 2-layer tax stack instead of Easy/Advanced's 3-layer one.

Both role ladders reuse the same underlying 0–7 rank scale (`Stranger · Unfriendly ·
Member · Friendly · Moderator · Admin · SuperAdmin · Owner` — `dapp_hub::role_types`)
for registry-based tab gating, even though the actual permissions above are enforced by
possessing the matching capability object, not just having a high registry rank.

## Repository layout

| Path | What |
|------|------|
| `DappHub/`, `BazaarCore/`, `BazaarMission/`, `BazaarEconomy/`, `BazaarShopOps/`, `SharedWidgets/` | Sui Move packages (sources + tests). |
| `EveCoinTypeStub/`, `WorldStub/`, `tests/` | Move build/test stubs + integration tests. |
| `bazaar-frontend/` | React/TS monorepo — `apps/*` (4 apps) + `packages/shared` + bundled `godot/` runtime + `netlify-functions/` (gas sponsorship). |
| `bazaar-godot/` | Godot 4.x source project for the in-world client, including the built web export. |
| `multiplayer-relay/` | Hostable WebSocket broadcast relay for presence + chat. |
| `docs/` | Architecture, deployment, and multiplayer guides. |

## Quick start (frontend)

```bash
cd bazaar-frontend
npm install
cp apps/advanced/.env.example apps/advanced/.env   # repeat per app; edit if you redeploy
npm run dev:dapphub     # or dev:notribe / dev:easy / dev:advanced
```

Apps run at ports 5173–5176. Open with an SSU id, e.g. `http://localhost:5173/?ssuId=0x...`.

Build everything for production:

```bash
npm run build:all
```

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the multi-app Netlify packaging recipe,
gas-sponsorship setup, and the Sui publish/rotation flow.

## Move contracts

```bash
# from each package dir (DappHub / BazaarCore / BazaarMission / BazaarEconomy / BazaarShopOps / SharedWidgets):
sui move build
sui move test
```

## Deploying to Sui testnet

Full recipe with exact commands: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. In order:

1. **Publish the six packages**, in dependency order (see the [graph above](#package-dependency-graph)):
   `dapp_hub` → `shared_widgets` → `bazaar_core` → `bazaar_mission` → `bazaar_economy` → `bazaar_shop_ops`.
   Update each downstream package's `Move.toml` dependency address to the freshly-published id as you go.
2. **Claim the DApp owner cap to your own wallet via a CLI PTB — do this immediately
   after publish.** See the warning below; this is the step people forget, and the
   frontend's claim button is not a reliable substitute (see the caveat there).
3. From the `DAppOwnerCap` wallet: bootstrap the global trade registry and call
   `init_bazaar_news_board` (one-shot) — do this **before** moving the cap anywhere else.
4. Put the new package + shared-object IDs into
   `bazaar-frontend/packages/shared/constants/index.ts` and each app's `.env`
   (copy from `.env.example`).
5. Everything below the DApp layer is self-serve: each SSU owner bootstraps their own SSU
   (and, for Advanced tribes, their collateral/WTB pools) from DappHub — that's the SSU
   owner's job, not the deployer's.
6. *(Optional)* **Cover your players' gas.** Set up gas sponsorship with your own
   dedicated hot wallet, funded with testnet SUI — not the deployer/owner wallet from
   steps above. See [§5 of docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#5-gas-sponsorship--covering-your-players-gas-optional).
   Skip this and players just pay their own testnet gas.

> [!IMPORTANT]
> **The DApp owner is not auto-detected from your deployment — two separate things need
> your own wallet address, or the dApp keeps "belonging" to the original maintainer's
> testnet wallet:**
>
> 1. **`DAppOwnerCap` ownership.** Publish creates exactly one `DAppOwnerCap`, sealed
>    inside a shared `DAppOwnerClaimBox` (`dapp_hub::dapp_governance`). Claiming it is
>    genuinely first-come-first-served on-chain and **not** hardcoded in Move — but
>    claim it via a **CLI PTB right after publish** (exact command in
>    [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#dapp-ownership)), which is what every past
>    deploy of this project has actually done. There *is* a "Claim Ownership" button in
>    the frontend wallet bar, but it only enables once the connecting wallet already
>    owns a registered SSU's `OwnerCap` — which won't be true immediately after a fresh
>    publish — so don't rely on it as your first step; see the doc for the full caveat.
>    Either way, if you route the cap manually, use **your own** address, not one you
>    find in old deploy notes/scripts.
> 2. **`VITE_DAPPHUB_OWNER_ADDRESS`** (each app's `.env`) — the wallet auto-equipped
>    with a cosmetic "red-tribal" skin. It has no bearing on actual permissions (those
>    are all capability-gated on-chain, per the [roles diagram above](#governance--roles)) —
>    it's purely cosmetic. Set it in your `.env` to your own owner wallet; if you leave
>    it unset, nobody in your deployment gets the cosmetic (harmless, but pointless) —
>    it never falls back to any wallet baked into this repo.

## Multiplayer

Presence and chat ride a small stateless WebSocket relay. Run it locally:

```bash
cd multiplayer-relay
npm install
PORT=8080 npm start
# point the client at it: localStorage.setItem("multiplayerServerUrl", "ws://localhost:8080")
```

For production, host the relay anywhere that gives a `wss://` URL and set it via the on-chain
widget config. Full details in **[docs/MULTIPLAYER.md](docs/MULTIPLAYER.md)**.

## Tech stack

React 18 · TypeScript 5 · Vite 5 · `@mysten/sui` · `@evefrontier/dapp-kit` · TanStack Query · Sui Move · Godot 4.x · Node `ws` · Netlify Functions.

## License

**PolyForm Noncommercial License 1.0.0** — free to use, modify, and share for any
**noncommercial** purpose; commercial use is not permitted. See [LICENSE](LICENSE).
