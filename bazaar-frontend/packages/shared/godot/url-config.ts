// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/godot/url-config — Platform-default Godot base URL resolver.
 *
 * Host-agnostic: accepts any URL (Walrus, Cloudflare, Netlify, IPFS, self-host).
 * Used by GodotCanvas (basePath default) and (post-AP2-E) bridge INIT builder.
 *
 * VITE BUILD-TIME REPLACEMENT REQUIRED: This module reads import.meta.env, which
 * Vite statically replaces at bundle time. Do NOT consume from a non-Vite context
 * (SSR / Node scripts / Jest without Vite transform). In those contexts
 * import.meta.env is undefined and the fallback "/godot/" will always be returned.
 *
 * Phase: AP2-B / FP1-27
 * File limit: 500 lines | Constitution Article XIV.4
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Safe local fallback when VITE_GODOT_BASE_URL is unset or empty.
 * Resolves to each app's own public/godot/ directory (dev default).
 */
export const LOCAL_GODOT_FALLBACK = "/godot/" as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the platform-default Godot base URL for this build.
 *
 * Precedence (for GodotCanvas basePath, AP2-E resolver handles higher tiers):
 *   1. VITE_GODOT_BASE_URL env var (non-empty after trim)
 *   2. LOCAL_GODOT_FALLBACK = "/godot/"
 *
 * In dev mode, emits a console.warn if the env var value fails isValidGodotUrl.
 * The value is passed through regardless — runtime error surfaces via ENGINE LOAD FAILED.
 */
export function getDefaultGodotBaseUrl(): string {
  const raw = (import.meta.env.VITE_GODOT_BASE_URL as string | undefined) || "";
  if (!raw.trim()) return LOCAL_GODOT_FALLBACK;
  if (import.meta.env.DEV && !isValidGodotUrl(raw)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[bazaar/shared] VITE_GODOT_BASE_URL="${raw}" does not look like a valid URL. ` +
        `Expected http(s):// or a leading "/". Using as-is; ` +
        `engine load failure will surface in the UI if the URL is unreachable.`,
    );
  }
  return normalizeGodotBaseUrl(raw);
}

/**
 * Returns true if url is a valid http/https URL or an absolute path (leading "/").
 * Empty strings return false.
 */
export function isValidGodotUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Ensures url ends with a trailing slash.
 * Empty input returns LOCAL_GODOT_FALLBACK.
 */
export function normalizeGodotBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return LOCAL_GODOT_FALLBACK;
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

// ── validateGodotUrlForStorage ────────────────────────────────────────────────

/**
 * Validate a URL before storing it on-chain via set_ssu_godot_url / set_tribe_godot_url.
 *
 * Enforces Move's 256-byte UTF-8 cap (MA-OQ-1 ratified: Option::some("") also rejected).
 * Returns { ok: false, reason } on hard failure, { ok: true } or { ok: true, reason } on
 * soft-warning (http:// prefix). Does NOT block on warn — consumer decides how to surface.
 *
 * Does NOT replace isValidGodotUrl — existing AP2-B callers are unchanged.
 *
 * AP2-C / FP1-28.
 */
export function validateGodotUrlForStorage(url: string): { ok: boolean; reason?: string } {
  const trimmed = url.trim();

  // Hard reject: empty / whitespace-only
  if (!trimmed) {
    return { ok: false, reason: "URL cannot be empty" };
  }

  // Hard reject: exceeds Move's 256-byte on-chain cap
  const byteLength = new TextEncoder().encode(trimmed).length;
  if (byteLength > 256) {
    return { ok: false, reason: `URL exceeds 256-byte limit (got ${byteLength} bytes)` };
  }

  // Hard reject: not a valid URL shape (delegates to existing isValidGodotUrl)
  if (!isValidGodotUrl(trimmed)) {
    return { ok: false, reason: "URL must be http(s):// or an absolute path" };
  }

  // Soft warning: http:// is allowed but warn for user safety
  if (trimmed.startsWith("http://")) {
    return { ok: true, reason: "Prefer https:// for user safety" };
  }

  return { ok: true };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
