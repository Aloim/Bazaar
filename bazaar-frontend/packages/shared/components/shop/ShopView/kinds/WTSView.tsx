// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/ShopView.tsx (lines 82-274; split for 500-line guard, section: WTSView).
// Re-imported into ../index.tsx.

import { useState, useEffect } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { useGatedTransaction } from "@bazaar/shared/hooks/announcements";
import type { Shop, Listing } from "@bazaar/shared/types";
import { buildWTSBuy, resolveSSUOwnerCap } from "@bazaar/shared/tx";
import type { SSUOwnerCapRef } from "@bazaar/shared/tx/bazaarcore/ssu-receiving-tx";
import { Transaction } from "@mysten/sui/transactions";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";
import {
  SSU_OBJECT_ID, COIN_DECIMALS, ROLE_LABEL,
} from "@bazaar/shared/constants";
import { useItemTypes } from "@bazaar/shared/hooks";
import { useToast } from "@bazaar/shared/components";
import { useClaimBoxContext } from "@bazaar/shared/contexts";
import { useBalances } from "@bazaar/shared/hooks";
import { usePlayerCharacter } from "@bazaar/shared/hooks";
import { useRoles, useOwnedCaps } from "@bazaar/shared/hooks";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useBazaarType } from "@bazaar/shared/hooks/useBazaarType";
import { useLockerCapacity, lockerWouldOverflow } from "@bazaar/shared/hooks/useLockerCapacity";
import { useSolarSystemName } from "@bazaar/shared/hooks/useSolarSystemName";
import { useCharacterOwnerCapRef } from "@bazaar/shared/hooks/useCharacterOwnerCapRef";
import type { EscrowListingRef } from "@bazaar/shared/tx/bazaarcore/shop-tx";
import { TaxIndicator, type TaxLayer } from "@bazaar/shared/components/widgets/TaxIndicator";
import { useShopTaxBreakdown } from "@bazaar/shared/hooks/bazaarcore/useShopTaxBreakdown";
import { useSSUGovernanceConfig } from "@bazaar/shared/hooks";
import { useSSURoleTaxTable } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import { useTribeGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useTribeEconomyObjects, useTribeTokenBalance } from "@bazaar/shared/hooks";
import { buildLedgerWTSBuy } from "@bazaar/shared/tx/bazaareconomy/ledger-shop-tx";
import type { EscrowListingRef as LedgerEscrowListingRef } from "@bazaar/shared/tx/bazaareconomy/ledger-shop-tx";
import { formatTribeAmount, TRIBE_TOKEN_DECIMALS } from "@bazaar/shared/utils/tribeToken";

function buildBpsLayers(ssuBps: number, tribeBps: number, dappBps: number): TaxLayer[] {
  const out: TaxLayer[] = [];
  if (ssuBps   > 0) out.push({ name: "SSU",   bps: ssuBps });
  if (tribeBps > 0) out.push({ name: "Tribe", bps: tribeBps });
  if (dappBps  > 0) out.push({ name: "DApp",  bps: dappBps });
  return out;
}

