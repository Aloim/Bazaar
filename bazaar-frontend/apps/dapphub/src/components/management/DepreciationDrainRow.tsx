// bazaar-frontend | Janitor UI row driving the mark and SSU-scoped prune sequence for one depreciated SSU
// Soft size threshold: 500 LOC. Run `phanes loc-check` if uncertain.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * V41 SSU depreciation/prune — janitor row for ONE depreciated (or probe-gone)
 * SSU. Sequence (plan §5 / §2.3-2.5):
 *   0. Mark depreciated (only while !isCertifiedDepreciated) — composes
 *      mark_ssu_revealed + mark_ssu_depreciated in one PTB.
 *   1. Enumerate this SSU's shop/mission ids via the SAME BazarRegistry.shops_by_ssu
 *      / MissionRegistry.missions_by_ssu Tables useForceClosePlan.ts already reads —
 *      but via a single KEYED dynamic-field lookup (this one SSU), not a full scan.
 *   2. Refund + delist shops (EVE) — bazaar_shop_ops.
 *   3. (Advanced only) refund WTB + FREE tribe-token pools for the same shop ids.
 *   4. Per-mission rows (DepreciationMissionRow) — collateral / reward-close /
 *      items-recovery / (Advanced) reward-token.
 *
 * NOTE (CR-P6-01, live-SSU counterpart): the "Mark depreciated" step here can
 * only ever SUCCEED for an SSU whose location_revealed flag was already set
 * WHILE IT WAS ALIVE — that recording happens in RecordRevealRow.tsx (§2.11),
 * mounted for non-depreciated SSUs. This row only renders once an SSU is already
 * dead/probe-gone; it does not itself record reveal state.
 *
 * Permissionless — no ownerCapId. DappHub-EXEMPT (dAppKit direct sign, matching
 * every other ceremony/janitor row in this folder).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { suiClient } from "@bazaar/shared/hooks/sui-client";
import { BAZAR_REGISTRY_ID, MISSION_REGISTRY_ID, WORLD_LOCATION_REGISTRY_ID } from "@bazaar/shared/constants";
import { useSSUGovId, useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useTribeTokenWtbPoolId, useTribeEconomyObjects } from "@bazaar/shared/hooks/bazaareconomy/economy-resolution-hooks";
import { buildMarkSsuDepreciatedSequence } from "@bazaar/shared/tx/bazaarcore/ssu-depreciation-tx";
import { buildPruneDepreciatedShopsPage } from "@bazaar/shared/tx/bazaarcore/ssu-depreciation-ops-tx";
import {
  buildPruneDepreciatedWtbTokenPage,
  buildPruneDepreciatedFreeTokenPage,
} from "@bazaar/shared/tx/bazaareconomy/ssu-depreciation-economy-tx";
import DrainBatchButton from "./DrainBatchButton";
import DepreciationMissionRow from "./DepreciationMissionRow";
import type { SSURow } from "./SSUsTab";

interface Props {
  ssu: SSURow;
  onRefresh: () => void;
}

const ROW_STYLE: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "0.5rem",
  fontFamily: "monospace", fontSize: "0.78rem",
};
const HEAD_STYLE: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "baseline" };
const TAG_STYLE: React.CSSProperties = { color: "rgba(255,255,255,0.45)" };
const VAL_STYLE: React.CSSProperties = { color: "#e8e8e8", fontSize: "0.72rem" };
const ACCENT_STYLE: React.CSSProperties = { color: "#cc7000", fontWeight: 600 };
const WAIT_STYLE: React.CSSProperties = { color: "rgba(255,255,255,0.5)", fontStyle: "italic" };
const OK_STYLE: React.CSSProperties = { color: "#7fc97f" };
const SECTION_HDR_STYLE: React.CSSProperties = {
  color: "#cc7000", letterSpacing: "0.06em", textTransform: "uppercase", fontSize: "0.7rem", marginTop: "0.3rem",
};
const REFRESH_BTN: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.2)", color: "#e8e8e8",
  padding: "0.2rem 0.55rem", fontFamily: "monospace", fontSize: "0.68rem", cursor: "pointer",
};

