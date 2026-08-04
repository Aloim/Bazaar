// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Vitest for @bazaar/shared/utils/shopStacks.
 *
 * Covers position bucketing, stable stack-id selection (highest-priority
 * member), OWN→TRIBE→OTHER member ordering, the stack tier/colour, and the
 * single-shop pass-through invariant (stack id === member id).
 */
import { describe, it, expect } from "vitest";
import { groupShopsByPosition, type ShopStackInput } from "./shopStacks";
import { TIER_COLOR } from "./shopTier";
import type { ShopTierContext } from "./shopTier";

const OWN_SSU = "0xown";
const OTHER_SSU = "0xother";

function shop(p: Partial<ShopStackInput> & { id: string }): ShopStackInput {
  return { ssuId: OTHER_SSU, bazaarType: 0, tribeId: 0, positionX: 0, positionY: 0, ...p };
}

// Current SSU is a NoTribe bazaar: own = OWN_SSU, tribe = any NoTribe shop, other = rest.
const ctx: ShopTierContext = { currentSsuId: OWN_SSU, currentBazaarType: "NoTribe", currentTribeId: null };

describe("groupShopsByPosition — bucketing", () => {
  it("puts shops at the same position into one stack and distinct positions into separate stacks", () => {
    const stacks = groupShopsByPosition(
      [
        shop({ id: "a", positionX: 10, positionY: 20 }),
        shop({ id: "b", positionX: 10, positionY: 20 }),
        shop({ id: "c", positionX: 99, positionY: 1 }),
      ],
      ctx,
    );
    expect(stacks).toHaveLength(2);
    const big = stacks.find(s => s.count === 2)!;
    expect(big.members.map(m => m.shop.id).sort()).toEqual(["a", "b"]);
    expect(stacks.find(s => s.count === 1)!.members[0].shop.id).toBe("c");
  });

  it("rounds fractional positions to bucket co-located shops", () => {
    const stacks = groupShopsByPosition(
      [shop({ id: "a", positionX: 10.2, positionY: 5.0 }), shop({ id: "b", positionX: 9.8, positionY: 4.6 })],
      ctx,
    );
    expect(stacks).toHaveLength(1);
    expect(stacks[0].count).toBe(2);
  });
});

describe("groupShopsByPosition — stable id + ordering", () => {
  it("uses the highest-priority member (OWN) as the stack id and lead, regardless of input order", () => {
    const stacks = groupShopsByPosition(
      [
        shop({ id: "other1", ssuId: OTHER_SSU, bazaarType: 2 }), // Advanced → other
        shop({ id: "ownShop", ssuId: OWN_SSU }),                  // own
        shop({ id: "tribe1", ssuId: OTHER_SSU, bazaarType: 0 }),  // NoTribe → tribe
      ],
      ctx,
    );
    expect(stacks).toHaveLength(1);
    const st = stacks[0];
    expect(st.id).toBe("ownShop");
    expect(st.tier).toBe("own");
    expect(st.color).toBe(TIER_COLOR.own);
    expect(st.members.map(m => m.tier)).toEqual(["own", "tribe", "other"]);
  });

  it("single-shop stack keeps the member's own id (pass-through invariant)", () => {
    const stacks = groupShopsByPosition([shop({ id: "solo", ssuId: OWN_SSU })], ctx);
    expect(stacks[0].id).toBe("solo");
    expect(stacks[0].count).toBe(1);
  });

  it("falls back to mapX/mapY when positionX/Y are absent", () => {
    const stacks = groupShopsByPosition(
      [
        { id: "m1", ssuId: OWN_SSU, bazaarType: 0, tribeId: 0, mapX: 7, mapY: 8 },
        { id: "m2", ssuId: OTHER_SSU, bazaarType: 0, tribeId: 0, mapX: 7, mapY: 8 },
      ],
      ctx,
    );
    expect(stacks).toHaveLength(1);
    expect(stacks[0].count).toBe(2);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
