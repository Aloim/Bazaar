/**
 * @bazaar/shared/constants — Package IDs, shared object IDs, and config.
 *
 * All on-chain addresses and object IDs referenced by TX builders and hooks.
 * Values are populated after deployment (Phase 3+).
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

/** Testnet deployment — 2026-06-26 V40 cascade (full FRESH publish, 6-package layout; orphans all V39 state). V40 = the exact V39 source re-published against the NEW EVE Frontier world (0x8b8a46ed…) + NEW EVE coin (0xac361aa5…) after EVE Frontier wiped + redeployed their testnet world on 2026-06-25 (the old world 0x28b497… + old EVE 0x2a66a89b… are dead). World/EVE ABI verified-compatible — V40 is an id swap, not a code rewrite. Carries the full V39 payload: the Gas Optimization program (Phase 1 A1–A8 hot-path wins + Phase 2 B1/GAS-06 ssu_tax-write drop + tribe_gov &mut→& on the 4 Advanced ledger/mission entries + Phase 3 C1–C7 storage-shape reshapes) + the V38 structure: bazaar_shop_ops (6th package; ShopOpsCap-gated shop_ops_guarded wrappers) + dormant UCv2 Phase-2 reclaim infra (ReclaimRegistry + CeremonyGate created CLOSED in PTB #1; FE gated OFF via empty VITE_RECLAIM_REGISTRY_ID). The GAS-06 tribe_gov mutability flip is automatic — builders use tx.object() (ABI-resolved), so retargeting PACKAGE_IDS to the `&TribeGovernance` signatures passes tribe_gov immutable with no builder edit. MissionRegistry + BazaarNewsBoard + ceremony/reclaim objects created in cap-routing PTB #1; TradeRegistry (a bazaar_mission object) in PTB #2. DAppOwnerCap (0x82543964...074c12) + 6 UpgradeCaps routed to user Frontier wallet 0xa7b4d815...f77. ORIGINAL_PACKAGE_ID anchors reset to V40 fresh-publish IDs per Run-#9 invariant 1 (fresh publish → original == published-at); trade events anchor BAZAAR_MISSION_ORIGINAL_PACKAGE_ID. Record: Documentation/reports/deployment-orchestrator/V40-deployment-record.md. */
export const PACKAGE_IDS = {
  DAPP_HUB:       "0x931f71c0c8f839b692b2cf8b6512e505ad07c133679d85b1d2741e8e636bc63a",
  BAZAAR_CORE:    "0xe410963aa069ae1e8b2114984787201fcf50ffc9d9a0b5ccb59148b86e88f911",
  BAZAAR_ECONOMY: "0x51c61a3647a67d3970b568882292709f1178275ec6d74fec38bb83667eeb7d24",
  SHARED_WIDGETS: "0xadcf3f71ffd909b55aeb40d9ee7b88c2cfd7db9d8e1304a008fa9274c2d19114",
  // V33: Mission (MIS) modules split into their own package. V35: also hosts the
  // size-split leaf-consumers trade/announcement_proxy/widget_governance/
  // ssu_lifecycle/stranger_registration. mission_fees stays in bazaar_core.
  BAZAAR_MISSION: "0xb2f01c1df61c8ffbcd48273cb499239a513c60c560e12a64743164c350224a89",
  // V38: bazaar_shop_ops split — the 19 shop-execution + moderation + close entries
  // (shop_ops_wts/wtb/de, shop_moderation[_tribe], bazar_close, bazar_admin_drain)
  // moved out of bazaar_core (102,400 B size relief). Each moved entry gained a
  // `cap_store: &ShopOpsCapStore` arg immediately before the clock. EMPTY until the
  // V38 fresh-publish cascade rotates the real id in (the FE ships dormant until then).
  BAZAAR_SHOP_OPS: (import.meta.env.VITE_BAZAAR_SHOP_OPS_PACKAGE_ID as string | undefined) ?? "",
} as const;

/**
 * Retained alias pointing at the current DAPP_HUB package ID.
 * Updated to V35 ID at V35 fresh-publish (2026-06-10).
 */
export const DAPP_HUB_V2 = "0x931f71c0c8f839b692b2cf8b6512e505ad07c133679d85b1d2741e8e636bc63a";