export default function WTSView({ shop, refetch, refreshShop }: {
  shop: Shop; refetch: () => void; refreshShop: (id: string) => Promise<void>;
}) {
  const { signGated } = useGatedTransaction();
  const toast = useToast();
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState<number | null>(null);
  const { currencyName } = useClaimBoxContext();
  const displayCurrency = currencyName || "EVE";
  const { character, resolveCapRef } = usePlayerCharacter();
  const { walletAddress } = useConnection();
  const targetSsuId = shop.ssuId || SSU_OBJECT_ID;
  const { characterId } = useCharacterOwnerCapRef(walletAddress ?? undefined, targetSsuId);
  const { ssuRole, rawSSURole, isRegistered, isLoading: rolesLoading, tribeRole } = useRoles(targetSsuId);
  const { ownerCapId: govOwnerCapId } = useOwnedCaps();
  const [isSsuOwner, setIsSsuOwner] = useState(false);
  // W3-3 (V27): cache the resolved SSUOwnerCapRef so buildWTSBuy can route the
  // post-buy payout through deposit_by_owner<StorageUnit> when buyer == SSU owner.
  const [ssuOwnerCapRef, setSsuOwnerCapRef] = useState<SSUOwnerCapRef | null>(null);
  const [error, setError] = useState<string>("");
  const { data: shared } = useSSUSharedObjects(targetSsuId);
  const ssuGovId = shared?.ssuGovId;
  const { bazaarType } = useBazaarType(targetSsuId);
  const { data: govConfig } = useSSUGovernanceConfig(ssuGovId ?? null);
  // V16 Session 3C: WTS tax is keyed on the BUYER's role (ctx.sender() Move-side).
  // SSU pct from useSSURoleTaxTable[ssuRole]; tribe pct from useTribeRoleTaxTable[tribeRole]
  // (resolved inside useShopTaxBreakdown). Buyer role = the connected wallet's role at this SSU.
  const roleName = ROLE_LABEL[ssuRole] ?? "Stranger";
  const { data: ssuRoleTaxes } = useSSURoleTaxTable(ssuGovId ?? null);
  const wtsTaxBps = ssuRoleTaxes?.[ssuRole]?.wtsPct ?? 0;
  // Advanced (bazaarType === 2) WTS tax is SSU + Tribe only — DApp tax is Exchange-only.
  const wtsTax = useShopTaxBreakdown({ kind: "wts", ssuBpsOrFee: wtsTaxBps, tribeId: govConfig?.tribeId ?? 0, tribeRole, grossOrUnits: 0, excludeDapp: shop.bazaarType === 2 });
  const tribeIdStr = govConfig?.tribeId ? String(govConfig.tribeId) : null;
  const { data: tribeGovId } = useTribeGovId(tribeIdStr);
  const { data: economyIds } = useTribeEconomyObjects(tribeIdStr);
  const { data: tokenBal } = useTribeTokenBalance(economyIds?.ledgerId ?? null, walletAddress ?? null);
  const tokenDecimals = tokenBal?.decimals ?? TRIBE_TOKEN_DECIMALS;

  useEffect(() => {
    if (!character) { setIsSsuOwner(false); setSsuOwnerCapRef(null); return; }
    let aborted = false;
    resolveSSUOwnerCap(character.characterId, targetSsuId)
      .then(cap => {
        if (aborted) return;
        setIsSsuOwner(cap !== null);
        setSsuOwnerCapRef(cap);
      })
      .catch(() => {
        if (aborted) return;
        setIsSsuOwner(false);
        setSsuOwnerCapRef(null);
      });
    return () => { aborted = true; };
  }, [character, targetSsuId]);

  // Phase 3 capacity guard: the buyer receives items into their locker at the
  // SELLER's SSU. Pre-flight that locker so a full one fails with a friendly
  // message instead of an opaque Move abort. Key = SSU OwnerCap when the buyer
  // owns this SSU (Main Storage), else their global character locker.
  const isCrossSSU = !!targetSsuId && !!SSU_OBJECT_ID && targetSsuId !== SSU_OBJECT_ID;
  const buyerLockerKey = (isSsuOwner && ssuOwnerCapRef)
    ? ssuOwnerCapRef.ssuCapId
    : character?.ownerCapId;
  const { data: lockerCap } = useLockerCapacity(targetSsuId, buyerLockerKey ?? undefined);
  const { info: sellerSystem } = useSolarSystemName(isCrossSSU ? targetSsuId : undefined);

  // OS-29: useTribeCoins deleted. buildWTSBuy uses splitEveCoin() Coin<EVE> pattern (V7).
  const { eveBalance, isLoading: coinsLoading } = useBalances();
  const listingTypeIds = (shop.listings as Listing[]).map(l => l.itemTypeId);
  const itemTypes = useItemTypes(listingTypeIds);
  function itemName(typeId: number): string { return itemTypes.get(typeId)?.name ?? `Item #${typeId}`; }

  async function buy(idx: number) {
    const qty = qtys[idx] ?? 1;
    const listing = shop.listings[idx] as Listing;
    const required = listing.priceTribe * qty;
    if (!shared || !ssuGovId || !bazaarType) {
      setError("Loading SSU governance — please wait.");
      return;
    }
    // Capacity guard: block when the destination locker is known-full (fail-open
    // otherwise — a non-existent locker is lazily created at payout).
    if (lockerWouldOverflow(lockerCap)) {
      setError(isCrossSSU
        ? `Your locker at the seller's SSU${sellerSystem ? ` (${sellerSystem.name})` : ""} is full — free up space there before buying, then fly over to collect.`
        : "Your locker is full — free up space before buying.");
      return;
    }
    if (bazaarType === "Advanced") {
      if (!tribeGovId || !economyIds?.ledgerId) {
        setError("Loading tribe economy — please wait."); return;
      }
      const grossTokens = listing.priceTribe * qty;
      if ((tokenBal?.balance ?? 0) < grossTokens) {
        setError(`Insufficient ${displayCurrency} balance. Visit the Exchange to swap EVE for tokens.`); return;
      }
      if (!characterId) { setError("Resolving character — please wait."); return; }
      setLoading(idx); setError("");
      try {
        const advTx = new Transaction();
        buildLedgerWTSBuy({
          shopId:           shop.id,
          listingIdx:       idx,
          quantity:         qty,
          ledgerId:         economyIds.ledgerId,
          ssuGovId:         ssuGovId!,
          tribeGovId,
          memberRegistryId: shared.memberRegistryId,
          payoutItems:      [{ typeId: listing.itemTypeId, quantity: qty } as LedgerEscrowListingRef],
          characterId:      characterId ?? undefined,
          ssuId:            targetSsuId,
          // W3-3 parity: route payout to Main Storage when buyer == SSU owner.
          asSSUOwner:       isSsuOwner && !!ssuOwnerCapRef,
          ssuOwnerCapRef:   ssuOwnerCapRef ?? undefined,
        }, advTx);
        await signGated(advTx);
        await refreshShop(shop.id); refetch();
        toast.success("Purchase successful", { detail: `Bought ${qty} × ${itemName(listing.itemTypeId)}.` });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Transaction failed.");
      } finally {
        setLoading(null);
      }
      return;
    }
    if (!shared.userStorageId) {
      setError("Resolving SSU shared objects — please wait.");
      return;
    }
    // V36 Easy: wts_buy_tribe needs the TribeGovernance object — block until it resolves.
    if (bazaarType === "Easy" && !tribeGovId) {
      setError("Resolving tribe governance — please wait, then try again.");
      return;
    }
    setLoading(idx);
    setError("");
    const tx = new Transaction();
    let split;
    try {
      split = await splitEveCoin(walletAddress!, BigInt(required), tx);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Insufficient EVE balance.");
      setLoading(null);
      return;
    }
    try {
      buildWTSBuy({
        shopId:            shop.id,
        listingIdx:        idx,
        quantity:          qty,
        paymentAmountMist: required,
        paymentCoin:       split.coinArg,
        ssuGovId,
        memberRegistryId:  shared.memberRegistryId,
        userStorageId:     shared.userStorageId,
        bazaarType:        bazaarType.toLowerCase() as "notribe" | "easy",
        // V36 Easy: wts_buy_tribe takes &mut TribeGovernance after ssu_gov.
        tribeGovId:        tribeGovId ?? undefined,
        payoutItems: [{ typeId: listing.itemTypeId, quantity: qty } as EscrowListingRef],
        characterId: characterId ?? undefined,
        ssuId: targetSsuId,
        // W3-3: route Main Storage when buyer == SSU owner.
        asSSUOwner: isSsuOwner && !!ssuOwnerCapRef,
        ssuOwnerCapRef: ssuOwnerCapRef ?? undefined,
      }, tx);
      await signGated(tx);
      await refreshShop(shop.id);
      refetch();
      toast.success("Purchase successful", { detail: `Bought ${qty} × ${itemName(listing.itemTypeId)}.` });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="shop-view__listings">
      {error && <div className="currency-selector__warning" style={{ marginBottom: "0.5rem" }}>{error}</div>}
      <div style={{ marginBottom: "0.5rem" }}>
        <TaxIndicator
          mode="bps"
          totalBps={wtsTax.totalBpsOrFee}
          currency={displayCurrency}
          label="Tax"
          contextNote={`(${roleName})`}
          layers={buildBpsLayers(wtsTax.ssuBpsOrFee, wtsTax.tribeBpsOrFee, wtsTax.dappBps)}
        />
      </div>
      <table className="table">
        <thead><tr><th>Item</th><th>Available</th><th>Price / unit</th><th>Qty</th><th>Total</th><th></th></tr></thead>
        <tbody>
          {shop.listings.map((l: Listing, i: number) => {
            const purchaseQty = qtys[i] ?? 1;
            const totalCost   = l.priceTribe * purchaseQty;
            // canAfford branches by bazaar type. Advanced WTS debits the
            // buyer's tribe-token ledger row (raw 0-decimal); NoTribe/Easy
            // pulls Coin<EVE> from the wallet (MIST 9-decimal). totalCost
            // is in matching units because shop.listings.priceTribe is parsed
            // raw from on-chain (`useShops.ts`) — Move-side it is raw token
            // count for Advanced shops and MIST for NoTribe/Easy shops.
            const buyerBalance = shop.bazaarType === 2 ? (tokenBal?.balance ?? 0) : eveBalance;
            const canAfford   = buyerBalance >= totalCost;
            return (
              <tr key={i} className={l.quantity === 0 ? "row--sold-out" : ""}>
                <td>{itemName(l.itemTypeId)}</td>
                <td>{l.quantity === 0 ? <span className="muted">Sold out</span> : l.quantity}</td>
                <td><span>{shop.bazaarType === 2
                  ? formatTribeAmount(l.priceTribe, { decimals: tokenDecimals })
                  : (l.priceTribe / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span><span className="muted" style={{ fontSize: "0.8em", marginLeft: "0.25rem" }}>{displayCurrency}</span></td>
                <td><input type="number" min={1} max={l.quantity} className="input input--xs" placeholder="0" value={purchaseQty === 0 ? "" : purchaseQty}
                  onChange={e => { const v = e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0); setQtys(q => ({ ...q, [i]: v })); }} disabled={l.quantity === 0} /></td>
                <td><span style={{ fontWeight: 600 }}>{shop.bazaarType === 2
                  ? formatTribeAmount(totalCost, { decimals: tokenDecimals })
                  : (totalCost / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span><span className="muted" style={{ fontSize: "0.8em", marginLeft: "0.25rem" }}>{displayCurrency}</span></td>
                <td><button className="btn btn--primary btn--sm" disabled={l.quantity === 0 || loading === i || coinsLoading || rolesLoading || !canAfford} onClick={() => buy(i)}>
                  {loading === i ? "..." : "Buy"}
                </button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
