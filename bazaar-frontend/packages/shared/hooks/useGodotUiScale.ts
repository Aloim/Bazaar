// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// useGodotUiScale.ts — relays the React HUD UI-scale to the Godot game client so
// in-world elements that Godot renders itself (the floating proximity-chat bubbles
// above each avatar) scale with the user's UI-scale buttons.
//
// The HUD scale buttons (GodotHudOverlay) persist the value in
// localStorage["bazar-ui-scale"], set the CSS `--ui-scale` var, and dispatch a
// `UI_SCALE_CHANGED_EVENT` on window. React-rendered HUD already scales via CSS;
// Godot-rendered chat bubbles do not — so this hook forwards the value over the
// bridge as a `ui_scale` command (payload `{ scale }`). sendToGodot queues until
// Godot signals ready, so the on-mount send is delivered as soon as the game loads.

import { useEffect } from "react";

/** Dispatched on `window` (detail = the new scale string) whenever the HUD
 *  UI-scale buttons change the scale. Kept here so the emitter (GodotHudOverlay)
 *  and this listener share one source of truth. */
export const UI_SCALE_CHANGED_EVENT = "bazar-ui-scale-changed";

type SendToGodot = (type: string, payload: Record<string, unknown>) => void;

export function useGodotUiScale(sendToGodot: SendToGodot): void {
  useEffect(() => {
    const send = (raw: string | null | undefined) => {
      const scale = parseFloat(raw ?? "1");
      sendToGodot("ui_scale", { scale: Number.isFinite(scale) && scale > 0 ? scale : 1 });
    };
    // Seed Godot with the persisted scale (queued until the game is ready).
    send(localStorage.getItem("bazar-ui-scale"));
    const onChange = (e: Event) => send(String((e as CustomEvent).detail ?? "1"));
    window.addEventListener(UI_SCALE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(UI_SCALE_CHANGED_EVENT, onChange);
  }, [sendToGodot]);
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
