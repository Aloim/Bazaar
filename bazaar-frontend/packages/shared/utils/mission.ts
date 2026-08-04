// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Pure Mission (MIS) helpers — RPC-free logic shared by the wizard, the listing-fee
 * hook, and their unit tests (Slice 8). Keeping these pure makes the fee composition,
 * draft validation, and reward-amount math testable without a live Sui RPC or a React
 * render.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { BAZAAR_TYPE_NUM, COMPLETION_MODE, type BazaarTypeNum } from "../types/bazaarcore";

// ── Visibility bitmask constants (MUST mirror Move constants in mission.move:46-50)
// VIS_OWNER=1, VIS_ADMIN=2, VIS_MOD=4, VIS_MEMBER=8, VIS_EVERYONE=16
export const VISIBILITY = {
  OWNER:    1,
  ADMIN:    2,
  MOD:      4,
  MEMBER:   8,
  EVERYONE: 16,
} as const;

export interface VisibilityCheckboxState {
  everyone: boolean;
  owner: boolean;
  admin: boolean;
  moderator: boolean;
  member: boolean;
}

/** Compose a visibility bitmask from the checkbox state. Nothing checked → EVERYONE. */
export function composeVisibilityMask(s: VisibilityCheckboxState): number {
  if (s.everyone || (!s.owner && !s.admin && !s.moderator && !s.member)) {
    return VISIBILITY.EVERYONE;
  }
  return (s.owner     ? VISIBILITY.OWNER  : 0)
       | (s.admin     ? VISIBILITY.ADMIN  : 0)
       | (s.moderator ? VISIBILITY.MOD    : 0)
       | (s.member    ? VISIBILITY.MEMBER : 0);
}

/** True when a viewer with `viewerRoleMask` may see a stall gated by `missionMask`.
 *  Owned/accepted exemptions are applied by the caller, not here. */
export function missionVisibleToRole(missionMask: number, viewerRoleMask: number): boolean {
  if ((missionMask & VISIBILITY.EVERYONE) !== 0) return true;
  return (missionMask & viewerRoleMask) !== 0;
}

/** Map useRoles flags to a viewer role bitmask for missionVisibleToRole.
 *  useRoles cascades (an admin has isModerator=true), so higher roles automatically
 *  match lower-gated missions. */
export function viewerRoleMask(r: {
  isOwner: boolean; isAdmin: boolean; isModerator: boolean; isMember: boolean;
}): number {
  return (r.isOwner     ? VISIBILITY.OWNER  : 0)
       | (r.isAdmin     ? VISIBILITY.ADMIN  : 0)
       | (r.isModerator ? VISIBILITY.MOD    : 0)
       | (r.isMember    ? VISIBILITY.MEMBER : 0);
}

/** Scale collateral money input to raw units (mirrors missionRewardTotals). */
export function missionCollateralRaw(args: {
  collateralMoney: number;
  priceScale: number;
}): number {
  return args.collateralMoney > 0 ? Math.round(args.collateralMoney * args.priceScale) : 0;
}

// ── Wizard constants (canonical source; re-exported by MissionSteps) ────────────
export const MAX_PROOF_ITEMS = 10;
export const MAX_REWARD_ITEMS = 10;
export const MIN_DURATION_HOURS = 1;
export const MAX_DURATION_HOURS = 168;          // 7 days
export const MS_PER_HOUR = 3_600_000;

// ── Fee composition (mirrors mission_fees / mission_ledger_ops + the excludeDapp rule) ──
//   NoTribe  = SSU + Dapp
//   Easy     = SSU + Tribe + Dapp
//   Advanced = SSU + Tribe            (no Dapp layer)
// total = Σ(applicable layer per-hour fee) × floor(max(0, hours)).
export interface ComposeMissionFeeInput {
  bazaarType: BazaarTypeNum;
  ssuFeePerHour: number;
  tribeFeePerHour: number;
  dappFeePerHour: number;
  hours: number;
}
export interface ComposedMissionFee {
  ssuFeePerHour: number;
  tribeFeePerHour: number;
  dappFeePerHour: number;
  totalFeePerHour: number;
  totalFee: number;
}
export function composeMissionFee(i: ComposeMissionFeeInput): ComposedMissionFee {
  const tribeApplies = i.bazaarType !== BAZAAR_TYPE_NUM.NOTRIBE;
  const excludeDapp = i.bazaarType === BAZAAR_TYPE_NUM.ADVANCED;
  const ssuFeePerHour = i.ssuFeePerHour;
  const tribeFeePerHour = tribeApplies ? i.tribeFeePerHour : 0;
  const dappFeePerHour = excludeDapp ? 0 : i.dappFeePerHour;
  const totalFeePerHour = ssuFeePerHour + tribeFeePerHour + dappFeePerHour;
  const wholeHours = Math.max(0, Math.floor(i.hours));
  return {
    ssuFeePerHour,
    tribeFeePerHour,
    dappFeePerHour,
    totalFeePerHour,
    totalFee: totalFeePerHour * wholeHours,
  };
}