/** Testnet shared object IDs — 2026-06-26 V40 (full FRESH publish, 6-package layout; orphans V39; new world + EVE). */
export const SHARED_OBJECTS = {
  GOVERNANCE_CONFIG:  "0x7bb7288806f96e4da366fef49d49b19808ff4acf7a99fb9182be8f72b9b37dba",
  TAX_WALLET:         "0xaf05fdc6815699cc02941c55351ed1fdac957534edd07878833d2234533f3a89",
  TRIBE_REGISTRY:     "0x008c22ed95160eb9cb128bc6afd43c134afc13a5667c2fd271c81d054849538f",
  SSU_REGISTRY:       "0x8bd4609ccdaf7f3dc32cea12f7a451ab7edfd0212adcbd3ae57f3a42439aabe0",
  REQUEST_QUEUE:      "0xb71c797d73fc8cb54721598bf31213eac3d78d174ccdbe9224392a13ada62839",
  // V31 (registration/creation fees): the separate DApp escrow wallet that holds
  // pending tribe-join fees until accept (→ tax wallet) / reject (→ refund).
  ESCROW_WALLET:      "0xd63a4c3a979bfd63a24cd4ddff262057ae0766b282c1e6fe1bb8cd6d82266d5a",
  // V31 (BazaarBeacon): the shared Bazaar News board (news + polls + comments).
  // Created in cap-routing PTB #1 (init_bazaar_news_board) — live, no user step.
  BAZAAR_NEWS_BOARD:  "0x8585945549394c6faa5f86ba68cb9ac47548aa7953750d0ac4c01f8459dc8539",
  TICKET_BOARD:       "0xb0700f86fd258b0ac87741e65f744c116af73db322174413687f9f4c203eeecb",
  BAZAR_REGISTRY:     "0x635fd215f67ba6f3871359430f9bf64aac974ca089f524ec042a280251be1788",
  BAZAAR_CORE_ADMIN:  "0x637f12eda2ae3dae0a0e1e77ddcdc24555833d5527cc80e461e80fcbca1d313b",
  // V35: TradeRegistry is created by bazaar_mission::trade::bootstrap_trade_registry
  // (trade module relocated in the size split; PTB #2 retargeted).
  TRADE_REGISTRY:     "0x7611616a3594af024af06d91650909d9f0f0e1db7b563b3aece01a0b1e9259e9",
  // Mission (MIS) shop type — the shared MissionRegistry (holds MissionShop DOFs).
  // Created in cap-routing PTB #1 (bazaar_mission::mission::bootstrap_mission_registry).
  MISSION_REGISTRY:   "0xc3a9c10b576958bd93d4f04c3757c248778ba56aa434c9da07aca6e4d38dae0f",
  ECONOMY_CAP_STORE:  "0xa3956731aa23e7b50c897d7fc084155b3a810f0db4171ce8bc45a16e77b6b34a",
  TAX_DEPOSIT_MINT_REGISTRY: "0xb894e25f0de363a0ce10fa6be2f71e290618c2a925db1b7f4adfaa94baf1fdd5",
  /** OwnerClaimBox shared object ID — V35 testnet DAppHub global singleton (DAppOwnerClaimBox). Now empty post-cap-routing PTB (DAppOwnerCap 0x4e9cbe48...4881 transferred to user wallet 0xa7b4d815...f77). */
  CLAIM_BOX_ID: "0x61b886e886433659ec6adb047b0a80361125cf3202b97e5c9aaff2c7b99d94a9",
  // V38: the bazaar_shop_ops ShopOpsCapStore — a single global shared object holding
  // the ShopOpsCap that the 19 moved entries borrow internally. Threaded into every
  // moved entry's arg vector immediately before the clock (like BAZAR_REGISTRY, a
  // single global, so builders read it from here directly — no per-call param).
  // EMPTY until the V38 cascade creates it + rotates VITE_SHOP_OPS_CAP_STORE_ID in.
  SHOP_OPS_CAP_STORE: (import.meta.env.VITE_SHOP_OPS_CAP_STORE_ID as string | undefined) ?? "",
} as const;

/**
 * EVE coin type — Frontier's native currency. Used as payment in all shop/trade/vault TX builders.
 * IMPORTANT: This is a Coin<EVE> type string, NOT the SUI gas coin. All payment PTBs must split
 * from a wallet-owned Coin<EVE> object, not from tx.gas.
 *
 * EVE coin published-at: 0xac361aa5ceb726bd974f885c9dea9e55dc9bc98fa1f5731c5965a810707bf0b8
 */
export const EVE_COIN_TYPE =
  "0xac361aa5ceb726bd974f885c9dea9e55dc9bc98fa1f5731c5965a810707bf0b8::EVE::EVE";

/** Sui network configuration. */
export const NETWORK = {
  RPC_URL: "https://api.zan.top/public/sui-testnet",
  CHAIN:   "sui:testnet",
} as const;

/** Canonical public host for cross-app URL display. Override per environment
 *  via `VITE_BAZAAR_PUBLIC_HOST` (e.g. "https://bazaar.app"). Default targets
 *  the Netlify dev deploy. */
const DEFAULT_BAZAAR_PUBLIC_HOST = "https://devbazaarfrontier.netlify.app";

function bazaarPublicHost(): string {
  const fromEnv = (import.meta as ImportMeta).env?.VITE_BAZAAR_PUBLIC_HOST as string | undefined;
  const raw = (fromEnv && fromEnv.trim()) || DEFAULT_BAZAAR_PUBLIC_HOST;
  return raw.replace(/\/+$/, "");
}

