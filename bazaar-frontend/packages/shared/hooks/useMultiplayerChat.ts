// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// useMultiplayerChat.ts — local-side state for the live "type-out" proximity chat.
//
// Owns the chat text the local player is typing and the 5-second idle
// auto-clear. Extracted into its own hook so the wiring stays OUT of the
// 490-line useGodotCanvas.ts (Article XIV.4 500-line guard).
//
// Two layers of text:
//   - `chatText` is the FULL text the player has typed — it drives the textbar's
//     <input> value, so the field is a normal, fully-editable text box (you can
//     backspace/delete freely; nothing silently vanishes when you keep typing).
//   - The BROADCAST value is the rolling tail — only the most recent
//     CHAT_MAX_CHARS (3 lines × ~20 cols) are sent to peers + shown in the bubble.
//
// Two consumers read the BROADCAST tail:
//   - useMultiplayerRelay reads chatTextRef every 5 Hz send tick and piggybacks
//     the value onto the outbound `position` message (visible to other players).
//   - The local avatar shows the SAME tail above its own head: every change is
//     pushed to Godot via sendToGodot("LOCAL_CHAT", { text }).
//
// The bubble auto-clears CHAT_IDLE_MS after the last keystroke (broadcasts ""
// → remote + own bubbles vanish), and Escape/clearChat clears immediately.

import { useCallback, useEffect, useRef, useState } from "react";

// 3 lines × ~20 symbols/line — the rolling tail kept and broadcast.
export const CHAT_MAX_CHARS = 60;
// Auto-clear the bubble this long after the player stops typing.
export const CHAT_IDLE_MS = 5_000;
// Max length of a COMMITTED message (Enter) broadcast to peers + kept in history.
export const CHAT_MSG_MAX_CHARS = 280;

export interface UseMultiplayerChatParams {
  sendToGodot: (type: string, payload: Record<string, unknown>) => void;
  /** Local speaker name — rides LOCAL_CHAT so the own bubble can label lines. */
  displayName?: string;
  /** Append the local player's submitted message to the shared chat history. */
  appendMessage?: (name: string, text: string) => void;
}

export interface UseMultiplayerChatResult {
  /** Full typed text — drives the textbar's controlled <input> value so it stays
   *  fully editable (delete/backspace work; nothing vanishes when the line fills). */
  chatText: string;
  /** The rolling tail (last CHAT_MAX_CHARS). Read by useMultiplayerrelay each send
   *  tick — the value broadcast to peers + shown in the bubble. */
  chatTextRef: React.MutableRefObject<string>;
  /** Last COMMITTED message (set on Enter). Broadcast on the position relay so
   *  peers append it to their history. */
  msgRef: React.MutableRefObject<string>;
  /** Increments on every committed message — peers detect the change and append. */
  msgSeqRef: React.MutableRefObject<number>;
  /** Call on every input change; keeps the full text editable, broadcasts the
   *  rolling tail, and re-arms the idle clear. */
  onChatChange: (text: string) => void;
  /** Immediately clear the field + bubble (Escape / blur). */
  clearChat: () => void;
  /** Enter: clear the INPUT FIELD only. The broadcast tail + the bubble floating
   *  above the avatar stay as-is and fade on their own via the idle timer — so the
   *  text you just typed keeps hovering (visible to everyone) until it times out or
   *  scrolls past the 3rd line, even though the field is already empty for the next
   *  message. Does NOT broadcast "" and does NOT touch the idle timer. */
  submitChat: () => void;
}

/** Keep only the most recent CHAT_MAX_CHARS characters (rolling window). */
function tail(text: string): string {
  return text.length > CHAT_MAX_CHARS ? text.slice(-CHAT_MAX_CHARS) : text;
}

export function useMultiplayerChat({ sendToGodot, displayName = "", appendMessage }: UseMultiplayerChatParams): UseMultiplayerChatResult {
  const [chatText, setChatText] = useState("");
  const chatTextRef = useRef("");
  const msgRef = useRef("");
  const msgSeqRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest sendToGodot without re-creating callbacks each render.
  const sendRef = useRef(sendToGodot);
  useEffect(() => { sendRef.current = sendToGodot; }, [sendToGodot]);

  // Latest local speaker name + history appender (refs so callbacks stay stable).
  const displayNameRef = useRef(displayName);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);
  const appendMessageRef = useRef(appendMessage);
  useEffect(() => { appendMessageRef.current = appendMessage; }, [appendMessage]);

  const apply = useCallback((fullText: string) => {
    // The <input> shows exactly what the player typed (fully editable). Only the
    // rolling tail is broadcast + rendered in the bubble — so a long message keeps
    // scrolling in the bubble while the field never eats characters you can't delete.
    setChatText(fullText);
    const rolling = tail(fullText);
    chatTextRef.current = rolling;
    // Own-avatar bubble (the relay piggybacks the same tail for everyone else).
    // `name` lets the bubble repeat the speaker label every 2nd line.
    sendRef.current("LOCAL_CHAT", { text: rolling, name: displayNameRef.current });
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const clearChat = useCallback(() => {
    clearIdleTimer();
    apply("");
  }, [apply, clearIdleTimer]);

  const submitChat = useCallback(() => {
    // Commit the message to the rolling history (own + peers see it there) and
    // bump the broadcast sequence so peers append it via the position relay.
    setChatText(current => {
      const body = current.trim();
      if (body) {
        const capped = body.length > CHAT_MSG_MAX_CHARS ? body.slice(0, CHAT_MSG_MAX_CHARS) : body;
        appendMessageRef.current?.(displayNameRef.current, capped);
        msgRef.current = capped;
        msgSeqRef.current += 1;
      }
      // Clear ONLY the editable field — leave chatTextRef + the LOCAL_CHAT bubble
      // intact and the idle timer running, so the message you just sent keeps
      // floating above your avatar until it fades ~CHAT_IDLE_MS after the last
      // keystroke. The next message starts in an empty field.
      return "";
    });
  }, []);

  const onChatChange = useCallback((text: string) => {
    apply(text);
    clearIdleTimer();
    // Auto-clear after the player stops typing (only while there is text).
    if (text.length > 0) {
      idleTimerRef.current = setTimeout(() => {
        idleTimerRef.current = null;
        apply("");
      }, CHAT_IDLE_MS);
    }
  }, [apply, clearIdleTimer]);

  // Clean up the timer on unmount.
  useEffect(() => clearIdleTimer, [clearIdleTimer]);

  return { chatText, chatTextRef, msgRef, msgSeqRef, onChatChange, clearChat, submitChat };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
