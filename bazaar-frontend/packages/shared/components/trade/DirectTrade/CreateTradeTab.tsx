// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/DirectTrade.tsx (lines 111-659; split for 500-line guard, section: CreateTradeTab).
// Re-imported into ./index.tsx.

import { useState, useRef, useEffect, useMemo } from "react";
import { useGatedTransaction } from "@bazaar/shared/hooks/announcements";
import { useOwnedInventory } from "@bazaar/shared/hooks";
import { useSSUInventory } from "@bazaar/shared/hooks";
import { useCharacterForAddress } from "@bazaar/shared/hooks";
import { useBalances } from "@bazaar/shared/hooks";
import { useItemTypes } from "@bazaar/shared/hooks";
import { useSSURoleList } from "@bazaar/shared/hooks";
import { useCharacterNames } from "@bazaar/shared/hooks";
import { useClaimBoxContext } from "@bazaar/shared/contexts";
import { useRoles } from "@bazaar/shared/hooks";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useBazaarType } from "@bazaar/shared/hooks/useBazaarType";
import { maybeRegisterStranger } from "@bazaar/shared/tx";
import { resolveSSUOwnerCap } from "@bazaar/shared/tx";
import { buildCreateTradeProposal } from "@bazaar/shared/tx/bazaarcore/trade-tx";
import { Transaction } from "@mysten/sui/transactions";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { COIN_DECIMALS, SSU_OBJECT_ID } from "@bazaar/shared/constants";
import type { OwnedInventoryItem } from "@bazaar/shared/types";
import type { WantItem, GiveItem } from "./trade-types";

interface CreateTradeTabProps {
  myAddress: string;
  onSuccess: () => void;
}

