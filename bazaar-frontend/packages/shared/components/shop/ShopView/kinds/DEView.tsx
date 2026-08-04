// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/ShopView.tsx (lines 399-608; split for 500-line guard, section: DEView).
// Re-imported into ../index.tsx.

import { useState, useEffect, useMemo } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useGatedTransaction } from "@bazaar/shared/hooks/announcements";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";
import type { Shop, ExchangePair } from "@bazaar/shared/types";
import { buildDEExchange, resolveSSUOwnerCap } from "@bazaar/shared/tx";
import {
  SSU_OBJECT_ID, COIN_DECIMALS, ROLE_LABEL,
} from "@bazaar/shared/constants";
import { useItemTypes } from "@bazaar/shared/hooks";
import { useToast } from "@bazaar/shared/components";
import { useClaimBoxContext } from "@bazaar/shared/contexts";
import { useBalances } from "@bazaar/shared/hooks";
import { usePlayerCharacter } from "@bazaar/shared/hooks";
import { useRoles } from "@bazaar/shared/hooks";
import { useRecipientCharacter, useOwnedInventory } from "@bazaar/shared/hooks";
import { useSSUSharedObjects, useTribeGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useBazaarType } from "@bazaar/shared/hooks/useBazaarType";
import { useTribeEconomyObjects, useTribeTokenBalance } from "@bazaar/shared/hooks";
import { useSSUGovernanceConfig } from "@bazaar/shared/hooks";
import { useSSURoleTaxTable } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import { useTribeRoleTaxTable } from "@bazaar/shared/hooks/bazaarcore/tribe-governance-hooks";
import { buildLedgerDEExchange } from "@bazaar/shared/tx/bazaareconomy/ledger-shop-tx";
import type { EscrowListingRef as LedgerEscrowListingRef } from "@bazaar/shared/tx/bazaareconomy/ledger-shop-tx";
import { useCharacterOwnerCapRef } from "@bazaar/shared/hooks/useCharacterOwnerCapRef";
import { useLockerCapacity, lockerWouldOverflow } from "@bazaar/shared/hooks/useLockerCapacity";
import { useSolarSystemName } from "@bazaar/shared/hooks/useSolarSystemName";
import type { EscrowListingRef } from "@bazaar/shared/tx/bazaarcore/shop-tx";
import { TaxIndicator, type TaxLayer } from "@bazaar/shared/components/widgets/TaxIndicator";
import { formatTribeAmount, TRIBE_TOKEN_DECIMALS } from "@bazaar/shared/utils/tribeToken";
import { useDAppTaxConfig } from "@bazaar/shared/hooks/dapp_hub/governance-config-hooks";
import { resolveDAppTaxBps } from "@bazaar/shared/utils/dappTaxResolution";
import { computeTaxBreakdownFlat } from "@bazaar/shared/utils/computeTaxBreakdown";