/** Returns the canonical entry URL for a bazaar type, formatted as
 *  `<host>/<app>/?ssuId=<SSUID>/` where `<host>` resolves from
 *  `VITE_BAZAAR_PUBLIC_HOST` (or the Netlify dev deploy as fallback).
 *
 *  NOTE: a trailing `/` is appended after the ssuId. The EVE Frontier in-game
 *  SSU "dApp URL" field requires the configured URL to end in `/` (without it
 *  the in-game browser fails to load the instance). The trailing slash is
 *  stripped back off when the app parses the param — see `SSU_OBJECT_ID`. */
export function buildBazaarAppUrl(
  bazaarType: "notribe" | "easy" | "advanced",
  ssuId: string,
): string {
  const trimmed = ssuId.trim();
  const path =
    bazaarType === "notribe" ? "notribe"
    : bazaarType === "easy"   ? "easy"
    :                            "advanced";
  return `${bazaarPublicHost()}/${path}/?ssuId=${trimmed}/`;
}

/** Tax rate limits matching on-chain governance constraints. */
export const TAX_LIMITS = {
  MAX_RATE_BPS: 5000,
  MIN_RATE_BPS: 0,
} as const;

/** Move module names — used when building PTB move calls. */
export const MODULES = {
  DAPP_GOVERNANCE:     "dapp_governance",
  TAX_WALLET:          "tax_wallet",
  TRIBE_REGISTRY:      "tribe_registry",
  SSU_REGISTRY:        "ssu_registry",
  REGISTRATION:        "registration",
  REGISTRATION_HELPERS: "registration_helpers",  // V16 sweep B4: separate DappHub module (OS-48 Path B)
  TICKETS:             "tickets",
  BAZAR:               "bazar",
  BAZAR_FREE:          "bazar_free",      // V26 D8: create_free_shop + create_free_shop_partial relocated from `bazar`
  SHOP_MODERATION:       "shop_moderation",
  SHOP_MODERATION_TRIBE: "shop_moderation_tribe",  // Phase 3.2 tribe-cap dispatchers
  SHOP_OPS:              "shop_ops",        // BazaarEconomy shim (deduct/add_listing_quantity)
  SHOP_OPS_WTS:        "shop_ops_wts",    // R6.7.6: wts_buy_notribe / wts_buy_tribe
  SHOP_OPS_WTB:        "shop_ops_wtb",    // R6.7.6: wtb_fill_notribe / wtb_fill_tribe
  SHOP_OPS_DE:         "shop_ops_de",     // R6.7.6: de_exchange_notribe/tribe + free_claim
  MEMBERSHIP:          "membership",
  SSU_GOVERNANCE:      "ssu_governance",
  SSU_GOVERNANCE_CAPS: "ssu_governance_caps",
  SSU_ROLE_TAX_ADMIN:  "ssu_role_tax_admin",   // V16 Session 3B: per-role SSU tax setters/getters
  TRIBE_GOVERNANCE:    "tribe_governance",
  TRIBE_GOVERNANCE_CAPS: "tribe_governance_caps", // Phase 6 W4: grant_tribe_* + V35 timed-ban entries live here, NOT in tribe_governance
  TRIBE_ROLE_TAX_ADMIN: "tribe_role_tax_admin", // V16 Session 3B: per-role tribe tax setters/getters
  USER_STORAGE:        "user_storage",
  TRADE:               "trade",
  WTB_ESCROW_POOL:     "wtb_escrow_pool",
  QUICKTRADE_VAULT:    "quicktrade_vault",
  BAZAAR_CORE_ADMIN:   "bazaar_core_admin",
  // ── BazaarEconomy Modules ──────────────────────────────────
  ECONOMY_CAP_STORE:   "economy_cap_store",
  TRIBE_TOKEN_LEDGER:  "tribe_token_ledger",
  TRIBE_VAULT:         "tribe_vault",
  TRIBE_EXCHANGE:      "tribe_exchange",
  VAULT_WITHDRAWAL:    "vault_withdrawal",
  ECONOMY_GOVERNANCE:  "economy_governance",
  LEDGER_SHOP_OPS:     "ledger_shop_ops",
  LEDGER_SHOP_OPS_SSU_ADMIN: "ledger_shop_ops_ssu_admin",   // V26 D8: SSU credit admin extracted from ledger_shop_ops
  ADVANCED_DIRECT_TRADE: "advanced_direct_trade",            // V26 D5: per-tribe Advanced DirectTrade registry + entries
  MINT_BURN_QUEUE:     "mint_burn_queue",  // V16: replaces retired economy_governance::mint_supply / burn_tokens with 24h-wait queue
  TRIBE_TOKEN_WTB_POOL: "tribe_token_wtb_pool",  // V21: Advanced WTB tribe-token escrow pool (mirror of bazaar_core::wtb_escrow_pool)
  WTB_POOL_OPS:        "wtb_pool_ops",     // V21: Advanced WTB create + refund wrapper around bazar::create_wtb_shop
  SSU_ECONOMY_INIT:    "ssu_economy_init", // V27 Wave 2: per-SSU init_ssu_economy (closes Issues 7+8)
  BAZAR_LIFECYCLE:     "bazar_lifecycle",  // V27 Wave 3-A: auto_deactivate_if_drained + try_expire_shop
  // ── Mission (MIS) shop type (V33 — split into bazaar_mission package) ─────────────
  MISSION:             "mission",           // bazaar_mission::mission (create_mission_notribe/easy + registry)
  MISSION_COMPLETE:    "mission_complete",  // bazaar_mission::mission_complete (complete/confirm/reject)
  MISSION_LIFECYCLE:   "mission_lifecycle", // bazaar_mission::mission_lifecycle (accept/expire/cancel/collect-proof)
  MISSION_ADMIN_DRAIN: "mission_admin_drain",// bazaar_mission::mission_admin_drain (ceremony force-cancel — EVE path)
  MISSION_LEDGER_OPS:  "mission_ledger_ops",// bazaar_economy::mission_ledger_ops (Advanced token twin)
  // ── UpdateCeremonyPlan v1 (outgoing-additive upgrade) ──────
  ANNOUNCEMENTS:           "announcements",          // dapp_hub::announcements (DAppAnnouncements + 4 admin entries)
  ANCHOR_REGISTRY:         "anchor_registry",        // dapp_hub::anchor_registry (post_anchor + view fns)
  // ── UpdateCeremony V2 (Phase 2) reclaim/restore (lands at the V38 cascade) ──
  RECLAIM_REGISTRY:        "reclaim_registry",       // dapp_hub::reclaim_registry (populate/prune/consume + tribe-remap)
  CEREMONY_GATE:           "ceremony_gate",          // dapp_hub::ceremony_gate (legacy-withdraw + mint-page gate)
  RECLAIM_SSU:             "reclaim_ssu",            // bazaar_mission::reclaim_ssu (reclaim_ssu_shell/_restore)
  RECLAIM_TRIBE:           "reclaim_tribe",          // bazaar_economy::reclaim_tribe (reclaim_tribe/_mint_page/_restore)
  TRIBE_ADMIN_DRAIN:       "tribe_admin_drain",      // bazaar_core::tribe_admin_drain (withdraw_legacy_tribe_gov_eve)
  BAZAAR_NEWS:             "bazaar_news",            // V31 dapp_hub::bazaar_news (BazaarBeacon: news + poll + comments)
  BAZAR_ADMIN_DRAIN:       "bazar_admin_drain",      // bazaar_core::bazar_admin_drain (close_all_shops_batch)
  SSU_ADMIN_DRAIN:         "ssu_admin_drain",        // bazaar_core::ssu_admin_drain (drain_ssu_eve + withdraw_legacy_ssu_eve)
  VAULT_WITHDRAWAL_DRAIN:  "vault_withdrawal_drain", // bazaar_economy::vault_withdrawal_drain (cancel_vault_withdrawals_batch)
  // ── V41 SSU depreciation / dead-bazaar prune ──────────────
  SSU_DEPRECIATION:          "ssu_depreciation",          // bazaar_core::ssu_depreciation (mark_ssu_revealed/mark_ssu_depreciated)
  SSU_DEPRECIATION_OPS:      "ssu_depreciation_ops",      // bazaar_shop_ops::ssu_depreciation_ops (prune_depreciated_shops_page)
  SSU_DEPRECIATION_MISSIONS: "ssu_depreciation_missions", // bazaar_mission::ssu_depreciation_missions (3 prune entries)
  SSU_DEPRECIATION_ECONOMY:  "ssu_depreciation_economy",  // bazaar_economy::ssu_depreciation_economy (4 prune entries)
} as const;

