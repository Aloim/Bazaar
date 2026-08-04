// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/hooks/bazaarcore/rebind-helpers
 *
 * Plain async helpers (NOT hooks) for the SSU deregister → re-register flow.
 *
 * Background: deregistration removes only the SSURegistration row; the per-SSU
 * shared objects and the BootstrappedKey idempotency anchor persist, so a
 * re-registration PTB must NOT re-run bootstrap_ssu_objects (it aborts
 * E_ALREADY_BOOTSTRAPPED). planRebootstrap() decides per SSU:
 *   - not bootstrapped              → { mode: "bootstrap" }   (fresh SSU)
 *   - bootstrapped, binding matches → { mode: "skip" }
 *   - bootstrapped, binding differs → { mode: "rebind", … }   (needs the
 *     bazaar_core additive upgrade — BAZAAR_CORE_REBIND_PKG; throws a friendly
 *     Error when unavailable or when active stalls would carry over)
 *
 * Callers resolve `shared` via useSSUSharedObjects(ssuId) — null ⟺ the SSU has
 * never been bootstrapped on the current publish (first-bootstrap-wins event).
 */

import { suiClient } from "../sui-client";
import { resolveCreatedIdsBySuffix } from "../created-object-resolver";
import {
  BAZAR_REGISTRY_ID, BAZAAR_CORE_REBIND_PKG, ORIGINAL_PACKAGE_ID,
  BAZAAR_MISSION_ORIGINAL_PACKAGE_ID, MISSION_REGISTRY_ID,
} from "../../constants";
import type { SSURebootstrapPlan } from "../../tx";

const BAZAAR_TYPE_LABEL: Record<number, string> = { 0: "NoTribe", 1: "Easy", 2: "Advanced" };

/** The two per-SSU object refs a rebind call needs. SSUSharedObjects (from
 *  useSSUSharedObjects) is structurally assignable to this. */
export interface RebindRefs {
  ssuGovId: string;
  memberRegistryId: string;
}

/**
 * Non-hook variant of the useSSUSharedObjects probe for use inside event
 * handlers (e.g. the leader-side accept-application flow). Returns null when
 * the SSU was never bootstrapped on the current publish.
 * Same anchor as the hook: SSUGovernanceCreated typed with ORIGINAL_PACKAGE_ID,
 * ascending order ⇒ first-bootstrap-wins.
 */
export async function resolveBootstrappedSSU(ssuId: string): Promise<RebindRefs | null> {
  const events = await suiClient.queryEvents({
    query: { MoveEventType: `${ORIGINAL_PACKAGE_ID}::ssu_governance::SSUGovernanceCreated` },
    limit: 1000,
  });
  const target = ssuId.toLowerCase();
  const match = events.data.find((e) => {
    const parsed = e.parsedJson as { ssu_id?: string } | null;
    return typeof parsed?.ssu_id === "string" && parsed.ssu_id.toLowerCase() === target;
  });
  if (!match) return null;
  const memberRegistryId = (match.parsedJson as { member_registry_id?: string } | null)
    ?.member_registry_id;
  if (!memberRegistryId) return null;
  // ssuGovId is NOT on the event payload — recover it from the bootstrap TX.
  // objectChanges-first with an effects.created fallback (objectChanges is pruned
  // by fullnodes after a few days — see resolveCreatedIdsBySuffix).
  const ids = await resolveCreatedIdsBySuffix(match.id.txDigest, ["ssu_governance::SSUGovernance"]);
  const ssuGovId = ids["ssu_governance::SSUGovernance"];
  if (!ssuGovId) return null;
  return { ssuGovId, memberRegistryId };
}

/** Read the CURRENT binding (bazaar_type + tribe_id) off an SSUGovernance object. */
export async function getSSUGovBinding(
  ssuGovId: string,
): Promise<{ bazaarType: number; tribeId: string } | null> {
  const obj = await suiClient.getObject({ id: ssuGovId, options: { showContent: true } });
  const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
  if (!fields) return null;
  return {
    bazaarType: Number(fields.bazaar_type ?? 0),
    tribeId: String(fields.tribe_id ?? "0"),
  };
}

/** Active shop IDs for an SSU from BazarRegistry.shops_by_ssu
 *  (C3/GAS-08, V39: Table<address, vector<ShopPosition{id,x,y,active}>>). */
