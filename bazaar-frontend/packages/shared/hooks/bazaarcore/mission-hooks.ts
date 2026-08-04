// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore Mission (MIS) read hooks.
 *
 *   useMissions(ssuId)                  — active missions at an SSU (mirrors useMyShops:
 *                                         MissionCreatedEvent → MissionRegistry DOF fetch).
 *   useMission(missionId)               — a single mission (MissionRegistry DOF).
 *   useMyAcceptance(missionId, taker)   — the caller's MissionAcceptance DF, if any.
 *   useMissionPendingCompletions(id)    — all PENDING (status 1) acceptances on a mission
 *                                         (giver Confirm/Reject queue for "other" missions).
 *
 * Missions live as dynamic_object_fields on the shared MissionRegistry
 * (SHARED_OBJECTS.MISSION_REGISTRY / MISSION_REGISTRY_ID). Per-taker MissionAcceptance
 * records are dynamic_fields keyed by AcceptanceKey { taker } on the MissionShop UID
 * (== the mission id). Type filters use BAZAAR_MISSION_ORIGINAL_PACKAGE_ID per Sweep-H.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useQuery } from "@tanstack/react-query";
import type {
  Mission,
  MissionItemReq,
  MissionAcceptance,
  MissionAcceptanceStatus,
  BazaarTypeNum,
} from "../../types/bazaarcore";
import { BAZAAR_MISSION_ORIGINAL_PACKAGE_ID, MISSION_REGISTRY_ID } from "../../constants";
import { suiClient } from "../sui-client";

// ── parse helpers ──────────────────────────────────────────────────────────────

function parseItemReqs(raw: unknown): MissionItemReq[] {
  const arr = (raw as unknown[]) ?? [];
  return arr.map((r) => {
    const f = (r as { fields?: Record<string, unknown> })?.fields ?? (r as Record<string, unknown>);
    return { typeId: Number(f.type_id ?? 0), amount: Number(f.amount ?? 0) };
  });
}

function parseMission(fields: Record<string, unknown>, id: string): Mission {
  const balanceField = fields.reward_eve as { fields?: { value?: string }; value?: string } | undefined;
  const rewardEve = Number(balanceField?.fields?.value ?? balanceField?.value ?? 0);
  return {
    id,
    owner:             String(fields.owner ?? ""),
    ssuId:             String(fields.ssu_id ?? ""),
    tribeId:           Number(fields.tribe_id ?? 0),
    bazaarType:        Number(fields.bazaar_type ?? 0) as BazaarTypeNum,
    missionType:       Number(fields.mission_type ?? 0),
    title:             String(fields.title ?? ""),
    description:       String(fields.description ?? ""),
    completionMode:    Number(fields.completion_mode ?? 0),
    proofItems:        parseItemReqs(fields.proof_items),
    rewardItems:       parseItemReqs(fields.reward_items),
    rewardEve,
    rewardEvePerRun:   Number(fields.reward_eve_per_run ?? 0),
    rewardTokenPerRun: Number(fields.reward_token_per_run ?? 0),
    maxRuns:           Number(fields.max_runs ?? 0),
    runsCompleted:     Number(fields.runs_completed ?? 0),
    runsInProgress:    Number(fields.runs_in_progress ?? 0),
    takerTimeLimitMs:  Number(fields.taker_time_limit_ms ?? 0),
    createdAtMs:       Number(fields.created_at_ms ?? 0),
    expiryMs:          Number(fields.expiry_ms ?? 0),
    positionX:         Number(fields.position_x ?? 0),
    positionY:         Number(fields.position_y ?? 0),
    isActive:          Boolean(fields.is_active ?? false),
    isSettled:         Boolean(fields.is_settled ?? false),
    collateralEvePerRun:   Number(fields.collateral_eve_per_run   ?? 0),
    collateralTokenPerRun: Number(fields.collateral_token_per_run ?? 0),
    visibilityRoles:       Number(fields.visibility_roles         ?? 16), // default EVERYONE
    proofEscrowCount:      Number(fields.proof_escrow_count       ?? 0),
    proofEscrowNext:       Number(fields.proof_escrow_next        ?? 0),
  };
}

