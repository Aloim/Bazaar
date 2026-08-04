// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/types/bazaarcore — BazaarCore on-chain type mirrors.
 *
 * All types mirror Move struct fields exactly (snake_case -> camelCase).
 * Field notes document any gap between FrontendAPI spec and Move reality.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { PACKAGE_IDS, ORIGINAL_PACKAGE_ID } from "../constants";

// ── Shop Discriminants ─────────────────────────────────────────────────────────

/** Mirrors bazaar_core::bazar SHOP_WTS=0, SHOP_WTB=1, SHOP_DE=2, SHOP_FREE=3.
 *  MIS=4 is the Mission (MIS) shop type — a distinct on-chain object
 *  (bazaar_core::mission::MissionShop on MissionRegistry), NOT a bazar::Shop.
 *  The value is shared with the CreateShopModal kind discriminator. */
export type ShopKind = 0 | 1 | 2 | 3 | 4;
export const SHOP_KIND = { WTS: 0, WTB: 1, DE: 2, FREE: 3, MIS: 4 } as const;

/** Mirrors bazaar_core::bazar BAZAAR_TYPE_NOTRIBE=0, EASY=1, ADVANCED=2 */
export type BazaarTypeNum = 0 | 1 | 2;
export const BAZAAR_TYPE_NUM = { NOTRIBE: 0, EASY: 1, ADVANCED: 2 } as const;

// ── Shop Types ─────────────────────────────────────────────────────────────────

/** Mirrors bazaar_core::bazar::Listing */
export interface Listing {
  itemTypeId: number;
  quantity: number;
  priceEve: number;
  originalQuantity: number;
}

/** Mirrors bazaar_core::bazar_listings::ExchangePair (bundle-ratio DE model). */
export interface ExchangePair {
  offerItemTypeId: number;
  offerQuantity: number;
  requestItemTypeId: number;
  requestQuantity: number;
  /** Offered items per bundle (1 = legacy per-single-offered ratio). */
  offerPerLot: number;
}

/** Mirrors bazaar_core::bazar::Shop — stored as DOF on BazarRegistry */
export interface Shop {
  id: string;
  owner: string;
  kind: ShopKind;
  bazaarType: BazaarTypeNum;
  title: string;
  ssuId: string;
  tribeId: number;
  listings: Listing[];
  pairs: ExchangePair[];
  /** Balance<SUI> value in MIST — only non-zero for WTB shops */
  escrowedEve: number;
  createdAtMs: number;
  expiryMs: number;
  isActive: boolean;
  positionX?: number;
  positionY?: number;
  /** V25/V26: fixed per-claim amount on FREE shops. NoTribe/Easy = MIST,
   *  Advanced = scaled tribe-token units (decimals=2). 0 on non-FREE shops. */
  coinClaimAmount?: number;
  /** V25: wallets that have already claimed from this FREE shop's giveaway. */
  coinClaimers?: string[];
  /** V26: Advanced FREE shop tribe-token escrow pool (scaled units).
   *  0 on NoTribe/Easy FREE + every non-FREE shop. */
  tribeTokenPool?: number;
}

// ── Mission (MIS) Types ──────────────────────────────────────────────────────

/** Mission category — cosmetic display label only (no on-chain verification).
 *  Mirrors bazaar_core::mission mission_type: 0 Mining, 1 PVP, 2 PVE, 3 Loot. */
export type MissionType = 0 | 1 | 2 | 3;
export const MISSION_TYPE = { MINING: 0, PVP: 1, PVE: 2, LOOT: 3 } as const;
export const MISSION_TYPE_LABEL: Record<number, string> = {
  0: "Mining", 1: "PVP", 2: "PVE", 3: "Loot",
};

/** Completion model — mirrors bazaar_core::mission completion_mode:
 *  0 = item-proof (trustless single-tx), 1 = other (giver Confirm/Reject). */
export type CompletionMode = 0 | 1;
export const COMPLETION_MODE = { ITEM_PROOF: 0, OTHER: 1 } as const;

/** Per-taker acceptance status — mirrors mission STATUS_ACTIVE=0, STATUS_PENDING=1. */
export type MissionAcceptanceStatus = 0 | 1;
export const MISSION_ACCEPTANCE_STATUS = { ACTIVE: 0, PENDING: 1 } as const;

