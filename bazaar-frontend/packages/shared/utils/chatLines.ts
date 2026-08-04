// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// chatLines.ts — single source of truth for proximity-chat line layout.
//
// Both the React message-history panel (MultiplayerChatBar) and the in-world
// Godot bubble (chat_bubble.gd, ported) render a speaker's message the same way:
// the text is wrapped to a fixed column width, and the speaker's name is repeated
// in front of every 2nd line STARTING WITH THE FIRST (line indices 0, 2, 4 …) so a
// reader scanning the middle of a long wrapped message always sees who is talking:
//
//   Dracula: hello there this is
//   a fairly long message that
//   Dracula: keeps going and going
//   past several lines so the name
//   Dracula: is shown again here
//
// Keep the rule HERE only — the GDScript bubble mirrors this exact behaviour.

/**
 * Greedy word-wrap `text` into lines no wider than `cols` characters. Words
 * longer than `cols` are hard-split. Returns [] for empty/whitespace input.
 */
export function wrapText(text: string, cols: number): string[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  if (cols <= 0) return [t];

  const lines: string[] = [];
  let cur = "";
  for (const word of t.split(/\s+/)) {
    if (word.length > cols) {
      // Hard-split an over-long token; carry the final chunk forward so the next
      // word can still pack onto it.
      if (cur) { lines.push(cur); cur = ""; }
      let rest = word;
      while (rest.length > cols) { lines.push(rest.slice(0, cols)); rest = rest.slice(cols); }
      cur = rest;
      continue;
    }
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= cols) cur += " " + word;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Wrap `text` to `cols` and prepend `"name: "` on every 2nd line starting with
 * the first (indices 0, 2, 4 …). An empty `name` returns the bare wrapped lines.
 */
export function prefixSpeakerLines(name: string, text: string, cols: number): string[] {
  const lines = wrapText(text, cols);
  const speaker = (name ?? "").trim();
  if (!speaker) return lines;
  return lines.map((line, i) => (i % 2 === 0 ? `${speaker}: ${line}` : line));
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
