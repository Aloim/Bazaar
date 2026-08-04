// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// QueenMessengerBeacon.tsx — the in-world "A Queen's Messenger" NPC (hit-area).
//
// The courier's VISUAL is now an in-Godot AnimatedSprite2D (world.tscn →
// Entities/QueenMessengerBeacon/Courier), so it tracks the camera/zoom/occlusion
// exactly like a player and can't drift. This component is the thin React
// interaction layer that sits over that sprite: an invisible hit-area that types
// the NPC's name on hover/proximity and opens the blood-red QueenMessengerWindow
// on click — the same split the shops use (Godot draws, React handles the label
// + click via the projected screen rect).
//
// SELF-CONTAINED ON PURPOSE: it subscribes to the `shop_screen_rects` bridge
// event directly and runs its own rAF placement loop, so it needs NO new ref
// threaded through useGodotBridge → useGodotCanvas → useBeaconPositioning (both
// of those hooks already sit at their 500-line guard). Its position channel is
// payload.queen_messenger, which now also carries `screenH` (the sprite's
// on-screen height) so the hit-area matches the sprite exactly.

import { useState, useRef, useEffect, useCallback } from "react";
import type { RefObject } from "react";
import { QUEEN_MESSENGER_NAME } from "../../data/queenMessengerText";

interface Props {
  /** Godot canvas element — for getBoundingClientRect projection. */
  canvasRef: RefObject<HTMLElement | null>;
  /** Open the dialogue window. */
  onOpen: () => void;
}

interface MsgPos { bx: number; by: number; vpW: number; vpH: number; proximity?: boolean; screenH?: number }

// Courier sprite-cell aspect (width / height) — keeps the hit-area box the same
// proportion as the in-world sprite (world.tscn Courier cell 188x320).
const COURIER_ASPECT = 188 / 320;
// Fallback on-screen height (CSS px) used only in the brief window between
// shipping this React change and re-exporting Godot (before `screenH` arrives).
const FALLBACK_H = 96;

export default function QueenMessengerBeacon({ canvasRef, onOpen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<MsgPos | null>(null);
  const nearRef = useRef(false);

  const [near, setNear] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [typed, setTyped] = useState("");
  const typeIvRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Subscribe to our own position channel ─────────────────────────────────
  useEffect(() => {
    const onGodotOut = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail !== "string") return;
      let msg: { type?: string; payload?: Record<string, unknown> };
      try { msg = JSON.parse(detail); } catch { return; }
      if (msg?.type !== "shop_screen_rects") return;
      const qm = msg.payload?.queen_messenger as MsgPos | undefined;
      if (qm && typeof qm === "object" && "bx" in qm) {
        posRef.current = qm;
        if (!!qm.proximity !== nearRef.current) {
          nearRef.current = !!qm.proximity;
          setNear(nearRef.current);
        }
      }
    };
    window.addEventListener("godot-out", onGodotOut);
    return () => window.removeEventListener("godot-out", onGodotOut);
  }, []);

  // ── Self-positioning rAF loop ─────────────────────────────────────────────
  // Anchor the box's bottom-centre at the sprite's feet (translate(-50%,-100%))
  // and size it to the sprite via the projected `screenH`, so the invisible
  // click/hover target overlays the courier precisely.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const el = containerRef.current;
      const canvas = canvasRef.current;
      const beacon = posRef.current;
      if (el) {
        const rect = canvas ? canvas.getBoundingClientRect() : null;
        if (!rect || !beacon) {
          el.style.display = "none";
        } else {
          const scaleX = rect.width / (beacon.vpW || 1);
          const scaleY = rect.height / (beacon.vpH || 1);
          el.style.display = "";
          el.style.left = `${beacon.bx * scaleX}px`;
          el.style.top = `${beacon.by * scaleY}px`;
          const h = beacon.screenH && beacon.screenH > 0 ? beacon.screenH * scaleY : FALLBACK_H;
          el.style.height = `${h}px`;
          el.style.width = `${h * COURIER_ASPECT}px`;
        }
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef]);

  // ── Type the name out when hovered or in proximity ────────────────────────
  const show = hovered || near;
  useEffect(() => {
    if (typeIvRef.current) { clearInterval(typeIvRef.current); typeIvRef.current = null; }
    if (!show) { setTyped(""); return; }
    let i = 0;
    typeIvRef.current = setInterval(() => {
      i++;
      setTyped(QUEEN_MESSENGER_NAME.slice(0, i));
      if (i >= QUEEN_MESSENGER_NAME.length && typeIvRef.current) {
        clearInterval(typeIvRef.current);
        typeIvRef.current = null;
      }
    }, 45);
    return () => { if (typeIvRef.current) clearInterval(typeIvRef.current); };
  }, [show]);

  const onEnter = useCallback(() => setHovered(true), []);
  const onLeave = useCallback(() => setHovered(false), []);

  return (
    <div
      ref={containerRef}
      // Invisible hit-area overlaying the in-Godot courier sprite. Sized by the
      // rAF loop from the projected screenH; the courier itself is drawn by Godot.
      style={{
        position: "absolute",
        zIndex: 3,
        display: "none",
        transform: "translate(-50%, -100%)",
        pointerEvents: "auto",
        cursor: "pointer",
      }}
      onClick={onOpen}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {/* Floating name plate — above the courier's head, out of layout flow so
          it never shifts the hit-area when it appears. Deliberately understated
          (a faint crimson label, not a glowing badge). */}
      <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 6 }}>
        {show && <div className="qmsg-nameplate">{typed}</div>}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
