// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * registration-helpers-tx.ts — V16 sweep B4 (2026-05-13).
 *
 * TX builders for `dapp_hub::registration_helpers` (OS-48 Path B):
 *   - buildSetJoinPolicyAsLeader
 *   - buildJoinTribeOpen
 *
 * Relocated from the retired `tx/bazaar_economy/tribe-tax-tx.ts` Bazar1-port
 * file. The original builders targeted `${PACKAGE_ID}::registration_helpers::*`
 * where `PACKAGE_ID` defaults to BazaarCore — a latent bug, since the
 * `registration_helpers` Move module lives in DappHub. This file fixes that
 * by routing through `PACKAGE_IDS.DAPP_HUB` explicitly.
 *
 * File limit: 500 lines | Constitution Article XIV.4 (auditable budget; this
 * file is well under the limit but the project-wide convention is to declare it).
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, SUI_CLOCK_ID } from "@bazaar/shared/constants";

const MOD = MODULES.REGISTRATION_HELPERS;

/**
 * Set the tribe join policy (Tribe Leader only).
 * policy: 0 = open (anyone can join), 1 = application required.
 *
 * Move: dapp_hub::registration_helpers::set_join_policy_as_leader(
 *         cap: &TribeLeaderCap,
 *         registry: &mut TribeRegistry,
 *         new_policy: u8,
 *         ctx: &TxContext,
 *       )
 */
export function buildSetJoinPolicyAsLeader(
  registryId:  string,
  leaderCapId: string,
  policy:      number,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MOD}::set_join_policy_as_leader`,
    arguments: [
      tx.object(leaderCapId),
      tx.object(registryId),
      tx.pure.u8(policy),
    ],
  });
  return tx;
}

/**
 * Join a tribe whose join_policy == 0 (open, permissionless).
 *
 * Move: dapp_hub::registration_helpers::join_tribe_open(
 *         registry: &mut TribeRegistry,
 *         tribe_id: u64,
 *         ssu_id: address,
 *         clock: &Clock,
 *         ctx: &TxContext,
 *       )
 *
 * Emits JoinedTribeOpenEvent with timestamp_ms (per OS-48 Path B audit trail).
 */
export function buildJoinTribeOpen(
  registryId: string,
  tribeIdx:   number,
  ssuId:      string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MOD}::join_tribe_open`,
    arguments: [
      tx.object(registryId),
      tx.pure.u64(tribeIdx),
      tx.pure.address(ssuId),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
