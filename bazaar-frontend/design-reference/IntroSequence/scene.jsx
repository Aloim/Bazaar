// scene.jsx — Halftone bazaar w/ matrix rain + flickering ASCII file fragments
// Static camera, no torches/embers/shake. Yellow-orange dot-filter aesthetic.

const STAGE_W = 1920;
const STAGE_H = 1080;
const DURATION = 30;

const IMG_W = 1920;
const IMG_H = 1280;
const PORTAL = { x: IMG_W * 0.502, y: IMG_H * 0.47 };

// Brand colors lifted from the reference (orange/amber on near-black)
const BG = '#080604';
const ORANGE = '#ff9030';
const ORANGE_DEEP = 'rgb(210,120,40)';
const ORANGE_DARK = 'rgb(120,60,20)';
const AMBER_TXT = 'rgb(255,180,80)';

// Deterministic pseudo-random — always returns 0..1
function rand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  const v = x - Math.floor(x);
  return v < 0 ? v + 1 : v;
}

// ── Halftone-filtered backdrop ─────────────────────────────────────────────
// Render bazaar.jpg through a duotone (black -> orange) and overlay a fine
// dot grid that thickens with image luminance to fake the halftone print.
function HalftoneBackdrop() {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const W = IMG_W, H = IMG_H;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => {
      // graceful: just paint background
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
    };
    img.onload = () => {
      // 1. draw image
      ctx.drawImage(img, 0, 0, W, H);
      // 2. read pixels, build a luminance map sampled on a dot grid
      const data = ctx.getImageData(0, 0, W, H).data;
      // 3. clear -> black
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      // Dot grid: cell size 6px, dot radius scales w/ luminance
      const cell = 6;
      ctx.fillStyle = ORANGE;
      for (let y = 0; y < H; y += cell) {
        for (let x = 0; x < W; x += cell) {
          const i = ((y | 0) * W + (x | 0)) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          // perceived luminance
          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          if (lum < 0.04) continue;
          // emphasize warm zones (the torches/portal in source)
          const warm = (r - b) / 255; // -1..1
          const boost = Math.max(0, warm) * 0.4;
          const v = Math.min(1, lum * 1.2 + boost);
          const radius = v * (cell * 0.55);
          if (radius < 0.4) continue;
          // hue shifts slightly darker for low-lum, brighter for hi
          const a = 0.4 + v * 0.6;
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };
    img.src = 'bazaar.jpg';
  }, []);

  return (
    <canvas ref={ref} style={{
      position: 'absolute',
      left: (STAGE_W - IMG_W) / 2,
      top: (STAGE_H - IMG_H) / 2,
      width: IMG_W,
      height: IMG_H,
      imageRendering: 'pixelated',
    }}/>
  );
}

// ── Matrix rain (orange palette) ───────────────────────────────────────────
const RAIN_CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*<>{}[]=/\\|~^";

// ── Text-to-cells rasterizer ────────────────────────────────────────────────
// Draws text into a hidden canvas at the given size, then samples each rain
// cell to see whether the text covers it. Returns:
//   { cells: Set<cellKey>, bbox: {minR,maxR,minC,maxC}, centerR, centerC }
// Used for "form text out of matrix rain" effects (e.g. PROCEED button).
const _rasterCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const _rasterCache = new Map();
function cachedRasterize(key, fn) {
  if (_rasterCache.has(key)) return _rasterCache.get(key);
  const v = fn();
  _rasterCache.set(key, v);
  return v;
}
function rasterizeTextToCells(lines, opts) {
  // lines: [{ text, fontPx, weight, letterSpacing }]
  // opts: { centerXpx, centerYpx, FS, lineGapPx, padCellsX = 1, padCellsY = 1 }
  if (!_rasterCanvas) return { cells: new Set(), bbox: null };
  const { centerXpx, centerYpx, FS, lineGapPx = 6 } = opts;
  const cols = Math.ceil(STAGE_W / FS);
  const rows = Math.ceil(STAGE_H / FS);

  // Measure each line
  const ctx = _rasterCanvas.getContext('2d');
  let totalH = 0;
  let maxW = 0;
  const measured = lines.map(l => {
    ctx.font = `${l.weight || 400} ${l.fontPx}px "Frontier Disket Mono", ui-monospace, monospace`;
    const m = ctx.measureText(l.text);
    // Approximate the actual visual height with font ascent/descent, falling
    // back to fontPx if the browser doesn't expose them.
    const ascent = m.actualBoundingBoxAscent || l.fontPx * 0.8;
    const descent = m.actualBoundingBoxDescent || l.fontPx * 0.2;
    const h = ascent + descent;
    const w = m.width + (l.letterSpacing || 0) * Math.max(0, l.text.length - 1);
    totalH += h;
    if (w > maxW) maxW = w;
    return { ...l, w, h, ascent, descent };
  });
  totalH += lineGapPx * Math.max(0, lines.length - 1);

  // Set canvas size with a small margin, clamp to stage.
  const margin = 8;
  _rasterCanvas.width = Math.min(STAGE_W, Math.ceil(maxW + margin * 2));
  _rasterCanvas.height = Math.min(STAGE_H, Math.ceil(totalH + margin * 2));
  ctx.clearRect(0, 0, _rasterCanvas.width, _rasterCanvas.height);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  let y = margin;
  for (const l of measured) {
    ctx.font = `${l.weight || 400} ${l.fontPx}px "Frontier Disket Mono", ui-monospace, monospace`;
    // Center each line horizontally inside the raster canvas.
    const lineX = margin + (maxW - l.w) / 2;
    if (l.letterSpacing) {
      let cursorX = lineX;
      for (const ch of l.text) {
        ctx.fillText(ch, cursorX, y + l.ascent);
        cursorX += ctx.measureText(ch).width + l.letterSpacing;
      }
    } else {
      ctx.fillText(l.text, lineX, y + l.ascent);
    }
    y += l.h + lineGapPx;
  }

  // Where in stage coords does the raster's top-left land?
  const rasterLeftPx = centerXpx - _rasterCanvas.width / 2;
  const rasterTopPx = centerYpx - _rasterCanvas.height / 2;

  // Sample each cell: any non-zero alpha pixel inside cell bounds → text cell.
  const img = ctx.getImageData(0, 0, _rasterCanvas.width, _rasterCanvas.height).data;
  const cells = new Set();
  let minR = rows, maxR = -1, minC = cols, maxC = -1;
  // Determine cell range that overlaps the raster.
  const startC = Math.max(0, Math.floor(rasterLeftPx / FS));
  const endC = Math.min(cols - 1, Math.ceil((rasterLeftPx + _rasterCanvas.width) / FS));
  const startR = Math.max(0, Math.floor(rasterTopPx / FS));
  const endR = Math.min(rows - 1, Math.ceil((rasterTopPx + _rasterCanvas.height) / FS));

  for (let r = startR; r <= endR; r++) {
    for (let c = startC; c <= endC; c++) {
      // Cell rect in stage px:
      const cellX0 = c * FS;
      const cellY0 = r * FS;
      // Map back to raster coords
      const rx0 = Math.max(0, Math.floor(cellX0 - rasterLeftPx));
      const ry0 = Math.max(0, Math.floor(cellY0 - rasterTopPx));
      const rx1 = Math.min(_rasterCanvas.width, rx0 + FS);
      const ry1 = Math.min(_rasterCanvas.height, ry0 + FS);
      // Sample a dense grid inside the cell. Mark the cell as "covered" only
      // if MAJORITY of sampled pixels are filled (>= 50%), so cells that lie
      // mostly in negative space (e.g. between the arms of an E) are excluded.
      let hits = 0, samples = 0;
      const STEP = 2;
      for (let py = ry0; py < ry1; py += STEP) {
        for (let px = rx0; px < rx1; px += STEP) {
          const idx = (py * _rasterCanvas.width + px) * 4 + 3;
          if (img[idx] > 40) hits++;
          samples++;
        }
      }
      const hit = samples > 0 && (hits / samples) >= 0.5;
      if (hit) {
        cells.add(r * 10000 + c);
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  return {
    cells,
    bbox: maxR >= 0 ? { minR, maxR, minC, maxC } : null,
  };
}

// Unified rain: all 4 directions write to one cell grid so verticals overwrite horizontals
function MatrixRainGrid({ streams, halRef }) {
  const ref = React.useRef(null);
  const rafRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const FS = 14;
    canvas.width = STAGE_W;
    canvas.height = STAGE_H;

    // shared grid: cellW × cellH at FS pitch (square cells so chars overwrite cleanly)
    const cols = Math.ceil(STAGE_W / FS);
    const rows = Math.ceil(STAGE_H / FS);

    // each cell stores { ch, brightness, color } — written by whichever stream stamps last
    const grid = Array.from({ length: rows * cols }, () => ({ ch: ' ', b: 0, c: 'orange' }));
    const cellAt = (r, c) => grid[r * cols + c];

    // build column state for each stream
    const streamStates = streams.map(s => {
      const horizontal = s.direction === 'left' || s.direction === 'right';
      const negative = s.direction === 'up' || s.direction === 'left';
      const lengthCells = horizontal ? cols : rows;
      const laneCount = horizontal ? rows : cols;
      return {
        spec: s,
        horizontal,
        negative,
        lengthCells,
        laneCount,
        lanes: Array.from({ length: laneCount }, () => ({
          pos: negative
            ? lengthCells + Math.random() * lengthCells
            : -Math.random() * lengthCells,
          speed: (0.3 + Math.random() * 0.7) * (s.speedScale || 1),
          chars: Array.from({ length: lengthCells + 10 },
            () => RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)]),
        })),
      };
    });

    let lastFrame = 0;
    const tick = (time) => {
      rafRef.current = requestAnimationFrame(tick);
      if (time - lastFrame < 33) return;
      lastFrame = time;

      // Read HAL state up-front (decay logic also needs cutout phase).
      const hal = halRef && halRef.current;
      const cutout = hal ? hal.cardCutout : null;
      const firstWaveR = hal ? (hal.firstWaveRadius ?? -1) : -1;
      const halWaveCx = hal ? (hal.waveCx ?? STAGE_W / 2) : STAGE_W / 2;
      const halWaveCy = hal ? (hal.waveCy ?? STAGE_H / 2) : STAGE_H / 2;
      let cutoutPhase = 'none'; // 'none' | 'wave-freeze' | 'fall' | 'empty' | 'released'
      let cutMinR = -1, cutMaxR = -1, cutMinC = -1, cutMaxC = -1;
      let cutFallK = 0;
      if (cutout) {
        const ct = cutout.tNow;
        if (ct >= cutout.tRelease) cutoutPhase = 'released';
        else if (ct >= cutout.tClear) cutoutPhase = 'empty';
        else if (ct >= cutout.tFall) {
          cutoutPhase = 'fall';
          cutFallK = Math.min(1, (ct - cutout.tFall) / Math.max(0.001, cutout.tClear - cutout.tFall));
        }
        else if (ct >= cutout.tFreeze) cutoutPhase = 'wave-freeze';
        cutMinC = Math.max(0, Math.floor(cutout.x / FS));
        cutMaxC = Math.min(cols - 1, Math.ceil((cutout.x + cutout.w) / FS));
        cutMinR = Math.max(0, Math.floor(cutout.y / FS));
        cutMaxR = Math.min(rows - 1, Math.ceil((cutout.y + cutout.h) / FS));
      }
      // Per-cell helper: is this cutout cell currently covered by the
      // first wave's leading edge? (Used to gate freeze in 'wave-freeze'.)
      const cellWaveCovered = (r, c) => {
        if (firstWaveR <= 0) return false;
        const px = c * FS + FS / 2;
        const py = r * FS + FS / 2;
        const dx = px - halWaveCx;
        const dy = py - halWaveCy;
        return (dx * dx + dy * dy) <= firstWaveR * firstWaveR;
      };

      // 1) decay cells, unless they are within their persist window
      for (let i = 0; i < grid.length; i++) {
        const cell = grid[i];
        // Cutout: in wave-freeze phase, cells freeze ONLY when the first
        // wave reaches them. Once frozen they stay frozen (locked white).
        // In fall/empty phases all cutout cells are covered.
        if (cutoutPhase === 'wave-freeze' || cutoutPhase === 'fall') {
          const r = Math.floor(i / cols);
          const c = i - r * cols;
          if (r >= cutMinR && r <= cutMaxR && c >= cutMinC && c <= cutMaxC) {
            if (cutoutPhase === 'wave-freeze') {
              if (!cell.frozen && cellWaveCovered(r, c)) {
                // Force-freeze every cell the wave touches — even ones
                // that haven't been lit by a stream yet. Pick a stable
                // random glyph so the frozen rect is fully solid white.
                cell.frozen = true;
                const glyphIdx = ((r * 137 + c * 53) % RAIN_CHARS.length + RAIN_CHARS.length) % RAIN_CHARS.length;
                cell.frozenChar = (cell.ch && cell.ch !== ' ') ? cell.ch : RAIN_CHARS[glyphIdx];
                cell.frozenAt = time;
              }
              if (cell.frozen) continue; // don't decay frozen cells
              // Not yet frozen — let it decay normally below.
            } else {
              // fall phase — keep all cell data so render can draw falling glyph
              continue;
            }
          }
        }
        if (cutoutPhase === 'empty') {
          const r = Math.floor(i / cols);
          const c = i - r * cols;
          if (r >= cutMinR && r <= cutMaxR && c >= cutMinC && c <= cutMaxC) {
            cell.b = 0; cell.ch = ' '; cell.frozen = false;
            continue;
          }
        }
        if (cutoutPhase === 'released' && cell.frozen) cell.frozen = false;
        if (cell.persistUntil && time < cell.persistUntil) continue;
        if (cell.persistUntil && time >= cell.persistUntil) cell.persistUntil = 0;
        if (cell.persist) continue;
        if (cell.b > 0) cell.b *= 0.92;
        if (cell.b < 0.02) { cell.b = 0; cell.ch = ' '; }
      }

      // Other HAL state for stream loop / render.
      const halShape = hal ? hal.shape : null;
      const halInside = hal ? hal.inside : null;
      const halIris = hal ? hal.iris : null;
      const halGlow = hal ? hal.glow : 0;
      const formation = hal ? hal.formation : null;
      const formed = hal ? hal.formed : false;
      // Proceed text shape — Set<cellKey>, populated by TranslationSequence.
      const halProceed = hal ? hal.proceedShape : null;
      const halProceedOp = hal ? (hal.proceedOpacity ?? 0) : 0;
      const halProceedHover = hal ? !!hal.proceedHover : false;
      // Scan text shape — same mechanism, separate channel so it can run
      // before PROCEED appears.
      const halScan = hal ? hal.scanShape : null;
      const halScanOp = hal ? (hal.scanOpacity ?? 0) : 0;
      // Shockwave from eye when Translation Protocol launches
      const waveRadius = hal ? (hal.waveRadius ?? -1) : -1;
      const waveStrength = hal ? (hal.waveStrength ?? 0) : 0;
      const waveCx = hal ? (hal.waveCx ?? STAGE_W / 2) : STAGE_W / 2;
      const waveCy = hal ? (hal.waveCy ?? STAGE_H / 2) : STAGE_H / 2;
      const activeWaves = hal ? (hal.activeWaves || null) : null;
      const WAVE_BAND = 90; // px — ring half-width

      // 2) advance each stream and stamp its head + trail into the grid.
      //    streams are processed in array order — later streams overwrite earlier.
      for (const st of streamStates) {
        const { horizontal, negative, lengthCells, lanes, spec } = st;
        const trailLen = spec.trail || 18;
        const charSwap = spec.charSwap ?? 0.02;

        for (let i = 0; i < lanes.length; i++) {
          const lane = lanes[i];
          lane.pos += negative ? -lane.speed : lane.speed;
          const headIdx = Math.floor(lane.pos);
          for (let j = 0; j < trailLen; j++) {
            const cellIdx = negative ? headIdx + j : headIdx - j;
            if (cellIdx < 0 || cellIdx >= lengthCells) continue;
            const r = horizontal ? i : cellIdx;
            const c = horizontal ? cellIdx : i;
            if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
            // Cutout: skip stamping into card area while it's empty/falling,
            // or into cells that are already frozen during wave-freeze.
            if (cutoutPhase !== 'none' && cutoutPhase !== 'released' &&
                r >= cutMinR && r <= cutMaxR && c >= cutMinC && c <= cutMaxC) {
              if (cutoutPhase === 'fall' || cutoutPhase === 'empty') continue;
              if (cutoutPhase === 'wave-freeze') {
                const cellHere = cellAt(r, c);
                if (cellHere.frozen) continue;
              }
            }
            const charIdx = ((cellIdx + i * 7) % lane.chars.length + lane.chars.length) % lane.chars.length;
            if (Math.random() < charSwap) lane.chars[charIdx] = RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)];
            // brightness curve along trail
            let b;
            if (spec.persist) {
              // persistent streams: every stamped cell stays bright
              b = j === 0 ? 1.0 : 0.7;
            } else if (j === 0) b = 1.0;
            else if (j === 1) b = 0.85;
            else b = Math.max(0.08, 0.7 - j * 0.05);
            const cell = cellAt(r, c);
            // overwrite cell — later stream wins
            const wasPersistent = cell.persist || (cell.persistUntil && time < cell.persistUntil);
            cell.ch = lane.chars[charIdx];
            cell.b = b;
            cell.c = spec.color || 'orange';
            cell.head = j === 0;
            cell.persist = !!spec.persist;
            // if a non-persistent stream overwrites a persistent cell, keep the new
            // character locked in for 5s before letting it fade
            if (!spec.persist && wasPersistent) {
              cell.persistUntil = time + 5000;
            } else if (spec.persist) {
              cell.persistUntil = 0;
            }
          }
          if (negative ? headIdx < -25 : headIdx > lengthCells + 25) {
            lane.pos = negative ? lengthCells + 15 + Math.random() * 15 : Math.random() * -15;
            lane.speed = (0.3 + Math.random() * 0.7) * (spec.speedScale || 1);
          }
        }
      }

      // 3) render grid
      ctx.fillStyle = '#080604';
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      // Pre-build font strings for FS, FS+1, ..., FS+5 — wave gradually
      // pumps cell glyphs up by up to +5px at its crest.
      const FONT_BUMP_MAX = 5;
      const fontByBump = [];
      for (let i = 0; i <= FONT_BUMP_MAX; i++) {
        fontByBump.push(`${FS + i}px "Frontier Disket Mono", ui-monospace, monospace`);
      }
      ctx.font = fontByBump[0];
      let curBump = 0;
      const useFontBump = (bump) => {
        if (bump !== curBump) {
          ctx.font = fontByBump[bump];
          curBump = bump;
        }
      };
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = grid[r * cols + c];
          const key = r * 10000 + c;
          const isShape = halShape && halShape.has(key);
          const isIris = halIris && halIris.has(key);
          const isInside = halInside && halInside.has(key);
          const isProceed = halProceed && halProceed.has(key);
          const isScan = halScan && halScan.has(key);

          // ── Cutout rendering (highest priority) ───────────────────────
          // Frozen-white chars (only cells that have been wave-touched),
          // falling+fading during fall, empty during empty phase.
          // 'released' falls through to normal.
          const cellInCutout = cutoutPhase !== 'none' && cutoutPhase !== 'released' &&
            r >= cutMinR && r <= cutMaxR && c >= cutMinC && c <= cutMaxC;
          if (cellInCutout) {
            if (cutoutPhase === 'empty') continue; // pocket is empty
            if (cutoutPhase === 'wave-freeze') {
              if (cell.frozen) {
                const ch = cell.frozenChar || cell.ch;
                if (!ch || ch === ' ') continue;
                // Stable orange (matches rain palette), no decay; faint flicker for life.
                // Render at ~30% opacity per design — the frozen code reads as a
                // ghosted block before falling apart.
                const flick = 0.92 + 0.08 * Math.sin((r * 7 + c * 11) + time * 0.012);
                ctx.fillStyle = `rgba(255,144,48,${flick * 0.3})`;
                useFontBump(0);
                ctx.fillText(ch, c * FS, (r + 1) * FS - 2);
                continue;
              }
              // Not yet frozen — fall through to normal rain rendering
              // so the wave looks like it's progressively whitening cells.
            }
            if (cutoutPhase === 'fall') {
              const ch = cell.frozenChar || cell.ch;
              if (!ch || ch === ' ') continue;
              // Diagonal wave: cells fall in order of (r+c) from the
              // cutout's top-left corner (smallest r+c) outward to its
              // bottom-right corner (largest r+c). This produces a
              // wavefront that expands diagonally across the rectangle
              // instead of sweeping straight top-to-bottom.
              // We allocate ~70% of the fall window to the corner→corner
              // sweep and reserve 30% for the last cells to actually drop.
              const maxDiag = Math.max(1, (cutMaxR - cutMinR) + (cutMaxC - cutMinC));
              const diagFrac = ((r - cutMinR) + (c - cutMinC)) / maxDiag; // 0 TL → 1 BR
              const startDelay = diagFrac * 0.7;
              // Per-cell jitter perpendicular to the wave so the front
              // doesn't read as a perfect 45° line — small ±60ms.
              const cellJit = (((r * 73 + c * 131) % 100) / 100 - 0.5) * 0.08;
              const localK = Math.max(0, Math.min(1, (cutFallK - startDelay - cellJit) / 0.30));
              if (localK <= 0) {
                // Not yet started falling — render in same ghosted style
                // as the wave-freeze phase so transition is seamless.
                const flick = 0.92 + 0.08 * Math.sin((r * 7 + c * 11) + time * 0.012);
                ctx.fillStyle = `rgba(255,144,48,${flick * 0.3})`;
                useFontBump(0);
                ctx.fillText(ch, c * FS, (r + 1) * FS - 2);
                continue;
              }
              // Per-cell variation for fall feel (independent of stagger)
              const h2 = ((r * 191 + c * 53) % 1000) / 1000;
              const h3 = ((r * 29 + c * 311) % 1000) / 1000;
              const h4 = ((r * 419 + c * 17) % 1000) / 1000;
              const h5 = ((r * 251 + c * 89) % 1000) / 1000;
              const speedMul = 0.7 + h4 * 0.6;
              const fallY = localK * localK * (260 + h3 * 140) * speedMul;
              const driftX = (h2 - 0.5) * 22 * localK;
              const swayX = Math.sin(h3 * Math.PI * 2 + localK * 6) * 3.5 * localK;
              // Char flips back to rain glyphs as it falls
              let drawCh = ch;
              if (localK > 0.15) {
                const flipRate = 60 + h5 * 80;
                const flipIdx = Math.floor(time / flipRate + h5 * 100 + r * 3 + c * 7);
                drawCh = RAIN_CHARS[((flipIdx % RAIN_CHARS.length) + RAIN_CHARS.length) % RAIN_CHARS.length];
              }
              // Stay in the orange palette as it falls — bright orange (255,144,48)
              // shifting toward deep amber (210,120,40) and fading out.
              const tintK = Math.min(1, localK * 1.3);
              const op = 1 - localK * 0.85;
              const rC = Math.round(255 + (210 - 255) * tintK);
              const gC = Math.round(144 + (120 - 144) * tintK);
              const bC = Math.round(48  + (40  - 48 ) * tintK);
              ctx.fillStyle = `rgba(${rC},${gC},${bC},${op})`;
              useFontBump(0);
              ctx.fillText(drawCh, c * FS + driftX + swayX, (r + 1) * FS - 2 + fallY);
              continue;
            }
          }

          // shape & iris (and proceed/scan) cells render even if rain hasn't lit them
          if (!isShape && !isIris && !isProceed && !isScan && cell.b <= 0) continue;

          // Wave: distance from cell center to wave origin (computed up-front
          // so all branches can bump font + tint uniformly).
          let waveTint = 0;
          if (activeWaves && activeWaves.length > 0) {
            const cellPx = c * FS + FS / 2;
            const cellPy = r * FS + FS / 2;
            const dxw = cellPx - waveCx;
            const dyw = cellPy - waveCy;
            const distW = Math.sqrt(dxw * dxw + dyw * dyw);
            for (let wi = 0; wi < activeWaves.length; wi++) {
              const wv = activeWaves[wi];
              const offset = Math.abs(distW - wv.radius);
              if (offset < WAVE_BAND) {
                const k = 1 - (offset / WAVE_BAND);
                waveTint += k * k * wv.strength;
              }
            }
            if (waveTint > 1) waveTint = 1;
          } else if (waveRadius > 0 && waveStrength > 0) {
            const cellPx = c * FS + FS / 2;
            const cellPy = r * FS + FS / 2;
            const dxw = cellPx - waveCx;
            const dyw = cellPy - waveCy;
            const distW = Math.sqrt(dxw * dxw + dyw * dyw);
            const offset = Math.abs(distW - waveRadius);
            if (offset < WAVE_BAND) {
              const k = 1 - (offset / WAVE_BAND);
              waveTint = k * k * waveStrength;
            }
          }
          const bump = Math.round(waveTint * FONT_BUMP_MAX);
          // shift to keep larger glyph roughly centered on its cell
          const dy = Math.round(bump * 0.5);
          const dx = -Math.round(bump * 0.5);

          // Per-cell formation progress (0 = pure rain, 1 = solid eye glyph).
          // While forming, we probabilistically render as eye-glyph or rain-glyph
          // based on this progress so the eye flickers into existence.
          let cellForm = 1;
          if ((isShape || isIris) && formation) {
            cellForm = formation.get(key) ?? 0;
          }
          // Stable per-cell jitter so flicker pattern is animated, not chaotic.
          // Re-roll roughly every ~120ms.
          const flickerRoll = ((Math.sin((r * 13 + c * 31 + Math.floor(time / 120)) * 0.913) + 1) * 0.5);
          const renderAsEye = flickerRoll < cellForm;

          // ── Proceed text rendering ───────────────────────────────────
          // Renders white matrix-style chars into cells covered by the
          // text shape. Opacity scales with proceedOpacity (form-out k);
          // hover boosts to full white + slightly brighter glyphs.
          if (isProceed && halProceedOp > 0.02 && !isShape && !isIris) {
            const baseAlpha = halProceedHover ? 1.0 : 0.5;
            const a = baseAlpha * Math.min(1, halProceedOp);
            const ch = (cell.ch && cell.ch !== ' ')
              ? cell.ch
              : RAIN_CHARS[(r * 17 + c * 23 + Math.floor(time / 80)) % RAIN_CHARS.length];
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            useFontBump(halProceedHover ? 1 : 0);
            ctx.fillText(ch, c * FS + dx, (r + 1) * FS - 2 + dy);
            continue;
          }

          // ── Scan text rendering ──────────────────────────────────────
          // Same matrix-rain rendering as PROCEED but a separate channel
          // so we can show "Scanning..." / "Scan complete" before the
          // final PROCEED text forms.
          if (isScan && halScanOp > 0.02 && !isShape && !isIris) {
            const a = 0.85 * Math.min(1, halScanOp);
            const ch = (cell.ch && cell.ch !== ' ')
              ? cell.ch
              : RAIN_CHARS[(r * 17 + c * 23 + Math.floor(time / 80)) % RAIN_CHARS.length];
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            useFontBump(0);
            ctx.fillText(ch, c * FS + dx, (r + 1) * FS - 2 + dy);
            continue;
          }

          if (isIris && renderAsEye) {
            const a = 0.9 + 0.1 * halGlow;
            const ch = cell.ch && cell.ch !== ' '
              ? cell.ch
              : RAIN_CHARS[(r * 7 + c * 13) % RAIN_CHARS.length];
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            useFontBump(bump);
            ctx.fillText(ch, c * FS + dx, (r + 1) * FS - 2 + dy);
            continue;
          }
          if (isShape && renderAsEye) {
            // outline — white, glow-modulated
            const a = 0.85 + 0.15 * halGlow;
            const ch = cell.ch && cell.ch !== ' '
              ? cell.ch
              : RAIN_CHARS[(r * 11 + c * 17 + Math.floor(time / 200)) % RAIN_CHARS.length];
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            useFontBump(bump);
            ctx.fillText(ch, c * FS + dx, (r + 1) * FS - 2 + dy);
            continue;
          }

          // Fell through (or shape cell decided to render as rain). If the rain
          // hasn't lit this cell, skip — UNLESS the wave is currently passing
          // through it, in which case briefly light it up white.
          if (cell.b <= 0) {
            if (waveTint > 0.05) {
              const ch = cell.ch && cell.ch !== ' '
                ? cell.ch
                : RAIN_CHARS[(r * 11 + c * 17 + Math.floor(time / 200)) % RAIN_CHARS.length];
              ctx.fillStyle = `rgba(255,255,255,${0.55 * waveTint})`;
              useFontBump(bump);
              ctx.fillText(ch, c * FS + dx, (r + 1) * FS - 2 + dy);
            }
            continue;
          }
          // rain rendering. Inside the eye, head letters are orange instead of white.
          const b = cell.b;
          let baseR, baseG, baseB, baseA;
          if (cell.head) {
            if (isInside) {
              baseR = 255; baseG = 180; baseB = 80; baseA = 0.6 * b + 0.2;
            } else {
              baseR = 255; baseG = 255; baseB = 255; baseA = 0.4 * b + 0.08;
            }
          } else if (b > 0.7) {
            baseR = 255; baseG = 180; baseB = 80; baseA = b;
          } else if (b > 0.4) {
            baseR = 210; baseG = 120; baseB = 40; baseA = b;
          } else {
            baseR = 140; baseG = 70; baseB = 25; baseA = b;
          }
          // Blend base color toward white based on waveTint (wave whitens
          // and brightens whatever's there).
          if (waveTint > 0) {
            const w = waveTint;
            baseR = Math.round(baseR + (255 - baseR) * w);
            baseG = Math.round(baseG + (255 - baseG) * w);
            baseB = Math.round(baseB + (255 - baseB) * w);
            baseA = Math.min(1, baseA + 0.5 * w);
          }
          ctx.fillStyle = `rgba(${baseR},${baseG},${baseB},${baseA})`;
          useFontBump(bump);
          ctx.fillText(cell.ch, c * FS + dx, (r + 1) * FS - 2 + dy);
        }
      }
      // Restore default font for any subsequent draws this frame
      useFontBump(0);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [streams]);

  return (
    <canvas ref={ref} style={{
      position: 'absolute', inset: 0,
      width: STAGE_W, height: STAGE_H,
    }}/>
  );
}

