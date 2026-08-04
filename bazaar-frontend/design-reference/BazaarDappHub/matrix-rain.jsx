// matrix-rain.jsx — Background module for Bazaar Hub.
// Exposes MatrixBackdrop (with idle HAL eye) and FrameChrome on window.

const STAGE_W = 1920;
const STAGE_H = 1080;
const BG = '#080604';
const ORANGE = '#ff9030';

const RAIN_CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*<>{}[]=/\\|~^";

// Tiny internal time hook — returns seconds since mount, ticks via rAF.
// Throttled to ~10fps since this drives only the rare flicker/tear effects;
// running it at 60fps forces the whole React tree to re-render every frame.
function useTime() {
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    let raf, last = 0, t0 = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 100) return;
      last = now;
      setT((now - t0) / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

// ── HAL eye (idle) ─────────────────────────────────────────────────────────
// Simplified version of the animation's eye: lives at a fixed cell position,
// pupil follows the cursor when nearby, idle saccades otherwise. Updates
// halRef.current = { shape, inside, iris, formation, glow } each frame so
// MatrixRainGrid can render eye cells in white over the rain.
function useHal({ centerCellR, centerCellC } = {}) {
  const halRef = React.useRef({
    shape: new Set(), inside: new Set(), iris: new Set(),
    formation: new Map(), glow: 0, formed: false,
  });
  React.useEffect(() => {
    const FS = 14;
    const cols = Math.ceil(STAGE_W / FS);
    const rows = Math.ceil(STAGE_H / FS);
    const ecR = centerCellR ?? Math.round(rows * 0.22);
    const ecC = centerCellC ?? Math.round(cols * 0.5);
    const R = 8.5;                  // eye radius (cells)
    const ringThick = 2.0;
    const PUPIL_R_BASE = 4.0;
    const triggerR_px = R * FS * 4.5;
    const PUPIL_MAX_OFFSET = R - PUPIL_R_BASE - 0.5;

    const mouse = { x: -9999, y: -9999, inside: false };
    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; mouse.inside = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);

    let canvas = null;
    const start = performance.now();
    let pupilDX = 0, pupilDY = 0;
    let targetDX = 0, targetDY = 0;
    let pupilFocus = 1.0;
    let lastSaccade = 0;
    let raf = 0;
    let lastFrame = 0;

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      // Throttle to ~30fps to match rain renderer.
      if (now - lastFrame < 33) return;
      lastFrame = now;
      const t = (now - start) / 1000;

      if (!canvas) canvas = document.querySelector('canvas');
      let stageX = -9999, stageY = -9999;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        stageX = ((mouse.x - rect.left) / rect.width) * STAGE_W;
        stageY = ((mouse.y - rect.top) / rect.height) * STAGE_H;
      }
      const eyeCx = ecC * FS + FS / 2;
      const eyeCy = ecR * FS + FS / 2;
      const dxs = stageX - eyeCx, dys = stageY - eyeCy;
      const distS = Math.sqrt(dxs * dxs + dys * dys);
      mouse.inside = distS <= triggerR_px;

      // Target: track cursor when nearby, otherwise idle saccade every ~2.3s.
      if (mouse.inside) {
        const dirNorm = Math.min(1, distS / triggerR_px);
        const ang = Math.atan2(dys, dxs);
        targetDX = Math.cos(ang) * dirNorm * PUPIL_MAX_OFFSET;
        targetDY = Math.sin(ang) * dirNorm * PUPIL_MAX_OFFSET;
      } else {
        const sac = Math.floor(t / 2.3);
        if (sac !== lastSaccade) {
          lastSaccade = sac;
          const sx = Math.sin(sac * 12.9898) * 43758.5453;
          const sy = Math.sin(sac * 78.233)  * 12345.6789;
          targetDX = ((sx - Math.floor(sx)) - 0.5) * 2 * PUPIL_MAX_OFFSET;
          targetDY = ((sy - Math.floor(sy)) - 0.5) * 2 * PUPIL_MAX_OFFSET;
        }
      }
      pupilDX += (targetDX - pupilDX) * 0.12;
      pupilDY += (targetDY - pupilDY) * 0.12;

      const targetFocus = mouse.inside ? 0.7 : 1.0;
      pupilFocus += (targetFocus - pupilFocus) * 0.15;
      const pupilR = (PUPIL_R_BASE + Math.sin(t * 1.7) * 0.4) * pupilFocus;

      // Gentle hover/breathing
      const ecR_anim = ecR + Math.sin(t * (Math.PI * 2 / 3.4)) * 0.55;
      const Reff = R;

      const shape = new Set();
      const inside = new Set();
      const iris = new Set();
      const rMin = Math.max(0, Math.floor(ecR_anim - Reff - 2));
      const rMax = Math.min(rows - 1, Math.ceil(ecR_anim + Reff + 2));
      const cMin = Math.max(0, Math.floor(ecC - Reff - 2));
      const cMax = Math.min(cols - 1, Math.ceil(ecC + Reff + 2));
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          const dx = (c - ecC) / Reff;
          const dy = (r - ecR_anim) / Reff;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 1.05) continue;
          const key = r * 10000 + c;
          if (d > 1.0 - ringThick / Reff) {
            shape.add(key); inside.add(key); continue;
          }
          inside.add(key);
          const pdx = c - ecC - pupilDX;
          const pdy = r - ecR_anim - pupilDY;
          const pd = Math.sqrt(pdx * pdx + pdy * pdy);
          if (pd <= pupilR) { iris.add(key); shape.add(key); }
          else if (pd <= pupilR + 0.9) shape.add(key);
        }
      }

      // Formation ramp: 0.6s delay, 1.5s ramp
      const FORM_DELAY = 0.6, FORM_RAMP = 1.5;
      const formation = halRef.current.formation;
      for (const key of shape) {
        let cellForm;
        if (t < FORM_DELAY) cellForm = 0;
        else if (t >= FORM_DELAY + FORM_RAMP) cellForm = 1;
        else {
          const seed = Math.sin(key * 0.013 + key * 9.7) * 43758.5453;
          const offset = ((seed - Math.floor(seed))) * (FORM_RAMP * 0.55);
          const localT = (t - FORM_DELAY) - offset;
          if (localT <= 0) cellForm = 0;
          else {
            const k = Math.min(1, localT / (FORM_RAMP - offset));
            cellForm = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          }
        }
        formation.set(key, cellForm);
      }

      halRef.current.shape = shape;
      halRef.current.inside = inside;
      halRef.current.iris = iris;
      halRef.current.glow = 0.5 + 0.5 * Math.sin(t * 1.4) + (mouse.inside ? 0.25 : 0);
      halRef.current.formed = t >= FORM_DELAY + FORM_RAMP;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [centerCellR, centerCellC]);
  return halRef;
}

