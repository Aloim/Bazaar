// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/ShopView.tsx (lines 277-396; split for 500-line guard, section: WTBView).
// Re-imported into ../index.tsx.

import { useEffect, useState } from "react";
import { useConnection } from "@evefrontier/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useGatedTransaction } from "@bazaar/shared/hooks/announcements";
import { useCharacterOwnerCapRef } from "@bazaar/shared/hooks/useCharacterOwnerCapRef";
import { useRecipientCharacter, usePlayerCharacter, useRoles } from "@bazaar/shared/hooks";
import type { EscrowListingRef } from "@bazaar/shared/tx/bazaarcore/shop-tx";
import type { Shop, Listing } from "@bazaar/shared/types";
import { buildWTBFill, resolveSSUOwnerCap } from "@bazaar/shared/tx";
import type { SSUOwnerCapRef } from "@bazaar/shared/tx/bazaarcore/ssu-receiving-tx";
import {
  SSU_OBJECT_ID, COIN_DECIMALS,
} from "@bazaar/shared/constants";
import { useItemTypes } from "@bazaar/shared/hooks";
import { useToast } from "@bazaar/shared/components";
import { useClaimBoxContext } from "@bazaar/shared/contexts";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useBazaarType } from "@bazaar/shared/hooks/useBazaarType";
import { useSSURoleTaxTable } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import { useTribeRoleTaxTable } from "@bazaar/shared/hooks/bazaarcore/tribe-governance-hooks";
import { TaxIndicator } from "@bazaar/shared/components/widgets/TaxIndicator";
import { useTribeGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useTribeEconomyObjects, useTribeTokenWtbPoolId } from "@bazaar/shared/hooks";
import { useSSUGovernanceConfig } from "@bazaar/shared/hooks";
import { buildLedgerWTBFill } from "@bazaar/shared/tx/bazaareconomy/ledger-shop-tx";
import type { EscrowListingRef as LedgerEscrowListingRef } from "@bazaar/shared/tx/bazaareconomy/ledger-shop-tx";
import { useTribeTokenLedger } from "@bazaar/shared/hooks/bazaareconomy/ledger-hooks";
import { formatTribeAmount, TRIBE_TOKEN_DECIMALS } from "@bazaar/shared/utils/tribeToken";

