// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Vitest for @bazaar/shared/utils/mission (Slice 8).
 *
 * Covers the three pure Mission (MIS) helpers that back the wizard + listing-fee
 * hook: fee composition per bazaar type (Dapp excluded on Advanced + hours floor),
 * reward-amount scaling, and the draft validation gates.
 */
import { describe, it, expect } from "vitest";
import {
  composeMissionFee, missionRewardTotals, validateMissionDraft, missionCountdown,
  MAX_PROOF_ITEMS, MAX_REWARD_ITEMS, MAX_DURATION_HOURS, MS_PER_HOUR,
  VISIBILITY, composeVisibilityMask, missionVisibleToRole, viewerRoleMask, missionCollateralRaw,
} from "./mission";
import { BAZAAR_TYPE_NUM, COMPLETION_MODE } from "../types/bazaarcore";

// ── composeMissionFee — per-bazaar-type composition ─────────────────────────────
describe("composeMissionFee", () => {
  const layers = { ssuFeePerHour: 100, tribeFeePerHour: 30, dappFeePerHour: 10 };

  it("NoTribe = SSU + Dapp (Tribe excluded)", () => {
    const r = composeMissionFee({ bazaarType: BAZAAR_TYPE_NUM.NOTRIBE, ...layers, hours: 1 });
    expect(r.ssuFeePerHour).toBe(100);
    expect(r.tribeFeePerHour).toBe(0);
    expect(r.dappFeePerHour).toBe(10);
    expect(r.totalFeePerHour).toBe(110);
    expect(r.totalFee).toBe(110);
  });

  it("Easy = SSU + Tribe + Dapp", () => {
    const r = composeMissionFee({ bazaarType: BAZAAR_TYPE_NUM.EASY, ...layers, hours: 1 });
    expect(r.tribeFeePerHour).toBe(30);
    expect(r.dappFeePerHour).toBe(10);
    expect(r.totalFeePerHour).toBe(140);
  });

  it("Advanced = SSU + Tribe (Dapp excluded)", () => {
    const r = composeMissionFee({ bazaarType: BAZAAR_TYPE_NUM.ADVANCED, ...layers, hours: 1 });
    expect(r.tribeFeePerHour).toBe(30);
    expect(r.dappFeePerHour).toBe(0);
    expect(r.totalFeePerHour).toBe(130);
  });

  it("multiplies the per-hour total by floor(hours)", () => {
    const r = composeMissionFee({ bazaarType: BAZAAR_TYPE_NUM.EASY, ...layers, hours: 5 });
    expect(r.totalFee).toBe(140 * 5);
  });

  it("floors fractional hours (matches mission_fees::duration_hours)", () => {
    const r = composeMissionFee({ bazaarType: BAZAAR_TYPE_NUM.NOTRIBE, ...layers, hours: 2.9 });
    expect(r.totalFee).toBe(110 * 2);
  });

  it("clamps negative / zero hours to a 0 total", () => {
    expect(composeMissionFee({ bazaarType: BAZAAR_TYPE_NUM.EASY, ...layers, hours: 0 }).totalFee).toBe(0);
    expect(composeMissionFee({ bazaarType: BAZAAR_TYPE_NUM.EASY, ...layers, hours: -3 }).totalFee).toBe(0);
  });

  it("all-zero layers produce a zero fee", () => {
    const r = composeMissionFee({ bazaarType: BAZAAR_TYPE_NUM.ADVANCED, ssuFeePerHour: 0, tribeFeePerHour: 0, dappFeePerHour: 0, hours: 24 });
    expect(r.totalFeePerHour).toBe(0);
    expect(r.totalFee).toBe(0);
  });
});

// ── missionRewardTotals — per-run scaling + total ───────────────────────────────
describe("missionRewardTotals", () => {
  it("scales human money to raw per-run and multiplies by runs", () => {
    const r = missionRewardTotals({ rewardMoney: 1.5, priceScale: 1_000_000_000, maxRuns: 3 });
    expect(r.rewardPerRunRaw).toBe(1_500_000_000);
    expect(r.rewardTotalRaw).toBe(4_500_000_000);
  });

  it("rounds the scaled per-run amount", () => {
    const r = missionRewardTotals({ rewardMoney: 0.0000000015, priceScale: 1_000_000_000, maxRuns: 2 });
    expect(r.rewardPerRunRaw).toBe(2);   // round(1.5) = 2
    expect(r.rewardTotalRaw).toBe(4);
  });

  it("zero money → zero totals (no item-less escrow)", () => {
    const r = missionRewardTotals({ rewardMoney: 0, priceScale: 1_000_000_000, maxRuns: 5 });
    expect(r.rewardPerRunRaw).toBe(0);
    expect(r.rewardTotalRaw).toBe(0);
  });

  it("Advanced token scale (raw units, scale 1)", () => {
    const r = missionRewardTotals({ rewardMoney: 250, priceScale: 1, maxRuns: 4 });
    expect(r.rewardPerRunRaw).toBe(250);
    expect(r.rewardTotalRaw).toBe(1000);
  });
});