// ── Bazar1 flat constants (OverhaulPlan1 R2 port) ─────────────────────────────
// Aliases and single-package flat exports consumed by Bazar1 hooks.
// PACKAGE_ID / ORIGINAL_PACKAGE_ID mirror Bazar1's VITE_PACKAGE_ID convention
// (single-package app); hooks ported from Bazar1 use these names directly.

// Current (upgradeable) package ID — use for moveCall targets.
export const PACKAGE_ID = (import.meta.env.VITE_PACKAGE_ID as string | undefined)
  ?? PACKAGE_IDS.BAZAAR_CORE;

// Defining (original) package ID — use for type strings (Coin<T>, event filters).
// Sui anchors type strings to the first defining package even after upgrades.
// Empty fallback (NOT PACKAGE_ID): hardcoding latest would silently mask misconfig.
// See Documentation/API/SuiCallRegistry.md § Package ID anchoring for the env-var convention.
const _origPkgId = import.meta.env.VITE_ORIGINAL_PACKAGE_ID as string | undefined;
if (!_origPkgId) {
  console.error(
    "[constants] VITE_ORIGINAL_PACKAGE_ID is not set — type-based RPC queries will fail. " +
    "Set it to the FIRST-PUBLISH package ID (never updated on upgrade; only on fresh publish). " +
    "See Documentation/API/SuiCallRegistry.md § Package ID anchoring."
  );
}
export const ORIGINAL_PACKAGE_ID = _origPkgId ?? "";

