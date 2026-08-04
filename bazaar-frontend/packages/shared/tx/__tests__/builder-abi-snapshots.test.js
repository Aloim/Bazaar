// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * builder-abi-snapshots.test.ts — Phase 8 Wave A5 (AUD-NT-19 / AUD-ET-25 / AUD-ADV-20).
 *
 * Arg-vector snapshot tests for the load-bearing TX builders: each test builds
 * the Transaction with deterministic dummy ids and asserts the MoveCall target
 * (module::function) plus the ORDERED argument shape — object ids at object
 * positions, "pure" at pure positions, "result" for in-PTB results. Guards
 * FE↔Move ABI drift at the V36 ABI break (and any later one): if a builder's
 * arg vector or target changes without a Move-side match, this file fails
 * loudly instead of aborting on-chain.
 */
import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { SHARED_OBJECTS } from "../../constants";
import { buildWTSBuy, buildWTBFill, buildDEExchange } from "../bazaarcore/shop-trade-tx";
import { buildSwapEveToTokens, buildSwapTokensToEve } from "../bazaareconomy/exchange-tx";
import { buildRequestMintAsLeader, buildRequestBurnAsLeader } from "../bazaareconomy/mint-burn-queue-tx";
import { buildRequestWithdrawal, buildApproveWithdrawal } from "../bazaareconomy/withdrawal-tx";
import { buildDeactivateTribeFully } from "../index";
// ── Deterministic dummy ids ────────────────────────────────────────────────────
const ID = (n) => "0x" + n.toString(16).padStart(64, "0");
const SHOP = ID(0xa1), SSU_GOV = ID(0xa2), TRIBE_GOV = ID(0xa3), MEMBERS = ID(0xa4), STORAGE = ID(0xa5), SSU = ID(0xa6), RECIPIENT_CHAR = ID(0xa7), LEDGER = ID(0xb1), VAULT = ID(0xb2), CONFIG = ID(0xb3), QUEUE = ID(0xb4), BOARD = ID(0xb5), LEADER_CAP = ID(0xc1), ADMIN_CAP = ID(0xc2), CHAR_CAP = ID(0xd1);
const CLOCK = "0x6";
// 32 base58 "1"s decode to 32 zero bytes — a structurally valid object digest.
const DIGEST = "11111111111111111111111111111111";
function describeCalls(tx) {
    const data = tx.getData();
    const inputs = data.inputs ?? [];
    const calls = [];
    for (const cmd of (data.commands ?? [])) {
        const mc = cmd.MoveCall;
        if (!mc)
            continue;
        const args = (mc.arguments ?? []).map(a => {
            const idx = typeof a.Input === "number" ? a.Input : undefined;
            if (idx !== undefined) {
                const input = inputs[idx] ?? {};
                const objId = input.UnresolvedObject?.objectId ??
                    input.Object?.SharedObject?.objectId ??
                    input.Object?.ImmOrOwnedObject?.objectId ??
                    input.Object?.Receiving?.objectId;
                return objId ? `obj:${objId}` : "pure";
            }
            return "result"; // Result / NestedResult / GasCoin — an in-PTB value
        });
        calls.push({ target: `${mc.module}::${mc.function}`, args });
    }
    return calls;
}
const lastCall = (tx) => {
    const calls = describeCalls(tx);
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1];
};
/** Expected entry: an object id string (compared numerically), "pure", or "result". */
function expectArgs(actual, expected) {
    expect(actual.length).toBe(expected.length);
    expected.forEach((exp, i) => {
        if (exp === "pure" || exp === "result") {
            expect(actual[i], `arg[${i}]`).toBe(exp);
        }
        else {
            expect(actual[i].startsWith("obj:"), `arg[${i}] should be an object`).toBe(true);
            expect(BigInt(actual[i].slice(4)), `arg[${i}] object id`).toBe(BigInt(exp));
        }
    });
}
const coinArg = (tx) => {
    const [c] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
    return c;
};
// ── WTS (AUD-NT-19 / AUD-ET-25) ───────────────────────────────────────────────
describe("buildWTSBuy arg-vector snapshot", () => {
    it("notribe: shop_ops_wts::wts_buy_notribe, 13 args (V38 +cap_store before clock)", () => {
        const tx = new Transaction();
        buildWTSBuy({
            shopId: SHOP, listingIdx: 0, quantity: 1, paymentAmountMist: 1,
            paymentCoin: coinArg(tx), ssuGovId: SSU_GOV, memberRegistryId: MEMBERS,
            userStorageId: STORAGE, bazaarType: "notribe",
        }, tx);
        const call = lastCall(tx);
        expect(call.target).toBe("shop_ops_wts::wts_buy_notribe");
        expectArgs(call.args, [
            SHARED_OBJECTS.BAZAR_REGISTRY, "pure", "pure", "pure", "result", SSU_GOV,
            SHARED_OBJECTS.BAZAAR_CORE_ADMIN, SHARED_OBJECTS.TAX_WALLET,
            SHARED_OBJECTS.GOVERNANCE_CONFIG, MEMBERS, STORAGE,
            SHARED_OBJECTS.SHOP_OPS_CAP_STORE, CLOCK,
        ]);
    });
    it("easy: wts_buy_tribe gains tribe_gov at index 5 after ssu_gov (V38 +cap_store before clock)", () => {
        const tx = new Transaction();
        buildWTSBuy({
            shopId: SHOP, listingIdx: 0, quantity: 1, paymentAmountMist: 1,
            paymentCoin: coinArg(tx), ssuGovId: SSU_GOV, memberRegistryId: MEMBERS,
            userStorageId: STORAGE, bazaarType: "easy", tribeGovId: TRIBE_GOV,
        }, tx);
        const call = lastCall(tx);
        expect(call.target).toBe("shop_ops_wts::wts_buy_tribe");
        expectArgs(call.args, [
            SHARED_OBJECTS.BAZAR_REGISTRY, "pure", "pure", "pure", "result", SSU_GOV,
            TRIBE_GOV,
            SHARED_OBJECTS.BAZAAR_CORE_ADMIN, SHARED_OBJECTS.TAX_WALLET,
            SHARED_OBJECTS.GOVERNANCE_CONFIG, MEMBERS, STORAGE,
            SHARED_OBJECTS.SHOP_OPS_CAP_STORE, CLOCK,
        ]);
    });
});
// ── WTB (AUD-NT-19 / AUD-ET-25) ───────────────────────────────────────────────
const wtbBase = {
    shopId: SHOP, listingIdx: 0, quantity: 1, ssuGovId: SSU_GOV,
    memberRegistryId: MEMBERS, ssuId: SSU,
    fillItems: [{ typeId: 7, quantity: 1 }],
    charCapRef: { charCapId: CHAR_CAP, charCapVersion: "1", charCapDigest: DIGEST },
    characterId: ID(0xd2),
    recipientCharacterId: RECIPIENT_CHAR,
};
describe("buildWTBFill arg-vector snapshot", () => {
    it("notribe: shop_ops_wtb::wtb_fill_notribe, NO pool arg (V13), V38 +cap_store before clock", () => {
        const tx = buildWTBFill({ ...wtbBase, bazaarType: "notribe" });
        const call = lastCall(tx);
        expect(call.target).toBe("shop_ops_wtb::wtb_fill_notribe");
        expectArgs(call.args, [
            SHARED_OBJECTS.BAZAR_REGISTRY, "pure", "pure", "pure", SSU_GOV,
            SHARED_OBJECTS.BAZAAR_CORE_ADMIN, SHARED_OBJECTS.TAX_WALLET,
            SHARED_OBJECTS.GOVERNANCE_CONFIG, MEMBERS, SSU, "result",
            RECIPIENT_CHAR, SHARED_OBJECTS.SHOP_OPS_CAP_STORE, CLOCK,
        ]);
    });
    it("easy: wtb_fill_tribe gains tribe_gov at index 5 after ssu_gov (V38 +cap_store before clock)", () => {
        const tx = buildWTBFill({ ...wtbBase, bazaarType: "easy", tribeGovId: TRIBE_GOV });
        const call = lastCall(tx);
        expect(call.target).toBe("shop_ops_wtb::wtb_fill_tribe");
        expectArgs(call.args, [
            SHARED_OBJECTS.BAZAR_REGISTRY, "pure", "pure", "pure", SSU_GOV, TRIBE_GOV,
            SHARED_OBJECTS.BAZAAR_CORE_ADMIN, SHARED_OBJECTS.TAX_WALLET,
            SHARED_OBJECTS.GOVERNANCE_CONFIG, MEMBERS, SSU, "result",
            RECIPIENT_CHAR, SHARED_OBJECTS.SHOP_OPS_CAP_STORE, CLOCK,
        ]);
    });
});
// ── DE (AUD-NT-19 / AUD-ET-25 — V31 partial-DE units arg pinned) ──────────────
describe("buildDEExchange arg-vector snapshot", () => {
    it("notribe: shop_ops_de::de_exchange_notribe, incl. units, V38 +cap_store before clock", () => {
        const tx = new Transaction();
        buildDEExchange({
            shopId: SHOP, pairIdx: 0, units: 1, feeAmountMist: 1,
            feePaymentCoin: coinArg(tx), ssuGovId: SSU_GOV, memberRegistryId: MEMBERS,
            userStorageId: STORAGE, bazaarType: "notribe",
        }, tx);
        const call = lastCall(tx);
        expect(call.target).toBe("shop_ops_de::de_exchange_notribe");
        expectArgs(call.args, [
            SHARED_OBJECTS.BAZAR_REGISTRY, "pure", "pure", "pure", "result", SSU_GOV,
            SHARED_OBJECTS.BAZAAR_CORE_ADMIN, SHARED_OBJECTS.TAX_WALLET,
            SHARED_OBJECTS.GOVERNANCE_CONFIG, MEMBERS, STORAGE,
            SHARED_OBJECTS.SHOP_OPS_CAP_STORE, CLOCK,
        ]);
    });
    it("easy: de_exchange_tribe gains tribe_gov at index 5 after ssu_gov (AUD-ET-01 payment context; V38 +cap_store before clock)", () => {
        const tx = new Transaction();
        buildDEExchange({
            shopId: SHOP, pairIdx: 0, units: 2, feeAmountMist: 2,
            feePaymentCoin: coinArg(tx), ssuGovId: SSU_GOV, memberRegistryId: MEMBERS,
            userStorageId: STORAGE, bazaarType: "easy", tribeGovId: TRIBE_GOV,
        }, tx);
        const call = lastCall(tx);
        expect(call.target).toBe("shop_ops_de::de_exchange_tribe");
        expectArgs(call.args, [
            SHARED_OBJECTS.BAZAR_REGISTRY, "pure", "pure", "pure", "result", SSU_GOV,
            TRIBE_GOV,
            SHARED_OBJECTS.BAZAAR_CORE_ADMIN, SHARED_OBJECTS.TAX_WALLET,
            SHARED_OBJECTS.GOVERNANCE_CONFIG, MEMBERS, STORAGE,
            SHARED_OBJECTS.SHOP_OPS_CAP_STORE, CLOCK,
        ]);
    });
});
// ── Exchange swaps (AUD-ADV-20 — tribe_gov at [3] pinned, 9 args) ─────────────
describe("exchange swap arg-vector snapshots", () => {
    it("swap_eve_to_tokens: 9 args, tribe_gov at [3]", () => {
        const tx = new Transaction();
        buildSwapEveToTokens({
            ledgerId: LEDGER, vaultId: VAULT, configId: CONFIG,
            tribeGovernanceId: TRIBE_GOV, paymentAmountMist: 1, paymentCoin: coinArg(tx),
        }, tx);
        const call = lastCall(tx);
        expect(call.target).toBe("tribe_exchange::swap_eve_to_tokens");
        expectArgs(call.args, [
            LEDGER, VAULT, CONFIG, TRIBE_GOV, "result",
            SHARED_OBJECTS.TAX_WALLET, SHARED_OBJECTS.GOVERNANCE_CONFIG,
            SHARED_OBJECTS.ECONOMY_CAP_STORE, CLOCK,
        ]);
    });
    it("swap_tokens_to_eve: 9 args, tribe_gov at [3], tokensToBurn pure at [4]", () => {
        const tx = new Transaction();
        buildSwapTokensToEve({
            ledgerId: LEDGER, vaultId: VAULT, configId: CONFIG,
            tribeGovernanceId: TRIBE_GOV, tokensToBurn: 1,
        }, tx);
        const call = lastCall(tx);
        expect(call.target).toBe("tribe_exchange::swap_tokens_to_eve");
        expectArgs(call.args, [
            LEDGER, VAULT, CONFIG, TRIBE_GOV, "pure",
            SHARED_OBJECTS.TAX_WALLET, SHARED_OBJECTS.GOVERNANCE_CONFIG,
            SHARED_OBJECTS.ECONOMY_CAP_STORE, CLOCK,
        ]);
    });
});
// ── Mint/burn queue (AUD-ADV-20 — the ONLY mint/burn path post-ADV-05 ruling) ─
describe("mint-burn-queue arg-vector snapshots", () => {
    it("request_mint_as_leader: 8 args (cap, gov, queue, vault, ledger, config, amount, clock)", () => {
        const tx = buildRequestMintAsLeader({
            leaderCapId: LEADER_CAP, tribeGovernanceId: TRIBE_GOV, queueId: QUEUE,
            vaultId: VAULT, ledgerId: LEDGER, configId: CONFIG, amount: 1,
        });
        const call = lastCall(tx);
        expect(call.target).toBe("mint_burn_queue::request_mint_as_leader");
        expectArgs(call.args, [LEADER_CAP, TRIBE_GOV, QUEUE, VAULT, LEDGER, CONFIG, "pure", CLOCK]);
    });
    it("request_burn_as_leader: 7 args (cap, gov, queue, ledger, vault, amount, clock)", () => {
        const tx = buildRequestBurnAsLeader({
            leaderCapId: LEADER_CAP, tribeGovernanceId: TRIBE_GOV, queueId: QUEUE,
            ledgerId: LEDGER, vaultId: VAULT, amount: 1,
        });
        const call = lastCall(tx);
        expect(call.target).toBe("mint_burn_queue::request_burn_as_leader");
        expectArgs(call.args, [LEADER_CAP, TRIBE_GOV, QUEUE, LEDGER, VAULT, "pure", CLOCK]);
    });
});
// ── Withdrawal board (AUD-ADV-20) ─────────────────────────────────────────────
describe("vault-withdrawal arg-vector snapshots", () => {
    it("request_withdrawal: 8 args (cap, gov, board, vault, ledger, amount, reason, clock)", () => {
        const tx = buildRequestWithdrawal({
            leaderCapId: LEADER_CAP, tribeGovernanceId: TRIBE_GOV, boardId: BOARD,
            vaultId: VAULT, ledgerId: LEDGER, amountMist: 1, reason: "test",
        });
        const call = lastCall(tx);
        expect(call.target).toBe("vault_withdrawal::request_withdrawal");
        expectArgs(call.args, [LEADER_CAP, TRIBE_GOV, BOARD, VAULT, LEDGER, "pure", "pure", CLOCK]);
    });
    it("approve_request: 7 args (cap, gov, board, vault, ledger, request_id, clock)", () => {
        const tx = buildApproveWithdrawal({
            adminCapId: ADMIN_CAP, tribeGovernanceId: TRIBE_GOV, boardId: BOARD,
            vaultId: VAULT, ledgerId: LEDGER, requestId: 0,
        });
        const call = lastCall(tx);
        expect(call.target).toBe("vault_withdrawal::approve_request");
        expectArgs(call.args, [ADMIN_CAP, TRIBE_GOV, BOARD, VAULT, LEDGER, "pure", CLOCK]);
    });
});
// ── deactivate_tribe_fully (Issue-1 V37) ──────────────────────────────────────
describe("buildDeactivateTribeFully arg-vector snapshot", () => {
    it("tribe_lifecycle::deactivate_tribe_fully — leader_cap, registry, gov, clock", () => {
        const tx = buildDeactivateTribeFully({ tribeLeaderCapId: LEADER_CAP, tribeGovId: TRIBE_GOV });
        const call = lastCall(tx);
        expect(call.target).toBe("tribe_lifecycle::deactivate_tribe_fully");
        expectArgs(call.args, [LEADER_CAP, SHARED_OBJECTS.TRIBE_REGISTRY, TRIBE_GOV, CLOCK]);
    });
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
