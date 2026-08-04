// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * reclaim-tribe-abi.test.ts — pins the tribe reclaim builders against the landed
 * bazaar_economy::reclaim_tribe multi-PTB ABIs + the lazy-drain composition.
 *
 * reclaim_tribe:           (reclaim_registry, tribe_registry, config, wallet, fee_payment,
 *                           package_id, original_tribe_id, initial_required_approvals, clock, ctx)
 * reclaim_tribe_mint_page: (leader_cap, ledger, gate, holders, amounts, clock, ctx)
 * deposit_reclaimed_vault_eve (new): (cap, vault, eve_coin, clock, ctx)
 * reclaim_tribe_restore:   (leader_cap, gov, gov_eve_coin, mission_fee, ban_addrs, ban_expiries, clock, ctx)
 */

import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { ID, CLOCK, lastCall, callByTarget, describeCalls, expectArgs, coinArg } from "./abi-snapshot-helpers";
import { TribeLeaderPayloadBcs } from "../../ceremony/reclaim/payloads";
import {
  buildReclaimTribe,
  buildReclaimTribeMintPage,
  buildReclaimTribeMintPages,
  buildReclaimTribeVaultDeposit,
  buildReclaimTribeRestore,
  decodeTribeLeaderPayload,
  RECLAIM_MINT_PAGE_SIZE,
} from "../bazaareconomy/reclaim-tribe-tx";

const REG = ID(0xc1), TRIBEREG = ID(0x77), CONFIG = ID(0x95), WALLET = ID(0x16), CORE = ID(0xc0);
const LEADER = ID(0x1e), LEDGER = ID(0x1d), GATE = ID(0x9a), GOV = ID(0x6a), VAULT = ID(0x7a);

// Advanced TribeLeaderPayload: 2 balances, 2 global bans (one expired @ now=5000).
const TRIBE_BLOB = TribeLeaderPayloadBcs.serialize({
  original_tribe_id: 7n,
  name: "Acme",
  bazaar_type: 2,
  token_name: "AcmeToken",
  token_symbol: "ACME",
  token_decimals: 9,
  token_supply_cap: 1000n,
  original_total_supply: 500n,
  role_tax_table_blob: [],
  mission_listing_fee_per_hour: 11n,
  global_bans: [
    { addr: ID(0xb1), expires_at_ms: 100n },              // expired @ now=5000 → filtered
    { addr: ID(0xb2), expires_at_ms: 9_000_000_000_000n },// live → kept
  ],
  token_balances: [
    { addr: ID(0xc1), amount: 250n },
    { addr: ID(0xc2), amount: 250n },
  ],
  gov_eve_mist_at_snapshot: 0n,
  vault_eve_mist_at_snapshot: 0n,
}).toBytes();

describe("buildReclaimTribe ABI", () => {
  it("emits reclaim_tribe with the exact ordered arg vector", () => {
    const tx = new Transaction();
    const fee = coinArg(tx);
    buildReclaimTribe(
      {
        feePaymentCoin: fee, originalTribeId: 7, initialRequiredApprovals: 3,
        reclaimRegistryId: REG, tribeRegistryId: TRIBEREG, governanceConfigId: CONFIG,
        taxWalletId: WALLET, packageId: CORE,
      },
      tx,
    );
    const call = callByTarget(tx, "reclaim_tribe::reclaim_tribe");
    expectArgs(call.args, [
      REG, TRIBEREG, CONFIG, WALLET,
      "result",                          // fee_payment coin
      "pure", "pure", "pure",            // package_id, original_tribe_id, initial_required_approvals
      CLOCK,
    ]);
  });

  it("clamps initial_required_approvals into 1..=10", () => {
    // Out-of-range values must not reach the chain (E_INVALID_QUORUM); we only assert
    // the builder still produces a single well-formed call (value clamped internally).
    const tx = new Transaction();
    buildReclaimTribe({ feePaymentCoin: coinArg(tx), originalTribeId: 1, initialRequiredApprovals: 99 }, tx);
    expect(callByTarget(tx, "reclaim_tribe::reclaim_tribe").args).toHaveLength(9);
  });
});

