// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Verbatim port of Bazar1/dapp/frontend/src/types.ts under OverhaulPlan1 R2
// Article XIV.2 exemption. Import path: @bazaar/shared/types (re-exported from index.ts).

// Navigation screens
export type Screen = "landing" | "bazar" | "trade" | "inventory" | "announcements-archive" | "manage-announcements" | "myshops" | "quicktrade" | "exchange";

// Shop discriminant — drives all shop-type branching.
// MIS = the Mission (MIS) shop type — a distinct on-chain object
// (bazaar_core::mission::MissionShop), NOT a bazar::Shop. It is a kind-selector
// value only in CreateShopModal; it branches to the dedicated MissionWizard.
export type ShopKind = "WTS" | "WTB" | "DE" | "FREE" | "MIS";

// Single item listing in a WTS or WTB shop.
export interface Listing {
  itemTypeId:        number;
  quantity:          number;
  originalQuantity?: number;  // WTB: units at creation — decrements as filled; used for refund preview
  priceTribe:        number;
}

// One exchange pair inside a DE shop.
// Bundle-ratio model: a trade "bundle" is `offerPerLot` offered items exchanged for
// `requestedQty` requested items. `offeredQty` is the total escrowed offered stock
// (always a whole multiple of `offerPerLot`); customers buy whole bundles only.
// offerPerLot = 1 reproduces the legacy 1:N "per single offered" ratio.
export interface ExchangePair {
  offeredTypeId:   number;
  offeredQty:      number;   // total offered items deposited (= offerPerLot × bundles)
  requestedTypeId: number;
  requestedQty:    number;   // requested items per bundle
  offerPerLot:     number;   // offered items per bundle (1 = legacy per-single-offered)
}

// Bazar shop — covers WTS, WTB, and DE
export interface Shop {
  id:                string;
  owner:             string;
  kind:              ShopKind;
  title:             string;
  ssuId:             string;   // SSU this shop is bound to (empty string = unknown/legacy)
  // 0=NoTribe (EVE/MIST), 1=Easy (EVE/MIST), 2=Advanced (tribe-token raw, 0-decimal).
  // Determines whether listing.priceTribe is MIST-scaled or raw integer count.
  bazaarType?:       number;
  displayId?:        number;
  mapX?:             number;
  mapY?:             number;
  isActive:          boolean;
  positionX:         number;
  positionY:         number;
  listings:          Listing[];
  pairs:             ExchangePair[];
  escrowedTribe:     number;
  createdAtMs:       number;
  expiryMs:          number;
  lastInteractionMs: number;
  // WTB-specific fields (undefined on WTS / DE / FREE shops)
  originalTotalValue?: string;  // sum(priceTribe * originalQuantity) at creation, in raw MIST — string for u128
  taxPrepaid?:         number;  // tax the owner pre-deposited at creation, in raw MIST
  wtbTaxBpsLocked?:    number;  // per-role wtb_tax_bps rate frozen on this shop at creation
  // FREE-shop fields (undefined on WTS / WTB / DE shops)
  is_tribe_store?:            boolean;  // true when shop is a tribe store (Admin-gated)
  claim_limit_per_user?:      number;   // max items any single wallet may claim (0 = unlimited)
  claims?:                    { claimer: string; qty_claimed: number }[];  // per-wallet item claim records
  coin_claim_limit_per_user?: number;   // max coins (raw MIST) any single wallet may claim (0 = unlimited)
  coin_claims?:               { claimer: string; amount_claimed: number }[];  // per-wallet coin claim records
  allowed_roles?:             number[];  // role values (0–7) permitted to claim; empty = all roles
  // V25/V26 FREE-shop fields (Move-backed; populated by useShops parser)
  // V25 EVE-prepay path stores claim amount in MIST. V26 Advanced path stores
  // the per-claim amount in scaled tribe-token units (decimals=2).
  coin_claim_amount?:         number;
  // C7/AUD-NT-05: coin_claimers is now a Table<address,bool> on-chain; the unbounded
  // full list is no longer decoded. This is the inner Table's object id, for a
  // targeted per-wallet "already claimed" lookup (single-claim per wallet).
  coinClaimersTableId?:       string;
  tribe_token_pool?:          number;    // V26 Advanced FREE — scaled tribe-token escrow remaining
  escrowedEve?:               number;    // Shop.escrowed_eve Balance<EVE> remaining (raw MIST) —
                                         // V25 NoTribe/Easy FREE coin pool; also WTB payout escrow
}

// Single item side of a Direct Trade proposal
export interface TradeItem {
  itemTypeId:    number;
  quantity:      number;
  itemObjectId?: string;  // on-chain Item object ID, required when referencing objects during trade execution
}

// Direct Trade proposal — two-phase commit with 15-minute confirmation window
export interface TradeProposal {
  id:              string;
  initiator:       string;
  counterparty:    string;
  initiatorItems:  TradeItem[];  // items offered by initiator
  counterItems:    TradeItem[];  // items offered by counterparty (populated once counterparty accepts)
  initiatorTribe:  number;       // Tribe Coin offered by initiator
  counterTribe:    number;       // Tribe Coin offered by counterparty (populated once counterparty accepts)
  /** Amount of Tribe Coin the initiator has declared they want from the counterparty. */
  requestedTribe:  number;
  /** Item types the initiator has declared they want from the counterparty. */
  requestedItems:  TradeItem[];
  status:          "pending" | "awaiting" | "completed" | "expired" | "cancelled";
  /** Unix timestamp (ms) when counterparty accepted — used to render the 15-min confirm countdown. */
  acceptedAtMs?:   number;
}

// Role state for the connected wallet
export interface Roles {
  isOwner:      boolean;
  isAdmin:      boolean;
  isModerator:  boolean;
  isMember:     boolean;
  /** True when the wallet address has any entry in the MemberRegistry (even role 0). */
  isRegistered: boolean;
  /** True while the initial role query is in flight. */
  isLoading:    boolean;
}

// Moderator ban duration options
export type BanDuration = "1day" | "1week" | "permanent";

// Market role classification for trading tax purposes.
export type Role = "Stranger" | "Moderator" | "Member" | "Friendly" | "Unfriendly" | "Admin" | "SuperAdmin" | "Owner";

// Per-role tax configuration.
export interface RoleTaxConfig {
  wtsBps: number;   // basis points (100 = 1%)
  wtbBps: number;   // basis points
  deFee:  number;   // flat EVE amount (raw MIST) per DE transaction
}

// Full per-role tax table. Indexed by role label.
export type RoleTaxTable = Record<Role, RoleTaxConfig>;

// ── Inventory System ─────────────────────────────────────────────────────────

// A single inventory slot as seen by the connected user.
// lockedQuantity is the portion reserved by an active shop.
export interface OwnedInventoryItem {
  typeId:           number;
  quantity:         number;
  volume:           number;
  lockedQuantity:   number;
  lockingShopId?:   string;
  lockingShopTitle?: string;
}

// Sort keys available in the InventoryPage.
export type InventorySortKey = "name" | "quantity" | "volume";

// ── Announcement System ───────────────────────────────────────────────────────

export interface Comment {
  author:      string;
  text:        string;
  createdAtMs: number;
}

export interface Announcement {
  id:          number;
  author:      string;
  title:       string;
  body:        string;
  visibility:  number;
  isSticky:    boolean;
  createdAtMs: number;
  comments:    Comment[];
}

// ── Guestbook System ─────────────────────────────────────────────────────────

export interface GuestbookEntry {
  id:          number;
  author:      string;
  message:     string;
  createdAtMs: number;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
