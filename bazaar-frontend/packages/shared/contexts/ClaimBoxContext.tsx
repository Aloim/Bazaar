// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * ClaimBoxContext — cross-screen claims state.
 *
 * Provides ClaimBox state (isClaimable, currencyName) to the component tree.
 * Wrap at the app root to make claim state available without prop drilling.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { createContext, useContext, type ReactNode } from "react";
import { useClaimBox, type UseClaimBoxResult, type UseClaimBoxOptions } from "../hooks/useClaimBox";

const ClaimBoxContext = createContext<UseClaimBoxResult | null>(null);

/**
 * Props for ClaimBoxProvider.
 *
 * tokenSymbol: optional tribe token symbol (string | null).
 * Advanced app resolves this from useTribeTokenSymbol and passes it here so
 * the currency label propagates through to the Godot bridge and HUD displays.
 * NoTribe and Easy apps omit this prop — fallthrough to "EVE" default.
 */
export interface ClaimBoxProviderProps {
  children: ReactNode;
  tokenSymbol?: string | null;
}

export function ClaimBoxProvider({ children, tokenSymbol }: ClaimBoxProviderProps) {
  const opts: UseClaimBoxOptions = { tokenSymbol };
  const claimBox = useClaimBox(opts);
  return (
    <ClaimBoxContext.Provider value={claimBox}>
      {children}
    </ClaimBoxContext.Provider>
  );
}

/** Consume ClaimBox state. Must be used inside <ClaimBoxProvider>. */
export function useClaimBoxContext(): UseClaimBoxResult {
  const ctx = useContext(ClaimBoxContext);
  if (!ctx) {
    throw new Error("useClaimBoxContext must be used inside <ClaimBoxProvider>");
  }
  return ctx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