function MatrixRain({ direction = 'down', opacity = 0.9, speedScale = 1, fade = 0.13, transparentFade = false }) {
  const ref = React.useRef(null);
  const colsRef = React.useRef([]);
  const rafRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const COL_W = 18;
    const FS = 14;
    const horizontal = direction === 'left' || direction === 'right';
    const negative = direction === 'up' || direction === 'left'; // travels in -axis

    canvas.width = STAGE_W;
    canvas.height = STAGE_H;

    // "length" along travel axis, "lanes" perpendicular
    const lengthCells = Math.ceil((horizontal ? STAGE_W : STAGE_H) / FS);
    const laneCount = Math.ceil((horizontal ? STAGE_H : STAGE_W) / COL_W);
    colsRef.current = Array.from({ length: laneCount }, () => ({
      pos: negative
        ? lengthCells + Math.random() * lengthCells
        : -Math.random() * lengthCells,
      speed: (0.3 + Math.random() * 0.7) * speedScale,
      chars: Array.from({ length: lengthCells + 10 },
        () => RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)]),
    }));

    let lastFrame = 0;
    const tick = (time) => {
      rafRef.current = requestAnimationFrame(tick);
      if (time - lastFrame < 33) return;
      lastFrame = time;

      if (transparentFade) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = `rgba(0,0,0,${fade})`;
        ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        ctx.restore();
      } else {
        ctx.fillStyle = `rgba(8,6,4,${fade})`;
        ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      }

      const cols = colsRef.current;
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        col.pos += negative ? -col.speed : col.speed;
        const headIdx = Math.floor(col.pos);
        for (let j = 0; j < 18; j++) {
          const cellIdx = negative ? headIdx + j : headIdx - j;
          if (cellIdx < -5 || cellIdx > lengthCells + 5) continue;
          const charIdx = ((cellIdx + i * 7) % col.chars.length + col.chars.length) % col.chars.length;
          // map (cellIdx, lane i) to screen x/y based on orientation
          const along = cellIdx * FS;
          const lane = i * COL_W;
          const sx = horizontal ? along : lane;
          const sy = horizontal ? lane : along;
          if (j === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = `bold ${FS}px "Frontier Disket Mono", ui-monospace, monospace`;
          } else if (j === 1) {
            ctx.fillStyle = 'rgba(255,180,80,0.9)';
            ctx.font = `${FS}px "Frontier Disket Mono", ui-monospace, monospace`;
          } else if (j < 5) {
            const a = 0.8 - j * 0.1;
            ctx.fillStyle = `rgba(210,120,40,${a})`;
            ctx.font = `${FS}px "Frontier Disket Mono", ui-monospace, monospace`;
          } else {
            const a = Math.max(0.05, 0.5 - (j - 5) * 0.04);
            ctx.fillStyle = `rgba(120,60,20,${a})`;
            ctx.font = `${FS}px "Frontier Disket Mono", ui-monospace, monospace`;
          }
          if (Math.random() < 0.02) col.chars[charIdx] = RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)];
          ctx.fillText(col.chars[charIdx], sx, sy);
        }
        if (negative ? headIdx < -25 : headIdx > lengthCells + 25) {
          col.pos = negative ? lengthCells + 15 + Math.random() * 15 : Math.random() * -15;
          col.speed = (0.3 + Math.random() * 0.7) * speedScale;
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [direction, speedScale, fade, transparentFade]);

  return (
    <canvas ref={ref} style={{
      position: 'absolute', inset: 0,
      width: STAGE_W, height: STAGE_H,
      mixBlendMode: 'screen',
      opacity,
    }}/>
  );
}

