/**
 * @bazaar/shared/tx — Transaction builders for Sui Move calls.
 *
 * Each builder constructs a Transaction (PTB) for a specific Move entry
 * function. Builders are pure functions — they take typed args and return
 * a Transaction ready for signAndExecuteTransaction.
 *
 * All builders are stubs: they create the Transaction object and add
 * TODO comments showing the exact Move call to wire in Phase 3+.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import { PACKAGE_IDS, DAPP_HUB_V2, SHARED_OBJECTS, MODULES, EVE_COIN_TYPE, BAZAAR_CORE_REBIND_PKG, v36Enabled } from "../constants";
import { borrowSSUOwnerCap, returnSSUOwnerCap, type SSUOwnerCapRef } from "./bazaarcore/ssu-receiving-tx";

/**
 * How a registration PTB handles the per-SSU bootstrap step.
 *  - "bootstrap": fresh SSU — append bootstrap_ssu_objects (default, original behavior).
 *  - "skip":      SSU already bootstrapped with a MATCHING binding — registration only.
 *  - "rebind":    SSU already bootstrapped with a DIFFERENT binding — append
 *                 ssu_rebind::rebind_ssu_governance (requires the bazaar_core
 *                 additive upgrade; BAZAAR_CORE_REBIND_PKG must be set).
 * Re-bootstrap aborts on-chain (BootstrappedKey persists across deregistration
 * by design), so callers MUST pick "skip"/"rebind" for re-registered SSUs —
 * resolve the plan via planRebootstrap() in hooks/bazaarcore/rebind-helpers.
 */
export type SSURebootstrapPlan =
  | { mode: "bootstrap" }
  | { mode: "skip" }
  | { mode: "rebind"; ssuGovId: string; memberRegistryId: string };

/** Append ssu_rebind::rebind_ssu_governance — syncs the existing per-SSU
 *  governance + member registry to the registration created earlier in this PTB. */
function appendRebindCall(tx: Transaction, plan: { ssuGovId: string; memberRegistryId: string }): void {
  if (!BAZAAR_CORE_REBIND_PKG) {
    throw new Error(
      "Switching a previously set-up SSU to a different tribe/bazaar type needs the " +
      "bazaar_core rebind upgrade, which is not live yet. Re-registering with the " +
      "SAME tribe/type still works.",
    );
  }
  tx.moveCall({
    target: `${BAZAAR_CORE_REBIND_PKG}::ssu_rebind::rebind_ssu_governance`,
    arguments: [
      tx.object(SHARED_OBJECTS.SSU_REGISTRY),
      tx.object(SHARED_OBJECTS.BAZAR_REGISTRY),
      tx.object(plan.ssuGovId),
      tx.object(plan.memberRegistryId),
      tx.object("0x6"),
    ],
  });
}

/**
 * Build the EVE fee-payment coin for a registration/creation call (V31).
 * When `feeMist > 0` AND an EVE coin id is supplied, split exactly the fee from
 * it; otherwise return a fresh zero Coin<EVE> (the configured fee is 0, so the
 * Move-side `payment >= fee` assert passes with a zero coin). Keep `feeMist`/
 * `eveCoinId` resolved by the caller (read fee via useDAppFees; pick the coin
 * via getCoins). NOTE: a non-zero fee splits from a SINGLE coin — the caller
 * should pass an EVE coin whose balance covers the fee.
 */
function makeFeePayment(tx: Transaction, feeMist: number, eveCoinId?: string | null) {
  if (feeMist > 0 && eveCoinId) {
    const [pay] = tx.splitCoins(tx.object(eveCoinId), [tx.pure.u64(BigInt(feeMist))]);
    return pay;
  }
  const [pay] = tx.moveCall({ target: "0x2::coin::zero", typeArguments: [EVE_COIN_TYPE] });
  return pay;
}

/**
 * Optional auth-bundle params: when supplied to a registration builder, the
 * builder appends a `world::storage_unit::authorize_extension<BazarAuth>`
 * call to the PTB so the freshly-registered SSU is immediately ready for
 * shop creation (no separate manual auth step needed). Requires the
 * character ID + OwnerCap<StorageUnit> coords for the SSU.
 *
 * Call sites resolve these async via `resolveSSUOwnerCap()` before invoking
 * the builder. When omitted, the builder behaves exactly as before — caller
 * is responsible for a separate auth TX if needed.
 */
export interface BazarAuthBundle {
  characterId:   string;
  ssuCapId:      string;
  ssuCapVersion: string;
  ssuCapDigest:  string;
}

const WORLD_PKG = () => (import.meta.env.VITE_WORLD_PACKAGE_ID as string | undefined) ?? "";
const BAZAR_AUTH_TYPE = () => `${PACKAGE_IDS.BAZAAR_CORE}::bazar::BazarAuth`;
const STORAGE_UNIT_TYPE = () => `${WORLD_PKG()}::storage_unit::StorageUnit`;

/**
 * Append `authorize_extension<BazarAuth>` to an existing PTB. Borrows the
 * SSU's OwnerCap<StorageUnit> from the character via Sui Receiving, calls
 * authorize, then returns the cap. Caller MUST also have called
 * `register_*` + `bootstrap_ssu_objects` (or equivalent) before invoking
 * this — the BazarAuth witness type is bound to PACKAGE_IDS.BAZAAR_CORE
 * which must be on-chain before authorization.
 */
