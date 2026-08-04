// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// useTextDecode.ts — Animates text from gibberish to readable, letter by letter.
//
// When `enabled` becomes true, each character begins cycling through random
// gibberish chars (at cycleSpeed ms per cycle), repeating cyclesPerChar times,
// then settles on the correct letter.  Characters start decoding with charSpeed
// ms stagger between them.  Spaces decode instantly.

import { useState, useEffect } from "react";

const GIBBERISH_CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノ" +
  "ハヒフヘホマミムメモヤユヨラリルレロワヲン" +
  "▓▒░█▄▀◄►◊∆∑∏†¥₡Ω§∂ƒ⌂∫√≈≠±×÷" +
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
  "@#$%&*<>{}[]=/\\|~^";

function randomGibberish(): string {
  return GIBBERISH_CHARS[Math.floor(Math.random() * GIBBERISH_CHARS.length)];
}

interface UseTextDecodeOptions {
  charSpeed?: number;      // ms between each letter starting decode (default: 40)
  cyclesPerChar?: number;  // random chars before settling (default: 4)
  cycleSpeed?: number;     // ms per random char cycle (default: 50)
  startDelay?: number;     // ms before decode begins (default: 0)
  enabled?: boolean;       // trigger decode (default: false)
}

interface UseTextDecodeResult {
  displayText: string;   // current text (mix of gibberish + decoded)
  isComplete: boolean;   // all letters decoded
  isDecoding: boolean;   // currently animating
}

export function useTextDecode(
  targetText: string,
  options?: UseTextDecodeOptions
): UseTextDecodeResult {
  const {
    charSpeed = 40,
    cyclesPerChar = 4,
    cycleSpeed = 50,
    startDelay = 0,
    enabled = false,
  } = options ?? {};

  // Build initial gibberish snapshot of same length as targetText.
  // Spaces are represented as spaces immediately; other chars are gibberish.
  const buildInitialGibberish = (text: string): string[] =>
    text.split("").map(ch => (ch === " " ? " " : randomGibberish()));

  const [chars, setChars] = useState<string[]>(() =>
    buildInitialGibberish(targetText)
  );
  const [settledCount, setSettledCount] = useState(0);
  const [started, setStarted] = useState(false);

  // Reset when targetText changes, then re-trigger if already enabled
  useEffect(() => {
    setChars(buildInitialGibberish(targetText));
    setSettledCount(0);
    setStarted(false);

    // If already enabled, auto-restart decode after a brief gibberish display
    if (enabled) {
      const t = setTimeout(() => setStarted(true), Math.max(startDelay, 1000));
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetText]);

  // Trigger decode when enabled first becomes true
  useEffect(() => {
    if (!enabled) return;

    const startTimer = setTimeout(() => {
      setStarted(true);
    }, startDelay);

    return () => clearTimeout(startTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, startDelay]);

  // Cycle unsettled chars while waiting (before decode starts)
  // This gives the animated "scrambling" look instead of static gibberish
  useEffect(() => {
    if (started || !targetText) return;
    const iv = setInterval(() => {
      setChars(prev =>
        prev.map((ch, i) => {
          if (targetText[i] === " ") return " ";
          // Only randomize chars that haven't settled
          return randomGibberish();
        })
      );
    }, 100);
    return () => clearInterval(iv);
  }, [started, targetText]);

  // Per-character decode animation
  // Safe: targetText change resets started to false via the reset effect above
  useEffect(() => {
    if (!started || !targetText) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];

    targetText.split("").forEach((targetChar, idx) => {
      // Spaces settle instantly with no cycling
      if (targetChar === " ") {
        const t = setTimeout(() => {
          setChars(prev => {
            const next = [...prev];
            next[idx] = " ";
            return next;
          });
          setSettledCount(prev => prev + 1);
        }, idx * charSpeed);
        timers.push(t);
        return;
      }

      let cyclesDone = 0;

      const startCyclingAt = idx * charSpeed;

      const charStartTimer = setTimeout(() => {
        // Immediately show first gibberish for this position
        setChars(prev => {
          const next = [...prev];
          next[idx] = randomGibberish();
          return next;
        });

        const iv = setInterval(() => {
          cyclesDone++;
          if (cyclesDone >= cyclesPerChar) {
            clearInterval(iv);
            setChars(prev => {
              const next = [...prev];
              next[idx] = targetChar;
              return next;
            });
            setSettledCount(prev => prev + 1);
          } else {
            setChars(prev => {
              const next = [...prev];
              next[idx] = randomGibberish();
              return next;
            });
          }
        }, cycleSpeed);
        intervals.push(iv);
      }, startCyclingAt);

      timers.push(charStartTimer);
    });

    return () => {
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const isComplete = started && settledCount >= targetText.length;
  const isDecoding = started && !isComplete;
  const displayText = chars.join("");

  return { displayText, isComplete, isDecoding };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
