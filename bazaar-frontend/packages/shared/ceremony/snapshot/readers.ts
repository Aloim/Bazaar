// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Low-level on-chain readers for the snapshot generator.
 *
 * Self-contained JSON-RPC (mirrors useTribeRegistry's direct-fullnode pattern;
 * NOT dependent on the shared suiClient singleton) so the generator is decoupled
 * from any in-flight client changes. Read-only: getObject / multiGetObjects /
 * getDynamicFields / queryEvents / latest checkpoint, plus parsers for the field
 * shapes the Bazaar Move structs use (Balance<EVE>, Table, Option, vector<u8>).
 */

const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  (import.meta.env.VITE_SUI_RPC_URL as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

export async function rpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = (await resp.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result as T;
}

type Fields = Record<string, unknown>;
type ContentObj = { data?: { content?: { fields?: Fields } } };

/** Read a single object's content.fields (null if missing/unreadable). */
export async function getObjectFields(id: string): Promise<Fields | null> {
  const r = await rpc<ContentObj>("sui_getObject", [id, { showContent: true }]);
  return r?.data?.content?.fields ?? null;
}

/** Batch read content.fields for many object ids (chunked at 50 — RPC cap). */
export async function multiGetFields(ids: string[]): Promise<Array<Fields | null>> {
  const out: Array<Fields | null> = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await rpc<ContentObj[]>("sui_multiGetObjects", [chunk, { showContent: true }]);
    for (const o of res) out.push(o?.data?.content?.fields ?? null);
  }
  return out;
}

/** Extract the inner Table/Bag object id from a `Table`/`Bag` field value. */
export function tableId(field: unknown): string | null {
  const f = field as { fields?: { id?: { id?: string } }; id?: { id?: string } } | undefined;
  return f?.fields?.id?.id ?? f?.id?.id ?? null;
}

/** Extract the `size` of a Table/Bag field value (0 if absent). */
export function tableSize(field: unknown): number {
  const f = field as { fields?: { size?: unknown } } | undefined;
  return Number(f?.fields?.size ?? 0);
}

/** Enumerate every dynamic-field { name, objectId } under a parent (paginated). */
export async function listDynamicFields(
  parentId: string,
): Promise<Array<{ name: { type: string; value: unknown }; objectId: string }>> {
  const out: Array<{ name: { type: string; value: unknown }; objectId: string }> = [];
  let cursor: string | null = null;
  do {
    const page = await rpc<{
      data?: Array<{ name?: { type: string; value: unknown }; objectId?: string }>;
      nextCursor?: string | null;
      hasNextPage?: boolean;
    }>("suix_getDynamicFields", [parentId, cursor, null]);
    for (const d of page.data ?? []) {
      if (d.name && d.objectId) out.push({ name: d.name as { type: string; value: unknown }, objectId: d.objectId });
    }
    cursor = page.hasNextPage ? (page.nextCursor ?? null) : null;
  } while (cursor);
  return out;
}

/**
 * Walk a `Table<address, u64>` (token balances, ban lists, tax accumulators) into
 * a plain { address: "u64String" } map. Empty map if the table id is null.
 */
export async function walkAddressU64Table(tId: string | null): Promise<Record<string, string>> {
  if (!tId) return {};
  const entries = await listDynamicFields(tId);
  if (entries.length === 0) return {};
  const fields = await multiGetFields(entries.map((e) => e.objectId));
  const map: Record<string, string> = {};
  fields.forEach((f, i) => {
    if (!f) return;
    const key = String((f.name as unknown) ?? entries[i].name.value ?? "");
    if (key) map[key] = String((f.value as unknown) ?? "0");
  });
  return map;
}

/**
 * Walk a Table whose VALUE is a struct, returning [{ key, valueFields }]. Used for
 * MemberRegistry (Table<address, MemberEntry>).
 */
export async function walkStructTable(
  tId: string | null,
): Promise<Array<{ key: string; value: Fields }>> {
  if (!tId) return [];
  const entries = await listDynamicFields(tId);
  if (entries.length === 0) return [];
  const fields = await multiGetFields(entries.map((e) => e.objectId));
  const rows: Array<{ key: string; value: Fields }> = [];
  fields.forEach((f, i) => {
    if (!f) return;
    const key = String((f.name as unknown) ?? entries[i].name.value ?? "");
    const value = (f.value as { fields?: Fields })?.fields ?? {};
    rows.push({ key, value });
  });
  return rows;
}

/** Parse a Balance<T> field (renders as a u64 string, or {value}/{fields:{value}}). */
export function balanceMist(v: unknown): string {
  if (v == null) return "0";
  if (typeof v === "string" || typeof v === "number") return String(v);
  const o = v as { value?: unknown; fields?: { value?: unknown } };
  return String(o.fields?.value ?? o.value ?? "0");
}

