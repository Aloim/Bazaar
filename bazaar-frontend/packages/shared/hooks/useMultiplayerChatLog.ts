// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// useMultiplayerChatLog.ts — rolling message history for the proximity chat.
//
// Holds the most recent CHAT_LOG_MAX submitted messages (own + nearby players),
// each tagged with the speaker's display name. Populated by:
//   - the local player pressing Enter (useMultiplayerChat.submitChat → appendMessage),
//   - peers committing a message (useMultiplayerRelay detects a msgSeq increment
//     on the position relay → onRemoteMessage → appendMessage).
//
// Consumed by MultiplayerChatBar, which renders the log in a scrollable panel that
// expands upward from the input while it is focused. This is the DISCRETE-message
// history — separate from the live letter-by-letter "type-out" bubble above avatars.

import { useCallback, useState } from "react";

/** Most recent submitted messages kept + shown in the history panel. */
export const CHAT_LOG_MAX = 25;

export interface ChatLogEntry {
  /** Monotonic per-session id — stable React key. */
  id: number;
  /** Speaker display name (in-game character name or abbreviated address). */
  name: string;
  /** The submitted message text. */
  text: string;
}

export interface UseMultiplayerChatLogResult {
  log: ChatLogEntry[];
  /** Append a committed message; trims to the last CHAT_LOG_MAX. No-op if blank. */
  appendMessage: (name: string, text: string) => void;
}

export function useMultiplayerChatLog(): UseMultiplayerChatLogResult {
  const [log, setLog] = useState<ChatLogEntry[]>([]);

  const appendMessage = useCallback((name: string, text: string) => {
    const body = (text ?? "").trim();
    if (!body) return;
    setLog(prev => {
      const id = (prev.length > 0 ? prev[prev.length - 1].id : 0) + 1;
      const next = [...prev, { id, name: (name || "?").trim(), text: body }];
      return next.length > CHAT_LOG_MAX ? next.slice(next.length - CHAT_LOG_MAX) : next;
    });
  }, []);

  return { log, appendMessage };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