function appendAuthorizeBazarAuth(
  tx: Transaction,
  ssuId: string,
  auth:  BazarAuthBundle,
): void {
  const world = WORLD_PKG();
  if (!world) {
    console.warn("[appendAuthorizeBazarAuth] VITE_WORLD_PACKAGE_ID not set — skipping auth.");
    return;
  }
  const [ownerCap, receipt] = tx.moveCall({
    target:        `${world}::character::borrow_owner_cap`,
    typeArguments: [STORAGE_UNIT_TYPE()],
    arguments: [
      tx.object(auth.characterId),
      tx.receivingRef({ objectId: auth.ssuCapId, version: auth.ssuCapVersion, digest: auth.ssuCapDigest }),
    ],
  });
  tx.moveCall({
    target:        `${world}::storage_unit::authorize_extension`,
    typeArguments: [BAZAR_AUTH_TYPE()],
    arguments:     [tx.object(ssuId), ownerCap],
  });
  tx.moveCall({
    target:        `${world}::character::return_owner_cap`,
    typeArguments: [STORAGE_UNIT_TYPE()],
    arguments:     [tx.object(auth.characterId), ownerCap, receipt],
  });
}

// ── Registration TX Builders ───────────────────────────────────────────────────

/**
 * Register an SSU as a standalone NoTribe marketplace and bootstrap its
 * BazaarCore shared objects in a single atomic PTB (OS-54 amendment).
 *
 * Amendment: Two moveCall instructions in one PTB — Sui atomicity guarantees
 * both succeed or both abort together (R6.6.1 pattern; Article I.3 PASS —
 * PTB composition, not a Move-side dependency edge).
 *
 * Move: dapp_hub::ssu_registry::register_ssu_notribe
 * Move: bazaar_core::ssu_bootstrap::bootstrap_ssu_objects (bazaar_type=0, tribe_id=0)
 *
 * @param ssuId         - SSU address (0x-prefixed hex).
 * @param senderAddress - Connected wallet address; becomes the SSUOwnerCap recipient.
 *                        Source: dAppKit.account.address (caller is the SSU owner).
 */
export function buildRegisterNoTribeSSU(
  ssuId: string,
  senderAddress: string,
  authBundle?: BazarAuthBundle,
  feeMist: number = 0,
  eveCoinId?: string | null,
  plan: SSURebootstrapPlan = { mode: "bootstrap" },
  // V36 DH-10: caller resolves the SSU's StorageUnit OwnerCap (resolveSSUOwnerCap) +
  // its owning Character so register can verify on-chain ownership (anti-squat). Required
  // only when VITE_V36_ENABLED — the V35 entry has no ownership-proof arg.
  characterId?: string,
  ssuOwnerCapRef?: SSUOwnerCapRef,
): Transaction {
  const tx = new Transaction();
  const isV36 = v36Enabled();
  if (isV36 && (!characterId || !ssuOwnerCapRef)) {
    throw new Error(
      "register_ssu_notribe (V36) requires characterId + ssuOwnerCapRef — the StorageUnit OwnerCap ownership proof (DH-10 anti-squat)",
    );
  }

  // [1/2] DappHub self-registration — V31: charges the SSU registration fee
  // (config + tax wallet + EVE payment; zero coin when the fee is 0).
  // V36 DH-10: borrows the SSU's OwnerCap<StorageUnit> in-PTB and passes it as an
  // ownership proof (arg slot 4, after payment, before ssu_id); returned same PTB.
  const borrowed = isV36
    ? borrowSSUOwnerCap(
        tx, characterId!,
        ssuOwnerCapRef!.ssuCapId, ssuOwnerCapRef!.ssuCapVersion, ssuOwnerCapRef!.ssuCapDigest,
      )
    : null;
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.SSU_REGISTRY}::register_ssu_notribe`,
    arguments: [
      tx.object(SHARED_OBJECTS.SSU_REGISTRY),
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
      tx.object(SHARED_OBJECTS.TAX_WALLET),
      makeFeePayment(tx, feeMist, eveCoinId),
      ...(borrowed ? [borrowed.ownerCap] : []), // owner_cap: &OwnerCap<StorageUnit> (slot 4, V36)
      tx.pure.address(ssuId),
      tx.object("0x6"),
    ],
  });

  // [2/2] BazaarCore bootstrap — atomic with registration above (OS-54).
  // bazaar_type=0 (NoTribe), tribe_id=0, owner=senderAddress (SSU owner via world contract).
  // AMENDMENT (OS-54-followup Phase 2): bootstrap_ssu_objects now receives &mut SSURegistry
  // as its first argument. SSU_REGISTRY prepended per new Move signature.
  // Re-registered SSUs MUST NOT re-bootstrap (E_ALREADY_BOOTSTRAPPED) — the plan
  // swaps this step for nothing ("skip") or a governance rebind ("rebind").
  if (plan.mode === "bootstrap") {
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_CORE}::ssu_bootstrap::bootstrap_ssu_objects`,
      arguments: [
        tx.object(SHARED_OBJECTS.SSU_REGISTRY), // registry: &mut SSURegistry (OS-54-followup)
        tx.pure.address(ssuId),
        tx.pure.u8(0),                   // bazaar_type = 0 (NoTribe)
        tx.pure.u64(0n),                 // tribe_id = 0
        tx.pure.address(senderAddress),  // owner = sender (= SSU owner; world contract anchors)
        tx.pure.address(PACKAGE_IDS.BAZAAR_CORE), // V6: package_id passed explicitly
        tx.object("0x6"),                // &Clock
      ],
    });
  } else if (plan.mode === "rebind") {
    appendRebindCall(tx, plan);
  }

  // Optional [3/3] BazarAuth authorization bundled into the same PTB so the
  // freshly-registered SSU is immediately ready for shop creation. Skipped
  // when authBundle is omitted (back-compat for callers that don't yet
  // resolve OwnerCap coords ahead of time).
  //
  // V36 DH-10 FIX: when V36 already borrowed the world OwnerCap for the
  // ownership proof, REUSE that same borrowed cap here instead of borrowing it
  // a second time. Receiving the same object twice in one PTB is invalid (the
  // second receivingRef is stale after the first borrow+return) — the cause of
  // `CommandArgumentError { kind: ArgumentWithoutValue }`. Authorize before the
  // single return below.
  if (authBundle) {
    if (borrowed) {
      tx.moveCall({
        target:        `${WORLD_PKG()}::storage_unit::authorize_extension`,
        typeArguments: [BAZAR_AUTH_TYPE()],
        arguments:     [tx.object(ssuId), borrowed.ownerCap],
      });
    } else {
      appendAuthorizeBazarAuth(tx, ssuId, authBundle);
    }
  }

  // Return the borrowed cap exactly once, after register + (optional) authorize.
  if (borrowed) returnSSUOwnerCap(tx, characterId!, borrowed.ownerCap, borrowed.receipt);

  return tx;
}