// Unified rain. Optional halRef → renders eye cells (shape/iris) in white.
function MatrixRainGrid({ streams, halRef }) {
  const ref = React.useRef(null);
  const rafRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const FS = 14;
    canvas.width = STAGE_W;
    canvas.height = STAGE_H;

    const cols = Math.ceil(STAGE_W / FS);
    const rows = Math.ceil(STAGE_H / FS);
    const grid = Array.from({ length: rows * cols }, () => ({ ch: ' ', b: 0 }));
    const cellAt = (r, c) => grid[r * cols + c];

    const streamStates = streams.map(s => {
      const horizontal = s.direction === 'left' || s.direction === 'right';
      const negative = s.direction === 'up' || s.direction === 'left';
      const lengthCells = horizontal ? cols : rows;
      const laneCount = horizontal ? rows : cols;
      return {
        spec: s, horizontal, negative, lengthCells, laneCount,
        lanes: Array.from({ length: laneCount }, () => ({
          pos: negative ? lengthCells + Math.random() * lengthCells : -Math.random() * lengthCells,
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

      for (let i = 0; i < grid.length; i++) {
        const cell = grid[i];
        if (cell.persistUntil && time < cell.persistUntil) continue;
        if (cell.persistUntil && time >= cell.persistUntil) cell.persistUntil = 0;
        if (cell.persist) continue;
        if (cell.b > 0) cell.b *= 0.92;
        if (cell.b < 0.02) { cell.b = 0; cell.ch = ' '; }
      }

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
            const charIdx = ((cellIdx + i * 7) % lane.chars.length + lane.chars.length) % lane.chars.length;
            if (Math.random() < charSwap) lane.chars[charIdx] = RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)];
            let b;
            if (spec.persist) b = j === 0 ? 1.0 : 0.7;
            else if (j === 0) b = 1.0;
            else if (j === 1) b = 0.85;
            else b = Math.max(0.08, 0.7 - j * 0.05);
            const cell = cellAt(r, c);
            const wasPersistent = cell.persist || (cell.persistUntil && time < cell.persistUntil);
            cell.ch = lane.chars[charIdx];
            cell.b = b;
            cell.head = j === 0;
            cell.persist = !!spec.persist;
            if (!spec.persist && wasPersistent) cell.persistUntil = time + 5000;
            else if (spec.persist) cell.persistUntil = 0;
          }
          if (negative ? headIdx < -25 : headIdx > lengthCells + 25) {
            lane.pos = negative ? lengthCells + 15 + Math.random() * 15 : Math.random() * -15;
            lane.speed = (0.3 + Math.random() * 0.7) * (spec.speedScale || 1);
          }
        }
      }

      // Eye state (optional)
      const hal = halRef && halRef.current;
      const halShape = hal ? hal.shape : null;
      const halInside = hal ? hal.inside : null;
      const halIris = hal ? hal.iris : null;
      const halGlow = hal ? hal.glow : 0;
      const formation = hal ? hal.formation : null;

      // render
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      ctx.font = `${FS}px "Frontier Disket Mono", ui-monospace, monospace`;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = grid[r * cols + c];
          const key = r * 10000 + c;
          const isShape = halShape && halShape.has(key);
          const isIris = halIris && halIris.has(key);
          const isInside = halInside && halInside.has(key);

          let cellForm = 1;
          if ((isShape || isIris) && formation) cellForm = formation.get(key) ?? 0;
          const flicker = ((Math.sin((r * 13 + c * 31 + Math.floor(time / 120)) * 0.913) + 1) * 0.5);
          const renderAsEye = flicker < cellForm;

          if (isIris && renderAsEye) {
            const a = 0.9 + 0.1 * halGlow;
            const ch = cell.ch && cell.ch !== ' '
              ? cell.ch
              : RAIN_CHARS[(r * 7 + c * 13) % RAIN_CHARS.length];
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.fillText(ch, c * FS, (r + 1) * FS - 2);
            continue;
          }
          if (isShape && renderAsEye) {
            const a = 0.85 + 0.15 * halGlow;
            const ch = cell.ch && cell.ch !== ' '
              ? cell.ch
              : RAIN_CHARS[(r * 11 + c * 17 + Math.floor(time / 200)) % RAIN_CHARS.length];
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.fillText(ch, c * FS, (r + 1) * FS - 2);
            continue;
          }
          if (cell.b <= 0) continue;
          const b = cell.b;
          let baseR, baseG, baseB, baseA;
          if (cell.head) {
            if (isInside) { baseR = 255; baseG = 180; baseB = 80; baseA = 0.6 * b + 0.2; }
            else { baseR = 255; baseG = 255; baseB = 255; baseA = 0.4 * b + 0.08; }
          } else if (b > 0.7) { baseR = 255; baseG = 180; baseB = 80; baseA = b; }
          else if (b > 0.4) { baseR = 210; baseG = 120; baseB = 40; baseA = b; }
          else { baseR = 140; baseG = 70; baseB = 25; baseA = b; }
          ctx.fillStyle = `rgba(${baseR},${baseG},${baseB},${baseA})`;
          ctx.fillText(cell.ch, c * FS, (r + 1) * FS - 2);
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [streams, halRef]);

  return (
    <canvas ref={ref} style={{
      position: 'absolute', inset: 0, width: STAGE_W, height: STAGE_H,
    }}/>
  );
}

