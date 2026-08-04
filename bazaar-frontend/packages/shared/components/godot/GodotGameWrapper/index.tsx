// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * GodotGameWrapper — R6.6.4 OS-14
 *
 * Top-level shell composing <GodotCanvas/> (engine mount), <BeaconLayer/> (beacon
 * UI + rAF positioning), <GodotHudOverlay/> (HUD), and the floating modal tree
 * (shops, governance, trade, inventory, exchange, news, missions, create).
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useState, useCallback, useEffect } from "react";
import { GodotCanvas, BeaconLayer } from "@bazaar/shared/components";
import GuestbookPanel from "@bazaar/shared/components/widgets/GuestbookPanel";
import ExchangeWindow from "@bazaar/shared/components/widgets/ExchangeWindow";
import FinanceNewsPanel from "@bazaar/shared/components/widgets/FinanceNewsPanel";
import BazaarNewsWindow from "@bazaar/shared/components/windows/BazaarNewsWindow";
import MissionsWindow from "@bazaar/shared/components/windows/MissionsWindow";
import SkinPickerWindow from "@bazaar/shared/components/windows/SkinPickerWindow";
import QueenMessengerWindow from "@bazaar/shared/components/windows/QueenMessengerWindow";
import AnnouncementNewsWindow from "@bazaar/shared/components/windows/AnnouncementNewsWindow";
import ShopView from "@bazaar/shared/components/shop/ShopView";
import ShopStackPicker from "@bazaar/shared/components/beacons/ShopStackPicker";
import CreateShopModal from "@bazaar/shared/components/shop/CreateShopModal";
import { DirectTrade, QuicktradePanel } from "@bazaar/shared/components/trade";
import { InventoryPage } from "@bazaar/shared/components/inventory";
import DAppGovernancePanel from "@bazaar/shared/components/governance/DAppGovernancePanel";
import { SSUGovernancePanel } from "@bazaar/shared/components/governance/SSUGovernancePanel";
import { TribeGovernancePanel } from "@bazaar/shared/components/governance/TribeGovernancePanel";
import { EasyOrAdvanced, AdvancedOnly } from "@bazaar/shared/components";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";
import { Z } from "@bazaar/shared/constants/zIndex";
import type { Screen, Shop } from "@bazaar/shared/types";
import type { ShopStack } from "@bazaar/shared/utils/shopStacks";
import type { ReactNode } from "react";
import { useSSUGovId, useTribeGovId } from "@bazaar/shared/hooks/bazaarcore/governance-resolution-hooks";
import { useSSUGovernanceConfig } from "@bazaar/shared/hooks/bazaarcore/ssu-governance-hooks";
import { useTribeEconomyObjects } from "@bazaar/shared/hooks/bazaareconomy/economy-resolution-hooks";
import { useTribeTokenSymbol } from "@bazaar/shared/hooks/bazaareconomy/useTribeTokenSymbol";
import { useTribeTokenBalance } from "@bazaar/shared/hooks/bazaareconomy/ledger-hooks";
import { useGodotCanvas } from "./useGodotCanvas";
import GodotHudOverlay from "./GodotHudOverlay";
import ContactTicketWindow from "@bazaar/shared/components/windows/ContactTicketWindow";
import MarketWindow, { type MarketTab } from "@bazaar/shared/components/windows/MarketWindow";
import MultiplayerChatBar from "@bazaar/shared/components/godot/MultiplayerChatBar";
import BootstrapEconomyModal from "@bazaar/shared/components/governance/TribeGovernancePanel/BootstrapEconomyModal";
import { useTribeCaps } from "@bazaar/shared/hooks/useTribeCaps";
import { useTribeAssets } from "@bazaar/shared/hooks/useTribeAssets";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface GodotGameWrapperProps {
  /** Top-level screen setter passed down to DirectTrade, InventoryPage nav. */
  nav: (s: Screen) => void;
  /** Unused after BazarWindow drop; kept optional for forward-compatibility. */
  children?: ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GodotGameWrapper({ nav }: GodotGameWrapperProps) {
  // ── Panel state ─────────────────────────────────────────────────────────────
  const [activeShop,            setActiveShop]            = useState<Shop | null>(null);
  const [activeStack,           setActiveStack]           = useState<ShopStack<Shop> | null>(null);
  const [showAnnouncementNews,  setShowAnnouncementNews]  = useState(false);
  const [showCreate,            setShowCreate]            = useState(false);
  const [showGuestbook,         setShowGuestbook]         = useState(false);
  const [showTrade,             setShowTrade]             = useState(false);
  const [showInventory,         setShowInventory]         = useState(false);
  const [showQuicktrade,        setShowQuicktrade]        = useState(false);
  const [showExchange,          setShowExchange]          = useState(false);
  const [showFinanceNews,       setShowFinanceNews]       = useState(false);
  const [showBazaarNews,        setShowBazaarNews]        = useState(false);
  const [showMission,           setShowMission]           = useState(false);
  const [showSkinPicker,        setShowSkinPicker]        = useState(false);
  const [showQueenMessenger,    setShowQueenMessenger]    = useState(false);
  const [missionStallId,        setMissionStallId]        = useState<string | null>(null);
  const [showSSUGov,            setShowSSUGov]            = useState(false);
  const [showGlobalGov,         setShowGlobalGov]         = useState(false);
  const [showDAppGov,           setShowDAppGov]           = useState(false);
  const [showBugReport,         setShowBugReport]         = useState(false);
  const [showBootstrapEconomy,  setShowBootstrapEconomy]  = useState(false);
  const [showMarket,            setShowMarket]            = useState(false);
  const [marketTab,             setMarketTab]             = useState<MarketTab>("filter");

  // ── Data + bridge hook ──────────────────────────────────────────────────────
  // setShowExchange / setShowFinanceNews passed in so bridge callbacks
  // (onOpenExchange / onOpenFinanceNews) call them directly via useGodotBridge.
  const canvas = useGodotCanvas(setShowTrade, setActiveShop, setShowExchange, setShowFinanceNews, setShowBazaarNews, setActiveStack, setShowMission, setMissionStallId);
  const {
    canvasHandleRef, overlayRef, focusOverlay, canvasElementRef,
    roles, caps, shops, stacks, missionStalls, refetchShops, refreshShop,
    eveBalance, displayCurrency, isClaimable,
    inventoryItems, character, announcements, announcementBoardId, enabledWidgets,
    walletAddress, proposals, ssuGov, dappCaps,
    announcementsEnabled, guestbookEnabled, multiplayerEnabled,
    mpConnected, mpPlayerCount,
    chatLog, chatText, onChatTextChange, clearChat, submitChat,
    currentSkin, applySkin, isOwner,
    beaconRefs, shopScreenRectsRef, playerPositionRef,
    sendToGodot,
    tradeConfirmPopup, setTradeConfirmPopup, handleTradeConfirmResponse,
    proximityWarning, setProximityWarning,
    onCreateShopRequested,
  } = canvas;
  void isClaimable; void inventoryItems; void enabledWidgets; // consumed by bridge internally
  void sendToGodot; // bridge effect-driven; no direct call from render

  // ── Phase 11 (EconomyFixplan): Exchange ID resolution ────────────────────────
  // Chain: SSU_OBJECT_ID → ssuGovId → ssuGovConfig.tribeId → tribeGovernanceId → econObjects
  // NOTE: canvas.ssuGov (useSSUGovernance) does NOT expose tribeId — it lives on
  //       SSUGovernanceConfig (useSSUGovernanceConfig). Two extra RPC calls are required.
  const { data: ssuGovId }    = useSSUGovId(SSU_OBJECT_ID || null);
  const { data: ssuGovConfig } = useSSUGovernanceConfig(ssuGovId ?? null);
  const tribeIdNum = ssuGovConfig?.tribeId ?? null;
  const tribeIdStr = tribeIdNum != null && tribeIdNum > 0 ? String(tribeIdNum) : null;
  const { data: tribeGovernanceId } = useTribeGovId(tribeIdStr);
  const { data: econObjects }       = useTribeEconomyObjects(tribeIdStr);
  const tokenSymbolQ                = useTribeTokenSymbol(tribeIdNum);
  // HUD tribe-token balance — Advanced bazaar only. The hook returns null
  // when ledgerId or walletAddress is unset, which naturally hides the row
  // in NoTribe / Easy (no econObjects ⇒ no ledgerId).
  const tribeTokenBalQ = useTribeTokenBalance(
    econObjects?.ledgerId ?? null,
    walletAddress ?? null,
  );

  // Post-V26 Wave 1 (Issue 3) — HUD bootstrap button visibility. The button is
  // gated on the connected wallet holding a TribeLeaderCap (`hasLeaderCap`) AND
  // that leader's own tribe being unbootstrapped. `bootstrapAlreadyDone` flips
  // it off on success. Members own an SSUOwnerCap but no TribeLeaderCap, so
  // they never see this button (previously it leaked via `caps.hasOwnerCap`).
  const { hasLeaderCap, leaderTribeIdx } = useTribeCaps();
  const tribeAssets = useTribeAssets(leaderTribeIdx);
  const bootstrapAlreadyDone = !!tribeAssets.isFullyBootstrapped;

  // ── News window: role gating ─────────────────────────────────────────────────
  // "Write SSU News" → SSU admin+ (Owner/SuperAdmin/Admin caps; Mod excluded).
  // Tribe-wide posting moved to Tribe Governance → Admin → Tribe Announcement
  // (broadcasts to every SSU board), so no TribeAdminCap resolution is needed here.
  const canWriteSSUNews = caps.hasOwnerCap || caps.hasSuperAdminCap || caps.hasAdminCap;

  // panel-open guard — suppresses beacon layer and input overlay
  const panelOpen =
    activeShop !== null ||
    activeStack !== null ||
    showCreate ||
    showAnnouncementNews ||
    showGuestbook;

  // ── C-key shop create listener from useGodotCanvas ──────────────────────────
  useEffect(() => {
    const handler = () => {
      if (activeShop || showCreate) return;
      onCreateShopRequested(setProximityWarning, () => setShowCreate(true));
    };
    window.addEventListener("godot-wrapper-c-key", handler);
    return () => window.removeEventListener("godot-wrapper-c-key", handler);
  }, [activeShop, showCreate, onCreateShopRequested, setProximityWarning]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ width: "100%", flex: "1 1 0", minHeight: 0, position: "relative", overflow: "hidden" }}
      className="godot-container"
    >
      {/* Godot canvas — owns boot state machine + DockingText + ArrivalOverlay */}
      <GodotCanvas ref={canvasHandleRef} />

      {/* BeaconLayer — rAF positioning + beacon UI, suppressed when panel open */}
      {!panelOpen && (
        <BeaconLayer
          canvasRef={canvasElementRef}
          beaconRefs={beaconRefs}
          shopScreenRectsRef={shopScreenRectsRef}
          stacks={stacks}
          missionStalls={missionStalls}
          onMissionStallClicked={(missionId) => { setMissionStallId(missionId); setShowMission(true); }}
          onOpenWindow={(w) => {
            if (w === "trade")     setShowTrade(true);
            if (w === "inventory") setShowInventory(true);
          }}
          onOpenAnnouncement={() => setShowAnnouncementNews(true)}
          onOpenArchive={() => setShowAnnouncementNews(true)}
          onOpenGuestbook={() => setShowGuestbook(true)}
          onOpenExchange={() => setShowExchange(true)}
          onOpenFinanceNews={() => setShowFinanceNews(true)}
          onOpenBazaarNews={() => setShowBazaarNews(true)}
          onOpenMission={() => setShowMission(true)}
          onOpenSkinPicker={() => setShowSkinPicker(true)}
          onOpenQueenMessenger={() => setShowQueenMessenger(true)}
          announcement={announcements[0] ? { title: announcements[0].title } : undefined}
          announcementWidgetEnabled={announcementsEnabled}
          guestbookWidgetEnabled={guestbookEnabled}
          onShopClicked={(shop: Shop) => setActiveShop(shop)}
          onStackClicked={(stack) => setActiveStack(stack)}
        />
      )}

      {/* Transparent input overlay — captures focus for WASD */}
      {!panelOpen && (
        <div
          ref={overlayRef}
          tabIndex={0}
          style={{
            position: "absolute", inset: 0, zIndex: 1,
            outline: "none", cursor: "default", pointerEvents: "none",
          }}
        />
      )}

      {/* HUD overlay */}
      <GodotHudOverlay
        displayCurrency={displayCurrency}
        eveBalance={eveBalance}
        tribeTokenBalance={tribeTokenBalQ.data?.balance ?? null}
        tribeTokenDecimals={tribeTokenBalQ.data?.decimals ?? null}
        tribeTokenSymbol={tokenSymbolQ.symbol ?? null}
        multiplayerEnabled={multiplayerEnabled}
        mpConnected={mpConnected}
        mpPlayerCount={mpPlayerCount}
        onOpenTrade={() => setShowTrade(true)}
        onOpenInventory={() => setShowInventory(true)}
        onOpenMarket={(tab) => { setMarketTab(tab); setShowMarket(true); }}
        onOpenQuicktrade={() => setShowQuicktrade(true)}
        onOpenArchive={() => setShowAnnouncementNews(true)}
        onOpenSSUGov={() => setShowSSUGov(true)}
        onOpenGlobalGov={() => setShowGlobalGov(true)}
        onOpenDAppGov={() => setShowDAppGov(true)}
        onOpenFinanceNews={() => setShowFinanceNews(true)}
        onOpenBazaarNews={() => setShowBazaarNews(true)}
        focusOverlay={focusOverlay}
        roles={roles}
        caps={caps}
        ssuGov={ssuGov}
        dappCaps={dappCaps}
        walletAddress={walletAddress}
        tradeConfirmPopup={tradeConfirmPopup}
        showTrade={showTrade}
        onTradeConfirm={() => { setTradeConfirmPopup(null); setShowTrade(true); }}
        onTradeDismiss={async () => {
          if (tradeConfirmPopup) {
            await handleTradeConfirmResponse("dismiss", tradeConfirmPopup.tradeId);
          }
        }}
        proximityWarning={proximityWarning}
        onOpenBugReport={() => setShowBugReport(true)}
        onOpenBootstrapEconomy={() => setShowBootstrapEconomy(true)}
        bootstrapAlreadyDone={bootstrapAlreadyDone}
        isTribeLeader={hasLeaderCap}
      />

      {/* ── Floating panels #2-12, #15-16 ──────────────────────────────────── */}

      {/* Panel #2: ShopView (Bazar1 1337-1354) */}
      {activeShop && (
        <div className="game-overlay-panel">
          <ShopView
            shop={activeShop}
            onBack={() => { setActiveShop(null); focusOverlay(); }}
            refetch={refetchShops}
            refreshShop={refreshShop}
          />
        </div>
      )}

      {/* Panel #2b: ShopStackPicker — Phase 2 collision dropdown. Lists the
          shops sharing one map position; selecting one opens its ShopView. */}
      {activeStack && (
        <ShopStackPicker
          stack={activeStack}
          onSelect={(shop) => { setActiveStack(null); setActiveShop(shop); }}
          onClose={() => { setActiveStack(null); focusOverlay(); }}
        />
      )}

      {/* Panel #3: News window — opened by the in-world News beacon AND the HUD
          News → "Tribe News" menu item. ONE combined feed for this SSU (tribe +
          SSU announcements listed consecutively): tribe-wide posts are broadcast
          into every SSU board from Tribe Governance → Admin → Tribe Announcement,
          so they already live in this board. Role-gated "Write SSU News" only. */}
      {showAnnouncementNews && (
        <AnnouncementNewsWindow
          ssuBoardId={announcementBoardId}
          canWriteSSU={canWriteSSUNews}
          walletAddress={walletAddress ?? null}
          onClose={() => { setShowAnnouncementNews(false); focusOverlay(); }}
        />
      )}

      {/* Panel #4: GuestbookPanel (Bazar1 1380-1387) */}
      {showGuestbook && (
        <div className="game-overlay-panel">
          <GuestbookPanel inline onClose={() => { setShowGuestbook(false); focusOverlay(); }} />
        </div>
      )}

      {/* Panel #7: DirectTrade (Bazar1 1471-1490) */}
      {showTrade && (
        <div className="scroll-area" style={{ position: "absolute", top: "40px", left: "20px", width: "min(700px, calc(100vw - 40px))", maxHeight: "80vh", overflowY: "auto", overflowX: "hidden", background: "rgba(15,12,8,0.94)", border: "1px solid rgba(204,112,0,0.3)", borderRadius: "8px", padding: "16px", zIndex: Z.PANEL, pointerEvents: "auto", boxShadow: "0 0 24px rgba(204,112,0,0.12)" }}>
          <DirectTrade nav={nav} onClose={() => setShowTrade(false)} />
        </div>
      )}

      {/* Panel #8: InventoryPage (Bazar1 1493-1515) */}
      {showInventory && (
        <div className="scroll-area" style={{ position: "absolute", top: "120px", right: "20px", width: "420px", maxHeight: "80vh", overflowY: "auto", background: "rgba(15,12,8,0.94)", border: "1px solid rgba(204,112,0,0.3)", borderRadius: "8px", padding: "16px", zIndex: Z.PANEL, pointerEvents: "auto", boxShadow: "0 0 24px rgba(204,112,0,0.12)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h2 style={{ margin: 0, color: "#cc7000", fontSize: "1rem", fontFamily: "var(--font-display)" }}>INVENTORY</h2>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowInventory(false)} style={{ color: "#cc7000" }}>X</button>
          </div>
          <InventoryPage nav={nav} onClose={() => setShowInventory(false)} />
        </div>
      )}

      {/* Panel #9: QuicktradePanel (Bazar1 1518-1540) */}
      {showQuicktrade && (
        <div className="scroll-area" style={{ position: "absolute", top: "40px", left: "50%", transform: "translateX(-50%)", width: "min(480px, calc(100vw - 40px))", maxHeight: "85vh", overflowY: "auto", background: "rgba(15,12,8,0.94)", border: "1px solid rgba(204,112,0,0.3)", borderRadius: "8px", padding: "16px", zIndex: Z.PANEL, pointerEvents: "auto", boxShadow: "0 0 24px rgba(204,112,0,0.12)" }}>
          <QuicktradePanel onClose={() => { setShowQuicktrade(false); focusOverlay(); }} />
        </div>
      )}

      {/* Panel #11: ExchangeWindow (Bazar1 1551-1564) — Phase 11 wired */}
      <AdvancedOnly>
        {showExchange && (
        <div className="game-overlay-panel">
          <ExchangeWindow
            ledgerId={econObjects?.ledgerId ?? null}
            vaultId={econObjects?.vaultId ?? null}
            configId={econObjects?.configId ?? null}
            tribeGovernanceId={tribeGovernanceId ?? null}
            currencyName={tokenSymbolQ.symbol}
            onClose={() => { setShowExchange(false); focusOverlay(); }}
          />
        </div>
        )}
      </AdvancedOnly>

      {/* Panel #12: FinanceNewsPanel — Phase 12 wires tribeIdx + currencyName from resolution chain. */}
      {/* tribeName="Tribe" retained — EFP12-L1: needs useTribeName(tribeId) primitive (out of scope). */}
      <AdvancedOnly>
        {showFinanceNews && (
        <div className="game-overlay-panel">
          <FinanceNewsPanel
            tribeIdx={tribeIdNum ?? 0}
            tribeName="Tribe"
            currencyName={tokenSymbolQ.symbol ?? "TRIBE"}
            onClose={() => { setShowFinanceNews(false); focusOverlay(); }}
          />
        </div>
        )}
      </AdvancedOnly>

      {/* BazaarBeacon window — DApp-wide news + polls + comments (all bazaar types).
          Rendered WITHOUT the .game-overlay-panel wrapper: BazaarNewsWindow brings
          its own .market-window chrome (position:absolute), which collapsed the
          content-sized panel to a thin "flat line". It self-positions like MarketWindow. */}
      {showBazaarNews && (
        <BazaarNewsWindow onClose={() => { setShowBazaarNews(false); focusOverlay(); }} />
      )}

      {/* Mission beacon window — player-driven mission economy (all bazaar types).
          Same as above — MissionsWindow owns its .market-window chrome, no wrapper. */}
      {showMission && (
        <MissionsWindow initialMissionId={missionStallId} onClose={() => { setShowMission(false); setMissionStallId(null); focusOverlay(); }} />
      )}

      {/* Identity / Avatar skin picker — opened by the SkinPickerBeacon. Live-applies
          via applySkin (Godot set_skin + relay broadcast); owner unlocks red-tribal. */}
      {showSkinPicker && (
        <SkinPickerWindow
          currentSkin={currentSkin}
          onSelect={applySkin}
          ownerUnlocked={isOwner}
          onClose={() => { setShowSkinPicker(false); focusOverlay(); }}
        />
      )}

      {/* A Queen's Messenger — blood-red lore dialogue → Nexus-Ѫ hub. Opened by
          the in-world Courier NPC beacon (BeaconLayer.onOpenQueenMessenger). */}
      {showQueenMessenger && (
        <QueenMessengerWindow onClose={() => { setShowQueenMessenger(false); focusOverlay(); }} />
      )}

      {/* Panel #13: SSUGovernancePanel — R6.6.4b activated (closes OS-32)
          ⚠ SHARED-SURFACE RULE: this is the IN-GAME host of the shared
          <SSUGovernancePanel>. The DappHub twin host is
          apps/dapphub/src/components/hub/SSUGovernanceScreen.tsx. Edit governance
          behavior in the shared component (it lands on both); mirror any host-level
          wiring change across both hosts. */}
      {showSSUGov && SSU_OBJECT_ID && (
        <div className="scroll-area" style={{ position: "absolute", top: "40px", left: "20px", width: "min(750px, calc(100vw - 40px))", maxHeight: "85vh", overflowY: "auto", overflowX: "hidden", background: "rgba(15,12,8,0.94)", border: "1px solid rgba(204,112,0,0.3)", borderRadius: "8px", padding: "16px", zIndex: Z.PANEL, pointerEvents: "auto", boxShadow: "0 0 24px rgba(204,112,0,0.12)" }}>
          <SSUGovernancePanel
            ssuId={SSU_OBJECT_ID}
            onClose={() => { setShowSSUGov(false); focusOverlay(); }}
          />
        </div>
      )}

      {/* Panel #14: TribeGovernancePanel — R6.6.4c activated, Easy+Advanced gated (closes OS-33)
          ⚠ SHARED-SURFACE RULE: this is the IN-GAME host of the shared
          <TribeGovernancePanel>. The DappHub twin host is
          apps/dapphub/src/components/hub/TribeGovernanceScreen.tsx (mounts it with
          `tribeOnly`). Edit governance behavior in the shared component (it lands on
          both); mirror any host-level wiring change across both hosts. */}
      {showGlobalGov && (
        <EasyOrAdvanced ssuId={SSU_OBJECT_ID}>
          <div className="scroll-area" style={{ position: "absolute", top: "40px", left: "20px", width: "min(800px, calc(100vw - 40px))", maxHeight: "85vh", overflowY: "auto", overflowX: "hidden", background: "rgba(15,12,8,0.94)", border: "1px solid rgba(204,112,0,0.3)", borderRadius: "8px", padding: "16px", zIndex: Z.PANEL, pointerEvents: "auto", boxShadow: "0 0 24px rgba(204,112,0,0.12)" }}>
            <TribeGovernancePanel
              nav={nav}
              onClose={() => { setShowGlobalGov(false); focusOverlay(); }}
            />
          </div>
        </EasyOrAdvanced>
      )}

      {/* Panel #15: DAppGovernancePanel (Bazar1 1634-1657) */}
      {showDAppGov && (
        <div className="scroll-area" style={{ position: "absolute", top: "40px", left: "20px", width: "min(750px, calc(100vw - 40px))", maxHeight: "85vh", overflowY: "auto", overflowX: "hidden", background: "rgba(15,12,8,0.94)", border: "1px solid rgba(204,112,0,0.3)", borderRadius: "8px", padding: "16px", zIndex: Z.PANEL, pointerEvents: "auto", boxShadow: "0 0 24px rgba(204,112,0,0.12)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h2 style={{ margin: 0, color: "#cc7000", fontSize: "1rem", fontFamily: "var(--font-display)" }}>DAPP GOVERNANCE</h2>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowDAppGov(false)} style={{ color: "#cc7000" }}>X</button>
          </div>
          <DAppGovernancePanel onClose={() => { setShowDAppGov(false); focusOverlay(); }} />
        </div>
      )}

      {/* Panel #16: CreateShopModal (Bazar1 1660-1672) */}
      {showCreate && (
        <CreateShopModal
          playerPositionRef={playerPositionRef}
          onClose={() => {
            setShowCreate(false);
            focusOverlay();
          }}
        />
      )}

      {/* Post-V26 Wave 1 (Issue 9): in-HUD Bug Report — opens ContactTicketWindow
          with `defaultCategory="bug"` prefilled. Same on-chain submit_ticket
          flow as DappHub's Contact-us window. */}
      {showBugReport && (
        <ContactTicketWindow
          onClose={() => { setShowBugReport(false); focusOverlay(); }}
          defaultCategory="bug"
        />
      )}

      {/* In-HUD Market window — Filter (Shop Filter) + My Shops (close) tabs.
          Opened from the HUD "Market" button; replaces the old BazarWindow
          sidebar filter cluster that was unclickable inside the CEF dapp. */}
      {showMarket && (
        <MarketWindow initialTab={marketTab} onClose={() => { setShowMarket(false); focusOverlay(); }} />
      )}

      {/* Live "type-out" proximity chat — bottom-left textbar. Always present in
          the world so the input is ready and the own-avatar bubble works
          immediately (LOCAL_CHAT path needs no relay). Broadcasting to others kicks
          in once multiplayer is enabled + the relay connects (the dot shows reach). */}
      <MultiplayerChatBar
        active
        connected={multiplayerEnabled && mpConnected}
        value={chatText}
        onChange={onChatTextChange}
        onClear={clearChat}
        onSubmit={submitChat}
        log={chatLog}
      />

      {/* Post-V26 Wave 1 (Issue 3): in-HUD Bootstrap Tribe Economy — wraps the
          existing BootstrapEconomySubTab in a floating panel. Visible to
          TribeLeader on Advanced bazaars only; the HUD button auto-hides once
          tribeAssets.isFullyBootstrapped flips true. The HUD holds its OWN
          useTribeAssets instance (useTribeRegistry is per-instance state, not a
          shared cache), so we refetch it on close — immediately and again after
          a short delay for chain indexing — so the button disappears post-bootstrap. */}
      {showBootstrapEconomy && (
        <BootstrapEconomyModal
          onClose={() => {
            setShowBootstrapEconomy(false);
            focusOverlay();
            tribeAssets.refetch();
            setTimeout(() => tribeAssets.refetch(), 4000);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
