// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Update Ceremony V2 — Phase 2 (Slice 5): `useReclaimRecords`.
 *
 * Enumerates the `dapp_hub::reclaim_registry::ReclaimRegistry` dynamic fields and
 * returns the records keyed to the CONNECTED wallet, decoded for the reclaim UI.
 *
 * The records are stored as `df::add(&mut registry.id, ReclaimKey{holder,record_type,
 * sub_id}, ReclaimRecord)` — so the registry object's dynamic fields ARE the records
 * (the `tribe_remap` / `consumed` Tables are nested struct fields, not DFs of the
 * registry UID, so they don't appear here). We page `suix_getDynamicFields`, filter
 * by `name.value.holder == wallet`, fetch each matching field, and decode the
 * payload blob by record type (SSUOwnerPayload / TribeLeaderPayload).
 *
 * Ordering is TRIBE-FIRST: the chain enforces that an Easy/Advanced SSU reclaim
 * aborts (E_NOT_REMAPPED) until its tribe is reclaimed, so we render tribes first.
 *
 * Dormant on V37: an empty `RECLAIM_REGISTRY_ID` short-circuits to an empty list.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { suiClient } from "../sui-client";
import { RECLAIM_REGISTRY_ID } from "../../constants";
import { RECORD_TYPE_SSU_OWNER, RECORD_TYPE_TRIBE_LEADER } from "../../ceremony/reclaim/payloads";
import { decodeSsuOwnerPayload } from "../../tx/bazaarmission/reclaim-ssu-tx";
import type { DecodedSsuOwnerPayload } from "../../tx/bazaarmission/reclaim-ssu-tx";
import { decodeTribeLeaderPayload } from "../../tx/bazaareconomy/reclaim-tribe-tx";
import type { DecodedTribeLeaderPayload } from "../../tx/bazaareconomy/reclaim-tribe-tx";

export interface ReclaimRecordView {
  recordType: number;        // 0 = SSU_OWNER, 1 = TRIBE_LEADER
  subId: bigint;             // u256: SSU = to_u256(ssu_id); TRIBE = tribe_id
  holder: string;
  backupAnchorId: number;
  populatedAtMs: number;
  /** Raw record payload blob (BCS) — handed to the reclaim builders. */
  payloadBlob: number[];
  /** Decoded payload (exactly one of these is set, by record type). */
  ssu?: DecodedSsuOwnerPayload;
  tribe?: DecodedTribeLeaderPayload;
  /** Human label for the reclaim card. */
  label: string;
}

export interface UseReclaimRecordsResult {
  /** All records for the wallet, TRIBE-FIRST ordered. */
  records: ReclaimRecordView[];
  tribeRecords: ReclaimRecordView[];
  ssuRecords: ReclaimRecordView[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

function toNumber(raw: unknown, fallback = 0): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") { const n = Number(raw); return Number.isFinite(n) ? n : fallback; }
  return fallback;
}

function toBlob(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try { return Array.from(atob(raw), (c) => c.charCodeAt(0)); } catch { return []; }
  }
  return [];
}

const TYPE_LABEL = ["NoTribe", "Easy", "Advanced"];

function buildView(recordType: number, subId: bigint, holder: string, fields: Record<string, unknown>): ReclaimRecordView {
  const payloadBlob = toBlob(fields.payload_blob);
  const base: ReclaimRecordView = {
    recordType,
    subId,
    holder,
    backupAnchorId: toNumber(fields.backup_anchor_id),
    populatedAtMs: toNumber(fields.populated_at_ms),
    payloadBlob,
    label: "",
  };
  if (recordType === RECORD_TYPE_TRIBE_LEADER) {
    const tribe = decodeTribeLeaderPayload(payloadBlob);
    base.tribe = tribe;
    base.label = `Tribe #${tribe.originalTribeId.toString()} · ${TYPE_LABEL[tribe.bazaarType] ?? "?"}${tribe.name ? ` · ${tribe.name}` : ""}`;
  } else {
    const ssu = decodeSsuOwnerPayload(payloadBlob);
    base.ssu = ssu;
    const id = ssu.originalSsuId;
    base.label = `SSU ${id.slice(0, 10)}…${id.slice(-6)} · ${TYPE_LABEL[ssu.bazaarType] ?? "?"}`;
  }
  return base;
}

export function useReclaimRecords(
  walletAddress: string | null,
  opts?: { reclaimRegistryId?: string },
): UseReclaimRecordsResult {
  const registryId = opts?.reclaimRegistryId ?? RECLAIM_REGISTRY_ID;
  const [records, setRecords] = useState<ReclaimRecordView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!registryId || !walletAddress) {
      setRecords([]); setIsLoading(false); setError(null);
      return;
    }
    let cancelled = false;
    const myReq = ++reqIdRef.current;
    const wallet = normalizeSuiAddress(walletAddress);

    async function loadAll() {
      setIsLoading(true);
      try {
        // 1. Page the registry's dynamic fields; keep only this wallet's keys.
        const mine: { name: { type: string; value: unknown }; recordType: number; subId: bigint }[] = [];
        let cursor: string | null | undefined = undefined;
        do {
          const page = await suiClient.getDynamicFields({ parentId: registryId, cursor: cursor ?? undefined, limit: 200 });
          if (cancelled || myReq !== reqIdRef.current) return;
          for (const df of page.data) {
            const v = (df.name?.value ?? {}) as Record<string, unknown>;
            const holder = typeof v.holder === "string" ? v.holder : undefined;
            if (!holder || normalizeSuiAddress(holder) !== wallet) continue;
            mine.push({
              name: df.name as { type: string; value: unknown },
              recordType: toNumber(v.record_type),
              subId: (() => { try { return BigInt(String(v.sub_id)); } catch { return 0n; } })(),
            });
          }
          cursor = page.hasNextPage ? page.nextCursor : null;
        } while (cursor);

        // 2. Fetch + decode each of my records (tolerate a single malformed row).
        const views: ReclaimRecordView[] = [];
        for (const m of mine) {
          const obj = await suiClient.getDynamicFieldObject({ parentId: registryId, name: m.name });
          if (cancelled || myReq !== reqIdRef.current) return;
          const fields = (obj.data?.content as { fields?: { value?: { fields?: Record<string, unknown> } } } | undefined)?.fields?.value?.fields;
          if (!fields) continue;
          try {
            views.push(buildView(m.recordType, m.subId, wallet, fields));
          } catch { /* skip a record whose payload won't decode */ }
        }

        // 3. Tribe-first ordering (tribes must reclaim before their SSUs).
        views.sort((a, b) => {
          if (a.recordType !== b.recordType) return a.recordType === RECORD_TYPE_TRIBE_LEADER ? -1 : 1;
          return a.label.localeCompare(b.label);
        });

        setRecords(views);
        setError(null);
      } catch (err) {
        if (cancelled || myReq !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled && myReq === reqIdRef.current) setIsLoading(false);
      }
    }

    void loadAll();
    return () => { cancelled = true; };
  }, [registryId, walletAddress, tick]);

  return {
    records,
    tribeRecords: records.filter((r) => r.recordType === RECORD_TYPE_TRIBE_LEADER),
    ssuRecords: records.filter((r) => r.recordType === RECORD_TYPE_SSU_OWNER),
    isLoading,
    error,
    refetch,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