// Defining (original) BazaarEconomy package ID — use for type strings + event filters.
// Analogous to ORIGINAL_PACKAGE_ID for BazaarCore: anchored to V1 publish, never rotated.
// Used by useLifetimeMintTotal / useLifetimeBurnTotal (Phase 9) for LedgerMintEvent /
// LedgerBurnEvent type-filter queries. See Documentation/API/SuiCallRegistry.md §Type-filter sites.
const _origEconPkgId = import.meta.env.VITE_BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID as string | undefined;
if (!_origEconPkgId) {
  console.error(
    "[constants] VITE_BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID is not set — lifetime mint/burn hooks " +
    "(Phase 9) will fail. Set it to the FIRST-PUBLISH bazaar_economy package ID " +
    "(V1, never updated on upgrade). See Documentation/API/SuiCallRegistry.md."
  );
}
export const BAZAAR_ECONOMY_ORIGINAL_PACKAGE_ID = _origEconPkgId ?? "";

// Defining (original) BazaarMission package ID — V33 split. Use for Mission type strings +
// event filters (MissionCreatedEvent, AcceptanceKey, MissionShop). Anchored to the V33
// first publish (the package's V1), never rotated on upgrade. Falls back to the current
// BAZAAR_MISSION package id (V33 fresh publish → original == published-at).
const _origMissionPkgId = import.meta.env.VITE_BAZAAR_MISSION_ORIGINAL_PACKAGE_ID as string | undefined;
export const BAZAAR_MISSION_ORIGINAL_PACKAGE_ID = _origMissionPkgId ?? PACKAGE_IDS.BAZAAR_MISSION;

// Defining (original) DappHub package ID — Phase 8 A3 (AUD-DH-18). Use for dapp_hub
// event type filters (TaxDepositEvent etc.). Correct under the fresh-publish regime
// (original == current) and stays correct after a future COMPATIBLE upgrade of
// dapp_hub. Falls back to the current package id when the env var is unset.
const _origDappHubPkgId = import.meta.env.VITE_DAPP_HUB_ORIGINAL_PACKAGE_ID as string | undefined;
export const DAPP_HUB_ORIGINAL_PACKAGE_ID = _origDappHubPkgId ?? PACKAGE_IDS.DAPP_HUB;

// Defining (original) BazaarShopOps package ID — V38 split. Use for any bazaar_shop_ops
// event type filters (Sweep H: struct types retain the first-publish anchor across
// upgrades). EMPTY until the V38 fresh publish sets VITE_BAZAAR_SHOP_OPS_ORIGINAL_PACKAGE_ID
// (falls back to the current BAZAAR_SHOP_OPS id — also empty pre-cascade). No event
// filters consume it yet; defined now so it is in place when the package ships.
const _origShopOpsPkgId = import.meta.env.VITE_BAZAAR_SHOP_OPS_ORIGINAL_PACKAGE_ID as string | undefined;
export const BAZAAR_SHOP_OPS_ORIGINAL_PACKAGE_ID = _origShopOpsPkgId ?? PACKAGE_IDS.BAZAAR_SHOP_OPS;

// bazaar_core ADDITIVE-UPGRADE package ID carrying `ssu_rebind` (deregister →
// re-register healing). Upgrades publish at a NEW address while PACKAGE_IDS.
// BAZAAR_CORE stays the fresh-publish ID (entry targets for original modules +
// authorized_package ARGS must not rotate on upgrade — sweep-H discipline).
// Empty string = the upgrade is not live yet; the FE then blocks cross-binding
// re-registration with a friendly message (same-binding re-register still works).
// Rotate alongside the gas-sponsor allowlist when the upgrade ships.
export const BAZAAR_CORE_REBIND_PKG =
  (import.meta.env.VITE_BAZAAR_CORE_REBIND_PKG as string | undefined) ?? "";

// EVE Frontier World contract package (network-specific).
export const WORLD_PACKAGE_ID = import.meta.env.VITE_WORLD_PACKAGE_ID as string;

// V41 SSU depreciation/prune — the world LocationRegistry shared object id (the
// SOLE world-side proof-of-death read; bazaar_core::ssu_depreciation::LOCATION_REGISTRY_ID
// hardcodes this SAME value Move-side, CR-DEP-03 binding condition — re-pin both
// sides together if the world ever re-wipes LocationRegistry). NOT one of OUR
// rotating fresh-publish shared objects, so it does NOT live in SHARED_OBJECTS.
// Consumers: the mark_ssu_revealed/mark_ssu_depreciated TX builders +
// useSolarSystemName (Multi-SSU "Global" tab).
export const WORLD_LOCATION_REGISTRY_ID =
  (import.meta.env.VITE_WORLD_LOCATION_REGISTRY_ID as string | undefined)
  ?? "0x0b3f4f78d7db3c7dee8d624298d45d53f45da69bb5df7b6165f3259258a6d723";