/** Mirrors bazaar_core::mission::ItemReq { type_id, amount }. */
export interface MissionItemReq {
  typeId: number;
  amount: number;
}

/** Mirrors bazaar_core::mission::MissionShop — stored as a DOF on MissionRegistry. */
export interface Mission {
  id: string;
  owner: string;
  ssuId: string;
  tribeId: number;
  bazaarType: BazaarTypeNum;
  missionType: number;          // 0..3 (MISSION_TYPE)
  title: string;
  description: string;
  completionMode: number;       // 0 item-proof, 1 other (COMPLETION_MODE)
  proofItems: MissionItemReq[]; // mode 0; up to 10 {typeId, amount}
  rewardItems: MissionItemReq[];// per-completion item reward spec
  /** Remaining escrowed Balance<EVE> value (MIST) — NoTribe/Easy only; 0 on Advanced. */
  rewardEve: number;
  /** Per-completion EVE reward (MIST) — NoTribe/Easy; 0 on Advanced. */
  rewardEvePerRun: number;
  /** Per-completion tribe-token reward (scaled units) — Advanced; 0 on NoTribe/Easy. */
  rewardTokenPerRun: number;
  maxRuns: number;
  runsCompleted: number;
  runsInProgress: number;
  takerTimeLimitMs: number;
  createdAtMs: number;
  expiryMs: number;
  positionX: number;
  positionY: number;
  isActive: boolean;
  isSettled: boolean;
  collateralEvePerRun:   number;  // MIST; 0 on Advanced or when no collateral
  collateralTokenPerRun: number;  // scaled token units; 0 on NoTribe/Easy or when no collateral
  visibilityRoles:       number;  // bitmask; default EVERYONE (16); 0 is invalid (Move aborts)
  /** Item-proof escrow cursors (giver IS the SSU owner path). proofEscrowCount >
   *  proofEscrowNext means there are delivered proof bundles awaiting collection
   *  into the owner's storage. Both 0 for non-SSU-owner givers (auto-delivered). */
  proofEscrowCount: number;
  proofEscrowNext:  number;
}

/** Mirrors bazaar_core::mission::MissionAcceptance (a DF on the MissionShop UID,
 *  keyed by AcceptanceKey { taker }). */
export interface MissionAcceptance {
  taker: string;
  acceptedAtMs: number;
  deadlineMs: number;
  status: MissionAcceptanceStatus;
  collateralAmount: number;       // exact posted collateral at accept; 0 if mission had none
}

// ── Trade Types ────────────────────────────────────────────────────────────────

/** Mirrors bazaar_core::trade::TradeItem */
export interface TradeItem {
  itemTypeId: number;
  quantity: number;
}

/**
 * Trade proposal status — mirrors on-chain constants:
 * PENDING=0, ACCEPTED=1, REJECTED=2, CANCELLED=3, EXPIRED=4
 */
export type TradeStatus = 0 | 1 | 2 | 3 | 4;
export const TRADE_STATUS = {
  PENDING: 0, ACCEPTED: 1, REJECTED: 2, CANCELLED: 3, EXPIRED: 4,
} as const;

/** Mirrors bazaar_core::trade::TradeProposal */
export interface TradeProposal {
  id: string;
  proposer: string;
  counterparty: string;
  ssuId: string;
  tribeId: number;
  bazaarType: BazaarTypeNum;
  offeredItems: TradeItem[];
  requestedItems: TradeItem[];
  /** Amount proposer has already escrowed (MIST) */
  offeredEve: number;
  /** Amount counterparty must send to accept (MIST) */
  requestedEve: number;
  status: TradeStatus;
  createdAtMs: number;
  expiryMs: number;
}

// ── Inventory Types ────────────────────────────────────────────────────────────

/** Mirrors bazaar_core::user_storage::StoredItem */
export interface OwnedInventoryItem {
  itemTypeId: number;
  quantity: number;
  depositedAtMs: number;
  /** null when item was deposited directly (not from a shop purchase) */
  sourceShopId: string | null;
}

