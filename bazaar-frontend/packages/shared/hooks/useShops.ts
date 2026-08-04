// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { BAZAR_REGISTRY_ID } from "@bazaar/shared/constants";
import type { Shop, ShopKind } from "@bazaar/shared/types";
import { debug } from "@bazaar/shared/utils/debug";
import { useDepreciatedSSUs } from "./bazaarcore/useDepreciatedSSUs";

const KIND_MAP: Record<number, ShopKind> = { 0: "WTS", 1: "WTB", 2: "DE", 3: "FREE" };

/**
 * A shop is "depleted" once there is nothing left to trade: a WTB buy order
 * fully filled, a WTS shop sold out, a DE shop fully exchanged, or a FREE shop
 * with no claimable items or coin pool left. Depleted shops are filtered out of
 * `useShops()` at the source so they vanish EVERYWHERE at once — Godot beacons,
 * the bazaar list, the Market "My Shops" tab, and SSU-governance moderation —
 * matching the "once filled it's essentially gone" product rule. (The on-chain
 * record may linger inert until the V31 auto-close-on-fill ships; this is the
 * FE-side hide that works on the current publish.)
 */
function isShopDepleted(shop: Shop): boolean {
  switch (shop.kind) {
    case "WTS":
    case "WTB":
      return shop.listings.length > 0 && shop.listings.every(l => l.quantity === 0);
    case "DE":
      return shop.pairs.length === 0 || shop.pairs.every(p => p.offeredQty === 0);
    case "FREE": {
      const hadItems = shop.listings.length > 0;
      const claimAmt = shop.coin_claim_amount ?? 0;
      const hadCoin  = claimAmt > 0;
      if (!hadItems && !hadCoin) return false; // nothing to judge — keep visible
      const itemsLeft = shop.listings.some(l => l.quantity > 0);
      // Coin pool lives in Shop.escrowed_eve (V25 NoTribe/Easy EVE prepay) or
      // tribe_token_pool (V26 Advanced) — whichever path funded this shop.
      const pool = Math.max(shop.tribe_token_pool ?? 0, shop.escrowedEve ?? 0);
      const coinLeft = claimAmt > 0 && pool >= claimAmt;
      return !itemsLeft && !coinLeft;
    }
    default:
      return false;
  }
}
const RPC =
  (import.meta.env.VITE_SUI_RPC_ENDPOINT as string | undefined) ??
  "https://api.zan.top/public/sui-testnet";

async function rpc(method: string, params: unknown[]): Promise<any> {
  const resp = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result;
}

/**
 * Parse a Shop from JSON-RPC sui_getObject response fields.
 * RPC returns BCS-decoded Move structs where vectors of structs are wrapped
 * in { type, fields } envelopes — this parser handles both shapes.
 */
