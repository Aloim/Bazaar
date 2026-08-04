// 500-LINE GUARD: this file is at ~489 lines post-mission-stall extraction (Article XIV.4 cap = 500 inclusive).
// The mission-stall / hide-missions concern lives in bazaarcore/useMissionStalls.ts.
// Any change adding net lines MUST split before commit. See R2.2 § 6 split strategies.

// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// useGodotBridge.ts — Matches the Godot bridge.gd protocol from bazaar/autoload/bridge.gd
//
// Transport: CustomEvent on the shared window (canvas embed — no iframe).
//   React  → Godot: window.dispatchEvent(new CustomEvent("godot-in",  { detail: jsonString }))
//   Godot  → React: window.dispatchEvent(new CustomEvent("godot-out", { detail: jsonString }))

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { useConnection, dAppKit } from "@evefrontier/dapp-kit";
import { useSSUSharedObjects } from "./bazaarcore/governance-resolution-hooks";
import { useMissionStalls } from "./bazaarcore/useMissionStalls";
import type { Roles, Shop, OwnedInventoryItem } from "@bazaar/shared/types";
import {
  buildWTSBuy,
  buildWTBFill,
  buildDEExchange,
  buildCloseShop,
} from "@bazaar/shared/tx";
import { splitEveCoin } from "@bazaar/shared/hooks/useEveCoinSplitter";
import { useCharacterOwnerCapRef } from "@bazaar/shared/hooks/useCharacterOwnerCapRef";
import type { EscrowListingRef } from "@bazaar/shared/tx/bazaarcore/shop-tx";
import {
  USER_STORAGE_REGISTRY_ID,
  SSU_OBJECT_ID,
} from "@bazaar/shared/constants";
import { loadPersistedTierFilter, SHOP_FILTER_CHANGED_EVENT } from "@bazaar/shared/components/SSUFilter";
import { useCurrentSsuContext } from "@bazaar/shared/hooks/useCurrentSsuContext";
import { classifyShopTier } from "@bazaar/shared/utils/shopTier";
import { groupShopsByPosition, type ShopStack } from "@bazaar/shared/utils/shopStacks";
import { PROTOCOL_VERSION } from "@bazaar/shared/bridge";

interface UseGodotBridgeOptions {
  canvasRef:        React.RefObject<HTMLCanvasElement | null>;
  roles:            Roles;
  shops:            Shop[];
  eveBalance:       number;
  inventoryItems:   OwnedInventoryItem[];
  onGodotReady:     () => void;
  onGodotLoadError: () => void;
  onNavigate:       (screen: "trade" | "inventory") => void;
  characterId?:     string;
  ownerCapId?:      string;
  ownerCapVersion?: string;
  ownerCapDigest?:  string;
  onShopClicked?:   (shopId: string) => void;
  onStackClicked?:  (stack: ShopStack<Shop>) => void;
  onTradeConfirmResponse?: (action: "confirm" | "dismiss", tradeId: string) => void;
  onOpenExchange?:  () => void;
  onOpenFinanceNews?: () => void;
  onOpenBazaarNews?: () => void;
  onOpenMission?: () => void;
  /** Clicking an in-world mission stall opens that specific mission. */
  onMissionClicked?: (missionId: string) => void;
}

export interface PlayerPosition {
  x: number;
  y: number;
  direction: string;
}

export interface ShopScreenRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BeaconScreenPos {
  bx: number;
  by: number;
  vpW: number;
  vpH: number;
  color?: string;
  scale?: number;
  rotation?: number;
  proximity?: boolean;
  rectW?: number;
  rectH?: number;
}

