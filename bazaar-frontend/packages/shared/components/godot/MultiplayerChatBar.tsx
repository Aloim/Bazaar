// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * MultiplayerChatBar — live "type-out" proximity chat input, bottom-left of the
 * Godot HUD. Every keystroke is broadcast immediately (no Enter required) and
 * floats above the typist's avatar for every nearby player (see useMultiplayerChat
 * + useMultiplayerRelay + the Godot ChatBubble).
 *
 * Always visible while the Godot world is running, so the input is ready and the
 * live letter-by-letter own-avatar bubble works immediately — the own bubble runs
 * through the LOCAL_CHAT bridge path, which does NOT need the relay. Broadcasting to
 * other players happens automatically once the Multiplayer widget is enabled and the
 * relay connects; the `connected` dot reflects whether others can currently see it.
 *
 * The bar scales with the window via vw clamps and respects --ui-scale.
 *
 * It is a real <input>, so the WASD/movement handler in useGodotCanvas.ts (which
 * ignores keys when an INPUT/TEXTAREA is focused) suppresses player movement while
 * typing automatically.
 *
 * Enter is the single toggle key (handled once, in a window-level capture listener):
 *   - chat NOT focused (focus on the canvas / overlay / nothing) → focus the field
 *     so you can start typing immediately;
 *   - chat focused → clear the FIELD and blur (release focus, back to moving). The
 *     text you just typed keeps floating above your avatar and fades on its own
 *     ~5 s after the last keystroke — Enter does NOT wipe the bubble.
 * Enter is left alone when another input/textarea/button/link is focused, so it
 * never steals submit/activation from modals or forms.
 *
 * Escape (while focused) clears the field + bubble and blurs.
 */

import { useEffect, useRef, useState } from "react";
import { CHAT_MAX_CHARS } from "@bazaar/shared/hooks/useMultiplayerChat";
import type { ChatLogEntry } from "@bazaar/shared/hooks/useMultiplayerChatLog";
import { prefixSpeakerLines } from "@bazaar/shared/utils/chatLines";

// Char width the history wraps at (monospace) before repeating the speaker name.
const HISTORY_COLS = 34;

/** Elements whose own Enter behavior (submit, activate, newline) we must not steal. */
function isInteractiveElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") {
    return true;
  }
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.getAttribute("role") === "button") return true;
  return false;
}

interface Props {
  /** When false the bar is not rendered (e.g. outside the game world). */
  active: boolean;
  /** Relay connected → typing reaches other players. Drives the status dot only. */
  connected?: boolean;
  /** Current rolling chat text (controlled value). */
  value: string;
  /** Called on every input change (broadcasts letter-by-letter). */
  onChange: (text: string) => void;
  /** Clear + dismiss the field AND the bubble (Escape / blur). */
  onClear: () => void;
  /** Enter: clear the field only — the floating bubble stays up and fades on its own. */
  onSubmit: () => void;
  /** Rolling history of submitted messages (own + nearby players). Shown in the
   *  scrollable panel that expands upward while the input is focused. */
  log?: ChatLogEntry[];
}

export default function MultiplayerChatBar({ active, connected = false, value, onChange, onClear, onSubmit, log = [] }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // The history panel collapses open above the input only while it is focused.
  const [focused, setFocused] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the history to the newest message whenever it grows / opens.
  useEffect(() => {
    if (focused && historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [focused, log]);

  // Enter is the single focus/send toggle, handled here on the window (capture
  // phase, before Godot's canvas key handler) so it works no matter where focus
  // currently is. Capturing also stops propagation so the keystroke never reaches
  // the game world or React's <input> handler (no double-handling).
  useEffect(() => {
    if (!active) return;
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const input = inputRef.current;
      const activeEl = document.activeElement;
      if (activeEl === input) {
        // Typing in chat → send: clear the field + release focus. The bubble the
        // others see stays up and fades on its own (onSubmit does not wipe it).
        e.preventDefault();
        e.stopPropagation();
        onSubmit();
        input?.blur();
        return;
      }
      // Focus is on another input/button/link → leave their Enter alone.
      if (isInteractiveElement(activeEl)) return;
      // Neutral focus (canvas / overlay / body) → open chat for typing.
      e.preventDefault();
      e.stopPropagation();
      input?.focus();
    };
    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
  }, [active, onSubmit]);

  if (!active) return null;

  const live = value.length > 0;
  // How many more characters fit before the OLDEST text starts scrolling off the
  // rolling bubble window. Clamp at 0 — the input itself keeps the full text.
  const remaining = Math.max(0, CHAT_MAX_CHARS - value.length);

  const showHistory = focused && log.length > 0;

  return (
    <div className="mp-chat-wrap">
      {/* Message history — collapses open above the input while it is focused.
          Scrollable (~7 lines tall); the speaker name repeats every 2nd line. */}
      {showHistory && (
        <div className="mp-chat__history" ref={historyRef}>
          {log.map((entry) => (
            <div key={entry.id} className="mp-chat__msg">
              {prefixSpeakerLines(entry.name, entry.text, HISTORY_COLS).map((line, i) => (
                <div key={i} className="mp-chat__msg-line">{line}</div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div
        className={`mp-chat${live ? " mp-chat--live" : ""}${connected ? "" : " mp-chat--offline"}`}
        title={connected ? undefined : "Multiplayer offline — you'll see your own text, but others won't until the relay connects (enable the Multiplayer widget + set its server URL)."}
        onMouseDown={(e) => {
          // Focus the field when the user clicks anywhere on the bar (the chevron,
          // padding, etc.) — not just the text input itself.
          if (e.target !== inputRef.current) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <span className="mp-chat__prompt" aria-hidden="true">&gt;</span>

        <input
          ref={inputRef}
          className="mp-chat__input"
          type="text"
          value={value}
          // No maxLength: rolling window. useMultiplayerChat trims to the last
          // CHAT_MAX_CHARS, so the visible value scrolls as you keep typing.
          placeholder="Say something…"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Proximity chat"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Keep keys away from the game; movement is already suppressed by focus.
            // (Enter is handled by the window-level capture listener above.)
            e.stopPropagation();
            if (e.key === "Escape") {
              // Escape is the explicit "stop / hide" — clear field + bubble + focus.
              e.preventDefault();
              onClear();
              inputRef.current?.blur();
            }
          }}
        />

        {live && (
          <span
            className="mp-chat__count"
            title={`${remaining} character${remaining !== 1 ? "s" : ""} before older text scrolls off`}
          >
            {remaining}
          </span>
        )}

        <span className="mp-chat__pulse" aria-hidden="true" />
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