describe("buildReclaimTribeMintPage ABI", () => {
  it("emits reclaim_tribe_mint_page passing the CeremonyGate", () => {
    const tx = buildReclaimTribeMintPage({
      leaderCapId: LEADER, ledgerId: LEDGER, ceremonyGateId: GATE,
      holders: [ID(0xc1), ID(0xc2)], amounts: [250n, 250n],
    });
    const call = lastCall(tx);
    expect(call.target).toMatch(/reclaim_tribe::reclaim_tribe_mint_page$/);
    expectArgs(call.args, [LEADER, LEDGER, GATE, "pure", "pure", CLOCK]);
  });

  it("pages balances into <= pageSize, one mint call each", () => {
    const balances = Array.from({ length: 120 }, (_, i) => ({ addr: ID(0xd0 + (i % 16)), amount: BigInt(i + 1) }));
    const pages = buildReclaimTribeMintPages(balances, { leaderCapId: LEADER, ledgerId: LEDGER, ceremonyGateId: GATE });
    expect(pages.length).toBe(Math.ceil(120 / RECLAIM_MINT_PAGE_SIZE)); // 3 at size 50
    expect(pages.map((p) => p.rows.length)).toEqual([50, 50, 20]);
    pages.forEach((p, i) => {
      expect(p.index).toBe(i);
      expect(lastCall(p.tx).target).toMatch(/reclaim_tribe_mint_page$/);
    });
  });
});

describe("buildReclaimTribeVaultDeposit ABI", () => {
  it("deposits a zero coin when no drain is supplied", () => {
    const tx = buildReclaimTribeVaultDeposit({ leaderCapId: LEADER, vaultId: VAULT });
    const targets = describeCalls(tx).map((c) => c.target);
    expect(targets).toContain("coin::zero");
    const dep = callByTarget(tx, "tribe_vault::deposit_reclaimed_vault_eve");
    expectArgs(dep.args, [LEADER, VAULT, "result", CLOCK]);
  });

  it("composes OLD vault drain → deposit", () => {
    const tx = buildReclaimTribeVaultDeposit({
      leaderCapId: LEADER, vaultId: VAULT,
      drain: { oldLeaderCapId: ID(0xa1), oldVaultId: ID(0xa2), oldGateId: ID(0xa3), outgoingBazaarEconomyPkg: ID(0xe0) },
    });
    const drain = callByTarget(tx, "tribe_vault::withdraw_legacy_tribe_vault");
    expectArgs(drain.args, [ID(0xa1), ID(0xa2), ID(0xa3), CLOCK]);
    const dep = callByTarget(tx, "tribe_vault::deposit_reclaimed_vault_eve");
    expect(dep.args[2]).toBe("result"); // drained coin
  });
});

describe("buildReclaimTribeRestore ABI", () => {
  it("deposits a zero coin when no drain is supplied", () => {
    const tx = buildReclaimTribeRestore({ leaderCapId: LEADER, tribeGovId: GOV, payloadBlob: TRIBE_BLOB, nowMs: 5000 });
    const targets = describeCalls(tx).map((c) => c.target);
    expect(targets).toContain("coin::zero");
    const restore = callByTarget(tx, "reclaim_tribe::reclaim_tribe_restore");
    expectArgs(restore.args, [
      LEADER, GOV,
      "result",                 // gov_eve_coin = coin::zero
      "pure",                   // mission_fee
      "pure", "pure",           // ban_addrs, ban_expiries
      CLOCK,
    ]);
  });

  it("composes OLD gov-EVE drain (OUTGOING gate) → restore", () => {
    const tx = buildReclaimTribeRestore({
      leaderCapId: LEADER, tribeGovId: GOV, payloadBlob: TRIBE_BLOB, nowMs: 5000,
      drain: { oldLeaderCapId: ID(0xa1), oldTribeGovId: ID(0xa2), oldGateId: ID(0xa3), outgoingBazaarCorePkg: ID(0xc0) },
    });
    const drain = callByTarget(tx, "tribe_admin_drain::withdraw_legacy_tribe_gov_eve");
    expectArgs(drain.args, [ID(0xa1), ID(0xa2), ID(0xa3), CLOCK]);
    expect(callByTarget(tx, "reclaim_tribe::reclaim_tribe_restore").args[2]).toBe("result");
  });
});

describe("decodeTribeLeaderPayload", () => {
  it("round-trips the binding header + restore args + balances", () => {
    const d = decodeTribeLeaderPayload(TRIBE_BLOB);
    expect(d.originalTribeId).toBe(7n);
    expect(d.bazaarType).toBe(2);
    expect(d.tokenSymbol).toBe("ACME");
    expect(d.tokenSupplyCap).toBe(1000n);
    expect(d.originalTotalSupply).toBe(500n);
    expect(d.missionListingFeePerHour).toBe(11n);
    expect(d.tokenBalances).toHaveLength(2);
    expect(d.tokenBalances[0].amount).toBe(250n);
    expect(d.globalBans).toHaveLength(2);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
