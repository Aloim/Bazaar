// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * tx/bazaarcore/ssu-receiving-tx.ts
 *
 * Unified SSU-receiving module — arch notes #2 + #3 (2026-05-06).
 * Merges tx/bazaar_core/ssu-receiving-tx.ts + tx/ssu.ts into a single
 * canonical location. Dead split resolved; env-var standardised to
 * VITE_SUI_RPC_ENDPOINT; JSON shape is fully typed (no `any`).
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, WORLD_PACKAGE_ID } from "@bazaar/shared/constants";

const pkg = PACKAGE_ID;
const worldPkg = WORLD_PACKAGE_ID;

// Private — used only by PTB helpers in this module.
const STORAGE_UNIT_TYPE = () => `${worldPkg}::storage_unit::StorageUnit`;

/** BazarAuth type argument for authorize_extension<Auth: drop>. */
export const BAZAR_AUTH_TYPE = () => `${pkg}::bazar::BazarAuth`;

// ── SSUOwnerCapRef ────────────────────────────────────────────────────────────

/**
 * Sufficient reference for tx.receivingRef() and ownership checks.
 * All three fields required by borrowSSUOwnerCap.
 */
export interface SSUOwnerCapRef {
  ssuCapId:      string;
  ssuCapVersion: string;
  ssuCapDigest:  string;
}

// ── Receiving-pattern PTB helpers ─────────────────────────────────────────────

/**
 * Borrow OwnerCap<StorageUnit> from the Character shared object via
 * Sui's Receiving pattern. Must be returned via returnSSUOwnerCap in the same PTB.
 */
export function borrowSSUOwnerCap(
  tx: Transaction,
  characterId: string,
  ssuCapId: string,
  ssuCapVersion: string,
  ssuCapDigest: string,
) {
  const receiving = tx.receivingRef({
    objectId: ssuCapId,
    version:  ssuCapVersion,
    digest:   ssuCapDigest,
  });
  const [ownerCap, receipt] = tx.moveCall({
    target:        `${worldPkg}::character::borrow_owner_cap`,
    typeArguments: [STORAGE_UNIT_TYPE()],
    arguments:     [tx.object(characterId), receiving],
  });
  return { ownerCap, receipt };
}

/**
 * Return the borrowed OwnerCap<StorageUnit> back to the Character object.
 * Must be called exactly once per borrowSSUOwnerCap in the same PTB.
 */
export function returnSSUOwnerCap(
  tx: Transaction,
  characterId: string,
  ownerCap: ReturnType<Transaction["moveCall"]>[0],
  receipt:  ReturnType<Transaction["moveCall"]>[0],
) {
  tx.moveCall({
    target:        `${worldPkg}::character::return_owner_cap`,
    typeArguments: [STORAGE_UNIT_TYPE()],
    arguments:     [tx.object(characterId), ownerCap, receipt],
  });
}

// ── TX builders ───────────────────────────────────────────────────────────────

/** Authorize BazarAuth as the extension on the SSU (one-time owner setup). */
export function buildAuthorizeExtension(
  ssuId: string,
  characterId: string,
  ssuCapId: string,
  ssuCapVersion: string,
  ssuCapDigest: string,
) {
  const tx = new Transaction();
  const { ownerCap, receipt } = borrowSSUOwnerCap(tx, characterId, ssuCapId, ssuCapVersion, ssuCapDigest);
  tx.moveCall({
    target:        `${worldPkg}::storage_unit::authorize_extension`,
    typeArguments: [BAZAR_AUTH_TYPE()],
    arguments:     [tx.object(ssuId), ownerCap],
  });
  returnSSUOwnerCap(tx, characterId, ownerCap, receipt);
  return tx;
}

/** Freeze the extension config on the SSU (irreversible). */
export function buildFreezeExtensionConfig(
  ssuId: string,
  characterId: string,
  ssuCapId: string,
  ssuCapVersion: string,
  ssuCapDigest: string,
) {
  const tx = new Transaction();
  const { ownerCap, receipt } = borrowSSUOwnerCap(tx, characterId, ssuCapId, ssuCapVersion, ssuCapDigest);
  tx.moveCall({
    target:    `${worldPkg}::storage_unit::freeze_extension_config`,
    arguments: [tx.object(ssuId), ownerCap],
  });
  returnSSUOwnerCap(tx, characterId, ownerCap, receipt);
  return tx;
}

