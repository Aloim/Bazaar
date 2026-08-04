// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ModerationTab.shops.tsx — Shop/ban list sub-components (XIV.4 split from ModerationTab.tsx).
 *
 * Hosts: ShopListWithNames, ShopList, TribeBanListView, ForceCloseTab
 * ModerationTab.tsx hosts the tab skeleton (TribeModerationTab) and ban-form components.
 *
 * R6.7.5.B — OS-50 tribe-tier dispatch + OS-49b unban.
 * CC-001: tribeGovId resolved via useTribeCaps+useTribeRegistry (NOT SSU_OBJECT_ID).
 * CC-004: removeShop inert early-return guard removed; disabled-state approach used.
 * Article XIV.2 ad-hoc exemption per user direct authorization 2026-04-29.
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState, useMemo } from "react";
import { dAppKit, abbreviateAddress, useConnection } from "@evefrontier/dapp-kit";
import { buildTribeUnbanAs, type TribeCapTier } from "@bazaar/shared/tx/bazaarcore/tribe-ban-tx";
import { buildForceCloseShop } from "@bazaar/shared/tx/bazaarcore/ssu-governance-tx";
import {
  buildForceCloseShopAsTribeSuperAdmin,
  buildForceCloseShopAsTribeAdmin,
  buildForceCloseShopAsTribeMod,
} from "@bazaar/shared/tx/bazaarcore/shop-moderation-tx";
import { buildCloseShop } from "@bazaar/shared/tx/bazaarcore/shop-tx";
import { useCharacterNames } from "@bazaar/shared/hooks/useCharacterNames";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeRegistry } from "@bazaar/shared/hooks/useTribeRegistry";
import { useRecipientCharacter } from "@bazaar/shared/hooks/bazaarcore/identity-hooks";
import { useSSUSharedObjects, useSSUGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useSSUGovernance } from "@bazaar/shared/hooks/useSSUGovernance";
import { useCharacterOwnerCapRef } from "@bazaar/shared/hooks/useCharacterOwnerCapRef";
import { useIsSSUOwner, useSSUOwnerCapRef } from "@bazaar/shared/hooks";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";

// ── ShopEntry (exported shared type) ─────────────────────────────────────────

export interface ShopEntry {
  id:    string;
  title: string;
  kind:  string;
  owner: string;
}

// ── ShopListWithNames ──────────────────────────────────────────────────────────

export interface ShopListWithNamesProps {
  shops:            ShopEntry[];
  capType:          "owner" | "superadmin" | "admin" | "mod";
  ownerCapId:       string;
  superAdminCapId?: string;
  adminCapId?:      string;
  modCapId?:        string;
  onBan:            (addr: string) => void;
}

export function ShopListWithNames(props: ShopListWithNamesProps) {
  const ownerAddresses = useMemo(
    () => [...new Set(props.shops.map(s => s.owner))],
    [props.shops],
  );
  const characterNames = useCharacterNames(ownerAddresses);
  return <ShopList {...props} characterNames={characterNames} />;
}

// ── ShopList ───────────────────────────────────────────────────────────────────

interface ShopListProps extends ShopListWithNamesProps {
  characterNames: Map<string, string>;
}