const RAIN_STREAMS = [
  { direction: 'left',  speedScale: 0.6, trail: 14, persist: true },
  { direction: 'right', speedScale: 0.6, trail: 14, persist: true },
  { direction: 'down',  speedScale: 1.0, trail: 18 },
];

function SquareFlicker() {
  const t = useTime();
  const squares = [];
  for (let i = 0; i < 6; i++) {
    const seedT = Math.floor(t * 1.6 + i * 100);
    const r1 = (Math.sin(seedT * 12.9898 + i * 78.233) * 43758.5453) % 1;
    const r2 = (Math.sin(seedT * 39.346 + i * 11.135) * 27183.123) % 1;
    const r3 = (Math.sin(seedT * 91.534 + i * 47.901) * 15731.987) % 1;
    const r4 = (Math.sin(seedT * 73.156 + i * 19.876) * 11119.555) % 1;
    const r5 = (Math.sin(seedT * 54.321 + i * 33.111) * 88887.111) % 1;
    if (Math.abs(r1) < 0.93) continue;
    const w = 14 + Math.floor(Math.abs(r2) * 60);
    const h = 14 + Math.floor(Math.abs(r3) * 28);
    const x = Math.floor(Math.abs(r4) * (STAGE_W - w));
    const y = Math.floor(Math.abs(r5) * (STAGE_H - h));
    const phase = (t * 1.6 + i * 100) - seedT;
    const alpha = phase < 0.15 ? 0.7 + Math.abs(r2) * 0.3 : phase < 0.3 ? 0.4 : 0;
    if (alpha <= 0) continue;
    squares.push({ x, y, w, h, alpha, key: `${seedT}-${i}` });
  }
  return (
    <React.Fragment>
      {squares.map(s => (
        <div key={s.key} style={{
          position: 'absolute', left: s.x, top: s.y, width: s.w, height: s.h,
          background: `rgba(255,170,70,${s.alpha})`,
          mixBlendMode: 'screen', pointerEvents: 'none',
        }}/>
      ))}
    </React.Fragment>
  );
}

