// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
// Original location: Bazar1/dapp/frontend/src/tx/autoRegister.ts
// Target package: dapp_hub — self-registration entry points.
//
// AMENDMENT (R6.6.1 / OS-16): The Move target changed from
// `bazaar_core::membership::register_stranger` to
// `bazaar_core::stranger_registration::register_stranger` because OS-16
// extracted stranger registration into its own module to break the
// membership ↔ ssu_governance import cycle and enable the freeze-guard call.
// NOT a stealth break — api-expander updated dapp_hub.md + cross-package-invariants.md
// in the same commit as the code change.
//
// AMENDMENT (OS-56 / 2026-05-04):
// - buildRegisterFriendly REMOVED: `bazaar_core::membership::register_friendly` does
//   not exist and self-promotion is not a valid path. Role upgrades require
//   `membership::set_ssu_role` (SSUOwnerCap-gated, not self-service).
// - buildRegisterStranger FIXED: now targets the correct module
//   (`stranger_registration::register_stranger`) and accepts params object
//   { memberRegistryId, ssuGovId } matching the Move signature.
// - maybeRegisterAtSSU REMOVED: called `ssu_governance::register_at_ssu` which
//   does not exist, and had zero callers across the frontend (dead code).

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, PACKAGE_IDS, SUI_CLOCK_ID } from "@bazaar/shared/constants";

// buildRegisterFriendly was removed in OS-56. The Move function
// `bazaar_core::membership::register_friendly` does not exist.
// Role upgrades (Stranger → Friendly / Member) require SSUOwnerCap-gated
// `membership::set_ssu_role` and cannot be initiated by the registrant.

/**
 * Register the transaction sender as a STRANGER on-chain.
 *
 * Move target: `bazaar_mission::stranger_registration::register_stranger`
 * (V35 size split: module relocated bazaar_core → bazaar_mission; guards now
 * enforced in bazaar_core::ssu_guarded_ops::register_stranger_guarded.)
 * Sig: (gov: &SSUGovernance, registry: &mut MemberRegistry, clock: &Clock, ctx: &mut TxContext)
 *
 * AMENDMENT (R6.6.1 / OS-16): module moved from `membership` to `stranger_registration`.
 * AMENDMENT (OS-56 / 2026-05-04): signature changed from positional (memberRegistryId,
 * ssuGovRegistryId?, ssuId?) to params object { memberRegistryId, ssuGovId } matching
 * the Move function's actual argument order. The phantom `ssu_governance::register_at_ssu`
 * second call is dropped — that function does not exist.
 *
 * Both consent buttons in HalGateWindow call this function (user mandate OS-56:
 * "make both buttons do the same"). Self-registration as Friendly is not possible.
 */
export function buildRegisterStranger(params: {
  memberRegistryId: string;
  ssuGovId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::stranger_registration::register_stranger`,
    arguments: [
      tx.object(params.ssuGovId),          // gov: &SSUGovernance
      tx.object(params.memberRegistryId),   // registry: &mut MemberRegistry
      tx.object(SUI_CLOCK_ID),             // clock: &Clock (0x6)
    ],
  });
  return tx;
}

/**
 * Prepends a register_stranger call to the transaction if the user
 * is not yet registered in the MemberRegistry (isRegistered === false).
 *
 * The frontend guard (`if (!isRegistered)`) prevents unnecessary calls.
 * Do NOT remove the guard — the Move function aborts if the sender is already registered.
 *
 * AMENDMENT (R6.6.1): ssuGovId is now required. Callers must pass the SSUGovernance
 * object ID resolved via useSSUSharedObjects(SSU_OBJECT_ID). If ssuGovId is "" or falsy
 * at call time (pre-bootstrap SSU), skip this call — the guard `if (!ssuGovId)` prevents
 * execution.
 *
 * AMENDMENT (V8 Phase B): memberRegistryId is now required. Callers must pass
 * shared.memberRegistryId from useSSUSharedObjects(). Replaces the hardcoded
 * MEMBER_REGISTRY_ID env-baked constant which fell back to "" on any fresh bootstrap
 * or unset VITE_MEMBER_REGISTRY_ID, causing MoveAbort code 12 in
 * assert_subject_in_governance (instruction 8 in the PTB 2nd command).
 * Pattern matches buildRegisterStranger at lines 49-63 of this file.
 */
export function maybeRegisterStranger(
  tx: Transaction,
  isRegistered: boolean,
  ssuGovId: string,
  memberRegistryId: string,
): Transaction {
  if (!isRegistered && ssuGovId && memberRegistryId) {
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_MISSION}::stranger_registration::register_stranger`,
      arguments: [
        tx.object(ssuGovId),           // gov: &SSUGovernance
        tx.object(memberRegistryId),   // registry: &mut MemberRegistry
        tx.object(SUI_CLOCK_ID),       // clock: &Clock (0x6)
      ],
    });
  }
  return tx;
}

// maybeRegisterAtSSU was removed in OS-56. It called
// `ssu_governance::register_at_ssu` which does not exist in the deployed
// Move source, and it had zero callers in bazaar-frontend (dead code).

/**
 * OS-58: Append a set_ssu_role moveCall to an existing Transaction.
 * Used by HalGateWindow consent flow to atomically elevate cap-bearers
 * to Owner role (7) in the same PTB as register_stranger.
 * Also used by OwnerTab ElevateToOwnerCard for idempotent self-elevation.
 *
 * Move target: `bazaar_core::membership::set_ssu_role`
 * Sig: (cap: &SSUOwnerCap, registry: &mut MemberRegistry, player: address, role: u8, ctx)
 * BazaarCore package: PACKAGE_ID alias below resolves to BAZAAR_CORE package ID.
 *
 * Move-side aborts:
 *   E_WRONG_SSU (6): cap.ssu_id != registry.ssu_id
 *   E_INVALID_ROLE (5): role < 1 or role > 7
 *   E_PLAYER_NOT_FOUND (4): player not in registry — in atomic-elevate use case,
 *     register_stranger (moveCall #1) must precede this call in the same PTB.
 *     Sui PTB sequential execution guarantees moveCall #1 mutation is visible to #2.
 *
 * SECURITY (SEC-01):
 *   `params.player` is FE-supplied and is NOT asserted Move-side to equal
 *   tx_context::sender(ctx). Possession of an SSUOwnerCap matching
 *   registry.ssu_id is sufficient to set ANY player's role in that registry.
 *
 *   Auto-elevate (cap-bearer self-elevation) callers MUST pass the connected
 *   `walletAddress` for `params.player`. Both HalGateWindow and OwnerTab
 *   ElevateToOwnerCard do this correctly.
 *
 *   Generic helper: downstream features that need cap-holder -> other-address
 *   role assignment may pass other addresses (intentional, as the underlying
 *   Move surface permits it — buildGrantSSURole uses the same surface).
 */
export function appendSetSSURole(
  tx: Transaction,
  params: { ownerCapId: string; memberRegistryId: string; player: string; role: number },
): Transaction {
  // PACKAGE_ID in this file is imported as the BazaarCore package alias (see imports above).
  tx.moveCall({
    target: `${PACKAGE_ID}::membership::set_ssu_role`,
    arguments: [
      tx.object(params.ownerCapId),       // cap: &SSUOwnerCap
      tx.object(params.memberRegistryId), // registry: &mut MemberRegistry
      tx.pure.address(params.player),     // player: address
      tx.pure.u8(params.role),            // role: u8
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