/** Mirrors bazaar_core::user_storage::UnclaimedItem */
export interface UnclaimedItem {
  originalOwner: string;
  itemTypeId: number;
  quantity: number;
  /** Key used in unclaimed_items Table — also passed to claim_unclaimed_item */
  shopId: string;
  expiryMs: number;
}

/**
 * Storage statistics — count-based only.
 * NOTE: FrontendAPI spec mentions usedVolume/volumeLimit but Move has no volume
 * tracking. We expose itemCount and totalItemCount only (G-10 gap deferred).
 */
export interface StorageStats {
  /** Number of distinct item type stacks held by the player */
  itemStackCount: number;
  /** Sum of all quantities across all stacks */
  totalItemCount: number;
}

// ── Governance Types ───────────────────────────────────────────────────────────

// (SSUTaxConfig interface DELETED Phase 8 A4 / AUD-NT-10 — `surcharge_mode` was
//  dead config never read by any Move tax path; the field is retired from the
//  struct at V36. Per-role tax rows stay on useSSURoleTaxTable.)

/**
 * Per-role tax row mirroring bazaar_core::role_tax_types::RoleTaxConfig.
 * wtsPct / wtbPct stored ×100 (525 = 5.25%); deFlatFee is a flat EVE amount in base units.
 * Per-tier cap on percentage fields: 1000 (= 10.00%).
 */
export interface RoleTaxRow {
  wtsPct: number;
  wtbPct: number;
  deFlatFee: number;
}

/**
 * Sparse per-role table — keys are role indices 0..7 (Stranger=0…7).
 * Null entry = row not set in on-chain Table; lookup returns 0 in Move.
 */
export type RoleTaxTable = Record<number, RoleTaxRow | null>;

/** Convenience zero-row for unset roles. */
export const ZERO_ROLE_TAX_ROW: RoleTaxRow = { wtsPct: 0, wtbPct: 0, deFlatFee: 0 };

/**
 * Full SSUGovernance config returned by useSSUGovernanceConfig.
 * NOTE: shopLimit, maxListings, volumeLimit not in Move (G-09, G-10 gaps deferred).
 *
 * FP1-43: Added 4 new per-SSU object ID fields stored on SSUGovernance.
 */
export interface SSUGovernanceConfig {
  ssuId: string;
  bazaarType: BazaarTypeNum;
  tribeId: number;
  owner: string;
  /** Balance<EVE> value of collected tax wallet in MIST */
  taxBalance: number;
  totalTaxCollected: number;
  widgetConfigId: string;
  /** ID of the per-SSU MemberRegistry shared object. [ADDED FP1-43] */
  memberRegistryId: string;
  /** ID of the per-SSU AnnouncementBoard shared object. [ADDED FP1-43] */
  announcementBoardId: string;
  /** ID of the per-SSU GuestbookBoard shared object. [ADDED FP1-43] */
  guestbookBoardId: string;
  /** Slice 3: per-hour Mission (MIS) listing fee charged on the SSU layer.
   *  NoTribe/Easy = raw MIST EVE; Advanced = tribe-token units (denomination
   *  implied by bazaarType). 0 = no SSU mission fee. */
  missionListingFeePerHour: number;
  isActive: boolean;
  createdAtMs: number;
  /** V41 SSU depreciation/prune (CR-P6-01): true once mark_ssu_revealed has
   *  recorded this SSU's live in-game location on-chain — the prerequisite for
   *  mark_ssu_depreciated to ever succeed (E_NOT_REVEALED otherwise). Mirrors
   *  ssu_governance::location_revealed(&SSUGovernance). */
  locationRevealed: boolean;
}

/**
 * Mirrors bazaar_core::tribe_governance::TribeTaxConfig (V16 per-role reshape).
 * Flat fields removed; per-role data now exposed via useTribeRoleTaxTable.
 * No config-level flags (tribe side has no surcharge_mode analogue).
 */
export interface TribeTaxConfig {
  /** Placeholder — TribeTaxConfig has no scalar fields after V16 per-role reshape. */
  _placeholder?: never;
}

