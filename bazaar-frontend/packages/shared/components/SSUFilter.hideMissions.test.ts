// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Vitest for the "Hide all missions" preference helpers in SSUFilter
 * (Market & Missions window, Slice 2). Pure localStorage round-trip + the
 * SHOP_FILTER_CHANGED_EVENT broadcast that drives the live in-world re-filter.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadHideMissions, persistHideMissions, HIDE_MISSIONS_KEY, SHOP_FILTER_CHANGED_EVENT,
} from "./SSUFilter";

describe("hide-missions preference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to false (missions shown) when unset", () => {
    expect(loadHideMissions()).toBe(false);
  });

  it("round-trips true → stored '1' → loads true", () => {
    persistHideMissions(true);
    expect(localStorage.getItem(HIDE_MISSIONS_KEY)).toBe("1");
    expect(loadHideMissions()).toBe(true);
  });

  it("round-trips false → stored '0' → loads false", () => {
    persistHideMissions(true);
    persistHideMissions(false);
    expect(localStorage.getItem(HIDE_MISSIONS_KEY)).toBe("0");
    expect(loadHideMissions()).toBe(false);
  });

  it("any non-'1' value reads as false", () => {
    localStorage.setItem(HIDE_MISSIONS_KEY, "yes");
    expect(loadHideMissions()).toBe(false);
  });

  it("persisting fires SHOP_FILTER_CHANGED_EVENT for the live re-filter", () => {
    const handler = vi.fn();
    window.addEventListener(SHOP_FILTER_CHANGED_EVENT, handler);
    persistHideMissions(true);
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(SHOP_FILTER_CHANGED_EVENT, handler);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
