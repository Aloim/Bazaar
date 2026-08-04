import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGodotPanelChannels } from "../useGodotPanelChannels";
function emitRects(payload) {
    window.dispatchEvent(new CustomEvent("godot-out", {
        detail: JSON.stringify({ type: "shop_screen_rects", version: "1.0.0", payload }),
    }));
}
describe("useGodotPanelChannels", () => {
    it("starts empty (old .pck never sets godotPanel)", () => {
        const { result } = renderHook(() => useGodotPanelChannels());
        expect(result.current.size).toBe(0);
    });
    it("flips a channel on only when its beacon dict carries godotPanel:true", () => {
        const { result } = renderHook(() => useGodotPanelChannels());
        act(() => emitRects({
            trade: { bx: 1, by: 1, vpW: 1, vpH: 1, godotPanel: true },
            inventory: { bx: 1, by: 1, vpW: 1, vpH: 1 }, // present but no flag
        }));
        expect(result.current.has("trade")).toBe(true);
        expect(result.current.has("inventory")).toBe(false);
        expect(result.current.has("skin_picker")).toBe(false);
    });
    it("ignores non-shop_screen_rects events and malformed detail", () => {
        const { result } = renderHook(() => useGodotPanelChannels());
        act(() => {
            window.dispatchEvent(new CustomEvent("godot-out", { detail: "not json" }));
            window.dispatchEvent(new CustomEvent("godot-out", { detail: JSON.stringify({ type: "player_moved", payload: {} }) }));
        });
        expect(result.current.size).toBe(0);
    });
});
