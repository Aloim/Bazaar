// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * tribe-registry-tx.ts — R6.6.3 OS-28 tribe registry TX builders.
 *
 * NEW TX builders (NOT part of the 10-builder DappHub freeze):
 * - buildSetTribeGovId
 * - buildSetTribeEconomyIds
 *
 * File limit: 500 lines | Constitution Article XII.3
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES } from "@bazaar/shared/constants";

// Module name constant — avoids typos in target strings.
const MOD = MODULES.TRIBE_REGISTRY; // "tribe_registry"

// ── buildSetTribeGovId ────────────────────────────────────────────────────────

/**
 * One-shot setter: record the TribeGovernance shared object ID on a Tribe.
 * Called internally by bootstrap_tribe_governance (BazaarCore) after share_object.
 * Exposed here as a direct TX builder for admin recovery scenarios.
 *
 * Move: dapp_hub::tribe_registry::set_tribe_gov_id
 * Sig:  (cap: &TribeLeaderCap, registry: &mut TribeRegistry, tribe_id: u64,
 *        gov_id: address, clock: &Clock, ctx: &TxContext)
 *
 * Aborts: E_NOT_TRIBE_LEADER(9) if cap.tribe_id != tribe_id.
 *         E_ALREADY_SET(10) if tribe_gov_id is already Some.
 *
 * leaderCapId     — TribeLeaderCap owned object (caller's wallet)
 * tribeRegistryId — TribeRegistry shared object ID
 * tribeId         — numeric tribe index (u64 on-chain)
 * govId           — TribeGovernance shared object address to record
 */
export function buildSetTribeGovId(params: {
  leaderCapId:      string;
  tribeRegistryId:  string;
  tribeId:          number | string;
  govId:            string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MOD}::set_tribe_gov_id`,
    arguments: [
      tx.object(params.leaderCapId),                    // &TribeLeaderCap [0]
      tx.object(params.tribeRegistryId),                 // &mut TribeRegistry [1]
      tx.pure.u64(BigInt(params.tribeId)),               // tribe_id: u64 [2]
      tx.pure.address(params.govId),                     // gov_id: address [3]
      tx.object("0x6"),                                  // &Clock [4]
    ],
  });
  return tx;
}

// ── buildSetTribeEconomyIds ───────────────────────────────────────────────────

/**
 * One-shot setter: record the 3 economy shared object IDs on a Tribe.
 * Called internally by initialize_tribe_economy (BazaarEconomy) after share_object.
 * Exposed here as a direct TX builder for admin recovery scenarios.
 *
 * Move: dapp_hub::tribe_registry::set_tribe_economy_ids
 * Sig:  (cap: &TribeLeaderCap, registry: &mut TribeRegistry, tribe_id: u64,
 *        vault_id: address, ledger_id: address, exchange_config_id_val: address,
 *        clock: &Clock, ctx: &TxContext)
 *
 * Aborts: E_NOT_TRIBE_LEADER(9) if cap.tribe_id != tribe_id.
 *         E_ALREADY_SET(10) if any of the 3 fields is already Some.
 *
 * leaderCapId      — TribeLeaderCap owned object (caller's wallet)
 * tribeRegistryId  — TribeRegistry shared object ID
 * tribeId          — numeric tribe index (u64 on-chain)
 * vaultId          — TribeVault shared object address
 * ledgerId         — TribeTokenLedger shared object address
 * exchangeConfigId — ExchangeConfig shared object address
 */
export function buildSetTribeEconomyIds(params: {
  leaderCapId:      string;
  tribeRegistryId:  string;
  tribeId:          number | string;
  vaultId:          string;
  ledgerId:         string;
  exchangeConfigId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MOD}::set_tribe_economy_ids`,
    arguments: [
      tx.object(params.leaderCapId),                    // &TribeLeaderCap [0]
      tx.object(params.tribeRegistryId),                 // &mut TribeRegistry [1]
      tx.pure.u64(BigInt(params.tribeId)),               // tribe_id: u64 [2]
      tx.pure.address(params.vaultId),                   // vault_id: address [3]
      tx.pure.address(params.ledgerId),                  // ledger_id: address [4]
      tx.pure.address(params.exchangeConfigId),          // exchange_config_id_val: address [5]
      tx.object("0x6"),                                  // &Clock [6]
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
