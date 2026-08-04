// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useRef, useLayoutEffect, useMemo } from "react";
import { AdvancedOnly } from "./BazaarFeature";
import { useHideMissions } from "./SSUFilter";
import { useCharacterNames } from "@bazaar/shared/hooks/useCharacterNames";
import type { RefObject } from "react";
import type { BeaconScreenPos, ShopScreenRect } from "../bridge/envelope";
import type { Shop } from "@bazaar/shared/types";
import type { ShopStack } from "@bazaar/shared/utils/shopStacks";
import type { MissionStall } from "@bazaar/shared/hooks/bazaarcore/useMissionStalls";
import AnnouncementBeacon from "./beacons/AnnouncementBeacon";
import GuestbookBeacon from "./beacons/GuestbookBeacon";
import ExchangeBeacon from "./beacons/ExchangeBeacon";
import BazaarNewsBeacon from "./beacons/BazaarNewsBeacon";
import MissionBeacon from "./beacons/MissionBeacon";
import SkinPickerBeacon from "./beacons/SkinPickerBeacon";
import QueenMessengerBeacon from "./beacons/QueenMessengerBeacon";
import ShopHologram from "./beacons/ShopHologram";
import ServiceBeaconHitArea from "./beacons/ServiceBeaconHitArea";
import HoloButton from "./HoloButton";
import MatrixRain from "./MatrixRain";
import { useGodotPanelChannels } from "@bazaar/shared/hooks/useGodotPanelChannels";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BeaconRefs {
  guestbook:    RefObject<BeaconScreenPos | null>;
  archive:      RefObject<BeaconScreenPos | null>;
  trade:        RefObject<BeaconScreenPos | null>;
  inventory:    RefObject<BeaconScreenPos | null>;
  exchange:     RefObject<BeaconScreenPos | null>;
  financeNews:  RefObject<BeaconScreenPos | null>;
  bazaarNews:   RefObject<BeaconScreenPos | null>;
  mission:      RefObject<BeaconScreenPos | null>;
  skinPicker:   RefObject<BeaconScreenPos | null>;
}

export interface BeaconLayerProps {
  /** Ref to the Godot canvas element — used for getBoundingClientRect coordinate mapping. */
  canvasRef: RefObject<HTMLElement | null>;
  /** All beacon position refs from useGodotBridge. */
  beaconRefs: BeaconRefs;
  /** Shop rect positions from useGodotBridge. */
  shopScreenRectsRef: RefObject<ShopScreenRect[]>;
  /** Position stacks for ShopHologram render — one entry per spot, keyed by
   *  stack.id (== highest-priority member id), matching shopScreenRectsRef. */
  stacks: ShopStack<Shop>[];
  /** Active Mission (MIS) stalls — each renders a hologram label the SAME way as a
   *  shop (its id matches a Godot screen-rect), so missions get a visible in-world
   *  beacon at the creator's position. */
  missionStalls?: MissionStall[];
  /** Fired when a mission-stall hologram is clicked — opens the MissionsWindow. */
  onMissionStallClicked?: (missionId: string) => void;
  /** Required: called with "trade" or "inventory" when those beacons are clicked. */
  onOpenWindow: (w: "trade" | "inventory") => void;
  /** Optional: called when AnnouncementBeacon title area is clicked. */
  onOpenAnnouncement?: () => void;
  /** Optional: forwarded to AnnouncementBeacon.onArchiveClick — opens archive. */
  onOpenArchive?: () => void;
  /** Optional: called when GuestbookBeacon is clicked. */
  onOpenGuestbook?: () => void;
  /** Optional: called when ExchangeBeacon is clicked. */
  onOpenExchange?: () => void;
  /** Optional: called when the FinanceNews beacon is clicked (Advanced only). */
  onOpenFinanceNews?: () => void;
  /** Optional: called when the BazaarNewsBeacon is clicked. */
  onOpenBazaarNews?: () => void;
  /** Optional: called when the MissionBeacon is clicked. */
  onOpenMission?: () => void;
  /** Optional: called when the SkinPickerBeacon is clicked. */
  onOpenSkinPicker?: () => void;
  /** Optional: called when the in-world Queen's Messenger NPC is clicked. */
  onOpenQueenMessenger?: () => void;
  /** When provided, AnnouncementBeacon renders with this data.
   *  When explicitly `null`, announcement overlay is fully hidden (widget disabled).
   *  When `undefined`, MatrixRain fallback renders (no announcement data yet). */
  announcement?: { title: string } | null;
  /** When true, the announcement beacon overlay is rendered (widget-gated ON by default). */
  announcementWidgetEnabled?: boolean;
  /** When true, the guestbook beacon overlay is rendered (widget-gated ON by default). */
  guestbookWidgetEnabled?: boolean;
  /** Fired when a single-shop hologram is clicked. */
  onShopClicked?: (shop: Shop) => void;
  /** Fired when a multi-shop stack hologram is clicked (opens the picker). */
  onStackClicked?: (stack: ShopStack<Shop>) => void;
}

