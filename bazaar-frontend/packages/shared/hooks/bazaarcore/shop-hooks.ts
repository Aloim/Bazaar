// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCore shop hooks — useShops, useShopById, useMyShops.
 *
 * RPC strategy (TODO at deployment):
 *   useShops / useMyShops — query ShopCreatedEvent filtered by ssu_id / owner,
 *   collect shop IDs, then suix_getDynamicFieldObject on BazarRegistry per ID.
 *   useShopById — suix_getDynamicFieldObject on BazarRegistry with shop_id key.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useQuery } from "@tanstack/react-query";
import type { Shop, Listing, ExchangePair, ShopKind, BazaarTypeNum } from "../../types/bazaarcore";
import { SHARED_OBJECTS, PACKAGE_IDS, ORIGINAL_PACKAGE_ID } from "../../constants";
import { suiClient } from "../sui-client";

// ── useShopById ────────────────────────────────────────────────────────────────

/**
 * Fetch a single shop by its object ID.
 * Move source: bazaar_core::bazar::Shop (DOF on BazarRegistry).
 * RPC: suiClient.getDynamicFieldObject({ parentId: SHARED_OBJECTS.BAZAR_REGISTRY, name: { type: "0x2::object::ID", value: shopId } })
 */
export function useShopById(shopId: string | null) {
  return useQuery<Shop | null>({
    queryKey: ["bazaarcore", "shop", shopId],
    enabled: !!shopId,
    queryFn: async (): Promise<Shop | null> => {
      const resp = await suiClient.getDynamicFieldObject({
        parentId: SHARED_OBJECTS.BAZAR_REGISTRY,
        name: { type: "0x2::object::ID", value: shopId! },
      });
      const content = resp.data?.content as { fields?: Record<string, unknown> } | undefined;
      if (!content?.fields) return null;
      const f = content.fields;
      const escrowField = f.escrowed_eve as { fields?: { value?: string }; value?: string } | undefined;
      const escrowedEve = Number(escrowField?.fields?.value ?? escrowField?.value ?? 0);
      const rawListings = (f.listings as unknown[]) ?? [];
      const listings: Listing[] = rawListings.map((raw) => {
        const l = (raw as { fields?: Record<string, unknown> })?.fields ?? (raw as Record<string, unknown>);
        return {
          itemTypeId:       Number(l.item_type_id ?? 0),
          quantity:         Number(l.quantity ?? 0),
          priceEve:         Number(l.price_eve ?? 0),
          originalQuantity: Number(l.original_quantity ?? 0),
        };
      });
      const rawPairs = (f.pairs as unknown[]) ?? [];
      const pairs: ExchangePair[] = rawPairs.map((raw) => {
        const p = (raw as { fields?: Record<string, unknown> })?.fields ?? (raw as Record<string, unknown>);
        return {
          offerItemTypeId:   Number(p.offer_item_type_id ?? 0),
          offerQuantity:     Number(p.offer_quantity ?? 0),
          requestItemTypeId: Number(p.request_item_type_id ?? 0),
          requestQuantity:   Number(p.request_quantity ?? 0),
          offerPerLot:       Math.max(1, Number(p.offer_per_lot ?? 1)),
        };
      });
      return {
        id:          resp.data?.objectId ?? shopId!,
        owner:       String(f.owner ?? ""),
        kind:        Number(f.kind ?? 0) as ShopKind,
        bazaarType:  Number(f.bazaar_type ?? 0) as BazaarTypeNum,
        title:       String(f.title ?? ""),
        ssuId:       String(f.ssu_id ?? ""),
        tribeId:     Number(f.tribe_id ?? 0),
        listings,
        pairs,
        escrowedEve,
        createdAtMs: Number(f.created_at_ms ?? 0),
        expiryMs:    Number(f.expiry_ms ?? 0),
        isActive:    Boolean(f.is_active ?? false),
      };
    },
    staleTime: 10_000,
  });
}

// ── useMyShops ─────────────────────────────────────────────────────────────────

