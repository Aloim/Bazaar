// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useEffect, useState, useRef } from "react";

// Issue 3 — which service-beacon channels are now drawn as in-Godot animated
// HoloPanels. When a panel-capable Godot build connects, its shop_screen_rects
// beacon dicts carry `godotPanel:true`; React then suppresses its own holographic
// button for that channel and renders only an invisible hit-area
// (ServiceBeaconHitArea). An OLD .pck never sets the flag → empty set → React
// keeps drawing its buttons, so this is safe to ship before the Godot re-export.

/** shop_screen_rects payload keys that can host an in-Godot HoloPanel. */
export const GODOT_PANEL_CHANNELS = ["trade", "inventory", "bazaar_news", "skin_picker", "exchange", "guestbook", "finance_news"] as const;

export function useGodotPanelChannels(): Set<string> {
  const [channels, setChannels] = useState<Set<string>>(() => new Set());
  const keyRef = useRef("");
  useEffect(() => {
    const onOut = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail !== "string") return;
      let msg: { type?: string; payload?: Record<string, unknown> };
      try { msg = JSON.parse(detail); } catch { return; }
      if (msg?.type !== "shop_screen_rects" || !msg.payload) return;
      const present: string[] = [];
      for (const ch of GODOT_PANEL_CHANNELS) {
        const d = msg.payload[ch] as { godotPanel?: boolean } | undefined;
        if (d && typeof d === "object" && d.godotPanel) present.push(ch);
      }
      const key = present.join(",");
      if (key !== keyRef.current) {
        keyRef.current = key;
        setChannels(new Set(present));
      }
    };
    window.addEventListener("godot-out", onOut);
    return () => window.removeEventListener("godot-out", onOut);
  }, []);
  return channels;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
