// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Update-Ceremony snapshot schema v2.0 (5-package aware).
 *
 * Captured by ceremony/index.ts::generateSnapshot from LIVE chain state, pasted
 * into the Create-Backup form, hashed (SHA-256) + anchored on-chain, and (in V2)
 * consumed by the reclaim/restore flow. Every EVE figure carries BOTH the holding
 * object id AND its mist balance so V2 can pull-and-deposit. All u64 are strings
 * (JSON-safe). See plan optimized-mixing-crayon.md "canonical snapshot schema".
 */

export const SNAPSHOT_SCHEMA_VERSION = "v2.0";

/** address -> absolute epoch-ms expiry (ban) or u64 string (balance/counter). */
export type AddressU64Map = Record<string, string>;

export interface MemberRow {
  address: string;
  ssuRole: number;   // 0..7 Stranger..Owner
  tribeRole: number;
  isBanned: boolean;
}

export interface CommentRow {
  author: string;
  text: string;
  createdAtMs: string;
}

export interface AnnouncementRow {
  id: string;
  author: string;
  title: string;
  body: string;
  visibility: number;
  isSticky: boolean;
  createdAtMs: string;
  comments: CommentRow[];
}

export interface GuestbookRow {
  id: string;
  author: string;
  message: string;
  createdAtMs: string;
}

export interface TribeSnapshot {
  tribeId: number;
  name: string;
  bazaarType: number;            // 1=Easy, 2=Advanced
  leaderAddress: string;
  isActive: boolean;
  ssuIds: string[];              // LIVE dapp_hub Tribe.ssu_ids
  // Tribe Gov wallet (EVE)
  tribeGovId: string | null;
  tribeGovTaxWalletEveMist: string;
  globalBans: AddressU64Map;     // tribe-wide bans (addr -> expiry ms)
  members: MemberRow[];          // union across the tribe's SSUs, deduped
  // Advanced-only economy
  tokenLedgerId: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  tokenDecimals: number;
  tokenSupplyCap: string;
  tokenTotalSupply: string;
  tokenBalances: AddressU64Map;  // per-user holdings — "how much every user owns"
  tribeVaultId: string | null;
  tribeVaultEveMist: string;     // "ExchangePool Wallet" (vault backs the exchange)
  exchangeConfigId: string | null;
  exchangeReserveMist: string;
}

export interface SsuSnapshot {
  ssuId: string;
  ownerAddress: string;
  bazaarType: number;            // 0=NoTribe,1=Easy,2=Advanced
  tribeId: number;               // 0 = NoTribe
  ssuGovId: string | null;
  godotUrl: string | null;
  isActive: boolean;
  frozen: boolean;
  // EVE custody
  taxWalletEveMist: string;      // SSU gov tax wallet (Easy/NoTribe; ~0 Advanced)
  wtbEscrowPoolId: string | null;
  wtbEscrowPoolEveMist: string;  // SSU gov "deposit" pool (WtbEscrowPool.total_escrowed)
  // governance config
  roleTaxTable: Record<string, unknown>;   // role -> RoleTaxConfig (raw, restored verbatim)
  shopLimitsByRole: Record<string, string>;
  localBanList: AddressU64Map;   // per-SSU bans (addr -> expiry ms)
  members: MemberRow[];          // this SSU's MemberRegistry
  // social (board ids + content)
  announcementBoardId: string | null;
  announcements: AnnouncementRow[];
  guestbookBoardId: string | null;
  guestbook: GuestbookRow[];
}

export interface BazaarSnapshot {
  schemaVersion: string;
  outgoingCheckpoint: string;
  createdByNote: string;         // free-text note (wallet filled at anchor time)
  outgoingPackageIds: {
    dapp_hub: string;
    shared_widgets: string;
    bazaar_core: string;
    bazaar_mission: string;
    bazaar_economy: string;
  };
  dappHub: { taxWalletId: string; taxWalletEveMist: string };  // "Dapphub Wallet"
  tribes: TribeSnapshot[];
  ssus: SsuSnapshot[];
  bazaarNews: AnnouncementRow[]; // global BazaarNewsBoard (capture)
  // tx_history is CAPTURE-ONLY (historical events; cannot be replayed on-chain).
  txHistory: unknown[];
}

/** Human-readable coverage counts shown to the admin before anchoring. */
export interface SnapshotSummary {
  tribes: number;
  ssus: number;
  members: number;
  tokenHolders: number;
  announcements: number;
  guestbookEntries: number;
  totalEveMist: string;
  warnings: string[];            // partial-failure notices — non-empty means GAPS
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
