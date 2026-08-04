// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DecimalInput, sanitizeDecimalInput } from "./DecimalInput";

describe("sanitizeDecimalInput", () => {
  it("accepts empty / lone-dot / leading-zero decimals (the 0.01 case)", () => {
    expect(sanitizeDecimalInput("")).toEqual({ accepted: true, text: "", value: 0 });
    expect(sanitizeDecimalInput(".")).toEqual({ accepted: true, text: ".", value: 0 });
    expect(sanitizeDecimalInput("0")).toEqual({ accepted: true, text: "0", value: 0 });
    expect(sanitizeDecimalInput("0.")).toEqual({ accepted: true, text: "0.", value: 0 });
    expect(sanitizeDecimalInput("0.01")).toEqual({ accepted: true, text: "0.01", value: 0.01 });
    expect(sanitizeDecimalInput("12.5")).toEqual({ accepted: true, text: "12.5", value: 12.5 });
  });

  it("treats a comma as a decimal point (EU keyboards)", () => {
    expect(sanitizeDecimalInput("0,5")).toEqual({ accepted: true, text: "0.5", value: 0.5 });
  });

  it("rejects letters, signs, a second dot, and over-precision", () => {
    expect(sanitizeDecimalInput("abc").accepted).toBe(false);
    expect(sanitizeDecimalInput("-1").accepted).toBe(false);
    expect(sanitizeDecimalInput("1.2.3").accepted).toBe(false);
    expect(sanitizeDecimalInput("0.123", 2).accepted).toBe(false);
    expect(sanitizeDecimalInput("0.12", 2).accepted).toBe(true);
  });
});

function Harness({ start = 0 }: { start?: number }) {
  const [v, setV] = useState(start);
  return (
    <>
      <DecimalInput value={v} onValueChange={setV} placeholder="EVE" aria-label="price" />
      <span data-testid="val">{v}</span>
    </>
  );
}

describe("DecimalInput (controlled)", () => {
  it("lets the user build a fractional amount like 0.01 keystroke by keystroke", () => {
    render(<Harness />);
    const input = screen.getByLabelText("price") as HTMLInputElement;
    for (const step of ["0", "0.", "0.0", "0.01"]) {
      fireEvent.change(input, { target: { value: step } });
      expect(input.value).toBe(step); // the leading-zero decimal is NOT wiped
    }
    expect(screen.getByTestId("val").textContent).toBe("0.01");
  });

  it("renders 0 as an empty field by default (placeholder shows) but keeps a typed 0", () => {
    render(<Harness />);
    const input = screen.getByLabelText("price") as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "0" } });
    expect(input.value).toBe("0");
  });

  it("rejects an invalid keystroke without disturbing the buffer", () => {
    const onChange = vi.fn();
    render(<DecimalInput value={1.5} onValueChange={onChange} aria-label="p" />);
    const input = screen.getByLabelText("p") as HTMLInputElement;
    expect(input.value).toBe("1.5");
    fireEvent.change(input, { target: { value: "1.5x" } });
    expect(input.value).toBe("1.5"); // rejected, unchanged
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
