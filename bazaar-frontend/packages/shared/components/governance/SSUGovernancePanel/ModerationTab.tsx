// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ModerationTab — R6.6.4b OS-32
 *
 * SSUModerationTab orchestrator + 2 sub-tabs:
 *   SSUShopsSubTab   — shop list with cap-tier force-remove
 *   SSUBansSubTab    — SSU-local ban management
 *
 * Verbatim from Bazar1 SSUGovernancePanel.tsx lines 300-675 with:
 *   - buildSSUBan → buildSSUBanAs (object-keyed, ssuGovId via useSSUGovId)
 *   - buildSSUUnban → buildSSUUnbanAs (object-keyed)
 *   - buildSSURemoveShop → buildForceCloseShop (cap-tier dispatch)
 *   - ssuId passed to useSSUGovId to resolve SSUGovernance shared object ID
 *
 * OS-40 (resolved): cap-tier dispatch lives in SSUShopsSubTab.removeShop.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { dAppKit, abbreviateAddress, useConnection } from "@evefrontier/dapp-kit";
import { buildSSUBanAs, buildSSUUnbanAs } from "@bazaar/shared/tx/bazaarcore/ssu-ban-tx";
import { buildForceCloseShop } from "@bazaar/shared/tx/bazaarcore/ssu-governance-tx";
import {
  buildForceCloseShopAsSuperAdmin,
  buildForceCloseShopAsAdmin,
  buildForceCloseShopAsMod,
} from "@bazaar/shared/tx/bazaarcore/shop-moderation-tx";
import { buildCloseShop } from "@bazaar/shared/tx/bazaarcore/shop-tx";
import { useSSUGovId, useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useRecipientCharacter } from "@bazaar/shared/hooks/bazaarcore/identity-hooks";
import { useSSUGovernance } from "@bazaar/shared/hooks/useSSUGovernance";
import { useCharacterOwnerCapRef } from "@bazaar/shared/hooks/useCharacterOwnerCapRef";
import { useIsSSUOwner, useSSUOwnerCapRef } from "@bazaar/shared/hooks";
import { AddressInput } from "@bazaar/shared/components";
import { BanControl, formatBanExpiry, isPermanentBan } from "../BanControl";
import type { ModSubTab } from "./util";
import type { Shop } from "@bazaar/shared/types";

// ── SSUModerationTab ──────────────────────────────────────────────────────────

interface SSUModerationTabProps {
  ssuId: string;
  capId: string;
  capType: "owner" | "super_admin" | "admin" | "mod";
  localBanList: Map<string, number>;
  ssuShops: Shop[];
  maxShopsOverride: number | null;
  characterNames: Map<string, string>;
  /** ssuGovId — SSUGovernance shared object ID; required by cap-tier OS-40 dispatchers. */
  ssuGovId: string;
  onRefetch: () => void;
}

