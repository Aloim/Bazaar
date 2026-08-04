// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore membership TX builders.
 *
 * buildRegisterStranger — self-register as a stranger in an SSU's MemberRegistry.
 * buildRegisterFriendly — self-register as a friendly in an SSU's MemberRegistry.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, MODULES } from "../../constants";

// ── buildRegisterStranger ──────────────────────────────────────────────────────

/**
 * Self-register the transaction sender as a stranger in an SSU's MemberRegistry.
 * Move: bazaar_core::membership::register_stranger
 * Sig: (registry: &mut MemberRegistry, clock: &Clock, ctx: &mut TxContext)
 *
 * DA-004 resolution: No capability required — any player can call this.
 * Aborts with E_ALREADY_REGISTERED if the caller is already in the registry.
 * Assigns role_stranger (lowest role) to the registrant.
 * Emits StrangerRegistered event.
 * memberRegistryId — MemberRegistry shared object ID for the target SSU.
 */
export function buildRegisterStranger(params: {
  memberRegistryId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.MEMBERSHIP}::register_stranger`,
    arguments: [
      tx.object(params.memberRegistryId),  // registry: &mut MemberRegistry
      tx.object("0x6"),                    // clock: &Clock (Sui system clock)
    ],
  });
  return tx;
}

// ── buildSetTribeRole ────────────────────────────────────────────────────────

/**
 * Set a player's tribe role in the MemberRegistry (TribeLeaderCap gated).
 * Move: bazaar_core::membership::set_tribe_role
 * Sig:  (leader_cap: &TribeLeaderCap, tribe_gov: &TribeGovernance,
 *        registry: &mut MemberRegistry, player: address, role: u8,
 *        _ctx: &mut TxContext)
 *
 * R5.2.b.2: tribe_gov added for bazaar-type gate (Easy or Advanced).
 * role: 1–7 (stranger=0 not settable; use remove_tribe_member to reset).
 */
export function buildSetTribeRole(params: {
  leaderCapId: string;
  tribeGovernanceId: string;  // R5.2.b.3 — TribeGovernance shared object
  memberRegistryId: string;
  player: string;
  role: number;               // 1–7; stranger (0) not valid
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.MEMBERSHIP}::set_tribe_role`,
    arguments: [
      tx.object(params.leaderCapId),            // leader_cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovernanceId),       // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.memberRegistryId),        // registry: &mut MemberRegistry [2]
      tx.pure.address(params.player),            // player: address [3]
      tx.pure.u8(params.role),                   // role: u8 [4]
    ],
  });
  return tx;
}

// ── buildSetTribeRolesBatch (multi) ───────────────────────────────────────────

/**
 * Set the same TRIBE role across SEVERAL MemberRegistries in one PTB.
 * Move: bazaar_core::membership::set_tribe_role (TribeLeaderCap gated).
 *
 * Used by the Tribe Governance → Users & Roles tab: a player deduped across
 * several of the tribe's SSUs gets the role applied to every one of their
 * MemberRegistries. All registries share the tribe, so the SAME TribeLeaderCap +
 * TribeGovernance authorise every call. Only the tribe leader can call this.
 *
 * role: 2 (Member) .. 6 (SuperAdmin) in this UI. Owner (7) is deliberately NOT
 * offered — Owner is an SSU-governance-internal role (set only via the SSUOwnerCap),
 * never a tribe role. Stranger (0) is not settable on-chain (use remove_tribe_member).
 * An empty `updates` list returns an empty transaction (callers should guard).
 */
export function buildSetTribeRolesBatch(params: {
  leaderCapId: string;
  tribeGovernanceId: string;
  updates: Array<{ memberRegistryId: string; player: string; role: number }>;
}): Transaction {
  const tx = new Transaction();
  for (const u of params.updates) {
    tx.moveCall({
      target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.MEMBERSHIP}::set_tribe_role`,
      arguments: [
        tx.object(params.leaderCapId),         // leader_cap: &TribeLeaderCap
        tx.object(params.tribeGovernanceId),    // tribe_gov: &TribeGovernance
        tx.object(u.memberRegistryId),          // registry: &mut MemberRegistry
        tx.pure.address(u.player),              // player: address
        tx.pure.u8(u.role),                     // role: u8
      ],
    });
  }
  return tx;
}

// ── buildRegisterFriendly ─────────────────────────────────────────────────────

/**
 * Self-register the transaction sender as a friendly in an SSU's MemberRegistry.
 * Move: bazaar_core::membership::register_friendly
 * Sig: (registry: &mut MemberRegistry, clock: &Clock, ctx: &mut TxContext)
 *
 * DA-004 resolution: No capability required — any player can call this.
 * Aborts with E_ALREADY_REGISTERED if the caller is already in the registry.
 * Assigns role_friendly to the registrant.
 * Emits FriendlyRegistered event.
 * memberRegistryId — MemberRegistry shared object ID for the target SSU.
 */
export function buildRegisterFriendly(params: {
  memberRegistryId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_CORE}::${MODULES.MEMBERSHIP}::register_friendly`,
    arguments: [
      tx.object(params.memberRegistryId),  // registry: &mut MemberRegistry
      tx.object("0x6"),                    // clock: &Clock (Sui system clock)
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