// Shared object IDs (runtime from env, fall back to v7 testnet deployment values).
export const BAZAR_REGISTRY_ID              = (import.meta.env.VITE_BAZAR_REGISTRY_ID as string | undefined)              ?? SHARED_OBJECTS.BAZAR_REGISTRY;
export const MEMBER_REGISTRY_ID             = (import.meta.env.VITE_MEMBER_REGISTRY_ID as string | undefined)             ?? "";
export const ROLE_REGISTRY_ID               = (import.meta.env.VITE_ROLE_REGISTRY_ID as string | undefined)               ?? "";
export const BAZAR_CONFIG_ID                = (import.meta.env.VITE_BAZAR_CONFIG_ID as string | undefined)                ?? "";
export const CLAIM_BOX_ID                   = (import.meta.env.VITE_CLAIM_BOX_ID as string | undefined)                   ?? SHARED_OBJECTS.CLAIM_BOX_ID;
export const ANNOUNCEMENT_BOARD_ID          = (import.meta.env.VITE_ANNOUNCEMENT_BOARD_ID as string | undefined)          ?? "";
export const TRIBE_VAULT_ID                 = (import.meta.env.VITE_TRIBE_VAULT_ID as string | undefined)                 ?? "";
export const WIDGET_CONFIG_ID               = (import.meta.env.VITE_WIDGET_CONFIG_ID as string | undefined)               ?? "";
export const GUESTBOOK_BOARD_ID             = (import.meta.env.VITE_GUESTBOOK_BOARD_ID as string | undefined)             ?? "";
export const USER_STORAGE_REGISTRY_ID       = (import.meta.env.VITE_USER_STORAGE_REGISTRY_ID as string | undefined)       ?? "";
// V13 atomic-9: WtbEscrowPool is per-SSU. Use useSSUSharedObjects(ssuId).wtbEscrowPoolId.
// The legacy VITE_WTB_ESCROW_POOL_ID env-var was always empty in V11/V12 anyway.
/**
 * LEGACY FALLBACK — V9: per-SSU vault ID is now read from SSUGovernance on-chain.
 * Use useQuicktradeVaultId(ssuGovId) as the canonical source post-V9.
 * This constant remains for backward-compatible manual operator override only.
 * @deprecated V9: per-SSU vault ID is canonically read via useQuicktradeVaultId hook. Retained as legacy fallback. See Documentation/legacycode.md.
 */
export const QUICKTRADE_VAULT_ID            = (import.meta.env.VITE_QUICKTRADE_VAULT_ID as string | undefined) || "";
export const TRIBE_REGISTRY_ID              = (import.meta.env.VITE_TRIBE_REGISTRY_ID as string | undefined)              ?? SHARED_OBJECTS.TRIBE_REGISTRY;
export const DAPP_OWNER_CLAIM_BOX_ID        = (import.meta.env.VITE_DAPP_OWNER_CLAIM_BOX_ID as string | undefined)        ?? "";
// B3 (Post-V16 Session 3): DAPP_TREASURY_ID + VITE_DAPP_TREASURY_ID env-var RETIRED.
// Last consumer (useRoleTaxTable) deleted; constant was always empty post-V15 anyway.
export const REGISTRATION_REQUEST_QUEUE_ID  = (import.meta.env.VITE_REGISTRATION_REQUEST_QUEUE_ID as string | undefined)  ?? SHARED_OBJECTS.REQUEST_QUEUE;

// ── UpdateCeremonyPlan v1 shared objects (V35 fresh publish, 2026-06-10) ──────
// Created by dapp_hub::announcements::init_v1_ceremony_objects (bundled into the
// V35 cap-routing PTB #1, digest H36qWFgS...). Fallbacks are the live V35 IDs.
export const ANCHOR_REGISTRY_ID     = (import.meta.env.VITE_ANCHOR_REGISTRY_ID     as string | undefined) ?? "0xee7b574b00bf32c9e80fc7d2cae0a372dc851e4623925335b4854b27d981e0e0";
export const DAPP_ANNOUNCEMENTS_ID  = (import.meta.env.VITE_DAPP_ANNOUNCEMENTS_ID  as string | undefined) ?? "0x263369f133396a2205cb75eea7cf7ccb072c7db61acecf5f1d92ef5cb9a6ac1c";
// V31 (BazaarBeacon) — empty until the fresh publish + init_bazaar_news_board; rotate in.
export const BAZAAR_NEWS_BOARD_ID   = (import.meta.env.VITE_BAZAAR_NEWS_BOARD_ID   as string | undefined) ?? SHARED_OBJECTS.BAZAAR_NEWS_BOARD;
// Mission (MIS) shop type — the shared MissionRegistry id. Empty until the V33
// fresh publish + bootstrap_mission_registry; populate VITE_MISSION_REGISTRY_ID
// at Slice 9 alongside the other V33 id rotation.
export const MISSION_REGISTRY_ID    = (import.meta.env.VITE_MISSION_REGISTRY_ID    as string | undefined) ?? SHARED_OBJECTS.MISSION_REGISTRY;