// Purple badge accent for Mission (MIS) stall holograms — mirrors shop_node.gd
// COLOR_MIS = Color(0.65, 0.35, 0.95).
const MIS_HOLOGRAM_COLOR = "#a659f2";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert hex color string (e.g. "ff9900") to "R, G, B" for rgba().
 *  Mirrors Bazar1 GodotGameWrapper.tsx lines 56-62. */
function hexToRgb(hex: string | undefined): string | undefined {
  if (!hex || hex.length < 6) return undefined;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

// ── Vertical offsets matching Bazar1 positioning constants ────────────────────
// Bazar1 GodotGameWrapper.tsx:
//   announcement beacon: by * scaleY - 120  (line 688)
//   guestbook beacon:    by * scaleY - 80   (line 711)
//   trade beacon:        by * scaleY - 20   (line 734)
//   inventory beacon:    by * scaleY - 20   (line 757)
//   register beacon:     by * scaleY - 20   (line 780)
//   donate beacon:       by * scaleY - 20   (line 803)
//   exchange beacon:     by * scaleY - 20   (line 849)
const Y_OFFSET: Record<string, number> = {
  announcement: -120,
  guestbook:    -80,
  trade:        -20,
  inventory:    -20,
  exchange:     -20,
  bazaarNews:   -20,
  mission:      -20,
  skinPicker:   -20,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function BeaconLayer({
  canvasRef,
  beaconRefs,
  shopScreenRectsRef,
  stacks,
  missionStalls = [],
  onMissionStallClicked,
  onOpenWindow,
  onOpenAnnouncement,
  onOpenArchive,
  onOpenGuestbook,
  onOpenExchange,
  onOpenFinanceNews,
  onOpenBazaarNews,
  onOpenMission,
  onOpenSkinPicker,
  onOpenQueenMessenger,
  announcement,
  announcementWidgetEnabled = true,
  guestbookWidgetEnabled = true,
  onShopClicked,
  onStackClicked,
}: BeaconLayerProps) {
  // "Hide all missions" pref (Market & Missions Filter tab) suppresses the fixed
  // kiosk MissionBeacon in-world (purely a cosmetic entry point to the kiosk).
  // Re-renders live on SHOP_FILTER_CHANGED_EVENT via useHideMissions.
  const hideMissions = useHideMissions();

  // Issue 3 — service beacons whose visual is now an in-Godot animated HoloPanel.
  // For those channels we hide React's own holographic button and render only an
  // invisible click/hover hit-area (ServiceBeaconHitArea). Empty until a
  // panel-capable Godot build connects, so old .pck = unchanged React buttons.
  const panelChannels = useGodotPanelChannels();

  // ── DOM refs for each beacon overlay container ────────────────────────────
  const announcementOverlayRef = useRef<HTMLDivElement>(null);
  const guestbookOverlayRef    = useRef<HTMLDivElement>(null);
  const tradeOverlayRef        = useRef<HTMLDivElement>(null);
  const inventoryOverlayRef    = useRef<HTMLDivElement>(null);
  const exchangeOverlayRef     = useRef<HTMLDivElement>(null);
  const bazaarNewsOverlayRef   = useRef<HTMLDivElement>(null);
  const missionOverlayRef      = useRef<HTMLDivElement>(null);
  const skinPickerOverlayRef   = useRef<HTMLDivElement>(null);
  const shopOverlayRef         = useRef<HTMLDivElement>(null);
  // NOTE: No archiveOverlayRef — archive open is forwarded via
  // AnnouncementBeacon.onArchiveClick (CC-BLAYER-001 fix).

  // Resolve each single-shop's owner address → EVE character name (shown on the
  // hologram on hover). Stacks (count > 1) hold multiple owners, so they're
  // excluded — the stack renders "N Shops" with no single owner. One batched
  // hook call (Map<address,name>) avoids a per-shop rules-of-hooks violation.
  const singleShopOwners = useMemo(
    () =>
      stacks
        .filter(st => st.count === 1)
        .map(st => st.members[0].shop.owner)
        .filter((a): a is string => typeof a === "string" && a.length > 0),
    [stacks],
  );
  const characterNames = useCharacterNames(singleShopOwners);

  // ── Single consolidated rAF loop — mirrors Bazar1's per-beacon loops ──────
  // Pattern: Bazar1 GodotGameWrapper.tsx lines 635-854.
  // Each beacon: read its ref, compute scaleX/scaleY from canvas bounding rect,
  // set style.left / style.top imperatively. Display:none when ref is null.
  useLayoutEffect(() => {
    let rafId = 0;

    const update = () => {
      const canvas = canvasRef.current;
      const cssRect = canvas ? canvas.getBoundingClientRect() : null;

      const positionBeacon = (
        el: HTMLDivElement | null,
        beacon: BeaconScreenPos | null,
        yOffset: number,
      ) => {
        if (!el) return;
        if (!cssRect || !beacon) {
          el.style.display = "none";
          return;
        }
        const scaleX = cssRect.width  / (beacon.vpW || 1);
        const scaleY = cssRect.height / (beacon.vpH || 1);
        el.style.display = "";
        el.style.left    = `${beacon.bx * scaleX}px`;
        el.style.top     = `${beacon.by * scaleY + yOffset}px`;
      };

      // archive ref holds the announcement/matrix rain beacon position.
      // This matches Bazar1's beaconScreenRef which is populated from p.beacon.
      // Our useGodotBridge populates archiveRef from p.archive — same semantic role.
      positionBeacon(announcementOverlayRef.current, beaconRefs.archive.current,      Y_OFFSET.announcement);
      positionBeacon(guestbookOverlayRef.current,    beaconRefs.guestbook.current,    Y_OFFSET.guestbook);
      positionBeacon(tradeOverlayRef.current,        beaconRefs.trade.current,        Y_OFFSET.trade);
      positionBeacon(inventoryOverlayRef.current,    beaconRefs.inventory.current,    Y_OFFSET.inventory);
      positionBeacon(exchangeOverlayRef.current,     beaconRefs.exchange.current,     Y_OFFSET.exchange);
      positionBeacon(bazaarNewsOverlayRef.current,   beaconRefs.bazaarNews.current,   Y_OFFSET.bazaarNews);
      positionBeacon(missionOverlayRef.current,      beaconRefs.mission.current,      Y_OFFSET.mission);
      positionBeacon(skinPickerOverlayRef.current,   beaconRefs.skinPicker.current,   Y_OFFSET.skinPicker);

      // ── Shop hologram positions ──────────────────────────────────────────
      // Mirrors Bazar1 GodotGameWrapper.tsx lines 640-669.
      // CC-BLAYER-006: bx is the centroid — no w/h fields on ShopScreenRect.
      const shopContainer = shopOverlayRef.current;
      const rects = shopScreenRectsRef.current;
      if (shopContainer && cssRect && rects.length) {
        const vpW = rects[0].vpW || 1;
        const vpH = rects[0].vpH || 1;
        const scaleX = cssRect.width  / vpW;
        const scaleY = cssRect.height / vpH;
        const children = shopContainer.children;
        for (let i = 0; i < children.length; i++) {
          const el = children[i] as HTMLElement;
          const shopId = el.dataset.shopId;
          const r = rects.find(rc => rc.shopId === shopId);
          if (!r) {
            el.style.display = "none";
            continue;
          }
          el.style.display = "";
          el.style.left    = `${r.bx * scaleX}px`;
          el.style.top     = `${r.by * scaleY}px`;
        }
      }

      rafId = requestAnimationFrame(update);
    };

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [canvasRef, beaconRefs, shopScreenRectsRef]);

  // ── Overlay styles ────────────────────────────────────────────────────────
  // CC-BLAYER-005: two style objects — one with gap (announcement/guestbook),
  // one without (HoloButton beacons). No gap:undefined spread pattern.
  const overlayStyle: React.CSSProperties = {
    position:      "absolute",
    zIndex:        3,
    pointerEvents: "auto",
    transform:     "translateX(-50%)",
    display:       "flex",
    flexDirection: "column",
    alignItems:    "center",
    gap:           "2px",
  };

  const noGapOverlayStyle: React.CSSProperties = {
    position:      "absolute",
    zIndex:        3,
    pointerEvents: "auto",
    transform:     "translateX(-50%)",
    display:       "flex",
    flexDirection: "column",
    alignItems:    "center",
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Shop hologram labels — positioned by Godot canvas_transform projection.
          Matches Bazar1 GodotGameWrapper.tsx lines 903-919. */}
      <div
        ref={shopOverlayRef}
        style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}
      >
        {stacks.map((st, i) => (
          <ShopHologram
            key={st.id}
            shop={st.members[0].shop}
            index={i}
            stackCount={st.count}
            tierColor={st.color}
            sellerName={st.count > 1 ? undefined : characterNames.get(st.members[0].shop.owner)}
            onClick={() =>
              st.count > 1 ? onStackClicked?.(st) : onShopClicked?.(st.members[0].shop)
            }
          />
        ))}
        {/* Mission (MIS) stall labels — same hologram machinery as shops. Each
            mission stall's id matches a Godot screen-rect (shop_manager spawns a
            node for it), so the rAF loop above positions it in-world. Without this,
            a mission spawned only a bare Godot sprite and no visible beacon label. */}
        {missionStalls.map((m, i) => (
          <ShopHologram
            key={m.id}
            shop={{ id: m.id, kind: "MIS", title: m.title, owner: "" } as unknown as Shop}
            index={stacks.length + i}
            stackCount={1}
            tierColor={MIS_HOLOGRAM_COLOR}
            onClick={() => onMissionStallClicked?.(m.id)}
          />
        ))}
      </div>

      {/* Announcement beacon — matrix rain fallback when no announcement data.
          Archive open is forwarded via AnnouncementBeacon.onArchiveClick (not a
          separate overlay). Matches Bazar1 GodotGameWrapper.tsx lines 921-954.
          CC-BLAYER-001: no archiveOverlayRef / no separate archive HoloButton block. */}
      {announcementWidgetEnabled && (
        <div ref={announcementOverlayRef} className="beacon-overlay" style={overlayStyle}>
          {announcement ? (
            <AnnouncementBeacon
              announcement={announcement}
              onClick={onOpenAnnouncement ?? (() => undefined)}
              onArchiveClick={onOpenArchive}
              color={hexToRgb(beaconRefs.archive.current?.color)}
              scale={beaconRefs.archive.current?.scale}
              rotation={beaconRefs.archive.current?.rotation}
              enabled={!!onOpenAnnouncement}
              proximityActive={beaconRefs.archive.current?.proximity}
            />
          ) : (
            <div style={{ transform: `scale(${beaconRefs.archive.current?.scale ?? 1})` }}>
              <MatrixRain columns={14} color={hexToRgb(beaconRefs.archive.current?.color)} />
            </div>
          )}
        </div>
      )}

      {/* Guestbook beacon.
          CC-BLAYER-003: wired to onOpenGuestbook (optional), not onOpenWindow("trade").
          Matches Bazar1 GodotGameWrapper.tsx lines 956-981. */}
      {guestbookWidgetEnabled && !panelChannels.has("guestbook") && (
        <div ref={guestbookOverlayRef} className="beacon-overlay" style={overlayStyle}>
          <GuestbookBeacon
            onClick={onOpenGuestbook ?? (() => undefined)}
            color={hexToRgb(beaconRefs.guestbook.current?.color)}
            scale={beaconRefs.guestbook.current?.scale}
            rotation={beaconRefs.guestbook.current?.rotation}
            proximityActive={beaconRefs.guestbook.current?.proximity}
          />
        </div>
      )}
      {guestbookWidgetEnabled && panelChannels.has("guestbook") && onOpenGuestbook && (
        <ServiceBeaconHitArea channel="guestbook" beaconName="guestbook" canvasRef={canvasRef} onOpen={onOpenGuestbook} />
      )}

      {/* Trade beacon — HoloButton per Bazar1 lines 983-1010. Hidden when Godot
          draws the in-world HoloPanel (Issue 3); the hit-area below takes over. */}
      {!panelChannels.has("trade") && (
        <div ref={tradeOverlayRef} className="beacon-overlay" style={noGapOverlayStyle}>
          <HoloButton
            title="Trade"
            subtitle="Open Direct Trade"
            onClick={() => onOpenWindow("trade")}
            color={hexToRgb(beaconRefs.trade.current?.color)}
            scale={beaconRefs.trade.current?.scale}
            rotation={beaconRefs.trade.current?.rotation}
            enabled={true}
            phaseOffset={3.7}
            proximityActive={beaconRefs.trade.current?.proximity}
          />
        </div>
      )}
      {panelChannels.has("trade") && (
        <ServiceBeaconHitArea channel="trade" beaconName="trade" canvasRef={canvasRef} onOpen={() => onOpenWindow("trade")} />
      )}

      {/* Inventory beacon — HoloButton per Bazar1 lines 1012-1039. Hidden when
          Godot draws the in-world HoloPanel (Issue 3). */}
      {!panelChannels.has("inventory") && (
        <div ref={inventoryOverlayRef} className="beacon-overlay" style={noGapOverlayStyle}>
          <HoloButton
            title="Inventory"
            subtitle="View your items"
            onClick={() => onOpenWindow("inventory")}
            color={hexToRgb(beaconRefs.inventory.current?.color)}
            scale={beaconRefs.inventory.current?.scale}
            rotation={beaconRefs.inventory.current?.rotation}
            enabled={true}
            phaseOffset={7.2}
            proximityActive={beaconRefs.inventory.current?.proximity}
          />
        </div>
      )}
      {panelChannels.has("inventory") && (
        <ServiceBeaconHitArea channel="inventory" beaconName="inventory" canvasRef={canvasRef} onOpen={() => onOpenWindow("inventory")} />
      )}

      {/* Exchange beacon — Advanced-only (BazaarFeature R5.4). Hidden when Godot
          draws the in-world HoloPanel (Issue 3); the Godot panel self-gates to
          Advanced too, so the hit-area only appears alongside it. */}
      <AdvancedOnly>
        {!panelChannels.has("exchange") && (
          <div ref={exchangeOverlayRef} className="beacon-overlay" style={noGapOverlayStyle}>
            <ExchangeBeacon
              onClick={onOpenExchange ?? (() => undefined)}
              color={hexToRgb(beaconRefs.exchange.current?.color)}
              scale={beaconRefs.exchange.current?.scale}
              rotation={beaconRefs.exchange.current?.rotation}
              enabled={!!onOpenExchange}
              phaseOffset={22.6}
              proximityActive={beaconRefs.exchange.current?.proximity}
            />
          </div>
        )}
        {panelChannels.has("exchange") && onOpenExchange && (
          <ServiceBeaconHitArea channel="exchange" beaconName="exchange" canvasRef={canvasRef} onOpen={onOpenExchange} />
        )}
      </AdvancedOnly>

      {/* Finance News beacon — Advanced-only (tribe ledger & exchange activity).
          In-world ONLY as an in-Godot HoloPanel + invisible hit-area; there is no
          React fallback button (it was previously reachable only via the HUD News
          menu), so an old .pck simply shows nothing in-world here. */}
      <AdvancedOnly>
        {panelChannels.has("finance_news") && onOpenFinanceNews && (
          <ServiceBeaconHitArea channel="finance_news" beaconName="finance_news" canvasRef={canvasRef} onOpen={onOpenFinanceNews} />
        )}
      </AdvancedOnly>

      {/* Bazaar News beacon — all bazaar types (DApp-wide news + polls + comments).
          Hidden when Godot draws the in-world HoloPanel (Issue 3). */}
      {!panelChannels.has("bazaar_news") && (
        <div ref={bazaarNewsOverlayRef} className="beacon-overlay" style={noGapOverlayStyle}>
          <BazaarNewsBeacon
            onClick={onOpenBazaarNews ?? (() => undefined)}
            color={hexToRgb(beaconRefs.bazaarNews.current?.color)}
            scale={beaconRefs.bazaarNews.current?.scale}
            rotation={beaconRefs.bazaarNews.current?.rotation}
            enabled={!!onOpenBazaarNews}
            phaseOffset={14.2}
            proximityActive={beaconRefs.bazaarNews.current?.proximity}
          />
        </div>
      )}
      {panelChannels.has("bazaar_news") && onOpenBazaarNews && (
        <ServiceBeaconHitArea channel="bazaar_news" beaconName="bazaar_news" canvasRef={canvasRef} onOpen={onOpenBazaarNews} />
      )}

      {/* Mission beacon — all bazaar types (player-driven mission economy).
          Hidden when the "Hide all missions" pref is ON. */}
      {!hideMissions && (
        <div ref={missionOverlayRef} className="beacon-overlay" style={noGapOverlayStyle}>
          <MissionBeacon
            onClick={onOpenMission ?? (() => undefined)}
            color={hexToRgb(beaconRefs.mission.current?.color)}
            scale={beaconRefs.mission.current?.scale}
            rotation={beaconRefs.mission.current?.rotation}
            enabled={!!onOpenMission}
            phaseOffset={18.9}
            proximityActive={beaconRefs.mission.current?.proximity}
          />
        </div>
      )}

      {/* Skin Picker beacon — all bazaar types. Opens the Identity / Avatar window.
          Hidden when Godot draws the in-world HoloPanel (Issue 3). */}
      {!panelChannels.has("skin_picker") && (
        <div ref={skinPickerOverlayRef} className="beacon-overlay" style={noGapOverlayStyle}>
          <SkinPickerBeacon
            onClick={onOpenSkinPicker ?? (() => undefined)}
            color={hexToRgb(beaconRefs.skinPicker.current?.color)}
            scale={beaconRefs.skinPicker.current?.scale}
            rotation={beaconRefs.skinPicker.current?.rotation}
            enabled={!!onOpenSkinPicker}
            phaseOffset={25.3}
            proximityActive={beaconRefs.skinPicker.current?.proximity}
          />
        </div>
      )}
      {panelChannels.has("skin_picker") && onOpenSkinPicker && (
        <ServiceBeaconHitArea channel="skin_picker" beaconName="skin" canvasRef={canvasRef} onOpen={onOpenSkinPicker} />
      )}

      {/* Queen's Messenger NPC — an in-world clickable beacon that self-positions
          over its Godot anchor (payload.queen_messenger). Off-theme crimson lore
          entry point; opens the blood-red QueenMessengerWindow. */}
      {onOpenQueenMessenger && (
        <QueenMessengerBeacon canvasRef={canvasRef} onOpen={onOpenQueenMessenger} />
      )}

    </>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