/**
 * Open-tribe direct registration (atomic register + join + bootstrap PTB).
 * Move: dapp_hub::registration_helpers::register_and_join_open_tribe
 *     + bazaar_core::ssu_bootstrap::bootstrap_ssu_objects
 * bazaarType MUST equal the tribe's on-chain bazaar_type (1=Easy, 2=Advanced).
 * Use only for tribe.joinPolicy === "open"; otherwise use buildApplyToTribe.
 *
 * V36 BREAKING CHANGE: register_and_join_open_tribe now charges the configured
 * tribe_join_fee and requires the world-layer OwnerCap<StorageUnit> ownership
 * proof (DH-10 anti-squat). New params: config + wallet + payment, plus the
 * borrowed owner_cap at slot 5 (after payment, before tribe_id). The owner-cap
 * coords are resolved by the caller (resolveSSUOwnerCap) and required only when
 * VITE_V36_ENABLED. The V35 entry keeps the old 5-arg shape.
 */
export function buildRegisterAndJoinOpenTribe(
  ssuId: string,
  tribeId: number | string,
  bazaarType: 1 | 2,
  senderAddress: string,
  authBundle?: BazarAuthBundle,
  plan: SSURebootstrapPlan = { mode: "bootstrap" },
  // V36 DH-10 + tribe_join_fee — see doc-comment above.
  feeMist: number = 0,
  eveCoinId?: string | null,
  characterId?: string,
  ssuOwnerCapRef?: SSUOwnerCapRef,
): Transaction {
  const tx = new Transaction();
  const isV36 = v36Enabled();
  if (isV36 && (!characterId || !ssuOwnerCapRef)) {
    throw new Error(
      "register_and_join_open_tribe (V36) requires characterId + ssuOwnerCapRef — the StorageUnit OwnerCap ownership proof (DH-10 anti-squat)",
    );
  }

  // V36 borrows the world OwnerCap once: passed by-ref as the ownership proof,
  // reused by-ref for authorize_extension below, returned once at the end.
  const borrowed = isV36
    ? borrowSSUOwnerCap(
        tx, characterId!,
        ssuOwnerCapRef!.ssuCapId, ssuOwnerCapRef!.ssuCapVersion, ssuOwnerCapRef!.ssuCapDigest,
      )
    : null;

  if (isV36) {
    tx.moveCall({
      target: `${PACKAGE_IDS.DAPP_HUB}::registration_helpers::register_and_join_open_tribe`,
      arguments: [
        tx.object(SHARED_OBJECTS.SSU_REGISTRY),    // ssu_registry: &mut SSURegistry
        tx.object(SHARED_OBJECTS.TRIBE_REGISTRY),  // tribe_registry: &mut TribeRegistry
        tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG), // config: &GovernanceConfig
        tx.object(SHARED_OBJECTS.TAX_WALLET),      // wallet: &mut DAppTaxWallet
        makeFeePayment(tx, feeMist, eveCoinId),    // payment: Coin<EVE>
        borrowed!.ownerCap,                        // owner_cap: &OwnerCap<StorageUnit> (slot 5)
        tx.pure.u64(BigInt(tribeId)),
        tx.pure.address(ssuId),
        tx.object("0x6"),
      ],
    });
  } else {
    tx.moveCall({
      target: `${PACKAGE_IDS.DAPP_HUB}::registration_helpers::register_and_join_open_tribe`,
      arguments: [
        tx.object(SHARED_OBJECTS.SSU_REGISTRY),
        tx.object(SHARED_OBJECTS.TRIBE_REGISTRY),
        tx.pure.u64(BigInt(tribeId)),
        tx.pure.address(ssuId),
        tx.object("0x6"),
      ],
    });
  }

  if (plan.mode === "bootstrap") {
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_CORE}::ssu_bootstrap::bootstrap_ssu_objects`,
      arguments: [
        tx.object(SHARED_OBJECTS.SSU_REGISTRY),
        tx.pure.address(ssuId),
        tx.pure.u8(bazaarType),
        tx.pure.u64(BigInt(tribeId)),
        tx.pure.address(senderAddress),
        tx.pure.address(PACKAGE_IDS.BAZAAR_CORE),
        tx.object("0x6"),
      ],
    });
  } else if (plan.mode === "rebind") {
    appendRebindCall(tx, plan);
  }

  // Optional: bundle BazarAuth authorization so shop creation works
  // immediately after registration with no separate manual setup step.
  // V36 DH-10 FIX: reuse the already-borrowed cap (no second receive of the
  // same object). Authorize before the single return below.
  if (authBundle) {
    if (borrowed) {
      tx.moveCall({
        target:        `${WORLD_PKG()}::storage_unit::authorize_extension`,
        typeArguments: [BAZAR_AUTH_TYPE()],
        arguments:     [tx.object(ssuId), borrowed.ownerCap],
      });
    } else {
      appendAuthorizeBazarAuth(tx, ssuId, authBundle);
    }
  }

  if (borrowed) returnSSUOwnerCap(tx, characterId!, borrowed.ownerCap, borrowed.receipt);
  return tx;
}

/**
 * Apply to join a tribe as an SSU operator.
 * Move: dapp_hub::registration::apply_to_tribe
 */
export function buildApplyToTribe(
  ssuId: string,
  tribeId: string,
  message: string,
  feeMist: number = 0,
  eveCoinId?: string | null,
): Transaction {
  const tx = new Transaction();
  const enc = new TextEncoder();
  // V31: the join fee is escrowed (separate DAppEscrowWallet) until accept/reject.
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.REGISTRATION}::apply_to_tribe`,
    arguments: [
      tx.object(SHARED_OBJECTS.REQUEST_QUEUE),
      tx.object(SHARED_OBJECTS.ESCROW_WALLET),
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
      makeFeePayment(tx, feeMist, eveCoinId),
      tx.pure.u64(BigInt(tribeId)),
      tx.pure.address(ssuId),
      tx.pure.vector("u8", Array.from(enc.encode(message))),
      tx.object("0x6"),
    ],
  });
  return tx;
}

