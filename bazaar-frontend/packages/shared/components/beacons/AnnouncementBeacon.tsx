// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";
import MatrixRain from "@bazaar/shared/components/MatrixRain";
import HoloButton from "@bazaar/shared/components/HoloButton";
import type { AnnouncementData } from "@bazaar/shared/hooks/useAnnouncements";

interface Props {
  announcement: AnnouncementData;
  onClick: () => void;
  onArchiveClick?: () => void;
  color?: string;     // "R, G, B" for rgba() — from Godot beacon_config
  scale?: number;     // overall scale — from Godot beacon_config
  rotation?: number;  // degrees — from Godot beacon_config
  /** When false, matrix rain shows but hover text + click are disabled */
  enabled?: boolean;
  /** When true, behave as if hovered — triggered by Godot player proximity */
  proximityActive?: boolean;
}

export default function AnnouncementBeacon({ announcement, onClick, onArchiveClick, color, scale = 1, rotation = 0, enabled = true, proximityActive }: Props) {
  const [hovered, setHovered] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTypewriter = useCallback(() => {
    if (!enabled) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setHovered(true);
    setDisplayedText("");
    let idx = 0;
    const title = announcement.title;
    intervalRef.current = setInterval(() => {
      idx++;
      if (idx <= title.length) {
        setDisplayedText(title.slice(0, idx));
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 40);
  }, [announcement.title, enabled]);

  const stopTypewriter = useCallback(() => {
    setHovered(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setDisplayedText("");
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Proximity: mirror mouse-enter/leave behaviour when Godot signals proximity
  useEffect(() => {
    if (proximityActive) {
      startTypewriter();
    } else {
      stopTypewriter();
    }
  }, [proximityActive, startTypewriter, stopTypewriter]);

  const textStyle = color ? { color: `rgba(${color}, 0.95)` } : undefined;

  return (
    <div
      className="announcement-hologram-wrap"
      style={{ cursor: enabled ? "pointer" : "default", position: "relative", transform: `scale(${scale}) rotate(${rotation}deg)` }}
    >
      <div
        onClick={enabled ? onClick : undefined}
        onMouseEnter={startTypewriter}
        onMouseLeave={stopTypewriter}
      >
        {hovered && displayedText && (
          <div className="announcement-hologram announcement-hologram--typewriter" style={textStyle}>
            {displayedText}
            <span className="typewriter-cursor">|</span>
          </div>
        )}
        <MatrixRain columns={Math.max(10, announcement.title.length + 4)} rows={9} color={color} />
        {/* Click target overlay — MatrixRain canvas has pointerEvents:none */}
        <div style={{ position: "absolute", inset: 0 }} />
      </div>
      {onArchiveClick && (
        <HoloButton
          title="Archive"
          subtitle="Opens the News Archive"
          onClick={onArchiveClick}
          color={color}
          enabled={enabled}
          phaseOffset={0}
        />
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
