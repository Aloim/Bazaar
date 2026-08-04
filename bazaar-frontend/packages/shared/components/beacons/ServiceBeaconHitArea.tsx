// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// ServiceBeaconHitArea.tsx — Issue 3. The invisible React interaction layer over
// an in-Godot animated HoloPanel (Trade / Inventory / News / Skins). Godot draws
// the holographic panel + label at the beacon anchor; this component is just a
// transparent, precisely-sized click/hover target laid over it — the same split
// the shops and the Queen's Messenger already use.
//
// SELF-CONTAINED (mirrors QueenMessengerBeacon): subscribes to shop_screen_rects
// directly and runs its own rAF placement loop, so it needs no new ref threaded
// through the 500-line-guarded useGodotBridge → useGodotCanvas chain. It reads its
// own channel (e.g. payload.trade), sizes itself to the projected screenW×screenH,
// and relays mouse hover back to Godot as `set_beacon_hover` so the panel lights up.

import { useRef, useEffect, useCallback } from "react";
import type { RefObject } from "react";
import { PROTOCOL_VERSION } from "../../bridge/envelope";

interface Props {
  /** shop_screen_rects payload key carrying this beacon's projected rect. */
  channel: string;
  /** Routing key sent in set_beacon_hover; must match HoloPanel.beacon_name. */
  beaconName: string;
  /** Godot canvas element — for getBoundingClientRect projection. */
  canvasRef: RefObject<HTMLElement | null>;
  /** Open the associated window/panel on click. */
  onOpen: () => void;
}

interface PanelPos {
  bx: number; by: number; vpW: number; vpH: number;
  screenW?: number; screenH?: number; godotPanel?: boolean;
}

function relayHover(beacon: string, hovered: boolean): void {
  window.dispatchEvent(new CustomEvent("godot-in", {
    detail: JSON.stringify({
      type: "set_beacon_hover", version: PROTOCOL_VERSION, payload: { beacon, hovered },
    }),
  }));
}

export default function ServiceBeaconHitArea({ channel, beaconName, canvasRef, onOpen }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<PanelPos | null>(null);

  // Subscribe to our own position channel. Only track it while Godot is drawing
  // the panel (godotPanel); otherwise stay hidden so a stale rect can't catch clicks.
  useEffect(() => {
    const onOut = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail !== "string") return;
      let msg: { type?: string; payload?: Record<string, unknown> };
      try { msg = JSON.parse(detail); } catch { return; }
      if (msg?.type !== "shop_screen_rects") return;
      const d = msg.payload?.[channel] as PanelPos | undefined;
      posRef.current = d && typeof d === "object" && d.godotPanel ? d : null;
    };
    window.addEventListener("godot-out", onOut);
    return () => window.removeEventListener("godot-out", onOut);
  }, [channel]);

  // Self-positioning rAF loop: center the hit-area on the projected panel center
  // (bx,by) and size it to the projected panel (screenW×screenH), so it overlays
  // the in-Godot panel exactly across camera zoom + window scaling.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const el = elRef.current;
      const canvas = canvasRef.current;
      const p = posRef.current;
      if (el) {
        const rect = canvas ? canvas.getBoundingClientRect() : null;
        if (!rect || !p || !p.screenW || !p.screenH) {
          el.style.display = "none";
        } else {
          const sx = rect.width / (p.vpW || 1);
          const sy = rect.height / (p.vpH || 1);
          el.style.display = "";
          el.style.left = `${p.bx * sx}px`;
          el.style.top = `${p.by * sy}px`;
          el.style.width = `${p.screenW * sx}px`;
          el.style.height = `${p.screenH * sy}px`;
        }
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef]);

  const onEnter = useCallback(() => relayHover(beaconName, true), [beaconName]);
  const onLeave = useCallback(() => relayHover(beaconName, false), [beaconName]);
  // Clear hover on unmount so Godot never gets stuck lit.
  useEffect(() => () => relayHover(beaconName, false), [beaconName]);

  return (
    <div
      ref={elRef}
      aria-label={beaconName}
      style={{
        position: "absolute",
        zIndex: 3,
        display: "none",
        transform: "translate(-50%, -50%)",
        pointerEvents: "auto",
        cursor: "pointer",
      }}
      onClick={onOpen}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    />
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