/**
 * Accept a pending tribe application and bootstrap the applicant's BazaarCore
 * shared objects in a single atomic PTB (OS-54 amendment).
 *
 * Amendment: Two moveCall instructions in one PTB — Sui atomicity guarantees
 * both succeed or both abort together (R6.6.1 pattern; Article I.3 PASS).
 *
 * Move: dapp_hub::registration::accept_application
 * Move: bazaar_core::ssu_bootstrap::bootstrap_ssu_objects
 *
 * SA C2: applicantAddress MUST be sourced from RegistrationRequest.applicant
 * (the on-chain TribeApplication.applicant field), NOT from the leader's
 * connected wallet address (dAppKit.account.address). The leader signs the TX
 * but the SSUOwnerCap is transferred to the applicant.
 *
 * @param tribeLeaderCapId  - TribeLeaderCap object ID held by the leader.
 * @param applicationId     - TribeApplication.id (from useRegistrationRequests).
 * @param applicantAddress  - TribeApplication.applicant (r.applicant). NOT leader wallet.
 * @param ssuId             - TribeApplication.ssu_id (r.ssuId).
 * @param bazaarType        - Tribe's bazaar_type: 1=Easy, 2=Advanced (from useTribeRegistry).
 * @param tribeId           - TribeApplication.tribe_id (r.tribeId).
 */
export function buildAcceptApplication(
  tribeLeaderCapId: string,
  applicationId: number,
  applicantAddress: string,
  ssuId: string,
  bazaarType: 1 | 2,
  tribeId: number,
  plan: SSURebootstrapPlan = { mode: "bootstrap" },
): Transaction {
  const tx = new Transaction();

  // [1/2] DappHub acceptance — V31: forwards the escrowed join fee from the
  // escrow wallet into the tax wallet (escrow + tax_wallet args added).
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.REGISTRATION}::accept_application`,
    arguments: [
      tx.object(tribeLeaderCapId),
      tx.object(SHARED_OBJECTS.REQUEST_QUEUE),
      tx.object(SHARED_OBJECTS.ESCROW_WALLET),
      tx.object(SHARED_OBJECTS.TAX_WALLET),
      tx.object(SHARED_OBJECTS.TRIBE_REGISTRY),
      tx.object(SHARED_OBJECTS.SSU_REGISTRY),
      tx.pure.u64(BigInt(applicationId)),
      tx.object("0x6"),
    ],
  });

  // [2/2] BazaarCore bootstrap — atomic; owner = applicant (NOT the leader signing the TX).
  // SA C2: applicantAddress must be r.applicant from useRegistrationRequests.
  // AMENDMENT (OS-54-followup Phase 2): bootstrap_ssu_objects now receives &mut SSURegistry
  // as its first argument. SSU_REGISTRY prepended per new Move signature.
  // Re-registered SSUs MUST NOT re-bootstrap — rebind_ssu_governance is
  // permissionless (values come from the registry row), so the leader-signed
  // accept PTB composes with it.
  if (plan.mode === "bootstrap") {
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_CORE}::ssu_bootstrap::bootstrap_ssu_objects`,
      arguments: [
        tx.object(SHARED_OBJECTS.SSU_REGISTRY), // registry: &mut SSURegistry (OS-54-followup)
        tx.pure.address(ssuId),
        tx.pure.u8(bazaarType),
        tx.pure.u64(BigInt(tribeId)),
        tx.pure.address(applicantAddress),  // SSUOwnerCap → applicant, NOT leader
        tx.pure.address(PACKAGE_IDS.BAZAAR_CORE), // V6: package_id passed explicitly
        tx.object("0x6"),                   // &Clock
      ],
    });
  } else if (plan.mode === "rebind") {
    appendRebindCall(tx, plan);
  }

  return tx;
}

/**
 * Reject a pending tribe application. Requires TribeLeaderCap for the tribe.
 * Move: dapp_hub::registration::reject_application
 */
