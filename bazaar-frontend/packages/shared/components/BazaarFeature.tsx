// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarFeature — bazaar-type feature gate wrapper.
 *
 * Usage:
 *   <BazaarFeature only="Advanced">…</BazaarFeature>
 *   <BazaarFeature only="Easy" or="Advanced">…</BazaarFeature>
 *   <BazaarFeature only="NoTribe" fallback={<Notice />}>…</BazaarFeature>
 *
 * Sugar components:
 *   <AdvancedOnly>…</AdvancedOnly>
 *   <EasyOnly>…</EasyOnly>
 *   <NoTribeOnly>…</NoTribeOnly>
 *   <EasyOrAdvanced>…</EasyOrAdvanced>
 *
 * SSU ID resolution order:
 *   1. explicit `ssuId` prop on <BazaarFeature>
 *   2. nearest <BazaarFeatureRoot ssuId={…}> ancestor in the tree
 *   3. neither → bazaarType resolves to null → children hidden
 *
 * Loading behaviour:
 *   While useBazaarType is resolving, `fallback` is rendered (default null).
 *   Gate is closed-by-default (hides children) until type is confirmed.
 *
 * Security note:
 *   This wrapper is UX-only. The authoritative security boundary is the
 *   Move-side bazaar_type asserts (R5.2 — BazaarCore/BazaarEconomy entry fns).
 *   A tampered client that skips this wrapper cannot bypass the on-chain gate.
 *
 * File limit: 500 lines | Constitution Article XII.3
 */

import {
  type ReactNode,
  createContext,
  useContext,
} from "react";
import { useBazaarType, type BazaarTypeName } from "../hooks/useBazaarType";

// ── SSU context ────────────────────────────────────────────────────────────────

/**
 * Provides the active SSU ID to all nested <BazaarFeature> wrappers.
 * Mount once at the bazaar-app AppBody boundary:
 *   <BazaarFeatureRoot ssuId={SSU_OBJECT_ID}><AppBody …/></BazaarFeatureRoot>
 */
const SSUContext = createContext<string | null>(null);

export interface BazaarFeatureRootProps {
  ssuId:    string | null | undefined;
  children: ReactNode;
}

export function BazaarFeatureRoot({ ssuId, children }: BazaarFeatureRootProps) {
  return (
    <SSUContext.Provider value={ssuId ?? null}>
      {children}
    </SSUContext.Provider>
  );
}

// ── Core component ─────────────────────────────────────────────────────────────

export interface BazaarFeatureProps {
  /** Required: renders children when the SSU's bazaar type matches this value. */
  only:      BazaarTypeName;
  /** Optional: also renders children when the SSU's bazaar type matches this. */
  or?:       BazaarTypeName;
  /** Optional: third permitted type (rare: e.g. "NoTribe" or "Easy" or "Advanced"). */
  or2?:      BazaarTypeName;
  /** SSU ID. If omitted, reads from the nearest BazaarFeatureRoot ancestor. */
  ssuId?:    string | null | undefined;
  /** Rendered while the hook is loading. Default: null (gate closed). */
  fallback?: ReactNode;
  children:  ReactNode;
}

/**
 * Renders children iff the resolved bazaar type for the SSU matches `only`,
 * `or`, or `or2`. Hides children (renders fallback) while loading or on mismatch.
 */
export function BazaarFeature({
  only,
  or,
  or2,
  ssuId,
  fallback = null,
  children,
}: BazaarFeatureProps) {
  const ctxSsuId    = useContext(SSUContext);
  const effectiveId = ssuId ?? ctxSsuId;

  const { bazaarType, isLoading } = useBazaarType(effectiveId);

  // While resolving: closed-by-default.
  if (isLoading) return <>{fallback}</>;

  // SSU unregistered or no ssuId available: hide.
  if (bazaarType === null) return null;

  // Type match check.
  if (
    bazaarType === only ||
    (or  !== undefined && bazaarType === or)  ||
    (or2 !== undefined && bazaarType === or2)
  ) {
    return <>{children}</>;
  }

  return null;
}

// ── Convenience sugar ──────────────────────────────────────────────────────────

/** Props for convenience wrappers (no `only`/`or`/`or2` — those are fixed). */
type SugarProps = Omit<BazaarFeatureProps, "only" | "or" | "or2">;

/** Renders children only in NoTribe SSUs. */
export const NoTribeOnly: React.FC<SugarProps> = (p) => (
  <BazaarFeature only="NoTribe" {...p} />
);

/** Renders children only in Easy-tier SSUs. */
export const EasyOnly: React.FC<SugarProps> = (p) => (
  <BazaarFeature only="Easy" {...p} />
);

/** Renders children only in Advanced-tier SSUs. */
export const AdvancedOnly: React.FC<SugarProps> = (p) => (
  <BazaarFeature only="Advanced" {...p} />
);

/** Renders children in Easy or Advanced SSUs (not NoTribe). */
export const EasyOrAdvanced: React.FC<SugarProps> = (p) => (
  <BazaarFeature only="Easy" or="Advanced" {...p} />
);

// Note: <NoTribeOrEasy> is intentionally omitted — no R5 gating combination
// requires "all bazaar types except Advanced" per design spec §2.2.

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
