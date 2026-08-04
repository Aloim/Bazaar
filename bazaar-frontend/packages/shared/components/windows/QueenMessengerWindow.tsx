// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// QueenMessengerWindow.tsx — blood-red dialogue opened by the Courier of the
// Blood Queen beacon. A crimson "transmission": animated portrait on the left,
// the Queen's decree typed out letter-by-letter on the right. The reader can
// reveal the whole decree instantly (click anywhere / press any key / Skip),
// then take the wax-seal "Enter the Nexus" door, which opens the Nexus-Ѫ hub
// (a full-screen in-dapp window with its own Go Back control).
//
// Deliberately OFF-THEME vs the ember bazaar UI — see queen-messenger.css.

import { useState, useEffect, useRef, useCallback } from "react";
import courierWebp from "../../assets/npc/courier-of-the-queen.webp";
import {
  QUEEN_MESSENGER_NAME,
  QUEEN_MESSENGER_TITLE,
  QUEEN_MESSENGER_PARAGRAPHS,
  QUEEN_MESSENGER_FULL_TEXT,
} from "../../data/queenMessengerText";
import NexusHubWindow from "./NexusHubWindow";

interface Props {
  onClose: () => void;
}

// Typewriter cadence — a measured crawl (slower than before, per the decree's
// gravity) that still finishes in ~a minute for anyone who lets it run. Skip is
// always one click away.
const TICK_MS = 26;
const CHARS_PER_TICK = 2;
const TOTAL = QUEEN_MESSENGER_FULL_TEXT.length;

// Auto-follow only while the reader is this close to the bottom; scrolling up
// hands the scrollback to the reader instead of hijacking it every tick.
const FOLLOW_SLACK_PX = 50;

// Stack portrait above decree below this width (applies the --narrow classes).
const NARROW_QUERY = "(max-width: 760px)";

export default function QueenMessengerWindow({ onClose }: Props) {
  const [revealed, setRevealed] = useState(0);
  const [done, setDone] = useState(false);
  const [entered, setEntered] = useState(false);
  const [follow, setFollow] = useState(true);
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(NARROW_QUERY).matches,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const pinToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const revealAll = useCallback(() => {
    setRevealed(TOTAL);
    setDone(true);
    setFollow(true);
    // Re-pin to the decree's end, where the unlocked seal awaits — after the
    // full text has flushed to the DOM.
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Drive the typewriter. Stops itself (and flips `done`) at the end.
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      setRevealed(prev => {
        const next = prev + CHARS_PER_TICK;
        if (next >= TOTAL) {
          setDone(true);
          return TOTAL;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [done]);

  // Follow-scroll while typing — but ONLY while the reader is near the bottom.
  // Wheel/drag up disengages the follow (the decree keeps typing below); the
  // Resume chip or scrolling back down re-engages it. The scroll area carries
  // bottom padding (queen-messenger.css) so the active line sits comfortably
  // above the edge instead of jammed under the fade.
  useEffect(() => {
    if (follow && !done) pinToBottom();
  }, [revealed, follow, done, pinToBottom]);

  // Track reading position: within FOLLOW_SLACK_PX of the bottom = following.
  // Fires for both user scrolls and our own pin (which lands at the bottom,
  // keeping `follow` true) — React bails out when the value is unchanged.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX;
    setFollow(prev => (prev === nearBottom ? prev : nearBottom));
  }, []);

  // Apply the narrow (stacked) layout classes — .qmsg-panel--narrow /
  // .qmsg-portrait--narrow are the single CSS source for the stacked shape.
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Keyboard: Esc closes; any other key reveals the full decree. Suspended
  // while the Nexus hub is on top.
  useEffect(() => {
    if (entered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (!done) { e.preventDefault(); revealAll(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [entered, done, revealAll, onClose]);

  // Split the revealed slice back into paragraphs for rendering.
  const shown = QUEEN_MESSENGER_FULL_TEXT.slice(0, revealed);
  const shownParas = shown.split("\n\n");

  return (
    <>
      <div
        className="qmsg-overlay"
        onClick={() => { if (!done) revealAll(); }}
        role="dialog"
        aria-modal="true"
        aria-label={QUEEN_MESSENGER_NAME}
      >
        <div
          className={"qmsg-panel" + (narrow ? " qmsg-panel--narrow" : "")}
          onClick={e => e.stopPropagation() /* clicks handled at overlay level */}
        >
          <button
            className="qmsg-close"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            aria-label="Close"
          >✕</button>

          {/* Portrait — the animated courier */}
          <div className={"qmsg-portrait" + (narrow ? " qmsg-portrait--narrow" : "")}>
            <img src={courierWebp} alt={`${QUEEN_MESSENGER_NAME} — ${QUEEN_MESSENGER_TITLE}`} draggable={false} />
          </div>

          {/* Decree */}
          <div className="qmsg-body">
            <p className="qmsg-kicker">Incoming transmission</p>
            <h2 className="qmsg-title">{QUEEN_MESSENGER_NAME}</h2>
            <div className="qmsg-rule" />

            <div className="qmsg-scrollwrap">
              <div
                className="qmsg-scroll"
                ref={scrollRef}
                onScroll={handleScroll}
                onClick={() => { if (!done) revealAll(); }}
              >
                {shownParas.map((para, i) => (
                  <p key={i}>
                    {para}
                    {!done && i === shownParas.length - 1 && (
                      <span className="qmsg-cursor">▌</span>
                    )}
                  </p>
                ))}
              </div>
              {/* Reader scrolled up mid-type: the decree keeps writing below;
                  offer the way back down without hijacking the scrollback. */}
              {!done && !follow && (
                <button
                  className="qmsg-resume"
                  onClick={(e) => { e.stopPropagation(); setFollow(true); pinToBottom(); }}
                >▼ The decree continues</button>
              )}
            </div>

            <div className="qmsg-footer">
              {!done ? (
                <button
                  className="qmsg-skip"
                  onClick={(e) => { e.stopPropagation(); revealAll(); }}
                >Reveal all ▸▸</button>
              ) : (
                <span style={{ fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--qmsg-ash)", opacity: 0.7 }}>
                  — {QUEEN_MESSENGER_TITLE} —
                </span>
              )}

              <button
                className="qmsg-seal"
                disabled={!done}
                onClick={(e) => { e.stopPropagation(); setEntered(true); }}
                aria-label="Enter the Nexus"
                title={done ? "Enter the Nexus" : "Hear the Messenger out first"}
              >
                <span className="qmsg-seal__glyph" aria-hidden>Ѫ</span>
                Enter the Nexus
              </button>
            </div>
          </div>
        </div>
      </div>

      {entered && <NexusHubWindow onBack={() => setEntered(false)} />}
    </>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
