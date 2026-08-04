// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Ported from Bazar1/CreateShopModal.tsx. Sub-components: ItemTypeSearch, InventoryItemCard, TypeBadge, ReviewStep; kind editors: WTSEditor, WTBEditor, DEEditor, FREEEditor.

import { useState, useEffect, useMemo, DragEvent } from "react";
import { dAppKit, useConnection, abbreviateAddress } from "@evefrontier/dapp-kit";
import { maybeRegisterStranger } from "@bazaar/shared/tx";
import { useRoles } from "@bazaar/shared/hooks";
import {
  SSU_OBJECT_ID, COIN_DECIMALS, EVE_COIN_TYPE,
} from "@bazaar/shared/constants";
import { useShops } from "@bazaar/shared/hooks";
import type { ShopKind, Listing, ExchangePair } from "@bazaar/shared/types";
import { useSSUInventory } from "@bazaar/shared/hooks";
import type { InventoryItem } from "@bazaar/shared/hooks";
import { useItemTypes, prefetchAllItemTypes } from "@bazaar/shared/hooks";
import { useOwnedInventory } from "@bazaar/shared/hooks";
import { useUserStorage } from "@bazaar/shared/hooks";
import { usePlayerCharacter } from "@bazaar/shared/hooks";
// V16 Session 3C: per-role tax read via useSSURoleTaxTable + useTribeRoleTaxTable.
import { useSSURoleList } from "@bazaar/shared/hooks";
import { useBalances } from "@bazaar/shared/hooks";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useBazaarType } from "@bazaar/shared/hooks/useBazaarType";
import { useSSUGovernanceConfig } from "@bazaar/shared/hooks";
import { useSSURoleTaxTable } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import { useWTBTaxConfig } from "@bazaar/shared/hooks/bazaarcore/useWTBTaxConfig";
import { useTribeTokenSymbol } from "@bazaar/shared/hooks/bazaareconomy/useTribeTokenSymbol";
import { useTribeTokenBalance } from "@bazaar/shared/hooks/bazaareconomy/ledger-hooks";
import { buildBootstrapTribeTokenWtbPool } from "@bazaar/shared/tx/bazaareconomy/wtb-pool-tx";
import { useShopTaxBreakdown } from "@bazaar/shared/hooks/bazaarcore/useShopTaxBreakdown";
import { useCharacterOwnerCapRef } from "@bazaar/shared/hooks/useCharacterOwnerCapRef";
import { useIsSSUOwner, useSSUOwnerCapRef } from "@bazaar/shared/hooks";
import type { EscrowListingRef } from "@bazaar/shared/tx/bazaarcore/shop-tx";
import {
  buildCreateWTSShop, buildCreateWTBShop, buildCreateDEShop, buildCreateFreeShop,
} from "@bazaar/shared/tx";
import { buildCreateWtbShopAdvanced } from "@bazaar/shared/tx/bazaareconomy/wtb-pool-tx";
import { buildCreateFreeShopAdvanced } from "@bazaar/shared/tx/bazaareconomy/free-shop-advanced-tx";
import { escrowItemsForShopCreation } from "@bazaar/shared/tx/bazaarcore/shop-escrow-helpers";
import { useTribeEconomyObjects, useTribeTokenWtbPoolId } from "@bazaar/shared/hooks";
import { useTribeGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { suiClient } from "@bazaar/shared/hooks/sui-client";
import { Transaction } from "@mysten/sui/transactions";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";
// EVE_COIN_TYPE no longer needed — Advanced WTB no longer constructs a Coin<EVE>::zero().
import type { OwnedInventoryItem } from "@bazaar/shared/types";
import { InventoryItemCard } from "./InventoryItemCard";
import { ReviewStep } from "./ReviewStep";
import { WTSEditor } from "./kinds/WTSEditor";
import { WTBEditor } from "./kinds/WTBEditor";
import { DEEditor } from "./kinds/DEEditor";
import { FREEEditor } from "./kinds/FREEEditor";
import { Step0, Step1, Step2, Step3Banners } from "./Steps";
import MissionWizard from "./kinds/MissionWizard";
import { checkShopPositionClear } from "@bazaar/shared/utils/checkShopPositionClear";
import { TRIBE_TOKEN_DECIMALS } from "@bazaar/shared/utils/tribeToken";

interface Props {
  onClose:           () => void;
  /** Live ref so we read the position at submit time, not at modal mount (Godot only pushes on movement). */
  playerPositionRef?: { current: { x: number; y: number } };
  /** Legacy prop kept for callers that already snapshot. New caller uses playerPositionRef. */
  playerPosition?:   { x: number; y: number };
}

type Step = 0 | 1 | 2 | 3 | 4;

interface DragPayload { typeId: number; quantity: number; }

const DEFAULT_LISTING: Listing   = { itemTypeId: 0, quantity: 1, priceTribe: 0 };
// Bundle-ratio DE default: 1 bundle = 1 offered → 1 requested, 1 bundle stocked
// (offerPerLot = 1 ⇒ legacy per-single-offered behaviour until the seller raises it).
const DEFAULT_PAIR: ExchangePair = { offeredTypeId: 0, offeredQty: 1, requestedTypeId: 0, requestedQty: 1, offerPerLot: 1 };

export default function CreateShopModal({ onClose, playerPositionRef, playerPosition }: Props) {
  const { shops: existingShops } = useShops();
  const bazarSsuIds = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    if (SSU_OBJECT_ID) { seen.add(SSU_OBJECT_ID); ordered.push(SSU_OBJECT_ID); }
    for (const s of existingShops) {
      if (s.ssuId && !seen.has(s.ssuId)) { seen.add(s.ssuId); ordered.push(s.ssuId); }
    }
    return ordered;
  }, [existingShops]);

  const [selectedShopSsuId, setSelectedShopSsuId] = useState<string>(SSU_OBJECT_ID);
  const activeShopsOnSsu = useMemo(
    () => existingShops.filter(s => s.ssuId === selectedShopSsuId && s.isActive),
    [existingShops, selectedShopSsuId],
  );
  const hasMultipleSsus = bazarSsuIds.length > 1;
  const [step,     setStep]     = useState<Step>(() => hasMultipleSsus ? 0 : 1);
  const [kind,     setKind]     = useState<ShopKind>("WTS");
  const [title,    setTitle]    = useState("");
  const [listings, setListings] = useState<Listing[]>([{ ...DEFAULT_LISTING }]);
  const [pairs,    setPairs]    = useState<ExchangePair[]>([{ ...DEFAULT_PAIR }]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [claimLimitPerUser,     setClaimLimitPerUser]     = useState(1);
  const [coinGiveawayAmount,    setCoinGiveawayAmount]    = useState(0);
  const [coinClaimLimitPerUser, setCoinClaimLimitPerUser] = useState(0);
  const [allowedRoles,          setAllowedRoles]          = useState<number[]>([0, 1, 2, 3, 4, 5, 6, 7]);
  const [showManualListing,     setShowManualListing]     = useState<boolean[]>([false]);
  const [showManualPairOffer,   setShowManualPairOffer]   = useState<boolean[]>([false]);
  const [showManualPairWant,    setShowManualPairWant]    = useState<boolean[]>([false]);
  const [dragOverSlot,          setDragOverSlot]          = useState<string | null>(null);
  const [selectedItem,          setSelectedItem]          = useState<InventoryItem | null>(null);

  const { items: ownedItems, isLoading: invLoading } = useOwnedInventory();
  const { items: allSsuItems } = useSSUInventory();
  const { usedVolume, volumeLimit } = useUserStorage();
  const { walletAddress } = useConnection();
  const { character } = usePlayerCharacter();
  const { isRegistered, refetchRoles, isAdmin, isOwner } = useRoles(SSU_OBJECT_ID || null);
  const { roleOf }          = useSSURoleList(SSU_OBJECT_ID || null);
  const { eveBalance, isLoading: coinsLoading } = useBalances();
  const { data: shared }    = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const ssuGovId = shared?.ssuGovId;
  const { bazaarType } = useBazaarType(SSU_OBJECT_ID);
  const { data: govConfig } = useSSUGovernanceConfig(ssuGovId ?? null);
  const { symbol: tribeTokenSymbol } = useTribeTokenSymbol(govConfig?.tribeId ?? null);
  const displayCurrency = govConfig?.bazaarType === 2 ? (tribeTokenSymbol ?? "TRIBE") : "EVE";
  // V21 — Advanced WTB needs ledger ID (for burn) + pool ID (for credit). Both null on
  // NoTribe/Easy. tribeId guarded by govConfig load to avoid useTribeEconomyObjects
  // querying with placeholder tribe 0.
  const tribeIdForEconomy = govConfig?.tribeId ? String(govConfig.tribeId) : null;
  const { data: tribeEconomyIds } = useTribeEconomyObjects(tribeIdForEconomy);
  // Advanced FREE shop (free_shop_advanced) needs the TribeGovernance object ID
  // (tx.object(tribeGovId) → &TribeGovernance). Resolve from tribeId; null on NoTribe/Easy.
  const { data: tribeGovId } = useTribeGovId(tribeIdForEconomy);
  const { data: tribeTokenWtbPoolId } = useTribeTokenWtbPoolId(SSU_OBJECT_ID || null);
  // WTB balance check on Advanced compares tribe-token ledger balance, not EVE.
  const tribeTokenBalQ = useTribeTokenBalance(
    tribeEconomyIds?.ledgerId ?? null,
    walletAddress ?? null,
  );
  const tribeTokenBalance = tribeTokenBalQ.data?.balance ?? 0;
  // V26+ — read tribe-token decimals from on-chain ledger. Determines the
  // FE→Move price-scaling factor for Advanced bazaars (priceScale below).
  const tribeTokenDecimals = tribeTokenBalQ.data?.decimals ?? TRIBE_TOKEN_DECIMALS;
  // Price-scale factor mapping user-typed display amount → raw on-chain u64.
  //   NoTribe/Easy (EVE):       priceScale = COIN_DECIMALS  (1e9 MIST per EVE)
  //   Advanced  (tribe-token):  priceScale = 10^decimals    (100 for decimals=2)
  // Used for `itemsCostScaled` (gross), tax breakdown inputs, and the submit
  // path's `pricesForMove`. All Move-side inputs stay in their native raw u64.
  const priceScale = govConfig?.bazaarType === 2 ? Math.pow(10, tribeTokenDecimals) : COIN_DECIMALS;
  const { characterId, charCapRef } = useCharacterOwnerCapRef(walletAddress ?? undefined, selectedShopSsuId);
  const { data: isSSUOwner, isLoading: ownerLoading } = useIsSSUOwner(ssuGovId ?? null);
  const { ref: ssuOwnerCapRef, isLoading: ssuOwnerCapLoading } = useSSUOwnerCapRef(isSSUOwner, characterId, selectedShopSsuId);
  // V16 Session 3C: SSU + tribe tax rates now keyed by creator's role in each registry.
  // Both SSU + tribe role indices come from useRoles(targetSsuId) → ssuRole/tribeRole.
  const creatorRole         = walletAddress ? roleOf(walletAddress) : "Stranger";
  const { ssuRole: creatorSsuRole, tribeRole: creatorTribeRole } = useRoles(SSU_OBJECT_ID || null);
  const { data: ssuRoleTaxes } = useSSURoleTaxTable(ssuGovId ?? null);
  const ssuRoleRow          = ssuRoleTaxes?.[creatorSsuRole] ?? null;
  const wtbSsuTaxBps        = ssuRoleRow?.wtbPct ?? 0;
  const wtsSsuTaxBps        = ssuRoleRow?.wtsPct ?? 0;
  const deSsuFlatFee        = ssuRoleRow?.deFlatFee ?? 0;
  // V26+ — Advanced uses priceScale=10^decimals; NoTribe/Easy uses COIN_DECIMALS.
  // Bps tax math downstream consumes this scaled total and produces scaled outputs
  // in the same domain (tribe-token scaled units OR MIST). Display layers know
  // which to use via the `decimals` prop on TaxIndicator.
  const itemsCostScaled     = listings.reduce((sum, l) => sum + Math.round(l.priceTribe * priceScale) * l.quantity, 0);
  // Advanced (bazaarType === 2) shop taxes are SSU + Tribe only — the DApp tax is
  // Exchange-only. Drop the DApp layer from the create-window breakdowns.
  const excludeDappTax      = govConfig?.bazaarType === 2;
  const wtbTax              = useWTBTaxConfig({ ssuBps: wtbSsuTaxBps, tribeId: govConfig?.tribeId ?? 0, tribeRole: creatorTribeRole, itemsCostScaled, excludeDapp: excludeDappTax });
  const wtsTax              = useShopTaxBreakdown({ kind: "wts", ssuBpsOrFee: wtsSsuTaxBps, tribeId: govConfig?.tribeId ?? 0, tribeRole: creatorTribeRole, grossOrUnits: itemsCostScaled, excludeDapp: excludeDappTax });
  const deTax               = useShopTaxBreakdown({ kind: "de",  ssuBpsOrFee: deSsuFlatFee, tribeId: govConfig?.tribeId ?? 0, tribeRole: creatorTribeRole, grossOrUnits: 1, excludeDapp: excludeDappTax });
  const inventory   = ownedItems;
  const ownedByTypeId = new Map<number, OwnedInventoryItem>(ownedItems.map(i => [i.typeId, i]));
  const wtbTotalVolume = kind === "WTB" ? listings.reduce((sum, l) => {
    if (l.itemTypeId === 0) return sum;
    const vol = ownedByTypeId.get(l.itemTypeId)?.volume ?? 0;
    return sum + vol * l.quantity;
  }, 0) : 0;
  const remainingCapacity = volumeLimit > 0 ? volumeLimit - usedVolume : Infinity;
  const wtbExceedsCapacity = volumeLimit > 0 && wtbTotalVolume > remainingCapacity;
  const allTypeIds = [
    ...inventory.map(it => it.typeId),
    ...allSsuItems.map(it => it.typeId),
    ...listings.map(l => l.itemTypeId).filter(id => id !== 0),
    ...pairs.flatMap(p => [p.offeredTypeId, p.requestedTypeId]).filter(id => id !== 0),
  ];
  const itemTypes = useItemTypes(allTypeIds);

  useEffect(() => { prefetchAllItemTypes().catch(() => {}); }, []);

  const addListing = () => { setListings(l => [...l, { ...DEFAULT_LISTING }]); setShowManualListing(m => [...m, false]); };
  const removeListing = (i: number) => { setListings(l => l.filter((_, idx) => idx !== i)); setShowManualListing(m => m.filter((_, idx) => idx !== i)); };
  const updateListing = (i: number, field: keyof Listing, val: number) => setListings(l => l.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  const clearListingItem = (i: number) => setListings(l => l.map((item, idx) => idx === i ? { ...item, itemTypeId: 0, quantity: 1 } : item));
  const addPair = () => { setPairs(p => [...p, { ...DEFAULT_PAIR }]); setShowManualPairOffer(m => [...m, false]); setShowManualPairWant(m => [...m, false]); };
  const removePair = (i: number) => { setPairs(p => p.filter((_, idx) => idx !== i)); setShowManualPairOffer(m => m.filter((_, idx) => idx !== i)); setShowManualPairWant(m => m.filter((_, idx) => idx !== i)); };
  const updatePair = (i: number, field: keyof ExchangePair, val: number) => setPairs(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  // Bundle helper: set the bundle size (offerPerLot) and/or the number of bundles
  // together, keeping offeredQty (total escrow) = offerPerLot × bundles a whole
  // multiple so the Move-side lot-integrity assert (offer_quantity % offer_per_lot)
  // always passes.
  const updatePairLot = (i: number, next: { offerPerLot?: number; bundles?: number }) =>
    setPairs(p => p.map((item, idx) => {
      if (idx !== i) return item;
      const perLot     = Math.max(1, Math.floor(next.offerPerLot ?? item.offerPerLot ?? 1));
      const curBundles = Math.max(1, Math.floor((item.offeredQty || 1) / (item.offerPerLot || 1)));
      const bundles    = Math.max(1, Math.floor(next.bundles ?? curBundles));
      return { ...item, offerPerLot: perLot, offeredQty: perLot * bundles };
    }));
  const clearPairSide = (i: number, side: "offer" | "want") => setPairs(p => p.map((item, idx) => {
    if (idx !== i) return item;
    return side === "offer" ? { ...item, offeredTypeId: 0, offeredQty: 1, offerPerLot: 1 } : { ...item, requestedTypeId: 0, requestedQty: 1 };
  }));

  function handleInventoryClick(item: InventoryItem) { setSelectedItem(prev => (prev?.typeId === item.typeId ? null : item)); }

  function applySelectedToListing(i: number) {
    if (!selectedItem) return;
    const owned = ownedByTypeId.get(selectedItem.typeId);
    const availableQty = owned ? owned.quantity - (owned.lockedQuantity ?? 0) : selectedItem.quantity;
    setListings(l => l.map((item, idx) => idx === i ? { ...item, itemTypeId: selectedItem.typeId, quantity: Math.max(1, availableQty) } : item));
    setShowManualListing(m => m.map((v, idx) => idx === i ? false : v));
    setSelectedItem(null);
  }

  function applySelectedToPair(i: number, side: "offer" | "want") {
    if (!selectedItem) return;
    setPairs(p => p.map((item, idx) => {
      if (idx !== i) return item;
      // Offer side: place the item and start at one bundle (offeredQty = offerPerLot);
      // the seller then sets the bundle count. Want side: set the item only and keep
      // the per-bundle ask (the requested item is what buyers hand over, not stock the
      // seller owns, so its inventory count is irrelevant).
      return side === "offer"
        ? { ...item, offeredTypeId: selectedItem.typeId, offeredQty: Math.max(1, item.offerPerLot || 1) }
        : { ...item, requestedTypeId: selectedItem.typeId };
    }));
    if (side === "offer") setShowManualPairOffer(m => m.map((v, idx) => idx === i ? false : v));
    else setShowManualPairWant(m => m.map((v, idx) => idx === i ? false : v));
    setSelectedItem(null);
  }

  function parseDragPayload(e: DragEvent): DragPayload | null {
    try { return JSON.parse(e.dataTransfer.getData("application/json")) as DragPayload; }
    catch { return null; }
  }

  function onListingDrop(e: DragEvent, i: number) {
    e.preventDefault(); setDragOverSlot(null);
    const payload = parseDragPayload(e);
    if (!payload) return;
    setListings(l => l.map((item, idx) => idx === i ? { ...item, itemTypeId: payload.typeId, quantity: payload.quantity } : item));
    setShowManualListing(m => m.map((v, idx) => idx === i ? false : v));
  }

  function onPairDrop(e: DragEvent, i: number, side: "offer" | "want") {
    e.preventDefault(); setDragOverSlot(null);
    const payload = parseDragPayload(e);
    if (!payload) return;
    setPairs(p => p.map((item, idx) => {
      if (idx !== i) return item;
      // Offer side: place item, reset to one bundle (see applySelectedToPair). Want
      // side: set item only, keep the per-bundle ask.
      return side === "offer"
        ? { ...item, offeredTypeId: payload.typeId, offeredQty: Math.max(1, item.offerPerLot || 1) }
        : { ...item, requestedTypeId: payload.typeId };
    }));
    if (side === "offer") setShowManualPairOffer(m => m.map((v, idx) => idx === i ? false : v));
    else setShowManualPairWant(m => m.map((v, idx) => idx === i ? false : v));
  }

  async function handleSubmit() {
    if (selectedShopSsuId !== SSU_OBJECT_ID) {
      setError("SSU mismatch: please navigate to the URL for the SSU you want to create the shop on (?ssuId=…) before retrying.");
      return;
    }
    if (!title.trim()) { setError("Title is required."); return; }
    if (kind === "WTS" && inventory.length === 0) { setError("No items in SSU storage."); return; }
    if ((kind === "WTS" || kind === "FREE") && !allListingsFromInventory) { setError("All listed items must come from SSU inventory."); return; }
    // V25 — FREE shops may offer items, a coin giveaway, or both. The Move
    // side asserts E_FREE_SHOP_EMPTY when both are empty; the FE catches
    // that here for a friendlier error.
    if (kind === "FREE" && !hasFilledListing && coinGiveawayAmount <= 0) {
      setError("A FREE shop must have either at least one item or a coin giveaway.");
      return;
    }
    if (kind === "FREE" && coinGiveawayAmount > 0 && coinClaimLimitPerUser <= 0) {
      setError("Per-claim amount (claim limit per user) must be greater than 0 when a coin giveaway is configured.");
      return;
    }
    if (kind === "FREE" && coinGiveawayAmount > 0 && coinClaimLimitPerUser > coinGiveawayAmount) {
      setError("Per-claim amount can't exceed the total coin giveaway pool.");
      return;
    }
    if (kind !== "DE" && kind !== "FREE" && !hasFilledListing) { setError("Add at least one item from inventory."); return; }
    if (kind === "WTB" && govConfig?.bazaarType !== 2 && wtbTax.totalDepositScaled > 0) {
      if (eveBalance < wtbTax.totalDepositScaled) { setError(`Insufficient ${displayCurrency} balance for escrow deposit.`); return; }
    }
    if (!shared || !ssuGovId || !bazaarType || !govConfig) { setError("Loading SSU governance — please wait."); return; }
    if (kind === "WTB" && wtbTax.isLoading) { setError("Loading tax configuration — please wait."); return; }
    // Phase 3: SSU-owner branch needs SSUOwnerCapRef before submit.
    if (kind !== "WTB" && isSSUOwner && (ssuOwnerCapLoading || !ssuOwnerCapRef)) {
      setError("Resolving SSU owner cap — please wait."); return;
    }
    if (ownerLoading) { setError("Resolving SSU owner status — please wait."); return; }
    if (!selectedShopSsuId) { setError("No SSU selected. Open this page with ?ssuId=<your SSU ID> in the URL."); return; }
    if ((kind === "WTS" || kind === "FREE" || kind === "DE") && (!characterId || !charCapRef)) { setError("Character not yet resolved. Please wait a moment and retry."); return; }
    if ((kind === "WTS" || kind === "FREE") && listings.some(l => l.itemTypeId !== 0 && (!Number.isFinite(l.quantity) || l.quantity <= 0))) { setError("All listings must have a valid quantity ≥ 1."); return; }
    if (kind === "DE" && pairs.some(p => p.offeredTypeId !== 0 && (
      !Number.isFinite(p.offeredQty)   || p.offeredQty   <= 0 ||
      !Number.isFinite(p.requestedQty) || p.requestedQty <= 0 ||
      !Number.isFinite(p.offerPerLot)  || p.offerPerLot  <= 0 ||
      p.offeredQty % p.offerPerLot !== 0
    ))) { setError("Each exchange bundle needs a give amount, a want amount, and a whole number of bundles (all ≥ 1)."); return; }
    // Read latest position at submit time. Ref wins over snapshot — Godot only emits
    // `player_moved` on actual movement, so a stationary player keeps the ref at its
    // last-known value, while a snapshot captured at modal mount would be stale (or {0,0}).
    const livePos = playerPositionRef?.current ?? playerPosition;
    const posX = Math.floor(livePos?.x ?? 0);
    const posY = Math.floor(livePos?.y ?? 0);
    // Defensive guard: world (0,0) is the Godot-engine default when no genuine
    // movement event has arrived yet. player.gd._ready fires _send_moved() with
    // direction "n" before the user moves, so we cannot distinguish "real spawn
    // at origin" from "bridge not yet initialised" via direction alone.
    // (0,0) is overwhelmingly the bridge-uninitialised sentinel in practice;
    // the Phase 8 Chebyshev exclusion zone (E_SHOP_POSITION_OCCUPIED = 15)
    // will reject it once any other active shop lands within 2 tiles anyway.
    if (posX === 0 && posY === 0) {
      setError(
        "Player position not yet received from Godot. Move your character one tile (W/A/S/D), then retry. " +
        "If this persists across page reloads, the Godot bundle is stale — re-export from the Godot editor.",
      );
      return;
    }
    const posError = checkShopPositionClear({ x: posX, y: posY }, activeShopsOnSsu);
    if (posError) { setError(posError); return; }
    setLoading(true); setError("");
    try {
      const scaledListings = listings.map(l => ({ ...l, priceTribe: Math.round(l.priceTribe * COIN_DECIMALS) }));
      // Advanced (bazaarType=2) uses tribe-token ledger (V26+ decimals=2; was
      // 0-decimal in V20-V25). Move expects raw scaled u64 — user-typed display
      // amount × 10^decimals. NoTribe/Easy (EVE, 9-decimal MIST) keeps the
      // COIN_DECIMALS scaling. Move-side primitives that consume `price_eve`
      // as ledger units: tribe_token_ledger::internal_burn (WTB create),
      // tribe_token_ledger::debit (WTS buy), tribe_token_wtb_pool::credit_for_shop.
      const pricesForMove = govConfig.bazaarType === 2
        ? listings.map(l => Math.max(0, Math.round(l.priceTribe * priceScale)))
        : scaledListings.map(l => l.priceTribe);
      const expiryMs = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30-day default
      let tx;
      if (kind === "WTS") {
        const escrowItems: EscrowListingRef[] = scaledListings.map(l => ({ typeId: l.itemTypeId, quantity: l.quantity }));
        tx = buildCreateWTSShop({
          bazaarType: govConfig.bazaarType, title,
          ssuId: selectedShopSsuId, ssuGovId, memberRegistryId: shared.memberRegistryId,
          tribeGovId: tribeGovId ?? undefined, // V36 Easy: create_wts_shop_easy needs tribe_gov
          tribeId: govConfig.tribeId,
          itemTypeIds: scaledListings.map(l => l.itemTypeId),
          quantities:  scaledListings.map(l => l.quantity),
          pricesEve:   pricesForMove,
          expiryMs,
          escrowItems,
          charCapRef,
          characterId: characterId ?? undefined,
          asOwner:        isSSUOwner,
          ssuOwnerCapRef: ssuOwnerCapRef ?? undefined,
          positionX: posX,
          positionY: posY,
        });
      } else if (kind === "WTB") {
        // V21 closure of WTB-LEDGER-POOL-01: Advanced WTB now pre-deposits
        // `gross` tribe-tokens into the per-SSU `TribeTokenWtbPool` (burns from
        // owner ledger row + credits the pool). NoTribe/Easy retain EVE escrow.
        if (govConfig.bazaarType === 2) {
          // Advanced — require ledger to be resolvable.
          if (!tribeEconomyIds?.ledgerId) {
            setError("Tribe ledger not yet initialized. Have your tribe leader run the economy bootstrap first.");
            setLoading(false);
            return;
          }
          // Lazy WTB-pool bootstrap. If the SSU doesn't yet have a pool,
          // sign + execute a one-time bootstrap TX, extract the pool ID from
          // the emitted `TribeTokenWtbPoolCreated` event, then continue to
          // the actual create-shop TX. Two wallet signatures the first time
          // an SSU creates an Advanced WTB shop; one signature thereafter.
          // (Can't be bundled in one PTB: bootstrap shares the pool, and a
          // subsequent move call in the same PTB can't reference a just-
          // shared object by its yet-to-be-known on-chain ID.)
          let poolId: string | null = tribeTokenWtbPoolId ?? null;
          if (!poolId) {
            try {
              const bootTx = new Transaction();
              buildBootstrapTribeTokenWtbPool({ ssuGovId }, bootTx);
              // dapp-kit's signAndExecuteTransaction returns `{ $kind, Transaction|FailedTransaction: { digest, effects, ... } }`
              // and DROPS events even when `options.showEvents` is set
              // (see @mysten/dapp-kit-core/utils/transaction-result.ts — `events: undefined`).
              // Fetch events from the fullnode by digest instead. Same pattern
              // as governance-resolution-hooks.ts uses for SSUGovCreated lookup.
              const bootRes = await dAppKit.signAndExecuteTransaction({ transaction: bootTx });
              if (bootRes.$kind !== "Transaction") {
                setError(
                  "WTB pool bootstrap TX aborted on-chain (digest: " +
                  bootRes.FailedTransaction.digest + "). Refresh and retry.",
                );
                setLoading(false);
                return;
              }
              const digest = bootRes.Transaction.digest;
              // Fullnode indexing can lag by ~1s after certification — short
              // retry loop. ~6s total worst-case before we surface a refresh hint.
              let bootEvents: Array<{ type: string; parsedJson?: unknown }> = [];
              for (let i = 0; i < 5; i++) {
                try {
                  const blk = await suiClient.getTransactionBlock({
                    digest,
                    options: { showEvents: true },
                  }) as { events?: Array<{ type: string; parsedJson?: unknown }> };
                  if (blk.events && blk.events.length > 0) {
                    bootEvents = blk.events;
                    break;
                  }
                } catch {
                  // Fullnode not yet indexed — retry after backoff.
                }
                await new Promise(r => setTimeout(r, 400 * (i + 1)));
              }
              const ev = bootEvents.find(e =>
                e.type.endsWith("::tribe_token_wtb_pool::TribeTokenWtbPoolCreated"),
              );
              const parsed = ev?.parsedJson as { pool_id?: string; ssu_id?: string } | undefined;
              if (!parsed?.pool_id) {
                setError(
                  "WTB pool bootstrap succeeded but the fullnode hasn't yet indexed " +
                  "the TribeTokenWtbPoolCreated event. Refresh the page and retry — " +
                  "your pool now exists; the next attempt will find it.",
                );
                setLoading(false);
                return;
              }
              poolId = parsed.pool_id;
              tribeTokenBalQ.refetch();
            } catch (e: unknown) {
              setError(
                "Failed to bootstrap the WTB pool for this SSU: " +
                (e instanceof Error ? e.message : String(e)),
              );
              setLoading(false);
              return;
            }
          }
          const advTx = new Transaction();
          buildCreateWtbShopAdvanced({
            title,
            ssuId:            selectedShopSsuId,
            ssuGovId,
            memberRegistryId: shared.memberRegistryId,
            poolId:           poolId,
            ledgerId:         tribeEconomyIds.ledgerId,
            tribeId:          govConfig.tribeId,
            itemTypeIds:      scaledListings.map(l => l.itemTypeId),
            quantities:       scaledListings.map(l => l.quantity),
            // pricesForMove is raw token count for Advanced (0-decimal). Move
            // computes gross = price * qty and `internal_burn`s it from the
            // owner's ledger row — MIST-scaling here would over-burn by 1e9×.
            pricesEve:        pricesForMove,
            expiryMs,
            positionX: posX,
            positionY: posY,
          }, advTx);
          tx = advTx;
        } else {
          const innerTx = new Transaction();
          let wtbSplit;
          try {
            wtbSplit = await splitEveCoin(walletAddress!, BigInt(wtbTax.totalDepositScaled), innerTx);
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Insufficient EVE balance for WTB escrow.");
            setLoading(false);
            return;
          }
          tx = innerTx;
          buildCreateWTBShop({
            bazaarType:       govConfig.bazaarType,
            title,
            ssuId:            selectedShopSsuId,
            ssuGovId,
            tribeGovId:       tribeGovId ?? undefined, // V36 Easy: create_wtb_shop_easy needs tribe_gov
            memberRegistryId: shared.memberRegistryId,
            tribeId:          govConfig.tribeId,
            itemTypeIds:      scaledListings.map(l => l.itemTypeId),
            quantities:       scaledListings.map(l => l.quantity),
            // NoTribe/Easy WTB: prices stay MIST-scaled (EVE is 9-decimal MIST,
            // matches the on-chain Coin<EVE> escrow value math).
            pricesEve:        pricesForMove,
            escrowAmountMist: wtbTax.totalDepositScaled,
            prepayEve:        wtbSplit.coinArg,
            expiryMs,
            positionX: posX,
            positionY: posY,
          }, tx);
        }
      } else if (kind === "FREE") {
        const filledListings = scaledListings.filter(l => l.itemTypeId !== 0);
        const escrowItems: EscrowListingRef[] = filledListings.map(l => ({ typeId: l.itemTypeId, quantity: l.quantity }));
        if (govConfig.bazaarType === 2) {
          // ── V26 Advanced FREE — tribe-token giveaway via free_shop_advanced ──
          // coinGiveawayAmount + coinClaimLimitPerUser are user-typed display
          // amounts; scale to raw tribe-token units (decimals=2 → ×100).
          if (!tribeEconomyIds?.ledgerId || !tribeGovId) {
            setError("Tribe ledger / governance not yet initialized. Have your tribe leader bootstrap the economy first.");
            setLoading(false);
            return;
          }
          const tribeScale = Math.pow(10, tribeTokenDecimals);
          const prepayScaled    = coinGiveawayAmount > 0 ? Math.round(coinGiveawayAmount * tribeScale) : 0;
          const perClaimScaled  = coinGiveawayAmount > 0 && coinClaimLimitPerUser > 0
            ? Math.round(coinClaimLimitPerUser * tribeScale)
            : 0;
          if (prepayScaled > 0 && tribeTokenBalance < prepayScaled) {
            setError(`Insufficient ${displayCurrency} balance for giveaway prepay (need ${prepayScaled / tribeScale}, have ${tribeTokenBalance / tribeScale}).`);
            setLoading(false);
            return;
          }
          if (!characterId) {
            setError("Resolving character — please wait.");
            setLoading(false);
            return;
          }
          const advFreeTx = new Transaction();
          // Item-side escrow runs first so the items are anchored to the SSU
          // before bazar::create_free_shop_partial registers the shop. This
          // mirrors the NoTribe/Easy flow path in buildCreateFreeShop.
          if (escrowItems.length > 0) {
            escrowItemsForShopCreation(advFreeTx, {
              ssuId:            selectedShopSsuId,
              characterId,
              escrowItems,
              asOwner:          isSSUOwner,
              charCapRef,
              ssuOwnerCapRef:   ssuOwnerCapRef ?? undefined,
            });
          }
          buildCreateFreeShopAdvanced({
            ssuGovId,
            tribeGovId,
            memberRegistryId: shared.memberRegistryId,
            ledgerId:         tribeEconomyIds.ledgerId,
            bazaarType:       2,
            title,
            ssuId:            selectedShopSsuId,
            tribeId:          govConfig.tribeId,
            itemTypeIds:      filledListings.map(l => l.itemTypeId),
            quantities:       filledListings.map(l => l.quantity),
            expiryMs,
            positionX:        posX,
            positionY:        posY,
            tribeTokenPrepayScaled:   prepayScaled,
            tribeTokenPerClaimScaled: perClaimScaled,
          }, advFreeTx);
          tx = advFreeTx;
        } else {
          // ── V25 NoTribe / Easy FREE — EVE giveaway via bazar::create_free_shop ──
          const giveawayTotalMist = coinGiveawayAmount > 0
            ? Math.round(coinGiveawayAmount * COIN_DECIMALS)
            : 0;
          const coinClaimAmountMist = coinGiveawayAmount > 0 && coinClaimLimitPerUser > 0
            ? Math.round(coinClaimLimitPerUser * COIN_DECIMALS)
            : 0;
          const freeTx = new Transaction();
          let prepayCoin;
          if (giveawayTotalMist > 0) {
            try {
              const split = await splitEveCoin(walletAddress!, BigInt(giveawayTotalMist), freeTx);
              prepayCoin = split.coinArg;
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : "Insufficient EVE balance for FREE shop coin giveaway.");
              setLoading(false);
              return;
            }
          } else {
            // V25 Move asserts EITHER items OR prepay > 0; this branch is the
            // items-only path. coin::zero<EVE> is the no-giveaway sentinel.
            prepayCoin = freeTx.moveCall({
              target: "0x2::coin::zero",
              typeArguments: [EVE_COIN_TYPE],
            });
          }
          tx = freeTx;
          buildCreateFreeShop({
            bazaarType:       govConfig.bazaarType,
            title,
            ssuId:            selectedShopSsuId,
            ssuGovId,
            memberRegistryId: shared.memberRegistryId,
            tribeId:          govConfig.tribeId,
            itemTypeIds:      filledListings.map(l => l.itemTypeId),
            quantities:       filledListings.map(l => l.quantity),
            expiryMs,
            escrowItems,
            charCapRef,
            characterId: characterId ?? undefined,
            asOwner:        isSSUOwner,
            ssuOwnerCapRef: ssuOwnerCapRef ?? undefined,
            positionX: posX,
            positionY: posY,
            prepayCoin: prepayCoin as unknown as { kind: "Input"; index: number },
            coinClaimAmountMist,
          }, tx);
        }
      } else {
        const filledPairs = pairs.filter(p => p.offeredTypeId !== 0 && p.requestedTypeId !== 0);
        const escrowItems: EscrowListingRef[] = filledPairs.map(p => ({ typeId: p.offeredTypeId, quantity: p.offeredQty }));
        tx = buildCreateDEShop({
          bazaarType:       govConfig.bazaarType,
          title,
          ssuId:            selectedShopSsuId,
          ssuGovId,
          tribeGovId:       tribeGovId ?? undefined, // V36 Easy: create_de_shop_easy needs tribe_gov
          memberRegistryId: shared.memberRegistryId,
          tribeId:          govConfig.tribeId,
          pairs:            filledPairs,
          expiryMs,
          escrowItems,
          charCapRef,
          characterId: characterId ?? undefined,
          asOwner:        isSSUOwner,
          ssuOwnerCapRef: ssuOwnerCapRef ?? undefined,
          positionX: posX,
          positionY: posY,
        });
      }
      maybeRegisterStranger(tx, isRegistered, ssuGovId ?? "", shared?.memberRegistryId ?? "");
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (!isRegistered) refetchRoles();
      // Refetch shops so the new beacon appears immediately — and once more after
      // ~1.5 s as a backstop for fullnode indexing lag (the multiGetObjects call
      // can miss a just-created object on a cold cache).
      window.dispatchEvent(new CustomEvent("bazar-soft-refresh"));
      setTimeout(() => window.dispatchEvent(new CustomEvent("bazar-soft-refresh")), 1500);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
    } finally { setLoading(false); }
  }

  const inventoryTypeIds = new Set(inventory.map(it => it.typeId));
  const allListingsFromInventory = listings.every(l => l.itemTypeId === 0 || inventoryTypeIds.has(l.itemTypeId));
  const hasFilledListing = listings.some(l => l.itemTypeId !== 0);
  const hasFilledPair = pairs.some(p => p.offeredTypeId !== 0 && p.requestedTypeId !== 0);
  const isStep3 = step === 3;
  const showVolumeBar = volumeLimit > 0;
  const volumePct = showVolumeBar ? Math.min(100, Math.round((usedVolume / volumeLimit) * 100)) : 0;

  // MIS (Mission) is a distinct on-chain object with its own 6-step flow — once
  // the user picks MIS at the kind selector (step 1) and advances, the dedicated
  // MissionWizard takes over the modal (its own header / step-dots / actions).
  // The already-resolved SSU + cap + wallet context is handed down so the wizard
  // doesn't re-resolve it.
  if (kind === "MIS" && step >= 2) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
          <MissionWizard
            onClose={onClose}
            onBack={() => setStep(1)}
            selectedShopSsuId={selectedShopSsuId}
            ssuGovId={ssuGovId ?? ""}
            memberRegistryId={shared?.memberRegistryId ?? ""}
            bazaarType={govConfig?.bazaarType ?? 0}
            tribeId={govConfig?.tribeId ?? 0}
            tribeGovId={tribeGovId ?? null}
            ledgerId={tribeEconomyIds?.ledgerId ?? null}
            walletAddress={walletAddress ?? ""}
            characterId={characterId ?? undefined}
            charCapRef={charCapRef}
            isSSUOwner={!!isSSUOwner}
            ssuOwnerCapRef={ssuOwnerCapRef ?? undefined}
            ssuOwnerCapLoading={ssuOwnerCapLoading}
            displayCurrency={displayCurrency}
            priceScale={priceScale}
            eveBalance={eveBalance}
            tribeTokenBalance={tribeTokenBalance}
            isRegistered={isRegistered}
            refetchRoles={refetchRoles}
            playerPositionRef={playerPositionRef}
            playerPosition={playerPosition}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${isStep3 ? "modal--xl" : "modal--wide"}`} onClick={e => e.stopPropagation()} onDragOver={e => e.preventDefault()} onDrop={e => e.preventDefault()}>
        <div className="modal__header">
          <h3>{step === 0 ? "Create Shop — Choose SSU" : `Create Shop — Step ${step} of 4`}</h3>
          <div className="step-dots">
            {(hasMultipleSsus ? [0, 1, 2, 3, 4] as Step[] : [1, 2, 3, 4] as Step[]).map(s => (
              <span key={s} className={`step-dot ${step >= s ? "step-dot--active" : ""}`} />
            ))}
          </div>
        </div>

        {step === 0 && (
          <Step0 bazarSsuIds={bazarSsuIds} selectedShopSsuId={selectedShopSsuId} setSelectedShopSsuId={setSelectedShopSsuId} />
        )}

        {step === 1 && (
          <Step1 kind={kind} setKind={setKind} displayCurrency={displayCurrency} bazaarType={bazaarType} />
        )}

        {step === 2 && (
          <Step2 title={title} setTitle={setTitle} />
        )}

        {step === 3 && (
          <div className={kind === "WTB" ? "step" : "step step--split"}>
            {/* Inventory panel (left side) — hidden for WTB shops, where the
                buyer searches for items to BUY rather than picking from their
                own inventory. WTBEditor renders full-width with a manual
                ItemTypeSearch in each empty listing slot. */}
            {kind !== "WTB" && (
            <div className="inventory-panel">
              <div className="inventory-panel__header">
                <span className="inventory-panel__title">
                  {isSSUOwner ? "Your Main Storage" : "Your Inventory"}
                </span>
              </div>
              {walletAddress && (
                <div className="inventory-panel__user-context">
                  <span className="muted" style={{ fontSize: "0.72rem" }}>Viewing as: <strong>{abbreviateAddress(walletAddress)}</strong></span>
                  <span className="muted" style={{ fontSize: "0.68rem" }}>Items in your personal storage on this SSU.</span>
                </div>
              )}
              {showVolumeBar && (
                <div style={{ padding: "0.4rem 0.5rem 0" }}>
                  <div className="volume-bar" style={{ height: 6 }}><div className="volume-bar__fill" style={{ width: `${volumePct}%` }} /></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", marginTop: 2 }}>
                    <span className="muted">Storage</span>
                    <span className="muted">{usedVolume.toLocaleString()} / {volumeLimit.toLocaleString()} ({volumePct}%)</span>
                  </div>
                </div>
              )}
              {invLoading ? (
                <div className="inventory-panel__empty muted">Loading inventory...</div>
              ) : inventory.length === 0 ? (
                <div className="inventory-panel__empty muted">No items in SSU inventory.</div>
              ) : (
                <div className="inventory-panel__list">
                  {inventory.map(item => (
                    <InventoryItemCard key={item.typeId} item={item} typeInfo={itemTypes.get(item.typeId)}
                      isSelected={selectedItem?.typeId === item.typeId} onClick={() => handleInventoryClick(item)}
                      ownedItem={ownedByTypeId.get(item.typeId)} />
                  ))}
                </div>
              )}
              <div className="inventory-panel__footer muted">
                {selectedItem ? `"${itemTypes.get(selectedItem.typeId)?.name ?? `#${selectedItem.typeId}`}" selected — click a slot to fill it` : "Click an item, then click a slot to fill it"}
              </div>
            </div>
            )}
            {kind !== "WTB" && <div className="step__divider" />}
            {kind === "WTS" && <WTSEditor listings={listings} showManualListing={showManualListing} dragOverSlot={dragOverSlot}
              selectedItem={selectedItem} itemTypes={itemTypes} ownedByTypeId={ownedByTypeId} displayCurrency={displayCurrency}
              wtsTax={wtsTax}
              onListingDrop={onListingDrop} onDragOver={k => setDragOverSlot(k)} onDragLeave={() => setDragOverSlot(null)}
              onApplySelected={applySelectedToListing} onUpdateListing={updateListing} onClearListingItem={clearListingItem}
              onToggleManual={i => setShowManualListing(m => m.map((v, idx) => idx === i ? !v : v))}
              onRemoveListing={removeListing} onAddListing={addListing} />}
            {kind === "WTB" && <WTBEditor listings={listings} showManualListing={showManualListing} dragOverSlot={dragOverSlot}
              selectedItem={selectedItem} itemTypes={itemTypes} displayCurrency={displayCurrency}
              wtbItemsCostScaled={itemsCostScaled} wtbTax={wtbTax} wtbExceedsCapacity={wtbExceedsCapacity}
              wtbTotalVolume={wtbTotalVolume} remainingCapacity={remainingCapacity} creatorRole={creatorRole} eveBalance={eveBalance}
              bazaarType={govConfig?.bazaarType} tribeTokenBalance={tribeTokenBalance}
              tribeTokenDecimals={tribeTokenDecimals}
              onListingDrop={onListingDrop} onDragOver={k => setDragOverSlot(k)} onDragLeave={() => setDragOverSlot(null)}
              onApplySelected={applySelectedToListing} onUpdateListing={updateListing} onClearListingItem={clearListingItem}
              onToggleManual={i => setShowManualListing(m => m.map((v, idx) => idx === i ? !v : v))}
              onRemoveListing={removeListing} onAddListing={addListing} />}
            {kind === "DE" && <DEEditor pairs={pairs} showManualPairOffer={showManualPairOffer} showManualPairWant={showManualPairWant}
              dragOverSlot={dragOverSlot} selectedItem={selectedItem} itemTypes={itemTypes}
              displayCurrency={displayCurrency} deTax={deTax}
              onPairDrop={onPairDrop} onDragOver={k => setDragOverSlot(k)} onDragLeave={() => setDragOverSlot(null)}
              onApplySelectedToPair={applySelectedToPair} onUpdatePair={updatePair} onUpdatePairLot={updatePairLot} onClearPairSide={clearPairSide}
              onToggleOfferManual={i => setShowManualPairOffer(m => m.map((v, idx) => idx === i ? !v : v))}
              onToggleWantManual={i => setShowManualPairWant(m => m.map((v, idx) => idx === i ? !v : v))}
              onRemovePair={removePair} onAddPair={addPair} />}
            {kind === "FREE" && <FREEEditor listings={listings} showManualListing={showManualListing} dragOverSlot={dragOverSlot}
              selectedItem={selectedItem} itemTypes={itemTypes} displayCurrency={displayCurrency}
              claimLimitPerUser={claimLimitPerUser} coinGiveawayAmount={coinGiveawayAmount} coinClaimLimitPerUser={coinClaimLimitPerUser}
              allowedRoles={allowedRoles} onListingDrop={onListingDrop} onDragOver={k => setDragOverSlot(k)}
              onDragLeave={() => setDragOverSlot(null)} onApplySelected={applySelectedToListing}
              onUpdateListing={updateListing} onClearListingItem={clearListingItem}
              onToggleManual={i => setShowManualListing(m => m.map((v, idx) => idx === i ? !v : v))}
              onRemoveListing={removeListing} onAddListing={addListing}
              onSetClaimLimit={setClaimLimitPerUser} onSetCoinGiveaway={setCoinGiveawayAmount}
              onSetCoinClaimLimit={setCoinClaimLimitPerUser} onSetAllowedRoles={setAllowedRoles} />}
          </div>
        )}

        {step === 3 && (
          <Step3Banners kind={kind} inventory={inventory} hasFilledListing={hasFilledListing}
            hasFilledPair={hasFilledPair} allListingsFromInventory={allListingsFromInventory}
            coinGiveawayAmount={coinGiveawayAmount} />
        )}

        {step === 4 && (
          <ReviewStep
            kind={kind} title={title}
            listings={listings} pairs={pairs} displayCurrency={displayCurrency}
            bazaarType={govConfig?.bazaarType}
            wtbItemsCostScaled={itemsCostScaled} wtbTax={wtbTax}
            claimLimitPerUser={claimLimitPerUser} coinGiveawayAmount={coinGiveawayAmount}
            coinClaimLimitPerUser={coinClaimLimitPerUser} allowedRoles={allowedRoles}
            error={error}
          />
        )}

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={step === 0 || step === 1 ? onClose : () => setStep(s => (s - 1) as Step)}>
            {step === 0 || step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 4
            ? <button className="btn btn--primary"
                disabled={
                  (step === 0 && !selectedShopSsuId) ||
                  (step === 3 && kind === "WTS" && (!hasFilledListing || !allListingsFromInventory)) ||
                  (step === 3 && kind === "WTS" && inventory.length === 0) ||
                  // V25 — FREE shops can be items, money giveaway, or both.
                  // Block step 3 → 4 only if both are empty.
                  (step === 3 && kind === "FREE" && !hasFilledListing && coinGiveawayAmount <= 0) ||
                  (step === 3 && kind === "FREE" && hasFilledListing && !allListingsFromInventory) ||
                  (step === 3 && kind === "WTB" && !hasFilledListing) ||
                  (step === 3 && kind === "DE" && !hasFilledPair)
                }
                onClick={() => setStep(s => (s + 1) as Step)}>
                Next
              </button>
            : <button className="btn btn--primary" onClick={handleSubmit} disabled={loading}>
                {loading ? "Publishing..." : "Publish Shop"}
              </button>
          }
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
