// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";

interface Props {
  title: string;
  subtitle: string;
  onClick: () => void;
  color?: string;     // "R, G, B" for rgba()
  scale?: number;
  rotation?: number;  // degrees — from Godot beacon_config
  enabled?: boolean;
  /** Random seed offset so multiple buttons don't bob in sync */
  phaseOffset?: number;
  /** When true, behave as if hovered — triggered by Godot player proximity */
  proximityActive?: boolean;
  /** Notified whenever the active (hover OR proximity) state flips. Lets a
   *  wrapper relay the cue to Godot (e.g. GuestbookBeacon's SET_GUESTBOOK_HOVER). */
  onHoverChange?: (active: boolean) => void;
}

// Canonical holographic service beacon — Trade / Inventory / Exchange / Skin /
// Bazaar News / Guestbook / Missions all render through this one component so the
// in-world projections read identically. The *look* is the .holo-beacon class
// (animations-hologram.css); here we own the motion (float-bob + a SUBTLE flicker
// floored well above the old 0.4 dip so the panel never blends into the deck) and
// the hover/proximity → typewriter-subtitle behaviour.
export default function HoloButton({ title, subtitle, onClick, color, scale = 1, rotation = 0, enabled = true, phaseOffset = 0, proximityActive, onHoverChange }: Props) {
  const [hovered, setHovered] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const [hover_y, setHoverY] = useState(0);
  const [flickerOpacity, setFlickerOpacity] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animRef = useRef(0);
  const timeRef = useRef(phaseOffset);

  // Irregular floating + a gentle screen flicker. The flicker stays in a tight
  // 0.84–1.0 band: holograms shimmer, they don't disappear (the old 0.4 dip is
  // what made these blend with the rusty background).
  useEffect(() => {
    let running = true;
    let lastTime = performance.now();
    const tick = (now: number) => {
      if (!running) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      timeRef.current += dt;
      const t = timeRef.current;

      const y = Math.sin(t * 1.1) * 3 + Math.sin(t * 2.7) * 1.5 + Math.sin(t * 0.5) * 2;
      setHoverY(y);

      const flick = Math.random();
      if (flick < 0.03) {
        setFlickerOpacity(0.84 + Math.random() * 0.08);   // brief dim — still clearly present
      } else if (flick < 0.08) {
        setFlickerOpacity(0.92 + Math.random() * 0.08);
      } else {
        setFlickerOpacity(1);
      }

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, []);

  const onEnter = useCallback(() => {
    if (!enabled) return;
    setHovered(true);
    onHoverChange?.(true);
    setDisplayedText("");
    if (intervalRef.current) clearInterval(intervalRef.current);
    let idx = 0;
    intervalRef.current = setInterval(() => {
      idx++;
      if (idx <= subtitle.length) {
        setDisplayedText(subtitle.slice(0, idx));
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 30);
  }, [enabled, subtitle, onHoverChange]);

  const onLeave = useCallback(() => {
    setHovered(false);
    onHoverChange?.(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setDisplayedText("");
  }, [onHoverChange]);

  // Proximity: mirror mouse-enter/leave behaviour when Godot signals the player
  // is nearby (beacon_config.proximity_radius — currently ~200 world-px).
  useEffect(() => {
    if (proximityActive) {
      onEnter();
    } else {
      onLeave();
    }
  }, [proximityActive, onEnter, onLeave]);

  const rgbColor = color || "204, 112, 0";

  return (
    <div
      className={`holo-beacon${hovered ? " is-active" : ""}`}
      onClick={enabled ? onClick : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        "--holo-rgb": rgbColor,
        cursor: enabled ? "pointer" : "default",
        opacity: enabled ? flickerOpacity : 0.4,
        transform: `scale(${scale}) rotate(${rotation}deg) translateY(${hover_y}px)`,
      } as CSSProperties}
    >
      <div className="holo-beacon__title">{title}</div>
      {hovered && (
        <div className="holo-beacon__sub">
          {displayedText}
          <span className="typewriter-cursor">|</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
