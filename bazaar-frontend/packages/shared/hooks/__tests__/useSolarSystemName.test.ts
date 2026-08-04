// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * useSolarSystemName.test.ts — Multi-SSU Visibility Phase 4.
 *
 * Verifies the SSU → solar-system-name resolution chain in resolveSolarSystem():
 *   1. sui_getObject (LocationRegistry) → inner `locations` Table id
 *   2. suix_getDynamicFieldObject (Table keyed by SSU id) → Coordinates.solarsystem
 *   3. World API GET /v2/solarsystems/{id} → name
 * plus the null-guard when the SSU has no on-chain location entry.
 *
 * Mock strategy: stub global.fetch, routing by RPC method (request body) vs the
 * World API GET URL. Distinct SSU ids per assertion avoid the module-level cache.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSolarSystem } from "../useSolarSystemName";

const TABLE_ID = "0x05da4731ca5899eb62f493725aff4ab94b3b4f018b0f832bbb2590150b129c3f";
const SSU_WITH_LOC    = "0x1206965707134e30b6cc9618bcb991906cb38c9b382d7ec849cd5b667ba874a0";
const SSU_WITHOUT_LOC = "0x9999999999999999999999999999999999999999999999999999999999999999";

function registryObjResponse() {
  return { result: { data: { content: { fields: { locations: { fields: { id: { id: TABLE_ID } } } } } } } };
}
function coordsFieldResponse(solarsystem: string) {
  return { result: { data: { content: { fields: { value: { fields: { solarsystem, x: "1", y: "2", z: "3" } } } } } } };
}
function emptyFieldResponse() {
  // getDynamicFieldObject for a missing key → no data.
  return { result: { data: null }, error: { code: -32000, message: "dynamic field not found" } };
}

function installFetch(opts: { hasLoc: boolean }) {
  global.fetch = vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    if (init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      if (body.method === "sui_getObject") {
        return jsonOk(registryObjResponse());
      }
      if (body.method === "suix_getDynamicFieldObject") {
        return jsonOk(opts.hasLoc ? coordsFieldResponse("30016322") : emptyFieldResponse());
      }
      return jsonOk({ result: null });
    }
    // World API GET
    if (u.includes("/v2/solarsystems/30016322")) {
      return jsonOk({ id: 30016322, name: "IT5-C0B" });
    }
    return jsonOk({}, false, 404);
  }) as any;
}

function jsonOk(obj: unknown, ok = true, status = 200): any {
  return { ok, status, json: async () => obj };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("resolveSolarSystem", () => {
  it("resolves SSU id → solarsystem u64 → in-game name", async () => {
    installFetch({ hasLoc: true });
    const info = await resolveSolarSystem(SSU_WITH_LOC);
    expect(info).not.toBeNull();
    expect(info!.solarSystemId).toBe(30016322);
    expect(info!.name).toBe("IT5-C0B");
  });

  it("returns null when the SSU has no on-chain location entry", async () => {
    installFetch({ hasLoc: false });
    const info = await resolveSolarSystem(SSU_WITHOUT_LOC);
    expect(info).toBeNull();
  });

  it("returns null for an empty ssuId without any network call", async () => {
    const spy = vi.fn();
    global.fetch = spy as any;
    const info = await resolveSolarSystem("");
    expect(info).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
