// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1.1 — Step-2 per-(SSU, owner) shop force-close row.
 *
 * One row == one ShopOwnerGroup (every active shop owned by one wallet at one
 * SSU). Resolves the SSU's shared objects + the owner's Character, then drives
 * a paged `close_all_shops_batch` with `allow_ssu_owner=true` so even the
 * SSU-owner's own shops close (items → that owner's Player Locker). The Move
 * pins recipient == shop.owner, which is exactly why the enumeration groups by
 * owner: every shop in the group shares one Character.
 *
 * DappHub-EXEMPT — DrainBatchButton signs via dAppKit directly.
 */

import { Transaction } from "@mysten/sui/transactions";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useCharacterForAddress } from "@bazaar/shared/hooks/useCharacterForAddress";
import { buildCloseAllShopsBatch } from "@bazaar/shared/tx/bazaarcore/admin-drain-tx";
import type { ShopOwnerGroup } from "@bazaar/shared/hooks/ceremony";
import DrainBatchButton from "./DrainBatchButton";

interface Props {
  group: ShopOwnerGroup;
  ownerCapId: string;
  onSettled: () => void;
}

const ROW_STYLE: React.CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.08)",
  background: "rgba(255, 255, 255, 0.015)",
  padding: "0.55rem 0.7rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
  fontFamily: "monospace",
  fontSize: "0.76rem",
};

const HEAD_STYLE: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem 0.9rem",
  alignItems: "baseline",
};

const TAG_STYLE: React.CSSProperties = { color: "rgba(255,255,255,0.45)" };
const VAL_STYLE: React.CSSProperties = { color: "#e8e8e8" };
const COUNT_STYLE: React.CSSProperties = { color: "#cc7000", fontWeight: 600 };
const WAIT_STYLE: React.CSSProperties = { color: "rgba(255,255,255,0.5)", fontStyle: "italic" };
const ERR_STYLE: React.CSSProperties = { color: "#e55555" };

function short(addr: string): string {
  return addr ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : "—";
}

export default function ShopOwnerDrainRow({ group, ownerCapId, onSettled }: Props) {
  const ssuObjects = useSSUSharedObjects(group.ssuId);
  const character = useCharacterForAddress(group.ownerAddress);

  const ssuGovId = ssuObjects.data?.ssuGovId ?? null;
  const wtbEscrowPoolId = ssuObjects.data?.wtbEscrowPoolId || null;
  const characterId = character.characterId;

  const ready = !!(ssuGovId && wtbEscrowPoolId && characterId);

  const fetchIds = async (): Promise<string[]> => group.shopIds;
  const buildChunkTx = (ids: string[], tx: Transaction): Transaction =>
    buildCloseAllShopsBatch(
      {
        ownerCapId,
        ssuGovId: ssuGovId!,
        ssuId: group.ssuId,
        recipientCharacterId: characterId!,
        wtbEscrowPoolId: wtbEscrowPoolId!,
        shopIds: ids,
        allowSsuOwner: true,
      },
      tx,
    );

  // Surface the first concrete resolution problem so the admin can act on it.
  let blockReason: string | null = null;
  if (!ready) {
    if (ssuObjects.isLoading || character.isLoading) blockReason = "Resolving SSU objects + owner Character…";
    else if (character.error) blockReason = `Character unresolved: ${character.error}`;
    else if (!ssuGovId) blockReason = "SSUGovernance unresolved (SSU not bootstrapped?).";
    else if (!wtbEscrowPoolId) blockReason = "WtbEscrowPool unresolved (pre-V13 SSU?).";
    else if (!characterId) blockReason = "Owner has no EVE Frontier Character.";
    else blockReason = "Resolving…";
  }

  return (
    <div style={ROW_STYLE}>
      <div style={HEAD_STYLE}>
        <span><span style={TAG_STYLE}>owner </span><span style={VAL_STYLE}>{short(group.ownerAddress)}</span></span>
        <span><span style={TAG_STYLE}>ssu </span><span style={VAL_STYLE}>{short(group.ssuId)}</span></span>
        <span><span style={COUNT_STYLE}>{group.shopIds.length}</span> <span style={TAG_STYLE}>shop{group.shopIds.length === 1 ? "" : "s"}</span></span>
      </div>
      {ready ? (
        <DrainBatchButton
          label={`Force-close ${group.shopIds.length} shop${group.shopIds.length === 1 ? "" : "s"} → owner locker`}
          fetchIds={fetchIds}
          buildChunkTx={buildChunkTx}
          onPageSettled={onSettled}
        />
      ) : (
        <span style={character.error ? ERR_STYLE : WAIT_STYLE}>{blockReason}</span>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