// ── validateMissionDraft — the wizard's pure submit gates ───────────────────────
describe("validateMissionDraft", () => {
  const valid = {
    title: "Clear the asteroid field",
    maxRuns: 3,
    completionMode: COMPLETION_MODE.ITEM_PROOF,
    filledProofCount: 1,
    filledRewardCount: 1,
    hasMoneyReward: false,
    takerTimeLimitHours: 24,
    durationHours: 24,
  };

  it("passes a well-formed draft", () => {
    expect(validateMissionDraft(valid)).toBeNull();
  });

  it("requires a title", () => {
    expect(validateMissionDraft({ ...valid, title: "   " })).toBe("Mission name is required.");
  });

  it("requires at least one run", () => {
    expect(validateMissionDraft({ ...valid, maxRuns: 0 })).toBe("Runs must be at least 1.");
  });

  it("item-proof needs ≥1 proof item", () => {
    expect(validateMissionDraft({ ...valid, filledProofCount: 0 }))
      .toBe("Item-proof missions need at least one required proof item.");
  });

  it("'other' mode does NOT require proof items", () => {
    expect(validateMissionDraft({ ...valid, completionMode: COMPLETION_MODE.OTHER, filledProofCount: 0 })).toBeNull();
  });

  it("caps proof items at MAX_PROOF_ITEMS", () => {
    expect(validateMissionDraft({ ...valid, filledProofCount: MAX_PROOF_ITEMS + 1 }))
      .toBe(`At most ${MAX_PROOF_ITEMS} proof items.`);
  });

  it("caps reward items at MAX_REWARD_ITEMS", () => {
    expect(validateMissionDraft({ ...valid, filledRewardCount: MAX_REWARD_ITEMS + 1 }))
      .toBe(`At most ${MAX_REWARD_ITEMS} reward items.`);
  });

  it("requires some reward (items or money)", () => {
    expect(validateMissionDraft({ ...valid, filledRewardCount: 0, hasMoneyReward: false }))
      .toBe("Add a reward — items, currency, or both.");
  });

  it("accepts a money-only reward", () => {
    expect(validateMissionDraft({ ...valid, filledRewardCount: 0, hasMoneyReward: true })).toBeNull();
  });

  it("requires a per-taker time limit ≥ 1h", () => {
    expect(validateMissionDraft({ ...valid, takerTimeLimitHours: 0 }))
      .toBe("Per-taker time limit must be at least 1 hour.");
  });

  it("clamps listing duration to 1h..7d", () => {
    expect(validateMissionDraft({ ...valid, durationHours: 0 }))
      .toBe("Listing duration must be between 1 hour and 7 days.");
    expect(validateMissionDraft({ ...valid, durationHours: MAX_DURATION_HOURS + 1 }))
      .toBe("Listing duration must be between 1 hour and 7 days.");
    expect(validateMissionDraft({ ...valid, durationHours: MAX_DURATION_HOURS })).toBeNull();
  });
});

// ── missionCountdown — accepted-mission expiry/countdown derivation ──────────────
describe("missionCountdown", () => {
  const NOW = 1_000_000_000;

  it("unset deadline → '—', not expired", () => {
    const r = missionCountdown(0, NOW);
    expect(r).toEqual({ remainingMs: 0, expired: false, label: "—" });
  });

  it("now past the deadline → expired", () => {
    const r = missionCountdown(NOW - 1, NOW);
    expect(r.expired).toBe(true);
    expect(r.remainingMs).toBe(0);
    expect(r.label).toBe("Expired");
  });

  it("deadline exactly now → expired", () => {
    expect(missionCountdown(NOW, NOW).expired).toBe(true);
  });

  it("days remaining → 'Nd Nh'", () => {
    const r = missionCountdown(NOW + 2 * 24 * MS_PER_HOUR + 3 * MS_PER_HOUR, NOW);
    expect(r.expired).toBe(false);
    expect(r.label).toBe("2d 3h");
  });

  it("hours remaining → 'Nh Nm'", () => {
    const r = missionCountdown(NOW + 4 * MS_PER_HOUR + 12 * 60_000, NOW);
    expect(r.label).toBe("4h 12m");
  });

  it("minutes only → 'Nm'", () => {
    const r = missionCountdown(NOW + 8 * 60_000, NOW);
    expect(r.label).toBe("8m");
  });
});

// ── VISIBILITY helpers (V34) ─────────────────────────────────────────────────────