// ── ASCII file fragments — short rectangular blocks of mono characters that
//    flash in, hold a beat, and dissolve. Random placement, multiple at once.
const FRAGMENT_CHARS = "01ABCDEF /\\|<>{}[]=#$%&*+-_:;.,?!~^abcdef0123456789";
const FRAGMENT_HEADERS = [
  '> READ /sys/cache.dat',
  '> EXEC node-7B',
  '> AUTH key=0xA13F',
  '> DECRYPT block.04',
  '> LINK lev-7::core',
  '> BIND port:0x4A',
  '> FETCH manifest',
  '> PARSE 0x00FE',
  '> WRITE buffer.b',
  '> SYNC checksum',
  '> SCAN region.q',
  '> LOAD module.x9',
];

function makeFragmentBody(rows, cols, seed) {
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) {
      const v = rand(seed * 31 + r * 13 + c);
      s += FRAGMENT_CHARS[Math.floor(v * FRAGMENT_CHARS.length)];
    }
    lines.push(s);
  }
  return lines;
}

function generateFragments(count, totalDuration) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t0 = rand(i * 7 + 1) * (totalDuration - 3);
    const life = 0.6 + rand(i * 11 + 3) * 2.1;
    // size tier with visible variation; max = matrix rain (14)
    const sizeRoll = rand(i * 53 + 19);
    let fontSize, depth;
    if (sizeRoll < 0.35)      { fontSize = 7;  depth = 0.3; }
    else if (sizeRoll < 0.6)  { fontSize = 9;  depth = 0.55; }
    else if (sizeRoll < 0.85) { fontSize = 11; depth = 0.75; }
    else                      { fontSize = 14; depth = 1.0; }
    const cols = 14 + Math.floor(rand(i * 17 + 5) * 22);
    const rows = 3 + Math.floor(rand(i * 23 + 9) * 5);
    const lineH = Math.round(fontSize * 1.15);
    const charW = Math.max(5, Math.round(fontSize * 0.62));
    const x = 60 + rand(i * 29 + 11) * Math.max(100, STAGE_W - 120 - cols * charW);
    const y = 60 + rand(i * 31 + 13) * Math.max(100, STAGE_H - 120 - rows * lineH - 30);
    const headerIdx = Math.floor(rand(i * 41 + 17) * FRAGMENT_HEADERS.length);
    const glitchy = rand(i * 67 + 23) < 0.4;
    const body = makeFragmentBody(rows, cols, i + 1);
    out.push({ id: i, t0, life, x, y, cols, rows, fontSize, lineH, depth,
               header: FRAGMENT_HEADERS[headerIdx], body, glitchy });
  }
  return out;
}

// Pre-generate so positions are stable across frames
const FRAGMENTS = generateFragments(14, DURATION);

function FileFragments() {
  const t = useTime();
  return (
    <>
      {FRAGMENTS.map(f => {
        const local = t - f.t0;
        if (local < 0 || local > f.life) return null;
        // 3-phase: flicker-in (0-0.15), hold (mid), dissolve (last 0.25)
        const inDur = 0.12;
        const outDur = 0.22;
        let opacity;
        if (local < inDur) {
          // jittery flicker-in
          const p = local / inDur;
          opacity = p * (rand(Math.floor(t * 60) + f.id) > 0.3 ? 1 : 0.3);
        } else if (local > f.life - outDur) {
          const p = (local - (f.life - outDur)) / outDur;
          opacity = (1 - p) * (rand(Math.floor(t * 90) + f.id * 3) > 0.25 ? 1 : 0.4);
        } else {
          opacity = 0.85 + 0.15 * (rand(Math.floor(t * 30) + f.id * 5) - 0.5);
        }
        // CRT glitch: short bursts during life that displace + RGB-split + tear
        let glitchActive = false, glitchSlice = -1, glitchDx = 0, glitchSplit = 0, tearY = -1, tearDx = 0;
        if (f.glitchy) {
          const seed = f.id * 100;
          const burstCount = 2 + Math.floor(rand(seed) * 2);
          for (let b = 0; b < burstCount; b++) {
            const bt = inDur + rand(seed + b * 13) * Math.max(0.01, f.life - inDur - outDur);
            const bd = 0.05 + rand(seed + b * 17) * 0.18;
            if (local >= bt && local <= bt + bd) {
              glitchActive = true;
              const j = Math.floor(local * 90 + b);
              glitchDx = (rand(j) - 0.5) * 14;
              glitchSplit = (rand(j + 1) - 0.5) * 5;
              glitchSlice = rand(j + 2) < 0.5 ? Math.floor(rand(j + 3) * f.rows) : -1;
              if (rand(j + 4) < 0.6) {
                tearY = rand(j + 5) * (f.rows * f.lineH + 20);
                tearDx = (rand(j + 6) - 0.5) * 22;
              }
              opacity *= 0.7 + rand(j + 7) * 0.5;
            }
          }
        }
        // every few frames, scramble a row to feel "live"
        opacity = Math.max(0, Math.min(1, opacity || 0));
        const scrambleRow = Math.floor(rand(f.id * 19 + Math.floor(t * 6)) * f.rows);
        const lines = f.body.map((ln, idx) => {
          if (idx === scrambleRow) {
            // produce a fresh scramble for this row
            let s = '';
            for (let c = 0; c < f.cols; c++) {
              const v = rand(f.id * 1000 + Math.floor(t * 60) + c);
              s += FRAGMENT_CHARS[Math.floor(v * FRAGMENT_CHARS.length)];
            }
            return s;
          }
          return ln;
        });
        return (
          <div key={f.id} style={{
            position: 'absolute',
            left: f.x + glitchDx, top: f.y,
            opacity: opacity * (0.18 + f.depth * 0.32),
            fontFamily: '"Frontier Disket Mono", "JetBrains Mono", ui-monospace, monospace',
            fontSize: f.fontSize,
            lineHeight: f.lineH + 'px',
            letterSpacing: '0.05em',
            padding: 0,
            whiteSpace: 'pre',
            pointerEvents: 'none',
            mixBlendMode: 'screen',
            color: `rgba(210,120,40,${0.6 + f.depth * 0.3})`,
            filter: glitchActive
              ? `drop-shadow(${glitchSplit}px 0 0 rgba(255,80,40,0.85)) drop-shadow(${-glitchSplit}px 0 0 rgba(80,180,255,0.7))`
              : 'none',
          }}>
            <div style={{
              color: `rgba(210,120,40,${0.6 + f.depth * 0.3})`,
              fontWeight: 700,
              fontSize: f.fontSize,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: 2,
            }}>
              {f.header}
            </div>
            {lines.map((ln, i) => {
              const isSlice = glitchActive && i === glitchSlice;
              return (
                <div key={i} style={{
                  transform: isSlice ? `translateX(${(rand(f.id + i + Math.floor(t*60)) - 0.5) * 18}px)` : 'none',
                  background: isSlice ? 'rgba(255,255,255,0.08)' : 'transparent',
                }}>{ln}</div>
              );
            })}
            {glitchActive && tearY >= 0 && (
              <div style={{
                position: 'absolute', left: tearDx, top: tearY,
                width: '100%', height: 2,
                background: 'rgba(255,255,255,0.7)',
                boxShadow: '0 0 8px rgba(255,255,255,0.6)',
              }}/>
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Portal (re-tinted to match orange palette, kept simple + glowing) ──────
function Portal() {
  const t = useTime();
  const cx = STAGE_W / 2 + (PORTAL.x - IMG_W / 2);
  const cy = STAGE_H / 2 + (PORTAL.y - IMG_H / 2);

  let intensity = 0.4;
  if (t > 3 && t < 7)        intensity = 0.4 + ((t - 3) / 4) * 0.25;
  else if (t >= 7 && t < 10.5) intensity = 0.65 + ((t - 7) / 3.5) * 0.35;
  else if (t >= 10.5 && t < 11.0) intensity = 1.0;
  else if (t >= 11.0 && t < 11.6) {
    const k = (t - 11.0) / 0.6;
    intensity = 1.0 + (1 - k) * 1.4;
  } else if (t >= 11.6 && t < 15) intensity = 0.95 - ((t - 11.6) / 3.4) * 0.55;
  else                          intensity = 0.4 + Math.sin(t * 1.5) * 0.05;
  intensity = Math.max(0.25, intensity);

  const pulse = 1 + Math.sin(t * 3.2) * 0.04 * intensity;
  const fastPulse = 1 + Math.sin(t * 8) * 0.02;
  const coreSize = 70 * pulse * (0.9 + intensity * 0.4);
  const haloSize = 220 * pulse * (0.8 + intensity * 0.7);
  const wideSize = 460 * (0.7 + intensity * 0.9);
  const ringRot = t * (15 + intensity * 30);
  const flash = (t > 10.9 && t < 11.5) ? Math.max(0, 1 - Math.abs(t - 11.0) / 0.5) : 0;

  const beamActive = t > 10.95 && t < 13.0;
  const beamProg = beamActive ? Math.min(1, (t - 10.95) / 0.35) : 0;
  const beamFade = beamActive ? Math.max(0, 1 - (t - 11.4) / 1.6) : 0;
  const beamH = beamActive ? 800 * beamProg : 0;
  const beamW = beamActive ? 28 + (1 - beamProg) * 22 : 0;

  const shockActive = t > 11.0 && t < 12.5;
  const shockProg = shockActive ? (t - 11.0) / 1.5 : 0;
  const shockR = shockActive ? Easing.easeOutCubic(shockProg) * 600 : 0;
  const shockOp = shockActive ? (1 - shockProg) * 0.95 : 0;

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: STAGE_W, height: STAGE_H, pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute',
        left: cx - wideSize, top: cy - wideSize * 0.45,
        width: wideSize * 2, height: wideSize * 0.9,
        borderRadius: '50%',
        background: `radial-gradient(ellipse 50% 50% at 50% 50%, hsla(28,100%,60%,${0.22 * intensity}) 0%, hsla(20,90%,45%,${0.10 * intensity}) 35%, transparent 70%)`,
        filter: 'blur(20px)',
        mixBlendMode: 'screen',
      }}/>
      <div style={{
        position: 'absolute',
        left: cx - haloSize, top: cy - haloSize * 0.55,
        width: haloSize * 2, height: haloSize * 1.1,
        borderRadius: '50%',
        background: `radial-gradient(ellipse, hsla(35,100%,75%,${0.55 * intensity}) 0%, hsla(25,95%,55%,${0.28 * intensity}) 30%, transparent 65%)`,
        filter: 'blur(8px)',
        mixBlendMode: 'screen',
        transform: `scale(${fastPulse})`,
      }}/>
      <div style={{
        position: 'absolute',
        left: cx - 130, top: cy - 65,
        width: 260, height: 130,
        borderRadius: '50%',
        background: `conic-gradient(from ${ringRot}deg,
          hsla(35,100%,80%,0) 0deg,
          hsla(35,100%,85%,${0.7 * intensity}) 30deg,
          transparent 80deg,
          hsla(28,100%,75%,${0.6 * intensity}) 160deg,
          transparent 220deg,
          hsla(35,100%,85%,${0.8 * intensity}) 290deg,
          transparent 340deg,
          hsla(35,100%,80%,0) 360deg)`,
        mixBlendMode: 'screen',
        filter: 'blur(2px)',
      }}/>
      <div style={{
        position: 'absolute',
        left: cx - 90, top: cy - 45,
        width: 180, height: 90,
        borderRadius: '50%',
        border: `2px solid hsla(35,100%,85%,${0.6 * intensity})`,
        boxShadow: `0 0 20px hsla(28,100%,60%,${0.7 * intensity}), inset 0 0 14px hsla(35,100%,85%,${0.45 * intensity})`,
        transform: `rotate(${-ringRot * 0.6}deg)`,
        mixBlendMode: 'screen',
      }}/>
      <div style={{
        position: 'absolute',
        left: cx - 55, top: cy - 28,
        width: 110, height: 56,
        borderRadius: '50%',
        border: `1.5px dashed hsla(35,100%,90%,${0.75 * intensity})`,
        transform: `rotate(${ringRot * 1.4}deg)`,
        mixBlendMode: 'screen',
      }}/>
      <div style={{
        position: 'absolute',
        left: cx - coreSize / 2, top: cy - coreSize / 2,
        width: coreSize, height: coreSize,
        borderRadius: '50%',
        background: `radial-gradient(circle, hsla(40,100%,98%,${Math.min(1, intensity * 1.2)}) 0%, hsla(35,100%,80%,${0.9 * intensity}) 30%, hsla(22,95%,55%,${0.65 * intensity}) 60%, transparent 80%)`,
        filter: 'blur(1px)',
        mixBlendMode: 'screen',
        boxShadow: `0 0 ${50 + intensity * 70}px hsla(28,100%,70%,${0.95 * intensity})`,
      }}/>
      {beamActive && (
        <>
          <div style={{
            position: 'absolute',
            left: cx - beamW / 2, top: cy - beamH,
            width: beamW, height: beamH,
            background: `linear-gradient(to top, hsla(40,100%,95%,${0.95 * beamFade}) 0%, hsla(28,100%,75%,${0.7 * beamFade}) 30%, transparent 100%)`,
            filter: 'blur(4px)',
            mixBlendMode: 'screen',
          }}/>
          <div style={{
            position: 'absolute',
            left: cx - 4, top: cy - beamH,
            width: 8, height: beamH,
            background: `linear-gradient(to top, white, hsla(35,100%,85%,0.9), transparent)`,
            mixBlendMode: 'screen',
            opacity: beamFade,
          }}/>
        </>
      )}
      {shockActive && (
        <div style={{
          position: 'absolute',
          left: cx - shockR, top: cy - shockR * 0.45,
          width: shockR * 2, height: shockR * 0.9,
          borderRadius: '50%',
          border: `${3 + (1 - shockProg) * 4}px solid hsla(35,100%,85%,${shockOp})`,
          boxShadow: `0 0 30px hsla(28,100%,70%,${shockOp}), inset 0 0 30px hsla(35,100%,85%,${shockOp * 0.6})`,
          mixBlendMode: 'screen',
        }}/>
      )}
      {flash > 0 && (
        <div style={{
          position: 'absolute',
          left: 0, top: 0, width: STAGE_W, height: STAGE_H,
          background: `radial-gradient(ellipse at ${cx}px ${cy}px, hsla(40,100%,90%,${flash * 0.85}) 0%, hsla(25,95%,55%,${flash * 0.4}) 30%, transparent 70%)`,
          mixBlendMode: 'screen',
        }}/>
      )}
    </div>
  );
}

// ── Frame chrome (corner brackets + side notches, screenshot-style) ────────
function FrameChrome() {
  const corner = (style) => (
    <div style={{
      position: 'absolute',
      width: 60, height: 60,
      borderColor: ORANGE,
      borderStyle: 'solid',
      ...style,
    }}/>
  );
  const sideNotch = (style) => (
    <div style={{
      position: 'absolute',
      width: 18, height: 60,
      borderColor: ORANGE,
      borderStyle: 'solid',
      ...style,
    }}/>
  );
  return (
    <>
      {corner({ top: 30, left: 30, borderWidth: '2px 0 0 2px' })}
      {corner({ top: 30, right: 30, borderWidth: '2px 2px 0 0' })}
      {corner({ bottom: 30, left: 30, borderWidth: '0 0 2px 2px' })}
      {corner({ bottom: 30, right: 30, borderWidth: '0 2px 2px 0' })}
      {sideNotch({ top: '50%', left: 30, transform: 'translateY(-50%)', borderWidth: '2px 0 2px 2px' })}
      {sideNotch({ top: '50%', right: 30, transform: 'translateY(-50%)', borderWidth: '2px 2px 2px 0' })}
    </>
  );
}

// ── Skip to Bazaar button ────────────────────────────────────────────────
// This button only appears for users who are ALREADY REGISTERED to the
// Bazaar — i.e. returning users who have previously consented to scan and
// don't need to walk through the Translation Protocol / consent flow again.
// In the animation it's shown for demonstrative purposes; in production
// its visibility is gated on the user's registration state.
function SkipToBazaar() {
  const [hover, setHover] = React.useState(false);
  return (
    <div style={{
      position: 'absolute',
      right: 110, bottom: 70,
      zIndex: 35,
    }}>
      <button
        type="button"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          pointerEvents: 'auto',
          fontFamily: '"Frontier Disket Mono", ui-monospace, monospace',
          fontSize: '0.95rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: hover ? 'rgba(255, 235, 180, 1)' : 'rgba(255, 200, 130, 0.85)',
          background: hover ? 'rgba(204, 112, 0, 0.18)' : 'rgba(8, 6, 4, 0.55)',
          border: `1px solid ${hover ? 'rgba(255, 200, 110, 0.95)' : 'rgba(204, 112, 0, 0.55)'}`,
          borderRadius: 3,
          padding: '8px 18px',
          cursor: 'pointer',
          textShadow: '0 0 8px rgba(255, 180, 80, 0.5)',
          boxShadow: hover
            ? '0 0 22px rgba(255, 180, 80, 0.35), inset 0 0 14px rgba(255, 180, 80, 0.10)'
            : '0 0 14px rgba(204, 112, 0, 0.18), inset 0 0 12px rgba(204, 112, 0, 0.06)',
          transition: 'background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span>Skip to Bazaar</span>
        <span style={{ opacity: 0.85 }}>›</span>
      </button>
    </div>
  );
}

// ── Vignette + scanlines ───────────────────────────────────────────────────
function Overlays() {
  return (
    <>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(8,6,4,0.7) 100%)',
        pointerEvents: 'none',
      }}/>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 4px)',
        pointerEvents: 'none',
      }}/>
    </>
  );
}