export default function CreateTradeTab({ myAddress, onSuccess }: CreateTradeTabProps) {
  const { signGated } = useGatedTransaction();
  const { currencyName } = useClaimBoxContext();
  const displayCurrency = currencyName || "EVE";

  const [counterparty,    setCounterparty]    = useState("");
  const [nameQuery,       setNameQuery]       = useState("");
  const [dropdownOpen,    setDropdownOpen]    = useState(false);
  const [highlightIndex,  setHighlightIndex]  = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);

  const { entries: roleEntries } = useSSURoleList(SSU_OBJECT_ID || null);
  const knownAddresses = useMemo(() => roleEntries.map(e => e.address), [roleEntries]);
  const characterNames = useCharacterNames(knownAddresses);

  const knownUsers = useMemo(() => {
    return knownAddresses
      .map(addr => ({ address: addr, name: characterNames.get(addr) ?? "" }))
      .filter(u => u.name.length > 0);
  }, [knownAddresses, characterNames]);

  const suggestions = useMemo(() => {
    if (nameQuery.trim().length === 0) return [];
    const lower = nameQuery.toLowerCase();
    return knownUsers.filter(u => u.name.toLowerCase().includes(lower));
  }, [nameQuery, knownUsers]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSuggestionSelect(address: string) {
    setCounterparty(address); setNameQuery(""); setDropdownOpen(false); setHighlightIndex(-1);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIndex(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && highlightIndex >= 0) { e.preventDefault(); handleSuggestionSelect(suggestions[highlightIndex].address); }
    else if (e.key === "Escape") { setDropdownOpen(false); }
  }

  const [giveAmount, setGiveAmount] = useState("0");
  const [giveItems,  setGiveItems]  = useState<GiveItem[]>([]);
  const [getAmount,  setGetAmount]  = useState("0");
  const [wantItems,  setWantItems]  = useState<WantItem[]>([]);

  const { items: myInventory, isLoading: myInvLoading } = useOwnedInventory();
  const { characterId: counterpartyCharacterId, ownerCapId: counterpartyCapId, isLoading: capLoading, error: capError }
    = useCharacterForAddress(counterparty.trim() || undefined);

  const [counterpartySsuCapId, setCounterpartySsuCapId] = useState<string | null>(null);
  useEffect(() => {
    if (!counterpartyCharacterId) { setCounterpartySsuCapId(null); return; }
    let aborted = false;
    resolveSSUOwnerCap(counterpartyCharacterId, SSU_OBJECT_ID)
      .then(cap => { if (!aborted) setCounterpartySsuCapId(cap?.ssuCapId ?? null); })
      .catch(() => { if (!aborted) setCounterpartySsuCapId(null); });
    return () => { aborted = true; };
  }, [counterpartyCharacterId]);

  const { items: allSsuItems, isLoading: theirInvLoading } = useSSUInventory();
  const theirInventory = useMemo(() => {
    if (!counterpartyCapId) return [];
    const allowedKey = counterpartySsuCapId ?? counterpartyCapId;
    return allSsuItems.filter(it => it.inventoryKey === allowedKey);
  }, [allSsuItems, counterpartyCapId, counterpartySsuCapId]);

  const allTypeIds = useMemo(() => {
    const ids = new Set<number>();
    myInventory.forEach(i => ids.add(i.typeId)); theirInventory.forEach(i => ids.add(i.typeId));
    giveItems.forEach(i => ids.add(i.typeId)); wantItems.forEach(i => ids.add(i.typeId));
    return Array.from(ids);
  }, [myInventory, theirInventory, giveItems, wantItems]);
  const itemTypes = useItemTypes(allTypeIds);

  // OS-29: useTribeCoins deleted. Trade proposal uses giveEveMist from input — no coin object.
  const { eveBalance: tribeBalance } = useBalances();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const { isRegistered, refetchRoles } = useRoles(SSU_OBJECT_ID || null);
  const { data: shared } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const ssuGovId = shared?.ssuGovId;
  const { bazaarType } = useBazaarType();

  function toggleGiveItem(invItem: OwnedInventoryItem) {
    const exists = giveItems.find(g => g.typeId === invItem.typeId);
    if (exists) { setGiveItems(prev => prev.filter(g => g.typeId !== invItem.typeId)); }
    else { const available = invItem.quantity - invItem.lockedQuantity; if (available <= 0) return; setGiveItems(prev => [...prev, { typeId: invItem.typeId, quantity: available }]); }
  }
  function updateGiveQty(typeId: number, qty: number) { setGiveItems(prev => prev.map(g => g.typeId === typeId ? { ...g, quantity: qty } : g)); }
  function removeGiveItem(typeId: number) { setGiveItems(prev => prev.filter(g => g.typeId !== typeId)); }
  function toggleWantItem(invItem: { typeId: number; quantity: number }) {
    const exists = wantItems.find(w => w.typeId === invItem.typeId);
    if (exists) { setWantItems(prev => prev.filter(w => w.typeId !== invItem.typeId)); }
    else { setWantItems(prev => [...prev, { typeId: invItem.typeId, quantity: invItem.quantity }]); }
  }
  function updateWantQty(typeId: number, qty: number) { setWantItems(prev => prev.map(w => w.typeId === typeId ? { ...w, quantity: qty } : w)); }
  function removeWantItem(typeId: number) { setWantItems(prev => prev.filter(w => w.typeId !== typeId)); }

  async function handleSubmit() {
    if (!counterparty.trim()) { setError("Select a counterparty first."); return; }
    if (!ssuGovId || !bazaarType) { setError("SSU governance data not loaded yet. Please wait."); return; }
    const giveEveMist = Math.round(Number(giveAmount) * COIN_DECIMALS);
    const requestEveMist = Math.round(Number(getAmount) * COIN_DECIMALS);
    const bazaarTypeNum = bazaarType === "NoTribe" ? 0 : bazaarType === "Easy" ? 1 : 2;
    const expiryMs = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    setLoading(true); setError("");
    const tx = new Transaction();
    let eveSplit;
    try {
      eveSplit = await splitEveCoin(myAddress, BigInt(giveEveMist), tx);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Insufficient EVE balance.");
      setLoading(false);
      return;
    }
    try {
      buildCreateTradeProposal({
        counterparty,
        ssuId: SSU_OBJECT_ID,
        ssuGovId,
        tribeId: 0,
        bazaarType: bazaarTypeNum,
        giveItems: giveItems.map(g => ({ typeId: g.typeId, qty: g.quantity })),
        requestItems: wantItems.map(w => ({ typeId: w.typeId, qty: w.quantity })),
        giveEveMist,
        evePaymentCoin: eveSplit.coinArg,
        requestEveMist,
        expiryMs,
      }, tx);
      maybeRegisterStranger(tx, isRegistered, ssuGovId ?? "", shared?.memberRegistryId ?? "");
      await signGated(tx);
      refetchRoles();
      onSuccess();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Transaction failed."); } finally { setLoading(false); }
  }

  const counterpartyName = useMemo(() => {
    if (!counterparty) return null;
    return characterNames.get(counterparty) ?? null;
  }, [counterparty, characterNames]);

  return (
    <div className="trade__body">
      <div className="form-group" ref={searchRef}>
        <label className="form-label">Search by Username</label>
        <div className="user-search">
          <input className="input" value={nameQuery} placeholder="Type a character name..." autoComplete="off"
            onChange={e => { setNameQuery(e.target.value); setDropdownOpen(true); setHighlightIndex(-1); }}
            onFocus={() => { if (nameQuery.trim().length > 0) setDropdownOpen(true); }}
            onKeyDown={handleSearchKeyDown} />
          {dropdownOpen && suggestions.length > 0 && (
            <ul className="user-search__dropdown" role="listbox">
              {suggestions.map((u, idx) => (
                <li key={u.address} role="option" aria-selected={idx === highlightIndex}
                  className={["user-search__option", idx === highlightIndex ? "user-search__option--active" : ""].join(" ").trim()}
                  onMouseDown={() => handleSuggestionSelect(u.address)} onMouseEnter={() => setHighlightIndex(idx)}>
                  <span className="user-search__name">{u.name}</span>
                  <span className="user-search__addr muted">{u.address.slice(0, 8)}…</span>
                </li>
              ))}
            </ul>
          )}
          {dropdownOpen && nameQuery.trim().length > 0 && suggestions.length === 0 && (
            <div className="user-search__empty muted">No known users match "{nameQuery}"</div>
          )}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Counterparty Wallet Address</label>
        <input className="input" value={counterparty} onChange={e => setCounterparty(e.target.value)} placeholder="0x..." />
        {counterpartyName && <span className="muted" style={{ fontSize: "0.78rem" }}>{counterpartyName}</span>}
        {capError && counterparty.trim().length > 10 && <span className="muted" style={{ fontSize: "0.75rem", color: "var(--danger)" }}>{capError}</span>}
      </div>
      <div className="trade-columns">
        <div className="trade-column">
          <div className="trade-column__header">I Give</div>
          <div className="form-group">
            <label className="form-label">Amount ({displayCurrency})</label>
            <input className="input input--sm" type="number" min="0" value={giveAmount} placeholder="0" onChange={e => setGiveAmount(e.target.value)} />
            <span className="muted" style={{ fontSize: "0.75rem" }}>Balance: {(tribeBalance / COIN_DECIMALS).toFixed(2)} {displayCurrency}</span>
          </div>
          <div className="form-group" style={{ marginTop: "0.5rem" }}>
            <label className="form-label">My Inventory — click to add</label>
            {myInvLoading ? <div className="muted" style={{ fontSize: "0.8rem" }}>Loading inventory...</div>
              : myInventory.length === 0 ? <div className="muted" style={{ fontSize: "0.8rem" }}>No items in your inventory.</div>
              : (
                <div className="inventory-panel__list">
                  {myInventory.map(invItem => {
                    const typeInfo = itemTypes.get(invItem.typeId);
                    const displayName = typeInfo?.name ?? `#${invItem.typeId}`;
                    const available   = invItem.quantity - invItem.lockedQuantity;
                    const isSelected  = giveItems.some(g => g.typeId === invItem.typeId);
                    return (
                      <div key={invItem.typeId} className={["inventory-item", isSelected ? "inventory-item--selected" : ""].join(" ").trim()} onClick={() => toggleGiveItem(invItem)}>
                        {typeInfo?.iconUrl && <img className="inventory-item__icon" src={typeInfo.iconUrl} alt="" aria-hidden="true" />}
                        <span className="inventory-item__name">{displayName}</span>
                        <span className="inventory-item__qty">{invItem.lockedQuantity > 0 ? <>{available}<span className="muted">/{invItem.quantity}</span></> : <>x{invItem.quantity}</>}</span>
                        {invItem.lockedQuantity > 0 && <span className="lock-badge" style={{ fontSize: "0.65rem" }}>Locked</span>}
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
          {giveItems.length > 0 && (
            <div className="trade-give-items">
              {giveItems.map(g => {
                const name = itemTypes.get(g.typeId)?.name ?? `#${g.typeId}`;
                const invItem = myInventory.find(i => i.typeId === g.typeId);
                const maxAvail = invItem ? invItem.quantity - invItem.lockedQuantity : undefined;
                return (
                  <div key={g.typeId} className="trade-give-item">
                    <span className="trade-give-item__name">{name}</span>
                    <input className="input input--xs" type="number" min="1" max={maxAvail} value={g.quantity} onChange={e => updateGiveQty(g.typeId, Math.max(1, +e.target.value))} />
                    <button className="btn btn--ghost btn--sm" onClick={() => removeGiveItem(g.typeId)} title="Remove">x</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="trade-column">
          <div className="trade-column__header">I Get</div>
          <div className="form-group">
            <label className="form-label">Amount I want ({displayCurrency})</label>
            <input className="input input--sm" type="number" min="0" value={getAmount} placeholder="0" onChange={e => setGetAmount(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginTop: "0.5rem" }}>
            <label className="form-label">Their Inventory — click to add to request</label>
            {!counterparty.trim() ? <div className="muted" style={{ fontSize: "0.8rem" }}>Enter a counterparty address to see their inventory.</div>
              : capLoading ? <div className="muted" style={{ fontSize: "0.8rem" }}>Resolving character...</div>
              : !counterpartyCapId ? <div className="muted" style={{ fontSize: "0.8rem" }}>{capError ?? "Could not resolve counterparty character."}</div>
              : theirInvLoading ? <div className="muted" style={{ fontSize: "0.8rem" }}>Loading their inventory...</div>
              : theirInventory.length === 0 ? <div className="muted" style={{ fontSize: "0.8rem" }}>No items in their inventory at this SSU.</div>
              : (
                <div className="inventory-panel__list">
                  {theirInventory.map(invItem => {
                    const typeInfo   = itemTypes.get(invItem.typeId);
                    const displayName = typeInfo?.name ?? `#${invItem.typeId}`;
                    const isSelected  = wantItems.some(w => w.typeId === invItem.typeId);
                    return (
                      <div key={invItem.typeId} className={["inventory-item", isSelected ? "inventory-item--selected" : ""].join(" ").trim()} onClick={() => toggleWantItem(invItem)}>
                        {typeInfo?.iconUrl && <img className="inventory-item__icon" src={typeInfo.iconUrl} alt="" aria-hidden="true" />}
                        <span className="inventory-item__name">{displayName}</span>
                        <span className="inventory-item__qty">x{invItem.quantity}</span>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
          {wantItems.length > 0 && (
            <div className="trade-give-items">
              {wantItems.map(w => {
                const name = itemTypes.get(w.typeId)?.name ?? `#${w.typeId}`;
                const theirItem = theirInventory.find(i => i.typeId === w.typeId);
                const maxAvail  = theirItem?.quantity;
                return (
                  <div key={w.typeId} className="trade-give-item">
                    <span className="trade-give-item__name">{name}</span>
                    <input className="input input--xs" type="number" min="1" max={maxAvail} value={w.quantity} onChange={e => updateWantQty(w.typeId, Math.max(1, +e.target.value))} />
                    <button className="btn btn--ghost btn--sm" onClick={() => removeWantItem(w.typeId)} title="Remove">x</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {(giveItems.length > 0 || Number(giveAmount) > 0 || wantItems.length > 0 || Number(getAmount) > 0) && (
        <div className="proposal-summary">
          <div className="proposal-summary__row">
            <span className="proposal-summary__label">I give:</span>
            <span className="proposal-summary__value">
              {Number(giveAmount) > 0 && <span>{Number(giveAmount).toFixed(2)} {displayCurrency}{giveItems.length > 0 ? " + " : ""}</span>}
              {giveItems.map((g, i) => { const name = itemTypes.get(g.typeId)?.name ?? `#${g.typeId}`; return <span key={g.typeId}>{g.quantity}x {name}{i < giveItems.length - 1 ? ", " : ""}</span>; })}
              {giveItems.length === 0 && Number(giveAmount) === 0 && <span className="muted">nothing</span>}
            </span>
          </div>
          <div className="proposal-summary__row">
            <span className="proposal-summary__label">I want:</span>
            <span className="proposal-summary__value">
              {Number(getAmount) > 0 && <span>{Number(getAmount).toFixed(2)} {displayCurrency}{wantItems.length > 0 ? " + " : ""}</span>}
              {wantItems.map((w, i) => { const name = itemTypes.get(w.typeId)?.name ?? `#${w.typeId}`; return <span key={w.typeId}>{w.quantity}x {name}{i < wantItems.length - 1 ? ", " : ""}</span>; })}
              {wantItems.length === 0 && Number(getAmount) === 0 && <span className="muted">nothing</span>}
            </span>
          </div>
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
      <div style={{ padding: "0 0 1rem" }}>
        <button className="btn btn--primary" onClick={handleSubmit} disabled={loading || !counterparty.trim()}>
          {loading ? "Sending..." : "Send Trade Offer"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