export function buildRejectApplication(
  tribeLeaderCapId: string,
  applicationId: number,
): Transaction {
  const tx = new Transaction();
  // V31: refunds the escrowed join fee to the applicant (escrow arg added).
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.REGISTRATION}::reject_application`,
    arguments: [
      tx.object(tribeLeaderCapId),
      tx.object(SHARED_OBJECTS.REQUEST_QUEUE),
      tx.object(SHARED_OBJECTS.ESCROW_WALLET),
      tx.pure.u64(BigInt(applicationId)),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Tribe Creation TX Builders ─────────────────────────────────────────────────

/**
 * Create an Easy Bazaar tribe. Returns TribeLeaderCap transferred to sender.
 * Move: dapp_hub::tribe_registry::create_easy_tribe
 * join_policy: 0 = open, 1 = application
 * governanceMode: u8 — IMMUTABLE at creation. v1 only supports 0 (capitalistic).
 *   Non-0 value aborts E_INVALID_GOVERNANCE_MODE (dapp_hub) + E_UNSUPPORTED_MODE (bazaar_core).
 *   Article XV amendment required to unlock modes > 0. Do NOT pass non-0 without that amendment.
 *   AP2-F / FP1-28.
 */
export function buildCreateEasyTribe(
  name: string,
  description: string,
  joinPolicy: 0 | 1 = 0,
  senderAddress: string,
  governanceMode: number = 0, // AP2-F / FP1-28 — immutable at creation (Article XV)
  feeMist: number = 0,
  eveCoinId?: string | null,
): Transaction {
  const tx = new Transaction();
  const enc = new TextEncoder();
  // V31: charges the easy-tribe creation fee → tax wallet (config + wallet +
  // EVE payment args; zero coin when the fee is 0).
  const [cap] = tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.TRIBE_REGISTRY}::create_easy_tribe`,
    arguments: [
      tx.object(SHARED_OBJECTS.TRIBE_REGISTRY),
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
      tx.object(SHARED_OBJECTS.TAX_WALLET),
      makeFeePayment(tx, feeMist, eveCoinId),
      tx.pure.vector("u8", Array.from(enc.encode(name))),
      tx.pure.vector("u8", Array.from(enc.encode(description))),
      tx.pure.u8(joinPolicy),
      tx.pure.u8(governanceMode),   // AP2-F: between joinPolicy and clock
      tx.object("0x6"),
    ],
  });
  tx.transferObjects([cap], tx.pure.address(senderAddress));
  return tx;
}

/**
 * Create an Advanced Bazaar tribe. Returns TribeLeaderCap transferred to sender.
 * Move: dapp_hub::tribe_registry::create_advanced_tribe
 * V17: tokenName + tokenSymbol are now persisted on the Tribe row at create time
 * (the single source of truth). bazaar_economy::bootstrap_advanced_complete reads
 * them from the registry — the user no longer re-enters them in the bootstrap form.
 *   - tokenName  : 1..=32 UTF-8 bytes (Move asserts non-empty + max length)
 *   - tokenSymbol: 1..=8 bytes, [A-Z0-9] only (Move asserts charset + max length)
 * governanceMode: u8 — IMMUTABLE at creation. v1 only supports 0 (capitalistic).
 *   Non-0 value aborts E_INVALID_GOVERNANCE_MODE (dapp_hub) + E_UNSUPPORTED_MODE (bazaar_core).
 *   Article XV amendment required to unlock modes > 0.
 */
