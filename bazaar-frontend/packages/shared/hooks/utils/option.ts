// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * option.ts — R6.6.3 OS-28 Sui RPC Option<address> JSON unwrapper.
 *
 * Helper for parsing Sui Option<address> field variations from RPC responses.
 *
 * File limit: 500 lines | Constitution Article XII.3
 */

/**
 * Unwrap a Sui-RPC-encoded Move `Option<address>` field to `string | null`.
 *
 * Sui RPC `showContent` views encode Option<T> in two historical shapes:
 *   - Current (V17 testnet, 2026-05-13 verified): Some(x) is the bare value
 *     (string for address/String), None is plain `null`.
 *   - Legacy (R6.6.3 era): Some(x) is `{ vec: [x] }` or `{ fields: { vec: [x] } }`,
 *     None is `{ vec: [] }`.
 *
 * Probe the current shape first, then fall back to the legacy wrapper shapes.
 * Returns `null` for None, missing fields, malformed shapes, or empty strings.
 */
export function unwrapOptionAddress(field: unknown): string | null {
  if (field == null) return null;
  if (typeof field === "string") return field.length === 0 ? null : field;
  // Legacy: { fields: { vec: [...] } } or { vec: [...] }
  const obj = field as { fields?: { vec?: unknown[] }; vec?: unknown[] };
  const vec = obj.fields?.vec ?? obj.vec;
  if (!Array.isArray(vec) || vec.length === 0) return null;
  const first = vec[0];
  if (typeof first !== "string" || first.length === 0) return null;
  return first;
}

/**
 * V17: Unwrap a Sui-RPC-encoded Move `Option<String>` field to `string | null`.
 * Same shape rules as unwrapOptionAddress — see that doc-comment for detail.
 * Used to read Tribe.token_name + Tribe.token_symbol in useTribeRegistry.
 */
export function unwrapOptionString(field: unknown): string | null {
  if (field == null) return null;
  if (typeof field === "string") return field.length === 0 ? null : field;
  const obj = field as { fields?: { vec?: unknown[] }; vec?: unknown[] };
  const vec = obj.fields?.vec ?? obj.vec;
  if (!Array.isArray(vec) || vec.length === 0) return null;
  const first = vec[0];
  if (typeof first !== "string") return null;
  return first;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