export function SSUModerationTab({
  ssuId, capId, capType, localBanList, ssuShops, maxShopsOverride, characterNames, ssuGovId, onRefetch,
}: SSUModerationTabProps) {
  const [subTab, setSubTab] = useState<ModSubTab>("shops");

  const bannedEntries = Array.from(localBanList.entries());

  return (
    <div className="panel__section">
      {/* ── Sub-tab bar ── */}
      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {(["shops", "bans"] as ModSubTab[]).map(st => (
          <button
            key={st}
            className={`btn btn--sm ${subTab === st ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setSubTab(st)}
          >
            {st === "shops"
              ? `Shops (${ssuShops.length}${maxShopsOverride !== null ? ` / ${maxShopsOverride}` : ""})`
              : `Ban List (${bannedEntries.length})`}
          </button>
        ))}
      </div>

      {subTab === "shops" && (
        <SSUShopsSubTab
          ssuId={ssuId}
          capId={capId}
          capType={capType}
          ssuShops={ssuShops}
          characterNames={characterNames}
          ssuGovId={ssuGovId}
          onRefetch={onRefetch}
        />
      )}

      {subTab === "bans" && (
        <SSUBansSubTab
          ssuId={ssuId}
          capId={capId}
          capType={capType}
          bannedEntries={bannedEntries}
          characterNames={characterNames}
          onRefetch={onRefetch}
        />
      )}

    </div>
  );
}

// ── SSUShopsSubTab ─────────────────────────────────────────────────────────────

interface SSUShopsSubTabProps {
  ssuId: string;
  capId: string;
  capType: "owner" | "super_admin" | "admin" | "mod";
  ssuShops: Shop[];
  characterNames: Map<string, string>;
  ssuGovId: string;
  onRefetch: () => void;
}

function SSUShopsSubTab({ ssuId, capId, capType, ssuShops, characterNames, ssuGovId, onRefetch }: SSUShopsSubTabProps) {
  const [loading, setLoading] = useState("");
  const { data: shared } = useSSUSharedObjects(ssuId);
  // SSU-owner-owned shops are exempt from admin force-close by design
  // (shop_moderation::force_close_shop_internal aborts E_CANNOT_FORCE_CLOSE_SSU_OWNER_SHOP=20).
  // When the clicking wallet IS the SSU owner AND the shop is theirs, we
  // transparently auto-route to `bazar_close::close_shop_as_ssu_owner` so
  // the Remove button "just works" — items return to Main Storage, EVE
  // returns to the owner wallet (which is the SSU owner = same wallet).
  const { ssuOwner } = useSSUGovernance(ssuId);
  const { walletAddress } = useConnection();
  const { characterId, charCapRef } = useCharacterOwnerCapRef(walletAddress ?? undefined, ssuId);
  const { data: isSSUOwner } = useIsSSUOwner(ssuGovId);
  const { ref: ssuOwnerCapRef } = useSSUOwnerCapRef(isSSUOwner, characterId, ssuId);

  async function removeShop(shopId: string, recipientCharacterId: string, shopOwner: string) {
    if (!shopId || !capId) return;
    const wtbEscrowPoolId = shared?.wtbEscrowPoolId ?? "";
    if (!wtbEscrowPoolId) { alert("Resolving SSU shared objects — please try again."); return; }

    // SSU-owner self-close routing: clicker = shop owner = SSU owner.
    // Use the regular close path (Main Storage), not force-close (would abort 20).
    const isSelfSsuOwnerClose =
      !!walletAddress && walletAddress === shopOwner && walletAddress === ssuOwner;
    if (isSelfSsuOwnerClose) {
      if (!characterId || !charCapRef || !ssuOwnerCapRef) {
        alert("Resolving SSU owner cap — please try again in a moment.");
        return;
      }
      setLoading(`remove-${shopId}`);
      try {
        const tx = buildCloseShop({
          shopId,
          ssuGovId,
          ssuId,
          characterId,
          wtbEscrowPoolId,
          charCapRef,
          ssuOwnerCapRef,
        });
        await dAppKit.signAndExecuteTransaction({ transaction: tx });
        onRefetch();
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : "Transaction failed");
      } finally {
        setLoading("");
      }
      return;
    }

    setLoading(`remove-${shopId}`);
    try {
      let tx: Transaction | undefined;
      switch (capType) {
        case "owner":
          tx = buildForceCloseShop({
            ownerCapId: capId, shopId, ssuGovId,
            ssuId, recipientCharacterId, wtbEscrowPoolId,
          });
          break;
        case "super_admin":
          tx = buildForceCloseShopAsSuperAdmin({
            superAdminCapId: capId, shopId, ssuGovId,
            ssuId, recipientCharacterId, wtbEscrowPoolId,
          });
          break;
        case "admin":
          tx = buildForceCloseShopAsAdmin({
            adminCapId: capId, shopId, ssuGovId,
            ssuId, recipientCharacterId, wtbEscrowPoolId,
          });
          break;
        case "mod":
          tx = buildForceCloseShopAsMod({
            modCapId: capId, shopId, ssuGovId,
            ssuId, recipientCharacterId, wtbEscrowPoolId,
          });
          break;
        default:
          throw new Error(`unsupported capType: ${capType as string}`);
      }
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      onRefetch();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading("");
    }
  }

  if (ssuShops.length === 0) {
    return <p className="muted" style={{ fontSize: "0.78rem" }}>No shops found at this SSU.</p>;
  }

  return (
    <div className="action-card">
      <h4>Shops at This SSU ({ssuShops.length})</h4>
      <p className="muted" style={{ fontSize: "0.78rem" }}>
        Force-remove returns escrowed funds and items to the shop owner.
      </p>
      <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
        <table className="table" style={{ fontSize: "0.78rem" }}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Kind</th>
              <th>Owner</th>
              <th>Remove</th>
            </tr>
          </thead>
          <tbody>
            {ssuShops.map(shop => (
              <ShopRow
                key={shop.id}
                shop={shop}
                ssuId={ssuId}
                capId={capId}
                ssuGovId={ssuGovId}
                loading={loading}
                ownerName={characterNames.get(shop.owner)}
                onRemove={removeShop}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Extracted so the per-row hook call doesn't violate rules-of-hooks when shop count changes.
function ShopRow({
  shop, ssuId, capId, ssuGovId, loading, ownerName, onRemove,
}: {
  shop: Shop;
  ssuId: string;
  capId: string;
  ssuGovId: string;
  loading: string;
  ownerName: string | undefined;
  onRemove: (shopId: string, recipientCharacterId: string, shopOwner: string) => void;
}) {
  const { characterId: recipientCharacterId, isLoading: recipientLoading } =
    useRecipientCharacter(shop.owner, ssuId);
  return (
    <tr>
      <td style={{ maxWidth: "9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {shop.title}
      </td>
      <td>
        <span className={`shop-kind shop-kind--${shop.kind.toLowerCase()}`}>{shop.kind}</span>
      </td>
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
          {ownerName && (
            <span style={{ fontSize: "0.75rem", color: "var(--accent2)" }}>{ownerName}</span>
          )}
          <span className="muted" style={{ fontSize: "0.72rem" }} title={shop.owner}>
            {abbreviateAddress(shop.owner)}
          </span>
        </div>
      </td>
      <td>
        <button
          className="btn btn--danger btn--sm"
          disabled={!capId || !!loading || !ssuGovId || recipientLoading || !recipientCharacterId}
          onClick={() => onRemove(shop.id, recipientCharacterId!, shop.owner)}
        >
          {loading === `remove-${shop.id}` ? "..." : "Remove"}
        </button>
      </td>
    </tr>
  );
}

// ── SSUBansSubTab ─────────────────────────────────────────────────────────────

interface SSUBansSubTabProps {
  ssuId: string;
  capId: string;
  capType: "owner" | "super_admin" | "admin" | "mod";
  bannedEntries: [string, number][];
  characterNames: Map<string, string>;
  onRefetch: () => void;
}

function SSUBansSubTab({ ssuId, capId, capType, bannedEntries, characterNames, onRefetch }: SSUBansSubTabProps) {
  const [banTarget, setBanTarget] = useState("");
  const [loading, setLoading] = useState("");

  // Resolve SSUGovernance shared object ID for ban/unban TX builders
  const { data: ssuGovId } = useSSUGovId(ssuId);

  async function unbanPlayer(address: string) {
    if (!capId || !ssuGovId) return;
    setLoading(`unban-${address}`);
    try {
      await dAppKit.signAndExecuteTransaction({
        transaction: buildSSUUnbanAs({
          capTier: capType,
          capId,
          ssuGovId,
          target: address,
        }),
      });
      onRefetch();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading("");
    }
  }

  return (
    <div>
      {/* ── Ban form ── */}
      <div className="action-card" style={{ marginBottom: "1rem" }}>
        <h4>Ban Player at This SSU</h4>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          SSU-local ban prevents access at this SSU only. Global bans are managed in Global Governance.
        </p>
        <div className="form-row">
          <AddressInput value={banTarget} onChange={setBanTarget} placeholder="Player address 0x..." />
        </div>
        {banTarget && (
          <BanControl
            targetLabel={characterNames.get(banTarget) ?? abbreviateAddress(banTarget)}
            disabled={!capId || !ssuGovId}
            onBan={async (expiresAtMs) => {
              if (!ssuGovId) throw new Error("Resolving SSU governance — please try again.");
              await dAppKit.signAndExecuteTransaction({
                transaction: buildSSUBanAs({ capTier: capType, capId, ssuGovId, target: banTarget, expiresAtMs }),
              });
              setBanTarget("");
              onRefetch();
            }}
          />
        )}
      </div>

      {/* ── Ban list ── */}
      <div className="action-card">
        <h4>Local Ban List ({bannedEntries.length})</h4>
        {bannedEntries.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.78rem" }}>No local bans active.</p>
        ) : (
          <table className="table" style={{ fontSize: "0.78rem" }}>
            <thead>
              <tr>
                <th>Player</th>
                <th>Expires</th>
                <th>Unban</th>
              </tr>
            </thead>
            <tbody>
              {bannedEntries.map(([addr, expiry]) => {
                const charName = characterNames.get(addr);
                return (
                  <tr key={addr}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                        {charName && (
                          <span style={{ fontSize: "0.75rem", color: "var(--accent2)" }}>{charName}</span>
                        )}
                        <span className="muted" title={addr}>{abbreviateAddress(addr)}</span>
                      </div>
                    </td>
                    <td>
                      {isPermanentBan(expiry)
                        ? <span className="muted">Permanent</span>
                        : formatBanExpiry(expiry)}
                    </td>
                    <td>
                      <button
                        className="btn btn--outline btn--sm"
                        disabled={!!loading || !ssuGovId}
                        onClick={() => unbanPlayer(addr)}
                      >
                        {loading === `unban-${addr}` ? "..." : "Unban"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