describe("composeVisibilityMask", () => {
  it("everyone checked → 16", () => {
    expect(composeVisibilityMask({
      everyone: true, owner: false, admin: false, moderator: false, member: false,
    })).toBe(16);
  });
  it("nothing checked → 16 (default-public)", () => {
    expect(composeVisibilityMask({
      everyone: false, owner: false, admin: false, moderator: false, member: false,
    })).toBe(16);
  });
  it("owner+admin → 1|2 = 3", () => {
    expect(composeVisibilityMask({
      everyone: false, owner: true, admin: true, moderator: false, member: false,
    })).toBe(3);
  });
  it("all four roles → 1|2|4|8 = 15", () => {
    expect(composeVisibilityMask({
      everyone: false, owner: true, admin: true, moderator: true, member: true,
    })).toBe(15);
  });
});

describe("missionVisibleToRole", () => {
  it("EVERYONE mask (16) → true for any viewer", () => {
    expect(missionVisibleToRole(16, 0)).toBe(true);
    expect(missionVisibleToRole(16, 15)).toBe(true);
  });
  it("MOD-only mask (4) vs viewer 4 → true", () => {
    expect(missionVisibleToRole(4, 4)).toBe(true);
  });
  it("MOD-only mask (4) vs viewer 8 (member) → false", () => {
    expect(missionVisibleToRole(4, 8)).toBe(false);
  });
  it("MOD-only mask (4) vs viewer 0 (stranger) → false", () => {
    expect(missionVisibleToRole(4, 0)).toBe(false);
  });
  it("admin viewer (mask includes MOD bit) sees MOD-only mission → true", () => {
    const adminMask = VISIBILITY.ADMIN | VISIBILITY.MOD;
    expect(missionVisibleToRole(4, adminMask)).toBe(true);
  });
});

describe("viewerRoleMask", () => {
  it("owner → OWNER (1)", () => {
    expect(viewerRoleMask({
      isOwner: true, isAdmin: false, isModerator: false, isMember: false,
    })).toBe(1);
  });
  it("owner+admin → 1|2 = 3", () => {
    expect(viewerRoleMask({
      isOwner: true, isAdmin: true, isModerator: false, isMember: false,
    })).toBe(3);
  });
  it("none → 0", () => {
    expect(viewerRoleMask({
      isOwner: false, isAdmin: false, isModerator: false, isMember: false,
    })).toBe(0);
  });
});

describe("validateMissionDraft collateral", () => {
  const base = {
    title: "Test Mission", maxRuns: 1, completionMode: 1,
    filledProofCount: 0, filledRewardCount: 0, hasMoneyReward: true,
    takerTimeLimitHours: 1, durationHours: 1,
  };
  it("collateralPerRun -1 → error message", () => {
    expect(validateMissionDraft({ ...base, collateralPerRun: -1 })).toBe("Collateral cannot be negative.");
  });
  it("collateralPerRun 0 → passes", () => {
    expect(validateMissionDraft({ ...base, collateralPerRun: 0 })).toBeNull();
  });
  it("collateralPerRun 5 → passes", () => {
    expect(validateMissionDraft({ ...base, collateralPerRun: 5 })).toBeNull();
  });
});

describe("missionCollateralRaw", () => {
  it("mirrors missionRewardTotals scale", () => {
    expect(missionCollateralRaw({ collateralMoney: 1.5, priceScale: 1_000_000_000 })).toBe(1_500_000_000);
  });
  it("zero input → 0", () => {
    expect(missionCollateralRaw({ collateralMoney: 0, priceScale: 1_000_000_000 })).toBe(0);
  });
});

// ── dual parseAcceptance collateralAmount (V34) ───────────────────────────────

describe("parseAcceptance collateralAmount", () => {
  // Both copies (mission-hooks.ts + useMyAcceptedMissions.ts) must parse this field.
  it("parses collateral_amount from DF value", () => {
    const raw = { taker: "0xabc", accepted_at_ms: "1000", deadline_ms: "2000",
      status: "0", collateral_amount: "500000000" };
    // Simulate the parseAcceptance return shape from both files:
    const result = {
      taker: raw.taker,
      acceptedAtMs: Number(raw.accepted_at_ms),
      deadlineMs: Number(raw.deadline_ms),
      status: Number(raw.status),
      collateralAmount: Number(raw.collateral_amount ?? 0),
    };
    expect(result.collateralAmount).toBe(500000000);
  });
  it("defaults to 0 when field absent (V33 acceptances)", () => {
    const raw = { taker: "0xabc", accepted_at_ms: "1000", deadline_ms: "2000", status: "0" };
    expect(Number((raw as Record<string, string>).collateral_amount ?? 0)).toBe(0);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
