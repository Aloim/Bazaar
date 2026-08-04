// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useGodotCanvas — R6.6.4 OS-14
 *
 * Data + handlers hook. Bundles 14 reactive data hooks, wires bridge callbacks,
 * manages trade-confirm-popup state, WASD movement loop, soft-refresh listener,
 * proposal poll, and multiplayer relay.
 *
 * Article XIV.2 exemption: portions verbatim from Bazar1 GodotGameWrapper.tsx.
 * Sections: lines 280-330 (hook calls), 419-501 (WASD), 519-595 (trade-confirm),
 * 598-629 (bridge + relay).
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useConnection, dAppKit, abbreviateAddress } from "@evefrontier/dapp-kit";
import { useRoles } from "@bazaar/shared/hooks/useRoles";
import { useOwnedCaps } from "@bazaar/shared/hooks/useOwnedCaps";
import { useShops } from "@bazaar/shared/hooks/useShops";
import { useBalances } from "@bazaar/shared/hooks/useBalances";
import { useOwnedInventory } from "@bazaar/shared/hooks/useOwnedInventory";
import { usePlayerCharacter } from "@bazaar/shared/hooks/usePlayerCharacter";
import { useGodotBridge } from "@bazaar/shared/hooks/useGodotBridge";
import { DEFAULT_SKIN, RESERVED_OWNER_SKIN, DAPPHUB_OWNER_ADDRESS } from "@bazaar/shared/data/playerSkins";
import { useAnnouncements } from "@bazaar/shared/hooks/useAnnouncements";
import { useWidgetConfig } from "@bazaar/shared/hooks/useWidgetConfig";
import { useCharacterNames } from "@bazaar/shared/hooks/useCharacterNames";
import { useProposals } from "@bazaar/shared/hooks/useProposals";
import { useMultiplayerRelay } from "@bazaar/shared/hooks/useMultiplayerRelay";
import { useMultiplayerChat } from "@bazaar/shared/hooks/useMultiplayerChat";
import { useMultiplayerChatLog, type ChatLogEntry } from "@bazaar/shared/hooks/useMultiplayerChatLog";
import { useGodotUiScale } from "@bazaar/shared/hooks/useGodotUiScale";
import { useMultiplayerRelayUrl } from "@bazaar/shared/hooks/dapp_hub/governance-config-hooks";
import { useSSUGovernance } from "@bazaar/shared/hooks/useSSUGovernance";
import { useDAppCaps } from "@bazaar/shared/hooks/useDAppCaps";
import { useClaimBoxContext } from "@bazaar/shared/contexts/ClaimBoxContext";
import { buildCancelTradeProposal } from "@bazaar/shared/tx/bazaarcore";
import { useSSUSharedObjects } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { SSU_OBJECT_ID, TRADE_TIMEOUT_MS } from "@bazaar/shared/constants";
import type { Shop } from "@bazaar/shared/types";
import type { ShopStack } from "@bazaar/shared/utils/shopStacks";
import type { AnnouncementData } from "@bazaar/shared/hooks/useAnnouncements";
import type { GodotCanvasHandle } from "@bazaar/shared/components/GodotCanvas";
import type { RefObject } from "react";
import { useBeaconPositioning } from "./useBeaconPositioning";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TradeConfirmPopupState {
  tradeId:          string;
  counterpartyName: string;
  expiresAt:        number;
}

