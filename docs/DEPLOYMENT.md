# Deployment

Four things ship independently: the **Move contracts** (Sui), the **frontend** (static
hosting), **gas sponsorship** (a Netlify Function, optional), and the **multiplayer
relay** (a small Node service). Multiplayer hosting is in [MULTIPLAYER.md](MULTIPLAYER.md).

## 1. Publish the Move contracts (Sui)

Publish the six packages in dependency order, updating each downstream package's
`Move.toml` dependency address to the freshly-published id as you go:

```
1) dapp_hub   2) shared_widgets   3) bazaar_core
4) bazaar_mission   5) bazaar_economy   6) bazaar_shop_ops
```

Then run the post-publish setup:

- Route the owner capability + tax-deposit caps + `ShopOpsCap`, and create the v1
  ceremony objects (anchor registry + announcements), in one PTB.
- **Get `DAppOwnerCap` into the hands of the wallet you actually intend to use — see
  "DApp ownership" below, this is not automatic.**
- Bootstrap the global trade registry.
- Call `init_bazaar_news_board` (one-shot) from the wallet that holds `DAppOwnerCap` to
  create the Bazaar News board. *Tip: do this before transferring `DAppOwnerCap` away
  from the deployer, or call it later from whichever wallet holds the cap.*

A fresh publish rotates all package and shared-object IDs. Update the frontend config to
match (next section). Per-SSU objects are bootstrapped by each SSU owner from DappHub.

### DApp ownership

`dapp_hub::dapp_governance::init` mints exactly one `DAppOwnerCap` and seals it inside a
shared `DAppOwnerClaimBox`. The underlying Move call is simple and permissionless —
`claim_ownership(claim_box, ctx) -> DAppOwnerCap` takes no recipient argument and checks
nothing about the caller — but there are two different ways to invoke it, and only one
is proven in practice on this project:

- **CLI PTB (recommended — this is what every past deploy of this project actually
  did).** Right after publish, from the wallet you want to administer with:
  ```bash
  sui client ptb \
    --move-call <DAPP_HUB_PACKAGE_ID>::dapp_governance::claim_ownership @<CLAIM_BOX_ID> \
    --assign cap \
    --transfer-objects "[cap]" @<YOUR_WALLET_ADDRESS>
  ```
  Replace `<YOUR_WALLET_ADDRESS>` with your own address — **do not reuse any address you
  find in committed deploy notes/records**, those all point at the original maintainer's
  wallet. This is exactly what `buildClaimOwnership()` in
  `packages/shared/tx/dapp_hub/governance-tx.ts` does under the hood (same two calls),
  just via the CLI instead of a browser wallet.
- **The frontend's "Claim Ownership" modal exists but has an extra precondition worth
  knowing about before you rely on it.** `ClaimOwnerModal.tsx` only enables its Claim
  button once the connected wallet already owns an SSU `OwnerCap` (it checks
  `resolveSSUOwnerCap` against the configured `SSU_OBJECT_ID`) — a constraint that isn't
  in the Move contract at all, only in this UI. Right after a fresh publish no SSU is
  registered yet, so the button sits disabled with "You are not the owner of this SSU."
  It becomes usable once you (or someone) have registered at least one SSU under the
  claiming wallet. The modal's copy also states that claiming "will also authorize the
  BazarAuth extension" — the actual transaction it submits (`claim_ownership` +
  `transferObjects`, nothing else) doesn't do that, per a comment in the same file
  ("Extension authorization is handled at bootstrap time via
  `ssu_bootstrap::bootstrap_ssu_objects`"). Treat the CLI path above as authoritative
  until this UI is audited.

Separately, `bazaar-frontend/packages/shared/data/playerSkins.ts` exports
`DAPPHUB_OWNER_ADDRESS` (now overridable via `VITE_DAPPHUB_OWNER_ADDRESS`, see your
`.env.example`) — a wallet address that auto-equips a cosmetic "red-tribal" skin for
whoever connects with it in-world. It's purely cosmetic (all real permissions are
capability-gated on-chain, not address-compared, per the roles diagram in the root
README) — set it to your own address if you want the cosmetic to follow your
deployment's owner.

## 2. Configure the frontend

Each app reads IDs from its `.env` (see `apps/*/.env.example`). After a publish, set the
new package + shared-object IDs in:

- `bazaar-frontend/packages/shared/constants/index.ts` (hardcoded fallbacks), and
- `bazaar-frontend/apps/*/.env` (runtime overrides).

