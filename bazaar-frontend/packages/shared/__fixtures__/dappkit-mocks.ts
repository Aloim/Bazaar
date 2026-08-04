// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Mock factories for @evefrontier/dapp-kit and React Query test client.
 *
 * dAppKit mock: provides signAndExecuteTransaction as a vi.fn() spy.
 * useConnection mock: returns a controlled walletAddress.
 * createTestQueryClient: React Query client configured for test isolation.
 *
 * Usage in component tests:
 *   vi.mock("@evefrontier/dapp-kit", () => createDappKitMock());
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// ── dAppKit mock ──────────────────────────────────────────────────────────────

export interface MockDAppKit {
  signAndExecuteTransaction: ReturnType<typeof vi.fn>;
}

/**
 * Creates a fresh mock for the @evefrontier/dapp-kit module.
 * Returns both the module mock shape and the spy references for assertions.
 */
export function createDappKitMock(walletAddress = "0xwallet000000000000000000000000000000000000000000000000000000001") {
  const signAndExecuteTransaction = vi.fn().mockResolvedValue({ digest: "MockTxDigest" });

  const dAppKit: MockDAppKit = { signAndExecuteTransaction };

  const useConnection = vi.fn().mockReturnValue({ walletAddress });

  return {
    /** The full mock module shape — spread into vi.mock factory return value. */
    moduleShape: {
      dAppKit,
      useConnection,
    },
    /** Direct spy reference for assertion: signAndExecuteTransaction.toHaveBeenCalled(). */
    signAndExecuteTransaction,
    /** Direct spy reference for assertion or override. */
    useConnection,
  };
}

/**
 * Singleton mock instance for tests that use a shared setup.
 * Reassign or use createDappKitMock() for per-test isolation.
 */
export let dappKitMockInstance = createDappKitMock();

/** Reset the singleton. Call in beforeEach for full isolation. */
export function resetDappKitMock(walletAddress?: string): ReturnType<typeof createDappKitMock> {
  dappKitMockInstance = createDappKitMock(walletAddress);
  return dappKitMockInstance;
}

// ── React Query test client ───────────────────────────────────────────────────

/**
 * Creates a React Query QueryClient configured for test isolation:
 * - retry: false — tests must not retry on failure (hides bugs)
 * - gcTime: 0 — no cache survives between tests
 * - staleTime: 0 — always re-fetch; no stale-while-revalidate hiding failures
 *
 * Create a NEW instance per test (or per describe block with beforeEach reset).
 *
 * NOTE: React Query v5 removed the logger option from QueryClientConfig.
 * If you need to suppress console.error for expected failures, use per-test
 * spying: vi.spyOn(console, "error").mockImplementation(() => {});
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
