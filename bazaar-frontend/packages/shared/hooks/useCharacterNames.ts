// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { getWalletCharacters, parseCharacterFromJson } from "@evefrontier/dapp-kit";

/**
 * Resolves EVE Frontier character names for a list of wallet addresses.
 *
 * Returns a Map<address, name> populated asynchronously as GraphQL responses arrive.
 * Results are cached for the component lifetime — no re-fetch for already-resolved addresses.
 * Addresses with no character or that error are skipped (graceful fallback to abbreviated address).
 *
 * Input validation: addresses must be 0x-prefixed 66-char hex strings. Malformed inputs
 * are silently skipped (they would produce meaningless GraphQL queries).
 *
 * @param addresses - Array of Sui wallet addresses to resolve
 */
export function useCharacterNames(addresses: readonly string[]): Map<string, string> {
  const cache = useRef<Map<string, string>>(new Map());
  const inFlight = useRef<Set<string>>(new Set());
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (addresses.length === 0) return;

    // Filter out already-cached, in-flight, empty, and malformed addresses.
    // A valid Sui address is 0x + 64 hex chars (66 total). Malformed inputs
    // produce meaningless GraphQL queries — skip them early and skip silently.
    const pending = addresses.filter(
      addr =>
        typeof addr === "string" &&
        addr.startsWith("0x") &&
        addr.length === 66 &&
        !cache.current.has(addr) &&
        !inFlight.current.has(addr),
    );

    if (pending.length === 0) return;

    for (const addr of pending) {
      inFlight.current.add(addr);
    }

    let cancelled = false;

    Promise.allSettled(
      pending.map(async addr => {
        try {
          const result = await getWalletCharacters(addr);
          if (cancelled) return;

          const node = result.data?.address?.objects?.nodes?.[0];
          const json =
            node?.contents?.extract?.asAddress?.asObject?.asMoveObject?.contents?.json;

          const info = parseCharacterFromJson(json);
          if (info?.name && info.name.trim().length > 0) {
            cache.current.set(addr, info.name.trim());
          }
        } catch (err) {
          // Surface the error for debugging. The address falls back to the
          // abbreviated form in the UI — this is expected for wallets with no
          // registered EVE Frontier character.
          console.warn(
            "[useCharacterNames] Failed to resolve character name for address:",
            addr,
            err,
          );
        } finally {
          inFlight.current.delete(addr);
        }
      }),
    ).then(() => {
      if (!cancelled) {
        setRevision(r => r + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  // Dependency: re-run only when the address list content changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses.join(",")]);

  // Return a new Map reference when names resolve (revision increments),
  // so consumer useMemo hooks properly invalidate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => new Map(cache.current), [revision]);
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