export function buildCreateAdvancedTribe(
  name: string,
  description: string,
  tokenName: string,
  tokenSymbol: string,
  joinPolicy: 0 | 1 = 0,
  senderAddress: string,
  governanceMode: number = 0,
  feeMist: number = 0,
  eveCoinId?: string | null,
): Transaction {
  const tx = new Transaction();
  const enc = new TextEncoder();
  // V31: charges the advanced-tribe creation fee → tax wallet.
  const [cap] = tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.TRIBE_REGISTRY}::create_advanced_tribe`,
    arguments: [
      tx.object(SHARED_OBJECTS.TRIBE_REGISTRY),
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
      tx.object(SHARED_OBJECTS.TAX_WALLET),
      makeFeePayment(tx, feeMist, eveCoinId),
      tx.pure.vector("u8", Array.from(enc.encode(name))),
      tx.pure.vector("u8", Array.from(enc.encode(description))),
      tx.pure.vector("u8", Array.from(enc.encode(tokenName))),
      tx.pure.vector("u8", Array.from(enc.encode(tokenSymbol))),
      tx.pure.u8(joinPolicy),
      tx.pure.u8(governanceMode),
      tx.object("0x6"),
    ],
  });
  tx.transferObjects([cap], tx.pure.address(senderAddress));
  return tx;
}

// ── Tribe Creation + Bootstrap (single-PTB, SSU-less) ──────────────────────────

/**
 * Create an Easy tribe AND bootstrap its TribeGovernance in one transaction so the
 * tribe is immediately governable from the DappHub — no SSU required. The registry
 * mutation from create_easy_tribe is visible to the bootstrap call later in the
 * same PTB.
 *
 * PTB: create_easy_tribe → (cap) → bootstrap_tribe_governance(registry, &cap,
 *      package_id, clock) → transfer cap to sender.
 *
 * NOTE: targets `bazaar_core::tribe_governance_bootstrap::bootstrap_tribe_governance`
 * (the V17 module + signature with package_id) — NOT the stale
 * `buildBootstrapTribeGovernance` builder (wrong module, missing package_id).
 */
export function buildCreateEasyTribeAndBootstrap(
  name: string,
  description: string,
  joinPolicy: 0 | 1 = 0,
  senderAddress: string,
  governanceMode: number = 0,
  feeMist: number = 0,
  eveCoinId?: string | null,
): Transaction {
  const tx = new Transaction();
  const enc = new TextEncoder();
  const [cap] = tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.TRIBE_REGISTRY}::create_easy_tribe`,
    arguments: [
      tx.object(SHARED_OBJECTS.TRIBE_REGISTRY),
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
      tx.object(SHARED_OBJECTS.TAX_WALLET),
      makeFeePayment(tx, feeMist, eveCoinId),
      tx.pure.vector("u8", Array.from(enc.encode(name))),
      tx.pure.vector("u8", Array.from(enc.encode(description))),
      tx.pure.u8(joinPolicy),
      tx.pure.u8(governanceMode),
      tx.object("0x6"),
    ],
  });
  // Easy-only bootstrap: creates + shares TribeGovernance + WidgetConfig and writes
  // tribe_gov_id back into the registry. No SSU involved.
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::tribe_governance_bootstrap::bootstrap_tribe_governance`,
    arguments: [
      tx.object(SHARED_OBJECTS.TRIBE_REGISTRY),  // registry: &mut TribeRegistry
      cap,                                        // leader_cap: &TribeLeaderCap (create result)
      tx.pure.address(PACKAGE_IDS.BAZAAR_CORE),   // package_id (binds WidgetConfig)
      tx.object("0x6"),                           // clock
    ],
  });
  tx.transferObjects([cap], tx.pure.address(senderAddress));
  return tx;
}

/**
 * Create an Advanced tribe AND bootstrap its full economy in one transaction —
 * no SSU required. Creates the TribeVault (= the Exchange's EVE wallet) seeded with
 * the ≥1 EVE `depositCoin`, the TribeGovernance, token ledger, exchange, withdrawal
 * board and mint/burn queue; mints the genesis tokens; activates the exchange.
 *
 * PTB: create_advanced_tribe(... feeCoin ...) → (cap) →
 *      bootstrap_advanced_complete(&cap, registry, package_id, depositCoin,
 *      requiredApprovals, clock) → transfer cap.
 *
 * The creation fee is taken via makeFeePayment(feeMist, eveCoinId) exactly like the
 * stand-alone create builders; `depositCoin` is the pre-split ≥1 EVE coin for the
 * bootstrap. The caller passes `eveCoinId` = the largest EVE coin (pickEveCoinId),
 * which is also splitEveCoin's primary source — so the fee-split and deposit-split
 * operate on the same coin without conflicting.
 */
export function buildCreateAdvancedTribeAndBootstrap(params: {
  name: string;
  description: string;
  tokenName: string;
  tokenSymbol: string;
  joinPolicy?: 0 | 1;
  senderAddress: string;
  governanceMode?: number;
  feeMist?: number;
  eveCoinId?: string | null;
  depositCoin: TransactionArgument;
  requiredApprovals: number;
  tx: Transaction;
}): Transaction {
  const {
    name, description, tokenName, tokenSymbol, joinPolicy = 0, senderAddress,
    governanceMode = 0, feeMist = 0, eveCoinId, depositCoin, requiredApprovals, tx,
  } = params;
  const enc = new TextEncoder();
  const [cap] = tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.TRIBE_REGISTRY}::create_advanced_tribe`,
    arguments: [
      tx.object(SHARED_OBJECTS.TRIBE_REGISTRY),
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
      tx.object(SHARED_OBJECTS.TAX_WALLET),
      makeFeePayment(tx, feeMist, eveCoinId),
      tx.pure.vector("u8", Array.from(enc.encode(name))),
      tx.pure.vector("u8", Array.from(enc.encode(description))),
      tx.pure.vector("u8", Array.from(enc.encode(tokenName))),
      tx.pure.vector("u8", Array.from(enc.encode(tokenSymbol))),
      tx.pure.u8(joinPolicy),
      tx.pure.u8(governanceMode),
      tx.object("0x6"),
    ],
  });
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ECONOMY_GOVERNANCE}::bootstrap_advanced_complete`,
    arguments: [
      cap,                                        // leader_cap: &TribeLeaderCap (create result)
      tx.object(SHARED_OBJECTS.TRIBE_REGISTRY),   // registry: &mut TribeRegistry
      tx.pure.address(PACKAGE_IDS.BAZAAR_CORE),   // package_id
      depositCoin,                                // initial_deposit: Coin<EVE> (≥1 EVE)
      tx.pure.u64(BigInt(requiredApprovals)),     // initial_required_approvals
      tx.object("0x6"),                           // clock
    ],
  });
  tx.transferObjects([cap], tx.pure.address(senderAddress));
  return tx;
}

// ── Governance TX Builders ─────────────────────────────────────────────────────

/**
 * Set the single global DApp tax rate (DApp Owner only).
 * Move: dapp_hub::dapp_governance::set_global_dapp_tax_rate
 * Requires: DAppOwnerCap object ID held by the owner wallet.
 */
export function buildSetGlobalDAppTaxRate(
  ownerCapId: string,
  rateBps: number,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.DAPP_GOVERNANCE}::set_global_dapp_tax_rate`,
    arguments: [
      tx.object(ownerCapId),
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
      tx.pure.u64(BigInt(rateBps)),
    ],
  });
  return tx;
}

/**
 * Set the four registration/creation fees (DApp Owner only). Raw MIST EVE.
 * Move: dapp_hub::dapp_governance::set_registration_fees (V31).
 * Requires: DAppOwnerCap object ID held by the owner wallet.
 */