export default function WTBView({ shop, refetch, refreshShop }: {
  shop: Shop; refetch: () => void; refreshShop: (id: string) => Promise<void>;
}) {
  const { signGated } = useGatedTransaction();
  const toast = useToast();
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState<number | null>(null);
  const { currencyName } = useClaimBoxContext();
  const displayCurrency = currencyName || "EVE";
  const targetSsuId = shop.ssuId || SSU_OBJECT_ID;
  const { walletAddress } = useConnection();
  const { characterId, charCapRef } = useCharacterOwnerCapRef(walletAddress ?? undefined, targetSsuId);
  // W3-4 (filler side): when filler == SSU owner, withdraw items from Main Storage.
  const { character } = usePlayerCharacter();
  const [ssuOwnerCapRef, setSsuOwnerCapRef] = useState<SSUOwnerCapRef | null>(null);
  useEffect(() => {
    if (!character) { setSsuOwnerCapRef(null); return; }
    let aborted = false;
    resolveSSUOwnerCap(character.characterId, targetSsuId)
      .then(cap => { if (!aborted) setSsuOwnerCapRef(cap); })
      .catch(() => { if (!aborted) setSsuOwnerCapRef(null); });
    return () => { aborted = true; };
  }, [character, targetSsuId]);
  const { data: shared } = useSSUSharedObjects(targetSsuId);
  const ssuGovId = shared?.ssuGovId;
  const { bazaarType } = useBazaarType(targetSsuId);
  const { data: govConfig } = useSSUGovernanceConfig(ssuGovId ?? null);
  const tribeIdStr = govConfig?.tribeId ? String(govConfig.tribeId) : null;
  const { data: tribeGovId } = useTribeGovId(tribeIdStr);
  const { data: economyIds } = useTribeEconomyObjects(tribeIdStr);
  // V26+ — read ledger.decimals for price display formatting (Advanced only).
  const { data: ledger } = useTribeTokenLedger(economyIds?.ledgerId ?? null);
  const tokenDecimals = ledger?.decimals ?? TRIBE_TOKEN_DECIMALS;
  // V21: Advanced WTB fills draw from per-SSU TribeTokenWtbPool. Pool ID resolved
  // from TribeTokenWtbPoolCreated event keyed on ssu_id. null until bootstrap'd.
  const { data: wtbPoolId } = useTribeTokenWtbPoolId(targetSsuId);

  const {
    characterId: recipientCharacterId,
    isLoading:   recipientLoading,
    error:       recipientError,
  } = useRecipientCharacter(shop.owner, targetSsuId);

  // Issue 4 — payout preview ("You receive" per entered qty).
  //   NoTribe/Easy: the owner pre-pays the tax surcharge, so the filler receives
  //     the FULL listed price (payoutBps = 0).
  //   Advanced: the filler is minted net = gross − ssu_tax − tribe_tax at fill
  //     (ledger_wtb_fill); the DApp tax does NOT apply to tribe-token shops.
  const { ssuRole, tribeRole } = useRoles(targetSsuId);
  const { data: ssuRoleTaxes } = useSSURoleTaxTable(ssuGovId ?? null);
  const { data: tribeRoleTaxes } = useTribeRoleTaxTable(tribeGovId ?? null);
  const isAdvanced = bazaarType === "Advanced";
  const wtbSsuBps = ssuRoleTaxes?.[ssuRole]?.wtbPct ?? 0;
  const wtbTribeBps = (govConfig?.tribeId ?? 0) > 0 ? (tribeRoleTaxes?.[tribeRole]?.wtbPct ?? 0) : 0;
  const payoutBps = isAdvanced ? (wtbSsuBps + wtbTribeBps) : 0;
  function payoutFor(priceRaw: number, qty: number): number {
    const gross = priceRaw * qty;
    return gross - Math.floor((gross * payoutBps) / 10_000);
  }
  function fmtAmount(raw: number): string {
    return shop.bazaarType === 2
      ? formatTribeAmount(raw, { decimals: tokenDecimals })
      : (raw / COIN_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 });
  }

  const listingTypeIds = (shop.listings as Listing[]).map(l => l.itemTypeId);
  const itemTypes = useItemTypes(listingTypeIds);
  function itemName(typeId: number): string { return itemTypes.get(typeId)?.name ?? `Item #${typeId}`; }

  async function deliver(idx: number) {
    const qty = qtys[idx] ?? 1;
    // Diagnostic: surface why a click might appear silent. Logs the full guard
    // state so the failing condition is visible in the browser console.
    console.log("[WTBView] Sell click", {
      idx, qty,
      hasShared: !!shared, ssuGovId, bazaarType,
      tribeGovId, ledgerId: economyIds?.ledgerId,
      characterId, hasCharCapRef: !!charCapRef,
      recipientLoading, recipientCharacterId, recipientError,
      wtbPoolId,
    });
    // Guard 0: qty must be > 0 (input default is 0/blank — easy miss for users).
    if (!qty || qty <= 0) {
      alert("Enter a quantity > 0 to sell."); return;
    }
    // Guard 1: SSU governance loading.
    if (!shared || !ssuGovId || !bazaarType) {
      alert("Loading SSU governance — please wait."); return;
    }
    // Guard 2: Advanced uses ledger fill (Phase 10).
    if (bazaarType === "Advanced") {
      if (!tribeGovId || !economyIds?.ledgerId) {
        alert("Loading tribe economy — please wait."); return;
      }
      // recipientCharacterId validated by Guard 4 below — fall through to Guards 3 + 4.
    }
    // Guard 3: filler character resolution.
    if (!charCapRef || !characterId) {
      alert("Resolving your character — please wait. If this persists, dock to the SSU and retry."); return;
    }
    // Guard 4 (Phase 4 NEW): recipient character resolution.
    if (recipientLoading || !recipientCharacterId) {
      alert(recipientError
        ? `Could not resolve shop owner's character: ${recipientError}`
        : "Resolving recipient character — please wait.",
      );
      return;
    }
    setLoading(idx);
    try {
      const listing = shop.listings[idx] as Listing;
      const fillItems: EscrowListingRef[] = [{ typeId: listing.itemTypeId, quantity: qty }];
      if (bazaarType === "Advanced") {
        if (!charCapRef || !characterId || !recipientCharacterId || !tribeGovId || !economyIds?.ledgerId || !ssuGovId) {
          alert("Missing required data for Advanced fill."); setLoading(null); return;
        }
        // V21: pool must be bootstrapped before any Advanced WTB fill can clear.
        if (!wtbPoolId) {
          alert("Advanced WTB pool not yet bootstrapped for this SSU. Ask the SSU owner to run the V21 pool bootstrap from Governance → Setup before attempting a fill.");
          setLoading(null);
          return;
        }
        const advTx = new Transaction();
        buildLedgerWTBFill({
          shopId:               shop.id,
          listingIdx:           idx,
          quantity:             qty,
          ledgerId:             economyIds.ledgerId,
          ssuGovId,
          tribeGovId,
          memberRegistryId:     shared.memberRegistryId,
          poolId:               wtbPoolId,        // V21 NEW
          fillItems:            fillItems as LedgerEscrowListingRef[],
          charCapRef,
          characterId,
          recipientCharacterId,
          ssuId:                targetSsuId,
          // W3-4 parity: when filler == SSU owner, withdraw fill items from Main Storage.
          asSSUOwner:           !!ssuOwnerCapRef,
          ssuOwnerCapRef:       ssuOwnerCapRef ?? undefined,
        }, advTx);
        await signGated(advTx);
        await refreshShop(shop.id);
        window.dispatchEvent(new Event("bazar-soft-refresh"));
        toast.success("Sale successful", { detail: `Sold ${qty} × ${itemName(listing.itemTypeId)} for ${fmtAmount(payoutFor(listing.priceTribe, qty))} ${displayCurrency}.` });
        return;
      }
      // V13: wtb_fill_* drains payout from Shop.escrowed_eve directly — no pool arg needed.
      const tx = buildWTBFill({
        shopId:               shop.id,
        listingIdx:           idx,
        quantity:             qty,
        ssuGovId,
        ssuId:                targetSsuId,
        memberRegistryId:     shared.memberRegistryId,
        bazaarType:           bazaarType.toLowerCase() as "notribe" | "easy",
        // V36 Easy: wtb_fill_tribe takes &mut TribeGovernance after ssu_gov.
        tribeGovId:           tribeGovId ?? undefined,
        fillItems,
        charCapRef,
        characterId,
        recipientCharacterId,
        // W3-4 filler side: route Main Storage withdraw when filler == SSU owner.
        asSSUOwner:           !!ssuOwnerCapRef,
        ssuOwnerCapRef:       ssuOwnerCapRef ?? undefined,
      });
      await signGated(tx);
      await refreshShop(shop.id);
      window.dispatchEvent(new Event("bazar-soft-refresh"));
      toast.success("Sale successful", { detail: `Sold ${qty} × ${itemName(listing.itemTypeId)} for ${fmtAmount(payoutFor(listing.priceTribe, qty))} ${displayCurrency}.` });
    } catch (e: any) { alert(e?.message); } finally { setLoading(null); }
  }

  return (
    <div className="shop-view__listings">
      {shop.wtbTaxBpsLocked != null && shop.wtbTaxBpsLocked > 0 && (
        <div style={{ marginBottom: "0.5rem" }}>
          <TaxIndicator
            mode="locked"
            totalBps={shop.wtbTaxBpsLocked}
            currency={displayCurrency}
            label="Tax pre-paid by owner"
            layers={[]}
          />
          <p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.2rem" }}>
            You receive the full listed price.
          </p>
        </div>
      )}
      <table className="table">
        <thead><tr><th>Wants</th><th>Remaining</th><th>Paying ({displayCurrency} / unit)</th><th>Qty to sell</th><th>You receive</th><th></th></tr></thead>
        <tbody>
          {shop.listings.map((l: Listing, i: number) => {
            const sellQty = qtys[i] ?? 0;
            return (
            <tr key={i} className={l.quantity === 0 ? "row--sold-out" : ""}>
              <td>{itemName(l.itemTypeId)}</td>
              <td>{l.quantity === 0 ? <span className="muted">Filled</span> : l.quantity}</td>
              <td>{fmtAmount(l.priceTribe)}</td>
              <td><input type="number" min={1} max={l.quantity} className="input input--xs" placeholder="0"
                value={sellQty === 0 ? "" : sellQty}
                onChange={e => { const v = e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0); setQtys(q => ({ ...q, [i]: v })); }}
                disabled={l.quantity === 0} /></td>
              <td>{sellQty > 0
                ? <><span style={{ fontWeight: 600 }}>{fmtAmount(payoutFor(l.priceTribe, sellQty))}</span><span className="muted" style={{ fontSize: "0.8em", marginLeft: "0.25rem" }}>{displayCurrency}</span></>
                : <span className="muted">—</span>}</td>
              <td><button className="btn btn--primary btn--sm" disabled={l.quantity === 0 || loading === i || !shared || !shared.memberRegistryId} onClick={() => deliver(i)}>{loading === i ? "..." : "Sell"}</button></td>
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