async function fetchTableUid(registryId: string, fieldName: string): Promise<string | null> {
  const obj = await suiClient.getObject({ id: registryId, options: { showContent: true } });
  const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
  const tbl = fields?.[fieldName] as { fields?: { id?: { id?: string } } } | undefined;
  return tbl?.fields?.id?.id ?? null;
}

/** Keyed lookup of ONE ssu's row in a `Table<address, vector<ID|struct>>` — the
 *  same shops_by_ssu / missions_by_ssu tables useForceClosePlan.ts full-scans,
 *  but scoped to a single SSU (one getDynamicFieldObject, not a table walk). */
async function fetchSsuIdVector(registryId: string, fieldName: string, ssuId: string): Promise<string[]> {
  const tableUid = await fetchTableUid(registryId, fieldName);
  if (!tableUid) return [];
  try {
    const res = await suiClient.getDynamicFieldObject({
      parentId: tableUid,
      name: { type: "address", value: ssuId },
    });
    const f = (res.data?.content as { fields?: { value?: unknown } } | undefined)?.fields;
    const rawVec = Array.isArray(f?.value) ? (f!.value as unknown[]) : [];
    // C3/C4 reshape: elements are {id,x,y,active} structs; pre-reshape bare IDs
    // fall through the `?? el` (matches useForceClosePlan.ts's readVectorTable).
    return rawVec.map((el) => String((el as { fields?: { id?: string } })?.fields?.id ?? (el as { id?: string })?.id ?? el));
  } catch {
    return [];
  }
}

