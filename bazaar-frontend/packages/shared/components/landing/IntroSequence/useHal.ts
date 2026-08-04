// useHal.ts — The HAL "eye" for the intro cinematic: assembles itself from rain
// glyphs, flies from left → center on first cursor entry, pupil-tracks the
// cursor, and emits shockwave pulses that drive the card-cutout freeze and the
// rain-formed PROCEED text. Ported from design-reference/IntroSequence/scene.jsx.
//
// Time is driven by performance.now() (real elapsed time) — no scrub/playhead —
// so it plays once, exactly as it will in production.

import { useEffect, useRef, useState } from "react";
import { STAGE_W, STAGE_H, type HalRef } from "./introConstants";

function freshHalRef(): HalRef {
  return {
    shape: new Set(), inside: new Set(), iris: new Set(), glow: 0,
    eyeCx_stage: 0, eyeCy_stage: 0, eyeR_stage: 0,
    triggered: false, triggerStart: 0,
    formation: new Map(), formed: false,
  };
}

export function useHal(enabled = true) {
  const halRef = useRef<HalRef>(freshHalRef());
  const rafRef = useRef<number>(0);
  const [triggered, setTriggered] = useState(false);
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const FS = 14;
    const cols = Math.ceil(STAGE_W / FS);
    const rows = Math.ceil(STAGE_H / FS);

    const R = 9.35;
    const ringThick = 2.0;
    const PUPIL_R_BASE = 4.5;

    const ecR_final = Math.floor(rows / 2) - Math.round(rows * 0.14);
    const ecC_final = Math.floor(cols / 2);
    const ecR_initial = Math.floor(rows / 2);
    const ecC_initial = Math.round(cols * 0.18);
    let ecR = ecR_initial, ecC = ecC_initial;

    const triggerR_px = R * FS * 4.5;
    const PUPIL_MAX_OFFSET = R - PUPIL_R_BASE - 0.5;
    const MOVE_THRESHOLD = 40;

    const mouse = { x: -9999, y: -9999, sx: -9999, sy: -9999, lastLockX: -9999, lastLockY: -9999, inside: false };

    let canvas: HTMLCanvasElement | null = null;
    let lastMoveT = -999;
    const start = performance.now();
    const onMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; lastMoveT = (performance.now() - start) / 1000; };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; mouse.inside = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);

    let pupilDX = 0, pupilDY = 0, targetDX = 0, targetDY = 0, lastTargetSetAt = 0, pupilFocus = 1.0;
    let hasFocusedOnce = false, firstInsideMoveT = -1, lastInsideT = -999;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const t = (performance.now() - start) / 1000;

      // Eye flight (left → center) post-trigger.
      const flightStart = 3.0, flightDur = 1.2;
      let flightK = 0;
      if (halRef.current.triggered && halRef.current.triggerStart) {
        const pt = (performance.now() - halRef.current.triggerStart) / 1000;
        if (pt < flightStart) flightK = 0;
        else if (pt > flightStart + flightDur) flightK = 1;
        else { const lin = (pt - flightStart) / flightDur; flightK = lin < 0.5 ? 2 * lin * lin : 1 - Math.pow(-2 * lin + 2, 2) / 2; }
      }
      const basePosC = ecC_initial + (ecC_final - ecC_initial) * flightK;
      const linRow = ecR_initial + (ecR_final - ecR_initial) * flightK;
      const arcLift = -Math.sin(flightK * Math.PI) * (rows * 0.08);
      const basePosR = linRow + arcLift;
      const flightActive = flightK > 0 && flightK < 1;
      const hoverAmp = flightActive ? 0 : 0.55;
      ecR = basePosR + Math.sin(t * (Math.PI * 2 / 3.4)) * hoverAmp;
      ecC = basePosC;

      if (!canvas) canvas = document.querySelector("canvas[data-intro-rain]");
      let stageX = -9999, stageY = -9999;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        stageX = ((mouse.x - rect.left) / rect.width) * STAGE_W;
        stageY = ((mouse.y - rect.top) / rect.height) * STAGE_H;
      }
      const eyeCx_stage = ecC * FS + FS / 2;
      const eyeCy_stage = ecR * FS + FS / 2;
      const dxStage = stageX - eyeCx_stage, dyStage = stageY - eyeCy_stage;
      const distStage = Math.sqrt(dxStage * dxStage + dyStage * dyStage);
      mouse.inside = distStage <= triggerR_px;

      if (mouse.inside && !triggeredRef.current && halRef.current.formed) {
        triggeredRef.current = true;
        halRef.current.triggered = true;
        halRef.current.triggerStart = performance.now();
        setTriggered(true);
      }

      const stillness = t - lastMoveT;
      if (mouse.inside) lastInsideT = t;
      const lockAge = mouse.inside ? stillness : t - lastInsideT;

      if (lockAge > 3.0) { firstInsideMoveT = -1; hasFocusedOnce = false; }
      else if (mouse.inside) {
        if (firstInsideMoveT < 0 && lastMoveT >= 0) firstInsideMoveT = lastMoveT;
        if (!hasFocusedOnce && firstInsideMoveT >= 0 && t - firstInsideMoveT > 0.1) hasFocusedOnce = true;
      }

      if (!halRef.current.formed) {
        targetDX = 0; targetDY = 0; lastTargetSetAt = t;
        firstInsideMoveT = -1; hasFocusedOnce = false;
        mouse.lastLockX = -9999; mouse.lastLockY = -9999;
      } else {
        const lockedOn = lockAge < 3.0 && hasFocusedOnce;
        if (lockedOn) {
          if (mouse.inside) {
            const lockDx = mouse.x - mouse.lastLockX, lockDy = mouse.y - mouse.lastLockY;
            if (Math.sqrt(lockDx * lockDx + lockDy * lockDy) > MOVE_THRESHOLD) {
              mouse.lastLockX = mouse.x; mouse.lastLockY = mouse.y;
              const dirNorm = Math.min(1, distStage / triggerR_px);
              const ang = Math.atan2(dyStage, dxStage);
              targetDX = Math.cos(ang) * dirNorm * PUPIL_MAX_OFFSET;
              targetDY = Math.sin(ang) * dirNorm * PUPIL_MAX_OFFSET;
              lastTargetSetAt = t;
            }
          }
        } else {
          mouse.lastLockX = -9999; mouse.lastLockY = -9999;
          const saccadeT = Math.floor(t / 2.3);
          if (saccadeT !== Math.floor((t - 0.05) / 2.3) || lastTargetSetAt === 0) {
            const seedX = Math.sin(saccadeT * 12.9898) * 43758.5453;
            const seedY = Math.sin(saccadeT * 78.233) * 12345.6789;
            targetDX = (seedX - Math.floor(seedX) - 0.5) * 2 * PUPIL_MAX_OFFSET;
            targetDY = (seedY - Math.floor(seedY) - 0.5) * 2 * PUPIL_MAX_OFFSET;
            lastTargetSetAt = t;
          }
        }
      }

      pupilDX += (targetDX - pupilDX) * 0.12;
      pupilDY += (targetDY - pupilDY) * 0.12;
      const focusOn = hasFocusedOnce && lockAge < 2.9;
      pupilFocus += ((focusOn ? 0.7 : 1.0) - pupilFocus) * 0.18;
      const pupilR = (PUPIL_R_BASE + Math.sin(t * 1.7) * 0.4) * pupilFocus;

      const glow = 0.5 + 0.5 * Math.sin(t * 1.4) + (mouse.inside ? 0.25 : 0);

      const shape = new Set<number>();
      const inside = new Set<number>();
      const iris = new Set<number>();

      // Pulses + shockwaves.
      let pulseScale = 1.0, waveRadius = -1, waveStrength = 0;
      let activeWaves: { radius: number; strength: number }[] = [];
      if (halRef.current.triggered && halRef.current.triggerStart) {
        const pt = (performance.now() - halRef.current.triggerStart) / 1000;
        const pulseStarts = [2.3, 5.7, 11.5];
        const dynamic = halRef.current.dynamicPulses || [];
        for (let i = 0; i < dynamic.length; i++) pulseStarts.push(dynamic[i]);
        const PULSE_DUR = 0.7;
        for (let i = 0; i < pulseStarts.length; i++) {
          const ps = pulseStarts[i];
          if (pt >= ps && pt <= ps + PULSE_DUR) {
            const k = (pt - ps) / PULSE_DUR;
            const ps_scale = 1.0 + 0.18 * Math.sin(k * Math.PI);
            if (ps_scale > pulseScale) pulseScale = ps_scale;
          }
        }
        const WAVE_DUR = 3.0;
        const maxDist = Math.sqrt(STAGE_W * STAGE_W + STAGE_H * STAGE_H);
        const computeWave = (s: number) => {
          const wt = pt - s;
          if (wt < 0 || wt > WAVE_DUR + 0.1) return null;
          const k = Math.min(1, wt / WAVE_DUR);
          const eased = 1 - Math.pow(1 - k, 2.2);
          return { radius: eased * maxDist, strength: k < 0.7 ? 1.0 : 1.0 - (k - 0.7) / 0.3 };
        };
        activeWaves = [];
        for (let i = 0; i < pulseStarts.length; i++) { const w = computeWave(pulseStarts[i]); if (w) activeWaves.push(w); }
        if (activeWaves.length > 0) {
          let freshest = activeWaves[0];
          for (let i = pulseStarts.length - 1; i >= 0; i--) { const w = computeWave(pulseStarts[i]); if (w) { freshest = w; break; } }
          waveRadius = freshest.radius; waveStrength = freshest.strength;
        }
      }
      halRef.current.activeWaves = activeWaves;
      halRef.current.waveRadius = waveRadius;
      halRef.current.waveStrength = waveStrength;
      halRef.current.waveCx = ecC * FS + FS / 2;
      halRef.current.waveCy = ecR * FS + FS / 2;

      if (halRef.current.triggered && halRef.current.triggerStart) {
        const pt = (performance.now() - halRef.current.triggerStart) / 1000;
        const FIRST_PULSE = 2.3, WAVE_DUR = 3.0;
        const maxDist = Math.sqrt(STAGE_W * STAGE_W + STAGE_H * STAGE_H);
        const wt = pt - FIRST_PULSE;
        let firstR = -1;
        if (wt >= 0) { const k = Math.min(1, wt / WAVE_DUR); firstR = (1 - Math.pow(1 - k, 2.2)) * maxDist; }
        halRef.current.firstWaveRadius = firstR;
      } else {
        halRef.current.firstWaveRadius = -1;
      }

      const flightSizeMul = 1.0 + 0.15 * flightK;
      const Reff = R * flightSizeMul * pulseScale;
      const pupilReffMul = flightSizeMul * pulseScale;

      const rMin = Math.max(0, Math.floor(ecR - Reff - 2));
      const rMax = Math.min(rows - 1, Math.ceil(ecR + Reff + 2));
      const cMin = Math.max(0, Math.floor(ecC - Reff - 2));
      const cMax = Math.min(cols - 1, Math.ceil(ecC + Reff + 2));
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          const dx = (c - ecC) / Reff;
          const dy = (r - ecR) / Reff;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 1.05) continue;
          const key = r * 10000 + c;
          if (d > 1.0 - ringThick / Reff) { shape.add(key); inside.add(key); continue; }
          inside.add(key);
          const pdx = c - ecC - pupilDX, pdy = r - ecR - pupilDY;
          const pd = Math.sqrt(pdx * pdx + pdy * pdy);
          const pR = pupilR * pupilReffMul;
          if (pd <= pR) { iris.add(key); shape.add(key); }
          else if (pd <= pR + 0.9) shape.add(key);
        }
      }

      // Formation (time-driven; eye scribbles into existence).
      const FORM_DELAY = 4.0, FORM_RAMP = 3.0, FORM_END = FORM_DELAY + FORM_RAMP;
      const elapsedSec = (performance.now() - start) / 1000;
      const formation = halRef.current.formation;
      for (const key of shape) {
        let cellForm: number;
        if (elapsedSec < FORM_DELAY) cellForm = 0;
        else if (elapsedSec >= FORM_END) cellForm = 1;
        else {
          const seed = Math.sin(key * 0.013 + key * 9.7) * 43758.5453;
          const offset = (seed - Math.floor(seed)) * (FORM_RAMP * 0.55);
          const cellRamp = FORM_RAMP - offset;
          const localT = elapsedSec - FORM_DELAY - offset;
          if (localT <= 0) cellForm = 0;
          else { const k = Math.min(1, localT / cellRamp); cellForm = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
        }
        formation.set(key, cellForm);
      }
      const dissolveK = halRef.current.dissolveK || 0;
      if (dissolveK > 0) {
        const inv = 1 - dissolveK;
        for (const key of shape) { const cur = formation.get(key) ?? 0; formation.set(key, cur * inv); }
      }
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
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, [enabled]);

  return { halRef, triggered };
}