The defining/"original" package IDs (used for struct-type filters and event queries) are
the **first** publish IDs and only change on a fresh publish.

## 3. Build & host the frontend (multi-app, one Godot client)

The four apps deploy under sub-paths sharing a single Godot client. Build each app with a
matching base path and a shared Godot URL, then assemble:

```bash
cd bazaar-frontend
rm -rf netlify-deploy
for app in dapphub notribe easy advanced; do
  (cd apps/$app && MSYS_NO_PATHCONV=1 VITE_GODOT_BASE_URL=/godot/ npx vite build --base=/$app/)
done
mkdir -p netlify-deploy
for app in dapphub notribe easy advanced; do
  cp -r apps/$app/dist netlify-deploy/$app
  rm -rf netlify-deploy/$app/godot
done
cp -r godot netlify-deploy/godot
cat > netlify-deploy/_redirects <<'EOF'
/                /dapphub/index.html   200
/dapphub/*       /dapphub/index.html   200
/notribe/*       /notribe/index.html   200
/easy/*          /easy/index.html      200
/advanced/*      /advanced/index.html  200
/*               /dapphub/index.html   200
EOF
```

`netlify-deploy/` is a generated build folder (gitignored, not checked in) — regenerate
it on every deploy. Upload it to any static host (e.g. `netlify deploy --prod` from
`bazaar-frontend/`, per `netlify.toml`: `publish = "netlify-deploy"`). The root path
serves DappHub; `/notribe/`, `/easy/`, `/advanced/` serve the player tiers.

Notes:
- `--base=/<app>/` is required so assets resolve under the sub-path (no bare `/assets/`).
- `VITE_GODOT_BASE_URL=/godot/` keeps a single shared Godot copy instead of one per app.
- `MSYS_NO_PATHCONV=1` avoids Git-Bash path mangling on Windows.

## 4. Godot client

The web export is checked into `bazaar-godot/` (source of truth) and `bazaar-frontend/godot/`
(the copy the apps actually bundle). To update it: re-export the `bazaar-godot/` project
(HTML5/Web preset), then copy the refreshed `Bazaar.{pck,wasm,js,html}` + audio worklets
into `bazaar-frontend/godot/`, and rebuild the frontend.

## 5. Gas sponsorship — covering your players' gas (optional)

`bazaar-frontend/netlify-functions/gas-sponsor.mts` lets players sign transactions
without holding any SUI themselves: the client sends the unsigned transaction kind, the
function validates it (fail-closed command-kind allowlist, recursive GasCoin-theft
detection, package allowlist, `TransferObjects` only-to-sender) and co-signs it with a
**sponsor hot wallet** before the player's own wallet signs. If this is unset or
disabled, the frontend silently falls back to the player paying their own gas — nothing
breaks if you skip this section.

To turn it on for your own deployment:

1. **Generate a dedicated hot wallet — do not reuse your deployer or personal wallet.**
   This wallet's private key lives in Netlify's environment (not your machine, not the
   repo), and it autonomously co-signs whatever the fail-closed validation lets through,
   so keep it separate and only ever fund it with disposable testnet SUI:
   ```bash
   sui keytool generate ed25519
   ```
   This prints a new address and a bech32 `suiprivkey1...` — note both.
2. **Fund that address with testnet SUI** — from the [testnet faucet](https://docs.sui.io/guides/developer/getting-started/get-coins)
   or by transferring from any wallet you control. It pays every sponsored player's gas
   (~0.003 SUI/tx per the existing budget comment in the function source), so fund it
   with however much testnet traffic you expect, and plan to top it up periodically —
   nothing here auto-refills it.
3. **Set these in the Netlify UI** (Site configuration → Environment variables) —
   **never** in a committed file or `.env`:
   - `GAS_SPONSOR_PRIVATE_KEY` — the `suiprivkey1...` from step 1.
   - `GAS_SPONSOR_ENABLED` — kill switch; set to `false` at any time to instantly stop
     sponsoring (falls back to user-paid) without redeploying or touching the key.
4. Redeploy the Netlify site so the function picks up the new environment variables.
   Sponsorship then applies automatically — there's nothing to change on the frontend
   build side; `installGasSponsorship()` already wraps every transaction with a
   fallback to user-paid if the sponsor call fails or is disabled.

Monitor the hot wallet's balance yourself (e.g. `sui client balance <address>`) — there's
no built-in low-balance alert. If it runs dry, the fail-closed design just means players
transparently fall back to paying their own testnet gas; nothing gets stuck.
