// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Dev-only debug logger. No-op in production builds.
 *
 * Use for verbose RPC traces, state snapshots, or other diagnostic
 * output that should NOT ship to production. `import.meta.env.DEV`
 * is statically replaced by Vite at build time, so the production
 * bundle gets a tree-shakeable empty function.
 *
 * Per Decision #8 (R6.6.0): preserve `console.warn` / `console.error`
 * for legitimate runtime diagnostics; only `console.log` / `console.info`
 * / `console.debug` should be replaced with this helper.
 */
export const debug: (...args: unknown[]) => void =
  import.meta.env.DEV ? console.log.bind(console) : () => {};

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
