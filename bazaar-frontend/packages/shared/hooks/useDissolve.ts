// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// useDissolve.ts — Dissolve-into-matrix transition hook.
//
// Returns { dissolveRef, triggerDissolve, isDissolving }.
// Attach dissolveRef to a container div. Call triggerDissolve() to start the
// animation; it returns a Promise that resolves when all letters are gone
// (plus an 800ms tail for particle clearance).

import { useRef, useState, useCallback } from "react";

const DISSOLVE_CHARS =
  "アイウエオカキクケコ▓▒░█∆∑Ω§₡" +
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
  "@#$%&*<>{}[]=/\\|~^";

function randomDissolveChar(): string {
  return DISSOLVE_CHARS[Math.floor(Math.random() * DISSOLVE_CHARS.length)];
}

// Fisher-Yates shuffle (in-place, returns same array)
function shuffleIndices(arr: number[]): number[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function spawnParticle(x: number, y: number, delay: number): void {
  const el = document.createElement("span");
  el.className = "dissolve-particle";
  el.textContent = randomDissolveChar();
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);

  const speed = 120 + Math.random() * 200;
  const drift = (Math.random() - 0.5) * 40;
  let startTime: number | null = null;
  let rafId = 0;

  function animate(time: number) {
    if (startTime === null) startTime = time;
    const elapsed = (time - startTime) / 1000;
    const newY = y + elapsed * speed;
    const opacity = Math.max(0, 1 - elapsed * 0.8);
    const dx = Math.sin(elapsed * 3) * drift;

    if (Math.random() < 0.1) {
      el.textContent = randomDissolveChar();
    }

    el.style.top = `${newY}px`;
    el.style.left = `${x + dx}px`;
    el.style.color = `rgba(210, 120, 40, ${opacity})`;
    el.style.textShadow = `0 0 8px rgba(255,144,48,${(opacity * 0.4).toFixed(3)})`;

    if (opacity > 0) {
      rafId = requestAnimationFrame(animate);
    } else {
      el.remove();
    }
  }

  if (delay > 0) {
    setTimeout(() => { rafId = requestAnimationFrame(animate); }, delay);
  } else {
    rafId = requestAnimationFrame(animate);
  }

  setTimeout(() => {
    cancelAnimationFrame(rafId);
    el.remove();
  }, delay + 2000);
}

function wrapTextNodes(container: HTMLElement): HTMLSpanElement[] {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  );

  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = (node as Text).textContent ?? "";
    if (text.trim().length > 0) {
      textNodes.push(node as Text);
    }
  }

  const spans: HTMLSpanElement[] = [];
  for (const textNode of textNodes) {
    const text = textNode.textContent ?? "";
    const fragment = document.createDocumentFragment();
    for (const ch of text) {
      if (ch === " " || ch === "\n" || ch === "\t") {
        fragment.appendChild(document.createTextNode(ch));
      } else {
        const span = document.createElement("span");
        span.textContent = ch;
        fragment.appendChild(span);
        spans.push(span);
      }
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return spans;
}

export interface UseDissolveResult {
  dissolveRef:     React.RefObject<HTMLDivElement>;
  triggerDissolve: () => Promise<void>;
  isDissolving:    boolean;
}

export function useDissolve(): UseDissolveResult {
  const dissolveRef    = useRef<HTMLDivElement>(null);
  const dissolvingRef  = useRef(false);
  const [isDissolving, setIsDissolving] = useState(false);

  const triggerDissolve = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (dissolvingRef.current) { resolve(); return; }
      const container = dissolveRef.current;
      if (!container) { resolve(); return; }

      dissolvingRef.current = true;
      setIsDissolving(true);

      const buttons = container.querySelectorAll("button");
      buttons.forEach((btn) => {
        (btn as HTMLElement).style.background = "transparent";
        (btn as HTMLElement).style.border = "none";
        (btn as HTMLElement).style.boxShadow = "none";
        (btn as HTMLElement).style.padding = "0";
      });

      const spans = wrapTextNodes(container);

      if (spans.length === 0) {
        setTimeout(() => {
          dissolvingRef.current = false;
          setIsDissolving(false);
          resolve();
        }, 200);
        return;
      }

      const stagger = Math.min(200, Math.max(20, Math.floor(2000 / spans.length)));
      const indices = shuffleIndices(Array.from({ length: spans.length }, (_, i) => i));
      let goneCount = 0;

      indices.forEach((spanIdx, seqIdx) => {
        const delay = seqIdx * stagger;

        setTimeout(() => {
          const el = spans[spanIdx];
          if (!el.isConnected) {
            goneCount++;
            if (goneCount >= spans.length) {
              setTimeout(() => {
                dissolvingRef.current = false;
                setIsDissolving(false);
                resolve();
              }, 800);
            }
            return;
          }

          el.classList.add("dissolve-glitch");

          let glitchFrame = 0;
          const glitchIv = setInterval(() => {
            el.textContent = randomDissolveChar();
            glitchFrame++;
            if (glitchFrame > 12) clearInterval(glitchIv);
          }, 50);

          setTimeout(() => {
            clearInterval(glitchIv);
            const rect = el.getBoundingClientRect();
            el.classList.remove("dissolve-glitch");
            el.classList.add("dissolve-gone");

            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const particleCount = 6 + Math.floor(Math.random() * 4);
            for (let k = 0; k < particleCount; k++) {
              spawnParticle(
                cx + (Math.random() - 0.5) * rect.width,
                cy + (Math.random() - 0.5) * rect.height * 0.5,
                k * 40
              );
            }

            goneCount++;
            if (goneCount >= spans.length) {
              setTimeout(() => {
                dissolvingRef.current = false;
                setIsDissolving(false);
                resolve();
              }, 800);
            }
          }, 600);
        }, delay);
      });
    });
  }, []);

  return { dissolveRef, triggerDissolve, isDissolving };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
