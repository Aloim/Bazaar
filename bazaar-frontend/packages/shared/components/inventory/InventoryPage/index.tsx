// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/InventoryPage.tsx (lines 1-608; split for 500-line guard, section: InventoryPage main shell).
// InventoryRow extracted to ./InventoryRow.tsx.

import { useState, useMemo, useEffect, useCallback } from "react";
import { dAppKit, abbreviateAddress, useConnection } from "@evefrontier/dapp-kit";
import { useOwnedInventory } from "@bazaar/shared/hooks";
import { useItemTypes } from "@bazaar/shared/hooks";
import { useUserStorage } from "@bazaar/shared/hooks";
import { usePlayerCharacter } from "@bazaar/shared/hooks";
import { useUnclaimedItems } from "@bazaar/shared/hooks";
import { useShops } from "@bazaar/shared/hooks";
import { buildClaimUnclaimedItem } from "@bazaar/shared/tx";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useSSUCaps } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import type { OwnedInventoryItem, InventorySortKey, Screen } from "@bazaar/shared/types";
import { InventoryRow } from "./InventoryRow";
import GlobalInventoryTab from "../GlobalInventoryTab";

interface Props {
  nav: (s: Screen) => void;
  onClose?: () => void;
}

interface ContextMenuState { x: number; y: number; item: OwnedInventoryItem; }
interface WithdrawModalState { item: OwnedInventoryItem; itemName: string; }

