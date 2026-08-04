import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ServiceBeaconHitArea from "./ServiceBeaconHitArea";

function emitRects(payload: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent("godot-out", {
    detail: JSON.stringify({ type: "shop_screen_rects", version: "1.0.0", payload }),
  }));
}

function Harness({ onOpen }: { onOpen: () => void }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={canvasRef} />
      <ServiceBeaconHitArea channel="trade" beaconName="trade" canvasRef={canvasRef} onOpen={onOpen} />
    </>
  );
}

describe("ServiceBeaconHitArea", () => {
  let sent: Array<{ type: string; payload: Record<string, unknown> }>;
  const onIn = (e: Event) => {
    try { sent.push(JSON.parse((e as CustomEvent<string>).detail)); } catch { /* ignore */ }
  };
  beforeEach(() => { sent = []; window.addEventListener("godot-in", onIn); });
  afterEach(() => { window.removeEventListener("godot-in", onIn); });

  it("relays set_beacon_hover for its beaconName on enter/leave", () => {
    render(<Harness onOpen={() => {}} />);
    emitRects({ trade: { bx: 10, by: 20, vpW: 100, vpH: 100, screenW: 30, screenH: 18, godotPanel: true } });
    const hit = screen.getByLabelText("trade");
    fireEvent.mouseEnter(hit);
    fireEvent.mouseLeave(hit);
    const hovers = sent.filter(m => m.type === "set_beacon_hover");
    expect(hovers).toEqual([
      expect.objectContaining({ payload: { beacon: "trade", hovered: true } }),
      expect.objectContaining({ payload: { beacon: "trade", hovered: false } }),
    ]);
  });

  it("opens on click", () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    fireEvent.click(screen.getByLabelText("trade"));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