/** Unwrap a Move Option<address|String> field to its value or null. */
export function unwrapOption(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.length ? v : null;
  const o = v as { vec?: unknown[]; fields?: { vec?: unknown[] } };
  const vec = o.fields?.vec ?? o.vec;
  if (Array.isArray(vec)) return vec.length ? String(vec[0]) : null;
  return null;
}

/** Decode a Move `vector<u8>` (number[] | base64 string | already-decoded) to UTF-8. */
export function bytesToString(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) {
    try { return new TextDecoder().decode(Uint8Array.from(v as number[])); } catch { return ""; }
  }
  if (typeof v === "string") {
    // Heuristic: try base64; if it fails or yields control bytes, return as-is.
    try {
      const bin = atob(v);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      // base64 round-trips printable text; fall back if it looks wrong.
      return /[�]/.test(decoded) ? v : decoded;
    } catch {
      return v;
    }
  }
  return String(v);
}

/** Query ALL events of a Move type (cursor-paginated). Returns parsedJson + txDigest. */
export async function queryAllEvents(
  eventType: string,
): Promise<Array<{ parsedJson: Record<string, unknown>; txDigest: string }>> {
  const out: Array<{ parsedJson: Record<string, unknown>; txDigest: string }> = [];
  let cursor: unknown = null;
  do {
    const page = await rpc<{
      data?: Array<{ parsedJson?: Record<string, unknown>; id?: { txDigest?: string } }>;
      nextCursor?: unknown;
      hasNextPage?: boolean;
    }>("suix_queryEvents", [{ MoveEventType: eventType }, cursor, 200, false]);
    for (const e of page.data ?? []) {
      out.push({ parsedJson: e.parsedJson ?? {}, txDigest: e.id?.txDigest ?? "" });
    }
    cursor = page.hasNextPage ? (page.nextCursor ?? null) : null;
  } while (cursor);
  return out;
}

/**
 * From a tx digest, find the first created object whose type ends with `suffix`.
 *
 * TWO PATHS — `objectChanges` is PRUNED by Sui fullnodes. After a few days the node
 * discards the historical input data needed to *compute* objectChanges and returns
 * `objectChanges: null`, while the tx `effects` survive permanently. A generator that
 * read the created id ONLY from objectChanges therefore worked right after bootstrap
 * and then silently broke once the bootstrap TX aged past the prune window (the same
 * trap fixed in hooks/created-object-resolver.ts — reference_sui_objectchanges_pruned).
 * Mirror that two-path strategy on the generator's own `rpc` helper (kept decoupled
 * from the suiClient singleton, per this module's design):
 *   Primary  — objectChanges (created entries carry objectType inline; 1 RPC).
 *   Fallback — effects.created refs (permanent) + multiGetObjects(showType).
 */
export async function findCreatedObjectId(txDigest: string, suffix: string): Promise<string | null> {
  if (!txDigest) return null;
  const tx = await rpc<{
    objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }> | null;
    effects?: { created?: Array<{ reference?: { objectId?: string } }> };
  }>("sui_getTransactionBlock", [txDigest, { showObjectChanges: true, showEffects: true }]);

  // Primary — objectChanges carries objectType inline.
  const change = (tx.objectChanges ?? []).find(
    (c) => c.type === "created" && typeof c.objectType === "string" && c.objectType.endsWith(suffix),
  );
  if (change?.objectId) return change.objectId;

  // Fallback — objectChanges pruned (null) or no match: recover each created object's
  // type from the permanent effects.created ids via multiGetObjects(showType).
  const createdIds = (tx.effects?.created ?? [])
    .map((c) => c.reference?.objectId)
    .filter((id): id is string => typeof id === "string");
  if (createdIds.length === 0) return null;

  const objs = await rpc<Array<{ data?: { objectId?: string; type?: string } }>>(
    "sui_multiGetObjects",
    [createdIds, { showType: true }],
  );
  for (const o of objs) {
    const t = o?.data?.type;
    if (typeof t === "string" && t.endsWith(suffix) && typeof o.data?.objectId === "string") {
      return o.data.objectId;
    }
  }
  return null;
}

/** Latest finalized checkpoint sequence number (string). */
export async function getLatestCheckpoint(): Promise<string> {
  try {
    return await rpc<string>("sui_getLatestCheckpointSequenceNumber", []);
  } catch {
    return "0";
  }
}

/** Sum a list of u64-mist strings into one decimal string (BigInt-safe). */
export function sumMist(values: string[]): string {
  let total = 0n;
  for (const v of values) {
    try { total += BigInt(v || "0"); } catch { /* skip */ }
  }
  return total.toString();
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