/**
 * Full TribeGovernance config returned by useTribeGovernanceConfig.
 * NOTE: registrationPolicy, maxMembers not in TribeGovernance Move struct (G-11 gap deferred).
 * registrationPolicy lives in dapp_hub::tribe_registry::Tribe.
 * V16 (Session 3B): taxConfig DROPPED from return shape (Table<u8, RoleTaxConfig> exposed via useTribeRoleTaxTable instead).
 */
export interface TribeGovernanceConfig {
  tribeId: number;
  bazaarType: BazaarTypeNum;
  taxBalance: number;
  totalTaxCollected: number;
  ssuIds: string[];
  isActive: boolean;
  createdAtMs: number;
  /** Slice 3: per-hour Mission (MIS) listing fee charged on the Tribe layer.
   *  Easy = raw MIST EVE; Advanced = tribe-token units (denomination implied by
   *  bazaarType). 0 = no tribe mission fee. */
  missionListingFeePerHour: number;
  /**
   * AP2-F / FP1-28 — governance mode discriminant. IMMUTABLE after creation.
   * v1 always 0 (AUTHORITARIAN_CAPITALISTIC). See GOVERNANCE_MODE const.
   * null until real RPC lands (FP1-23 extension). Article XV required to unlock modes > 0.
   */
  governanceMode: GovernanceMode | null;
}

// ── Role / Cap Types ───────────────────────────────────────────────────────────

/**
 * SSU capability flags for the connected wallet.
 *
 * Constitution XII.2 — 4-tier SSU cap hierarchy:
 *   Owner > SuperAdmin > Admin > Moderator
 *
 * FP1-25: Added SSUSuperAdminCap (Move: bazaar_core::membership::SSUSuperAdminCap).
 * FP1-23 note: all fields are stub-populated (false / undefined) until real RPC lands.
 */
export interface SSUCaps {
  hasSSUOwnerCap: boolean;
  hasSSUSuperAdminCap: boolean;   // FP1-25 — Constitution XII.2 4-tier restoration
  hasSSUAdminCap: boolean;
  hasSSUModCap: boolean;
  capIds: {
    ownerCapId?: string;
    superAdminCapId?: string;     // FP1-25
    adminCapId?: string;
    modCapId?: string;
  };
}

/** SSU role data for the connected wallet at a specific SSU */
export interface SSURoles {
  ssuRole: number;
  tribeRole: number;
  /** effectiveRole = max(ssuRole, tribeRole) */
  effectiveRole: number;
  isBanned: boolean;
  isRegistered: boolean;
}

/**
 * Tribe cap flags — all 4 cap types (G-16: spec listed 2, Move has 4).
 * TribeLeaderCap lives in dapp_hub::tribe_registry (checked via DappHub hooks).
 */
export interface TribeCaps {
  hasTribeLeaderCap: boolean;
  hasTribeSuperAdminCap: boolean;
  hasTribeAdminCap: boolean;
  hasTribeModCap: boolean;
  capIds: {
    leaderCapId?: string;
    superAdminCapId?: string;
    adminCapId?: string;
    modCapId?: string;
  };
}

/** Tribe role flags for the connected wallet at a specific tribe */
export interface TribeRoles {
  hasTribeLeaderCap: boolean;
  hasTribeSuperAdminCap: boolean;
  hasTribeAdminCap: boolean;
  hasTribeModCap: boolean;
}

// ── Tribe Member Aggregated ────────────────────────────────────────────────────

/**
 * Aggregated tribe member entry — merged across all SSUs the player is registered at.
 * G-18: No tribe-wide member list exists on-chain. This is assembled client-side.
 * maxSSURole   — highest ssu_role observed across all SSUs for this player.
 * maxTribeRole — highest tribe_role observed across all SSUs for this player.
 * effectiveRole — max(maxSSURole, maxTribeRole).
 * memberAtSSUs  — SSU IDs where this player has a MemberRegistry entry.
 */
export interface TribeMemberAggregated {
  address: string;
  maxSSURole: number;
  maxTribeRole: number;
  effectiveRole: number;
  isBanned: boolean;
  memberAtSSUs: string[];
}

// ── Item Type Metadata ─────────────────────────────────────────────────────────