export default function InventoryPage({ nav, onClose }: Props) {
  const { walletAddress } = useConnection();
  const { shops } = useShops();
  const availableSsuIds = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    if (SSU_OBJECT_ID) { seen.add(SSU_OBJECT_ID); ordered.push(SSU_OBJECT_ID); }
    for (const s of shops) {
      if (s.ssuId && !seen.has(s.ssuId)) { seen.add(s.ssuId); ordered.push(s.ssuId); }
    }
    return ordered;
  }, [shops]);

  const [view, setView] = useState<"this" | "global">("this");
  const [selectedSsuId, setSelectedSsuId] = useState<string>(SSU_OBJECT_ID);
  const { items, isLoading, error, refetch } = useOwnedInventory(selectedSsuId || undefined);
  const { usedVolume, volumeLimit } = useUserStorage();
  const { character } = usePlayerCharacter();
  const { items: unclaimedItems, isLoading: unclaimedLoading, error: unclaimedError, refetch: refetchUnclaimed } = useUnclaimedItems(selectedSsuId);

  // Resolve userStorageId for the selected SSU (needed by claim builders).
  const { data: sharedObjs } = useSSUSharedObjects(selectedSsuId || null);
  const userStorageId = sharedObjs?.userStorageId ?? null;

  // Label-only branch: "Main Storage" for SSU owner, "Personal Locker" otherwise.
  const { data: capsData } = useSSUCaps(walletAddress ?? null, selectedSsuId || null);
  const storageLabel = capsData?.hasSSUOwnerCap ? "Main Storage" : "Personal Locker";

  const typeIds = useMemo(
    () => [...new Set([...items.map(i => i.typeId), ...unclaimedItems.map(i => i.typeId)])],
    [items, unclaimedItems],
  );
  const typeInfo = useItemTypes(typeIds);

  const [search,  setSearch]  = useState("");
  const [sortKey, setSortKey] = useState<InventorySortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [claimingTypeId,   setClaimingTypeId]   = useState<number | null>(null);
  const [claimAllLoading,  setClaimAllLoading]  = useState(false);
  const [claimError,       setClaimError]       = useState<string | null>(null);
  const [contextMenu,   setContextMenu]   = useState<ContextMenuState | null>(null);
  const [withdrawModal, setWithdrawModal] = useState<WithdrawModalState | null>(null);
  const [withdrawQty,   setWithdrawQty]   = useState(1);

  function itemName(typeId: number): string { return typeInfo.get(typeId)?.name ?? `#${typeId}`; }

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(item => {
      const name = itemName(item.typeId).toLowerCase();
      return name.includes(q) || String(item.typeId).includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, typeInfo]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = itemName(a.typeId).localeCompare(itemName(b.typeId));
      else diff = a.quantity - b.quantity;
      return sortAsc ? diff : -diff;
    });
    return copy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortAsc, typeInfo]);

  function handleSort(key: InventorySortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const sortLabel = (key: InventorySortKey) => {
    if (sortKey !== key) return key.charAt(0).toUpperCase() + key.slice(1);
    return `${key.charAt(0).toUpperCase() + key.slice(1)} ${sortAsc ? "▲" : "▼"}`;
  };

  const volumePct = volumeLimit > 0 ? Math.min(100, Math.round((usedVolume / volumeLimit) * 100)) : 0;
  const totalItems  = items.length;
  const lockedCount = items.filter(i => i.lockedQuantity > 0).length;

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") closeContextMenu(); }
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", closeContextMenu);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", closeContextMenu);
    };
  }, [contextMenu, closeContextMenu]);

  function handleRowContextMenu(e: React.MouseEvent, item: OwnedInventoryItem) {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  }

  function openWithdrawModal(item: OwnedInventoryItem) {
    closeContextMenu();
    const name = typeInfo.get(item.typeId)?.name ?? `#${item.typeId}`;
    const available = item.quantity - item.lockedQuantity;
    setWithdrawQty(available > 0 ? available : 0);
    setWithdrawModal({ item, itemName: name });
  }

  function handleWithdrawConfirm() {
    if (!withdrawModal) return;
    const { item, itemName } = withdrawModal;
    const available = item.quantity - item.lockedQuantity;
    if (withdrawQty < 1 || withdrawQty > available) return;
    alert(`Items in your locker are already accessible. Close the shop locking "${itemName}" to release it.`);
    setWithdrawModal(null);
  }

  async function handleClaim(typeId: number, quantity: number) {
    if (!character) { setClaimError("Character not resolved. Connect your wallet and try again."); return; }
    if (!userStorageId) { setClaimError("Storage not resolved yet. Please wait and retry."); return; }
    const unclaimed = unclaimedItems.find(i => i.typeId === typeId);
    if (!unclaimed) { setClaimError("Unclaimed item not found."); return; }
    setClaimingTypeId(typeId); setClaimError(null);
    try {
      const tx = buildClaimUnclaimedItem(userStorageId, unclaimed.shopId);
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      refetchUnclaimed(); refetch();
    } catch (e: unknown) {
      setClaimError(e instanceof Error ? e.message : "Claim transaction failed.");
    } finally { setClaimingTypeId(null); }
  }

  async function handleClaimAll() {
    if (!character) { setClaimError("Character not resolved. Connect your wallet and try again."); return; }
    if (!userStorageId) { setClaimError("Storage not resolved yet. Please wait and retry."); return; }
    if (unclaimedItems.length === 0) return;
    setClaimAllLoading(true); setClaimError(null);
    try {
      for (const item of unclaimedItems) {
        const tx = buildClaimUnclaimedItem(userStorageId, item.shopId);
        await dAppKit.signAndExecuteTransaction({ transaction: tx });
      }
      refetchUnclaimed(); refetch();
    } catch (e: unknown) {
      setClaimError(e instanceof Error ? e.message : "Claim All transaction failed.");
    } finally { setClaimAllLoading(false); }
  }

  return (
    <div className="inventory-page">
      <div className="panel__header">
        <button className="btn btn--ghost btn--sm" onClick={() => onClose ? onClose() : nav("landing")}>Back</button>
        <h2>{storageLabel}</h2>
        <button className="btn btn--ghost btn--sm" onClick={refetch} title="Refresh inventory">Refresh</button>
      </div>

      <div className="inventory-page__body">
        <div className="inventory-view-toggle" style={{ display: "flex", gap: "0.35rem", marginBottom: "0.6rem" }}>
          <button className={`btn btn--sm ${view === "this" ? "btn--primary" : "btn--ghost"}`} onClick={() => setView("this")}>This SSU</button>
          <button className={`btn btn--sm ${view === "global" ? "btn--primary" : "btn--ghost"}`} onClick={() => setView("global")} title="Your lockers across every bazaar SSU">Global</button>
        </div>
        {view === "global" ? (
          <GlobalInventoryTab />
        ) : (
        <>
        {availableSsuIds.length > 1 && (
          <div className="inventory-ssu-select" style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="muted" style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>SSU:</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              {availableSsuIds.map(id => {
                const isCurrent = id === SSU_OBJECT_ID;
                const label = isCurrent ? `${abbreviateAddress(id)} (this SSU)` : abbreviateAddress(id);
                return (
                  <button key={id} className={`btn btn--sm ${selectedSsuId === id ? "btn--primary" : "btn--ghost"}`}
                    onClick={() => setSelectedSsuId(id)} title={id} style={{ fontSize: "0.78rem" }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {volumeLimit > 0 && (
          <div className="volume-bar-section">
            <div className="volume-bar"><div className="volume-bar__fill" style={{ width: `${volumePct}%` }} /></div>
            <div className="volume-bar__label">
              <span>Volume used</span>
              <span>{usedVolume.toLocaleString()} / {volumeLimit.toLocaleString()} units<span className="volume-bar__pct"> ({volumePct}%)</span></span>
            </div>
          </div>
        )}

        {(unclaimedItems.length > 0 || unclaimedError) && (
          <div className="unclaimed-section">
            {unclaimedError ? (
              <p className="error-text" style={{ padding: "0.5rem" }}>{unclaimedError}</p>
            ) : (
              <>
                <div className="unclaimed-banner" style={{ background: "rgba(204, 112, 0, 0.12)", border: "1px solid var(--accent, #cc7000)", borderRadius: 4, padding: "0.6rem 1rem", marginBottom: "0.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                  <span style={{ fontWeight: 600 }}>
                    You have {unclaimedItems.length} unclaimed item type{unclaimedItems.length !== 1 ? "s" : ""}! Free up locker space and claim them.
                  </span>
                  <button className="btn btn--primary btn--sm" disabled={claimAllLoading || !character} onClick={handleClaimAll} title={!character ? "Wallet not connected" : undefined}>
                    {claimAllLoading ? "Claiming..." : "Claim All"}
                  </button>
                </div>
                {claimError && <p className="error-text" style={{ marginBottom: "0.5rem", fontSize: "0.85rem" }}>{claimError}</p>}
                <table className="table" style={{ marginBottom: "1rem" }}>
                  <thead><tr><th>Item</th><th>Qty</th><th>Claim Deadline</th><th></th></tr></thead>
                  <tbody>
                    {unclaimedItems.map(item => {
                      const name = typeInfo.get(item.typeId)?.name ?? `#${item.typeId}`;
                      const isClaiming = claimingTypeId === item.typeId;
                      const expiryMs = item.expiryMs;
                      const now = Date.now();
                      const expired = expiryMs > 0 && now >= expiryMs;
                      const remainMs = expiryMs > 0 ? expiryMs - now : 0;
                      const remainDays = Math.floor(remainMs / 86_400_000);
                      const remainHrs = Math.floor((remainMs % 86_400_000) / 3_600_000);
                      const expiryLabel = expiryMs === 0 ? "No deadline" : expired ? "EXPIRED — subject to confiscation" : `${remainDays}d ${remainHrs}h remaining`;
                      return (
                        <tr key={item.typeId} style={expired ? { background: "rgba(255,60,60,0.08)" } : undefined}>
                          <td>{name}</td>
                          <td>{item.quantity.toLocaleString()}</td>
                          <td className={expired ? "error-text" : "muted"} style={{ fontSize: "0.85rem" }}>{expiryLabel}</td>
                          <td>
                            <button className="btn btn--primary btn--sm" disabled={isClaiming || claimAllLoading || !character} onClick={() => handleClaim(item.typeId, item.quantity)} title={!character ? "Wallet not connected" : undefined}>
                              {isClaiming ? "Claiming..." : "Claim"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {unclaimedLoading && unclaimedItems.length === 0 && (
          <p className="muted" style={{ fontSize: "0.8rem", padding: "0.25rem 0" }}>Checking for unclaimed items...</p>
        )}

        <div className="inventory-stats-row">
          <span className="muted">{totalItems} item type{totalItems !== 1 ? "s" : ""}</span>
          {lockedCount > 0 && <span className="muted"> · {lockedCount} locked</span>}
        </div>

        <div className="inventory-controls">
          <input className="input inventory-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..." />
          <div className="inventory-sort">
            <span className="muted" style={{ fontSize: "0.8rem" }}>Sort:</span>
            {(["name", "quantity"] as InventorySortKey[]).map(key => (
              <button key={key} className={`btn btn--ghost btn--sm ${sortKey === key ? "inventory-sort__btn--active" : ""}`} onClick={() => handleSort(key)}>
                {sortLabel(key)}
              </button>
            ))}
          </div>
        </div>

        {isLoading && <p className="muted" style={{ padding: "2rem", textAlign: "center" }}>Loading inventory...</p>}
        {!isLoading && error && <p className="error-text" style={{ padding: "1rem" }}>{error}</p>}
        {!isLoading && !error && sorted.length === 0 && (
          <p className="muted" style={{ padding: "2rem", textAlign: "center" }}>{search ? "No items match your search." : "Your inventory is empty."}</p>
        )}
        {!isLoading && !error && sorted.length > 0 && (
          <div className="inventory-grid">
            <table className="table">
              <thead>
                <tr>
                  <th className="inventory-grid__th--sortable" onClick={() => handleSort("name")} title="Sort by name">Item Name {sortKey === "name" ? (sortAsc ? "▲" : "▼") : ""}</th>
                  <th className="inventory-grid__th--sortable" onClick={() => handleSort("quantity")} title="Sort by quantity">Qty {sortKey === "quantity" ? (sortAsc ? "▲" : "▼") : ""}</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(item => (
                  <InventoryRow key={item.typeId} item={item} name={itemName(item.typeId)} iconUrl={typeInfo.get(item.typeId)?.iconUrl} onContextMenu={handleRowContextMenu} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>
        )}
      </div>

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
          {contextMenu.item.lockedQuantity > 0 && contextMenu.item.lockedQuantity >= contextMenu.item.quantity ? (
            <button className="context-menu__item" onClick={() => openWithdrawModal(contextMenu.item)}>View Lock Info</button>
          ) : (
            <button className="context-menu__item context-menu__item--disabled" disabled title="Items in your locker are accessible.">In Locker (accessible)</button>
          )}
        </div>
      )}

      {withdrawModal && (() => {
        const { item, itemName } = withdrawModal;
        const available = item.quantity - item.lockedQuantity;
        const fullyLocked = item.lockedQuantity >= item.quantity;
        const shopLabel = item.lockingShopTitle ?? item.lockingShopId ?? "an active shop";
        return (
          <div className="modal-overlay" onClick={() => setWithdrawModal(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal__header">
                <h3>Withdraw — {itemName}</h3>
                <button className="btn btn--ghost btn--sm" onClick={() => setWithdrawModal(null)}>Close</button>
              </div>
              {fullyLocked ? (
                <div style={{ background: "rgba(204, 112, 0, 0.08)", border: "1px solid var(--accent)", borderRadius: 4, padding: "0.75rem 1rem", fontSize: "0.85rem", lineHeight: 1.6 }}>
                  <p>All {item.quantity.toLocaleString()} units of this item are locked by <strong>{shopLabel}</strong>.</p>
                  <p style={{ marginTop: "0.4rem", color: "var(--muted)" }}>Close or edit the shop to release the lock before withdrawing.</p>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Quantity (max: {available.toLocaleString()})</label>
                    <input className="input" type="number" min={1} max={available} value={withdrawQty}
                      onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setWithdrawQty(Math.min(Math.max(1, v), available)); }} />
                    {item.lockedQuantity > 0 && (
                      <p className="muted" style={{ fontSize: "0.78rem" }}>{item.lockedQuantity.toLocaleString()} unit{item.lockedQuantity !== 1 ? "s" : ""} locked by {shopLabel}.</p>
                    )}
                  </div>
                  <div className="modal__actions">
                    <button className="btn btn--ghost btn--sm" onClick={() => setWithdrawModal(null)}>Cancel</button>
                    <button className="btn btn--primary btn--sm" disabled={withdrawQty < 1 || withdrawQty > available} onClick={handleWithdrawConfirm}>
                      Withdraw {withdrawQty.toLocaleString()}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