export default function DEView({ shop, refetch, refreshShop }: {
  shop: Shop; refetch: () => void; refreshShop: (id: string) => Promise<void>;
}) {
  const { signGated } = useGatedTransaction();
  const toast = useToast();
  const [loading, setLoading] = useState<number | null>(null);
  // Bundle DE — how many whole bundles to take per pair (1..bundles remaining).
  // A bundle is `offerPerLot` offered items for `requestedQty` requested items.
  const [bundlesByPair, setBundlesByPair] = useState<Record<number, number>>({});
  const { currencyName } = useClaimBoxContext();
  const displayCurrency = currencyName || "EVE";
  const { character } = usePlayerCharacter();
  const targetSsuId = shop.ssuId || SSU_OBJECT_ID;
  const { ssuRole, tribeRole } = useRoles(targetSsuId);
  // OS-29: useTribeCoins deleted. buildDEExchange uses splitEveCoin() Coin<EVE> pattern (V7).
  const { eveBalance, isLoading: coinsLoading } = useBalances();
  // V16 Session 3C: DE flat fee is keyed on the EXCHANGER's role (ctx.sender() Move-side).
  const roleName = ROLE_LABEL[ssuRole] ?? "Stranger";
  const [error, setError] = useState<string>("");
  const { data: shared } = useSSUSharedObjects(targetSsuId);
  const ssuGovId = shared?.ssuGovId;
  const { bazaarType } = useBazaarType(targetSsuId);
  const { walletAddress } = useConnection();
  const { characterId, charCapRef } = useCharacterOwnerCapRef(walletAddress ?? undefined, targetSsuId);
  const { data: govConfig } = useSSUGovernanceConfig(ssuGovId ?? null);
  const { data: ssuRoleTaxes } = useSSURoleTaxTable(ssuGovId ?? null);
  const deFee = ssuRoleTaxes?.[ssuRole]?.deFlatFee ?? 0;
  const tribeIdStr = govConfig?.tribeId ? String(govConfig.tribeId) : null;
  const { data: tribeGovId } = useTribeGovId(tribeIdStr);
  const { data: economyIds } = useTribeEconomyObjects(tribeIdStr);
  const { data: tokenBal } = useTribeTokenBalance(economyIds?.ledgerId ?? null, walletAddress ?? null);
  const tokenDecimals = tokenBal?.decimals ?? TRIBE_TOKEN_DECIMALS;
  // V26+ DE fee unit fix: Advanced bazaar deFee is in scaled tribe-token units, not MIST.
  const feeDecimals = shop.bazaarType === 2 ? tokenDecimals : 9;
  const { data: tribeRoleTaxes } = useTribeRoleTaxTable(tribeGovId ?? null);
  const tribeDeFlatFee = tribeRoleTaxes?.[tribeRole]?.deFlatFee ?? 0;
  // AUD-ET-01: tribe-bound shops charge SSU + Tribe flat fees — Easy (1) in EVE,
  // Advanced (2) in tribe tokens. Move's easy entry asserts payment ≥ ssu+tribe,
  // so sizing the Easy payment SSU-only aborted every Easy DE with a tribe fee.
  const tribeFeeApplies = shop.bazaarType === 1 || shop.bazaarType === 2;
  const totalFeeDisplay = deFee + (tribeFeeApplies ? tribeDeFlatFee : 0);
  // AUD-NT-16/ET-03: Move carves the DApp share OUT of the EVE flats (payer total
  // unchanged) — attribute layers as recipient nets + the DApp carve. Advanced DE
  // (token-side) genuinely has no DApp layer.
  const { data: dappTaxCfg } = useDAppTaxConfig();
  const deDappBps = resolveDAppTaxBps({
    kind: "de", excludeDapp: shop.bazaarType === 2,
    tribeId: govConfig?.tribeId ?? 0, config: dappTaxCfg,
  });
  const feeCarve = computeTaxBreakdownFlat(1, deFee, tribeFeeApplies ? tribeDeFlatFee : 0, deDappBps);
  const [isTraderSsuOwner, setIsTraderSsuOwner] = useState(false);
  const [traderSsuCap, setTraderSsuCap] = useState<{ssuCapId:string;ssuCapVersion:string;ssuCapDigest:string}|null>(null);

  // Barter give-leg: the exchanger delivers the REQUESTED items to the shop owner.
  // Resolve the shop owner's character (deposit target) + the exchanger's own locker
  // holdings (to gate affordability of the requested side).
  const { characterId: recipientCharacterId, isLoading: recipientLoading } =
    useRecipientCharacter(shop.owner, targetSsuId);
  const { items: ownedItems } = useOwnedInventory(targetSsuId);
  const heldByType = useMemo(() => {
    const m = new Map<number, number>();
    for (const it of ownedItems) m.set(it.typeId, (m.get(it.typeId) ?? 0) + it.quantity);
    return m;
  }, [ownedItems]);

  useEffect(() => {
    if (!character) { setIsTraderSsuOwner(false); setTraderSsuCap(null); return; }
    let aborted = false;
    resolveSSUOwnerCap(character.characterId, targetSsuId)
      .then(cap => { if (!aborted) { setIsTraderSsuOwner(cap !== null); setTraderSsuCap(cap); } })
      .catch(() => { if (!aborted) { setIsTraderSsuOwner(false); setTraderSsuCap(null); } });
    return () => { aborted = true; };
  }, [character, targetSsuId]);

  // Phase 3 capacity guard: the exchanger receives the OFFERED items into their
  // locker at the seller's SSU. Pre-flight so a full locker fails friendly.
  const isCrossSSU = !!targetSsuId && !!SSU_OBJECT_ID && targetSsuId !== SSU_OBJECT_ID;
  const exchangerLockerKey = (isTraderSsuOwner && traderSsuCap)
    ? traderSsuCap.ssuCapId
    : character?.ownerCapId;
  const { data: lockerCap } = useLockerCapacity(targetSsuId, exchangerLockerKey ?? undefined);
  const { info: sellerSystem } = useSolarSystemName(isCrossSSU ? targetSsuId : undefined);

  const pairTypeIds = (shop.pairs as ExchangePair[]).flatMap(p => [p.offeredTypeId, p.requestedTypeId]);
  const itemTypes = useItemTypes(pairTypeIds);
  function itemName(typeId: number): string { return itemTypes.get(typeId)?.name ?? `Item #${typeId}`; }

  async function exchange(idx: number) {
    if (!shared || !ssuGovId || !bazaarType) {
      setError("Loading SSU governance — please wait.");
      return;
    }
    // Capacity guard: block when the destination locker is known-full (fail-open
    // otherwise — a non-existent locker is lazily created at payout).
    if (lockerWouldOverflow(lockerCap)) {
      setError(isCrossSSU
        ? `Your locker at the seller's SSU${sellerSystem ? ` (${sellerSystem.name})` : ""} is full — free up space there before exchanging, then fly over to collect.`
        : "Your locker is full — free up space before exchanging.");
      return;
    }
    const pair = shop.pairs[idx] as ExchangePair;
    // Bundle DE: a bundle is `offerPerLot` offered items for `requestedQty` requested
    // items. `units` (offered items taken = bundles × offerPerLot) is what Move
    // decrements; `offeredQty` is the remaining offered stock.
    const lotSize = Math.max(1, pair.offerPerLot || 1);
    const lotsAvailable = Math.floor((pair.offeredQty || 0) / lotSize);
    if (lotsAvailable < 1) { setError("This bundle is sold out."); return; }
    // Clamp to what's in stock. The input is clamped on entry too, but stock can
    // drop between a refetch and submit, so re-clamp here rather than over-request.
    const bundles = Math.max(1, Math.min(bundlesByPair[idx] ?? 1, lotsAvailable));
    const units = bundles * lotSize;
    const requestedNeeded = pair.requestedQty * bundles;
    // Barter affordability: the exchanger must hold the requested items to give.
    const held = heldByType.get(pair.requestedTypeId) ?? 0;
    if (requestedNeeded > 0 && held < requestedNeeded) {
      setError(`You need ${requestedNeeded}× ${itemName(pair.requestedTypeId)} to exchange (you have ${held}).`);
      return;
    }
    // Barter give-leg guards (apply to every bazaar type).
    if (!characterId) { setError("Resolving character — please wait."); return; }
    // The give-leg needs the shop owner's character as the delivery target.
    if (pair.requestedQty > 0 && (recipientLoading || !recipientCharacterId)) {
      setError("Resolving shop owner's character — please wait."); return;
    }
    // Non-owner exchangers withdraw the requested items from their Player Locker
    // and therefore need their Character OwnerCap ref.
    if (pair.requestedQty > 0 && !isTraderSsuOwner && !charCapRef) {
      setError("Resolving your character cap — please wait. If this persists, dock to the SSU and retry."); return;
    }
    const giveItems = requestedNeeded > 0
      ? [{ typeId: pair.requestedTypeId, quantity: requestedNeeded }]
      : [];
    // The exchanger receives `units` offered items (offerPerLot per bundle × bundles).
    const receiveItems = [{ typeId: pair.offeredTypeId, quantity: units }];
    if (bazaarType === "Advanced") {
      if (!tribeGovId || !economyIds?.ledgerId) {
        setError("Loading tribe economy — please wait."); return;
      }
      const totalTokenFee = (deFee + tribeDeFlatFee) * units;
      if ((tokenBal?.balance ?? 0) < totalTokenFee) {
        setError(`Insufficient ${displayCurrency} balance for exchange fee.`); return;
      }
      setLoading(idx); setError("");
      try {
        const advTx = new Transaction();
        buildLedgerDEExchange({
          shopId:               shop.id,
          pairIdx:              idx,
          units, // V31 partial DE — # offered items taken
          ledgerId:             economyIds.ledgerId,
          ssuGovId:             ssuGovId!,
          tribeGovId,
          memberRegistryId:     shared.memberRegistryId,
          payoutItems:          receiveItems as LedgerEscrowListingRef[],
          giveItems:            giveItems as LedgerEscrowListingRef[],
          characterId:          characterId ?? undefined,
          ssuId:                targetSsuId,
          recipientCharacterId: recipientCharacterId ?? undefined,
          charCapRef:           charCapRef ?? undefined,
          asSSUOwner:           isTraderSsuOwner && !!traderSsuCap,
          ssuOwnerCapRef:       traderSsuCap ?? undefined,
        }, advTx);
        await signGated(advTx);
        await refreshShop(shop.id); refetch();
        toast.success("Exchange successful", { detail: `Received ${units} × ${itemName(pair.offeredTypeId)} for ${requestedNeeded} × ${itemName(pair.requestedTypeId)}.` });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Transaction failed.");
      } finally {
        setLoading(null);
      }
      return;
    }
    if (!walletAddress) { setError("Wallet not connected."); return; }
    if (!ssuGovId || !shared?.memberRegistryId) { setError("SSU data still loading — please wait."); return; }
    if (!shared.userStorageId) {
      setError("Resolving SSU shared objects — please wait.");
      return;
    }
    setLoading(idx);
    setError("");
    const tx = new Transaction();
    // AUD-ET-01: Easy must fund ssu_flat + tribe_flat per unit (NoTribe resolves
    // tribe fee 0); Move aborts E_INSUFFICIENT_PAYMENT on an SSU-only coin.
    const feeTotal = totalFeeDisplay * units;
    let split;
    try {
      split = await splitEveCoin(walletAddress, BigInt(feeTotal), tx);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Insufficient EVE balance.");
      setLoading(null);
      return;
    }
    try {
      // NoTribe/Easy DE: true barter (give-leg + offered payout are FE-side, same as
      // Advanced). The de_exchange_* Move call charges the flat EVE fee × units +
      // decrements the pair's offered stock by units (V31 partial DE).
      buildDEExchange({
        shopId:           shop.id,
        pairIdx:          idx,
        units, // V31 partial DE — # offered items taken
        feeAmountMist:    feeTotal,
        feePaymentCoin:   split.coinArg,
        ssuGovId,
        memberRegistryId: shared.memberRegistryId,
        userStorageId:    shared.userStorageId,
        bazaarType:       bazaarType.toLowerCase() as "notribe" | "easy",
        // V36 Easy: de_exchange_tribe takes &mut TribeGovernance after ssu_gov.
        tribeGovId:       tribeGovId ?? undefined,
        payoutItems: receiveItems as EscrowListingRef[],
        giveItems: giveItems as EscrowListingRef[],
        characterId: characterId ?? undefined,
        ssuId: targetSsuId,
        recipientCharacterId: recipientCharacterId ?? undefined,
        charCapRef: charCapRef ?? undefined,
        asSSUOwner: isTraderSsuOwner && !!traderSsuCap,
        ssuOwnerCapRef: traderSsuCap ?? undefined,
      }, tx);
      await signGated(tx);
      await refreshShop(shop.id);
      refetch();
      toast.success("Exchange successful", { detail: `Received ${units} × ${itemName(pair.offeredTypeId)} for ${requestedNeeded} × ${itemName(pair.requestedTypeId)}.` });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setLoading(null);
    }
  }

  const feeLayers: TaxLayer[] = [];
  if (totalFeeDisplay > 0) {
    if (feeCarve.ssuAmount   > 0) feeLayers.push({ name: "SSU",   amount: feeCarve.ssuAmount });
    if (feeCarve.tribeAmount > 0) feeLayers.push({ name: "Tribe", amount: feeCarve.tribeAmount });
    if (feeCarve.dappAmount  > 0) feeLayers.push({ name: "DApp",  amount: feeCarve.dappAmount });
  }

  return (
    <div className="shop-view__listings">
      {error && <div className="currency-selector__warning" style={{ marginBottom: "0.5rem" }}>{error}</div>}
      <div style={{ marginBottom: "0.5rem" }}>
        <TaxIndicator
          mode="flat"
          totalAmount={totalFeeDisplay}
          currency={displayCurrency}
          label="Exchange fee"
          contextNote={`(${roleName})`}
          layers={feeLayers}
          decimals={feeDecimals}
        />
      </div>
      <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 0.5rem" }}>
        Each <strong>bundle</strong> gives a fixed amount of the offered item for a fixed amount of the requested item, plus the flat fee. Choose how many whole bundles to take.
      </p>
      <table className="table">
        <thead><tr><th>Offered</th><th>Bundle</th><th>Bundles</th><th>You get</th><th>You give</th><th>You have</th><th>Fee</th><th></th></tr></thead>
        <tbody>
          {shop.pairs.map((p: ExchangePair, i: number) => {
            const lotSize = Math.max(1, p.offerPerLot || 1);
            const lotsAvailable = Math.floor((p.offeredQty || 0) / lotSize);
            const soldOut = lotsAvailable === 0;
            const bundles = Math.max(1, Math.min(bundlesByPair[i] ?? 1, lotsAvailable || 1));
            const units = bundles * lotSize;
            const requestedNeeded = p.requestedQty * bundles;
            const totalFee = totalFeeDisplay * units;
            const held = heldByType.get(p.requestedTypeId) ?? 0;
            const hasEnough = requestedNeeded === 0 || held >= requestedNeeded;
            const canAffordFee = totalFee === 0 || (shop.bazaarType === 2 ? (tokenBal?.balance ?? 0) >= totalFee : eveBalance >= totalFee);
            const canExchange = !soldOut && hasEnough && canAffordFee;
            return (
              <tr key={i} className={soldOut ? "row--sold-out" : ""}>
                <td>{itemName(p.offeredTypeId)} {soldOut ? <span className="muted">— sold out</span> : <span className="muted">— {lotsAvailable} bundle{lotsAvailable === 1 ? "" : "s"} left</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}>{lotSize} {itemName(p.offeredTypeId)} &#8651; {p.requestedQty} {itemName(p.requestedTypeId)}</td>
                <td><input type="number" min={1} max={lotsAvailable} className="input input--xs" placeholder="1"
                  value={Math.min(bundlesByPair[i] ?? 1, lotsAvailable || 1)} disabled={soldOut}
                  onChange={e => { const raw = e.target.value === "" ? 1 : Math.max(1, parseInt(e.target.value, 10) || 1); const v = Math.min(raw, lotsAvailable || 1); setBundlesByPair(q => ({ ...q, [i]: v })); }} /></td>
                <td style={{ whiteSpace: "nowrap" }}>{units} &times; {itemName(p.offeredTypeId)}</td>
                <td style={{ whiteSpace: "nowrap" }}>{requestedNeeded} &times; {itemName(p.requestedTypeId)}</td>
                <td>
                  <span style={{ color: hasEnough ? "inherit" : "var(--warning, #c8a84b)" }}>{held}</span>
                  {!hasEnough && <div style={{ fontSize: "0.7rem", color: "var(--warning, #c8a84b)", whiteSpace: "nowrap" }}>Need {requestedNeeded}</div>}
                </td>
                <td>{totalFee > 0 ? (<><span style={{ fontWeight: 600 }}>{shop.bazaarType === 2
                  ? formatTribeAmount(totalFee, { decimals: tokenDecimals })
                  : (totalFee / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span><span className="muted" style={{ fontSize: "0.8em", marginLeft: "0.25rem" }}>{displayCurrency}</span>{!canAffordFee && <div style={{ fontSize: "0.7rem", color: "var(--warning, #c8a84b)", whiteSpace: "nowrap" }}>Insufficient</div>}</>) : (<span className="muted">Free</span>)}</td>
                <td><button className="btn btn--primary btn--sm" disabled={soldOut || loading === i || coinsLoading || !canExchange} onClick={() => exchange(i)}>{loading === i ? "..." : "Exchange"}</button></td>
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
