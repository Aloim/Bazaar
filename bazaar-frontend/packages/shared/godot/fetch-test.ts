// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * @bazaar/shared/godot/fetch-test — Reachability probe for a Godot base URL.
 *
 * Uses HEAD first (cheap, no body download). Falls back to GET with
 * Range: bytes=0-0 when server returns 405/501 (Walrus, IPFS, some static hosts).
 *
 * Timeout defaults to 5000 ms (AbortController-based). Injectable `timeoutMs`
 * parameter allows tests to pass 10 ms for fast failure.
 *
 * CORS vs network error distinction is best-effort — both surface as TypeError
 * in the Fetch API. We infer "cors" when target host differs from location.host.
 * This is adequate for banner debug-surface; it does NOT gate banner display.
 *
 * Phase: AP2-E / FP1-30
 * File limit: 500 lines | Constitution Article XIV.4
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FetchTestFailReason =
  | "timeout"     // AbortSignal fired before response
  | "cors"        // Cross-origin TypeError (preflight failure or DNS on different host)
  | "network"     // Same-origin TypeError or unclassified network error
  | "http-error"; // 4xx / 5xx response code

export interface FetchTestResult {
  ok: boolean;
  /** Present when ok === false. */
  reason?: FetchTestFailReason;
  /** Present when reason === "http-error". Raw HTTP status code. */
  status?: number;
}

// ── Internal: GET Range fallback ──────────────────────────────────────────────

async function tryGetRange(
  baseUrl: string,
  signal: AbortSignal,
): Promise<FetchTestResult> {
  try {
    const res = await fetch(baseUrl, {
      method: "GET",
      signal,
      headers: { Range: "bytes=0-0" },
    });
    // 206 Partial Content is success for Range requests.
    if (res.ok || res.status === 206) return { ok: true };
    return { ok: false, reason: "http-error", status: res.status };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    if (err instanceof TypeError) {
      const isCrossOrigin =
        new URL(baseUrl, location.origin).host !== location.host;
      return { ok: false, reason: isCrossOrigin ? "cors" : "network" };
    }
    return { ok: false, reason: "network" };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Probe `baseUrl` for reachability.
 *
 * Strategy: HEAD request first; if server responds 405/501 (HEAD not supported),
 * retries with GET + Range: bytes=0-0. Single attempt — no internal retry loop.
 * Banner "Retry" button is the user-initiated retry mechanism.
 *
 * @param baseUrl - Normalized Godot base URL (trailing slash, from resolveGodotUrl).
 * @param timeoutMs - Abort timeout in milliseconds. Default 5000.
 */
export async function testGodotUrl(
  baseUrl: string,
  timeoutMs = 5000,
): Promise<FetchTestResult> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);

  try {
    const res = await fetch(baseUrl, {
      method: "HEAD",
      signal: abort.signal,
    });

    // 405 Method Not Allowed or 501 Not Implemented: HEAD unsupported.
    if (res.status === 405 || res.status === 501) {
      return await tryGetRange(baseUrl, abort.signal);
    }

    if (res.ok) return { ok: true };
    return { ok: false, reason: "http-error", status: res.status };

  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    if (err instanceof TypeError) {
      const isCrossOrigin =
        new URL(baseUrl, location.origin).host !== location.host;
      return { ok: false, reason: isCrossOrigin ? "cors" : "network" };
    }
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