/**
 * External item type metadata — NOT from BazaarCore.
 * Sourced from EVE Frontier world modules or a static lookup.
 */
export interface ItemTypeMeta {
  typeId: number;
  name: string;
}

// ── Godot URL Event (AP2-C / FP1-28) ──────────────────────────────────────────

/**
 * "ssu" = event from SSUGovernance scope (Move: SCOPE_SSU = 0).
 * "tribe" = event from TribeGovernance scope (Move: SCOPE_TRIBE = 1).
 */
export type GodotUrlScope = "ssu" | "tribe";

/**
 * TS mirror of Move's bazaar_core::ssu_governance::GodotUrlChangedEvent.
 *
 * Shape note: Move carries `target_id: address` + `target_tribe_id: u64` as two
 * separate fields plus boolean flags for old/new presence. This TS mirror collapses
 * both identifiers into a single `targetId: string` and uses string | null for URL
 * presence. The mismatch is intentional — see IS-FP1-28 §3.5 field-map note.
 * Event-indexer bridging is deferred to AP2-E (FP1-30).
 */
export interface GodotUrlChangedEvent {
  scope: GodotUrlScope;
  /** SSU address when scope="ssu"; tribe_id stringified when scope="tribe". */
  targetId: string;
  oldUrl: string | null;
  newUrl: string | null;
  actor: string;
  timestampMs: number;
}

// ── Governance Mode (AP2-F / FP1-28) ──────────────────────────────────────────

/**
 * v1 governance mode discriminants — mirrors tribe_governance::governance_mode: u8.
 *
 * GOVERNANCE_MODE is IMMUTABLE after tribe creation (Article XV).
 * A Constitution Article XV amendment is required to add a mode > 0.
 * Do NOT add modes here without that formal amendment.
 *
 * Planned future modes (FP1-39, deferred): AI-rule, communist, etc.
 */
export const GOVERNANCE_MODE = {
  AUTHORITARIAN_CAPITALISTIC: 0,
} as const;

/** Union of all valid governance mode values. v1: only 0. */
export type GovernanceMode = typeof GOVERNANCE_MODE[keyof typeof GOVERNANCE_MODE];

// ── SSU Cap Type Strings ───────────────────────────────────────────────────────

/**
 * Fully-qualified Move type strings for SSU capability objects.
 * Used by useSSUCaps RPC filters (StructType) and any PTB-level type-tag lookups.
 * Mirrors constants in bazaar_core::membership.
 *
 * FP1-23: useSSUCaps stub will use these when real getOwnedObjects RPC lands.
 */
export const SSU_CAP_TYPES = {
  SSU_OWNER_CAP:       `${ORIGINAL_PACKAGE_ID}::membership::SSUOwnerCap`,
  SSU_SUPER_ADMIN_CAP: `${ORIGINAL_PACKAGE_ID}::membership::SSUSuperAdminCap`,
  SSU_ADMIN_CAP:       `${ORIGINAL_PACKAGE_ID}::membership::SSUAdminCap`,
  SSU_MOD_CAP:         `${ORIGINAL_PACKAGE_ID}::membership::SSUModCap`,
} as const;

// ── Tribe Cap Type Strings ─────────────────────────────────────────────────────

/**
 * Fully-qualified Move type strings for Tribe capability objects.
 * Used by useTribeCaps RPC filters (StructType).
 * TribeLeaderCap lives in DAPP_HUB package; others in BAZAAR_CORE.
 *
 * FP1-23: useTribeCaps stub uses these for real getOwnedObjects RPC.
 */
export const TRIBE_CAP_TYPES = {
  TRIBE_LEADER_CAP:       `${PACKAGE_IDS.DAPP_HUB}::tribe_registry::TribeLeaderCap`,
  TRIBE_SUPER_ADMIN_CAP:  `${PACKAGE_IDS.BAZAAR_CORE}::tribe_governance::TribeSuperAdminCap`,
  TRIBE_ADMIN_CAP:        `${PACKAGE_IDS.BAZAAR_CORE}::tribe_governance::TribeAdminCap`,
  TRIBE_MOD_CAP:          `${PACKAGE_IDS.BAZAAR_CORE}::tribe_governance::TribeModCap`,
} as const;

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
