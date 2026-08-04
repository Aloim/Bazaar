// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * reclaim-payloads.test.ts — pins the Slice-4 BCS encoders against the EXACT
 * byte layout the landed Move decode peels. If these break, `reclaim_ssu_shell`
 * / `reclaim_tribe` abort on-chain.
 *
 * SSU header (reclaim_ssu.move:101-106): peel_address, peel_vec_u8, peel_u8, peel_u64.
 * TRIBE header (reclaim_tribe.move:126-135): peel_u64, peel_vec_u8, peel_u8,
 *   peel_vec_u8, peel_vec_u8, peel_u8, peel_u64, peel_u64 (field 8 = original_total_supply).
 */

import { describe, it, expect } from "vitest";
import { bcs } from "@mysten/sui/bcs";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import {
  encodeSsuOwnerPayload,
  encodeTribeLeaderPayload,
  SSUOwnerPayloadBcs,
  TribeLeaderPayloadBcs,
  snapshotToReclaimRecords,
  ssuSubId,
  tribeSubId,
  RECORD_TYPE_SSU_OWNER,
  RECORD_TYPE_TRIBE_LEADER,
} from "../reclaim/payloads";
import type { BazaarSnapshot, SsuSnapshot, TribeSnapshot } from "../snapshot/types";

const addr = (h: string) => "0x" + h.padStart(64, "0");
const cat = (...arrs: Uint8Array[]) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
};

function ssuFixture(over: Partial<SsuSnapshot> = {}): SsuSnapshot {
  return {
    ssuId: addr("a6"), ownerAddress: addr("b1"), bazaarType: 2, tribeId: 3,
    ssuGovId: addr("e1"), godotUrl: "https://x/", isActive: true, frozen: false,
    taxWalletEveMist: "12345", wtbEscrowPoolId: addr("f1"), wtbEscrowPoolEveMist: "0",
    roleTaxTable: { "2": { wts_pct: "100", wtb_pct: "50", de_flat_fee: "7" } },
    shopLimitsByRole: { "2": "9" },
    localBanList: { [addr("dd")]: "1750000000000" },
    members: [{ address: addr("b1"), ssuRole: 7, tribeRole: 5, isBanned: false }],
    announcementBoardId: null, announcements: [], guestbookBoardId: null, guestbook: [],
    ...over,
  };
}

function tribeFixture(over: Partial<TribeSnapshot> = {}): TribeSnapshot {
  return {
    tribeId: 3, name: "Acme", bazaarType: 2, leaderAddress: addr("a1"), isActive: true,
    ssuIds: [addr("a6")], tribeGovId: addr("c3"), tribeGovTaxWalletEveMist: "999",
    globalBans: { [addr("ee")]: "1760000000000" },
    members: [{ address: addr("b1"), ssuRole: 7, tribeRole: 7, isBanned: false }],
    tokenLedgerId: addr("d4"), tokenName: "AcmeCoin", tokenSymbol: "ACM", tokenDecimals: 2,
    tokenSupplyCap: "1000000", tokenTotalSupply: "654321",
    tokenBalances: { [addr("b1")]: "654321" },
    tribeVaultId: addr("d5"), tribeVaultEveMist: "42", exchangeConfigId: addr("d6"), exchangeReserveMist: "0",
    ...over,
  };
}

describe("SSUOwnerPayload BCS", () => {
  it("emits the exact load-bearing header prefix (peel_address, vec_u8, u8, u64)", () => {
    const ssu = ssuFixture();
    const enc = encodeSsuOwnerPayload(ssu);
    const expectedPrefix = cat(
      bcs.Address.serialize(normalizeSuiAddress(ssu.ssuId)).toBytes(), // 1 peel_address
      bcs.string().serialize("").toBytes(),                            // 2 peel_vec_u8 (url_slug)
      bcs.u8().serialize(2).toBytes(),                                 // 3 peel_u8 (bazaar_type)
      bcs.u64().serialize(3n).toBytes(),                               // 4 peel_u64 (original_tribe_id)
    );
    expect(Array.from(enc.slice(0, expectedPrefix.length))).toEqual(Array.from(expectedPrefix));
    // First 32 bytes are the SSU id big-endian (== sui::address::to_u256 source).
    expect(enc[31]).toBe(0xa6);
    expect(enc[0]).toBe(0x00);
  });

  it("round-trips the full 11-field payload", () => {
    const ssu = ssuFixture();
    const d = SSUOwnerPayloadBcs.parse(encodeSsuOwnerPayload(ssu));
    expect(d.original_ssu_id).toBe(normalizeSuiAddress(ssu.ssuId));
    expect(d.bazaar_type).toBe(2);
    expect(String(d.original_tribe_id)).toBe("3");
    expect(d.godot_url).toBe("https://x/");
    expect(d.members.length).toBe(1);
    expect(d.members[0].player).toBe(normalizeSuiAddress(addr("b1")));
    expect(d.members[0].ssu_role).toBe(7);
    expect(d.local_ban_list.length).toBe(1);
    expect(String(d.local_ban_list[0].expires_at_ms)).toBe("1750000000000");
    expect(String(d.ssu_eve_mist_at_snapshot)).toBe("12345");
  });

  it("NoTribe SSU encodes tribe id 0 in the header", () => {
    const enc = encodeSsuOwnerPayload(ssuFixture({ bazaarType: 0, tribeId: 0 }));
    expect(enc[32]).toBe(0x00);  // empty url_slug
    expect(enc[33]).toBe(0x00);  // bazaar_type 0
    expect(Array.from(enc.slice(34, 42))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]); // tribe_id 0 LE
  });
});