function parseShopFromRpc(id: string, fields: any): Shop | null {
  try {
    if (fields.owner === undefined || fields.kind === undefined || fields.title === undefined) return null;

    // Sui RPC may wrap vector<Listing> as { type, fields: [...] } or return a bare array
    const rawListings = Array.isArray(fields.listings) ? fields.listings
      : Array.isArray(fields.listings?.fields) ? fields.listings.fields
      : [];
    const listings = rawListings.map((l: any) => {
      const f = l.fields ?? l;
      return {
        itemTypeId:        Number(f.item_type_id ?? 0),
        quantity:          Number(f.quantity ?? 0),
        originalQuantity:  Number(f.original_quantity ?? 0) || undefined,
        priceTribe:        Number(f.price_eve ?? 0),
      };
    });

    const rawPairs = Array.isArray(fields.pairs) ? fields.pairs
      : Array.isArray(fields.pairs?.fields) ? fields.pairs.fields
      : [];
    const pairs = rawPairs.map((p: any) => {
      const f = p.fields ?? p;
      // Move struct field names (bazar_listings::ExchangePair): offer_item_type_id,
      // offer_quantity, request_item_type_id, request_quantity, offer_per_lot. The
      // earlier offered_type_id/offered_qty/... names never matched the chain payload,
      // so every pair parsed to all-zeros → "Item #0 x 0" in DEView.
      // offer_per_lot defaults to 1 (legacy 1:N ratio) if absent on a pre-bundle shop.
      return {
        offeredTypeId:   Number(f.offer_item_type_id ?? 0),
        offeredQty:      Number(f.offer_quantity ?? 0),
        requestedTypeId: Number(f.request_item_type_id ?? 0),
        requestedQty:    Number(f.request_quantity ?? 0),
        offerPerLot:     Math.max(1, Number(f.offer_per_lot ?? 1)),
      };
    });

    const rawOtv = fields.original_total_value;
    const originalTotalValue = rawOtv != null ? String(rawOtv) : undefined;
    const rawTaxPrepaid = fields.tax_prepaid;
    const taxPrepaid = rawTaxPrepaid != null ? Number(rawTaxPrepaid) : undefined;
    const rawWtbBps = fields.wtb_tax_bps_locked;
    const wtbTaxBpsLocked = rawWtbBps != null ? Number(rawWtbBps) : undefined;

    return {
      id,
      owner:             fields.owner,
      kind:              KIND_MAP[Number(fields.kind)] ?? "WTS",
      title:             fields.title,
      ssuId:             typeof fields.ssu_id === "string" ? fields.ssu_id : "",
      // Move Shop carries tribe_id: u64 (bazar.move:80). Advanced FREE shops need
      // it to resolve the tribe economy/governance objects for the token-giveaway
      // claim — omitting it left shop.tribeId undefined and permanently greyed the
      // claim button (`isAdvancedFree && (!econ || !tribeGovId)`).
      tribeId:           fields.tribe_id != null ? Number(fields.tribe_id) : 0,
      bazaarType:        fields.bazaar_type != null ? Number(fields.bazaar_type) : undefined,
      displayId:         fields.display_id != null ? Number(fields.display_id) : undefined,
      mapX:              fields.map_x != null ? Number(fields.map_x) : undefined,
      mapY:              fields.map_y != null ? Number(fields.map_y) : undefined,
      listings,
      pairs,
      escrowedTribe:     Number(fields.escrowed_tribe ?? 0),
      // Balance<EVE> serializes as { fields: { value } } or a bare string depending
      // on RPC version — same dual-shape handling as shop-hooks.ts.
      escrowedEve:       Number(
        (fields.escrowed_eve as { fields?: { value?: string } })?.fields?.value
          ?? (typeof fields.escrowed_eve === "string" || typeof fields.escrowed_eve === "number"
                ? fields.escrowed_eve : 0),
      ),
      createdAtMs:       Number(fields.created_at_ms ?? 0),
      expiryMs:          Number(fields.expiry_ms ?? 0),
      isActive:          fields.is_active === true,
      positionX:         Number(fields.position_x ?? 0),
      positionY:         Number(fields.position_y ?? 0),
      lastInteractionMs: Number(fields.last_interaction_ms ?? 0),
      originalTotalValue,
      taxPrepaid,
      wtbTaxBpsLocked,
      is_tribe_store:        fields.is_tribe_store === true,
      claim_limit_per_user:  fields.claim_limit_per_user != null ? Number(fields.claim_limit_per_user) : undefined,
      claims: Array.isArray(fields.claims)
        ? fields.claims.map((c: any) => {
            const f = c.fields ?? c;
            return { claimer: f.claimer as string, qty_claimed: Number(f.qty_claimed ?? 0) };
          })
        : undefined,
      coin_claim_limit_per_user: fields.coin_claim_limit_per_user != null ? Number(fields.coin_claim_limit_per_user) : undefined,
      coin_claims: Array.isArray(fields.coin_claims)
        ? fields.coin_claims.map((c: any) => {
            const f = c.fields ?? c;
            return { claimer: f.claimer as string, amount_claimed: Number(f.amount_claimed ?? 0) };
          })
        : undefined,
      allowed_roles: Array.isArray(fields.allowed_roles)
        ? fields.allowed_roles.map((r: any) => Number(r))
        : undefined,
      // V25/V26 FREE-shop Move fields (raw snake_case mirror).
      coin_claim_amount: fields.coin_claim_amount != null ? Number(fields.coin_claim_amount) : undefined,
      // C7/AUD-NT-05: coin_claimers is now a Table<address,bool> — surface its inner
      // object id for a targeted per-wallet claim lookup (FREEView); the unbounded
      // full list is no longer decoded.
      coinClaimersTableId: (fields.coin_claimers as { fields?: { id?: { id?: string } } } | undefined)
        ?.fields?.id?.id ?? undefined,
      tribe_token_pool: fields.tribe_token_pool != null ? Number(fields.tribe_token_pool) : undefined,
    };
  } catch (e) {
    console.warn("[useShops] parseShopFromRpc failed:", e);
    return null;
  }
}