export async function getActiveShopIdsForSSU(ssuId: string): Promise<string[]> {
  try {
    const reg = await suiClient.getObject({ id: BAZAR_REGISTRY_ID, options: { showContent: true } });
    const fields = (reg.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
    const tableId = (fields?.shops_by_ssu as { fields?: { id?: { id?: string } } } | undefined)
      ?.fields?.id?.id;
    if (!tableId) return [];
    const entry = await suiClient.getDynamicFieldObject({
      parentId: tableId,
      name: { type: "address", value: ssuId },
    });
    const value = (entry.data?.content as { fields?: { value?: unknown } } | undefined)
      ?.fields?.value;
    if (!Array.isArray(value)) return [];
    // Each element is a ShopPosition struct {id,x,y,active}; extract .id and skip
    // inactive defensively. In production deactivate REMOVES the record (present ⇒
    // active); the `?? el` fallback keeps pre-V39 bare-ID vectors working.
    return (value as any[])
      .filter((el) => (el?.fields?.active ?? el?.active) !== false)
      .map((el) => String(el?.fields?.id ?? el?.id ?? el));
  } catch {
    return []; // no per-SSU entry yet (lazy-init) or transient RPC failure
  }
}

/**
 * Count ACTIVE missions for an SSU (same data path as useMissions). Mission
 * stalls are NOT BazarRegistry shops, so the on-chain zero-active-shops guard
 * does not cover them — and a tribe-changing rebind mid-mission would strand
 * the mission escrow/collateral behind the tribe-match assert in
 * mission_complete (security audit SA-REBIND-01). This FE gate is the
 * enforcement until a bazaar_mission-side on-chain backstop ships.
 */
export async function countActiveMissionsForSSU(ssuId: string): Promise<number> {
  if (!MISSION_REGISTRY_ID) return 0;
  const events = await suiClient.queryEvents({
    query: { MoveEventType: `${BAZAAR_MISSION_ORIGINAL_PACKAGE_ID}::mission::MissionCreatedEvent` },
    limit: 50,
  });
  const target = ssuId.toLowerCase();
  const ids = events.data
    .filter((e) => {
      const p = e.parsedJson as { ssu_id?: string; mission_id?: string } | null;
      return typeof p?.ssu_id === "string" && p.ssu_id.toLowerCase() === target
        && typeof p?.mission_id === "string";
    })
    .map((e) => (e.parsedJson as { mission_id: string }).mission_id);
  if (ids.length === 0) return 0;
  const results = await Promise.all(ids.map((id) =>
    suiClient.getDynamicFieldObject({
      parentId: MISSION_REGISTRY_ID,
      name: { type: "0x2::object::ID", value: id },
    }).catch(() => null),
  ));
  let active = 0;
  for (const r of results) {
    const fields = (r?.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
    if (fields && Boolean(fields.is_active ?? false)) active++;
  }
  return active;
}

/**
 * Decide how the registration PTB should handle the bootstrap step.
 * Throws an Error with a user-facing message when the re-registration cannot
 * proceed (rebind upgrade not live, or active stalls / missions block the
 * binding switch).
 */
export async function planRebootstrap(args: {
  /** The SSU smart-assembly address being (re-)registered. */
  ssuId: string;
  /** useSSUSharedObjects(ssuId).data or resolveBootstrappedSSU(ssuId) —
   *  null/undefined ⇒ never bootstrapped. */
  shared: RebindRefs | null | undefined;
  /** Target binding of the registration being built. */
  targetBazaarType: 0 | 1 | 2;
  targetTribeId: string | number;
}): Promise<SSURebootstrapPlan> {
  const { ssuId, shared, targetBazaarType, targetTribeId } = args;
  if (!shared) return { mode: "bootstrap" };

  const binding = await getSSUGovBinding(shared.ssuGovId);
  if (!binding) return { mode: "bootstrap" }; // gov unreadable — let Move guards decide

  const sameBinding =
    binding.bazaarType === targetBazaarType &&
    binding.tribeId === String(targetTribeId);
  if (sameBinding) return { mode: "skip" };

  const oldLabel = BAZAAR_TYPE_LABEL[binding.bazaarType] ?? `type ${binding.bazaarType}`;
  if (!BAZAAR_CORE_REBIND_PKG) {
    throw new Error(
      `This SSU was previously set up as ${oldLabel}` +
      (binding.tribeId !== "0" ? ` (tribe ${binding.tribeId})` : "") +
      ". Switching it to a different tribe/bazaar type needs the bazaar_core rebind " +
      "upgrade, which is not live yet. Re-registering with the SAME tribe/type works now.",
    );
  }

  const [activeShops, activeMissions] = await Promise.all([
    getActiveShopIdsForSSU(ssuId),
    countActiveMissionsForSSU(ssuId),
  ]);
  if (activeShops.length > 0) {
    throw new Error(
      `This SSU still has ${activeShops.length} active stall(s) from its ${oldLabel} era. ` +
      "Close them first (Market & Missions → My Stalls), then retry.",
    );
  }
  // SA-REBIND-01: a tribe/type switch with a mission mid-run would strand its
  // escrow + collateral behind the tribe-match assert in mission settlement.
  if (activeMissions > 0) {
    throw new Error(
      `This SSU still has ${activeMissions} active mission(s) from its ${oldLabel} era. ` +
      "Cancel or complete them first, then retry.",
    );
  }

  return { mode: "rebind", ssuGovId: shared.ssuGovId, memberRegistryId: shared.memberRegistryId };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