// ── CRT screen flicker — subtle brightness wobble + occasional roll bar + glitch
function CRTFlicker() {
  const t = useTime();
  // continuous low-amp flicker (luminance wobble)
  const wobble = Math.sin(t * 33) * 0.012 + Math.sin(t * 71.3) * 0.008 + Math.sin(t * 11.7) * 0.006;
  // every ~3-7s a brighter glitch frame
  const glitchSeed = Math.floor(t * 0.7);
  const glitch = (Math.sin(glitchSeed * 12.9898) * 43758.5453) % 1;
  const isGlitch = Math.abs(glitch) > 0.93;
  const brightness = 1 + wobble + (isGlitch ? 0.18 * (Math.sin(t * 60) > 0 ? 1 : -0.6) : 0);

  // rare horizontal glitch tear
  const tearSeed = Math.floor(t * 1.3);
  const tearRand = (Math.sin(tearSeed * 91.345) * 13247.123) % 1;
  const showTear = Math.abs(tearRand) > 0.88;
  const tearY = ((Math.sin(tearSeed * 27.7) * 0.5 + 0.5) * STAGE_H) | 0;

  return (
    <>
      {/* full-frame brightness wobble */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: '#000',
        opacity: Math.max(0, 1 - brightness) * 0.6,
        mixBlendMode: 'multiply',
      }}/>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: '#fff',
        opacity: Math.max(0, brightness - 1) * 0.18,
        mixBlendMode: 'screen',
      }}/>
      {/* rare horizontal tear */}
      {showTear && (
        <div style={{
          position: 'absolute', left: 0, right: 0,
          top: tearY, height: 2,
          background: 'rgba(255,220,180,0.4)',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
        }}/>
      )}
      {/* occasional full-frame glitch flash */}
      {isGlitch && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'rgba(255,170,80,0.04)',
          mixBlendMode: 'screen',
        }}/>
      )}
    </>
  );
}

function TimeLabel() {
  const t = useTime();
  React.useEffect(() => {
    const root = document.querySelector('[data-screen-label]');
    if (root) root.setAttribute('data-screen-label', `t=${t.toFixed(1)}s`);
  }, [Math.floor(t)]);
  return null;
}

const RAIN_STREAMS = [
  // horizontal streams first → vertical streams overwrite their cells.
  // persist:true means cells keep their character/brightness instead of fading.
  { direction: 'left',  speedScale: 0.6, trail: 14, persist: true },
  { direction: 'right', speedScale: 0.6, trail: 14, persist: true },
  { direction: 'down',  speedScale: 1.0, trail: 18 },
];

// ── HAL eye — round eye built from rain glyphs, with a darting pupil ───────
// Returns a ref whose .current is { shape, inside, iris, glow } where shape/inside/iris
// are Sets of (r*10000+c) keys. Updated every frame from a continuous animation loop.
function useHal({ enabled = true } = {}) {
  const halRef = React.useRef({
    shape: new Set(), inside: new Set(), iris: new Set(), glow: 0,
    eyeCx_stage: 0, eyeCy_stage: 0, eyeR_stage: 0,
    triggered: false, triggerStart: 0,
    // ── Formation state (eye assembles itself from rain over time) ──
    // formation: Map<cellKey, 0..1> — per-cell formation progress.
    //   Bumped by the rain renderer whenever a vertical (down) stream's head
    //   lands on a shape cell; ranges 0 (rain only) → 1 (fully solid eye glyph).
    // formAvg: average of all current shape cells' progress (0..1)
    // formStart: ms timestamp when avg first crossed 0.5 (start of 3s consolidation)
    // formed: true once consolidation tween is complete — eye becomes reactive
    // formProgress: 0..1 — same as max(formAvg, consolidation tween) for rendering
    formation: new Map(),
    formAvg: 0,
    formStart: 0,
    formed: false,
    formProgress: 0,
  });
  const rafRef = React.useRef(null);
  // Notify React when the eye first sees the cursor (sequence trigger)
  const [triggered, setTriggered] = React.useState(false);
  const triggeredRef = React.useRef(false);

  React.useEffect(() => {
    if (!enabled) return;
    const FS = 14;
    const cols = Math.ceil(STAGE_W / FS);
    const rows = Math.ceil(STAGE_H / FS);

    // Circular eye, 15% smaller than the previous oval. Use the smaller of (RX, RY)
    // to keep it compact: previous min radius 11 → 11 * 0.85 ≈ 9.35.
    const R = 9.35;       // eye radius in cells (circular)
    const ringThick = 2.0;
    const PUPIL_R_BASE = 4.5;

    // Final eye center (in cells) — noticeably above stage center
    const ecR_final = Math.floor(rows / 2) - Math.round(rows * 0.14);
    const ecC_final = Math.floor(cols / 2);
    // Initial eye center — middle-outer-left of stage
    const ecR_initial = Math.floor(rows / 2);
    const ecC_initial = Math.round(cols * 0.18);
    // Animated eye position (filled each frame in tick()).
    let ecR = ecR_initial;
    let ecC = ecC_initial;

    // Trigger zone: 4.5× the eye radius (in pixels)
    const triggerR_px = R * FS * 4.5;
    // Maximum pupil offset from eye center (cells)
    const PUPIL_MAX_OFFSET = R - PUPIL_R_BASE - 0.5;
    // Mouse-driven pupil target lock — only updates when cursor moves > THRESHOLD px
    const MOVE_THRESHOLD = 40;

    // Mouse tracking state (kept in closures so we can update from event listeners
    // and read from the rAF loop).
    const mouse = {
      x: -9999, y: -9999,         // viewport coords
      sx: -9999, sy: -9999,       // mapped to stage coords
      lastLockX: -9999,           // viewport coords of last "locked" position
      lastLockY: -9999,
      inside: false,              // currently within trigger zone?
    };

    // We need to map viewport coords to stage coords. The stage is scaled to fit;
    // grab the canvas's bounding rect each event for accurate mapping. Resolved
    // lazily inside tick() so we don't race React mount.
    let canvas = null;
    // Track the last time the cursor actually moved (in tick-time seconds)
    let lastMoveT = -999;
    const onMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      lastMoveT = (performance.now() - start) / 1000;
    };
    const onLeave = () => {
      mouse.x = -9999; mouse.y = -9999; mouse.inside = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);

    let start = performance.now();
    // Pupil position state — eased toward whichever target is current
    let pupilDX = 0, pupilDY = 0;
    // Currently locked target (in pupil-offset cells)
    let targetDX = 0, targetDY = 0;
    let lastTargetSetAt = 0;
    let pupilFocus = 1.0; // smoothed focus factor (1 idle, ~0.7 focused)
    // Tracks whether we've reached the 100ms-after-entry latch within the
    // current acquisition window. Resets when the lock fully releases.
    let hasFocusedOnce = false;
    let firstInsideMoveT = -1;
    // Last time the cursor was inside the trigger zone (used to time the
    // post-exit "stare" window).
    let lastInsideT = -999;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const t = (performance.now() - start) / 1000;

      // ── Eye flight: starts at middle-left until end of pulse 1 (+3.0s
      // post-trigger), then arcs upward to its final center position over
      // 0.7s (lands at +3.7s, just as the card appears).
      let basePosR, basePosC;
      const flightStart = 3.0;
      const flightDur = 1.2;
      let flightK = 0; // 0 = at initial, 1 = at final
      if (halRef.current.triggered && halRef.current.triggerStart) {
        const pt = (performance.now() - halRef.current.triggerStart) / 1000;
        if (pt < flightStart) flightK = 0;
        else if (pt > flightStart + flightDur) flightK = 1;
        else {
          const lin = (pt - flightStart) / flightDur;
          // ease-in-out so launch + landing feel intentional
          flightK = lin < 0.5
            ? 2 * lin * lin
            : 1 - Math.pow(-2 * lin + 2, 2) / 2;
        }
      }
      // Linear interp for column, plus an upward arc bump on the way over.
      basePosC = ecC_initial + (ecC_final - ecC_initial) * flightK;
      const linRow = ecR_initial + (ecR_final - ecR_initial) * flightK;
      // Arc: parabola peaking at flightK=0.5, lifting the eye upward
      // (negative row delta) by ~rows*0.08 cells at peak.
      const arcLift = -Math.sin(flightK * Math.PI) * (rows * 0.08);
      basePosR = linRow + arcLift;

      // Gentle vertical hover/breathing — slow sine, amplitude 0.55 cells.
      // Suppressed during the flight (flightK in (0,1)) so the arc reads cleanly.
      const flightActive = flightK > 0 && flightK < 1;
      const hoverAmp = flightActive ? 0 : 0.55;
      ecR = basePosR + Math.sin(t * (Math.PI * 2 / 3.4)) * hoverAmp;
      ecC = basePosC;

      // ── 1) Compute eye center in stage pixels for mouse-zone test
      // Find canvas's screen rect each frame (it might scale/animate).
      if (!canvas) canvas = document.querySelector('canvas');
      let stageX = -9999, stageY = -9999;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        // map mouse → stage coords
        const sx = ((mouse.x - rect.left) / rect.width) * STAGE_W;
        const sy = ((mouse.y - rect.top) / rect.height) * STAGE_H;
        stageX = sx; stageY = sy;
      }
      const eyeCx_stage = ecC * FS + FS / 2;
      const eyeCy_stage = ecR * FS + FS / 2;
      const dxStage = stageX - eyeCx_stage;
      const dyStage = stageY - eyeCy_stage;
      const distStage = Math.sqrt(dxStage * dxStage + dyStage * dyStage);
      mouse.inside = distStage <= triggerR_px;

      // First-entry trigger: latch on first time cursor enters the zone.
      // Gated on the eye being fully formed — until then, mouse is ignored.
      if (mouse.inside && !triggeredRef.current && halRef.current.formed) {
        triggeredRef.current = true;
        halRef.current.triggered = true;
        halRef.current.triggerStart = performance.now();
        setTriggered(true);
      }

      // Track focus-acquisition latch:
      // - When cursor first enters zone with movement, mark the time.
      // - 100ms later, hasFocusedOnce flips true (and pupil starts shrinking).
      // - Reset only after the full lock window has expired (3s after the last
      //   in-zone activity).
      const stillness = t - lastMoveT;
      if (mouse.inside) {
        lastInsideT = t;
      }
      // "lock age" = seconds since last in-zone movement (cursor still in zone)
      // OR seconds since cursor last left zone — whichever is more recent.
      // While inside zone & moving: lock-age ≈ 0
      // While inside zone & still: lock-age = stillness
      // After leaving zone: lock-age = (t - lastInsideT)
      const lockAge = mouse.inside
        ? stillness
        : (t - lastInsideT);

      if (lockAge > 3.0) {
        // lock window expired — release and require fresh acquisition
        firstInsideMoveT = -1;
        hasFocusedOnce = false;
      } else if (mouse.inside) {
        if (firstInsideMoveT < 0 && lastMoveT >= 0) {
          firstInsideMoveT = lastMoveT;
        }
        if (!hasFocusedOnce && firstInsideMoveT >= 0 && (t - firstInsideMoveT) > 0.1) {
          hasFocusedOnce = true;
        }
      }
      // If we exited the zone but the lock is still alive, hasFocusedOnce
      // stays whatever it was (eye keeps staring; pupil stays small until 2.9s).

      // ── 2) Decide pupil target
      // If the eye isn't fully formed yet, it stares straight ahead — pupil
      // locked dead center, no mouse tracking, no idle saccades.
      if (!halRef.current.formed) {
        targetDX = 0;
        targetDY = 0;
        lastTargetSetAt = t;
        // Reset focus-acquisition latch so the lock window starts fresh
        // once formation completes.
        firstInsideMoveT = -1;
        hasFocusedOnce = false;
        mouse.lastLockX = -9999;
        mouse.lastLockY = -9999;
      } else {
      // Behavior:
      //   - In zone & moved < 3s ago → eye locks on, follows cursor
      //   - In zone & still > 3s → lock releases, idle saccades resume
      //   - Cursor exits zone → eye holds last in-zone target for 3s, then idle
      const lockedOn = lockAge < 3.0 && hasFocusedOnce;
      if (lockedOn) {
        if (mouse.inside) {
          // Only update lock if cursor moved more than threshold from last lock
          const lockDx = mouse.x - mouse.lastLockX;
          const lockDy = mouse.y - mouse.lastLockY;
          const lockDist = Math.sqrt(lockDx * lockDx + lockDy * lockDy);
          if (lockDist > MOVE_THRESHOLD) {
            mouse.lastLockX = mouse.x;
            mouse.lastLockY = mouse.y;
            const dirNorm = Math.min(1, distStage / triggerR_px);
            const ang = Math.atan2(dyStage, dxStage);
            targetDX = Math.cos(ang) * dirNorm * PUPIL_MAX_OFFSET;
            targetDY = Math.sin(ang) * dirNorm * PUPIL_MAX_OFFSET;
            lastTargetSetAt = t;
          }
        }
        // If cursor is outside zone but lock still alive: do nothing — eye
        // continues to hold its last targetDX/DY (the last in-zone position).
      } else {
        // Idle saccades — also force a fresh saccade right when we exit lock
        // so the eye visibly looks away.
        // Reset lastLock so re-entry feels like a fresh acquisition.
        mouse.lastLockX = -9999;
        mouse.lastLockY = -9999;
        const saccadeT = Math.floor(t / 2.3);
        if (saccadeT !== Math.floor((t - 0.05) / 2.3) || lastTargetSetAt === 0) {
          const seedX = Math.sin(saccadeT * 12.9898) * 43758.5453;
          const seedY = Math.sin(saccadeT * 78.233)  * 12345.6789;
          targetDX = ((seedX - Math.floor(seedX)) - 0.5) * 2 * PUPIL_MAX_OFFSET;
          targetDY = ((seedY - Math.floor(seedY)) - 0.5) * 2 * PUPIL_MAX_OFFSET;
          lastTargetSetAt = t;
        }
      }
      } // end "if (formed)" gate

      // Smooth ease toward target each frame
      const easeRate = 0.12; // ~ how snappy the eye is
      pupilDX += (targetDX - pupilDX) * easeRate;
      pupilDY += (targetDY - pupilDY) * easeRate;

      // Pupil shrink: small while focused on the cursor.
      // - Engages 100ms after cursor first enters zone (latched per acquisition)
      // - Stays small while the lock is alive (lockAge < 2.9s) — even after
      //   cursor leaves the zone, the eye keeps staring with a small pupil
      // - Returns to large at 2.9s of lock age
      const focusOn = hasFocusedOnce && lockAge < 2.9;
      const targetFocus = focusOn ? 0.7 : 1.0;
      pupilFocus += (targetFocus - pupilFocus) * 0.18;
      const pupilR = (PUPIL_R_BASE + Math.sin(t * 1.7) * 0.4) * pupilFocus;

      // Eye is always open (blinking removed)
      const lid = 1.0;

      // Brightness pulse — slightly stronger when actively tracking
      const glow = 0.5 + 0.5 * Math.sin(t * 1.4) + (mouse.inside ? 0.25 : 0);

      const shape = new Set();
      const inside = new Set();
      const iris = new Set();

      // ── Pre-protocol pulses: the eye breathes outward to "summon" each
      // major UI element. Pulse 1 (+2.3..+3.0s) is the eye's "launch" pulse,
      // followed by its flight from left → center (+3.0..+3.7s). Card
      // appears at +3.7s. Pulse 2 (+5.7..+6.4s) summons the translation bar
      // (appears at +6.4s). Pulse 3 (+11.5..+12.2s) fires when the bar
      // locks to "SUCCESSFUL". Each pulse spawns a 3.0s white shockwave.
      let pulseScale = 1.0;
      let waveRadius = -1; // px from eye center; -1 = wave inactive
      let waveStrength = 0; // 0..1 intensity multiplier
      let activeWaves = [];
      if (halRef.current.triggered && halRef.current.triggerStart) {
        const pt = (performance.now() - halRef.current.triggerStart) / 1000;
        // Pulse list: built-in protocol pulses + any pushed at runtime by
        // user clicks. Each entry is a start time in seconds-after-trigger.
        const pulseStarts = [2.3, 5.7, 11.5];
        const dynamic = halRef.current.dynamicPulses || [];
        for (let i = 0; i < dynamic.length; i++) pulseStarts.push(dynamic[i]);
        const PULSE_DUR = 0.7;
        for (let i = 0; i < pulseStarts.length; i++) {
          const ps = pulseStarts[i];
          if (pt >= ps && pt <= ps + PULSE_DUR) {
            const k = (pt - ps) / PULSE_DUR;
            const ps_scale = 1.0 + 0.18 * Math.sin(k * Math.PI);
            // Compose multiple overlapping pulses as max scale
            if (ps_scale > pulseScale) pulseScale = ps_scale;
          }
        }
        // Wave: 0 → maxDist over 3.0s, spawned at start of each pulse.
        const WAVE_DUR = 3.0;
        const maxDist = Math.sqrt(STAGE_W * STAGE_W + STAGE_H * STAGE_H);
        const computeWave = (start) => {
          const wt = pt - start;
          if (wt < 0 || wt > WAVE_DUR + 0.1) return null;
          const k = Math.min(1, wt / WAVE_DUR);
          const eased = 1 - Math.pow(1 - k, 2.2);
          const radius = eased * maxDist;
          const strength = k < 0.7 ? 1.0 : 1.0 - (k - 0.7) / 0.3;
          return { radius, strength };
        };
        // Collect ALL active waves so 3-pulse sequences (consent/proceed)
        // overlap visibly instead of cancelling each other.
        activeWaves = [];
        for (let i = 0; i < pulseStarts.length; i++) {
          const w = computeWave(pulseStarts[i]);
          if (w) activeWaves.push(w);
        }
        if (activeWaves.length > 0) {
          // Keep waveRadius/strength for the freshest (used for legacy single-wave
          // consumers if any), but also publish full list.
          let freshest = activeWaves[0];
          let freshestStart = pulseStarts[0];
          for (let i = 0; i < activeWaves.length; i++) {
            // index correspondence: same order we pushed
          }
          // simpler: pick last (most recent) since pulseStarts order may vary
          for (let i = pulseStarts.length - 1; i >= 0; i--) {
            const w = computeWave(pulseStarts[i]);
            if (w) { freshest = w; break; }
          }
          waveRadius = freshest.radius;
          waveStrength = freshest.strength;
        }
      }
      halRef.current.activeWaves = activeWaves;
      halRef.current.waveRadius = waveRadius;
      halRef.current.waveStrength = waveStrength;
      halRef.current.waveCx = ecC * FS + FS / 2;
      halRef.current.waveCy = ecR * FS + FS / 2;
      // First wave (pulse #0 at 2.3s) — drives the card cutout freeze.
      // Once the wave expires we lock the radius at maxDist so the freeze
      // mask stays valid (every cell already covered).
      if (halRef.current.triggered && halRef.current.triggerStart) {
        const pt = (performance.now() - halRef.current.triggerStart) / 1000;
        const FIRST_PULSE = 2.3;
        const WAVE_DUR = 3.0;
        const maxDist = Math.sqrt(STAGE_W * STAGE_W + STAGE_H * STAGE_H);
        const wt = pt - FIRST_PULSE;
        let firstR = -1;
        if (wt >= 0) {
          const k = Math.min(1, wt / WAVE_DUR);
          const eased = 1 - Math.pow(1 - k, 2.2);
          firstR = eased * maxDist;
        }
        halRef.current.firstWaveRadius = firstR;
      } else {
        halRef.current.firstWaveRadius = -1;
      }
      // Eye grows 15% larger as it completes its flight to center.
      const flightSizeMul = 1.0 + 0.15 * flightK;
      const Reff = R * flightSizeMul * pulseScale;
      const pupilReffMul = flightSizeMul * pulseScale; // pupil scales with eye

      // sweep over bounding box
      const RYeff = Reff;
      const rMin = Math.max(0, Math.floor(ecR - Reff - 2));
      const rMax = Math.min(rows - 1, Math.ceil(ecR + Reff + 2));
      const cMin = Math.max(0, Math.floor(ecC - Reff - 2));
      const cMax = Math.min(cols - 1, Math.ceil(ecC + Reff + 2));

      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          const dx = (c - ecC) / Reff;
          const dy = (r - ecR) / RYeff;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 1.05) continue;
          const key = r * 10000 + c;
          // outer ring
          if (d > 1.0 - ringThick / Reff) {
            shape.add(key);
            inside.add(key);
            continue;
          }
          inside.add(key);

          // iris/pupil
          const pdx = c - ecC - pupilDX;
          const pdy = r - ecR - pupilDY;
          const pd = Math.sqrt(pdx * pdx + pdy * pdy);
          const pR = pupilR * pupilReffMul;
          if (pd <= pR) {
            iris.add(key);
            shape.add(key);
          } else if (pd <= pR + 0.9) {
            shape.add(key);
          }
        }
      }

      // (blink removed)

      // ── Formation: time-driven (independent of rain) ────────────────────
      //   t < FORM_DELAY:                  all cells dormant (eye invisible)
      //   FORM_DELAY .. FORM_DELAY+RAMP:   each cell ramps to 1 with a small
      //                                    random per-cell offset for organic feel
      //   after that:                      formed
      const FORM_DELAY = 4.0;   // wait this long before starting
      const FORM_RAMP  = 3.0;   // time over which formation completes
      const FORM_END   = FORM_DELAY + FORM_RAMP;
      const elapsedSec = (performance.now() - start) / 1000;

      const formation = halRef.current.formation;

      // Compute per-cell formation progress for every shape cell this frame.
      // Each cell gets a deterministic random join-offset in [0, RAMP * 0.6]
      // so cells start forming at slightly different times — gives a
      // scribbled-into-existence flicker rather than a uniform fade.
      let formSum = 0, formCount = 0;
      for (const key of shape) {
        let cellForm;
        if (elapsedSec < FORM_DELAY) {
          cellForm = 0;
        } else if (elapsedSec >= FORM_END) {
          cellForm = 1;
        } else {
          // deterministic per-cell offset
          const seed = Math.sin(key * 0.013 + key * 9.7) * 43758.5453;
          const offset = ((seed - Math.floor(seed))) * (FORM_RAMP * 0.55);
          const cellRamp = FORM_RAMP - offset; // remaining ramp duration
          const localT = (elapsedSec - FORM_DELAY) - offset;
          if (localT <= 0) cellForm = 0;
          else {
            const k = Math.min(1, localT / cellRamp);
            // ease-in-out
            cellForm = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          }
        }
        formation.set(key, cellForm);
        formSum += cellForm;
        formCount++;
      }
      // Proceed-click dissolve: once the user clicks PROCEED, the eye
      // un-forms (cellForm decays to 0), turning back into pure rain.
      // halRef.current.dissolveK is set 0..1 by TranslationSequence each
      // frame after proceedClick (1.5s ramp).
      const dissolveK = halRef.current.dissolveK || 0;
      if (dissolveK > 0) {
        const inv = 1 - dissolveK;
        for (const key of shape) {
          const cur = formation.get(key) ?? 0;
          formation.set(key, cur * inv);
        }
      }
      const formAvg = formCount > 0 ? formSum / formCount : 0;
      halRef.current.formAvg = formAvg;
      halRef.current.formProgress = formAvg;
      halRef.current.formed = elapsedSec >= FORM_END;

      halRef.current.shape = shape;
      halRef.current.inside = inside;
      halRef.current.iris = iris;
      halRef.current.glow = glow;
      halRef.current.eyeCx_stage = eyeCx_stage;
      halRef.current.eyeCy_stage = eyeCy_stage;
      halRef.current.eyeR_stage = R * FS;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [enabled]);

  return { halRef, triggered };
}

