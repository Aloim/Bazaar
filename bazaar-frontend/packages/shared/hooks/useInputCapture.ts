/**
 * useInputCapture — Captures keyboard and pointer input for boot sequence interaction.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

// Captures WASD + arrow-key + C key events and forwards movement vectors to Godot
// via the "godot-in" CustomEvent channel.
//
// Escape NOT captured — modals/back-nav depend on it.
//
// Call this hook inside the Godot host component (BazaarScreen / GodotGameWrapper)
// when Godot is in its "running" state.
//
// The `onCreateShop` callback receives the call when C is pressed away from input
// elements; the hook itself does NOT open any modal — that is the caller's concern.

import { useEffect, useRef } from "react";
import { buildSetMovement } from "../bridge";

const KEY_MAP: Record<string, { ix: number; iy: number }> = {
  w:          { ix:  0, iy: -1 },
  arrowup:    { ix:  0, iy: -1 },
  s:          { ix:  0, iy:  1 },
  arrowdown:  { ix:  0, iy:  1 },
  a:          { ix: -1, iy:  0 },
  arrowleft:  { ix: -1, iy:  0 },
  d:          { ix:  1, iy:  0 },
  arrowright: { ix:  1, iy:  0 },
};

export interface UseInputCaptureOptions {
  /** Set false to pause key capture (e.g. while a modal is open). Default: true */
  active?: boolean;
  /** Called when the C key is pressed outside an input element. */
  onCreateShop?: () => void;
}

/**
 * Attaches keydown/keyup listeners to window and drives a rAF loop that emits
 * SET_MOVEMENT envelopes to Godot only when the movement vector changes.
 * Listeners are removed automatically on unmount or when `active` becomes false.
 */
export function useInputCapture({ active = true, onCreateShop }: UseInputCaptureOptions = {}): void {
  const keysDownRef    = useRef<Set<string>>(new Set());
  const rafIdRef       = useRef(0);
  const onCreateShopRef = useRef(onCreateShop);

  // Keep callback ref stable so the effect doesn't re-fire on every render.
  useEffect(() => { onCreateShopRef.current = onCreateShop; }, [onCreateShop]);

  useEffect(() => {
    if (!active) return;

    const keysDown = keysDownRef.current;
    let lastIx = 0;
    let lastIy = 0;

    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      const tag = (e.target as HTMLElement)?.tagName;

      // Never steal input from text fields.
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Escape NOT captured — modals/back-nav depend on it.
      if (key === "escape") return;

      // C key → delegate to caller's create-shop handler.
      if (key === "c") {
        onCreateShopRef.current?.();
        return;
      }

      if (key in KEY_MAP) {
        e.preventDefault();
        e.stopPropagation();
        keysDown.add(key);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      keysDown.delete(e.key.toLowerCase());
    }

    function sendMovement() {
      let ix = 0;
      let iy = 0;
      for (const k of keysDown) {
        const m = KEY_MAP[k];
        if (m) { ix += m.ix; iy += m.iy; }
      }
      ix = Math.max(-1, Math.min(1, ix));
      iy = Math.max(-1, Math.min(1, iy));

      if (ix !== lastIx || iy !== lastIy) {
        lastIx = ix;
        lastIy = iy;
        window.dispatchEvent(new CustomEvent("godot-in", {
          detail: JSON.stringify(buildSetMovement(
            ix as -1 | 0 | 1,
            iy as -1 | 0 | 1,
          )),
        }));
      }
      rafIdRef.current = requestAnimationFrame(sendMovement);
    }

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup",   onKeyUp,   true);
    rafIdRef.current = requestAnimationFrame(sendMovement);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup",   onKeyUp,   true);
      cancelAnimationFrame(rafIdRef.current);
      keysDown.clear();
    };
  }, [active]);
}