// SSU (Storage Unit) shared object ID — resolved at runtime from URL query params.
// Priority: ?ssuId= (direct Sui object ID) > ?smartObjectId= > ?itemId= (EVE Frontier in-game)
// The value is trimmed and stripped of any trailing slash: copyable links emitted
// by `buildBazaarAppUrl` end in `/` (required by the EVE Frontier in-game URL field),
// so `?ssuId=0x..../` must resolve to the bare `0x....` object ID.
const _urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
export const SSU_OBJECT_ID: string = (
  _urlParams.get("ssuId") ??
  _urlParams.get("smartObjectId") ??
  _urlParams.get("itemId") ??
  ""
).trim().replace(/\/+$/, "");

// Sui system clock — constant address across all networks.
export const SUI_CLOCK_ID = "0x6";

// EVE Frontier Alpha — players need a little testnet SUI for gas. EVE Frontier's
// docs defer to the standard Sui faucet (EVE Vault is a Sui Wallet Standard
// wallet). Override via VITE_FAUCET_URL if EVE Frontier ships a dedicated
// wallet-connect faucet. Surfaced by <AlphaFaucetNotice>.
export const FAUCET_URL = (import.meta.env.VITE_FAUCET_URL as string | undefined) ?? "https://faucet.sui.io/";

// EVE Vault wallet browser extension — manual install from GitHub releases ZIP
// (no Chrome Web Store listing during Alpha). Override via VITE_EVE_VAULT_EXTENSION_URL.
export const EVE_VAULT_EXTENSION_URL = (import.meta.env.VITE_EVE_VAULT_EXTENSION_URL as string | undefined) ?? "https://github.com/evefrontier/evevault/releases";

// Gas-sponsor Netlify Function (same origin as the deployed apps; 404s on dev
// servers / drag-drop deploys — the FE wrapper treats that as "no sponsorship"
// and falls back to user-paid gas). GET = health, POST = sponsor a transaction.
// See bazaar-frontend/netlify-functions/gas-sponsor.mts + packages/shared/gas/sponsorship.ts.
export const GAS_SPONSOR_FUNCTION_PATH = (import.meta.env.VITE_GAS_SPONSOR_URL as string | undefined) ?? "/.netlify/functions/gas-sponsor";

// Shop auto-expiry options (in seconds, 0 = never).
export const EXPIRY_OPTIONS = [
  { label: "1 Day",   value: 86_400 },
  { label: "1 Week",  value: 604_800 },
  { label: "2 Weeks", value: 1_209_600 },
  { label: "3 Weeks", value: 1_814_400 },
  { label: "4 Weeks", value: 2_419_200 },
  { label: "Never",   value: 0 },
] as const;

// Shop title max character count.
export const SHOP_TITLE_MAX = 20;

// Direct Trade confirmation timeout — 15 minutes in milliseconds.
export const TRADE_TIMEOUT_MS = 900_000;

// TribeCoin decimal factor — 9 decimals (same as SUI/MIST).
// Divide on-chain raw amounts by COIN_DECIMALS for display; multiply human input before TX.
export const COIN_DECIMALS = 1_000_000_000;

// Reverse lookup: u8 -> display label (used in useSSURoleList, useRoleTaxTable, etc.).
// Must mirror dapp_hub::role_types (Move authoritative): 1=Unfriendly, 4=Moderator.
// (Pre-V30 this map had 1 and 4 swapped, mislabeling tax-table + role rows.)
export const ROLE_LABEL: Record<number, string> = {
  0: "Stranger",
  1: "Unfriendly",
  2: "Member",
  3: "Friendly",
  4: "Moderator",
  5: "Admin",
  6: "SuperAdmin",
  7: "Owner",
};

/**
 * Forward lookup: display label -> u8 role index. Inverse of ROLE_LABEL.
 * Used by Session 3C per-role tax-table lookups (CreateShopModal, etc.).
 */
export const ROLE_INDEX: Record<string, number> = Object.entries(ROLE_LABEL)
  .reduce<Record<string, number>>((acc, [k, v]) => { acc[v] = Number(k); return acc; }, {});

// FREE shop type constant — matches SHOP_FREE = 3 in bazar.move.
export const SHOP_FREE = 3;

// ── Phase 5: Per-bazaar-type DappHub tax feature flag ─────────────────────────
// Set VITE_DAPPTAX_PERTYPE_ENABLED=true in the dapphub .env file ONLY after the
// V36 fresh publish (new Move setters/getters go live in V36). Do NOT enable on V35:
// the write cards target entry fns that do not yet exist on-chain.
// The read path (useDAppTaxConfig per-type fields) is safe on V35 — absent fields
// fall back to null → global via the ?? operator and produce no on-chain call.
export const DAPPTAX_PERTYPE_ENABLED =
  (import.meta.env.VITE_DAPPTAX_PERTYPE_ENABLED as string | undefined) === "true";

