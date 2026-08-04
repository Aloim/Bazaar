// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * DappHub governance TX builders.
 *
 * buildClaimOwnership — first-come-first-served DAppOwnerCap claim.
 *
 * Move: dapp_hub::dapp_governance::claim_ownership
 * Sig:  (claim_box: &mut DAppOwnerClaimBox, ctx: &mut TxContext): DAppOwnerCap
 *
 * The returned cap is transferred to senderAddress in the same PTB.
 * Aborts with E_ALREADY_CLAIMED (1) if the cap was already extracted.
 *
 * Architecture note: no BazarAuth authorize_extension step here.
 * Extension authorization is handled at bootstrap time via
 * bazaar_core::ssu_bootstrap::bootstrap_ssu_objects.
 *
 * Phase 5 (AUD-DH-01 retire): buildClearCustomTribeTax + buildClearCustomSsuTax DELETED.
 * Move fns clear_custom_tribe_tax / clear_custom_ssu_tax are retired in the V36 fresh
 * publish (override tables deleted). TribeDetailsWindow + SSUDetailsWindow callers cleaned.
 *
 * File limit: 500 lines | Constitution Article XII.3
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES, CLAIM_BOX_ID } from "@bazaar/shared/constants";

/**
 * Claim the DAppOwnerCap for the first time.
 * The cap object is transferred to senderAddress immediately in the PTB.
 * After this call, DAppOwnerClaimBox.cap is Option::none — is_claimable() returns false.
 */
export function buildClaimOwnership(params: {
  senderAddress: string;
}): Transaction {
  const tx = new Transaction();
  const [cap] = tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.DAPP_GOVERNANCE}::claim_ownership`,
    arguments: [
      tx.object(CLAIM_BOX_ID),
    ],
  });
  tx.transferObjects([cap], tx.pure.address(params.senderAddress));
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