export function buildSetRegistrationFees(
  ownerCapId: string,
  fees: {
    ssuRegistrationFee: number;
    tribeJoinFee: number;
    easyTribeCreationFee: number;
    advancedTribeCreationFee: number;
  },
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.DAPP_GOVERNANCE}::set_registration_fees`,
    arguments: [
      tx.object(ownerCapId),
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
      tx.pure.u64(BigInt(Math.round(fees.ssuRegistrationFee))),
      tx.pure.u64(BigInt(Math.round(fees.tribeJoinFee))),
      tx.pure.u64(BigInt(Math.round(fees.easyTribeCreationFee))),
      tx.pure.u64(BigInt(Math.round(fees.advancedTribeCreationFee))),
    ],
  });
  return tx;
}

/**
 * Set the single global multiplayer relay WebSocket URL (DApp Owner only).
 * One shared standard endpoint every player's client connects to.
 * Move: dapp_hub::dapp_governance::set_multiplayer_relay_url (V32).
 * Requires: DAppOwnerCap object ID. Pass "" to clear. The URL is stored verbatim
 * (UTF-8 bytes); callers should normalize https://->wss:// before passing it.
 */
export function buildSetMultiplayerRelayUrl(
  ownerCapId: string,
  url: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.DAPP_GOVERNANCE}::set_multiplayer_relay_url`,
    arguments: [
      tx.object(ownerCapId),
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(url))),
    ],
  });
  return tx;
}

/**
 * Set the per-hour Mission (MIS) listing fee on the dApp layer (DApp Owner only).
 * Applies to NoTribe + Easy missions only (Advanced has no dApp layer).
 * Move: dapp_hub::dapp_governance::set_mission_listing_fee_per_hour (Slice 3).
 * Sig: (_cap: &DAppOwnerCap, config: &mut GovernanceConfig, fee_per_hour: u64).
 * feePerHourMist — raw MIST EVE per listing hour; 0 = no dApp mission fee.
 */
export function buildSetDappMissionFee(params: {
  ownerCapId: string;
  feePerHourMist: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.DAPP_GOVERNANCE}::set_mission_listing_fee_per_hour`,
    arguments: [
      tx.object(params.ownerCapId),
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),
      tx.pure.u64(BigInt(params.feePerHourMist)),
    ],
  });
  return tx;
}

/**
 * Withdraw collected DApp tax to the owner wallet.
 * Move: dapp_hub::tax_wallet::withdraw_dapp_tax
 * Returns Coin<EVE> — transferred to senderAddress by this PTB.
 * Requires: DAppOwnerCap object ID held by the owner wallet.
 */
export function buildWithdrawDAppTax(
  ownerCapId: string,
  amountMist: number,
  senderAddress: string,
): Transaction {
  const tx = new Transaction();
  const [coin] = tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.TAX_WALLET}::withdraw_dapp_tax`,
    arguments: [
      tx.object(ownerCapId),
      tx.object(SHARED_OBJECTS.TAX_WALLET),
      tx.pure.u64(BigInt(amountMist)),
      tx.object("0x6"),
    ],
  });
  tx.transferObjects([coin], tx.pure.address(senderAddress));
  return tx;
}

// ── Ticket TX Builders ─────────────────────────────────────────────────────────

/** Tag encoding matching on-chain u8 discriminants. */
const TAG_TO_U8: Record<string, number> = {
  "bug": 0, "feature-request": 1, "ssu-issue": 2,
  "tribe-issue": 3, "account": 4, "other": 5,
};

/** Contact method encoding matching on-chain u8 discriminants. */
const CONTACT_METHOD_TO_U8: Record<string, number> = {
  "none": 0, "discord": 1, "email": 2,
};

/**
 * Submit a support ticket to the on-chain TicketBoard.
 * Move: dapp_hub::tickets::submit_ticket
 */
