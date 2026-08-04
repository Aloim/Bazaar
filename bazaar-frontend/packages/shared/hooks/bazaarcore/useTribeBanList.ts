// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useTribeBanList — Phase 8 Wave A2 (AUD-ET-19).
 *
 * Reads the V35 tribe-wide timed-ban table TribeGovernance.global_bans
 * (Table<address, u64 expires_at_ms>) by walking its dynamic fields — the
 * predecessor read SSU MemberEntry.is_banned booleans via useBanList(null)
 * and therefore ALWAYS rendered an empty tribe ban list.
 *
 * Expiry semantics mirror tribe_governance::tribe_is_globally_banned: bans
 * are lazily expired on-chain; an entry with expires_at_ms <= now renders as
 * Expired (it stays in the table until unban/re-ban touches it).
 * PERMANENT_BAN_SENTINEL = u64::MAX.
 *
 * Also exposes the tribe's ssu_ids — the ban entries take ANY MemberRegistry
 * for their best-effort target-rank check (SA-06; no tribe binding asserted
 * on members), so callers resolve one from the first registered SSU.
 */

import { useQuery } from "@tanstack/react-query";
import { suiClient } from "../sui-client";

const U64_MAX = 0xFFFFFFFFFFFFFFFFn;

export interface TribeBanEntry {
  address:     string;
  /** Epoch ms expiry; null = permanent (u64::MAX sentinel). */
  expiresAtMs: number | null;
  /** Lazy-expiry view: true when a timed ban's expiry has passed. */
  isExpired:   boolean;
}

export interface TribeBanListData {
  bans:   TribeBanEntry[];
  ssuIds: string[];
}

type AnyFields = { fields?: Record<string, unknown> } | undefined;

export function useTribeBanList(tribeGovId: string | null) {
  const query = useQuery<TribeBanListData>({
    queryKey: ["bazaarcore", "tribe-ban-list", tribeGovId],
    enabled: !!tribeGovId,
    queryFn: async (): Promise<TribeBanListData> => {
      const gov = await suiClient.getObject({ id: tribeGovId!, options: { showContent: true } });
      const fields = (gov.data?.content as AnyFields)?.fields;
      if (!fields) return { bans: [], ssuIds: [] };

      const ssuIds: string[] = Array.isArray(fields.ssu_ids)
        ? (fields.ssu_ids as unknown[]).map(String)
        : [];
      const tableId: string | undefined =
        (fields.global_bans as { fields?: { id?: { id?: string } } } | undefined)?.fields?.id?.id;
      if (!tableId) return { bans: [], ssuIds };

      // Walk the Table's dynamic fields (paginated), then read each expiry value.
      const names: Array<{ name: unknown }> = [];
      let cursor: string | null = null;
      do {
        const page = await suiClient.getDynamicFields({ parentId: tableId, cursor });
        names.push(...page.data.map(d => ({ name: d.name })));
        cursor = page.hasNextPage ? (page.nextCursor ?? null) : null;
      } while (cursor);

      const now = Date.now();
      const bans = await Promise.all(names.map(async ({ name }): Promise<TribeBanEntry | null> => {
        try {
          const row = await suiClient.getDynamicFieldObject({
            parentId: tableId,
            name: name as { type: string; value: unknown },
          });
          const content = row.data?.content as
            { fields?: { name?: unknown; value?: unknown } } | undefined;
          const address = String(content?.fields?.name ?? "");
          const rawValue = BigInt(String(content?.fields?.value ?? "0"));
          if (!address) return null;
          const permanent = rawValue >= U64_MAX;
          return {
            address,
            expiresAtMs: permanent ? null : Number(rawValue),
            isExpired: !permanent && Number(rawValue) <= now,
          };
        } catch { return null; }
      }));

      return { bans: bans.filter((b): b is TribeBanEntry => b !== null), ssuIds };
    },
    staleTime: 15_000,
  });
  return {
    bans:      query.data?.bans ?? [],
    ssuIds:    query.data?.ssuIds ?? [],
    isLoading: query.isLoading,
    refetch:   query.refetch,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