// ── V36 ABI feature flag ──────────────────────────────────────────────────────
// Set VITE_V36_ENABLED=true in every app .env ONLY at the V36 fresh publish. The
// V36 Move ABI changed in several builders (register_ssu_notribe ownership proof;
// create_wtb_shop notribe/easy split; accept_mission notribe/easy split; Easy FREE
// claim *_tribe entries; advanced_direct_trade tribe_gov param). The live V35 chain
// still has the OLD signatures — keep this OFF until V36 or the builders will target
// entry shapes that do not exist on-chain.
//
// A GETTER (not a const) so unit tests can flip it via `vi.stubEnv("VITE_V36_ENABLED", …)`.
export function v36Enabled(): boolean {
  return (import.meta.env.VITE_V36_ENABLED as string | undefined) === "true";
}

// ── V37 ABI feature flag ──────────────────────────────────────────────────────
// Set VITE_V37_ENABLED=true in every app .env ONLY at the V37 fresh publish. V37
// adds bazaar_core::tribe_lifecycle::deactivate_tribe_fully (Issue-1: DApp-Management
// "Remove Tribe" must also deactivate the TribeGovernance object, not just the
// registry flag). That entry does NOT exist on the live V36 chain — keep this OFF
// until V37 or buildDeactivateTribeFully targets a non-existent function.
//
// A GETTER (not a const) so unit tests can flip it via `vi.stubEnv("VITE_V37_ENABLED", …)`.
export function v37Enabled(): boolean {
  return (import.meta.env.VITE_V37_ENABLED as string | undefined) === "true";
}

// ── UpdateCeremony V2 (Phase 2) reclaim/populate shared objects ───────────────
// EMPTY on V37 (and every version before the reclaim modules ship). The
// ReclaimRegistry + CeremonyGate shared objects are created ONLY at the V38
// fresh-publish cascade (folded into PTB#1, like AnchorRegistry was). Until the
// .env vars are set, the admin populate tool + (Slice 5) reclaim UI self-gate OFF
// via reclaimEnabled() → the reclaim surface ships DORMANT on V37 with zero
// regression. Passing tx.object("") would resolve to `0x0 not found`, so the gate
// MUST hard-block before any PTB is built (see PopulateBackupButton).
export const RECLAIM_REGISTRY_ID =
  (import.meta.env.VITE_RECLAIM_REGISTRY_ID as string | undefined) ?? "";
export const CEREMONY_GATE_ID =
  (import.meta.env.VITE_CEREMONY_GATE_ID as string | undefined) ?? "";

// Populate (Slice 4) only needs the ReclaimRegistry id; the CeremonyGate id gates
// the Slice-5 legacy-withdraw + mint-page PTBs. A GETTER (not a const) so unit
// tests can flip it via `vi.stubEnv("VITE_RECLAIM_REGISTRY_ID", …)`.
export function reclaimEnabled(): boolean {
  return !!(import.meta.env.VITE_RECLAIM_REGISTRY_ID as string | undefined)?.trim();
}

// ── OUTGOING (pre-cascade) package IDs — the lazy EVE drain source (Slice 5) ───
// The reclaim PTBs compose `OLD::withdraw_legacy_* → Coin<EVE> → NEW::reclaim_*`
// (lazy drain-on-reclaim; NO permanent cross-version Move dep — design §4.3). The
// OLD ids are the packages that were live when the snapshot was taken (== the
// snapshot's `outgoingPackageIds`). They are set in the 7 `.env` files at the V38
// cascade alongside the NEW `PACKAGE_IDS`; EMPTY now, so the withdraw composition
// self-gates OFF (a reclaim with no drain still works — it deposits a zero coin).
//
// Prefer the snapshot's `outgoingPackageIds` at ceremony time (it is the exact
// version the backup was taken on); these env-vars are the fallback / display source.
export const OUTGOING_PACKAGE_IDS = {
  DAPP_HUB:       (import.meta.env.VITE_OUTGOING_DAPP_HUB_PACKAGE_ID       as string | undefined) ?? "",
  SHARED_WIDGETS: (import.meta.env.VITE_OUTGOING_SHARED_WIDGETS_PACKAGE_ID as string | undefined) ?? "",
  BAZAAR_CORE:    (import.meta.env.VITE_OUTGOING_BAZAAR_CORE_PACKAGE_ID    as string | undefined) ?? "",
  BAZAAR_MISSION: (import.meta.env.VITE_OUTGOING_BAZAAR_MISSION_PACKAGE_ID as string | undefined) ?? "",
  BAZAAR_ECONOMY: (import.meta.env.VITE_OUTGOING_BAZAAR_ECONOMY_PACKAGE_ID as string | undefined) ?? "",
} as const;

// True only when BOTH the reclaim registry is live AND the CeremonyGate +
// outgoing bazaar_core id are set — i.e. the legacy EVE-drain composition can be
// built. The reclaim UI uses `reclaimEnabled()` to show itself and this to decide
// whether to compose the optional drain leg (vs deposit a zero coin).
export function outgoingDrainEnabled(): boolean {
  const gate = (import.meta.env.VITE_CEREMONY_GATE_ID as string | undefined)?.trim();
  const core = (import.meta.env.VITE_OUTGOING_BAZAAR_CORE_PACKAGE_ID as string | undefined)?.trim();
  return reclaimEnabled() && !!gate && !!core;
}