export function buildSubmitTicket(
  title: string,
  tag: string,
  body: string,
  contactMethod: string,
  contactValue: string,
): Transaction {
  const tx = new Transaction();
  const enc = new TextEncoder();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.TICKETS}::submit_ticket`,
    arguments: [
      tx.object(SHARED_OBJECTS.TICKET_BOARD),
      tx.pure.vector("u8", Array.from(enc.encode(title))),
      tx.pure.u8(TAG_TO_U8[tag] ?? 5),
      tx.pure.vector("u8", Array.from(enc.encode(body))),
      tx.pure.u8(CONTACT_METHOD_TO_U8[contactMethod] ?? 0),
      tx.pure.vector("u8", Array.from(enc.encode(contactValue))),
      tx.object("0x6"),
    ],
  });
  return tx;
}

const STATUS_TO_U8: Record<string, number> = {
  "open": 0, "in-progress": 1, "resolved": 2, "closed": 3,
};

/**
 * Update ticket status (DApp Owner/Admin only).
 * Move: dapp_hub::tickets::update_ticket_status
 */
export function buildUpdateTicketStatus(
  ownerCapId: string,
  ticketId: number,
  status: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.TICKETS}::update_ticket_status`,
    arguments: [
      tx.object(ownerCapId),
      tx.object(SHARED_OBJECTS.TICKET_BOARD),
      tx.pure.u64(BigInt(ticketId)),
      tx.pure.u8(STATUS_TO_U8[status] ?? 0),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── Tribe Management TX Builders ───────────────────────────────────────────────

/**
 * Deactivate a tribe. Requires the TribeLeaderCap object ID.
 * The cap's internal tribe_id field identifies which tribe to deactivate.
 * Move: dapp_hub::tribe_registry::deactivate_tribe
 */
export function buildDeactivateTribe(tribeLeaderCapId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.TRIBE_REGISTRY}::deactivate_tribe`,
    arguments: [
      tx.object(tribeLeaderCapId),
      tx.object(SHARED_OBJECTS.TRIBE_REGISTRY),
      tx.object("0x6"),
    ],
  });
  return tx;
}

/**
 * V37: atomically deactivate a tribe END-TO-END — flips BOTH the dapp_hub registry
 * `Tribe.is_active` AND the tribe's `bazaar_core::TribeGovernance.is_active`, so
 * "Remove Tribe" actually revokes tribe governance (gated entries then abort
 * E_TRIBE_NOT_ACTIVE). The registry-only `buildDeactivateTribe` left governance live.
 *
 * Move: bazaar_core::tribe_lifecycle::deactivate_tribe_fully
 * Sig:  (leader_cap: &TribeLeaderCap, registry: &mut TribeRegistry,
 *        gov: &mut TribeGovernance, clock, ctx)
 *
 * Only valid once V37 is live AND the tribe has a TribeGovernance object — callers
 * gate on `v37Enabled()` and a resolved `tribeGovId`, else fall back to
 * `buildDeactivateTribe` (registry-only).
 */
export function buildDeactivateTribeFully(params: {
  tribeLeaderCapId: string;
  tribeGovId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::tribe_lifecycle::deactivate_tribe_fully`,
    arguments: [
      tx.object(params.tribeLeaderCapId),
      tx.object(SHARED_OBJECTS.TRIBE_REGISTRY),
      tx.object(params.tribeGovId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

/**
 * Deregister an SSU. Requires sender == SSU owner (no cap needed).
 * @deprecated use unregisterSSU — retained for binary compat.
 * Safe to call for SSUs with tribe_id == 0 (no tribe cleanup needed).
 * For tribe-affiliated SSUs, use unregisterSSU which calls the atomic
 * deregister_ssu_with_tribe_cleanup entry function.
 */
export function buildRemoveSSU(ssuId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.DAPP_HUB}::${MODULES.SSU_REGISTRY}::deregister_ssu`,
    arguments: [
      tx.object(SHARED_OBJECTS.SSU_REGISTRY),
      tx.pure.address(ssuId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

/**
 * Unregister (deregister) an SSU the caller owns — atomic variant that also
 * removes the SSU from its tribe's ssu_ids vector when tribe_id != 0.
 * Move: dapp_hub v2::ssu_registry::deregister_ssu_with_tribe_cleanup
 * Passes both SSURegistry and TribeRegistry as shared objects; the Move fn
 * handles the no-tribe case gracefully (tribe_id == 0 → skip tribe cleanup).
 * Uses DAPP_HUB_V2 — this function was added in the 2026-04-18 additive upgrade.
 */
export function unregisterSSU(ssuId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${DAPP_HUB_V2}::${MODULES.SSU_REGISTRY}::deregister_ssu_with_tribe_cleanup`,
    arguments: [
      tx.object(SHARED_OBJECTS.SSU_REGISTRY),
      tx.object(SHARED_OBJECTS.TRIBE_REGISTRY),
      tx.pure.address(ssuId),
      tx.object("0x6"),
    ],
  });
  return tx;
}

// ── R2.3 4-package TX sub-barrel exports ──────────────────────────────────────
// NOTE: New sub-folders (dapp_hub/, bazaar_core/, bazaar_economy/, shared_widgets/) hold
// R2.3-staged TX builders with post-R3/R4 Move-surface signatures. They are NOT re-exported
// through the root barrel because ~24 of their function names collide with the battle-tested
// legacy bazaarcore/ + bazaareconomy/ versions. Until R4 wires them end-to-end, callers
// that explicitly need the new variants must use deep imports:
//   import { buildXxx } from "@bazaar/shared/tx/dapp_hub/<file>"
// Root-barrel imports default to the legacy canonical versions per critic Q2 (KEEP).
// Re-evaluate post-R4 wireup; flip to selective re-exports once collisions are resolved.

// ── Legacy exports preserved for backward compatibility (canonical via root barrel) ───────
export * from "./bazaarcore";
export * from "./bazaareconomy";
export { resolveSSUOwnerCap }       from "./bazaarcore/ssu-receiving-tx";
export type { SSUOwnerCapRef }      from "./bazaarcore/ssu-receiving-tx";
export { buildClaimUnclaimedItem }  from "./claims";
export { maybeRegisterStranger }    from "./dapp_hub/auto-register-tx";
// V16 sweep B4 (2026-05-13): re-export the relocated registration-helpers
// builders so existing consumers that import from "@bazaar/shared/tx" keep
// resolving (the names previously flowed through bazaar_economy barrel).
export { buildSetJoinPolicyAsLeader, buildJoinTribeOpen } from "./dapp_hub/registration-helpers-tx";
export * from "./bazaar_economy";
// ── R5.4-followon: shared_widgets + bazaar_core helpers used via root barrel ─────────────
// borrowSSUOwnerCap + returnSSUOwnerCap: used in QuicktradePanel; live in bazaar_core/ only.
export { borrowSSUOwnerCap, returnSSUOwnerCap } from "./bazaarcore/ssu-receiving-tx";
// buildCreateAnnouncement + buildEditAnnouncement: used via root barrel in WriteAnnouncementModal.
export { buildCreateAnnouncement, buildEditAnnouncement } from "./shared_widgets/announcements-tx";
