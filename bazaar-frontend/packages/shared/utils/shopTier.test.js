// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * Vitest for @bazaar/shared/utils/shopTier.
 *
 * Covers the bazaar-type-aware tier classifier across all three current-SSU
 * contexts (NoTribe / Easy / Advanced), the OWN-precedence rule, and the
 * tribeId=0 / loading edge cases.
 */
import { describe, it, expect } from "vitest";
import { classifyShopTier } from "./shopTier";
const OWN_SSU = "0xown";
const OTHER_SSU = "0xother";
function shop(p) {
    return { ssuId: OTHER_SSU, bazaarType: 0, tribeId: 0, ...p };
}
describe("classifyShopTier — OWN precedence", () => {
    const ctx = { currentSsuId: OWN_SSU, currentBazaarType: "Advanced", currentTribeId: 7 };
    it("returns 'own' for a shop on the current SSU regardless of tribe/type", () => {
        expect(classifyShopTier(shop({ ssuId: OWN_SSU, bazaarType: 2, tribeId: 99 }), ctx)).toBe("own");
    });
});
describe("classifyShopTier — NoTribe context", () => {
    const ctx = { currentSsuId: OWN_SSU, currentBazaarType: "NoTribe", currentTribeId: null };
    it("classifies another NoTribe shop as 'tribe' (the whole NoTribe set is the tribe)", () => {
        expect(classifyShopTier(shop({ ssuId: OTHER_SSU, bazaarType: 0 }), ctx)).toBe("tribe");
    });
    it("classifies an Easy shop as 'other'", () => {
        expect(classifyShopTier(shop({ ssuId: OTHER_SSU, bazaarType: 1 }), ctx)).toBe("other");
    });
    it("classifies an Advanced shop as 'other' (fixes Advanced-shows-in-NoTribe)", () => {
        expect(classifyShopTier(shop({ ssuId: OTHER_SSU, bazaarType: 2 }), ctx)).toBe("other");
    });
});
describe("classifyShopTier — Easy/Advanced context", () => {
    const ctx = { currentSsuId: OWN_SSU, currentBazaarType: "Easy", currentTribeId: 42 };
    it("classifies a same-tribe shop as 'tribe'", () => {
        expect(classifyShopTier(shop({ ssuId: OTHER_SSU, bazaarType: 1, tribeId: 42 }), ctx)).toBe("tribe");
    });
    it("classifies a different-tribe shop as 'other'", () => {
        expect(classifyShopTier(shop({ ssuId: OTHER_SSU, bazaarType: 1, tribeId: 43 }), ctx)).toBe("other");
    });
    it("matches tribe across bazaar types (Advanced sibling SSU in same tribe)", () => {
        expect(classifyShopTier(shop({ ssuId: OTHER_SSU, bazaarType: 2, tribeId: 42 }), ctx)).toBe("tribe");
    });
});
describe("classifyShopTier — edge cases", () => {
    it("never classifies tribeId=0 as 'tribe' under Easy/Advanced", () => {
        const ctx = { currentSsuId: OWN_SSU, currentBazaarType: "Advanced", currentTribeId: 0 };
        expect(classifyShopTier(shop({ ssuId: OTHER_SSU, bazaarType: 2, tribeId: 0 }), ctx)).toBe("other");
    });
    it("falls back to 'other' (never wrong 'tribe') while context type is null/loading", () => {
        const ctx = { currentSsuId: OWN_SSU, currentBazaarType: null, currentTribeId: null };
        expect(classifyShopTier(shop({ ssuId: OTHER_SSU, bazaarType: 0 }), ctx)).toBe("other");
    });
    it("still resolves OWN even while context type is null/loading", () => {
        const ctx = { currentSsuId: OWN_SSU, currentBazaarType: null, currentTribeId: null };
        expect(classifyShopTier(shop({ ssuId: OWN_SSU }), ctx)).toBe("own");
    });
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