/**
 * True when a transaction error is the EVE-Frontier world abort
 * `EExtensionConfigFrozen`, raised by `world::storage_unit::authorize_extension`
 * when the SSU's extension configuration has been frozen (irreversibly, via
 * `freeze_extension_config`). Once frozen, BazarAuth can no longer be
 * (re)authorized — so registration flows that BUNDLE `authorize_extension` into
 * the atomic PTB must catch this and retry register+bootstrap WITHOUT the
 * (now-redundant) authorize step; the registration itself is unaffected by the
 * freeze. dAppKit usually surfaces this at the resolution step as a JSON-RPC
 * -32603 ("Transaction Resolution failed") whose message carries the abort.
 *
 * Matches the explicit abort name, plus a defensive "frozen" + "storage_unit"
 * pair (the world module) so it never collides with the Bazaar's own
 * `E_SSU_FROZEN` commerce freeze, which aborts in bazaar_core modules.
 */
export function isExtensionConfigFrozenError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (msg.includes("extensionconfigfrozen")) return true;
  return msg.includes("frozen") && msg.includes("storage_unit");
}

// ── Cap resolver ──────────────────────────────────────────────────────────────

/**
 * Resolve the OwnerCap<StorageUnit> for a specific SSU owned by a Character.
 *
 * Queries suix_getOwnedObjects against the Character's ID and matches the
 * OwnerCap whose authorized_object_id equals ssuId (when provided).
 *
 * @param characterId - The Character shared object ID.
 * @param ssuId       - Optional SSU object ID to filter by authorized_object_id.
 * @param rpcUrl      - Optional RPC URL override. Defaults to VITE_SUI_RPC_ENDPOINT.
 * @returns SSUOwnerCapRef when found, null when the wallet is not the SSU owner.
 */
export async function resolveSSUOwnerCap(
  characterId: string,
  ssuId?: string,
  rpcUrl?: string,
): Promise<SSUOwnerCapRef | null> {
  if (!worldPkg) {
    console.warn("[resolveSSUOwnerCap] VITE_WORLD_PACKAGE_ID not set — cannot resolve SSU owner cap.");
    return null;
  }

  const url =
    rpcUrl ??
    (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
    "https://api.zan.top/public/sui-testnet";

  const targetType =
    `${worldPkg}::access::OwnerCap<${worldPkg}::storage_unit::StorageUnit>`;

  const resp = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      jsonrpc: "2.0",
      id:      1,
      method:  "suix_getOwnedObjects",
      params:  [
        characterId,
        { filter: { StructType: targetType }, options: { showType: true, showContent: true } },
        null,
        50,
      ],
    }),
  });

  if (!resp.ok) return null;

  const json = await resp.json() as {
    error?: unknown;
    result?: {
      data?: Array<{
        data?: {
          objectId?: string;
          version?:  string | number;
          digest?:   string;
          content?:  { fields?: { authorized_object_id?: string } };
        };
      }>;
    };
  };

  if (json.error) return null;

  const data = json?.result?.data ?? [];
  if (data.length === 0) {
    console.warn(
      `[resolveSSUOwnerCap] character=${characterId} owns 0 OwnerCap<StorageUnit>. ` +
      `The connected wallet's character does not own any Smart Storage Unit — likely the wrong wallet.`,
    );
    return null;
  }

  for (const entry of data) {
    const obj = entry?.data;
    if (!obj?.objectId || !obj?.version || !obj?.digest) continue;

    if (!ssuId) {
      return {
        ssuCapId:      obj.objectId,
        ssuCapVersion: String(obj.version),
        ssuCapDigest:  obj.digest,
      };
    }

    const authorizedId = obj?.content?.fields?.authorized_object_id;
    if (authorizedId === ssuId) {
      return {
        ssuCapId:      obj.objectId,
        ssuCapVersion: String(obj.version),
        ssuCapDigest:  obj.digest,
      };
    }
  }

  console.warn(
    `[resolveSSUOwnerCap] no OwnerCap<StorageUnit> matched ssuId=${ssuId} on character=${characterId}. ` +
    `Found ${data.length} cap(s); the SSU ids this character actually owns: ` +
    JSON.stringify(data.map((e) => e?.data?.content?.fields?.authorized_object_id).filter(Boolean)),
  );
  return null;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