export interface UseGodotCanvasReturn {
  // refs
  canvasHandleRef:  RefObject<GodotCanvasHandle | null>;
  overlayRef:       RefObject<HTMLDivElement | null>;
  focusOverlay:     () => void;
  // stable canvas element ref adapter for components needing RefObject<HTMLElement | null>
  canvasElementRef: React.RefObject<HTMLElement | null>;
  // data
  roles:            ReturnType<typeof useRoles>;
  caps:             { hasOwnerCap: boolean; hasSuperAdminCap: boolean; hasAdminCap: boolean; hasModCap: boolean };
  shops:            Shop[];
  /** Position stacks (tier-filtered + co-located grouping) for BeaconLayer. */
  stacks:           ShopStack<Shop>[];
  refetchShops:     () => void;
  refreshShop:      (shopId: string) => Promise<void>;
  eveBalance:       number;
  displayCurrency:  string;
  isClaimable:      boolean;
  inventoryItems:   ReturnType<typeof useOwnedInventory>["items"];
  character:        ReturnType<typeof usePlayerCharacter>["character"];
  announcements:    AnnouncementData[];
  /** Per-SSU AnnouncementBoard id (from SSUGovernance) — the news beacon's read/write target. */
  announcementBoardId: string;
  enabledWidgets:   boolean[];
  serverUrl:        string;
  walletAddress:    string | null;
  proposals:        ReturnType<typeof useProposals>["proposals"];
  ssuGov:           ReturnType<typeof useSSUGovernance>;
  dappCaps:         ReturnType<typeof useDAppCaps>;
  // flags
  announcementsEnabled: boolean;
  guestbookEnabled:     boolean;
  multiplayerEnabled:   boolean;
  // multiplayer
  mpConnected:    boolean;
  mpPlayerCount:  number;
  /** Rolling proximity-chat history (own + nearby players) for the chat panel. */
  chatLog:        ChatLogEntry[];
  // avatar skin (picker + owner auto-equip)
  currentSkin: string;
  applySkin:   (slug: string) => void;
  isOwner:     boolean;
  // beacon refs adapter
  beaconRefs:         ReturnType<typeof useBeaconPositioning>["beaconRefs"];
  shopScreenRectsRef: ReturnType<typeof useGodotBridge>["shopScreenRectsRef"];
  playerPositionRef:  ReturnType<typeof useGodotBridge>["playerPositionRef"];
  beaconScreenRef:    ReturnType<typeof useGodotBridge>["beaconScreenRef"];
  // bridge
  sendToGodot: ReturnType<typeof useGodotBridge>["sendToGodot"];
  // trade confirm
  tradeConfirmPopup:          TradeConfirmPopupState | null;
  setTradeConfirmPopup:       React.Dispatch<React.SetStateAction<TradeConfirmPopupState | null>>;
  handleTradeConfirmResponse: (action: "confirm" | "dismiss", tradeId: string) => Promise<void>;
  // panel opener callbacks (passed from index.tsx)
  setShowTrade:       React.Dispatch<React.SetStateAction<boolean>>;
  setShowExchange:    React.Dispatch<React.SetStateAction<boolean>>;
  setShowFinanceNews: React.Dispatch<React.SetStateAction<boolean>>;
  setShowBazaarNews:  React.Dispatch<React.SetStateAction<boolean>>;
  // shop opener (bridge-driven)
  setActiveShop:  React.Dispatch<React.SetStateAction<Shop | null>>;
  // stack-picker opener (bridge-driven; multi-shop position stacks)
  setActiveStack: React.Dispatch<React.SetStateAction<ShopStack<Shop> | null>>;
  // proximity
  proximityWarning:    string | null;
  setProximityWarning: React.Dispatch<React.SetStateAction<string | null>>;
  // c-key shop create opener
  onCreateShopRequested: (setWarning: (msg: string | null) => void, opener: () => void) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGodotCanvas(
  setShowTrade:       React.Dispatch<React.SetStateAction<boolean>>,
  setActiveShop:      React.Dispatch<React.SetStateAction<Shop | null>>,
  setShowExchange:    React.Dispatch<React.SetStateAction<boolean>>,
  setShowFinanceNews: React.Dispatch<React.SetStateAction<boolean>>,
  setShowBazaarNews:  React.Dispatch<React.SetStateAction<boolean>>,
  setActiveStack:     React.Dispatch<React.SetStateAction<ShopStack<Shop> | null>>,
  setShowMission:     React.Dispatch<React.SetStateAction<boolean>>,
  setMissionStallId:  React.Dispatch<React.SetStateAction<string | null>>,
): UseGodotCanvasReturn {
  const { walletAddress } = useConnection();

  // ── 14 data hooks ───────────────────────────────────────────────────────────
  const { refetchRoles, ...roles } = useRoles(SSU_OBJECT_ID || null);
  const { hasOwnerCap, hasSuperAdminCap, hasAdminCap, hasModCap } = useOwnedCaps();
  // Wave 3 W3-1 / W3-6: hide inactive shops from the marketplace + beacon layer.
  // After V27's Move-side auto-deactivate (drained or expired shops flip
  // is_active=false), this filter is what makes them visually disappear.
  const { shops: allShops, refetch: refetchShops, refreshShop } = useShops();
  const shops = allShops.filter(s => s.isActive);
  const { eveBalance, refetch: refetchBalances } = useBalances();
  const { currencyName, isClaimable } = useClaimBoxContext();
  // CEF deliverable — "BAZ" fallback replaced with "EVE" (FA §6, Article XIV.5)
  const displayCurrency = currencyName || "EVE";
  const { items: inventoryItems, refetch: refetchInventory } = useOwnedInventory();
  const { character } = usePlayerCharacter();
  // Resolve per-SSU shared object IDs first — widgetConfigId is needed by useWidgetConfig
  // below, and announcementBoardId is the per-SSU AnnouncementBoard the news beacon reads
  // from AND the Write modal posts to. The legacy global ANNOUNCEMENT_BOARD_ID is empty in
  // current deployments, so without this the read returns nothing and writes hit 0x0.
  const { data: sharedObjects } = useSSUSharedObjects(SSU_OBJECT_ID || null);
  const announcementBoardId = sharedObjects?.announcementBoardId ?? "";
  const { announcements, refetch: refetchAnnouncements } = useAnnouncements(announcementBoardId || null);
  const { enabledWidgets, refetch: refetchWidgets } = useWidgetConfig(sharedObjects?.widgetConfigId);
  const { data: serverUrl = "" } = useMultiplayerRelayUrl(); // one global shared relay URL (V32); localStorage is dev fallback
  const announcementsEnabled = enabledWidgets[0] === true;
  const guestbookEnabled     = enabledWidgets[1] === true;
  const multiplayerEnabled   = enabledWidgets[3] === true;
  const { proposals, refetch: refetchProposals } = useProposals(walletAddress ?? "");
  const ssuGov = useSSUGovernance(SSU_OBJECT_ID ?? "");
  const dappCaps = useDAppCaps();

  // Counterparty name resolution for awaiting proposals (we are initiator)
  const awaitingCounterpartyAddresses = useMemo(
    () => proposals
      .filter(p => p.status === "awaiting" && p.initiator === walletAddress)
      .map(p => p.counterparty),
    [proposals, walletAddress],
  );
  const counterpartyNames = useCharacterNames(awaitingCounterpartyAddresses);
  const localAddressArr = useMemo(() => (walletAddress ? [walletAddress] : []), [walletAddress]);
  const localNames = useCharacterNames(localAddressArr);

  // ── Trade confirm popup ──────────────────────────────────────────────────────
  const [tradeConfirmPopup, setTradeConfirmPopup] = useState<TradeConfirmPopupState | null>(null);

  // Poll proposals every 15 s (Bazar1 lines 519-522)
  useEffect(() => {
    const iv = setInterval(() => { refetchProposals(); }, 15_000);
    return () => clearInterval(iv);
  }, [refetchProposals]);

  // Soft-refresh listener (Bazar1 lines 525-537)
  useEffect(() => {
    function handleSoftRefresh() {
      refetchShops();
      refetchBalances();
      refetchInventory();
      refetchProposals();
      refetchAnnouncements();
      refetchWidgets();
      refetchRoles();
    }
    window.addEventListener("bazar-soft-refresh", handleSoftRefresh);
    return () => window.removeEventListener("bazar-soft-refresh", handleSoftRefresh);
  }, [refetchShops, refetchBalances, refetchInventory, refetchProposals, refetchAnnouncements, refetchWidgets, refetchRoles]);

  // Auto-trigger TradeConfirmBanner (Bazar1 lines 544-562)
  useEffect(() => {
    if (!walletAddress) return;
    const awaitingAsInitiator = proposals.filter(
      p => p.status === "awaiting" && p.initiator === walletAddress,
    );
    if (awaitingAsInitiator.length > 0 && tradeConfirmPopup === null) {
      const p = awaitingAsInitiator[0];
      const name =
        counterpartyNames.get(p.counterparty) ?? abbreviateAddress(p.counterparty);
      setTradeConfirmPopup({
        tradeId:          p.id,
        counterpartyName: name,
        expiresAt:        (p.acceptedAtMs ?? 0) + TRADE_TIMEOUT_MS,
      });
    } else if (awaitingAsInitiator.length === 0 && tradeConfirmPopup !== null) {
      setTradeConfirmPopup(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals, walletAddress, counterpartyNames]);

  // handleTradeConfirmResponse (Bazar1 lines 564-595, adapted for 4-package surface)
  // Confirm: opens trade panel. Dismiss: calls cancel_proposal on-chain via
  // buildCancelTradeProposal — returns escrowed EVE to proposer without counter-item
  // enumeration (Move-side cancel_proposal handles this internally).
  // W4 index.tsx delegates onTradeDismiss directly to this fn — no duplication.
  const handleTradeConfirmResponse = useCallback(
    async (action: "confirm" | "dismiss", tradeId: string) => {
      if (action === "confirm") {
        setShowTrade(true);
      } else {
        try {
          const tx = buildCancelTradeProposal(tradeId);
          await dAppKit.signAndExecuteTransaction({ transaction: tx });
        } catch (err) {
          console.error("[useGodotCanvas] buildCancelTradeProposal failed:", err);
          alert(err instanceof Error ? err.message : "Failed to cancel trade");
        }
      }
    },
    [setShowTrade],
  );

  // ── Refs ─────────────────────────────────────────────────────────────────────
  // GodotCanvas handle — exposes canvas element for useGodotBridge
  const canvasHandleRef = useRef<GodotCanvasHandle | null>(null);
  // Transparent input overlay — captures WASD, receives focus on panel-close
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const focusOverlay = useCallback(() => {
    setTimeout(() => overlayRef.current?.focus(), 50);
  }, []);

  // Stable canvas ref adapter so useGodotBridge receives RefObject<HTMLCanvasElement>.
  // Also exposed as canvasElementRef (widened to HTMLElement) for BeaconLayer.
  // Bridge contract: it handles null canvasRef.current (deferred queue at lines 113-120).
  const canvasRefAdapter = useMemo<React.RefObject<HTMLCanvasElement | null>>(() => ({
    get current() { return canvasHandleRef.current?.canvas ?? null; },
  }), []);

  // ── Bridge ───────────────────────────────────────────────────────────────────
  const {
    sendToGodot,
    stacks,
    missionStalls,
    playerPositionRef,
    shopScreenRectsRef,
    beaconScreenRef,
    archiveBeaconRef,
    guestbookBeaconRef,
    tradeBeaconRef,
    inventoryBeaconRef,
    exchangeBeaconRef,
    financeNewsBeaconRef,
    bazaarNewsBeaconRef,
    missionBeaconRef,
    skinPickerBeaconRef,
  } = useGodotBridge({
    canvasRef:  canvasRefAdapter,
    roles,
    shops,
    eveBalance,
    inventoryItems,
    onGodotReady:     () => {},   // GodotCanvas.onPhaseChange owns boot state machine
    onGodotLoadError: () => {},
    onNavigate: (_screen: "trade" | "inventory") => {
      // Navigation to trade/inventory routed through a separate nav prop in index.tsx;
      // the bridge callback is a no-op here — index.tsx wires nav via GodotHudOverlay.
    },
    onShopClicked:           (shopId: string) => {
      const found = shops.find(s => s.id === shopId);
      if (found) setActiveShop(found);
    },
    onStackClicked:          (stack: ShopStack<Shop>) => setActiveStack(stack),
    onTradeConfirmResponse:  handleTradeConfirmResponse,
    onOpenExchange:          () => setShowExchange(true),
    onOpenFinanceNews:       () => setShowFinanceNews(true),
    onOpenBazaarNews:        () => setShowBazaarNews(true),
    onOpenMission:           () => { setMissionStallId(null); setShowMission(true); },
    onMissionClicked:        (missionId: string) => { setMissionStallId(missionId); setShowMission(true); },
    characterId:     character?.characterId,
    ownerCapId:      character?.ownerCapId,
    ownerCapVersion: character?.ownerCapVersion,
    ownerCapDigest:  character?.ownerCapDigest,
  });

  // OS-58 Bug 3: sendToGodot ref for WASD loop (stable ref avoids dep-array churn)
  const sendToGodotRef = useRef(sendToGodot);
  useEffect(() => { sendToGodotRef.current = sendToGodot; }, [sendToGodot]);

  // ── Beacon refs adapter ───────────────────────────────────────────────────────
  const { beaconRefs } = useBeaconPositioning({
    archiveBeaconRef,
    guestbookBeaconRef,
    tradeBeaconRef,
    inventoryBeaconRef,
    exchangeBeaconRef,
    financeNewsBeaconRef,
    bazaarNewsBeaconRef,
    missionBeaconRef,
    skinPickerBeaconRef,
  });

  // ── Avatar skin (picker + owner auto-equip) ───────────────────────────────────
  const [currentSkin, setCurrentSkin] = useState(DEFAULT_SKIN);
  const skinRef = useRef(currentSkin);
  useEffect(() => { skinRef.current = currentSkin; }, [currentSkin]);
  const applySkin = useCallback((slug: string) => {
    setCurrentSkin(slug);
    sendToGodot("set_skin", { skin: slug });
  }, [sendToGodot]);
  // The DappHub owner is auto-granted the reserved warpaint in every bazaar.
  const isOwner = !!walletAddress &&
    walletAddress.toLowerCase() === DAPPHUB_OWNER_ADDRESS.toLowerCase();
  useEffect(() => { if (isOwner) applySkin(RESERVED_OWNER_SKIN); }, [isOwner, applySkin]);

  // ── Multiplayer relay + live proximity chat ───────────────────────────────────
  const localDisplayName =
    (walletAddress && localNames.get(walletAddress)) ||
    (walletAddress ? abbreviateAddress(walletAddress) : "");
  // Rolling history of submitted messages (own + peers). Populated by submitChat
  // (own) and the relay's onRemoteMessage (peers); rendered in MultiplayerChatBar.
  const { log: chatLog, appendMessage } = useMultiplayerChatLog();
  // Chat state lives in its own hook to keep this file under the 500-line guard.
  const { chatText, chatTextRef, msgRef, msgSeqRef, onChatChange: onChatTextChange, clearChat, submitChat } =
    useMultiplayerChat({ sendToGodot, displayName: localDisplayName, appendMessage });
  // Forward the React HUD UI-scale to Godot so in-world chat bubbles scale with it.
  useGodotUiScale(sendToGodot);
  // AUD-UX-02 (B5): relay identity-binding sign callback. Uses the real
  // wallet-standard signing surface on this stack — dAppKit.signPersonalMessage
  // (the same singleton already used for signAndExecuteTransaction). Returns
  // { signature } from SignedPersonalMessage. null when no wallet is connected,
  // so the relay hook stays in legacy mode for disconnected visitors.
  const signMessageCallback = useMemo(
    () => walletAddress
      ? async (message: string) => {
          const result = await dAppKit.signPersonalMessage({
            message: new TextEncoder().encode(message),
          });
          return { signature: result.signature };
        }
      : undefined,
    [walletAddress],
  );
  const { connected: mpConnected, playerCount: mpPlayerCount } = useMultiplayerRelay({
    enabled:       multiplayerEnabled,
    serverUrl,
    playerAddress: walletAddress ?? "",
    displayName:   localDisplayName,
    playerPositionRef,
    sendToGodot,
    chatTextRef,
    skinRef,
    msgRef,
    msgSeqRef,
    onRemoteMessage: appendMessage,
    signMessage:     signMessageCallback,
  });

  // ── WASD movement (Bazar1 lines 419-501) ─────────────────────────────────────
  const [proximityWarning, setProximityWarning] = useState<string | null>(null);
  const keysDownRef = useRef(new Set<string>());
  const rafIdRef    = useRef(0);

  // C-key handler passed in from index.tsx (avoids closure over index.tsx state)
  const onCreateShopRequested = useCallback(
    (setWarning: (msg: string | null) => void, opener: () => void) => {
      const { x: px, y: py } = playerPositionRef.current;
      const TOO_CLOSE_PX = 10;
      const nearbyShop = shops.find(s => {
        if (s.mapX == null || s.mapY == null) return false;
        const dx = s.mapX - px;
        const dy = s.mapY - py;
        return Math.sqrt(dx * dx + dy * dy) < TOO_CLOSE_PX;
      });
      if (nearbyShop) {
        setWarning(`Too close to "${nearbyShop.title}". Move away before placing a shop.`);
        setTimeout(() => setWarning(null), 3_000);
        return;
      }
      opener();
    },
    [shops, playerPositionRef],
  );

  // WASD effect runs continuously; C-key delegates to onCreateShopRequested.
  // The dependency array intentionally mirrors Bazar1 lines 500-501.
  useEffect(() => {
    const KEY_MAP: Record<string, { ix: number; iy: number }> = {
      w: { ix: 0, iy: -1 }, arrowup: { ix: 0, iy: -1 },
      s: { ix: 0, iy: 1 },  arrowdown: { ix: 0, iy: 1 },
      a: { ix: -1, iy: 0 }, arrowleft: { ix: -1, iy: 0 },
      d: { ix: 1, iy: 0 },  arrowright: { ix: 1, iy: 0 },
    };
    // Action keys forwarded to Godot via the `external_input` command: sprint =
    // Shift, jump = Space, salute = F. Resolve them the SAME way WASD is resolved
    // (by KeyboardEvent.key, not .code) — the EVE Frontier outer client / CEF host
    // can deliver relayed keydowns with an empty/unreliable `e.code` while `e.key`
    // stays populated, which is exactly why WASD worked in-game but Space/Shift/F
    // were silently dropped. `e.code` is kept as a desktop-native fallback. The
    // returned string is the KeyboardEvent.code value player.gd's
    // _on_external_input matches ("Space" / "ShiftLeft" / "KeyF"). Godot dedupes
    // jump/salute on the press edge, so the down send is filtered with e.repeat.
    const resolveActionCode = (e: KeyboardEvent): string | null => {
      const k = e.key;
      if (k === " " || k === "Spacebar" || k === "Space") return "Space";
      if (k === "Shift") return "ShiftLeft";   // both physical shifts → sprint
      if (k === "f" || k === "F") return "KeyF";
      // Fallback for desktop browsers with a reliable physical code.
      if (e.code === "Space") return "Space";
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") return "ShiftLeft";
      if (e.code === "KeyF") return "KeyF";
      return null;
    };
    const keysDown = keysDownRef.current;
    let lastIx = 0;
    let lastIy = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (key === "c") {
        e.preventDefault();
        e.stopPropagation();
        // Delegate to index.tsx which holds showCreate + setShowCreate
        window.dispatchEvent(new CustomEvent("godot-wrapper-c-key"));
        return;
      }
      if (key in KEY_MAP) {
        e.preventDefault();
        e.stopPropagation();
        keysDown.add(key);
        return;
      }
      const actionCode = resolveActionCode(e);
      if (actionCode) {
        if (actionCode === "Space") e.preventDefault(); // stop the page from scrolling
        if (!e.repeat) sendToGodotRef.current("external_input", { code: actionCode, pressed: true });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.key.toLowerCase());
      const actionCode = resolveActionCode(e);
      if (actionCode) {
        sendToGodotRef.current("external_input", { code: actionCode, pressed: false });
      }
    };
    const sendMovement = () => {
      let ix = 0; let iy = 0;
      for (const key of keysDown) {
        const m = KEY_MAP[key];
        if (m) { ix += m.ix; iy += m.iy; }
      }
      ix = Math.max(-1, Math.min(1, ix));
      iy = Math.max(-1, Math.min(1, iy));
      if (ix !== lastIx || iy !== lastIy) {
        lastIx = ix; lastIy = iy;
        sendToGodotRef.current("set_movement", { ix, iy });
      }
      rafIdRef.current = requestAnimationFrame(sendMovement);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    rafIdRef.current = requestAnimationFrame(sendMovement);
    overlayRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      cancelAnimationFrame(rafIdRef.current);
      keysDown.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    canvasHandleRef,
    overlayRef,
    focusOverlay,
    canvasElementRef: canvasRefAdapter as React.RefObject<HTMLElement | null>,
    roles,
    caps: { hasOwnerCap, hasSuperAdminCap, hasAdminCap, hasModCap },
    shops,
    stacks,
    missionStalls,
    refetchShops,
    refreshShop,
    eveBalance,
    displayCurrency,
    isClaimable,
    inventoryItems,
    character,
    announcements,
    announcementBoardId,
    enabledWidgets,
    serverUrl,
    walletAddress,
    proposals,
    ssuGov,
    dappCaps,
    announcementsEnabled,
    guestbookEnabled,
    multiplayerEnabled,
    mpConnected,
    mpPlayerCount,
    chatLog,
    currentSkin,
    applySkin,
    isOwner,
    chatText,
    onChatTextChange,
    clearChat,
    submitChat,
    beaconRefs,
    shopScreenRectsRef,
    playerPositionRef,
    beaconScreenRef,
    sendToGodot,
    tradeConfirmPopup,
    setTradeConfirmPopup,
    handleTradeConfirmResponse,
    setShowTrade,
    setShowExchange,
    setShowFinanceNews,
    setActiveShop,
    setActiveStack,
    proximityWarning,
    setProximityWarning,
    onCreateShopRequested,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
