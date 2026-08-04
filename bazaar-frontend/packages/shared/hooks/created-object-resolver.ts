// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/hooks/created-object-resolver
 *
 * resolveCreatedIdsBySuffix — recover the object IDs of objects CREATED by a
 * transaction, matched by type-string suffix. Shared by every resolver that
 * needs a created object id which is NOT carried on its creation event payload
 * (SSUGovernance + UserStorage, TribeGovernance, the 5 per-tribe economy
 * objects, the rebind probe).
 *
 * WHY TWO PATHS — `objectChanges` is PRUNED by Sui fullnodes:
 *   Sui fullnodes discard the historical input-object data needed to *compute*
 *   `objectChanges` after a few days, and then return `objectChanges: null`,
 *   while the transaction's `effects` survive permanently. Resolvers that read a
 *   created object id ONLY from objectChanges therefore worked right after
 *   bootstrap and then silently broke once the creating TX aged past the
 *   fullnode prune window — surfaced in the UI as "No SSUGovernanceCreated event
 *   found" / "Incomplete object set" even though the event AND the live object
 *   still exist. Objects bootstrapped days earlier hit this; freshly-created
 *   ones do not (until they age). Fixed 2026-06-24.
 *
 * Primary path: objectChanges (created entries carry objectType inline — 1 RPC).
 * Fallback path: effects.created refs (permanent) + multiGetObjects(showType) to
 *   recover each created object's type (1 extra RPC, only when objectChanges is
 *   pruned / incomplete).
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { suiClient } from "./sui-client";

/**
 * Resolve created object IDs (matched by type-string suffix) from a creation TX.
 *
 * @param txDigest  the transaction that created the objects
 * @param suffixes  the type-string suffixes to match (e.g. "ssu_governance::SSUGovernance")
 * @returns map of requested suffix -> objectId (null when not found by either path)
 */
export async function resolveCreatedIdsBySuffix(
  txDigest: string,
  suffixes: readonly string[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const s of suffixes) out[s] = null;

  const txBlock = await suiClient.getTransactionBlock({
    digest: txDigest,
    options: { showObjectChanges: true, showEffects: true },
  });

  // Primary path — objectChanges carries objectType inline.
  for (const ch of txBlock.objectChanges ?? []) {
    if (ch.type !== "created" || typeof ch.objectType !== "string") continue;
    for (const s of suffixes) {
      if (out[s] === null && ch.objectType.endsWith(s)) out[s] = ch.objectId;
    }
  }
  if (suffixes.every((s) => out[s] !== null)) return out;

  // Fallback path — objectChanges pruned (null) or incomplete. Use the permanent
  // effects.created ids and recover each type via multiGetObjects(showType).
  const createdIds = (txBlock.effects?.created ?? [])
    .map((c) => c.reference?.objectId)
    .filter((id): id is string => typeof id === "string");
  if (createdIds.length === 0) return out;

  const objs = await suiClient.multiGetObjects({
    ids: createdIds,
    options: { showType: true },
  });
  for (const o of objs) {
    const t = o.data?.type;
    const oid = o.data?.objectId;
    if (typeof t !== "string" || typeof oid !== "string") continue;
    for (const s of suffixes) {
      if (out[s] === null && t.endsWith(s)) out[s] = oid;
    }
  }
  return out;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