// OS-50: tribe-cap-tier-aware Remove dispatcher.
// Priority: superAdminCapId > adminCapId > modCapId > disabled.
// CC-001: tribeGovId resolved via hook chain (NOT SSU_OBJECT_ID).
// CC-004: no early-return guard — canRemove disabled state prevents invocation without a cap.
function ShopList({
  shops, onBan, characterNames, capType, ownerCapId, superAdminCapId, adminCapId, modCapId,
}: ShopListProps) {
  const [removing, setRemoving] = useState<string | null>(null);
  const { leaderTribeIdx, superAdminTribeIdx } = useTribeCaps();
  const { tribes } = useTribeRegistry();

  const govTribeIdx = leaderTribeIdx ?? superAdminTribeIdx ?? null;
  const tribeGovId  = govTribeIdx !== null
    ? (tribes.find(t => t.idx === govTribeIdx)?.tribeGovId ?? "")
    : "";
  const { data: shared } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  // SSU-owner-owned shops are exempt from tribe force-close by Move design
  // (shop_moderation_tribe::* aborts E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP = 20).
  // When the clicker IS the SSU owner AND the shop is theirs, auto-route to
  // bazar_close::close_shop_as_ssu_owner so Remove "just works" — items to
  // Main Storage, EVE refund to owner wallet (= clicker, same wallet).
  const { ssuOwner } = useSSUGovernance(SSU_OBJECT_ID || "");
  const { walletAddress } = useConnection();
  const { data: ssuGovId } = useSSUGovId(SSU_OBJECT_ID || null);
  const { characterId, charCapRef } = useCharacterOwnerCapRef(walletAddress ?? undefined, SSU_OBJECT_ID);
  const { data: isSSUOwner } = useIsSSUOwner(ssuGovId ?? null);
  const { ref: ssuOwnerCapRef } = useSSUOwnerCapRef(isSSUOwner, characterId, SSU_OBJECT_ID);

  async function removeShop(shopId: string, recipientCharacterId: string, shopOwner: string) {
    const ssuId = SSU_OBJECT_ID;
    const wtbEscrowPoolId = shared?.wtbEscrowPoolId ?? "";
    if (!wtbEscrowPoolId) { alert("Resolving SSU shared objects — please try again."); return; }

    // SSU-owner self-close routing: clicker = shop owner = SSU owner.
    const isSelfSsuOwnerClose =
      !!walletAddress && walletAddress === shopOwner && walletAddress === ssuOwner;
    if (isSelfSsuOwnerClose) {
      if (!ssuGovId || !characterId || !charCapRef || !ssuOwnerCapRef) {
        alert("Resolving SSU owner cap — please try again in a moment.");
        return;
      }
      setRemoving(shopId);
      try {
        await dAppKit.signAndExecuteTransaction({
          transaction: buildCloseShop({
            shopId,
            ssuGovId,
            ssuId,
            characterId,
            wtbEscrowPoolId,
            charCapRef,
            ssuOwnerCapRef,
          }),
        });
      } catch (e: unknown) {
        alert((e as Error)?.message ?? String(e));
      } finally {
        setRemoving(null);
      }
      return;
    }

    setRemoving(shopId);
    try {
      if (capType === "owner" && ownerCapId) {
        await dAppKit.signAndExecuteTransaction({
          transaction: buildForceCloseShop({
            ownerCapId, shopId, ssuGovId: SSU_OBJECT_ID,
            ssuId, recipientCharacterId, wtbEscrowPoolId,
          }),
        });
      } else if (superAdminCapId && tribeGovId) {
        await dAppKit.signAndExecuteTransaction({
          transaction: buildForceCloseShopAsTribeSuperAdmin({
            superAdminCapId, shopId, ssuGovId: SSU_OBJECT_ID, tribeGovId,
            ssuId, recipientCharacterId, wtbEscrowPoolId,
          }),
        });
      } else if (adminCapId && tribeGovId) {
        await dAppKit.signAndExecuteTransaction({
          transaction: buildForceCloseShopAsTribeAdmin({
            adminCapId, shopId, ssuGovId: SSU_OBJECT_ID, tribeGovId,
            ssuId, recipientCharacterId, wtbEscrowPoolId,
          }),
        });
      } else if (modCapId && tribeGovId) {
        await dAppKit.signAndExecuteTransaction({
          transaction: buildForceCloseShopAsTribeMod({
            modCapId, shopId, ssuGovId: SSU_OBJECT_ID, tribeGovId,
            ssuId, recipientCharacterId, wtbEscrowPoolId,
          }),
        });
      } else {
        alert("No eligible cap for this operation.");
      }
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setRemoving(null);
    }
  }

  const canRemove = capType === "owner"
    ? !!ownerCapId
    : !!(superAdminCapId ?? adminCapId ?? modCapId) && !!tribeGovId;

  if (shops.length === 0) {
    return <p className="muted">No active shops at this terminal.</p>;
  }

  return (
    <div>
      <h3 style={{ marginBottom: "0.75rem" }}>Active Shops ({shops.length})</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Owner</th>
            <th>Remove</th>
          </tr>
        </thead>
        <tbody>
          {shops.map(s => (
            <TribeShopRow
              key={s.id}
              shop={s}
              ownerName={characterNames.get(s.owner)}
              canRemove={canRemove}
              isRemoving={removing === s.id}
              onBan={onBan}
              onRemove={removeShop}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Extracted so the per-row hook call doesn't violate rules-of-hooks when shop count changes.
function TribeShopRow({
  shop, ownerName, canRemove, isRemoving, onBan, onRemove,
}: {
  shop: ShopEntry;
  ownerName: string | undefined;
  canRemove: boolean;
  isRemoving: boolean;
  onBan: (addr: string) => void;
  onRemove: (shopId: string, recipientCharacterId: string, shopOwner: string) => void;
}) {
  const { characterId: recipientCharacterId, isLoading: recipientLoading } =
    useRecipientCharacter(shop.owner, SSU_OBJECT_ID);
  return (
    <tr>
      <td>{shop.title}</td>
      <td>
        <span className={`badge badge--${shop.kind.toLowerCase()}`}>{shop.kind}</span>
      </td>
      <td>
        <button className="btn--link" onClick={() => onBan(shop.owner)}>
          {ownerName ? (
            <>
              <span>{ownerName}</span>
              <span className="muted" style={{ fontSize: "0.75rem", marginLeft: "0.35rem" }}>
                {abbreviateAddress(shop.owner)}
              </span>
            </>
          ) : (
            abbreviateAddress(shop.owner)
          )}
        </button>
      </td>
      <td>
        <button
          className="btn btn--danger btn--sm"
          disabled={!canRemove || isRemoving || recipientLoading || !recipientCharacterId}
          title={!canRemove ? "Tribe cap required to force-remove shops" : undefined}
          onClick={() => onRemove(shop.id, recipientCharacterId!, shop.owner)}
        >
          {isRemoving ? "..." : canRemove ? "Remove" : "No cap"}
        </button>
      </td>
    </tr>
  );
}

// ── TribeBanListView ───────────────────────────────────────────────────────────

// Phase 8 Wave A2 (AUD-ET-19): renders the V35 timed-ban table (useTribeBanList
// shape) and unbans via the tier-dispatched tribe_unban_as_* entries — the old
// BanListView read SSU booleans (always empty) and unbanned via the V35-deleted
// set_tribe_ban (always aborted).
export interface TribeBanListViewProps {
  bans: Array<{ address: string; expiresAtMs: number | null; isExpired: boolean }>;
  tier:       TribeCapTier;
  tierCapId:  string;
  tribeGovId: string | null;
  onRefresh:  () => void;
}

export function TribeBanListView({ bans, tier, tierCapId, tribeGovId, onRefresh }: TribeBanListViewProps) {
  const [unbanning, setUnbanning] = useState<string | null>(null);

  async function handleUnban(address: string) {
    if (!tierCapId || !tribeGovId) return;
    setUnbanning(address);
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildTribeUnbanAs({
          capTier:    tier,
          capId:      tierCapId,
          tribeGovId,
          target:     address,
        }),
      });
      onRefresh();
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setUnbanning(null);
    }
  }

  if (bans.length === 0) {
    return <p className="muted">No banned players.</p>;
  }

  return (
    <div>
      <h3 style={{ marginBottom: "0.75rem" }}>Banned Players ({bans.length})</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Address</th>
            <th>Expires</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {bans.map(b => (
            <tr key={b.address}>
              <td>{abbreviateAddress(b.address)}</td>
              <td>
                {b.expiresAtMs === null
                  ? <span style={{ color: "var(--danger, #c84b4b)" }}>Permanent</span>
                  : b.isExpired
                    ? <span className="muted">Expired ({new Date(b.expiresAtMs).toLocaleString()})</span>
                    : new Date(b.expiresAtMs).toLocaleString()
                }
              </td>
              <td>
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={!tierCapId || !tribeGovId || unbanning === b.address}
                  title={!tribeGovId ? "No tribe governance resolved" : undefined}
                  onClick={() => handleUnban(b.address)}
                >
                  {unbanning === b.address ? "..." : "Unban"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── ForceCloseTab ─────────────────────────────────────────────────────────────

export interface ForceCloseTabProps {
  capType:          "owner" | "superadmin" | "admin" | "mod";
  superAdminCapId?: string;
  adminCapId?:      string;
  modCapId?:        string;
}

export function ForceCloseTab({ capType, superAdminCapId, adminCapId, modCapId }: ForceCloseTabProps) {
  const [forceShopId,           setForceShopId]           = useState("");
  const [forceRecipientCharId,  setForceRecipientCharId]  = useState("");
  const [loading,               setLoading]               = useState(false);
  const { leaderTribeIdx, superAdminTribeIdx } = useTribeCaps();
  const { tribes } = useTribeRegistry();

  const govTribeIdx = leaderTribeIdx ?? superAdminTribeIdx ?? null;
  const tribeGovId  = govTribeIdx !== null
    ? (tribes.find(t => t.idx === govTribeIdx)?.tribeGovId ?? "")
    : "";
  const { data: shared } = useSSUSharedObjects(SSU_OBJECT_ID || null);

  const effectiveCapId = superAdminCapId ?? adminCapId ?? modCapId;
  const canAct         = !!effectiveCapId && !!tribeGovId;

  async function handleForceClose() {
    if (!canAct || !forceShopId.trim() || !forceRecipientCharId.trim()) return;
    const shopId              = forceShopId.trim();
    const recipientCharacterId = forceRecipientCharId.trim();
    const ssuId               = SSU_OBJECT_ID;
    const wtbEscrowPoolId     = shared?.wtbEscrowPoolId ?? "";
    if (!wtbEscrowPoolId) { alert("Resolving SSU shared objects — please try again."); return; }
    setLoading(true);
    try {
      if (superAdminCapId && tribeGovId) {
        await dAppKit.signAndExecuteTransaction({
          transaction: buildForceCloseShopAsTribeSuperAdmin({
            superAdminCapId, shopId, ssuGovId: SSU_OBJECT_ID, tribeGovId,
            ssuId, recipientCharacterId, wtbEscrowPoolId,
          }),
        });
      } else if (adminCapId && tribeGovId) {
        await dAppKit.signAndExecuteTransaction({
          transaction: buildForceCloseShopAsTribeAdmin({
            adminCapId, shopId, ssuGovId: SSU_OBJECT_ID, tribeGovId,
            ssuId, recipientCharacterId, wtbEscrowPoolId,
          }),
        });
      } else if (modCapId && tribeGovId) {
        await dAppKit.signAndExecuteTransaction({
          transaction: buildForceCloseShopAsTribeMod({
            modCapId, shopId, ssuGovId: SSU_OBJECT_ID, tribeGovId,
            ssuId, recipientCharacterId, wtbEscrowPoolId,
          }),
        });
      }
      setForceShopId("");
      setForceRecipientCharId("");
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="action-card action-card--danger">
      <h4>Force Remove Shop (Tribe Authority)</h4>
      <p className="muted" style={{ fontSize: "0.75rem" }}>
        Closes a shop regardless of owner consent. Items remain as unclaimed in the vault.
        Requires a tribe governance cap. Tier used:{" "}
        <strong>
          {superAdminCapId ? "SuperAdmin" : adminCapId ? "Admin" : modCapId ? "Mod" : "None"}
        </strong>.
        {!canAct && (
          <span style={{ color: "var(--danger)", display: "block", marginTop: "0.25rem" }}>
            No tribe governance cap detected. Contact your tribe leader.
          </span>
        )}
      </p>
      <div className="form-row">
        <input
          className="input"
          value={forceShopId}
          onChange={e => setForceShopId(e.target.value)}
          placeholder="Shop address / object ID 0x..."
          disabled={!canAct}
        />
        <input
          className="input"
          value={forceRecipientCharId}
          onChange={e => setForceRecipientCharId(e.target.value)}
          placeholder="Recipient character object ID 0x..."
          disabled={!canAct}
        />
        <button
          className="btn btn--danger btn--sm"
          disabled={!canAct || loading || !forceShopId.trim() || !forceRecipientCharId.trim()}
          onClick={handleForceClose}
        >
          {loading ? "..." : "Force Remove"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
