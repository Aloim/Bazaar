// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V26 — Advanced FREE shop TX builders.
 *
 * Move module: bazaar_economy::free_shop_advanced
 *
 *   create_free_shop_advanced  — replaces bazaar_core::bazar::create_free_shop
 *     on Advanced bazaars (which now aborts with E_FREE_SHOP_WRONG_KIND_FOR_BAZAAR).
 *     Pre-burns tribe-token prepay from caller's ledger row; calls
 *     bazar::create_free_shop_partial to record the shop with the pool +
 *     per-claim amount.
 *
 *   free_token_claim_advanced  — replaces bazaar_core::shop_ops_de::free_coin_claim
 *     on Advanced. Mints per_claim tribe tokens to claimer's ledger row.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, BAZAR_REGISTRY_ID, SUI_CLOCK_ID } from "../../constants";

const MODULE = "free_shop_advanced";

export interface BuildCreateFreeShopAdvancedParams {
  ssuGovId:             string;
  tribeGovId:           string;
  memberRegistryId:     string;
  ledgerId:             string;
  bazaarType:           number;       // must be 2 (Advanced)
  title:                string;
  ssuId:                string;
  tribeId:              number;
  itemTypeIds:          number[];
  quantities:           number[];
  expiryMs:             number;
  positionX:            number;
  positionY:            number;
  tribeTokenPrepayScaled: number;     // raw scaled units (V26+ decimals=2)
  tribeTokenPerClaimScaled: number;   // raw scaled units
}

export function buildCreateFreeShopAdvanced(
  params: BuildCreateFreeShopAdvancedParams,
  tx: Transaction,
): void {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULE}::create_free_shop_advanced`,
    arguments: [
      tx.object(BAZAR_REGISTRY_ID),                  // registry: &mut BazarRegistry
      tx.object(params.ssuGovId),                    // gov: &SSUGovernance
      tx.object(params.tribeGovId),                  // tribe_gov: &TribeGovernance
      tx.object(params.memberRegistryId),            // members: &MemberRegistry
      tx.object(params.ledgerId),                    // ledger: &mut TribeTokenLedger
      tx.pure.u8(params.bazaarType),                 // bazaar_type: u8
      tx.pure(bcsTitleBytes(params.title)),          // title: vector<u8>
      tx.pure.address(params.ssuId),                 // ssu_id: address
      tx.pure.u64(BigInt(params.tribeId)),           // tribe_id: u64
      tx.pure.vector("u64", params.itemTypeIds.map(BigInt)),
      tx.pure.vector("u64", params.quantities.map(BigInt)),
      tx.pure.u64(BigInt(params.expiryMs)),          // expiry_ms: u64
      tx.pure.u64(BigInt(params.positionX)),         // position_x: u64
      tx.pure.u64(BigInt(params.positionY)),         // position_y: u64
      tx.pure.u64(BigInt(params.tribeTokenPrepayScaled)),   // tribe_token_prepay
      tx.pure.u64(BigInt(params.tribeTokenPerClaimScaled)), // tribe_token_per_claim
      tx.object(SUI_CLOCK_ID),                       // clock: &Clock
    ],
  });
}

export interface BuildFreeTokenClaimAdvancedParams {
  shopId:       string;
  ssuGovId:     string;
  tribeGovId:   string;
  ledgerId:     string;
}

export function buildFreeTokenClaimAdvanced(
  params: BuildFreeTokenClaimAdvancedParams,
  tx: Transaction,
): void {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULE}::free_token_claim_advanced`,
    arguments: [
      tx.object(BAZAR_REGISTRY_ID),                  // registry: &mut BazarRegistry
      tx.pure.id(params.shopId),                     // shop_id: ID
      tx.object(params.ssuGovId),                    // gov: &SSUGovernance
      tx.object(params.tribeGovId),                  // tribe_gov: &TribeGovernance
      tx.object(params.ledgerId),                    // ledger: &mut TribeTokenLedger
      tx.object(SUI_CLOCK_ID),                       // clock: &Clock
    ],
  });
}

// Local helper — BCS-encode title to vector<u8>. Avoids pulling a heavyweight
// BCS dep just for one string.
function bcsTitleBytes(s: string): Uint8Array {
  const enc = new TextEncoder().encode(s);
  const len = enc.length;
  // ULEB128 length prefix (small strings under 128 bytes fit in 1 byte).
  if (len < 0x80) {
    const out = new Uint8Array(1 + len);
    out[0] = len;
    out.set(enc, 1);
    return out;
  }
  // Two-byte ULEB128 covers up to 16k — title cap is 20 chars, so this branch
  // is dead in practice but kept for correctness.
  const out = new Uint8Array(2 + len);
  out[0] = (len & 0x7f) | 0x80;
  out[1] = (len >> 7) & 0xff;
  out.set(enc, 2);
  return out;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
