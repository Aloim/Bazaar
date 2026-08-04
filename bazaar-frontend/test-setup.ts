// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Vitest global test setup file.
 *
 * Extends Vitest's `expect` with @testing-library/jest-dom custom matchers:
 *   toBeInTheDocument, toBeDisabled, toHaveTextContent, etc.
 *
 * Loaded via vitest.config.ts `setupFiles` — runs once per worker before tests.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import "@testing-library/jest-dom";

// Global afterEach cleanup — unmounts React trees after each test to prevent
// timer / state leaks between tests.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
