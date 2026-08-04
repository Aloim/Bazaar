// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useEffect } from "react";
import { useCharacterForAddress } from "./useCharacterForAddress";
import { resolveSSUOwnerCap } from "@bazaar/shared/tx";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";

export interface CharacterSSUStatus {
  characterId:    string | null;
  ownerCapId:     string | null;
  isSsuOwner:     boolean;
  ssuCapId:       string | null;
  ssuCapVersion:  string | null;
  ssuCapDigest:   string | null;
  isLoading:      boolean;
  error:          string | null;
}

/**
 * Resolves an arbitrary wallet address to their Character ID, OwnerCap, and SSU owner status.
 */
export function useResolveCharacterAndSSUStatus(walletAddress: string | undefined, ssuId?: string): CharacterSSUStatus {
  const effectiveSsuId = ssuId || SSU_OBJECT_ID;
  const { characterId, ownerCapId, isLoading: charLoading, error } = useCharacterForAddress(walletAddress);
  const [isSsuOwner, setIsSsuOwner]         = useState(false);
  const [ssuCapId, setSsuCapId]             = useState<string | null>(null);
  const [ssuCapVersion, setSsuCapVersion]   = useState<string | null>(null);
  const [ssuCapDigest, setSsuCapDigest]     = useState<string | null>(null);
  const [ssuLoading, setSsuLoading]         = useState(false);

  useEffect(() => {
    if (!characterId) {
      setIsSsuOwner(false);
      setSsuCapId(null);
      setSsuCapVersion(null);
      setSsuCapDigest(null);
      return;
    }

    let aborted = false;
    setSsuLoading(true);

    resolveSSUOwnerCap(characterId, effectiveSsuId)
      .then(cap => {
        if (!aborted) {
          setIsSsuOwner(cap !== null);
          setSsuCapId(cap?.ssuCapId ?? null);
          setSsuCapVersion(cap?.ssuCapVersion ?? null);
          setSsuCapDigest(cap?.ssuCapDigest ?? null);
        }
      })
      .catch(() => {
        if (!aborted) {
          setIsSsuOwner(false);
          setSsuCapId(null);
          setSsuCapVersion(null);
          setSsuCapDigest(null);
        }
      })
      .finally(() => { if (!aborted) setSsuLoading(false); });

    return () => { aborted = true; };
  }, [characterId, effectiveSsuId]);

  return {
    characterId,
    ownerCapId,
    isSsuOwner,
    ssuCapId,
    ssuCapVersion,
    ssuCapDigest,
    isLoading: charLoading || ssuLoading,
    error,
  };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
