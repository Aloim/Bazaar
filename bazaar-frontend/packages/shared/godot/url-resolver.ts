// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/godot/url-resolver — 4-tier Godot URL resolver.
 *
 * Precedence (Q2 locked):
 *   Tier 1 — Dev override from localStorage (cap-gated, READ-TIME check)
 *   Tier 2 — On-chain TribeGovernance.godot_url (Easy/Advanced: bazaarType 1/2)
 *   Tier 3 — On-chain SSUGovernance.godot_url (NoTribe: bazaarType 0)
 *   Tier 4 — VITE_GODOT_BASE_URL default (failover sink)
 *
 * No-cascade failover (SDC-030-02 confirmed): tier-1/2/3 fetch-test failure
 * → resolver returns source="failover" with url=tier-4-default immediately.
 * Does NOT fall through to the next custom tier.
 *
 * Security scope (Article VII + ArchitecturePlan2 §7 items 3–4):
 *   - Resolver is READ-ONLY. Never writes to chain, localStorage, or session.
 *   - Dev-override tier (tier 1) cap-gate is client-side UX only. Devtools
 *     bypass is expected and harmless — custom URL affects only that browser
 *     session. Authoritative cap enforcement lives in Move contract entry fns.
 *   - Banner MUST NOT expose the resolved URL to non-admin users. Copy strings
 *     are static literals verified at design time; code-critic enforces.
 *
 * Stub-era behavior (FP1-23/FP1-24/FP1-25 all pending):
 *   caps.* all false → tier 1 inert.
 *   onChainTribeUrl = null, onChainSSUUrl = null → tiers 2 + 3 skip.
 *   Returns { url: defaultUrl, source: "default" } → banner hidden.
 *   Zero visual regression vs pre-AP2-E.
 *
 * Phase: AP2-E / FP1-30
 * File limit: 500 lines | Constitution Article XIV.4
 */

import type { SSUCaps, TribeCaps, BazaarTypeNum } from "../types/bazaarcore";
import {
  getDefaultGodotBaseUrl,
  isValidGodotUrl,
  normalizeGodotBaseUrl,
} from "./url-config";
import { getOverrideForSSU } from "../storage/dev-override-store";
import { testGodotUrl } from "./fetch-test";
import type { FetchTestResult, FetchTestFailReason } from "./fetch-test";

// Re-export for consumers that import from this module.
export type { FetchTestFailReason };

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Input to resolveGodotUrl. All fields required; nullable fields fall through
 * to the next tier. App.tsx guards ssuId non-null before calling the hook.
 */
export interface ResolveGodotUrlInput {
  /** SSU object ID. Never null at resolver call-time (App guards). */
  ssuId: string;
  /** 0 = NoTribe, 1 = Easy, 2 = Advanced. From useSSUGovernanceConfig. */
  bazaarType: BazaarTypeNum;
  /** Connected wallet or null (anonymous). Tier-1 skipped when null. */
  walletAddress: string | null;
  /** Tribe object ID for Easy/Advanced. null for NoTribe or unresolved (FP1-24). */
  tribeId: string | null;
  /** Cap flags for walletAddress × SSU scope. All false in stub era. */
  caps: SSUCaps;
  /** Cap flags for walletAddress × tribe scope. All false in stub era. */
  tribeCaps: TribeCaps;
  /** On-chain SSUGovernance.godot_url. null when unset or stubbed. */
  onChainSSUUrl: string | null;
  /** On-chain TribeGovernance.godot_url. null when unset or stubbed. */
  onChainTribeUrl: string | null;
  /**
   * Injectable fetch-test function. Defaults to testGodotUrl.
   * Pass a mock in unit tests for deterministic precedence-matrix testing.
   */
  fetchTest?: (url: string) => Promise<FetchTestResult>;
}

/** Which tier produced the final URL. Drives CustomClientBanner visibility. */
export type ResolvedSource = "dev-override" | "tribe" | "ssu" | "default" | "failover";

/** Result of resolveGodotUrl. url is always a concrete string (never null). */
export interface ResolveGodotUrlResult {
  /** Normalized base URL (trailing slash) ready for GodotCanvas.basePath. */
  url: string;
  /** Origin tier. "default" → banner hidden. */
  source: ResolvedSource;
  /**
   * URL that failed the fetch-test. Present only when source === "failover".
   * NEVER surfaced in banner copy (Q9 compliance). Debug-surface only.
   */
  attemptedUrl?: string;
  /** Why the fetch-test failed. Debug-surface only. */
  failureReason?: FetchTestFailReason;
}

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolve which Godot base URL to load, following 4-tier precedence.
 *
 * Pure async function — zero React imports, zero side effects.
 * The orchestration hook (useResolvedGodotUrl) handles React-query wrapping.
 */
export async function resolveGodotUrl(
  input: ResolveGodotUrlInput,
): Promise<ResolveGodotUrlResult> {
  const probe = input.fetchTest ?? testGodotUrl;
  const defaultUrl = normalizeGodotBaseUrl(getDefaultGodotBaseUrl());

  // ── TIER 1: Dev override (cap-gated at READ time) ─────────────────────────
  // Cap check is client-side UX only; devtools bypass is harmless (see docstring).
  const canDevOverride =
    input.tribeCaps.hasTribeSuperAdminCap ||
    input.tribeCaps.hasTribeLeaderCap ||
    input.caps.hasSSUSuperAdminCap ||
    input.caps.hasSSUOwnerCap;

  if (canDevOverride && input.walletAddress !== null) {
    const devUrl = getOverrideForSSU(input.ssuId);
    if (devUrl !== null && isValidGodotUrl(devUrl)) {
      const normalized = normalizeGodotBaseUrl(devUrl);
      const result = await probe(normalized);
      if (result.ok) {
        return { url: normalized, source: "dev-override" };
      }
      // No-cascade: straight to failover.
      return {
        url: defaultUrl,
        source: "failover",
        attemptedUrl: normalized,
        failureReason: result.reason,
      };
    }
  }

  // ── TIER 2: On-chain Tribe URL (Easy / Advanced: bazaarType 1 or 2) ───────
  if (input.bazaarType === 1 || input.bazaarType === 2) {
    if (input.tribeId !== null && input.onChainTribeUrl !== null) {
      if (isValidGodotUrl(input.onChainTribeUrl)) {
        const normalized = normalizeGodotBaseUrl(input.onChainTribeUrl);
        const result = await probe(normalized);
        if (result.ok) {
          return { url: normalized, source: "tribe" };
        }
        return {
          url: defaultUrl,
          source: "failover",
          attemptedUrl: normalized,
          failureReason: result.reason,
        };
      }
    }
  }

  // ── TIER 3: On-chain SSU URL (NoTribe: bazaarType 0) ─────────────────────
  if (input.bazaarType === 0) {
    if (input.onChainSSUUrl !== null && isValidGodotUrl(input.onChainSSUUrl)) {
      const normalized = normalizeGodotBaseUrl(input.onChainSSUUrl);
      const result = await probe(normalized);
      if (result.ok) {
        return { url: normalized, source: "ssu" };
      }
      return {
        url: defaultUrl,
        source: "failover",
        attemptedUrl: normalized,
        failureReason: result.reason,
      };
    }
  }

  // ── TIER 4: Default (env var or /godot/) ─────────────────────────────────
  // No fetch-test on default URL — if it is unreachable, GodotCanvas's own
  // error overlay and RETRY button handle that failure path.
  return { url: defaultUrl, source: "default" };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