function CRTTear() {
  const t = useTime();
  const seed = Math.floor(t * 1.3);
  const r1 = (Math.sin(seed * 91.345) * 13247.123) % 1;
  const r2 = (Math.sin(seed * 27.7) * 0.5 + 0.5);
  const show = Math.abs(r1) > 0.85;
  if (!show) return null;
  const y = Math.floor(r2 * STAGE_H);
  const phase = (t * 1.3) - seed;
  const alpha = phase < 0.08 ? 0.7 : phase < 0.16 ? 0.4 : 0;
  if (alpha <= 0) return null;
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: y, height: 2,
      background: `rgba(255,220,180,${alpha})`,
      mixBlendMode: 'screen', pointerEvents: 'none',
    }}/>
  );
}

function Overlays() {
  return (
    <React.Fragment>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(8,6,4,0.7) 100%)',
      }}/>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 4px)',
      }}/>
    </React.Fragment>
  );
}

function FrameChrome() {
  const corner = (key, style) => (
    <div key={key} style={{
      position: 'absolute', width: 60, height: 60,
      borderColor: ORANGE, borderStyle: 'solid', pointerEvents: 'none', ...style,
    }}/>
  );
  const sideNotch = (key, style) => (
    <div key={key} style={{
      position: 'absolute', width: 18, height: 60,
      borderColor: ORANGE, borderStyle: 'solid', pointerEvents: 'none', ...style,
    }}/>
  );
  return (
    <React.Fragment>
      {corner('tl', { top: 30, left: 30, borderWidth: '2px 0 0 2px' })}
      {corner('tr', { top: 30, right: 30, borderWidth: '2px 2px 0 0' })}
      {corner('bl', { bottom: 30, left: 30, borderWidth: '0 0 2px 2px' })}
      {corner('br', { bottom: 30, right: 30, borderWidth: '0 2px 2px 0' })}
      {sideNotch('sl', { top: '50%', left: 30, transform: 'translateY(-50%)', borderWidth: '2px 0 2px 2px' })}
      {sideNotch('sr', { top: '50%', right: 30, transform: 'translateY(-50%)', borderWidth: '2px 2px 2px 0' })}
    </React.Fragment>
  );
}

// MatrixBackdrop with built-in idle eye.
function MatrixBackdrop() {
  // Eye centered horizontally, near top of stage so hub content sits below.
  const halRef = useHal({ centerCellR: 38, centerCellC: 68 });
  return (
    <React.Fragment>
      <MatrixRainGrid streams={RAIN_STREAMS} halRef={halRef} />
      <SquareFlicker />
      <CRTTear />
      <Overlays />
    </React.Fragment>
  );
}

window.MatrixBackdrop = MatrixBackdrop;
window.MatrixFrameChrome = FrameChrome;
window.STAGE_W = STAGE_W;
window.STAGE_H = STAGE_H;
