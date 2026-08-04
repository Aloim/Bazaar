// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * mission-advanced-create-abi.test.ts — pins the Advanced mission-create arg
 * vector against bazaar_economy::mission_ledger_ops::create_mission_advanced.
 *
 * Regression guard for the "ArityMismatch in command 5" bug: the Move entry takes
 * `members: &MemberRegistry` right after `cap_store` (the AUD-ADV-12 static
 * membership-ban check), but the FE builder used to skip it, shifting every later
 * arg and aborting the create_mission_advanced call with an arity mismatch.
 */

import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { SHARED_OBJECTS, MISSION_REGISTRY_ID } from "../../constants";
import { ID, CLOCK, lastCall, expectArgs } from "./abi-snapshot-helpers";
import { buildCreateMissionAdvanced } from "../bazaareconomy/mission-ledger-tx";

const SSU_GOV = ID(0xa2), TRIBE_GOV = ID(0xa3), MEMBERS = ID(0xa4),
      SSU = ID(0xa6), LEDGER = ID(0xb1), CHAR = ID(0xd2);

describe("buildCreateMissionAdvanced ABI", () => {
  it("passes members: &MemberRegistry at slot 5 (after cap_store)", () => {
    const tx = new Transaction();
    buildCreateMissionAdvanced({
      ssuGovId: SSU_GOV, tribeGovId: TRIBE_GOV, ledgerId: LEDGER, memberRegistryId: MEMBERS,
      ssuId: SSU, characterId: CHAR,
      missionType: 0, title: "t", description: "d", completionMode: 1,
      proofItems: [], rewardItems: [], maxRuns: 1,
      rewardTokenPerRun: 0, collateralTokenPerRun: 0, visibilityRoles: 16,
      takerTimeLimitMs: 0, durationMs: 0, positionX: 0, positionY: 0,
      listingFeeTokens: 0,
    }, tx);

    const call = lastCall(tx);
    expect(call.target).toMatch(/create_mission_advanced$/);
    // registry, ssu_gov, tribe_gov, ledger, cap_store, members,
    // 12 value args, reward_bundles (in-PTB result), 5 value args, clock.
    expectArgs(call.args, [
      MISSION_REGISTRY_ID, SSU_GOV, TRIBE_GOV, LEDGER, SHARED_OBJECTS.ECONOMY_CAP_STORE, MEMBERS,
      "pure", "pure", "pure", "pure", "pure", "pure", "pure", "pure", "pure", "pure", "pure", "pure",
      "result",
      "pure", "pure", "pure", "pure", "pure",
      CLOCK,
    ]);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