/**
 * Fetch shops owned by walletAddress at a given SSU.
 * Move source: bazaar_core::bazar::Shop (owner field, ssu_id field).
 * RPC: queryEvents ShopCreatedEvent { owner: walletAddress, ssu_id: ssuId }
 *   -> collect IDs -> fetch objects -> filter is_active.
 * NOTE: BazarRegistry has no owner index — event-based approach required.
 */
export function useMyShops(walletAddress: string | null, ssuId: string | null) {
  return useQuery<Shop[]>({
    queryKey: ["bazaarcore", "my-shops", walletAddress, ssuId],
    enabled: !!(walletAddress && ssuId),
    queryFn: async (): Promise<Shop[]> => {
      const eventType = `${ORIGINAL_PACKAGE_ID}::bazar::ShopCreatedEvent`;
      const events = await suiClient.queryEvents({
        query: { MoveEventType: eventType },
        limit: 50,
      });
      if (events.data.length === 50) {
        console.warn(
          "[useMyShops] queryEvents returned 50 results (limit). " +
          "Cursor-based pagination not yet implemented. Some shops may be missing."
        );
      }
      const targetOwner = walletAddress!.toLowerCase();
      const targetSsuId = ssuId!.toLowerCase();
      const matchingIds: string[] = events.data
        .filter((e) => {
          const p = e.parsedJson as { owner?: string; ssu_id?: string; shop_id?: string } | null;
          return (
            typeof p?.owner === "string" &&
            p.owner.toLowerCase() === targetOwner &&
            typeof p?.ssu_id === "string" &&
            p.ssu_id.toLowerCase() === targetSsuId &&
            typeof p?.shop_id === "string"
          );
        })
        .map((e) => (e.parsedJson as { shop_id: string }).shop_id);
      if (matchingIds.length === 0) return [];
      const shopResults = await Promise.all(
        matchingIds.map((id) =>
          suiClient.getDynamicFieldObject({
            parentId: SHARED_OBJECTS.BAZAR_REGISTRY,
            name: { type: "0x2::object::ID", value: id },
          })
        )
      );
      const shops: Shop[] = [];
      for (let i = 0; i < shopResults.length; i++) {
        const resp = shopResults[i];
        const content = resp.data?.content as { fields?: Record<string, unknown> } | undefined;
        if (!content?.fields) continue;
        const f = content.fields;
        if (!Boolean(f.is_active ?? false)) continue;
        const escrowField = f.escrowed_eve as { fields?: { value?: string }; value?: string } | undefined;
        const escrowedEve = Number(escrowField?.fields?.value ?? escrowField?.value ?? 0);
        const rawListings = (f.listings as unknown[]) ?? [];
        const listings: Listing[] = rawListings.map((raw) => {
          const l = (raw as { fields?: Record<string, unknown> })?.fields ?? (raw as Record<string, unknown>);
          return {
            itemTypeId: Number(l.item_type_id ?? 0), quantity: Number(l.quantity ?? 0),
            priceEve: Number(l.price_eve ?? 0), originalQuantity: Number(l.original_quantity ?? 0),
          };
        });
        const rawPairs = (f.pairs as unknown[]) ?? [];
        const pairs: ExchangePair[] = rawPairs.map((raw) => {
          const p = (raw as { fields?: Record<string, unknown> })?.fields ?? (raw as Record<string, unknown>);
          return {
            offerItemTypeId: Number(p.offer_item_type_id ?? 0), offerQuantity: Number(p.offer_quantity ?? 0),
            requestItemTypeId: Number(p.request_item_type_id ?? 0), requestQuantity: Number(p.request_quantity ?? 0),
            offerPerLot: Math.max(1, Number(p.offer_per_lot ?? 1)),
          };
        });
        shops.push({
          id: resp.data?.objectId ?? matchingIds[i], owner: String(f.owner ?? ""),
          kind: Number(f.kind ?? 0) as ShopKind, bazaarType: Number(f.bazaar_type ?? 0) as BazaarTypeNum,
          title: String(f.title ?? ""), ssuId: String(f.ssu_id ?? ""), tribeId: Number(f.tribe_id ?? 0),
          listings, pairs, escrowedEve, createdAtMs: Number(f.created_at_ms ?? 0),
          expiryMs: Number(f.expiry_ms ?? 0), isActive: true,
        });
      }
      return shops;
    },
    staleTime: 15_000,
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
