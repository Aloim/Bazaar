// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Update Ceremony V2 — Phase 2 (Slice 4): snapshot loader + hash re-verify.
 *
 * Before the admin populates the ReclaimRegistry from a backup, the loaded JSON
 * MUST be proven to be the exact bytes that were anchored on-chain pre-publish.
 *
 *   1. Load the RAW JSON text (file upload or paste) — the SAME text the admin
 *      hashed at backup time (`CreateBackupButton` hashed `JSON.stringify(snapshot,
 *      null, 2)`). We hash the raw text verbatim — re-stringifying would change the
 *      bytes (key order / whitespace) and break the match.
 *   2. SHA-256 it (Web Crypto, same util as the create flow).
 *   3. Compare against the selected `AnchorRegistry` row's `hash` (32 bytes).
 *   4. Surface derived completeness gaps (the generate-time `summary.warnings` is
 *      NOT persisted in the snapshot, so we re-derive the load-bearing gaps from
 *      the loaded data).
 *
 * The populate tool HARD-blocks unless the hash matches (you may only restore a
 * backup that was actually anchored — defends against a tampered/wrong file).
 */

import { SNAPSHOT_SCHEMA_VERSION } from "../snapshot/types";
import type { BazaarSnapshot } from "../snapshot/types";

export interface LoadedSnapshot {
  snapshot: BazaarSnapshot;
  /** The verbatim JSON text that was hashed (NOT a re-serialization). */
  json: string;
  hash: Uint8Array;     // SHA-256 of `json`
  hashHex: string;
}

/** SHA-256 of a UTF-8 string via Web Crypto (mirrors CreateBackupButton). */
export async function sha256Bytes(text: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return new Uint8Array(buf);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time-ish byte equality (lengths short + non-secret; simple compare is fine). */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Parse + hash the raw snapshot JSON. Throws on invalid JSON or a schema-version
 * mismatch (we only know how to encode the v2.0 shape).
 */
export async function loadSnapshotJson(rawJson: string): Promise<LoadedSnapshot> {
  let snapshot: BazaarSnapshot;
  try {
    snapshot = JSON.parse(rawJson) as BazaarSnapshot;
  } catch (err) {
    throw new Error(`Snapshot JSON is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Snapshot JSON did not parse to an object.");
  }
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(
      `Snapshot schemaVersion "${snapshot.schemaVersion}" != expected "${SNAPSHOT_SCHEMA_VERSION}". ` +
      "This populate tool only encodes the v2.0 reclaim payloads.",
    );
  }
  const hash = await sha256Bytes(rawJson);
  return { snapshot, json: rawJson, hash, hashHex: toHex(hash) };
}

/** True when the loaded snapshot's hash matches the on-chain anchor row's hash. */
export function verifyAgainstAnchorHash(loaded: LoadedSnapshot, anchorHash: Uint8Array): boolean {
  return bytesEqual(loaded.hash, anchorHash);
}

/**
 * Re-derive the load-bearing completeness gaps the generator would have warned
 * about (`summary.warnings` is not stored in the snapshot). A non-empty result
 * means the backup has GAPS — the restore would be partial. The UI surfaces these
 * prominently; hash-match is the hard gate, gaps are an explicit-acknowledge gate.
 */
export function deriveSnapshotGaps(snapshot: BazaarSnapshot): string[] {
  const gaps: string[] = [];

  for (const s of snapshot.ssus ?? []) {
    if (!s.ownerAddress) gaps.push(`SSU ${s.ssuId}: missing owner address (record cannot be keyed)`);
    if (!s.ssuGovId) gaps.push(`SSU ${s.ssuId}: SSUGovernance not resolved (EVE/bans/config may be incomplete)`);
  }

  for (const t of snapshot.tribes ?? []) {
    if (!t.leaderAddress) gaps.push(`Tribe #${t.tribeId}: missing leader address (record cannot be keyed)`);
    if (t.bazaarType !== 1 && t.bazaarType !== 2) {
      gaps.push(`Tribe #${t.tribeId}: bazaar_type ${t.bazaarType} not Easy/Advanced (reclaim_tribe would abort)`);
    }
    if (t.bazaarType === 2 && !t.tokenLedgerId) {
      gaps.push(`Tribe #${t.tribeId}: Advanced tribe with no token ledger captured (token balances may be empty)`);
    }
  }

  return gaps;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