export function useGodotBridge({
  canvasRef,
  roles,
  shops,
  eveBalance,
  inventoryItems,
  onGodotReady,
  onGodotLoadError,
  onNavigate,
  characterId,
  ownerCapId,
  ownerCapVersion,
  ownerCapDigest,
  onShopClicked,
  onStackClicked,
  onTradeConfirmResponse,
  onOpenExchange,
  onOpenFinanceNews,
  onOpenBazaarNews,
  onOpenMission,
  onMissionClicked,
}: UseGodotBridgeOptions) {
  const { isConnected, walletAddress, handleConnect } = useConnection();
  const { data: sharedObjs } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const { bazaarType: currentBazaarType, tribeId: currentTribeId } = useCurrentSsuContext();

  // Defensive scaffold: resolve character refs at hook level for shop-interaction
  // handlers. handleShopInteraction is a plain async fn (not a hook context) so this
  // MUST live here at the top level.
  const { characterId: bridgeCharacterId } = useCharacterOwnerCapRef(
    walletAddress ?? undefined,
    SSU_OBJECT_ID,
  );

  const godotReadyRef = useRef(false);
  const messageQueueRef = useRef<Array<{ type: string; payload: Record<string, unknown> }>>([]);
  const playerPositionRef = useRef<PlayerPosition>({ x: 0, y: 0, direction: "idle" });
  const shopScreenRectsRef = useRef<ShopScreenRect[]>([]);
  const beaconScreenRef = useRef<BeaconScreenPos | null>(null);
  const guestbookBeaconRef = useRef<BeaconScreenPos | null>(null);
  const archiveBeaconRef = useRef<BeaconScreenPos | null>(null);
  const tradeBeaconRef = useRef<BeaconScreenPos | null>(null);
  const inventoryBeaconRef = useRef<BeaconScreenPos | null>(null);
  const exchangeBeaconRef = useRef<BeaconScreenPos | null>(null);
  const financeNewsBeaconRef = useRef<BeaconScreenPos | null>(null);
  const bazaarNewsBeaconRef = useRef<BeaconScreenPos | null>(null);
  const missionBeaconRef = useRef<BeaconScreenPos | null>(null);
  const skinPickerBeaconRef = useRef<BeaconScreenPos | null>(null);

  const sendToGodot = useCallback((type: string, payload: Record<string, unknown>) => {
    if (!godotReadyRef.current) {
      messageQueueRef.current.push({ type, payload });
      return;
    }
    const envelope = JSON.stringify({ type, version: PROTOCOL_VERSION, payload });
    window.dispatchEvent(new CustomEvent("godot-in", { detail: envelope }));
  }, []);

  const flushQueue = useCallback(() => {
    const queue = messageQueueRef.current.splice(0);
    for (const msg of queue) {
      const envelope = JSON.stringify({ type: msg.type, version: PROTOCOL_VERSION, payload: msg.payload });
      window.dispatchEvent(new CustomEvent("godot-in", { detail: envelope }));
    }
  }, []);

  // Phase 2: bazaar-type-aware tier filter (own / tribe / other; default = own
  // SSU only) THEN position-stacking, so co-located shops collapse to one beacon
  // ("N Shops") instead of overlapping. The same memo drives both the Godot
  // payload and the React holograms (BeaconLayer), so they never desync.
  // Re-filter live when the Market/Shop filter changes (event from SSUFilter).
  const [filterTick, setFilterTick] = useState(0);
  useEffect(() => {
    const h = () => setFilterTick(t => t + 1);
    window.addEventListener(SHOP_FILTER_CHANGED_EVENT, h);
    return () => window.removeEventListener(SHOP_FILTER_CHANGED_EVENT, h);
  }, []);

  const stacks = useMemo(() => {
    const enabledTiers = loadPersistedTierFilter();
    const tierCtx = { currentSsuId: SSU_OBJECT_ID, currentBazaarType, currentTribeId };
    const filtered = shops.filter(s => enabledTiers.has(classifyShopTier(s, tierCtx)));
    return groupShopsByPosition(filtered, tierCtx);
  }, [shops, currentBazaarType, currentTribeId, filterTick]);

  // Click routing reads the latest stacks without re-subscribing the godot-out
  // listener (which has a stable dep array).
  const stacksRef = useRef<ShopStack<Shop>[]>(stacks);
  useEffect(() => { stacksRef.current = stacks; }, [stacks]);

  // Mission (MIS) stalls — rendered in-world via the SAME Godot shop channel as
  // shops (each active mission = a stall at its creator's position). Clicking one
  // routes to the mission view (see shop_clicked below), not ShopView. The
  // "Hide all missions" pref + accepted-mission exception live in useMissionStalls.
  const { missionStalls, missionIds } = useMissionStalls(walletAddress ?? null);
  // Latest mission-stall id set for click routing (read without re-subscribing).
  const missionIdsRef = useRef<Set<string>>(missionIds);
  useEffect(() => { missionIdsRef.current = missionIds; }, [missionIds]);

  function serializeStacksForGodot(stackList: ShopStack<Shop>[]) {
    return stackList.map(st => {
      const lead = st.members[0].shop;
      return {
        ...lead,
        id:             st.id,
        ssu_id:         lead.ssuId,
        title:          st.count > 1 ? `${st.count} Shops` : lead.title,
        positionX:      st.positionX,
        positionY:      st.positionY,
        mapPosition:    { x: st.positionX, y: st.positionY },
        stackCount:     st.count,
        stackColor:     st.color,
        stackMemberIds: st.members.map(m => m.shop.id),
      };
    });
  }

  useEffect(() => {
    sendToGodot("INIT_STATE", {
      wallet: { connected: isConnected, address: walletAddress ?? null },
      shops: [...serializeStacksForGodot(stacks), ...missionStalls],
      roles,
      balance: eveBalance,
      // Drives the in-Godot advanced-only holo panels (Exchange, Finance News).
      // Godot lowercases it; "" until the SSU context resolves. Without this the
      // panels never become visible (they default-hidden until bazaarType==advanced).
      bazaarType: currentBazaarType ?? "",
      marketRole: "",
      isBanned: false,
      tradeProposals: [],
      inventory: inventoryItems,
      currentSsuId: SSU_OBJECT_ID,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendToGodot, walletAddress, isConnected, eveBalance, roles, stacks, inventoryItems, missionStalls, currentBazaarType]);

  useEffect(() => {
    sendToGodot("SHOPS_UPDATED", {
      shops: [...serializeStacksForGodot(stacks), ...missionStalls],
      currentSsuId: SSU_OBJECT_ID,
    });
    // stacks already folds in currentBazaarType/currentTribeId via its memo, so
    // beacons re-send when the SSU context resolves (tier classification + stacks).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendToGodot, stacks, missionStalls]);

  useEffect(() => {
    sendToGodot("BALANCE_UPDATED", { balance: eveBalance });
  }, [sendToGodot, eveBalance]);

  useEffect(() => {
    sendToGodot("INVENTORY_UPDATED", { items: inventoryItems });
  }, [sendToGodot, inventoryItems]);

  useEffect(() => {
    if (isConnected && walletAddress) {
      sendToGodot("WALLET_CONNECTED", {
        address: walletAddress,
        roles,
        marketRole: "",
        isBanned: false,
      });
    } else {
      sendToGodot("WALLET_DISCONNECTED", {});
    }
  }, [sendToGodot, isConnected, walletAddress, roles]);

  function extractDigest(result: Awaited<ReturnType<typeof dAppKit.signAndExecuteTransaction>>): string {
    if (result.$kind === "Transaction") {
      return result.Transaction.digest;
    }
    return result.FailedTransaction.digest;
  }

  async function handleShopInteraction(payload: Record<string, unknown>) {
    const shopId   = payload.shopId as string;
    const action   = payload.action as string;
    const index    = Number(payload.index);
    const quantity = Number(payload.quantity);
    const shop = shops.find(s => s.id === shopId);

    try {
      let digest: string | undefined;
      switch (action) {
        case "wts_buy": {
          if (!walletAddress) { return; }
          // Dead scaffold: Godot notify_shop_interaction not yet emitted.
          // paymentAmountMist is 0 — Godot will supply the real amount when wired.
          const tx = new Transaction();
          const wtsSplit = await splitEveCoin(walletAddress, BigInt(0), tx);
          const wtsListing = shop?.listings[index] as { itemTypeId: number } | undefined;
          const wtsPayoutItems: EscrowListingRef[] = wtsListing
            ? [{ typeId: wtsListing.itemTypeId, quantity }]
            : [];
          buildWTSBuy({
            shopId,
            listingIdx:        index,
            quantity,
            paymentAmountMist: 0, // dead scaffold — Godot will provide real amount
            paymentCoin:       wtsSplit.coinArg,
            ssuGovId:          sharedObjs?.ssuGovId ?? (shop?.ssuId || SSU_OBJECT_ID),
            memberRegistryId:  sharedObjs?.memberRegistryId ?? "",
            userStorageId:     USER_STORAGE_REGISTRY_ID,
            bazaarType:        "notribe",
            payoutItems:       wtsPayoutItems,
            characterId:       bridgeCharacterId ?? undefined,
            ssuId:             shop?.ssuId || SSU_OBJECT_ID,
          }, tx);
          const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
          digest = extractDigest(result);
          break;
        }
        case "wtb_fill": {
          const tx = buildWTBFill({
            shopId,
            listingIdx:       index,
            quantity,
            ssuGovId:         shop?.ssuId || SSU_OBJECT_ID,
            memberRegistryId: sharedObjs?.memberRegistryId ?? "",
            userStorageId:    USER_STORAGE_REGISTRY_ID,
            bazaarType:       "notribe",
          });
          const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
          digest = extractDigest(result);
          break;
        }
        case "de_exchange": {
          if (!walletAddress) { return; }
          // Dead scaffold: Godot notify_shop_interaction not yet emitted.
          // feeAmountMist is 0 — Godot will supply the real fee when wired.
          const tx = new Transaction();
          const deSplit = await splitEveCoin(walletAddress, BigInt(0), tx);
          const dePair = shop?.pairs?.[index] as
            | { offeredTypeId: number; offeredQty: number }
            | undefined;
          const dePayoutItems: EscrowListingRef[] = dePair
            ? [{ typeId: dePair.offeredTypeId, quantity: dePair.offeredQty }]
            : [];
          buildDEExchange({
            shopId,
            pairIdx:          index,
            units:            quantity || 1, // V31 partial DE (dead scaffold)
            feeAmountMist:    0, // dead scaffold — Godot will provide real fee
            feePaymentCoin:   deSplit.coinArg,
            ssuGovId:         sharedObjs?.ssuGovId ?? (shop?.ssuId || SSU_OBJECT_ID),
            memberRegistryId: sharedObjs?.memberRegistryId ?? "",
            userStorageId:    USER_STORAGE_REGISTRY_ID,
            bazaarType:       "notribe",
            payoutItems:      dePayoutItems,
            characterId:      bridgeCharacterId ?? undefined,
            ssuId:            shop?.ssuId || SSU_OBJECT_ID,
          }, tx);
          const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
          digest = extractDigest(result);
          break;
        }
        case "close_shop": {
          const remainingItems: { typeId: number; quantity: number }[] = [];
          if (shop) {
            if (shop.kind === "WTS") {
              for (const l of (shop.listings ?? [])) {
                const listing = l as { itemTypeId: number; quantity: number };
                if (listing.quantity > 0) remainingItems.push({ typeId: listing.itemTypeId, quantity: listing.quantity });
              }
            } else if (shop.kind === "DE") {
              for (const p of (shop.pairs ?? [])) {
                const pair = p as { offeredTypeId: number; offeredQty: number };
                if (pair.offeredQty > 0) remainingItems.push({ typeId: pair.offeredTypeId, quantity: pair.offeredQty });
              }
            }
          }
          const tx = buildCloseShop({
            shopId,
            ssuGovId: sharedObjs?.ssuGovId ?? (shop?.ssuId || SSU_OBJECT_ID),
          });
          const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
          digest = extractDigest(result);
          break;
        }
      }
      sendToGodot("TRANSACTION_RESULT", { action, success: true, message: "Transaction successful", shopId, txDigest: digest });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      sendToGodot("TRANSACTION_RESULT", { action, success: false, message: errorMsg, shopId });
    }
  }

  useEffect(() => {
    void canvasRef;

    function handleGodotOut(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail !== "string") return;

      let msg: { type?: string; payload?: Record<string, unknown> };
      try { msg = JSON.parse(detail); } catch { return; }
      if (!msg?.type) return;

      switch (msg.type) {
        // SDC C-006 / Issue 7 (OS-59): Godot bridge.gd sends "protocol_handshake_ack"
        // as the ready signal. Fall through to READY handler for queue flush.
        // eslint-disable-next-line no-fallthrough
        case "protocol_handshake_ack":
        case "READY":
          godotReadyRef.current = true;
          flushQueue();
          onGodotReady();
          break;
        case "open_panel": {
          const panel = msg.payload?.panel as string | undefined;
          if (panel === "trade" || panel === "inventory") onNavigate(panel);
          break;
        }
        case "shop_interaction":
          if (msg.payload) handleShopInteraction(msg.payload);
          break;
        case "shop_clicked": {
          // The clicked id is a STACK id. A multi-shop stack opens the picker;
          // a single-shop stack (id === member id) opens its ShopView directly.
          const shopId = msg.payload?.shopId as string | undefined;
          if (!shopId) break;
          // Mission stalls ride the same Godot shop channel — route their clicks
          // to the mission view instead of ShopView.
          if (missionIdsRef.current.has(shopId)) { onMissionClicked?.(shopId); break; }
          const stack = stacksRef.current.find(st => st.id === shopId);
          if (stack && stack.count > 1) onStackClicked?.(stack);
          else onShopClicked?.(shopId);
          break;
        }
        case "player_moved": {
          playerPositionRef.current = { x: Number(msg.payload?.x ?? 0), y: Number(msg.payload?.y ?? 0), direction: String(msg.payload?.direction ?? "idle") };
          break;
        }
        case "shop_screen_rects": {
          const rawRects = msg.payload?.rects;
          if (Array.isArray(rawRects)) {
            // Sweep I (2026-05-06): transform Godot field names (id/x/y/w/h) to
            // React envelope shape (shopId/bx/by) + compute centroid. Godot emits
            // top-left (x, y) of a panel rect; React renders centroid (bx, by).
            shopScreenRectsRef.current = rawRects.map((r: any) => {
              const w = Number(r.w ?? 0);
              const h = Number(r.h ?? 0);
              return {
                shopId: String(r.id ?? r.shopId ?? ""),
                bx: Number(r.x ?? r.bx ?? 0) + w / 2,
                by: Number(r.y ?? r.by ?? 0) + h / 2,
                vpW: Number(r.vpW ?? 0),
                vpH: Number(r.vpH ?? 0),
              };
            });
          } else {
            shopScreenRectsRef.current = null;
          }
          const beacon = msg.payload?.beacon;
          if (beacon && typeof beacon === "object" && "bx" in (beacon as object)) beaconScreenRef.current = beacon as BeaconScreenPos;
          const guestbook = msg.payload?.guestbook;
          if (guestbook && typeof guestbook === "object" && "bx" in (guestbook as object)) guestbookBeaconRef.current = guestbook as BeaconScreenPos;
          const archive = msg.payload?.archive;
          if (archive && typeof archive === "object" && "bx" in (archive as object)) archiveBeaconRef.current = archive as BeaconScreenPos;
          const trade = msg.payload?.trade;
          if (trade && typeof trade === "object" && "bx" in (trade as object)) tradeBeaconRef.current = trade as BeaconScreenPos;
          const inv = msg.payload?.inventory;
          if (inv && typeof inv === "object" && "bx" in (inv as object)) inventoryBeaconRef.current = inv as BeaconScreenPos;
          const exchange = msg.payload?.exchange;
          if (exchange && typeof exchange === "object" && "bx" in (exchange as object)) exchangeBeaconRef.current = exchange as BeaconScreenPos;
          const financeNews = msg.payload?.finance_news;
          if (financeNews && typeof financeNews === "object" && "bx" in (financeNews as object)) financeNewsBeaconRef.current = financeNews as BeaconScreenPos;
          const bazaarNews = msg.payload?.bazaar_news;
          if (bazaarNews && typeof bazaarNews === "object" && "bx" in (bazaarNews as object)) bazaarNewsBeaconRef.current = bazaarNews as BeaconScreenPos;
          const mission = msg.payload?.mission;
          if (mission && typeof mission === "object" && "bx" in (mission as object)) missionBeaconRef.current = mission as BeaconScreenPos;
          const skinPicker = msg.payload?.skin_picker;
          if (skinPicker && typeof skinPicker === "object" && "bx" in (skinPicker as object)) skinPickerBeaconRef.current = skinPicker as BeaconScreenPos;
          break;
        }
        case "shop_placement_request": break;
        case "trade_confirm_response": {
          const action = msg.payload?.action as string | undefined;
          const tradeId = msg.payload?.tradeId as string | undefined;
          if (action && tradeId) onTradeConfirmResponse?.(action as "confirm" | "dismiss", tradeId);
          break;
        }
        case "open_exchange": onOpenExchange?.(); break;
        case "open_finance_news": onOpenFinanceNews?.(); break;
        case "open_bazaar_news": onOpenBazaarNews?.(); break;
        case "open_mission": onOpenMission?.(); break;
      }
    }

    const savedScale = localStorage.getItem("bazar-ui-scale");
    if (savedScale) document.documentElement.style.setProperty("--ui-scale", savedScale);

    window.addEventListener("godot-out", handleGodotOut);
    return () => window.removeEventListener("godot-out", handleGodotOut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onGodotReady, onGodotLoadError, onNavigate, sendToGodot, flushQueue, onTradeConfirmResponse]);

  void handleConnect;

  return { sendToGodot, stacks, missionStalls, playerPositionRef, shopScreenRectsRef, beaconScreenRef, guestbookBeaconRef, archiveBeaconRef, tradeBeaconRef, inventoryBeaconRef, exchangeBeaconRef, financeNewsBeaconRef, bazaarNewsBeaconRef, missionBeaconRef, skinPickerBeaconRef };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