// ── Reward-amount math (scale per-run money to raw, total = per-run × runs) ──────
export function missionRewardTotals(args: {
  rewardMoney: number;      // human units (EVE or tokens)
  priceScale: number;       // MIST 1e9 for NoTribe/Easy, 10^tokenDecimals for Advanced
  maxRuns: number;
}): { rewardPerRunRaw: number; rewardTotalRaw: number } {
  const rewardPerRunRaw = args.rewardMoney > 0 ? Math.round(args.rewardMoney * args.priceScale) : 0;
  return { rewardPerRunRaw, rewardTotalRaw: rewardPerRunRaw * args.maxRuns };
}

// ── Accepted-mission countdown (deadline vs now → remaining / expired) ───────────
export interface MissionCountdown {
  remainingMs: number;   // clamped ≥ 0
  expired: boolean;      // now ≥ deadline
  label: string;         // human "2d 3h" / "4h 12m" / "8m" / "Expired"
}

/** Derive the per-taker time-limit countdown for an accepted mission. Pure: callers
 *  pass `nowMs` (Date.now()) so it stays testable without a clock. A non-positive
 *  deadline (unset) yields "—" with no expiry. */
export function missionCountdown(deadlineMs: number, nowMs: number): MissionCountdown {
  if (!deadlineMs || deadlineMs <= 0) return { remainingMs: 0, expired: false, label: "—" };
  const remainingMs = Math.max(0, deadlineMs - nowMs);
  if (remainingMs === 0) return { remainingMs: 0, expired: true, label: "Expired" };
  const totalMin = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const label = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return { remainingMs, expired: false, label };
}

// ── Draft validation (the pure subset of the wizard's handleSubmit guards) ──────
export interface MissionDraftValidation {
  title: string;
  maxRuns: number;
  completionMode: number;     // 0 item-proof, 1 other
  filledProofCount: number;
  filledRewardCount: number;
  hasMoneyReward: boolean;
  takerTimeLimitHours: number;
  durationHours: number;
  collateralPerRun?: number;  // NEW — optional so callers that don't use collateral need no change
}

/** First validation error message, or null when the draft passes the pure checks.
 *  Messages + order are byte-identical to the wizard's inline guards. */
export function validateMissionDraft(d: MissionDraftValidation): string | null {
  if (!d.title.trim()) return "Mission name is required.";
  if (d.maxRuns < 1) return "Runs must be at least 1.";
  if (d.completionMode === COMPLETION_MODE.ITEM_PROOF && d.filledProofCount === 0) {
    return "Item-proof missions need at least one required proof item.";
  }
  if (d.filledProofCount > MAX_PROOF_ITEMS) return `At most ${MAX_PROOF_ITEMS} proof items.`;
  if (d.filledRewardCount > MAX_REWARD_ITEMS) return `At most ${MAX_REWARD_ITEMS} reward items.`;
  if (!(d.filledRewardCount > 0 || d.hasMoneyReward)) return "Add a reward — items, currency, or both.";
  if ((d.collateralPerRun ?? 0) < 0) return "Collateral cannot be negative.";
  if (d.takerTimeLimitHours < 1) return "Per-taker time limit must be at least 1 hour.";
  if (d.durationHours < MIN_DURATION_HOURS || d.durationHours > MAX_DURATION_HOURS) {
    return "Listing duration must be between 1 hour and 7 days.";
  }
  return null;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