export default function DepreciationDrainRow({ ssu, onRefresh }: Props) {
  const isAdvanced = ssu.bazaarType === "advanced";

  const ssuGov = useSSUGovId(ssu.ssuId);
  const ssuShared = useSSUSharedObjects(ssu.ssuId);
  const tokenWtbPool = useTribeTokenWtbPoolId(isAdvanced ? ssu.ssuId : null);
  const tribeEcon = useTribeEconomyObjects(isAdvanced ? ssu.tribeId : null);

  const ssuGovId = ssuGov.data ?? null;
  const wtbEscrowPoolId = ssuShared.data?.wtbEscrowPoolId || null;
  const ledgerId = tribeEcon.data?.ledgerId ?? null;

  const [shopIds, setShopIds] = useState<string[] | null>(null);
  const [missionIds, setMissionIds] = useState<string[] | null>(null);
  const [enumLoading, setEnumLoading] = useState(false);
  const loadEnum = useCallback(async () => {
    setEnumLoading(true);
    try {
      const [shops, missions] = await Promise.all([
        BAZAR_REGISTRY_ID ? fetchSsuIdVector(BAZAR_REGISTRY_ID, "shops_by_ssu", ssu.ssuId) : Promise.resolve([]),
        MISSION_REGISTRY_ID ? fetchSsuIdVector(MISSION_REGISTRY_ID, "missions_by_ssu", ssu.ssuId) : Promise.resolve([]),
      ]);
      setShopIds(shops);
      setMissionIds(missions);
    } finally {
      setEnumLoading(false);
    }
  }, [ssu.ssuId]);

  useEffect(() => {
    if (ssu.isCertifiedDepreciated) void loadEnum();
  }, [ssu.isCertifiedDepreciated, loadEnum]);

  // ── Step 0: mark (only until certified) ──
  const fetchMarkTrigger = useMemo(() => async (): Promise<string[]> => [ssu.ssuId], [ssu.ssuId]);
  const buildMarkChunk = useCallback(
    (_ids: string[], tx: Transaction): Transaction =>
      buildMarkSsuDepreciatedSequence({ ssuGovId: ssuGovId!, locationRegistryId: WORLD_LOCATION_REGISTRY_ID }, tx),
    [ssuGovId],
  );

  if (!ssu.isCertifiedDepreciated) {
    return (
      <div style={ROW_STYLE}>
        <div style={HEAD_STYLE}>
          <span style={VAL_STYLE}>{ssu.ssuId}</span>
          <span style={TAG_STYLE}>world assembly gone — not yet certified depreciated on-chain</span>
        </div>
        {ssuGovId ? (
          <DrainBatchButton
            label="Mark depreciated (refunds SSU tax wallet → owner)"
            fetchIds={fetchMarkTrigger}
            buildChunkTx={buildMarkChunk}
            pageSize={1}
            onPageSettled={onRefresh}
          />
        ) : (
          <span style={WAIT_STYLE}>Resolving SSUGovernance…</span>
        )}
      </div>
    );
  }

  // ── Certified: shop + (Advanced) token-pool prune, then per-mission rows ──
  const fetchShopIds = useCallback(async (): Promise<string[]> => shopIds ?? [], [shopIds]);
  const buildShopChunk = useCallback(
    (ids: string[], tx: Transaction): Transaction =>
      buildPruneDepreciatedShopsPage({ ssuGovId: ssuGovId!, wtbEscrowPoolId: wtbEscrowPoolId!, shopIds: ids }, tx),
    [ssuGovId, wtbEscrowPoolId],
  );
  const buildWtbTokenChunk = useCallback(
    (ids: string[], tx: Transaction): Transaction =>
      buildPruneDepreciatedWtbTokenPage(
        { ssuGovId: ssuGovId!, tribeTokenWtbPoolId: tokenWtbPool.data!, ledgerId: ledgerId!, shopIds: ids },
        tx,
      ),
    [ssuGovId, tokenWtbPool.data, ledgerId],
  );
  const buildFreeTokenChunk = useCallback(
    (ids: string[], tx: Transaction): Transaction =>
      buildPruneDepreciatedFreeTokenPage({ ssuGovId: ssuGovId!, ledgerId: ledgerId!, shopIds: ids }, tx),
    [ssuGovId, ledgerId],
  );

  const shopReady = !!(ssuGovId && wtbEscrowPoolId);
  const tokenReady = isAdvanced && !!(tokenWtbPool.data && ledgerId);

  return (
    <div style={ROW_STYLE}>
      <div style={HEAD_STYLE}>
        <span style={VAL_STYLE}>{ssu.ssuId}</span>
        <span style={ACCENT_STYLE}>certified depreciated</span>
        <button style={REFRESH_BTN} onClick={loadEnum} disabled={enumLoading}>
          {enumLoading ? "…" : "↻ Re-enumerate"}
        </button>
      </div>

      {enumLoading && <span style={WAIT_STYLE}>Enumerating shops + missions…</span>}

      {!enumLoading && shopIds && shopIds.length > 0 && shopReady && (
        <DrainBatchButton
          label={`Refund + delist ${shopIds.length} shop${shopIds.length === 1 ? "" : "s"} (EVE)`}
          fetchIds={fetchShopIds}
          buildChunkTx={buildShopChunk}
          onPageSettled={onRefresh}
        />
      )}
      {!enumLoading && shopIds && shopIds.length === 0 && (
        <span style={OK_STYLE}>✓ No shops left to refund/delist.</span>
      )}

      {isAdvanced && !enumLoading && shopIds && shopIds.length > 0 && tokenReady && (
        <>
          <DrainBatchButton
            label="Refund WTB tribe-token earmarks → owner ledger"
            fetchIds={fetchShopIds}
            buildChunkTx={buildWtbTokenChunk}
            onPageSettled={onRefresh}
          />
          <DrainBatchButton
            label="Refund FREE-shop tribe-token pools → owner ledger"
            fetchIds={fetchShopIds}
            buildChunkTx={buildFreeTokenChunk}
            onPageSettled={onRefresh}
          />
        </>
      )}

      {!enumLoading && missionIds && missionIds.length > 0 && ssuGovId && (
        <>
          <div style={SECTION_HDR_STYLE}>Missions ({missionIds.length})</div>
          {missionIds.map((mid) => (
            <DepreciationMissionRow key={mid} ssuGovId={ssuGovId} ssuId={ssu.ssuId} missionId={mid} onSettled={onRefresh} />
          ))}
        </>
      )}
      {!enumLoading && missionIds && missionIds.length === 0 && (
        <span style={OK_STYLE}>✓ No missions left to refund/close.</span>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