describe("TribeLeaderPayload BCS", () => {
  it("emits the exact load-bearing header prefix incl. field-8 original_total_supply", () => {
    const t = tribeFixture();
    const enc = encodeTribeLeaderPayload(t);
    const expectedPrefix = cat(
      bcs.u64().serialize(3n).toBytes(),              // 1 peel_u64 (original_tribe_id)
      bcs.string().serialize("Acme").toBytes(),       // 2 peel_vec_u8 (name)
      bcs.u8().serialize(2).toBytes(),                // 3 peel_u8 (bazaar_type)
      bcs.string().serialize("AcmeCoin").toBytes(),   // 4 peel_vec_u8 (token_name)
      bcs.string().serialize("ACM").toBytes(),        // 5 peel_vec_u8 (token_symbol)
      bcs.u8().serialize(2).toBytes(),                // 6 peel_u8 (token_decimals)
      bcs.u64().serialize(1000000n).toBytes(),        // 7 peel_u64 (token_supply_cap)
      bcs.u64().serialize(654321n).toBytes(),         // 8 peel_u64 (original_total_supply) — LOAD-BEARING
    );
    expect(Array.from(enc.slice(0, expectedPrefix.length))).toEqual(Array.from(expectedPrefix));
  });

  it("round-trips the full 14-field payload", () => {
    const d = TribeLeaderPayloadBcs.parse(encodeTribeLeaderPayload(tribeFixture()));
    expect(String(d.original_tribe_id)).toBe("3");
    expect(d.name).toBe("Acme");
    expect(d.bazaar_type).toBe(2);
    expect(d.token_symbol).toBe("ACM");
    expect(d.token_decimals).toBe(2);
    expect(String(d.original_total_supply)).toBe("654321");
    expect(d.global_bans.length).toBe(1);
    expect(d.token_balances.length).toBe(1);
    expect(String(d.token_balances[0].amount)).toBe("654321");
    expect(String(d.vault_eve_mist_at_snapshot)).toBe("42");
  });
});

describe("sub_id derivation", () => {
  it("SSU sub_id == to_u256(ssu_id) (big-endian address)", () => {
    expect(ssuSubId(addr("a6"))).toBe(0xa6n);
    expect(ssuSubId("0x0000000000000000000000000000000000000000000000000000000000000100")).toBe(256n);
  });
  it("TRIBE sub_id == tribe id widened", () => {
    expect(tribeSubId(3)).toBe(3n);
  });
});

describe("snapshotToReclaimRecords", () => {
  const snap: BazaarSnapshot = {
    schemaVersion: "v2.0", outgoingCheckpoint: "1", createdByNote: "",
    outgoingPackageIds: { dapp_hub: "0x1", shared_widgets: "0x2", bazaar_core: "0x3", bazaar_mission: "0x4", bazaar_economy: "0x5" },
    dappHub: { taxWalletId: addr("01"), taxWalletEveMist: "0" },
    tribes: [
      tribeFixture(),                                       // valid Advanced tribe #3
      tribeFixture({ tribeId: 9, bazaarType: 0 }),          // skipped (not Easy/Advanced)
    ],
    ssus: [
      ssuFixture(),                                         // valid Advanced SSU
      ssuFixture({ ssuId: addr("a7"), bazaarType: 0, tribeId: 0, ownerAddress: addr("c1") }), // NoTribe
      ssuFixture({ ssuId: addr("a8"), ownerAddress: "" }),  // skipped (no owner)
    ],
    bazaarNews: [], txHistory: [],
  };

  it("builds one record per SSU + per Easy/Advanced tribe, skipping malformed rows", () => {
    const r = snapshotToReclaimRecords(snap);
    expect(r.tribeCount).toBe(1);
    expect(r.ssuCount).toBe(2);
    expect(r.records.length).toBe(3);
    expect(r.skipped.length).toBe(2);

    const tribeRec = r.records.find((x) => x.recordType === RECORD_TYPE_TRIBE_LEADER)!;
    expect(tribeRec.subId).toBe(3n);
    expect(tribeRec.holder).toBe(normalizeSuiAddress(addr("a1")));

    const ssuRecs = r.records.filter((x) => x.recordType === RECORD_TYPE_SSU_OWNER);
    expect(ssuRecs.map((x) => x.subId).sort()).toEqual([0xa6n, 0xa7n].sort());
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