export function useShops() {
  const [shops, setShops]       = useState<Shop[]>([]);
  const [isLoading, setLoading] = useState(false);

  const fetchShops = useCallback(async () => {
    if (!BAZAR_REGISTRY_ID) return;
    setLoading(true);
    try {
      // Step 1: List dynamic fields on BazarRegistry, extract Shop object IDs from name.value
      // dof::add(r.id, shop_id, shop) stores shops as dynamic_object_field with key=shop_id (ID)
      const shopIds: string[] = [];
      let cursor: string | null = null;
      let hasNext = true;
      while (hasNext) {
        const page = await rpc("suix_getDynamicFields", [BAZAR_REGISTRY_ID, cursor, null]);
        for (const item of page.data ?? []) {
          // Only pick dynamic_object_field entries whose objectType contains ::bazar::Shop
          const objType: string = item.objectType ?? "";
          if (objType.includes("::bazar::Shop")) {
            // For dof, name.value IS the actual Shop object ID
            shopIds.push(item.name?.value ?? item.objectId);
          }
        }
        cursor = page.nextCursor ?? null;
        hasNext = page.hasNextPage === true;
      }

      debug("[useShops] RPC dynamic fields: found", shopIds.length, "shops");

      if (shopIds.length === 0) {
        setShops([]);
        return;
      }

      // Step 2: Batch-fetch all Shop objects
      const objects: any[] = await rpc("sui_multiGetObjects", [
        shopIds,
        { showContent: true, showType: true },
      ]);

      const parsed = objects
        .map((obj: any) => {
          const id = obj?.data?.objectId;
          const fields = obj?.data?.content?.fields;
          if (!id || !fields) return null;
          return parseShopFromRpc(id, fields);
        })
        .filter(Boolean) as Shop[];

      debug("[useShops] Parsed shops from RPC:", parsed.length);
      setShops(parsed);
    } catch (err) {
      console.error("[useShops] fetchShops failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Refresh a single shop directly from the RPC fullnode (bypasses GraphQL lag).
   *  NOTE: Only patches the useShops instance that calls this — other consumers
   *  of useShops see stale data until their own fetchShops fires.
   *  TODO: Lift useShops to a shared React Context so all consumers share state. */
  const refreshShop = useCallback(async (shopId: string) => {
    try {
      const body = JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "sui_getObject",
        params: [shopId, { showContent: true, showType: true }],
      });
      const resp = await fetch(RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!resp.ok) return;
      const data = await resp.json();

      // Object deleted → remove from state
      if (data?.result?.error) {
        setShops(prev => prev.filter(s => s.id !== shopId));
        return;
      }

      const fields = data?.result?.data?.content?.fields;
      if (!fields) return;

      const updated = parseShopFromRpc(shopId, fields);
      if (!updated) return;

      setShops(prev => {
        const idx = prev.findIndex(s => s.id === shopId);
        if (idx === -1) return [...prev, updated];
        const next = [...prev];
        next[idx] = updated;
        return next;
      });
    } catch (e) {
      console.warn("[useShops] refreshShop RPC failed:", e);
    }
  }, []);

  // Fetch on mount
  useState(() => { fetchShops(); });

  // V41 SSU depreciation/prune (plan §5): hard delist ghost shops of depreciated
  // SSUs at the source, BYPASSING the SSUFilter tier gate entirely — matches the
  // isShopDepleted "vanish everywhere at once" doctrine already used above.
  const candidateSsuIds = useMemo(() => shops.map(s => s.ssuId), [shops]);
  const { depreciated } = useDepreciatedSSUs(candidateSsuIds);

  const sorted = useMemo(
    () => shops
      .filter(s => !isShopDepleted(s))
      .filter(s => !depreciated.has((s.ssuId || "").toLowerCase()))
      .sort((a, b) => a.id.localeCompare(b.id)),
    [shops, depreciated]
  );

  return { shops: sorted, isLoading, refetch: fetchShops, refreshShop };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
