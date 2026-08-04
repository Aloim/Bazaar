// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * hooks/useCharacterOwnerCapRef.ts — Resolve Character OwnerCap reference.
 *
 * Issue 3 Stage B: React hook for escrow PTB flows.
 *
 * CC-003: Imports SSUOwnerCapRef from ssu-receiving-tx (no local SSUCapRef duplicate).
 *
 * Resolves the user's Character OwnerCap ref {id, version, digest}
 * needed by tx.receivingRef() in escrow PTBs.
 *
 * Composes useResolveCharacterAndSSUStatus + sui_getObject lookup
 * to retrieve the required version and digest fields for the OwnerCap.
 *
 * File limit: 500 lines | Constitution Article XIV.2 + Issue 3 Stage B
 */

import { useState, useEffect } from "react";
import { SSUOwnerCapRef } from "../tx/bazaarcore/ssu-receiving-tx";   // CC-003: reuse, no duplicate
import {
  CharOwnerCapRef,
  resolveCharOwnerCapRef,
} from "../tx/bazaarcore/shop-escrow-helpers";
import { useResolveCharacterAndSSUStatus } from "./useResolveCharacterAndSSUStatus";

export interface UseCharacterOwnerCapRefResult {
  characterId: string | null;
  isSsuOwner:  boolean;
  charCapRef:  CharOwnerCapRef | undefined;
  ssuCapRef:   SSUOwnerCapRef | undefined;   // CC-003: typed with imported SSUOwnerCapRef
  isLoading:   boolean;
  error:       string | null;
}

/**
 * Resolves the Character OwnerCap reference (id, version, digest) for a wallet address,
 * along with the SSU OwnerCap reference and ownership status.
 *
 * charCapRef — use in charBorrowOwnerCap() for Character-path PTBs.
 * ssuCapRef  — use in borrowSSUOwnerCap() for SSU-path PTBs.
 *
 * Both refs require the Object's live version + digest, fetched via RPC.
 */
export function useCharacterOwnerCapRef(
  walletAddress: string | undefined,
  ssuId?: string,
): UseCharacterOwnerCapRefResult {
  const base = useResolveCharacterAndSSUStatus(walletAddress, ssuId);

  const [charCapRef, setCharCapRef]   = useState<CharOwnerCapRef | undefined>(undefined);
  const [capLoading, setCapLoading]   = useState(false);

  // Derive ssuCapRef from base hook fields — CC-003: typed as SSUOwnerCapRef (no re-declaration)
  const ssuCapRef: SSUOwnerCapRef | undefined =
    base.ssuCapId && base.ssuCapVersion && base.ssuCapDigest
      ? {
          ssuCapId:      base.ssuCapId,
          ssuCapVersion: base.ssuCapVersion,
          ssuCapDigest:  base.ssuCapDigest,
        }
      : undefined;

  useEffect(() => {
    const ownerCapId = base.ownerCapId;
    if (!ownerCapId) {
      setCharCapRef(undefined);
      return;
    }

    let aborted = false;
    setCapLoading(true);

    resolveCharOwnerCapRef(ownerCapId)
      .then(ref => {
        if (!aborted) setCharCapRef(ref ?? undefined);
      })
      .catch(() => {
        if (!aborted) setCharCapRef(undefined);
      })
      .finally(() => {
        if (!aborted) setCapLoading(false);
      });

    return () => { aborted = true; };
  }, [base.ownerCapId]);

  return {
    characterId: base.characterId,
    isSsuOwner:  base.isSsuOwner,
    charCapRef,
    ssuCapRef,
    isLoading:   base.isLoading || capLoading,
    error:       base.error,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