// ── Translation Sequence — fires on first cursor entry into eye trigger zone ──
// Phase plan (t = seconds after first trigger):
//   0.0–3.0s : dormant
//   3.0–3.6s : black card CRT turn-on
//   3.6–5.6s : card writes 3 lines letter-by-letter, ALL characters cryptic
//              (no translation yet — text reads as gibberish glyphs)
//   5.7–7.0s : translation bar fades in above card; "INITIATING TRANSLATION
//              PROTOCOL" label types out — also rendered as cryptic glyphs
//   7.0–9.5s : loading bar fills 0 → 100% (label still cryptic)
//   9.5–10.8s: label translates letter-by-letter to readable
//              "TRANSLATION PROTOCOL SUCCESSFUL"
//   10.8–11.0s: success pulse hold
//   11.0–12.0s: bar docks to bottom-left AND card text simultaneously
//              translates letter-by-letter from cryptic to readable English
const TRANSLATION_LINES = [
  "> SIGNAL ACQUIRED. DECRYPTING IDENT…",
  "> STRANGER PROTOCOL ENGAGED.",
  "> WHO APPROACHES THE BAZAAR?",
];
const BAR_LABEL_CRYPTIC = "INITIATING TRANSLATION PROTOCOL";
const BAR_LABEL_SUCCESS = "TRANSLATION PROTOCOL SUCCESSFUL";
const CRYPTIC_CHARS = "アイウエオカキクケコサシスセソタチツテト0123456789ABCDEF#$%&*<>/\\|=";

// Time-varying cryptic glyph: re-rolls every ~CHURN_PERIOD so the cryptic text
// constantly shifts. seed = (lineIdx*1000 + ci) keeps each slot's churn
// deterministic but offset from neighbors so the field doesn't flip in unison.
const CHURN_PERIOD = 0.06; // s — how often each slot picks a new glyph
function churnCryptic(seed, t) {
  const tick = Math.floor(t / CHURN_PERIOD);
  const s = Math.sin((seed + tick * 17) * 12.9898 + (seed + tick) * 78.233) * 43758.5453;
  const f = s - Math.floor(s);
  return CRYPTIC_CHARS[Math.floor(f * CRYPTIC_CHARS.length)];
}

// Renders `text` with per-char dissolve into matrix rain.
// k: 0 = whole text intact; 1 = fully crumbled.
// stagger: extra per-char delay in k-units (0..1) so chars cascade left→right.
// fallPx: max vertical fall distance.
function disintegrateChars(text, k, t, opts = {}) {
  const stagger = opts.stagger ?? 0.012;
  const fallSpread = opts.fallSpread ?? 0.55;
  const fallPx = opts.fallPx ?? 220;
  const baseColor = opts.baseColor;
  return text.split('').map((ch, ci) => {
    if (ch === ' ') return <span key={ci}> </span>;
    const charK = Math.max(0, Math.min(1, (k - ci * stagger) / fallSpread));
    if (charK <= 0) return <span key={ci} style={baseColor ? { color: baseColor } : undefined}>{ch}</span>;
    const fallY = charK * (fallPx + (ci % 5) * 30);
    const op = 1 - charK;
    const glyph = charK > 0.05
      ? CRYPTIC_CHARS[Math.floor(t * 18 + ci * 7) % CRYPTIC_CHARS.length]
      : ch;
    return (
      <span key={ci} style={{
        display: 'inline-block',
        transform: `translateY(${fallY}px)`,
        opacity: op,
        color: charK > 0.1 ? 'rgba(255, 180, 80, 0.9)' : baseColor,
      }}>{glyph}</span>
    );
  });
}

const WALLET_PLACEHOLDER = 'ox4A7F';
const PLAYER_PLACEHOLDER = 'Captain';

