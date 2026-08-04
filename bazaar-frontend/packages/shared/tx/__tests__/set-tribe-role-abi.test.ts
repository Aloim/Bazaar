// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * set-tribe-role-abi.test.ts — pins the tribe-role write arg vector against
 * bazaar_core::membership::set_tribe_role.
 *
 * Regression guard for the 2026-06-23 Tribe Users & Roles rework, which switched
 * the tribe roster from ssu_role display/edit to TRIBE-role (leader-only) editing
 * via buildSetTribeRolesBatch. The Move entry is:
 *   leader_cap[0], tribe_gov[1], registry[2], player(pure addr)[3], role(pure u8)[4]
 * — an arg-order mismatch would abort the role change.
 */

import { describe, it, expect } from "vitest";
import { ID, lastCall, describeCalls, expectArgs } from "./abi-snapshot-helpers";
import { buildSetTribeRolesBatch } from "../bazaarcore/membership-tx";

const LEADER_CAP = ID(0xa1), TRIBE_GOV = ID(0xa2);
const REG1 = ID(0xb1), REG2 = ID(0xb2);
const PLAYER = ID(0xc1);

describe("buildSetTribeRolesBatch ABI", () => {
  it("targets set_tribe_role with the ordered 5-arg vector", () => {
    const tx = buildSetTribeRolesBatch({
      leaderCapId: LEADER_CAP,
      tribeGovernanceId: TRIBE_GOV,
      updates: [{ memberRegistryId: REG1, player: PLAYER, role: 5 }],
    });
    const call = lastCall(tx);
    expect(call.target).toMatch(/set_tribe_role$/);
    // leader_cap, tribe_gov, registry, player(pure), role(pure)
    expectArgs(call.args, [LEADER_CAP, TRIBE_GOV, REG1, "pure", "pure"]);
  });

  it("emits one set_tribe_role per membership, sharing cap + gov", () => {
    const tx = buildSetTribeRolesBatch({
      leaderCapId: LEADER_CAP,
      tribeGovernanceId: TRIBE_GOV,
      updates: [
        { memberRegistryId: REG1, player: PLAYER, role: 4 },
        { memberRegistryId: REG2, player: PLAYER, role: 4 },
      ],
    });
    const calls = describeCalls(tx).filter(c => /set_tribe_role$/.test(c.target));
    expect(calls.length).toBe(2);
    expectArgs(calls[0].args, [LEADER_CAP, TRIBE_GOV, REG1, "pure", "pure"]);
    expectArgs(calls[1].args, [LEADER_CAP, TRIBE_GOV, REG2, "pure", "pure"]);
  });

  it("produces no calls for an empty update list (caller must guard)", () => {
    const tx = buildSetTribeRolesBatch({
      leaderCapId: LEADER_CAP,
      tribeGovernanceId: TRIBE_GOV,
      updates: [],
    });
    expect(describeCalls(tx).length).toBe(0);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
