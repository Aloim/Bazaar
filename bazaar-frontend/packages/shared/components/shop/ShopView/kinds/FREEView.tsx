// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/ShopView.tsx (lines 611-839; split for 500-line guard, section: FREEView).
// Re-imported into ../index.tsx.

import { useState, useEffect } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { useConnection } from "@evefrontier/dapp-kit";
import { useGatedTransaction } from "@bazaar/shared/hooks/announcements";
import { useToast } from "@bazaar/shared/components";
import type { Shop, Listing } from "@bazaar/shared/types";
import { buildFreeClaim, buildFreeCoinClaim } from "@bazaar/shared/tx";
import { buildFreeTokenClaimAdvanced } from "@bazaar/shared/tx/bazaareconomy/free-shop-advanced-tx";
import { resolveSSUOwnerCap } from "@bazaar/shared/tx";
import {
  SSU_OBJECT_ID,
  ROLE_LABEL,
  COIN_DECIMALS,
} from "@bazaar/shared/constants";
import { useItemTypes, suiClient } from "@bazaar/shared/hooks";
import { useClaimBoxContext } from "@bazaar/shared/contexts";
import { usePlayerCharacter } from "@bazaar/shared/hooks";
import { useRoles } from "@bazaar/shared/hooks";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useTribeEconomyObjects } from "@bazaar/shared/hooks/bazaareconomy/economy-resolution-hooks";
import { useTribeTokenSymbol } from "@bazaar/shared/hooks/bazaareconomy/useTribeTokenSymbol";
import { useTribeGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { formatTribeAmount } from "@bazaar/shared/utils/tribeToken";

export default function FREEView({ shop, refetch, refreshShop }: {
  shop: Shop; refetch: () => void; refreshShop: (id: string) => Promise<void>;
}) {
  const { signGated } = useGatedTransaction();
  const toast = useToast();
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState("");
  // V25/V26 — single-shot coin/token claim UI state
  const [coinClaiming, setCoinClaiming] = useState(false);
  const { character, resolveCapRef } = usePlayerCharacter();
  const { walletAddress } = useConnection();
  const targetSsuId = shop.ssuId || SSU_OBJECT_ID;
  const { isRegistered, isLoading: rolesLoading } = useRoles(targetSsuId);
  const [isSsuOwner, setIsSsuOwner] = useState(false);
  const { currencyName } = useClaimBoxContext();
  const displayCurrency = currencyName || "EVE";
  const { data: shared } = useSSUSharedObjects(targetSsuId);
  const ssuGovId = shared?.ssuGovId;
  // V26: Advanced FREE shop needs ledger + tribe_gov to claim tribe-token payout.
  const isAdvancedFree = shop.bazaarType === 2;
  const tribeIdStr = shop.tribeId !== undefined ? String(shop.tribeId) : null;
  const { data: econ } = useTribeEconomyObjects(isAdvancedFree ? tribeIdStr : null);
  // Resolve the TribeGovernance object ID via the canonical event hook (same
  // reliable TribeGovernanceCreated query that econ uses) instead of a fragile
  // useTribeRegistry() list-find that returned null for brand-new tribes.
  // V36 (R-B): Easy FREE claims route to free_coin_claim_tribe / free_claim_tribe,
  // which take &TribeGovernance — so tribe_gov MUST resolve for Easy (bazaarType 1),
  // not just Advanced (2). Previously gated on isAdvancedFree → Easy threw
  // "free_coin_claim_tribe (V36 Easy) requires tribeGovId".
  const { data: tribeGovId } = useTribeGovId(
    shop.tribeId ? String(shop.tribeId) : null,
  );
  const { symbol: tribeSymbol } = useTribeTokenSymbol(isAdvancedFree ? shop.tribeId ?? null : null);
  const tokenSymbol = tribeSymbol ?? "TOKEN";
  // V26 Advanced FREE: tribe_token_pool + coin_claim_amount in scaled units (decimals=2).
  // V25 NoTribe/Easy FREE: escrowedEve (raw MIST) + coin_claim_amount (raw MIST).
  const claimAmountRaw = shop.coin_claim_amount ?? 0;
  const advancedPool = shop.tribe_token_pool ?? 0;
  // V25 EVE-prepay pool lives in Shop.escrowed_eve (escrowedTribe was a Bazar1-era
  // field that never existed on-chain — it always read 0 and hid the coin claim).
  const noTribePool = (shop as { escrowedEve?: number }).escrowedEve ?? 0;
  const poolValue = isAdvancedFree ? advancedPool : noTribePool;
  // C7/AUD-NT-05: coin_claimers is now a Table<address,bool>; check THIS wallet's
  // claim status via a targeted dynamic-field lookup. The on-chain has_coin_claimed
  // assert is the real guard — this only drives the "already claimed" button state.
  const coinClaimersTableId = (shop as { coinClaimersTableId?: string }).coinClaimersTableId;
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const hasCoinGiveaway = claimAmountRaw > 0 && poolValue >= claimAmountRaw;

  useEffect(() => {
    if (!character) { setIsSsuOwner(false); return; }
    let aborted = false;
    resolveSSUOwnerCap(character.characterId, targetSsuId)
      .then(cap => { if (!aborted) setIsSsuOwner(cap !== null); })
      .catch(() => { if (!aborted) setIsSsuOwner(false); });
    return () => { aborted = true; };
  }, [character, targetSsuId]);

  // C7/AUD-NT-05: targeted per-wallet claim lookup against the coin_claimers Table.
  useEffect(() => {
    let aborted = false;
    if (!coinClaimersTableId || !walletAddress) { setAlreadyClaimed(false); return; }
    suiClient
      .getDynamicFieldObject({
        parentId: coinClaimersTableId,
        name: { type: "address", value: walletAddress },
      })
      .then(r => { if (!aborted) setAlreadyClaimed(!!r.data); })
      .catch(() => { if (!aborted) setAlreadyClaimed(false); });
    return () => { aborted = true; };
  }, [coinClaimersTableId, walletAddress]);

  const listingTypeIds = (shop.listings as Listing[]).map(l => l.itemTypeId);
  const itemTypes = useItemTypes(listingTypeIds);
  function itemName(typeId: number): string { return itemTypes.get(typeId)?.name ?? `Item #${typeId}`; }

  function claimedByMe(listingIdx: number): number {
    if (!walletAddress || !Array.isArray(shop.claims)) return 0;
    return shop.claims.filter((c: any) => c.claimer === walletAddress).reduce((sum: number, c: any) => sum + c.qty_claimed, 0);
  }

  async function claim(idx: number) {
    if (!shared || !ssuGovId) {
      setError("Resolving SSU shared objects — please wait.");
      return;
    }
    if (!shared.userStorageId) {
      setError("Resolving SSU shared objects — please wait.");
      return;
    }
    // V36 Easy: free_claim_tribe needs the TribeGovernance object — block until it resolves.
    if (shop.bazaarType === 1 && !tribeGovId) {
      setError("Resolving tribe governance — please wait, then try again.");
      return;
    }
    const qty = qtys[idx] ?? 1;
    setError("");
    setLoading(idx);
    try {
      const tx = buildFreeClaim({
        shopId:           shop.id,
        listingIdx:       idx,
        quantity:         qty,
        ssuGovId:         ssuGovId,
        memberRegistryId: shared.memberRegistryId,
        userStorageId:    shared.userStorageId,
        // V36 Easy: route to free_claim_tribe (tribe-global ban enforced).
        bazaarType:       shop.bazaarType,
        tribeGovId:       tribeGovId ?? undefined,
      });
      await signGated(tx);
      await refreshShop(shop.id);
      refetch();
      toast.success("Claim succeeded", { detail: `You claimed ${qty} × ${itemName((shop.listings[idx] as Listing).itemTypeId)}.` });
      window.dispatchEvent(new Event("bazar-soft-refresh"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setLoading(null);
    }
  }

  const claimLimit = shop.claim_limit_per_user ?? 0;

  async function claimCoin() {
    if (!ssuGovId || !shared) {
      setError("Resolving SSU shared objects — please wait.");
      return;
    }
    // V36 Easy: free_coin_claim_tribe needs the TribeGovernance object — block until it resolves.
    if (shop.bazaarType === 1 && !tribeGovId) {
      setError("Resolving tribe governance — please wait, then try again.");
      return;
    }
    setError("");
    setCoinClaiming(true);
    try {
      let tx: Transaction;
      if (isAdvancedFree) {
        if (!econ || !tribeGovId) {
          setError("Resolving tribe economy objects — please wait.");
          setCoinClaiming(false);
          return;
        }
        tx = new Transaction();
        buildFreeTokenClaimAdvanced({
          shopId: shop.id,
          ssuGovId,
          tribeGovId,
          ledgerId: econ.ledgerId,
        }, tx);
      } else {
        tx = buildFreeCoinClaim({
          shopId: shop.id,
          ssuGovId,
          memberRegistryId: shared.memberRegistryId,
          // V36 Easy: route to free_coin_claim_tribe (tribe-global ban enforced).
          bazaarType: shop.bazaarType,
          tribeGovId: tribeGovId ?? undefined,
        });
      }
      await signGated(tx);
      await refreshShop(shop.id);
      refetch();
      toast.success("Claim succeeded", { detail: `You claimed ${claimDisplay}.` });
      window.dispatchEvent(new Event("bazar-soft-refresh"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coin-claim transaction failed.");
    } finally {
      setCoinClaiming(false);
    }
  }

  const claimDisplay = isAdvancedFree
    ? formatTribeAmount(claimAmountRaw, { decimals: 2, symbol: tokenSymbol })
    : `${(claimAmountRaw / COIN_DECIMALS).toFixed(4)} ${displayCurrency}`;

  return (
    <div className="shop-view__listings">
      {error && <div className="currency-selector__warning" style={{ marginBottom: "0.5rem" }}>{error}</div>}
      {shop.is_tribe_store && <p style={{ marginBottom: "0.5rem", fontSize: "0.82rem", color: "var(--accent)", fontWeight: 700 }}>★ TRIBE STORE — Items are freely claimable</p>}
      <p className="muted" style={{ marginBottom: "0.5rem", fontSize: "0.82rem" }}>{claimLimit === 0 ? "Claim limit: Unlimited per wallet." : `Claim limit: ${claimLimit} per wallet.`}</p>
      {Array.isArray(shop.allowed_roles) && shop.allowed_roles.length > 0 && shop.allowed_roles.length < 8 && (
        <p className="muted" style={{ marginBottom: "0.5rem", fontSize: "0.82rem" }}>Allowed roles: {shop.allowed_roles.map((r: number) => ROLE_LABEL[r] ?? `Role ${r}`).join(", ")}</p>
      )}
      {hasCoinGiveaway && (
        <div className="shop-view__coin-giveaway" style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "rgba(204,112,0,0.08)", border: "1px solid rgba(204,112,0,0.3)" }}>
          <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
            {isAdvancedFree ? "Tribe-token giveaway" : "Coin giveaway"}
          </div>
          <div className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.25rem" }}>
            Per-claim: {claimDisplay} · One claim per wallet.
          </div>
          <button
            className="btn btn--primary btn--sm"
            disabled={coinClaiming || alreadyClaimed || !shared || (isAdvancedFree && (!econ || !tribeGovId))}
            onClick={claimCoin}
            title={
              alreadyClaimed ? "You have already claimed from this shop"
              : !shared ? "Loading SSU data…"
              : (isAdvancedFree && !econ) ? "Resolving tribe economy (is the tribe bootstrapped?)…"
              : (isAdvancedFree && !tribeGovId) ? "Resolving tribe governance…"
              : undefined
            }
          >
            {coinClaiming ? "Claiming…" : alreadyClaimed ? "Already claimed" : `Claim ${claimDisplay}`}
          </button>
        </div>
      )}
      {shop.listings.length > 0 && (
        <table className="table">
          <thead><tr><th>Item</th><th>Available</th><th>Your Claims</th><th>Qty</th><th></th></tr></thead>
          <tbody>
            {shop.listings.map((l: Listing, i: number) => {
              const claimQty = qtys[i] ?? 1;
              const myClaimed = claimedByMe(i);
              const atLimit = claimLimit > 0 && myClaimed >= claimLimit;
              const soldOut = l.quantity === 0;
              return (
                <tr key={i} className={soldOut ? "row--sold-out" : ""}>
                  <td>{itemName(l.itemTypeId)}</td>
                  <td>{soldOut ? <span className="muted">Claimed out</span> : l.quantity}</td>
                  <td>{myClaimed > 0 ? <span className="muted">{myClaimed} claimed</span> : <span className="muted">—</span>}</td>
                  <td><input type="number" min={1} max={Math.min(l.quantity, claimLimit > 0 ? Math.max(0, claimLimit - myClaimed) : l.quantity)} className="input input--xs" placeholder="0"
                    value={claimQty === 0 ? "" : claimQty} onChange={e => { const v = e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0); setQtys(q => ({ ...q, [i]: v })); }}
                    disabled={soldOut || atLimit} /></td>
                  <td><button className="btn btn--primary btn--sm" disabled={soldOut || loading === i || rolesLoading || atLimit || !shared} onClick={() => claim(i)} title={atLimit ? `Claim limit reached (${claimLimit})` : undefined}>
                    {loading === i ? "..." : atLimit ? "Limit reached" : "Claim"}
                  </button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
