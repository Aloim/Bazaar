// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * builder-abi-snapshots-v36.test.ts — V36 ABI-break branch snapshots (R-A/B/C ban
 * fold-in + B1 shop-create split + B4 DH-10 ownership proof + B2 accept_mission split).
 *
 * Every builder gated on `v36Enabled()` is asserted in BOTH states:
 *   - flag OFF (default) → the live V35 target + arg vector, byte-identical.
 *   - flag ON  (vi.stubEnv VITE_V36_ENABLED=true) → the V36 typed target + the
 *     inserted tribe_gov / owner_cap arg at the exact slot the Move entry expects.
 * This is the FE↔Move ABI drift guard for the V36 fresh publish.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
// The VITE_* env is statically inlined in this project's build, so `vi.stubEnv` cannot flip
// `v36Enabled()`. Mock the constants module instead (project convention) — preserve every real
// export and override ONLY `v36Enabled` to read a test-controlled flag. Both specifier styles
// the builders use are mocked so they share the same override.
const { v36State } = vi.hoisted(() => ({ v36State: { on: false } }));
vi.mock("../../constants", async (importActual) => {
    const actual = await importActual();
    return { ...actual, v36Enabled: () => v36State.on };
});
vi.mock("@bazaar/shared/constants", async (importActual) => {
    const actual = await importActual();
    return { ...actual, v36Enabled: () => v36State.on };
});
import { SHARED_OBJECTS, MISSION_REGISTRY_ID } from "../../constants";
import { ID, CLOCK, DIGEST, lastCall, callByTarget, expectArgs, coinArg, describeCalls } from "./abi-snapshot-helpers";
import { buildRegisterNoTribeSSU, buildRegisterAndJoinOpenTribe } from "../index";
import { buildCreateWTSShop, buildCreateWTBShop, buildCreateDEShop } from "../bazaarcore/shop-tx";
import { buildWTSBuy, buildWTBFill, buildDEExchange } from "../bazaarcore/shop-trade-tx";
import { buildAcceptMission } from "../bazaarcore/mission-lifecycle-tx";
import { buildFreeClaim, buildFreeCoinClaim } from "../bazaarcore/inventory-tx";
import { buildProposeAdvancedTrade, buildCancelAdvancedTrade, } from "../bazaareconomy/advanced-direct-trade-tx";
import { buildCancelAdvancedTradeProposalsBatch } from "../bazaareconomy/admin-drain-tx";
const SHOP = ID(0xa1), SSU_GOV = ID(0xa2), TRIBE_GOV = ID(0xa3), MEMBERS = ID(0xa4), STORAGE = ID(0xa5), SSU = ID(0xa6), LEDGER = ID(0xb1), REGISTRY = ID(0xb6), POOL = ID(0xb7), OWNER_CAP = ID(0xc3), CHAR = ID(0xd2), SSU_CAP = ID(0xd3);
const BREG = SHARED_OBJECTS.BAZAR_REGISTRY;
const enableV36 = () => { v36State.on = true; };
afterEach(() => { v36State.on = false; });
// shared param fragments
const wtsBase = {
    bazaarType: 0, title: "t", ssuId: SSU, ssuGovId: SSU_GOV, memberRegistryId: MEMBERS,
    tribeId: 1, itemTypeIds: [7], quantities: [1], pricesEve: [10], expiryMs: 0,
    positionX: 0, positionY: 0,
};
const deBase = {
    bazaarType: 0, title: "t", ssuId: SSU, ssuGovId: SSU_GOV, memberRegistryId: MEMBERS,
    tribeId: 1, pairs: [{ offeredTypeId: 1, offeredQty: 1, requestedTypeId: 2, requestedQty: 1 }],
    expiryMs: 0, positionX: 0, positionY: 0,
};
// ── register_ssu_notribe — DH-10 ownership proof (B4) ────────────────────────
describe("buildRegisterNoTribeSSU ABI", () => {
    const T = "ssu_registry::register_ssu_notribe";
    it("V35 (flag off): 6 args, no owner_cap", () => {
        const tx = buildRegisterNoTribeSSU(SSU, SSU, undefined, 0, null, { mode: "skip" });
        expectArgs(callByTarget(tx, T).args, [
            SHARED_OBJECTS.SSU_REGISTRY, SHARED_OBJECTS.GOVERNANCE_CONFIG, SHARED_OBJECTS.TAX_WALLET,
            "result", "pure", CLOCK,
        ]);
    });
    it("V36 (flag on): owner_cap proof spliced at slot 4 (after payment, before ssu_id)", () => {
        enableV36();
        const tx = buildRegisterNoTribeSSU(SSU, SSU, undefined, 0, null, { mode: "skip" }, CHAR, { ssuCapId: SSU_CAP, ssuCapVersion: "1", ssuCapDigest: DIGEST });
        expectArgs(callByTarget(tx, T).args, [
            SHARED_OBJECTS.SSU_REGISTRY, SHARED_OBJECTS.GOVERNANCE_CONFIG, SHARED_OBJECTS.TAX_WALLET,
            "result", "result", "pure", CLOCK, // owner_cap (borrowed) at [4]
        ]);
    });
    it("V36 throws without the ownership proof", () => {
        enableV36();
        expect(() => buildRegisterNoTribeSSU(SSU, SSU, undefined, 0, null, { mode: "skip" }))
            .toThrow(/ownership proof|characterId/i);
    });
    it("V36 + authBundle borrows the world OwnerCap exactly ONCE (DH-10 double-borrow fix)", () => {
        enableV36();
        const authBundle = { characterId: CHAR, ssuCapId: SSU_CAP, ssuCapVersion: "1", ssuCapDigest: DIGEST };
        const tx = buildRegisterNoTribeSSU(SSU, SSU, authBundle, 0, null, { mode: "skip" }, CHAR, { ssuCapId: SSU_CAP, ssuCapVersion: "1", ssuCapDigest: DIGEST });
        const targets = describeCalls(tx).map(c => c.target);
        expect(targets.filter(t => t === "character::borrow_owner_cap").length).toBe(1);
        expect(targets.filter(t => t === "character::return_owner_cap").length).toBe(1);
        expect(targets.filter(t => t === "storage_unit::authorize_extension").length).toBe(1);
    });
});
// ── register_and_join_open_tribe — DH-10 proof + tribe_join_fee (B4) ──────────
describe("buildRegisterAndJoinOpenTribe ABI", () => {
    const T = "registration_helpers::register_and_join_open_tribe";
    const capRef = { ssuCapId: SSU_CAP, ssuCapVersion: "1", ssuCapDigest: DIGEST };
    it("V35 (flag off): 5 args, no fee/owner_cap", () => {
        const tx = buildRegisterAndJoinOpenTribe(SSU, 1, 1, SSU, undefined, { mode: "skip" });
        expectArgs(callByTarget(tx, T).args, [
            SHARED_OBJECTS.SSU_REGISTRY, SHARED_OBJECTS.TRIBE_REGISTRY, "pure", "pure", CLOCK,
        ]);
    });
    it("V36 (flag on): config+wallet+payment added, owner_cap proof at slot 5", () => {
        enableV36();
        const tx = buildRegisterAndJoinOpenTribe(SSU, 1, 1, SSU, undefined, { mode: "skip" }, 0, null, CHAR, capRef);
        expectArgs(callByTarget(tx, T).args, [
            SHARED_OBJECTS.SSU_REGISTRY, SHARED_OBJECTS.TRIBE_REGISTRY,
            SHARED_OBJECTS.GOVERNANCE_CONFIG, SHARED_OBJECTS.TAX_WALLET,
            "result", "result", "pure", "pure", CLOCK, // payment[4], owner_cap[5]
        ]);
    });
    it("V36 throws without the ownership proof", () => {
        enableV36();
        expect(() => buildRegisterAndJoinOpenTribe(SSU, 1, 1, SSU, undefined, { mode: "skip" }))
            .toThrow(/ownership proof|characterId/i);
    });
    it("V36 + authBundle borrows the world OwnerCap exactly ONCE", () => {
        enableV36();
        const authBundle = { characterId: CHAR, ssuCapId: SSU_CAP, ssuCapVersion: "1", ssuCapDigest: DIGEST };
        const tx = buildRegisterAndJoinOpenTribe(SSU, 1, 1, SSU, authBundle, { mode: "skip" }, 0, null, CHAR, capRef);
        const targets = describeCalls(tx).map(c => c.target);
        expect(targets.filter(t => t === "character::borrow_owner_cap").length).toBe(1);
        expect(targets.filter(t => t === "character::return_owner_cap").length).toBe(1);
        expect(targets.filter(t => t === "storage_unit::authorize_extension").length).toBe(1);
    });
});
// ── create_wts_shop split (B1.2) ─────────────────────────────────────────────
describe("buildCreateWTSShop ABI", () => {
    it("V35 (flag off): generic bazar::create_wts_shop, 14 args", () => {
        const call = lastCall(buildCreateWTSShop({ ...wtsBase }));
        expect(call.target).toBe("bazar::create_wts_shop");
        expectArgs(call.args, [BREG, SSU_GOV, MEMBERS, "pure", "pure", "pure", "pure",
            "pure", "pure", "pure", "pure", "pure", "pure", CLOCK]);
    });
    it("V36 notribe (bt 0): create_wts_shop_notribe, 14 args (no tribe_gov)", () => {
        enableV36();
        const call = lastCall(buildCreateWTSShop({ ...wtsBase, bazaarType: 0 }));
        expect(call.target).toBe("bazar::create_wts_shop_notribe");
        expectArgs(call.args, [BREG, SSU_GOV, MEMBERS, "pure", "pure", "pure", "pure",
            "pure", "pure", "pure", "pure", "pure", "pure", CLOCK]);
    });
    it("V36 easy (bt 1): create_wts_shop_easy, tribe_gov spliced at slot 2", () => {
        enableV36();
        const call = lastCall(buildCreateWTSShop({ ...wtsBase, bazaarType: 1, tribeGovId: TRIBE_GOV }));
        expect(call.target).toBe("bazar::create_wts_shop_easy");
        expectArgs(call.args, [BREG, SSU_GOV, TRIBE_GOV, MEMBERS, "pure", "pure", "pure", "pure",
            "pure", "pure", "pure", "pure", "pure", "pure", CLOCK]);
    });
    it("V36 advanced (bt 2): create_wts_shop_advanced, 14 args (no tribe_gov)", () => {
        enableV36();
        const call = lastCall(buildCreateWTSShop({ ...wtsBase, bazaarType: 2 }));
        expect(call.target).toBe("bazar::create_wts_shop_advanced");
        expectArgs(call.args, [BREG, SSU_GOV, MEMBERS, "pure", "pure", "pure", "pure",
            "pure", "pure", "pure", "pure", "pure", "pure", CLOCK]);
    });
    it("V36 easy throws without tribeGovId", () => {
        enableV36();
        expect(() => buildCreateWTSShop({ ...wtsBase, bazaarType: 1 })).toThrow(/tribeGovId/);
    });
});
// ── create_wtb_shop split (B1.2) ─────────────────────────────────────────────
describe("buildCreateWTBShop ABI", () => {
    const wtb = (bazaarType, tribeGovId) => {
        const tx = new Transaction();
        buildCreateWTBShop({
            bazaarType, title: "t", ssuId: SSU, ssuGovId: SSU_GOV, tribeGovId,
            memberRegistryId: MEMBERS, tribeId: 1, itemTypeIds: [7], quantities: [1], pricesEve: [10],
            escrowAmountMist: 1, prepayEve: coinArg(tx), expiryMs: 0, positionX: 0, positionY: 0,
        }, tx);
        return tx;
    };
    it("V35 (flag off): generic bazar::create_wtb_shop, members[9] prepay[10]", () => {
        const call = lastCall(wtb(0));
        expect(call.target).toBe("bazar::create_wtb_shop");
        expectArgs(call.args, [BREG, SSU_GOV, "pure", "pure", "pure", "pure", "pure", "pure", "pure",
            MEMBERS, "result", "pure", "pure", "pure", CLOCK]);
    });
    it("V36 notribe (bt 0): create_wtb_shop_notribe, same 15-arg shape", () => {
        enableV36();
        const call = lastCall(wtb(0));
        expect(call.target).toBe("bazar::create_wtb_shop_notribe");
        expectArgs(call.args, [BREG, SSU_GOV, "pure", "pure", "pure", "pure", "pure", "pure", "pure",
            MEMBERS, "result", "pure", "pure", "pure", CLOCK]);
    });
    it("V36 easy (bt 1): create_wtb_shop_easy, tribe_gov spliced at slot 2", () => {
        enableV36();
        const call = lastCall(wtb(1, TRIBE_GOV));
        expect(call.target).toBe("bazar::create_wtb_shop_easy");
        expectArgs(call.args, [BREG, SSU_GOV, TRIBE_GOV, "pure", "pure", "pure", "pure", "pure", "pure",
            "pure", MEMBERS, "result", "pure", "pure", "pure", CLOCK]);
    });
    it("V36 advanced (bt 2): throws — Advanced WTB routes via wtb_pool_ops", () => {
        enableV36();
        expect(() => wtb(2)).toThrow(/wtb_pool_ops|Advanced WTB/);
    });
});
// ── create_de_shop split (B1.2) ──────────────────────────────────────────────
describe("buildCreateDEShop ABI", () => {
    it("V35 (flag off): generic bazar::create_de_shop", () => {
        const call = lastCall(buildCreateDEShop({ ...deBase }));
        expect(call.target).toBe("bazar::create_de_shop");
    });
    it("V36 easy (bt 1): create_de_shop_easy, tribe_gov at slot 2, 16 args", () => {
        enableV36();
        const call = lastCall(buildCreateDEShop({ ...deBase, bazaarType: 1, tribeGovId: TRIBE_GOV }));
        expect(call.target).toBe("bazar::create_de_shop_easy");
        expectArgs(call.args, [BREG, SSU_GOV, TRIBE_GOV, MEMBERS, "pure", "pure", "pure", "pure",
            "pure", "pure", "pure", "pure", "pure", "pure", "pure", CLOCK]);
    });
    it("V36 advanced (bt 2): create_de_shop_advanced", () => {
        enableV36();
        expect(lastCall(buildCreateDEShop({ ...deBase, bazaarType: 2 })).target)
            .toBe("bazar::create_de_shop_advanced");
    });
});
// ── accept_mission split (B2) ────────────────────────────────────────────────
describe("buildAcceptMission ABI", () => {
    const accept = (bazaarType, tribeGovId) => {
        const tx = new Transaction();
        return buildAcceptMission({
            missionId: SHOP, ssuGovId: SSU_GOV, memberRegistryId: MEMBERS,
            missionCollateralPoolId: POOL, collateralEveCoin: coinArg(tx), bazaarType, tribeGovId,
        }, tx);
    };
    it("V35 (flag off): unified mission_lifecycle::accept_mission, 7 args", () => {
        const call = lastCall(accept(1, TRIBE_GOV)); // bazaarType ignored on V35
        expect(call.target).toBe("mission_lifecycle::accept_mission");
        expectArgs(call.args, [MISSION_REGISTRY_ID, "pure", SSU_GOV, MEMBERS, POOL, "result", CLOCK]);
    });
    it("V36 notribe (bt 0): accept_mission_notribe, 7 args", () => {
        enableV36();
        const call = lastCall(accept(0));
        expect(call.target).toBe("mission_lifecycle::accept_mission_notribe");
        expectArgs(call.args, [MISSION_REGISTRY_ID, "pure", SSU_GOV, MEMBERS, POOL, "result", CLOCK]);
    });
    it("V36 easy (bt 1): accept_mission_easy, tribe_gov spliced at slot 3", () => {
        enableV36();
        const call = lastCall(accept(1, TRIBE_GOV));
        expect(call.target).toBe("mission_lifecycle::accept_mission_easy");
        expectArgs(call.args, [MISSION_REGISTRY_ID, "pure", SSU_GOV, TRIBE_GOV, MEMBERS, POOL, "result", CLOCK]);
    });
});
// ── FREE claim split (R-B) ───────────────────────────────────────────────────
describe("FREE claim ABI (R-B)", () => {
    it("V35 free_coin_claim (V38 +cap_store before clock); V36 easy → free_coin_claim_tribe (+tribe_gov slot 3)", () => {
        const off = lastCall(buildFreeCoinClaim({ shopId: SHOP, ssuGovId: SSU_GOV, memberRegistryId: MEMBERS, bazaarType: 1, tribeGovId: TRIBE_GOV }));
        expect(off.target).toBe("shop_ops_de::free_coin_claim");
        expectArgs(off.args, [BREG, "pure", SSU_GOV, MEMBERS, SHARED_OBJECTS.SHOP_OPS_CAP_STORE, CLOCK]);
        enableV36();
        const on = lastCall(buildFreeCoinClaim({ shopId: SHOP, ssuGovId: SSU_GOV, memberRegistryId: MEMBERS, bazaarType: 1, tribeGovId: TRIBE_GOV }));
        expect(on.target).toBe("shop_ops_de::free_coin_claim_tribe");
        expectArgs(on.args, [BREG, "pure", SSU_GOV, TRIBE_GOV, MEMBERS, SHARED_OBJECTS.SHOP_OPS_CAP_STORE, CLOCK]);
    });
    it("V36 NoTribe (bt 0) coin-claim stays free_coin_claim", () => {
        enableV36();
        expect(lastCall(buildFreeCoinClaim({ shopId: SHOP, ssuGovId: SSU_GOV, memberRegistryId: MEMBERS, bazaarType: 0 })).target)
            .toBe("shop_ops_de::free_coin_claim");
    });
    it("V36 easy item-claim → free_claim_tribe (+tribe_gov slot 5)", () => {
        enableV36();
        const call = lastCall(buildFreeClaim({
            shopId: SHOP, listingIdx: 0, quantity: 1, ssuGovId: SSU_GOV,
            memberRegistryId: MEMBERS, userStorageId: STORAGE, bazaarType: 1, tribeGovId: TRIBE_GOV,
        }));
        expect(call.target).toBe("shop_ops_de::free_claim_tribe");
        expectArgs(call.args, [BREG, "pure", "pure", "pure", SSU_GOV, TRIBE_GOV, MEMBERS, STORAGE, SHARED_OBJECTS.SHOP_OPS_CAP_STORE, CLOCK]);
    });
});
// ── advanced_direct_trade tribe_gov (R-C) ────────────────────────────────────
describe("advanced_direct_trade ABI (R-C)", () => {
    const propose = (tribeGovId) => buildProposeAdvancedTrade({
        registryId: REGISTRY, ssuGovId: SSU_GOV, tribeGovId, ledgerId: LEDGER, receiver: SSU,
        offerEveMist: 0n, offerTokensScaled: 0n, requestEveMist: 0n, requestTokensScaled: 0n, expiryMs: 0n,
    });
    it("V35 propose: no tribe_gov (10 args)", () => {
        const call = lastCall(propose());
        expect(call.target).toBe("advanced_direct_trade::propose_advanced_trade");
        expectArgs(call.args, [REGISTRY, SSU_GOV, LEDGER, "pure", "result", "pure", "pure", "pure", "pure", CLOCK]);
    });
    it("V36 propose: tribe_gov spliced at slot 2 (11 args)", () => {
        enableV36();
        const call = lastCall(propose(TRIBE_GOV));
        expect(call.target).toBe("advanced_direct_trade::propose_advanced_trade");
        expectArgs(call.args, [REGISTRY, SSU_GOV, TRIBE_GOV, LEDGER, "pure", "result", "pure", "pure", "pure", "pure", CLOCK]);
    });
    it("V36 cancel (ungated recovery): tribe_gov spliced at slot 2", () => {
        enableV36();
        const call = lastCall(buildCancelAdvancedTrade({ registryId: REGISTRY, ssuGovId: SSU_GOV, tribeGovId: TRIBE_GOV, ledgerId: LEDGER, proposalId: SHOP }));
        expect(call.target).toBe("advanced_direct_trade::cancel_advanced_trade");
        expectArgs(call.args, [REGISTRY, SSU_GOV, TRIBE_GOV, LEDGER, "pure", CLOCK]);
    });
    it("V36 batch drain: tribe_gov spliced at slot 3 (after ssu_gov, before ledger)", () => {
        enableV36();
        const call = lastCall(buildCancelAdvancedTradeProposalsBatch({
            ownerCapId: OWNER_CAP, advancedTradeRegistryId: REGISTRY, ssuGovId: SSU_GOV,
            tribeGovId: TRIBE_GOV, ledgerId: LEDGER, proposalIds: [SHOP],
        }));
        expect(call.target).toBe("advanced_direct_trade::cancel_advanced_trade_proposals_batch");
        expectArgs(call.args, [OWNER_CAP, REGISTRY, SSU_GOV, TRIBE_GOV, LEDGER, "pure", CLOCK]);
    });
    it("V36 propose throws without tribeGovId", () => {
        enableV36();
        expect(() => propose()).toThrow(/tribeGovId/);
    });
});
// ── trade-execution Easy tribe_gov (closes the issue-5 silent-arg-shift gap) ──
// The Easy buy/fill/exchange entries take `tribe_gov: &mut TribeGovernance` right
// after ssu_gov. Dropping it shifts every trailing shared object onto the wrong
// slot → the RPC's "Mutable parameter provided, immutable parameter expected".
// These builders route to the _tribe variant for Easy regardless of v36Enabled().
describe("trade-execution Easy tribe_gov guards", () => {
    it("buildWTSBuy easy throws without tribeGovId", () => {
        const tx = new Transaction();
        expect(() => buildWTSBuy({
            shopId: SHOP, listingIdx: 0, quantity: 1, paymentAmountMist: 10,
            paymentCoin: coinArg(tx), ssuGovId: SSU_GOV, memberRegistryId: MEMBERS,
            userStorageId: STORAGE, bazaarType: "easy",
        }, tx)).toThrow(/tribeGovId/);
    });
    it("buildWTSBuy easy: tribe_gov spliced at slot 6 (after ssu_gov, before admin)", () => {
        const tx = new Transaction();
        buildWTSBuy({
            shopId: SHOP, listingIdx: 0, quantity: 1, paymentAmountMist: 10,
            paymentCoin: coinArg(tx), ssuGovId: SSU_GOV, memberRegistryId: MEMBERS,
            userStorageId: STORAGE, bazaarType: "easy", tribeGovId: TRIBE_GOV,
        }, tx);
        expectArgs(callByTarget(tx, "shop_ops_wts::wts_buy_tribe").args, [
            BREG, "pure", "pure", "pure", "result", SSU_GOV, TRIBE_GOV,
            SHARED_OBJECTS.BAZAAR_CORE_ADMIN, SHARED_OBJECTS.TAX_WALLET,
            SHARED_OBJECTS.GOVERNANCE_CONFIG, MEMBERS, STORAGE,
            SHARED_OBJECTS.SHOP_OPS_CAP_STORE, CLOCK,
        ]);
    });
    it("buildDEExchange easy throws without tribeGovId", () => {
        const tx = new Transaction();
        expect(() => buildDEExchange({
            shopId: SHOP, pairIdx: 0, units: 1, feeAmountMist: 1,
            feePaymentCoin: coinArg(tx), ssuGovId: SSU_GOV, memberRegistryId: MEMBERS,
            userStorageId: STORAGE, bazaarType: "easy",
        }, tx)).toThrow(/tribeGovId/);
    });
    it("buildWTBFill easy throws without tribeGovId (before any withdraw work)", () => {
        expect(() => buildWTBFill({
            shopId: SHOP, listingIdx: 0, quantity: 1, ssuGovId: SSU_GOV,
            memberRegistryId: MEMBERS, ssuId: SSU, bazaarType: "easy",
            fillItems: [], charCapRef: {}, characterId: CHAR, recipientCharacterId: CHAR,
        })).toThrow(/tribeGovId/);
    });
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
