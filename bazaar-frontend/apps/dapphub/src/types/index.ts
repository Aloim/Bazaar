// DappHub types — DappHub-specific type definitions.
// Shared types live in @bazaar/shared; these are local to the hub app.

/** Navigation screens available in DappHub. */
export type DappHubScreen =
  | "landing"
  | "no-tribe-register"
  | "join-tribe"
  | "application"
  | "easy-create"
  | "advanced-create"
  | "my-ssus"
  | "contact"
  | "tribe-governance"
  | "ssu-governance"
  | "management";

/** Optional payload threaded through nav() for screens that need contextual data. */
export interface NavPayload {
  tribeId?: string;
  tribeName?: string;
}

/** nav function signature shared by DappHub screens. */
export type NavFn = (screen: DappHubScreen, payload?: NavPayload) => void;

/** Tribe summary as displayed in the Join Tribe list. */
export interface TribeSummary {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  ssuCount: number;
  bazaarType: "easy" | "advanced";
  isOpenRegistration: boolean;
}

/** SSU registration record for the My Registered SSUs view. */
export interface RegisteredSSU {
  ssuId: string;
  tribeId: string | null;
  tribeName: string | null;
  url: string;
  status: "active" | "pending" | "inactive";
  registeredAt: number;
}

/** Tribe application submitted by a user. */
export interface TribeApplication {
  id: string;
  tribeId: string;
  tribeName: string;
  applicantAddress: string;
  ssuId: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: number;
}

/** Contact/support ticket. */
export interface SupportTicket {
  id: string;
  title: string;
  tag: TicketTag;
  body: string;
  contactMethod: "discord" | "email" | "none";
  contactValue: string;
  authorAddress: string;
  status: "open" | "in-progress" | "resolved" | "closed";
  createdAt: number;
}

export type TicketTag =
  | "bug"
  | "feature-request"
  | "ssu-issue"
  | "tribe-issue"
  | "account"
  | "other";

/** DApp management tab identifiers. */
export type ManagementTab =
  | "tribes"
  | "ssus"
  | "taxes-fees"
  | "tax-wallet"
  | "bazaar-news"
  | "tickets"
  | "upgrade"
  | "ceremony";

// (Local DAppTaxConfig + TaxWalletData interfaces DELETED Phase 8 A4 — dead
//  pre-V31 shapes with zero consumers; the live shapes come from
//  @bazaar/shared/types via the shared hooks.)

