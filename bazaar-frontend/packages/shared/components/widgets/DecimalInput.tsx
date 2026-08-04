// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect } from "react";
import type { InputHTMLAttributes } from "react";

// Decimal-friendly money input for stall / mission creation forms.
//
// WHY this exists: every price / coin-amount field used the pattern
//   <input type="number" value={amount || ""} onChange={e => set(+e.target.value)} />
// which is broken for fractional money:
//   • `amount || ""` collapses a typed "0" to "" (falsy-zero) — the instant you
//     type the leading 0 of "0.01" the field clears, so a sub-unit amount can
//     never be built.
//   • a `number` state can't hold an in-progress "0." or ".5"; the round-trip
//     through `+e.target.value` / `Number()` wipes the decimal point on the next
//     render, so `type="number"` shows nothing and the user is stuck on whole
//     tokens (min 1).
// Fix: back the field with a STRING buffer so partial entries survive, and render
// type="text" + inputMode="decimal" (type="number" cannot display "0.").
// The parsed number flows out via onValueChange; scaling to MIST / token units
// happens unchanged at submit time (Math.round(value * scale)).

/** Pure keystroke sanitiser — exported for unit tests + reuse.
 *  Accepts the empty string, a lone ".", and decimals up to `maxDecimals`
 *  fractional digits. A comma is treated as a decimal point (EU keyboards).
 *  Returns `accepted:false` for input that should be rejected outright
 *  (letters, sign, second dot, too many decimals). */
export function sanitizeDecimalInput(
  raw: string,
  maxDecimals = 9,
): { accepted: boolean; text: string; value: number } {
  const s = raw.replace(",", ".").trim();
  if (s === "") return { accepted: true, text: "", value: 0 };
  const pattern = new RegExp(`^\\d*(?:\\.\\d{0,${maxDecimals}})?$`);
  if (!pattern.test(s)) return { accepted: false, text: "", value: NaN };
  const value = s === "." ? 0 : Number(s);
  return { accepted: true, text: s, value: Number.isNaN(value) ? 0 : value };
}

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode" | "min" | "max"
>;

export interface DecimalInputProps extends NativeProps {
  /** Current numeric value in DISPLAY units (e.g. EVE, not MIST). */
  value: number;
  /** Fired with the parsed number on every accepted edit (empty/"." → 0). */
  onValueChange: (val: number) => void;
  /** Lowest allowed value; clamped on edit. Default 0. */
  min?: number;
  /** Max fractional digits accepted. Default 9 (EVE MIST precision). */
  maxDecimals?: number;
  /** Render 0 as "0" instead of an empty field. Default false (placeholder shows). */
  showZero?: boolean;
}

export function DecimalInput({
  value, onValueChange, min = 0, maxDecimals = 9, showZero = false,
  ...rest
}: DecimalInputProps) {
  const fmt = (v: number): string => (v === 0 && !showZero ? "" : String(v));
  const [text, setText] = useState<string>(() => fmt(value));

  // Re-sync from an external value change (form reset, programmatic clear) WITHOUT
  // clobbering an in-progress entry whose parsed value already equals the prop
  // (e.g. mid-typing "0." parses to 0 and the prop is still 0 → keep "0.").
  useEffect(() => {
    const parsed = text === "" || text === "." ? 0 : Number(text);
    if (!Number.isNaN(parsed) && parsed === value) return;
    setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handle = (raw: string) => {
    const res = sanitizeDecimalInput(raw, maxDecimals);
    if (!res.accepted) return; // reject the keystroke, keep current buffer
    setText(res.text);
    onValueChange(Math.max(min, res.value));
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => handle(e.target.value)}
    />
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
