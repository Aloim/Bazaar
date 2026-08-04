// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useRef, useEffect } from "react";

const CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ"
  + "ハヒフヘホマミムメモヤユヨラリルレロワヲン"
  + "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  + "@#$%&*<>{}[]=/\\|~^";
const DEFAULT_ROWS = 10;
const TICK_MS = 80;

function randChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

interface Props {
  columns: number;
  /** Number of character rows. Default: 10. */
  rows?: number;
  /** RGB string like "255, 150, 0" for rgba() usage. Default: orange. */
  color?: string;
}

export default function MatrixRain({ columns, rows = DEFAULT_ROWS, color = "230, 140, 50" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Each column tracks: current head row (-1 = waiting), delay counter
  const stateRef = useRef<{ head: number; delay: number; trail: string[] }[]>([]);

  useEffect(() => {
    // Init columns with staggered delays
    stateRef.current = Array.from({ length: columns }, () => ({
      head: -1,
      delay: Math.floor(Math.random() * 15), // stagger start 0-15 ticks
      trail: Array.from({ length: rows }, () => randChar()),
    }));

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const colW = 8;
    const rowH = 13;
    canvas.width = columns * colW;
    canvas.height = rows * rowH;

    let interval: ReturnType<typeof setInterval>;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      interval = setInterval(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = "10px 'Frontier Disket Mono', 'Favorit', 'Courier New', monospace";
        ctx.textAlign = "center";

      for (let c = 0; c < columns; c++) {
        const col = stateRef.current[c];

        if (col.delay > 0) {
          col.delay--;
          continue;
        }

        // Advance head
        col.head++;
        if (col.head >= rows + 4) {
          // Reset with new delay and chars
          col.head = -1;
          col.delay = 3 + Math.floor(Math.random() * 12);
          col.trail = Array.from({ length: rows }, () => randChar());
          continue;
        }

        // Randomize the head character
        if (col.head >= 0 && col.head < rows) {
          col.trail[col.head] = randChar();
        }

        // Draw each row
        const cx = c * colW + colW / 2;
        for (let r = 0; r < rows; r++) {
          // Only draw rows that the head has passed
          if (r > col.head) continue;

          // Distance behind the head
          const dist = col.head - r;
          // Fade: bright at head, dimming behind
          const alpha = dist === 0
            ? 0.9
            : Math.max(0, 0.7 - dist * 0.08);

          if (alpha <= 0) continue;

          // Occasionally randomize trailing chars
          if (dist > 0 && Math.random() < 0.08) {
            col.trail[r] = randChar();
          }

          ctx.fillStyle = `rgba(${color}, ${alpha})`;
          ctx.shadowColor = `rgba(${color}, ${alpha * 0.5})`;
          ctx.shadowBlur = 3;
          ctx.fillText(col.trail[r], cx, r * rowH + rowH);
        }
      }
      ctx.shadowBlur = 0;
    }, TICK_MS);

    }); // document.fonts.ready
    return () => { cancelled = true; clearInterval(interval); };
  }, [columns, rows, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        pointerEvents: "none",
        display: "block",
        margin: "0 auto",
      }}
    />
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
