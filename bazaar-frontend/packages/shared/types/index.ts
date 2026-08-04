/**
 * @bazaar/shared/types — Shared TypeScript type definitions.
 *
 * On-chain struct mirrors, API response shapes, and enum/union types
 * used across all 4 frontend apps (dapphub, notribe, easy, advanced).
 *
 * App-local types (navigation screens, local UI state) stay in each app's
 * own types/index.ts. Only types used by 2+ apps live here.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

// ── Discriminants ──────────────────────────────────────────────────────────────

/** Bazaar type discriminator matching the on-chain bazaar_type u8 field.
 *  0=notribe, 1=easy, 2=advanced */
export type BazaarType = "notribe" | "easy" | "advanced";

/** Role governance scope. */
export type GovernanceLevel = "dapp" | "tribe" | "ssu";

/** Join policy for tribe registration. */
export type JoinPolicy = "open" | "application";

// ── Tribe Types ────────────────────────────────────────────────────────────────

/** Tribe listing data — used in JoinTribeWindow, TribesTab, and tribe selectors. */
export interface TribeSummary {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  ssuCount: number;
  /** SSU object ids registered to this tribe — read from the live dapp_hub
   *  Tribe.ssu_ids vector (NOT the dead bazaar_core TribeGovernance.ssu_ids). */
  ssuIds: string[];
  bazaarType: BazaarType;
  joinPolicy: JoinPolicy;
  isActive: boolean;
  leaderAddress: string;
  createdAt: number;
}

/** Detailed tribe data including SSU list — used in tribe-specific views.
 *  `ssuIds` is inherited from TribeSummary. */
export interface TribeDetails extends TribeSummary {
  accentColor?: string;
  logoUrl?: string;
}

/** A member entry within a tribe. */
export interface TribeMember {
  address: string;
  role: number;
  joinedAtMs: number;
}

/** Application to join a tribe. */
export interface TribeApplication {
  id: string;
  tribeId: string;
  tribeName: string;
  applicantAddress: string;
  ssuId: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  submittedAtMs: number;
}

// ── SSU Types ──────────────────────────────────────────────────────────────────

/** SSU registration record — mirrors on-chain SSURegistration struct. */
export interface SSURegistration {
  ssuId: string;
  ownerAddress: string;
  bazaarType: BazaarType;
  tribeId: string | null;
  registeredAtMs: number;
  isActive: boolean;
}

/** SSU summary for listing views. */
export interface SSUSummary {
  ssuId: string;
  ownerAddress: string;
  bazaarType: BazaarType;
  tribeId: string | null;
  tribeName: string | null;
  isActive: boolean;
  registeredAt: number;
}

/** User's registered SSU record as seen in MyRegisteredSSUs view. */
export interface RegisteredSSU {
  ssuId: string;
  tribeId: string | null;
  tribeName: string | null;
  url: string;
  status: "active" | "pending" | "inactive";
  registeredAtMs: number;
}

// ── Governance / Tax Types ─────────────────────────────────────────────────────

/** DApp-level tax configuration — mirrors on-chain GovernanceConfig.
 *  global_dapp_tax_bps: single basis-point rate applied to all DApp-level transactions.
 *  Per-type rates (Phase 5 / V36): null = unset, falls back to globalTaxBps.
 *  notribeDappBps: overrides global for NoTribe WTS/WTB shops.
 *  easyDappBps: overrides global for Easy WTS/WTB shops.
 *  advancedExchangeDappBps: overrides global for the Advanced Exchange swap only. */
export interface DAppTaxConfig {
  globalTaxBps: number;
  notribeDappBps:            number | null;
  easyDappBps:               number | null;
  advancedExchangeDappBps:   number | null;
}

/** Tax wallet balance and cumulative stats. Mirrors DAppTaxWallet on-chain struct. */
export interface TaxWalletData {
  balance: number;
  totalCollected: number;
  totalWithdrawn: number;
  depositCount: number;
}

/** A single dApp tax deposit event from on-chain. */
export interface TaxDepositEvent {
  txType: string;
  bazaarType: BazaarType;
  ssuId: string;
  tribeId: string;
  payer: string;
  receiver: string;
  grossAmount: number;
  ssuTax: number;
  tribeTax: number;
  dappTax: number;
  netAmount: number;
  timestampMs: number;
}

/** GovernanceConfig mirrors dapp_hub::dapp_governance::GovernanceConfig on-chain.
 *  Fields: id, version, global_dapp_tax_bps, custom_tribe_overrides, custom_ssu_overrides. */
export interface GovernanceConfig {
  version: number;
  globalTaxBps: number;
  dappOwnerAddress: string;
}

// ── Ticket Types ───────────────────────────────────────────────────────────────

/** Tag classification for a support ticket. */
export type TicketTag =
  | "bug"
  | "feature-request"
  | "ssu-issue"
  | "tribe-issue"
  | "account"
  | "other";

/** Support / contact ticket from on-chain TicketBoard. */
export interface SupportTicket {
  id: string;
  title: string;
  tag: TicketTag;
  body: string;
  contactMethod: "discord" | "email" | "none";
  contactValue: string;
  authorAddress: string;
  status: "open" | "in-progress" | "resolved" | "closed";
  createdAtMs: number;
}

// ── Role Constants (mirrors role_types.move) ───────────────────────────────────

/** Numeric role level matching the on-chain role_types module (0-7). */
export const ROLE = {
  STRANGER:    0,
  UNFRIENDLY:  1,
  MEMBER:      2,
  FRIENDLY:    3,
  MODERATOR:   4,
  ADMIN:       5,
  SUPER_ADMIN: 6,
  OWNER:       7,
} as const;

export type RoleLevel = typeof ROLE[keyof typeof ROLE];

// ── Proposal Types ─────────────────────────────────────────────────────────────

/** Generic governance proposal (for future DAO/voting features). */
export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  status: "pending" | "passed" | "rejected" | "executed";
  votesFor: number;
  votesAgainst: number;
  createdAtMs: number;
  expiresAtMs: number;
}

export * from "./bazaarcore";
export * from "./bazaareconomy";
export * from "./inventory";
export * from "./character";

// ── Bazar1 port types (OverhaulPlan1 R2) ──────────────────────────────────────
// Selective re-export: only non-conflicting Bazar1 type names.
// Conflicting names (Shop, ShopKind, Listing, ExchangePair, TradeItem, TradeProposal)
// remain in types/bazar1.ts and must be imported directly from that path.
export type {
  Screen,
  Roles,
  BanDuration,
  Role,
  RoleTaxConfig,
  RoleTaxTable,
  InventorySortKey,
  Comment,
  Announcement,
  GuestbookEntry,
} from "./bazar1";
