// bazaar-frontend | ABI snapshot tests pinning the nine new depreciation and prune TX builders
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ssu-depreciation-abi.test.ts — pins the V41 SSU depreciation/prune TX builders
 * against the landed Move ABIs (BazaarCore::ssu_depreciation,
 * BazaarShopOps::ssu_depreciation_ops, BazaarMission::ssu_depreciation_missions,
 * BazaarEconomy::ssu_depreciation_economy). Mirrors reclaim-ssu-abi.test.ts.
 */

import { describe, it, expect } from "vitest";
import { ID, CLOCK, lastCall, describeCalls, expectArgs } from "./abi-snapshot-helpers";
import {
  buildMarkSsuRevealed,
  buildMarkSsuDepreciated,
  buildMarkSsuDepreciatedSequence,
} from "../bazaarcore/ssu-depreciation-tx";
import { buildPruneDepreciatedShopsPage } from "../bazaarcore/ssu-depreciation-ops-tx";
import {
  buildPruneDepreciatedMissionCollateralPage,
  buildPruneDepreciatedMissionReward,
  buildPruneDepreciatedMissionItemsPage,
} from "../bazaarmission/ssu-depreciation-missions-tx";
import {
  buildPruneDepreciatedWtbTokenPage,
  buildPruneDepreciatedMissionRewardToken,
} from "../bazaareconomy/ssu-depreciation-economy-tx";

const GOV = ID(0x10), LOC = ID(0x11), REG = ID(0x12), POOL = ID(0x13);
const LEDGER = ID(0x14), MREG = ID(0x15), MPOOL = ID(0x16), MISSION = ID(0x30);

describe("SSU depreciation mark builders ABI", () => {
  it("mark_ssu_revealed — 2 args, no clock", () => {
    const tx = buildMarkSsuRevealed({ ssuGovId: GOV, locationRegistryId: LOC });
    const call = lastCall(tx);
    expect(call.target).toMatch(/ssu_depreciation::mark_ssu_revealed$/);
    expectArgs(call.args, [GOV, LOC]);
  });

  it("mark_ssu_depreciated — 3 args incl. clock", () => {
    const tx = buildMarkSsuDepreciated({ ssuGovId: GOV, locationRegistryId: LOC });
    const call = lastCall(tx);
    expect(call.target).toMatch(/ssu_depreciation::mark_ssu_depreciated$/);
    expectArgs(call.args, [GOV, LOC, CLOCK]);
  });

  it("sequence composes revealed THEN depreciated in one PTB", () => {
    const tx = buildMarkSsuDepreciatedSequence({ ssuGovId: GOV, locationRegistryId: LOC });
    const targets = describeCalls(tx).map((c) => c.target);
    expect(targets[0]).toMatch(/mark_ssu_revealed$/);
    expect(targets[1]).toMatch(/mark_ssu_depreciated$/);
    expect(targets).toHaveLength(2);
  });
});

describe("prune_depreciated_shops_page ABI", () => {
  it("emits the exact 6-arg vector (registry, gov, pool, shop_ids, cap_store, clock)", () => {
    const tx = buildPruneDepreciatedShopsPage({
      ssuGovId: GOV, wtbEscrowPoolId: POOL, bazarRegistryId: REG, shopIds: [ID(0x20), ID(0x21)],
    });
    const call = lastCall(tx);
    expect(call.target).toMatch(/ssu_depreciation_ops::prune_depreciated_shops_page$/);
    expect(call.args).toHaveLength(6);
    expect(call.args[3]).toBe("pure"); // shop_ids vector
    // CR-P6-03: @mysten/sui normalizes SUI_CLOCK_ID ("0x6") to a full 64-hex
    // address, so the raw arg is "obj:0x000…0006", not "obj:0x6" — compare the
    // same way expectArgs does for every OTHER object arg in this suite (strip
    // the "obj:" prefix, then BigInt-normalize) instead of a literal string match.
    expect(call.args[5].startsWith("obj:")).toBe(true);
    expect(BigInt(call.args[5].slice(4))).toBe(BigInt(CLOCK));
  });
});

describe("mission prune builders ABI", () => {
  it("collateral page — registry, gov, mission_id(pure), pool, takers(pure), clock", () => {
    const tx = buildPruneDepreciatedMissionCollateralPage({
      ssuGovId: GOV, missionCollateralPoolId: MPOOL, missionRegistryId: MREG,
      missionId: MISSION, takers: [ID(0x31)],
    });
    const call = lastCall(tx);
    expect(call.target).toMatch(/ssu_depreciation_missions::prune_depreciated_mission_collateral_page$/);
    expectArgs(call.args, [MREG, GOV, "pure", MPOOL, "pure", CLOCK]);
  });

  it("reward close — 4 args, no pagination", () => {
    const tx = buildPruneDepreciatedMissionReward({ ssuGovId: GOV, missionRegistryId: MREG, missionId: MISSION });
    expectArgs(lastCall(tx).args, [MREG, GOV, "pure", CLOCK]);
  });

  it("items page — max_pops defaults to 100 (pure arg present)", () => {
    const tx = buildPruneDepreciatedMissionItemsPage({ ssuGovId: GOV, missionRegistryId: MREG, missionId: MISSION });
    expectArgs(lastCall(tx).args, [MREG, GOV, "pure", "pure", CLOCK]);
  });
});

describe("economy prune builders ABI", () => {
  it("wtb token page — gov, registry, pool, ledger, shop_ids(pure), clock", () => {
    const tx = buildPruneDepreciatedWtbTokenPage({
      ssuGovId: GOV, bazarRegistryId: REG, tribeTokenWtbPoolId: POOL, ledgerId: LEDGER, shopIds: [ID(0x40)],
    });
    expectArgs(lastCall(tx).args, [GOV, REG, POOL, LEDGER, "pure", CLOCK]);
  });

  it("mission reward-token — 5 args, single row, no pagination", () => {
    const tx = buildPruneDepreciatedMissionRewardToken({
      ssuGovId: GOV, missionRegistryId: MREG, ledgerId: LEDGER, missionId: MISSION,
    });
    expectArgs(lastCall(tx).args, [GOV, MREG, LEDGER, "pure", CLOCK]);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