function parseAcceptance(value: unknown): MissionAcceptance | null {
  const f = (value as { fields?: Record<string, unknown> })?.fields ?? (value as Record<string, unknown>);
  if (!f || typeof f !== "object") return null;
  const taker = (f as Record<string, unknown>).taker;
  if (typeof taker !== "string") return null;
  return {
    taker,
    acceptedAtMs: Number((f as Record<string, unknown>).accepted_at_ms ?? 0),
    deadlineMs:   Number((f as Record<string, unknown>).deadline_ms ?? 0),
    status:       Number((f as Record<string, unknown>).status ?? 0) as MissionAcceptanceStatus,
    collateralAmount: Number((f as Record<string, unknown>).collateral_amount ?? 0),
  };
}

// ── useMission ──────────────────────────────────────────────────────────────────

/** Fetch a single mission by id (DOF on MissionRegistry). */
export function useMission(missionId: string | null) {
  return useQuery<Mission | null>({
    queryKey: ["bazaarcore", "mission", missionId],
    enabled: !!(missionId && MISSION_REGISTRY_ID),
    queryFn: async (): Promise<Mission | null> => {
      const resp = await suiClient.getDynamicFieldObject({
        parentId: MISSION_REGISTRY_ID,
        name: { type: "0x2::object::ID", value: missionId! },
      });
      const content = resp.data?.content as { fields?: Record<string, unknown> } | undefined;
      if (!content?.fields) return null;
      return parseMission(content.fields, resp.data?.objectId ?? missionId!);
    },
    staleTime: 10_000,
  });
}

// ── useMissions ──────────────────────────────────────────────────────────────────

/**
 * Fetch active missions at a given SSU. Mirrors useMyShops: query
 * MissionCreatedEvent filtered by ssu_id, collect ids, fetch the DOFs, drop
 * inactive (closed / exhausted / expired) missions.
 */
export function useMissions(ssuId: string | null) {
  return useQuery<Mission[]>({
    queryKey: ["bazaarcore", "missions", ssuId],
    enabled: !!(ssuId && MISSION_REGISTRY_ID),
    queryFn: async (): Promise<Mission[]> => {
      const eventType = `${BAZAAR_MISSION_ORIGINAL_PACKAGE_ID}::mission::MissionCreatedEvent`;
      const events = await suiClient.queryEvents({ query: { MoveEventType: eventType }, limit: 50 });
      if (events.data.length === 50) {
        console.warn(
          "[useMissions] queryEvents returned 50 results (limit). " +
          "Cursor-based pagination not yet implemented. Some missions may be missing."
        );
      }
      const targetSsuId = ssuId!.toLowerCase();
      const ids: string[] = events.data
        .filter((e) => {
          const p = e.parsedJson as { ssu_id?: string; mission_id?: string } | null;
          return typeof p?.ssu_id === "string" && p.ssu_id.toLowerCase() === targetSsuId
            && typeof p?.mission_id === "string";
        })
        .map((e) => (e.parsedJson as { mission_id: string }).mission_id);
      if (ids.length === 0) return [];
      const results = await Promise.all(
        ids.map((id) =>
          suiClient.getDynamicFieldObject({
            parentId: MISSION_REGISTRY_ID,
            name: { type: "0x2::object::ID", value: id },
          })
        )
      );
      const missions: Mission[] = [];
      for (let i = 0; i < results.length; i++) {
        const content = results[i].data?.content as { fields?: Record<string, unknown> } | undefined;
        if (!content?.fields) continue;
        if (!Boolean(content.fields.is_active ?? false)) continue;
        missions.push(parseMission(content.fields, results[i].data?.objectId ?? ids[i]));
      }
      return missions;
    },
    staleTime: 15_000,
  });
}

// ── useMyAcceptance ──────────────────────────────────────────────────────────────

/**
 * Fetch the caller's MissionAcceptance for a mission, or null if they have none.
 * The acceptance is a DF keyed by AcceptanceKey { taker } on the MissionShop UID.
 */
