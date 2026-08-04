// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * shopStacks.ts — Position-collision stacking (Multi-SSU Visibility Phase 2).
 *
 * Shops created at the SAME map position (positionX / positionY) would otherwise
 * spawn overlapping Godot beacons + overlapping React holograms. This helper
 * groups co-located shops into a single "stack" so the world renders ONE node
 * per spot titled "N Shops"; clicking it opens a picker listing the members.
 *
 * Each stack is identified by a STABLE id = the id of its highest-priority
 * member (ordered OWN → TRIBE → OTHER, then by id). A stack of one therefore
 * keeps the member's own id, so single-shop behaviour is byte-identical to
 * pre-Phase-2 (the Godot node key + rect + hologram all stay keyed on that id).
 *
 * Pure module (only type-only + shopTier imports) so it is trivially unit
 * testable. Consumed by useGodotBridge (Godot payload), BeaconLayer (React
 * holograms), and ShopStackPicker (the dropdown).
 */

import {
  classifyShopTier,
  TIER_COLOR,
  TIER_ORDER,
  type ShopTier,
  type ShopTierContext,
  type ShopTierInput,
} from "./shopTier";

/** Minimal shape a shop must expose to be stacked: classifiable + positioned. */
export interface ShopStackInput extends ShopTierInput {
  id:         string;
  positionX?: number;
  positionY?: number;
  mapX?:      number;
  mapY?:      number;
}

/** One member of a stack, carrying its tier (relative to the current context). */
export interface ShopStackMember<T extends ShopStackInput = ShopStackInput> {
  shop: T;
  tier: ShopTier;
}

/** A set of shops sharing one map position. */
export interface ShopStack<T extends ShopStackInput = ShopStackInput> {
  /** Stable stack id = the highest-priority member's id. */
  id:        string;
  positionX: number;
  positionY: number;
  /** Members ordered OWN → TRIBE → OTHER, then by id (deterministic). */
  members:   ShopStackMember<T>[];
  count:     number;
  /** Highest-priority tier present in the stack (the lead member's tier). */
  tier:      ShopTier;
  /** Stack beacon colour = TIER_COLOR[tier]. */
  color:     string;
}

/** Resolve a shop's integer map position (positionX/Y preferred, mapX/Y legacy). */
function shopPosition(s: ShopStackInput): { x: number; y: number } {
  const x = s.positionX ?? s.mapX ?? 0;
  const y = s.positionY ?? s.mapY ?? 0;
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Group co-located shops into position stacks, classifying each member relative
 * to the current SSU context. Stacks are returned OWN-first for a deterministic
 * render order.
 */
export function groupShopsByPosition<T extends ShopStackInput>(
  shops: T[],
  ctx: ShopTierContext,
): ShopStack<T>[] {
  // Bucket by integer position.
  const buckets = new Map<string, T[]>();
  for (const s of shops) {
    const { x, y } = shopPosition(s);
    const key = `${x}|${y}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(s);
    else buckets.set(key, [s]);
  }

  const stacks: ShopStack<T>[] = [];
  for (const [key, group] of buckets) {
    const members: ShopStackMember<T>[] = group
      .map(shop => ({ shop, tier: classifyShopTier(shop, ctx) }))
      .sort((a, b) => {
        const ta = TIER_ORDER.indexOf(a.tier);
        const tb = TIER_ORDER.indexOf(b.tier);
        if (ta !== tb) return ta - tb;
        return a.shop.id < b.shop.id ? -1 : a.shop.id > b.shop.id ? 1 : 0;
      });
    const lead = members[0];
    const [x, y] = key.split("|").map(Number);
    stacks.push({
      id:        lead.shop.id,
      positionX: x,
      positionY: y,
      members,
      count:     members.length,
      tier:      lead.tier,
      color:     TIER_COLOR[lead.tier],
    });
  }

  // OWN-first stack order.
  stacks.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  return stacks;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
