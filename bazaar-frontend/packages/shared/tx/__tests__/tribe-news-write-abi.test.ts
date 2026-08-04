// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * tribe-news-write-abi.test.ts — pins the tribe-news write arg vector against
 * bazaar_mission::announcement_proxy::tribe_post_announcement.
 *
 * Regression guard for the V37 Announcement-beacon rework, which wired the
 * previously-unused buildPostTribeAnnouncement into the in-world AnnouncementNewsWindow
 * ("Write Tribe News"). The Move entry is:
 *   cap[0], tribe_gov[1], board[2], package_id[3], title[4], body[5], visibility[6], clock[7]
 * — an arg-order mismatch would abort the post.
 */

import { describe, it, expect } from "vitest";
import { ID, CLOCK, lastCall, describeCalls, expectArgs } from "./abi-snapshot-helpers";
import {
  buildPostTribeAnnouncement,
  buildBroadcastTribeAnnouncement,
} from "../bazaarcore/announcement-tx";

const CAP = ID(0xc1), TRIBE_GOV = ID(0xc2), BOARD = ID(0xc3);

describe("buildPostTribeAnnouncement ABI", () => {
  it("targets tribe_post_announcement with the ordered 8-arg vector", () => {
    const tx = buildPostTribeAnnouncement({
      tribeAdminCapId: CAP,
      tribeGovernanceId: TRIBE_GOV,
      announcementBoardId: BOARD,
      title: "Tribe-wide notice",
      body: "Body text",
      visibility: 0,
    });

    const call = lastCall(tx);
    expect(call.target).toMatch(/tribe_post_announcement$/);
    // cap, tribe_gov, board, package_id(pure), title(pure), body(pure), visibility(pure), clock
    expectArgs(call.args, [CAP, TRIBE_GOV, BOARD, "pure", "pure", "pure", "pure", CLOCK]);
  });
});

describe("buildBroadcastTribeAnnouncement ABI", () => {
  const BOARDS = [ID(0xb1), ID(0xb2), ID(0xb3)];

  it("emits one tribe_post_announcement per board, each with the 8-arg vector", () => {
    const tx = buildBroadcastTribeAnnouncement({
      tribeAdminCapId: CAP,
      tribeGovernanceId: TRIBE_GOV,
      boardIds: BOARDS,
      title: "Tribe broadcast",
      body: "To every SSU",
      visibility: 0,
    });

    const calls = describeCalls(tx).filter(c => /tribe_post_announcement$/.test(c.target));
    expect(calls.length).toBe(BOARDS.length);
    // Each call writes a DISTINCT board id at arg[2]; shared cap/gov/content reused.
    calls.forEach((call, i) => {
      expectArgs(call.args, [CAP, TRIBE_GOV, BOARDS[i], "pure", "pure", "pure", "pure", CLOCK]);
    });
  });

  it("produces no calls when there are no boards (caller must guard)", () => {
    const tx = buildBroadcastTribeAnnouncement({
      tribeAdminCapId: CAP,
      tribeGovernanceId: TRIBE_GOV,
      boardIds: [],
      title: "x",
      body: "y",
      visibility: 0,
    });
    expect(describeCalls(tx).length).toBe(0);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
