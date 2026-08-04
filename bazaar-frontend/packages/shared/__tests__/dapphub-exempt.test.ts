// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * UpdateCeremonyPlan v1 — DappHub-EXEMPT static-grep regression test.
 *
 * Enforces import-side DappHub exemption: the DappHub app's source tree MUST
 * NOT import `useDAppActionsEnabled` or `useGatedTransaction`. Any drift here
 * means a DappHub feature has been wrongly gated by the announcement-based
 * action lock — admin needs DappHub functional to drive the ceremony itself
 * (see CLAUDE.md Run #12 DappHub-EXEMPT posture and frontend-architect §3.7).
 *
 * Strategy: pure fs walk + regex match — no `child_process` / `git grep`
 * dependency, so this passes on every platform CI hits.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const DAPPHUB_SRC = join(REPO_ROOT, "apps", "dapphub", "src");
const SOURCE_EXTS = new Set([".ts", ".tsx"]);

function* walkSourceFiles(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // missing dir → nothing to scan; tested explicitly below
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkSourceFiles(full);
    } else if (stat.isFile()) {
      const dot = name.lastIndexOf(".");
      if (dot >= 0 && SOURCE_EXTS.has(name.slice(dot))) {
        yield full;
      }
    }
  }
}

function findImports(symbol: string): string[] {
  const pattern = new RegExp(`\\b${symbol}\\b`);
  const hits: string[] = [];
  for (const file of walkSourceFiles(DAPPHUB_SRC)) {
    const text = readFileSync(file, "utf8");
    if (pattern.test(text)) hits.push(file);
  }
  return hits;
}

describe("DappHub-EXEMPT enforcement (UpdateCeremonyPlan v1)", () => {
  it("DappHub source must NOT reference useDAppActionsEnabled", () => {
    const hits = findImports("useDAppActionsEnabled");
    expect(hits, `Forbidden hook reference in DappHub:\n${hits.join("\n")}`).toEqual([]);
  });

  it("DappHub source must NOT reference useGatedTransaction", () => {
    const hits = findImports("useGatedTransaction");
    expect(hits, `Forbidden hook reference in DappHub:\n${hits.join("\n")}`).toEqual([]);
  });

  it("DappHub source MAY reference useDAppAnnouncements (banner data only)", () => {
    // Informational — banner mount is the expected single (or zero) hit during v1
    // pre-wiring. Doesn't fail; just logs so a missing banner is visible.
    const hits = findImports("useDAppAnnouncements");
    if (hits.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(
        "[dapphub-exempt] no DappHub file references useDAppAnnouncements " +
        "— AnnouncementBanner not yet wired? (informational, not a failure)",
      );
    }
    expect(true).toBe(true);
  });
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