export function useMyAcceptance(missionId: string | null, taker: string | null) {
  return useQuery<MissionAcceptance | null>({
    queryKey: ["bazaarcore", "mission-acceptance", missionId, taker],
    enabled: !!(missionId && taker),
    queryFn: async (): Promise<MissionAcceptance | null> => {
      try {
        const resp = await suiClient.getDynamicFieldObject({
          parentId: missionId!,
          name: {
            type: `${BAZAAR_MISSION_ORIGINAL_PACKAGE_ID}::mission::AcceptanceKey`,
            value: { taker: taker! },
          },
        });
        const content = resp.data?.content as { fields?: { value?: unknown } } | undefined;
        if (!content?.fields) return null;
        return parseAcceptance(content.fields.value);
      } catch {
        // DF absent (never accepted, or already completed/expired) → null.
        return null;
      }
    },
    staleTime: 10_000,
  });
}

// ── useMissionAcceptances ────────────────────────────────────────────────────────

/**
 * Fetch ALL live acceptances on a mission (status ACTIVE or PENDING) — the giver's
 * status dashboard "who currently holds this mission". Enumerates the mission UID's
 * dynamic fields and keeps the AcceptanceKey rows. A MissionAcceptance DF only
 * exists while the run is unresolved, so every row is a live commitment.
 */
export function useMissionAcceptances(missionId: string | null) {
  return useQuery<MissionAcceptance[]>({
    queryKey: ["bazaarcore", "mission-acceptances", missionId],
    enabled: !!missionId,
    queryFn: async (): Promise<MissionAcceptance[]> => {
      const all: MissionAcceptance[] = [];
      let cursor: string | null | undefined = undefined;
      let hasNextPage = true;
      while (hasNextPage) {
        const page = await suiClient.getDynamicFields({ parentId: missionId!, cursor: cursor ?? undefined });
        const acceptanceFields = page.data.filter((f) =>
          typeof f.name?.type === "string" && f.name.type.includes("::mission::AcceptanceKey")
        );
        const settled = await Promise.allSettled(
          acceptanceFields.map((f) => suiClient.getDynamicFieldObject({ parentId: missionId!, name: f.name }))
        );
        for (const s of settled) {
          if (s.status !== "fulfilled") continue;
          const content = s.value.data?.content as { fields?: { value?: unknown } } | undefined;
          const acc = content?.fields ? parseAcceptance(content.fields.value) : null;
          if (acc) all.push(acc);
        }
        cursor = page.nextCursor;
        hasNextPage = page.hasNextPage;
      }
      return all;
    },
    staleTime: 10_000,
  });
}

// ── useMissionPendingCompletions ─────────────────────────────────────────────────

/**
 * Fetch all PENDING (status 1) acceptances on a mission — the giver's
 * Confirm/Reject queue for "other" missions. Enumerates the mission UID's
 * dynamic fields, keeps the AcceptanceKey rows, and filters to status === PENDING.
 */
export function useMissionPendingCompletions(missionId: string | null) {
  return useQuery<MissionAcceptance[]>({
    queryKey: ["bazaarcore", "mission-pending", missionId],
    enabled: !!missionId,
    queryFn: async (): Promise<MissionAcceptance[]> => {
      const pending: MissionAcceptance[] = [];
      let cursor: string | null | undefined = undefined;
      let hasNextPage = true;
      while (hasNextPage) {
        const page = await suiClient.getDynamicFields({ parentId: missionId!, cursor: cursor ?? undefined });
        const acceptanceFields = page.data.filter((f) =>
          typeof f.name?.type === "string" && f.name.type.includes("::mission::AcceptanceKey")
        );
        const settled = await Promise.allSettled(
          acceptanceFields.map((f) => suiClient.getDynamicFieldObject({ parentId: missionId!, name: f.name }))
        );
        for (const s of settled) {
          if (s.status !== "fulfilled") continue;
          const content = s.value.data?.content as { fields?: { value?: unknown } } | undefined;
          const acc = content?.fields ? parseAcceptance(content.fields.value) : null;
          if (acc && acc.status === 1) pending.push(acc);
        }
        cursor = page.nextCursor;
        hasNextPage = page.hasNextPage;
      }
      return pending;
    },
    staleTime: 10_000,
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