function TranslationSequence({ halRef, triggered }) {
  const [now, setNow] = React.useState(0);
  const [, setClickTick] = React.useState(0);
  const startRef = React.useRef(0);
  // Click-time refs (seconds-after-trigger). Null = not yet clicked.
  const meClickRef = React.useRef(null);
  const consentClickRef = React.useRef(null);
  const refuseClickRef = React.useRef(null);
  const consent2ClickRef = React.useRef(null); // consent after refuse
  const proceedClickRef = React.useRef(null);
  // Card1 size measurement (so the rain cutout matches the actual card).
  const card1Ref = React.useRef(null);
  const [card1Dims, setCard1Dims] = React.useState({ w: 620, h: 240 });
  React.useLayoutEffect(() => {
    if (!card1Ref.current) return;
    const r = card1Ref.current.getBoundingClientRect();
    // The card lives inside a stage that may be CSS-scaled to fit the
    // viewport — convert back to stage-space pixels.
    const stage = card1Ref.current.closest('[data-screen-label]') || document.body;
    const sr = stage.getBoundingClientRect();
    const sx = sr.width / STAGE_W;
    const sy = sr.height / STAGE_H;
    const w = sx > 0 ? r.width / sx : r.width;
    const h = sy > 0 ? r.height / sy : r.height;
    if (Math.abs(w - card1Dims.w) > 4 || Math.abs(h - card1Dims.h) > 4) {
      setCard1Dims({ w, h });
    }
  });
  // Cache eye position at trigger so layout positions stably
  const eyePosRef = React.useRef({ cx: STAGE_W / 2, cy: STAGE_H / 2, r: 130 });

  // Hover state for the rain-rendered PROCEED button (so we can re-render
  // the button overlay with hit-testing while the rain canvas reads
  // halRef.current.proceedHover for visuals each frame).
  const [proceedHover, setProceedHover] = React.useState(false);

  // Helper: register a click → record time (relative to triggered start),
  // push pulse(s) into halRef so the eye reacts, force re-render.
  const registerClick = (ref, pulseTimes /* array of seconds-after-now */) => {
    if (ref.current != null) return;
    const t = (performance.now() - startRef.current) / 1000;
    ref.current = t;
    halRef.current.dynamicPulses = halRef.current.dynamicPulses || [];
    for (const dt of pulseTimes) {
      halRef.current.dynamicPulses.push(t + dt);
    }
    setClickTick(x => x + 1);
  };

  React.useEffect(() => {
    if (!triggered) return;
    startRef.current = performance.now();
    if (halRef.current) {
      eyePosRef.current = {
        cx: halRef.current.eyeCx_stage,
        cy: halRef.current.eyeCy_stage,
        r: halRef.current.eyeR_stage,
      };
    }
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      setNow((performance.now() - startRef.current) / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [triggered]);

  if (!triggered) return null;

  const t = now;

  // ── Phase timing constants ────────────────────────────────────────────
  // The card waits for the rain cutout cycle:
  //   2.3s  first wave starts → cells freeze as wave sweeps over them
  //   ~3.8s last frozen cells settle → 1.5s hold begins
  //   ~5.3s frozen pocket starts falling apart (1.5s)
  //   ~6.8s pocket fully empty → 1.0s empty hold
  //   ~7.8s card appears
  const T_CARD_APPEAR     = 7.8;
  const T_CARD_TURNON_END = 8.4;
  const T_CARD_WRITE_END  = 10.4;
  const T_BAR_APPEAR      = 10.5;
  const T_BAR_LABEL_DONE  = 11.8;
  const T_FILL_END        = 15.8;
  const T_TRANSLATE_BAR_END = 17.1;
  const T_DOCK_START      = 17.3;
  const T_DOCK_END        = 18.3;
  // Bar disintegrates into matrix rain after the first card line
  // ("SIGNAL ACQUIRED. DECRYPTING IDENT…") fully translates (~20.1s).
  const T_BAR_DISSOLVE_START = 20.1;
  const T_BAR_DISSOLVE_END   = 21.1;

  // Per-character timing for typing-out
  const CARD_CHAR_PERIOD  = 0.025;   // s/char while writing card
  const CARD_LINE_STAGGER = 0.55;    // s between line starts
  const BAR_CHAR_PERIOD   = 0.042;   // s/char while typing bar label
  const BAR_FLIP_DUR      = 0.30;    // churn time per char during translate
  // Card translation: 3× slower than before (was 0.018 / 0.35)
  const CARD_FLIP_PERIOD  = 0.054;   // s between starting each char's translate
  const CARD_FLIP_DUR     = 1.05;

  // ── Card-area rain cutout ──────────────────────────────────────────────
  // Wave-driven freeze: cells freeze white when the first wave (2.3s)
  // reaches them. Then a 1.5s hold, then a 1.5s falling-apart, then the
  // pocket sits empty until the card materializes.
  const meT_early = meClickRef.current;
  const consT_early = consentClickRef.current;
  const cons2T_early = consent2ClickRef.current;
  const proceedT_early = proceedClickRef.current;
  // Cutout is inset from the card's measured footprint so the frozen
  // white block hugs the actual text content rather than the full card
  // chrome (the card has ~26px vertical / ~38px horizontal padding).
  // Negative X inset → cutout extends 5 rain cols (70px) past the card on each side.
  const CUTOUT_INSET_X = -10;
  const CUTOUT_INSET_Y = 40;
  const CUTOUT_W = Math.max(80, card1Dims.w - CUTOUT_INSET_X * 2);
  const CUTOUT_H = Math.max(60, card1Dims.h - CUTOUT_INSET_Y * 2);
  // Card is anchored at (cardX, cardY) with translate(-50%, 0) — cardY = top.
  const _cardX = STAGE_W / 2;
  const _cardY = STAGE_H / 2 + 140;
  const cutoutX = _cardX - CUTOUT_W / 2;
  // Shift the cutout up by 2 rain rows (FS=14 → 28px) so the frozen
  // rectangle reads higher in the horizontal rain band.
  const cutoutY = _cardY + CUTOUT_INSET_Y - 28;
  // Timing (relative to triggerStart):
  //   2.3s   wave begins; cells freeze as it sweeps over them
  //   ~3.8s  freeze front has fully covered the cutout
  //   3.8 + 1.5 = 5.3s  fall begins
  //   5.3 + 1.5 = 6.8s  pocket fully empty
  //   6.8 + 1.0 = 7.8s  card appears (1s empty hold)
  const T_CUTOUT_FREEZE = 2.3;
  const T_CUTOUT_FALL   = 5.3;
  const T_CUTOUT_CLEAR  = 6.8;
  // Cutout release: pocket reopens as soon as the player commits to a path
  // (consent / consent-after-refuse). After release, rain fills the cell
  // grid normally so subsequent waves (proceed click) don't expose the
  // empty rectangle as a dark hole.
  let cutoutRelease = Infinity;
  if (consT_early != null) {
    cutoutRelease = consT_early + 1.0;
  } else if (cons2T_early != null) {
    cutoutRelease = cons2T_early + 1.0;
  }
  if (proceedT_early != null) {
    cutoutRelease = Math.min(cutoutRelease, proceedT_early);
  }
  if (halRef && halRef.current) {
    halRef.current.cardCutout = {
      x: cutoutX, y: cutoutY, w: CUTOUT_W, h: CUTOUT_H,
      tNow: t,
      tFreeze: T_CUTOUT_FREEZE,
      tFall: T_CUTOUT_FALL,
      tClear: T_CUTOUT_CLEAR,
      tRelease: cutoutRelease,
    };
  }

  if (t < T_CARD_APPEAR) {
    return null;
  }

  const { cx, cy, r } = eyePosRef.current;

  // ── Click-driven phase clocks (relative to meClick) ────────────────────
  // Click moments
  const meT = meClickRef.current;        // null or seconds-after-trigger
  const consT = consentClickRef.current;
  const refT = refuseClickRef.current;
  const cons2T = consent2ClickRef.current;
  const proceedT = proceedClickRef.current;

  // Card1 dissolve: triggered by Me click. Wave reaches card ~0.55s after
  // the click; chars start falling immediately on click and accelerate
  // when wave passes.
  const CARD1_DISSOLVE_DUR = 1.1;
  const card1DissolveK = (meT == null) ? 0
    : Math.max(0, Math.min(1, (t - meT) / CARD1_DISSOLVE_DUR));
  const card1Gone = card1DissolveK >= 1;

  // Card2 timing (anchored to meT)
  // Glide-in starts at meT + 1.1s (right after card1 fully dissolved),
  // takes 0.7s to reach final position + 1.5x scale.
  const T_CARD2_START   = meT == null ? Infinity : meT + 1.1;
  const T_CARD2_GLIDE_END = meT == null ? Infinity : meT + 1.8;
  const T_CARD2_WRITE_BEGIN = meT == null ? Infinity : meT + 2.0;
  const card2K = meT == null ? 0
    : Math.max(0, Math.min(1, (t - T_CARD2_START) / 0.7));
  const card2EaseK = card2K * card2K * (3 - 2 * card2K);

  // Card2 dissolve when consent or refuse clicked
  const card2DissolveStart = (consT != null) ? consT + 1.0 : (refT != null ? refT + 0.6 : Infinity);
  const card2DissolveDur = (consT != null) ? 1.2 : 1.0;
  const card2DissolveK = !isFinite(card2DissolveStart) ? 0
    : Math.max(0, Math.min(1, (t - card2DissolveStart) / card2DissolveDur));
  const card2Gone = card2DissolveK >= 1;

  // After Refuse: Card3 (the "BAZAAR INSISTS" card)
  const T_CARD3_START = refT == null ? Infinity : refT + 1.6;
  const card3GlideEnd = T_CARD3_START + 0.7;
  const card3K = refT == null ? 0
    : Math.max(0, Math.min(1, (t - T_CARD3_START) / 0.7));
  const card3EaseK = card3K * card3K * (3 - 2 * card3K);
  // Card3 dissolves when consent2 clicked
  const card3DissolveStart = cons2T == null ? Infinity : cons2T + 1.0;
  const card3DissolveK = !isFinite(card3DissolveStart) ? 0
    : Math.max(0, Math.min(1, (t - card3DissolveStart) / 1.2));
  const card3Gone = card3DissolveK >= 1;

  // Final "Proceed with docking" emerges from rain after consent flow.
  // Time origin: whichever consent click (consT or cons2T) triggered the
  // final flow. After the card disintegrates, ~0.4s later proceed text
  // forms out of rain over 1.4s.
  const finalConsentT = (consT != null && refT == null) ? consT
                      : (cons2T != null) ? cons2T
                      : null;
  // ── Scanning sequence (after consent flow, before PROCEED forms) ──────
  // After card2/card3 dissolves we run a scan animation:
  //   "Scanning"  types out + animated dots, total 3.0s
  //   dissolve 0.6s
  //   "Scan complete" types out + holds, total 1.8s
  //   dissolve 0.6s
  //   then PROCEED forms.
  // Anchor: card-dissolve end (consent click + 1.0 + 1.2 = +2.2s, or
  //   refuse path consent2 click + 2.2s).
  const T_SCAN_ANCHOR = finalConsentT == null ? Infinity
    : (finalConsentT === consT ? consT + 2.2 : cons2T + 2.2);
  const T_SCAN_TYPE_START = T_SCAN_ANCHOR + 0.4;
  const T_SCAN_HOLD_END   = T_SCAN_ANCHOR + 5.0 + 0.4;     // 5s scan + 0.4 lead-in
  const T_SCAN_DISSOLVE_END = T_SCAN_HOLD_END + 0.6;
  const T_DONE_TYPE_START = T_SCAN_DISSOLVE_END + 0.2;
  const T_DONE_HOLD_END   = T_DONE_TYPE_START + 1.8;
  const T_DONE_DISSOLVE_END = T_DONE_HOLD_END + 0.6;
  const T_PROCEED_FORM_START = finalConsentT == null ? Infinity
                             : T_DONE_DISSOLVE_END + 0.2;
  const proceedFormK = finalConsentT == null ? 0
    : Math.max(0, Math.min(1, (t - T_PROCEED_FORM_START) / 1.4));

  // Card geometry (stable during whole sequence)
  // Anchored to stage center, offset 140px below center.
  const cardX = STAGE_W / 2;
  const cardY = STAGE_H / 2 + 140;

  // ── Card render ────────────────────────────────────────────────────────
  // CRT turn-on (0.6s)
  const cardT = t - T_CARD_APPEAR;
  const turnOn = Math.min(1, cardT / (T_CARD_TURNON_END - T_CARD_APPEAR));
  const scaleY = turnOn < 0.3 ? turnOn / 0.3 * 0.008
               : turnOn < 0.6 ? 0.008 + ((turnOn - 0.3) / 0.3) * (1.02 - 0.008)
               : turnOn < 0.8 ? 1.02 - ((turnOn - 0.6) / 0.2) * 0.04
               : 0.98 + ((turnOn - 0.8) / 0.2) * 0.02;
  const scaleX = turnOn < 0.3 ? turnOn / 0.3 : 1;
  const brightness = turnOn < 0.3 ? 3
                   : turnOn < 0.6 ? 2.5 - ((turnOn - 0.3) / 0.3) * 1.2
                   : 1.3 - ((turnOn - 0.6) / 0.4) * 0.3;

  // Card content reveal — only starts after CRT turn-on completes (>= 50% in)
  const contentOp = Math.max(0, Math.min(1, (turnOn - 0.5) / 0.5));

  // ── Card text per-line / per-char state ────────────────────────────────
  // For each character: determine its current visual state given t.
  //  - before write-on time:   hidden (op=0)
  //  - during write-on:        last written char churns briefly
  //  - after write-on, before translate: stable cryptic glyph
  //  - during translate (post T_DOCK_START): churn then lock to real letter
  function renderCardLine(line, lineIdx, dissolveK = 0) {
    const lineStart = T_CARD_TURNON_END + lineIdx * CARD_LINE_STAGGER;
    const chars = line.split('');
    return (
      <div key={lineIdx} style={{
        fontFamily: '"Frontier Disket Mono", ui-monospace, monospace',
        fontSize: '1rem',
        color: 'rgba(255, 180, 80, 0.95)',
        letterSpacing: '0.06em',
        textShadow: '0 0 6px rgba(255, 144, 48, 0.45)',
        whiteSpace: 'pre',
        minHeight: '1.4em',
      }}>
        {chars.map((ch, ci) => {
          // ── Dissolve override ──
          // When dissolving, each char falls + goes cryptic. Stagger by
          // global position (line + char) so dissolve cascades top-to-bottom
          // and left-to-right.
          if (dissolveK > 0) {
            const globalIdx = lineIdx * 30 + ci;
            const charK = Math.max(0, Math.min(1, (dissolveK - globalIdx * 0.008) / 0.6));
            if (charK > 0) {
              if (ch === ' ') return <span key={ci}> </span>;
              const fallY = charK * (180 + (ci % 4) * 40);
              const glyph = CRYPTIC_CHARS[Math.floor(t * 22 + ci * 9 + lineIdx * 3) % CRYPTIC_CHARS.length];
              return (
                <span key={ci} style={{
                  display: 'inline-block',
                  transform: `translateY(${fallY}px)`,
                  opacity: 1 - charK,
                  color: 'rgba(255, 180, 80, 0.95)',
                }}>{glyph}</span>
              );
            }
          }
          const writeT = lineStart + ci * CARD_CHAR_PERIOD;
          const writeAge = t - writeT;
          if (writeAge < 0) {
            return <span key={ci} style={{ opacity: 0 }}>{ch}</span>;
          }
          // Once the dock/translate phase begins, this character may also be
          // translating from cryptic → real.
          // Stagger translations across all chars on this line.
          const translateStartT = T_DOCK_START + lineIdx * 0.15 + ci * CARD_FLIP_PERIOD;
          const translateAge = t - translateStartT;
          // Spaces always render real (no churn needed)
          if (ch === ' ') return <span key={ci}> </span>;
          if (translateAge >= CARD_FLIP_DUR) {
            // locked → real letter, slightly amber on completion
            return <span key={ci}>{ch}</span>;
          }
          if (translateAge >= 0 && translateAge < CARD_FLIP_DUR) {
            // churning during translation — slower churn rate so the
            // translating glyphs are perceptually distinct as they scroll
            const churnIdx = Math.floor(translateAge * 14 + ci * 7) % CRYPTIC_CHARS.length;
            return (
              <span key={ci} style={{
                color: 'rgba(255, 220, 130, 1)',
                textShadow: '0 0 8px rgba(255, 200, 80, 0.85)',
              }}>{CRYPTIC_CHARS[churnIdx]}</span>
            );
          }
          // Not yet translating — show cryptic.
          // While being freshly written (writeAge < 0.18), churn briefly so
          // the typing reads as a "static cryptic glyph rolling in".
          if (writeAge < 0.18) {
            const churnIdx = Math.floor(writeAge * 60 + ci * 13) % CRYPTIC_CHARS.length;
            return (
              <span key={ci} style={{
                color: 'rgba(255, 200, 110, 0.95)',
              }}>{CRYPTIC_CHARS[churnIdx]}</span>
            );
          }
          // Locked-in cryptic glyph (churns over time)
          return (
            <span key={ci}>{churnCryptic(lineIdx * 1000 + ci, t)}</span>
          );
        })}
      </div>
    );
  }

  const cardEl = card1Gone ? null : (
    <div ref={card1Ref} style={{
      position: 'absolute',
      left: cardX, top: cardY,
      transform: `translate(-50%, 0) scaleX(${scaleX}) scaleY(${scaleY}) translateY(${card1DissolveK * 60}px)`,
      transformOrigin: 'center center',
      filter: `brightness(${Math.max(1, brightness)})`,
      background: 'rgba(5, 5, 5, 0.92)',
      border: '1px solid rgba(204, 112, 0, 0.45)',
      borderRadius: 6,
      boxShadow: '0 0 30px rgba(204, 112, 0, 0.18), inset 0 0 20px rgba(0, 0, 0, 0.5)',
      padding: '1.6rem 2.4rem',
      minWidth: 560,
      opacity: Math.min(1, turnOn * 1.6) * (1 - card1DissolveK * card1DissolveK),
      zIndex: 28,
      pointerEvents: 'none',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        opacity: contentOp,
      }}>
        {TRANSLATION_LINES.map((line, idx) => renderCardLine(line, idx, card1DissolveK))}
        {(() => {
          // Answer prompt: appears after the bar has fully disintegrated.
          const T_ANSWER_APPEAR = T_BAR_DISSOLVE_END + 0.2;
          const ageA = t - T_ANSWER_APPEAR;
          if (ageA < 0) return null;
          const fadeIn = Math.min(1, ageA / 0.5);
          const showCursor = (Math.floor(t * 2) % 2) === 0;
          // Placeholder Eve Frontier wallet address. Truncated middle for
          // a clean 0xABCD…WXYZ readout.
          const wallet = WALLET_PLACEHOLDER;
          const meClicked = meClickRef.current != null;
          // After Me click, fall + fade the button along with the rest of card1.
          const btnFall = card1DissolveK * 200;
          const btnOp = 1 - card1DissolveK;
          return (
            <div style={{
              marginTop: 6,
              opacity: fadeIn * btnOp,
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              transform: `translateX(${(1 - fadeIn) * -8}px) translateY(${btnFall}px)`,
            }}>
              <span style={{
                color: 'rgba(255, 220, 130, 0.55)',
                userSelect: 'none',
              }}>›</span>
              {/*
                "Me." button — appears after the Translation Protocol completes.
                This button shows the text "Me." followed by the user's wallet
                address. The wallet portion is a dynamic field (placeholder
                shown here for the animation).
              */}
              <button
                type="button"
                onClick={() => registerClick(meClickRef, [0])}
                disabled={meClicked}
                style={{
                  pointerEvents: 'auto',
                  background: 'rgba(204, 112, 0, 0.08)',
                  border: '1px solid rgba(204, 112, 0, 0.55)',
                  borderRadius: 3,
                  color: 'rgba(255, 220, 150, 0.95)',
                  font: 'inherit',
                  letterSpacing: '0.04em',
                  padding: '6px 14px',
                  cursor: meClicked ? 'default' : 'pointer',
                  textShadow: '0 0 8px rgba(255, 180, 80, 0.5)',
                  boxShadow: '0 0 14px rgba(204, 112, 0, 0.18), inset 0 0 12px rgba(204, 112, 0, 0.08)',
                  transition: 'background 0.15s, box-shadow 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(204, 112, 0, 0.18)';
                  e.currentTarget.style.borderColor = 'rgba(255, 180, 80, 0.85)';
                  e.currentTarget.style.boxShadow = '0 0 22px rgba(255, 180, 80, 0.35), inset 0 0 14px rgba(255, 180, 80, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(204, 112, 0, 0.08)';
                  e.currentTarget.style.borderColor = 'rgba(204, 112, 0, 0.55)';
                  e.currentTarget.style.boxShadow = '0 0 14px rgba(204, 112, 0, 0.18), inset 0 0 12px rgba(204, 112, 0, 0.08)';
                }}
              >
                <span style={{ color: 'rgba(255, 235, 180, 1)' }}>Me.</span>
                <span style={{
                  marginLeft: 10,
                  color: 'rgba(255, 200, 110, 0.85)',
                  fontFeatureSettings: '"tnum"',
                  letterSpacing: '0.06em',
                }}>{wallet}</span>
                <span style={{
                  marginLeft: 8,
                  opacity: showCursor ? 1 : 0,
                  color: 'rgba(255, 220, 150, 0.9)',
                }}>▎</span>
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );

  // ── Bar render (only after card fully written) ─────────────────────────
  let barEl = null;
  if (t >= T_BAR_APPEAR && t < T_BAR_DISSOLVE_END) {
    // Final resting position: just below the card (not bottom-left dock).
    // The bar slides down a bit, then disintegrates into matrix rain.
    const startX = cardX;
    const startY = cardY + 30; // overlap top of card initially
    const endX = cardX;
    const endY = cardY + 230;  // sit below the card body
    let dockK = 0;
    if (t >= T_DOCK_START) {
      dockK = Math.min(1, (t - T_DOCK_START) / (T_DOCK_END - T_DOCK_START));
      dockK = dockK * dockK * (3 - 2 * dockK);
    }
    const posX = startX + (endX - startX) * dockK;
    const posY = startY + (endY - startY) * dockK;
    // Keep bar at full size at its resting position (no shrink-to-chip).
    const barW = 400;
    const barH = 3;
    const labelSize = 1.35;

    // Bar appear fade
    const appearOp = Math.min(1, (t - T_BAR_APPEAR) / 0.35);
    // During dissolve, fade out the entire bar container (background + fill).
    let dissolveOp = 1;
    if (t >= T_BAR_DISSOLVE_START) {
      const dk = Math.min(1, (t - T_BAR_DISSOLVE_START) / (T_BAR_DISSOLVE_END - T_BAR_DISSOLVE_START));
      // Container fades a bit later than the letters so glyphs are still
      // visible when they fall out.
      dissolveOp = 1 - Math.max(0, (dk - 0.25) / 0.75);
    }

    // Fill progress: starts only after label fully typed
    let fillPct = 0;
    if (t >= T_BAR_LABEL_DONE) {
      const k = (t - T_BAR_LABEL_DONE) / (T_FILL_END - T_BAR_LABEL_DONE);
      const c = Math.max(0, Math.min(1, k));
      fillPct = c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
    }

    // Bar label rendering — three sub-phases:
    //   1) typing out (cryptic char per slot) until T_BAR_LABEL_DONE
    //   2) cryptic stable until T_FILL_END
    //   3) translate cryptic → readable success text (T_FILL_END → T_TRANSLATE_BAR_END)
    //   4) hold readable
    function renderBarLabel() {
      const targetTextNow = (t >= T_FILL_END) ? BAR_LABEL_SUCCESS : BAR_LABEL_CRYPTIC;
      const chars = targetTextNow.split('');
      return chars.map((ch, ci) => {
        // typing-out window for this char (during initial cryptic-write)
        const writeT = T_BAR_APPEAR + 0.35 + ci * BAR_CHAR_PERIOD;
        const writeAge = t - writeT;
        if (writeAge < 0) {
          return <span key={ci} style={{ opacity: 0 }}>{ch}</span>;
        }
        // Translation phase: per-char from cryptic → readable
        const translateStartT = T_FILL_END + ci * (BAR_CHAR_PERIOD * 0.9);
        const translateAge = t - translateStartT;
        if (ch === ' ') return <span key={ci}> </span>;

        if (translateAge >= BAR_FLIP_DUR) {
          return <span key={ci}>{ch}</span>;
        }
        if (translateAge >= 0 && translateAge < BAR_FLIP_DUR) {
          const churnIdx = Math.floor(translateAge * 38 + ci * 11) % CRYPTIC_CHARS.length;
          return (
            <span key={ci} style={{
              color: 'rgba(255, 220, 130, 1)',
              textShadow: '0 0 9px rgba(255, 200, 80, 0.9)',
            }}>{CRYPTIC_CHARS[churnIdx]}</span>
          );
        }
        // Pre-translation: show cryptic
        if (writeAge < 0.18) {
          const churnIdx = Math.floor(writeAge * 60 + ci * 13) % CRYPTIC_CHARS.length;
          return <span key={ci}>{CRYPTIC_CHARS[churnIdx]}</span>;
        }
        // Stable cryptic — churns over time (re-rolls per CHURN_PERIOD)
        return <span key={ci}>{churnCryptic(99000 + ci, t)}</span>;
      });
    }

    // Success glow pulse during the readable-label hold
    const successPulse = (t >= T_TRANSLATE_BAR_END && t < T_DOCK_START)
      ? Math.sin((t - T_TRANSLATE_BAR_END) / (T_DOCK_START - T_TRANSLATE_BAR_END) * Math.PI)
      : 0;
    const labelGlow = `0 0 ${6 + successPulse * 12}px rgba(255, ${144 + successPulse * 36}, 48, ${0.4 + successPulse * 0.45})`;

    barEl = (
      <div style={{
        position: 'absolute',
        left: posX, top: posY,
        transform: 'translate(-50%, -50%)',
        opacity: appearOp * dissolveOp,
        zIndex: 30,
        pointerEvents: 'none',
      }}>
        <div style={{
          // Black box wrapper, matching the card's CRT terminal styling.
          // Padding shrinks during dock so the docked element reads as a small chip.
          background: 'rgba(5, 5, 5, 0.95)',
          border: '1px solid rgba(204, 112, 0, 0.55)',
          borderRadius: 6,
          boxShadow: '0 0 36px rgba(204, 112, 0, 0.28), 0 8px 24px rgba(0,0,0,0.6), inset 0 0 24px rgba(0, 0, 0, 0.55)',
          padding: `${2.0 - dockK * 1.5}rem ${2.0 - dockK * 1.2}rem`,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 18 - dockK * 12,
        }}>
          <div style={{
            fontFamily: '"Frontier Disket Mono", ui-monospace, monospace',
            fontWeight: 700,
            color: 'rgba(255, 180, 80, 0.95)',
            letterSpacing: '0.14em',
            textShadow: labelGlow,
            fontSize: labelSize + 'rem',
            whiteSpace: 'nowrap',
          }}>{(() => {
            // During disintegration, replace label rendering with per-char
            // falling/cryptic glyphs.
            if (t >= T_BAR_DISSOLVE_START) {
              const dk = Math.min(1, (t - T_BAR_DISSOLVE_START) / (T_BAR_DISSOLVE_END - T_BAR_DISSOLVE_START));
              const text = BAR_LABEL_SUCCESS;
              return text.split('').map((ch, ci) => {
                // Stagger per-char dissolve so the label crumbles left-to-right
                const charK = Math.max(0, Math.min(1, (dk - ci * 0.012) / 0.55));
                if (ch === ' ') return <span key={ci}> </span>;
                const fallY = charK * (180 + (ci % 5) * 30);
                const op = 1 - charK;
                // Once char starts falling, swap it for a cryptic glyph that
                // re-rolls each frame so it reads as "becoming rain".
                const glyph = charK > 0.05
                  ? CRYPTIC_CHARS[Math.floor(t * 18 + ci * 7) % CRYPTIC_CHARS.length]
                  : ch;
                return (
                  <span key={ci} style={{
                    display: 'inline-block',
                    transform: `translateY(${fallY}px)`,
                    opacity: op,
                    color: charK > 0.1 ? 'rgba(255, 180, 80, 0.9)' : undefined,
                  }}>{glyph}</span>
                );
              });
            }
            return renderBarLabel();
          })()}</div>
          <div style={{
            width: barW, height: barH,
            background: 'rgba(255, 144, 48, 0.12)',
            borderRadius: 1,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${fillPct * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #ff9030, #d27828)',
              boxShadow: '0 0 8px rgba(255, 144, 48, 0.6)',
              transition: 'width 0.05s linear',
            }}/>
          </div>
        </div>
      </div>
    );
  }

  // ── Card 2: Consent prompt (after Me clicked) ──────────────────────────
  let card2El = null;
  if (meT != null && t >= T_CARD2_START && !card2Gone) {
    // Glide-in: subtle scale-up + slide up from below. Sized like card1
    // (slightly larger), positioned BELOW the eye, not center-screen.
    const k = card2EaseK; // 0..1 glide
    const finalScale = 1.05;
    const scaleNow = 0.85 + k * (finalScale - 0.85);
    const yOffset = (1 - k) * 60;
    const opIn = Math.min(1, k * 1.3);

    // Dissolve (consent or refuse clicked)
    const dk = card2DissolveK;
    const fallShift = dk * 60;
    const opOut = 1 - dk * dk;

    // Wallet display - longer placeholder for a more "real" feel
    const walletDisplay = '0xABCD…F09E';

    const consentClicked = consT != null;
    const refuseClicked  = refT != null;
    const anyClicked = consentClicked || refuseClicked;

    // Per-char write-on
    const CARD2_LINE_STAGGER = 0.55;
    const CARD2_CHAR_PERIOD = 0.022;

    // Card2 header lines.
    //  - Line 1 ("> {walletDisplay}"): the title of this field is a DYNAMIC
    //    field displaying the user's wallet address.
    //  - Line 2 ("consent to scan"): if the user presses Consent below,
    //    they get registered as a "Stranger" role to the Bazaar.
    const lineSpecs = [
      { text: `> ${walletDisplay}`,        bold: true,  size: '1.3rem' },
      { text: 'consent to scan',           bold: false, size: '0.95rem', indent: 18 },
    ];

    function renderC2Line(spec, lineIdx) {
      const { text, bold, size, indent = 0 } = spec;
      const lineStart = T_CARD2_WRITE_BEGIN + lineIdx * CARD2_LINE_STAGGER;
      const chars = text.split('');
      return (
        <div key={lineIdx} style={{
          fontFamily: '"Frontier Disket Mono", ui-monospace, monospace',
          fontSize: size,
          fontWeight: bold ? 700 : 400,
          color: 'rgba(255, 180, 80, 0.95)',
          letterSpacing: bold ? '0.08em' : '0.05em',
          textShadow: bold
            ? '0 0 9px rgba(255, 144, 48, 0.6)'
            : '0 0 6px rgba(255, 144, 48, 0.4)',
          whiteSpace: 'pre',
          minHeight: '1.4em',
          paddingLeft: indent,
        }}>
          {chars.map((ch, ci) => {
            // Dissolve override
            if (dk > 0) {
              const globalIdx = lineIdx * 30 + ci;
              const charK = Math.max(0, Math.min(1, (dk - globalIdx * 0.006) / 0.7));
              if (charK > 0) {
                if (ch === ' ') return <span key={ci}> </span>;
                const fallY = charK * (220 + (ci % 4) * 40);
                const glyph = CRYPTIC_CHARS[Math.floor(t * 22 + ci * 9 + lineIdx * 3) % CRYPTIC_CHARS.length];
                return (
                  <span key={ci} style={{
                    display: 'inline-block',
                    transform: `translateY(${fallY}px) rotate(${(charK * 30 * (ci % 2 ? 1 : -1)).toFixed(1)}deg)`,
                    opacity: 1 - charK,
                  }}>{glyph}</span>
                );
              }
            }

            const writeT = lineStart + ci * CARD2_CHAR_PERIOD;
            const writeAge = t - writeT;
            if (writeAge < 0) return <span key={ci} style={{ opacity: 0 }}>{ch}</span>;
            if (ch === ' ') return <span key={ci}> </span>;
            if (writeAge < 0.18) {
              const churnIdx = Math.floor(writeAge * 60 + ci * 13) % CRYPTIC_CHARS.length;
              return (
                <span key={ci} style={{ color: 'rgba(255, 200, 110, 0.95)' }}>
                  {CRYPTIC_CHARS[churnIdx]}
                </span>
              );
            }
            return <span key={ci}>{ch}</span>;
          })}
        </div>
      );
    }

    // Buttons appear after both lines have written out.
    const T_C2_BUTTONS = T_CARD2_WRITE_BEGIN + lineSpecs.length * CARD2_LINE_STAGGER + 0.2;
    const buttonsAge = t - T_C2_BUTTONS;
    const buttonsOp = Math.max(0, Math.min(1, buttonsAge / 0.5));
    const buttonsFall = dk * 200;
    const buttonsFadeOut = 1 - dk;

    card2El = (
      <div style={{
        position: 'absolute',
        left: cardX, top: cardY,
        transform: `translate(-50%, ${yOffset}px) scale(${scaleNow}) translateY(${fallShift}px)`,
        transformOrigin: 'center top',
        background: 'rgba(5, 5, 5, 0.92)',
        border: '1px solid rgba(204, 112, 0, 0.55)',
        borderRadius: 6,
        boxShadow: '0 0 36px rgba(204, 112, 0, 0.28), inset 0 0 24px rgba(0, 0, 0, 0.55)',
        padding: '1.4rem 2.2rem',
        minWidth: 480,
        opacity: opIn * opOut,
        zIndex: 28,
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lineSpecs.map((spec, i) => renderC2Line(spec, i))}
          {/* Consent / Refuse buttons — vertical stack, Mass Effect style */}
          <div style={{
            marginTop: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            opacity: buttonsOp * buttonsFadeOut,
            transform: `translateY(${(1 - buttonsOp) * -8 + buttonsFall}px)`,
            alignItems: 'flex-start',
          }}>
            {[
              { label: '› Consent', ref: consentClickRef, primary: true,
                // 3 short pulses spaced 0.18s, starting immediately on click
                onClick: () => registerClick(consentClickRef, [0, 0.18, 0.36]) },
              { label: '› Refuse',  ref: refuseClickRef,  primary: false,
                onClick: () => registerClick(refuseClickRef,  [0]) },
            ].map(({ label, ref, primary, onClick }) => {
              const clicked = ref.current != null;
              const disabled = anyClicked;
              const baseBg = 'transparent';
              const baseBorder = primary ? 'rgba(255, 180, 80, 0.55)' : 'rgba(204, 112, 0, 0.35)';
              return (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  disabled={disabled}
                  style={{
                    pointerEvents: 'auto',
                    background: clicked ? 'rgba(255, 180, 80, 0.18)' : baseBg,
                    border: `1px solid ${clicked ? 'rgba(255, 220, 130, 0.95)' : baseBorder}`,
                    borderRadius: 2,
                    color: primary ? 'rgba(255, 220, 150, 0.95)' : 'rgba(255, 200, 130, 0.78)',
                    font: 'inherit',
                    fontFamily: '"Frontier Disket Mono", ui-monospace, monospace',
                    fontSize: '0.95rem',
                    letterSpacing: '0.05em',
                    padding: '5px 14px',
                    cursor: disabled ? 'default' : 'pointer',
                    textShadow: primary
                      ? '0 0 8px rgba(255, 180, 80, 0.5)'
                      : '0 0 6px rgba(204, 112, 0, 0.35)',
                    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                    textAlign: 'left',
                    minWidth: 180,
                  }}
                  onMouseEnter={(e) => {
                    if (disabled) return;
                    e.currentTarget.style.background = 'rgba(204, 112, 0, 0.18)';
                    e.currentTarget.style.borderColor = 'rgba(255, 200, 110, 0.9)';
                    e.currentTarget.style.color = 'rgba(255, 230, 170, 1)';
                  }}
                  onMouseLeave={(e) => {
                    if (disabled) return;
                    e.currentTarget.style.background = baseBg;
                    e.currentTarget.style.borderColor = baseBorder;
                    e.currentTarget.style.color = primary ? 'rgba(255, 220, 150, 0.95)' : 'rgba(255, 200, 130, 0.78)';
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Card 3: BAZAAR INSISTS (after Refuse clicked) ──────────────────────
  // Compact card, mirrors Card 2's geometry but positioned at bottom-left
  // of the stage (not center). Slightly red-shifted styling for urgency.
  let card3El = null;
  if (refT != null && t >= T_CARD3_START && !card3Gone) {
    const k = card3EaseK;
    const finalScale = 1.0;
    const scaleNow = 0.85 + k * (finalScale - 0.85);
    const yOffset = (1 - k) * 40;
    const opIn = Math.min(1, k * 1.3);

    const dk = card3DissolveK;
    const fallShift = dk * 60;
    const opOut = 1 - dk * dk;

    // Two short, punchy lines — bold headline + normal subtext.
    const lineSpecs = [
      { text: '> Scan nonoptional',  bold: true,  size: '1.1rem' },
      { text: 'To dock this Bazaar, scan is mandatory', bold: false, size: '0.9rem', indent: 16 },
    ];

    const T_C3_WRITE_BEGIN = T_CARD3_START + 0.2;
    const CARD3_LINE_STAGGER = 0.55;
    const CARD3_CHAR_PERIOD = 0.022;

    function renderC3Line(spec, lineIdx) {
      const { text, bold, size, indent = 0 } = spec;
      const lineStart = T_C3_WRITE_BEGIN + lineIdx * CARD3_LINE_STAGGER;
      const chars = text.split('');
      const lineColor = bold ? 'rgba(255, 140, 60, 1)' : 'rgba(255, 170, 90, 0.85)';
      const lineGlow  = bold
        ? '0 0 9px rgba(255, 100, 30, 0.7)'
        : '0 0 6px rgba(255, 120, 40, 0.45)';
      return (
        <div key={lineIdx} style={{
          fontFamily: '"Frontier Disket Mono", ui-monospace, monospace',
          fontSize: size,
          fontWeight: bold ? 700 : 400,
          color: lineColor,
          letterSpacing: bold ? '0.08em' : '0.05em',
          textShadow: lineGlow,
          whiteSpace: 'pre',
          minHeight: '1.4em',
          paddingLeft: indent,
        }}>
          {chars.map((ch, ci) => {
            if (dk > 0) {
              const globalIdx = lineIdx * 30 + ci;
              const charK = Math.max(0, Math.min(1, (dk - globalIdx * 0.006) / 0.7));
              if (charK > 0) {
                if (ch === ' ') return <span key={ci}> </span>;
                const fallY = charK * (220 + (ci % 4) * 40);
                const glyph = CRYPTIC_CHARS[Math.floor(t * 22 + ci * 9 + lineIdx * 3) % CRYPTIC_CHARS.length];
                return (
                  <span key={ci} style={{
                    display: 'inline-block',
                    transform: `translateY(${fallY}px) rotate(${(charK * 30 * (ci % 2 ? 1 : -1)).toFixed(1)}deg)`,
                    opacity: 1 - charK,
                  }}>{glyph}</span>
                );
              }
            }

            const writeT = lineStart + ci * CARD3_CHAR_PERIOD;
            const writeAge = t - writeT;
            if (writeAge < 0) return <span key={ci} style={{ opacity: 0 }}>{ch}</span>;
            if (ch === ' ') return <span key={ci}> </span>;
            if (writeAge < 0.18) {
              const churnIdx = Math.floor(writeAge * 60 + ci * 13) % CRYPTIC_CHARS.length;
              return <span key={ci}>{CRYPTIC_CHARS[churnIdx]}</span>;
            }
            return <span key={ci}>{ch}</span>;
          })}
        </div>
      );
    }

    const T_C3_BUTTON = T_C3_WRITE_BEGIN + lineSpecs.length * CARD3_LINE_STAGGER + 0.2;
    const btnAge = t - T_C3_BUTTON;
    const btnOp = Math.max(0, Math.min(1, btnAge / 0.5));
    const btnFall = dk * 200;
    const btnFadeOut = 1 - dk;
    const consent2Clicked = cons2T != null;

    card3El = (
      <div style={{
        position: 'absolute',
        // Center of the stage, 140px below center (matches Card1/Card2)
        left: STAGE_W / 2, top: STAGE_H / 2 + 140,
        transform: `translate(-50%, 0) translateY(${yOffset}px) scale(${scaleNow}) translateY(${fallShift}px)`,
        transformOrigin: 'center top',
        background: 'rgba(8, 4, 2, 0.94)',
        border: '1px solid rgba(255, 100, 40, 0.55)',
        borderRadius: 6,
        boxShadow: '0 0 36px rgba(255, 100, 40, 0.28), inset 0 0 24px rgba(0, 0, 0, 0.6)',
        padding: '1.2rem 1.8rem',
        minWidth: 380,
        opacity: opIn * opOut,
        zIndex: 28,
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lineSpecs.map((spec, i) => renderC3Line(spec, i))}
          <div style={{
            marginTop: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            opacity: btnOp * btnFadeOut,
            transform: `translateY(${(1 - btnOp) * -8 + btnFall}px)`,
            alignItems: 'flex-start',
          }}>
            <button
              type="button"
              onClick={() => registerClick(consent2ClickRef, [0, 0.18, 0.36])}
              disabled={consent2Clicked}
              style={{
                pointerEvents: 'auto',
                background: consent2Clicked ? 'rgba(255, 180, 80, 0.18)' : 'transparent',
                border: `1px solid ${consent2Clicked ? 'rgba(255, 220, 130, 0.95)' : 'rgba(255, 140, 60, 0.55)'}`,
                borderRadius: 2,
                color: 'rgba(255, 200, 130, 0.95)',
                font: 'inherit',
                fontFamily: '"Frontier Disket Mono", ui-monospace, monospace',
                fontSize: '0.95rem',
                letterSpacing: '0.05em',
                padding: '5px 14px',
                cursor: consent2Clicked ? 'default' : 'pointer',
                textShadow: '0 0 8px rgba(255, 140, 60, 0.5)',
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                textAlign: 'left',
                minWidth: 160,
              }}
              onMouseEnter={(e) => {
                if (consent2Clicked) return;
                e.currentTarget.style.background = 'rgba(255, 140, 60, 0.18)';
                e.currentTarget.style.borderColor = 'rgba(255, 200, 110, 0.95)';
                e.currentTarget.style.color = 'rgba(255, 230, 170, 1)';
              }}
              onMouseLeave={(e) => {
                if (consent2Clicked) return;
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(255, 140, 60, 0.55)';
                e.currentTarget.style.color = 'rgba(255, 200, 130, 0.95)';
              }}
            >› Accept</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Scanning sequence renderer ─────────────────────────────────────────
  // "Scanning..." (typed letter-by-letter, animated dots) → dissolve →
  // "Scan complete" → dissolve → PROCEED forms (separately).
  // Renders the same way PROCEED does: rasterizes text into rain cells
  // and the rain canvas fills those cells with white-tinted glyphs.
  const SCAN_FONT_PX = 96;
  const SCAN_LETTER_SP = 8;
  const scanCenterX = STAGE_W / 2;
  // Position scan text where the big PROCEED ends up (slightly above so
  // the user sees it before we transition).
  const scanCenterY = STAGE_H / 2 + 140 + 140;
  const SCAN_FS = 14;

  // Pick which phrase + how much of it to render.
  let scanPhrase = '';
  let scanShownLen = 0;
  let scanOpacity = 0;
  if (finalConsentT != null) {
    if (t >= T_SCAN_TYPE_START && t < T_SCAN_DISSOLVE_END) {
      // Type "Scanning" then animate trailing dots.
      const base = 'Scanning';
      const typeDur = 0.9; // 0.11s/char
      const typeAge = t - T_SCAN_TYPE_START;
      const baseShown = Math.max(0, Math.min(base.length, Math.floor((typeAge / typeDur) * base.length)));
      // After typing finishes, cycle dots: 0,1,2,3,2,1...
      let dotPhase = '';
      if (baseShown >= base.length) {
        const dotCycleAge = typeAge - typeDur;
        const dotCount = (Math.floor(dotCycleAge * 3) % 4); // 0..3 dots, ~3Hz
        dotPhase = '.'.repeat(dotCount);
      }
      scanPhrase = base + dotPhase;
      scanShownLen = scanPhrase.length;
      // Opacity: fade in over 0.3s, hold, fade out during dissolve.
      if (t < T_SCAN_HOLD_END) {
        scanOpacity = Math.min(1, (t - T_SCAN_TYPE_START) / 0.3);
      } else {
        const fk = Math.min(1, (t - T_SCAN_HOLD_END) / 0.6);
        scanOpacity = 1 - fk;
      }
    } else if (t >= T_DONE_TYPE_START && t < T_DONE_DISSOLVE_END) {
      // Type "Scan complete"
      const base = 'Scan complete';
      const typeDur = 1.0;
      const typeAge = t - T_DONE_TYPE_START;
      scanShownLen = Math.max(0, Math.min(base.length, Math.floor((typeAge / typeDur) * base.length)));
      scanPhrase = base.slice(0, scanShownLen);
      if (t < T_DONE_HOLD_END) {
        scanOpacity = Math.min(1, (t - T_DONE_TYPE_START) / 0.3);
      } else {
        const fk = Math.min(1, (t - T_DONE_HOLD_END) / 0.6);
        scanOpacity = 1 - fk;
      }
    }
  }

  if (scanPhrase && scanOpacity > 0) {
    // Cache by exact phrase string so each typing step rasterizes once
    const key = `SCAN-${SCAN_FONT_PX}-700-${SCAN_LETTER_SP}-${scanPhrase}`;
    const scanRaster = cachedRasterize(key, () => rasterizeTextToCells(
      [{ text: scanPhrase, fontPx: SCAN_FONT_PX, weight: 700, letterSpacing: SCAN_LETTER_SP }],
      { centerXpx: scanCenterX, centerYpx: scanCenterY, FS: SCAN_FS, lineGapPx: 0 }
    ));
    if (halRef.current) {
      halRef.current.scanShape = scanRaster.cells;
      halRef.current.scanOpacity = scanOpacity;
    }
  } else {
    if (halRef.current) {
      halRef.current.scanShape = null;
      halRef.current.scanOpacity = 0;
    }
  }

  // ── Final docking text + PROCEED button ────────────────────────────────
  // After consent flow finishes, two things appear below the eye:
  //  (1) A small black-card-styled text: "Captain" (bold) + "Proceed with Docking" (normal)
  //  (2) A LARGE "PROCEED" rendered as part of the matrix rain — semi-transparent
  //      white text that solidifies on hover and scales up by 2pt.
  let proceedEl = null;
  if (finalConsentT != null && t >= T_PROCEED_FORM_START) {
    const k = proceedFormK;
    // The two header lines "form out of rain" — char-by-char, churning into
    // place. Bold player line + normal "Proceed with Docking" subtitle.
    // Header lines that form out of the rain above the big PROCEED:
    //  - Line 1 (PLAYER_PLACEHOLDER, currently "Captain"): this displays the
    //    actual in-game username, resolved from the user's wallet address.
    //  - Line 2 ("Proceed with Docking"): static prompt copy.
    const headerSpecs = [
      { text: PLAYER_PLACEHOLDER,  bold: true,  size: '1.6rem' },
      { text: 'Proceed with Docking', bold: false, size: '1.05rem' },
    ];

    function renderProceedLine(spec, lineIdx) {
      const { text, bold, size } = spec;
      const chars = text.split('');
      // Stagger across both lines so line-2 chars start forming after line-1
      const lineOffset = lineIdx * 0.25;
      return (
        <div key={lineIdx} style={{
          fontFamily: '"Frontier Disket Mono", ui-monospace, monospace',
          fontSize: size,
          fontWeight: bold ? 700 : 400,
          color: 'rgba(255, 220, 150, 1)',
          letterSpacing: bold ? '0.08em' : '0.05em',
          textShadow: bold
            ? '0 0 11px rgba(255, 180, 80, 0.7)'
            : '0 0 7px rgba(255, 180, 80, 0.5)',
          whiteSpace: 'pre',
          textAlign: 'center',
        }}>
          {chars.map((ch, ci) => {
            const charK = Math.max(0, Math.min(1, (k - lineOffset - ci * 0.012) / 0.55));
            if (charK <= 0.05) return <span key={ci} style={{ opacity: 0 }}>{ch}</span>;
            if (charK < 1) {
              const glyph = CRYPTIC_CHARS[Math.floor(t * 24 + ci * 11 + lineIdx * 7) % CRYPTIC_CHARS.length];
              return (
                <span key={ci} style={{
                  opacity: charK,
                  color: 'rgba(255, 200, 110, 0.95)',
                }}>{ch === ' ' ? ' ' : glyph}</span>
              );
            }
            return <span key={ci}>{ch}</span>;
          })}
        </div>
      );
    }

    // Subtle pulse once fully formed
    const fullyFormed = k >= 1;
    const proceedClicked = proceedT != null;
    const T_PROCEED_BUTTON = T_PROCEED_FORM_START + 1.4 + 0.4;
    const btnAge = t - T_PROCEED_BUTTON;
    const btnOp = Math.max(0, Math.min(1, btnAge / 1.0));

    // Header anchor (small text, DOM) — sits at screen-center +140
    const headerCx = STAGE_W / 2;
    const headerCy = STAGE_H / 2 + 140;
    // Big PROCEED anchor — sits below the header text, rendered AS RAIN.
    // Rasterize PROCEED into cell coords and write to halRef.proceedShape so
    // any rain stream passing through those cells renders white.
    const FS = 14;
    const procCenterX = STAGE_W / 2;
    const procCenterY = headerCy + 140;

    // Static text + position → raster only once via module cache keyed on params.
    const procRaster = fullyFormed
      ? cachedRasterize('PROCEED-144-700-12-v2', () => rasterizeTextToCells(
          [{ text: 'PROCEED', fontPx: 144, weight: 700, letterSpacing: 12 }],
          { centerXpx: procCenterX, centerYpx: procCenterY, FS, lineGapPx: 0 }
        ))
      : { cells: new Set(), bbox: null };

    // Proceed-click dissolve: 2.25s ramp 0→1 starting at click (50% slower).
    const PROCEED_DISSOLVE_DUR = 2.25;
    const dissolveK = proceedT != null
      ? Math.min(1, Math.max(0, (t - proceedT) / PROCEED_DISSOLVE_DUR))
      : 0;
    const dissolveInv = 1 - dissolveK;

    // Publish to rain canvas (cleared in else branch below).
    if (halRef.current) {
      halRef.current.proceedShape = procRaster.cells;
      halRef.current.proceedOpacity = btnOp * dissolveInv;
      halRef.current.proceedHover = proceedHover && !proceedClicked;
      halRef.current.dissolveK = dissolveK;
    }

    // Invisible hit zone over the PROCEED bbox.
    const hitBox = procRaster.bbox && {
      left: procRaster.bbox.minC * FS - 12,
      top:  procRaster.bbox.minR * FS - 8,
      width: (procRaster.bbox.maxC - procRaster.bbox.minC + 1) * FS + 24,
      height:(procRaster.bbox.maxR - procRaster.bbox.minR + 1) * FS + 16,
    };

    proceedEl = (
      <>
        {/* Small header text (DOM) — "Captain" + "Proceed with Docking" */}
        <div style={{
          position: 'absolute',
          left: headerCx, top: headerCy,
          transform: 'translate(-50%, -50%)',
          zIndex: 28,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          opacity: Math.min(1, k * 1.2) * dissolveInv,
        }}>
          {headerSpecs.map((spec, i) => renderProceedLine(spec, i))}
        </div>

        {/* Invisible PROCEED hit zone over the rain-rendered text */}
        {fullyFormed && hitBox && (
          <div
            onMouseEnter={() => setProceedHover(true)}
            onMouseLeave={() => setProceedHover(false)}
            onClick={() => {
              if (proceedClicked) return;
              setProceedHover(false);
              registerClick(proceedClickRef, [0, 0.2, 0.4]);
            }}
            style={{
              position: 'absolute',
              left: hitBox.left, top: hitBox.top,
              width: hitBox.width, height: hitBox.height,
              zIndex: 28,
              cursor: proceedClicked ? 'default' : 'pointer',
              background: 'transparent',
              opacity: btnOp,
            }}
          />
        )}
      </>
    );
  } else {
    // Clear shape so rain canvas stops drawing PROCEED text.
    if (halRef.current) {
      halRef.current.proceedShape = null;
      halRef.current.proceedOpacity = 0;
      halRef.current.proceedHover = false;
    }
  }

  // Black fade-to-black overlay after PROCEED click.
  // Starts ramping ~0.6s after click (gives the dissolve a moment to read),
  // reaches full opacity over 1.4s.
  let fadeEl = null;
  if (proceedT != null) {
    const FADE_DELAY = 0.6;
    const FADE_DUR = 1.4;
    const fk = Math.min(1, Math.max(0, (t - proceedT - FADE_DELAY) / FADE_DUR));
    if (fk > 0) {
      fadeEl = (
        <div style={{
          position: 'absolute',
          left: 0, top: 0,
          width: STAGE_W, height: STAGE_H,
          background: '#000',
          opacity: fk,
          zIndex: 40,
          pointerEvents: 'none',
        }} />
      );
    }
  }

  return (
    <>
      {cardEl}
      {card2El}
      {card3El}
      {proceedEl}
      {barEl}
      {fadeEl}
      <style>{`@keyframes blink-cursor { 50% { opacity: 0; } }`}</style>
    </>
  );
}

function Scene() {
  const { halRef, triggered } = useHal({ enabled: true });
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: BG }}/>
      <MatrixRainGrid streams={RAIN_STREAMS} halRef={halRef} />
      <FileFragments />
      <TranslationSequence halRef={halRef} triggered={triggered} />
      <Overlays />
      <CRTFlicker />
      <FrameChrome />
      <SkipToBazaar />
      <TimeLabel />
    </>
  );
}

function App() {
  return (
    <div data-screen-label="t=0.0s" style={{ position: 'absolute', inset: 0 }}>
      <Stage
        width={STAGE_W}
        height={STAGE_H}
        duration={DURATION}
        background={BG}
        loop={true}
        autoplay={true}
        persistKey="bazaar-anim"
      >
        <Scene />
      </Stage>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
