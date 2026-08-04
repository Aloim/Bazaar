/**
 * character.ts — Character-related type definitions for EVE Frontier player representation.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

// TypeScript mirrors of EVE Frontier world-contract character structs.
// Source: Documentation/Knowledge/EVEFrontier-CharacterResolution.md §4
// and @evefrontier/dapp-kit type exports.
//
// These types are consumed by useCharacterForAddress, useCharacterNames,
// usePlayerCharacter, and any component that displays player identity.

// ── On-chain struct mirrors ────────────────────────────────────────────────────

/**
 * Mirrors `world::character::Metadata` (Move).
 * The `name` field is the in-game display name set by update_metadata_name.
 */
export interface CharacterMetadata {
  assemblyId:  string;
  name:        string;
  description: string;
  url:         string;
}

/**
 * Mirrors `world::character::Character` (Move shared object).
 * Partial — only fields used by frontend hooks are included.
 */
export interface Character {
  id:              string;
  tribeId:         number;
  characterAddress: string;
  metadata:        CharacterMetadata | null;
  ownerCapId:      string;
}

/**
 * Mirrors `world::character::PlayerProfile` (Move owned object).
 * Owned by the wallet — used as the starting point for character resolution.
 */
export interface PlayerProfile {
  id:          string;
  characterId: string;
}

// ── Hook return types ──────────────────────────────────────────────────────────

/**
 * Return shape of useCharacterForAddress.
 * Populated after a 2-step RPC resolution chain.
 */
export interface CharacterInfo {
  characterId: string | null;
  ownerCapId:  string | null;
  isLoading:   boolean;
  error:       string | null;
}

/**
 * Fully resolved player identity — return shape of usePlayerCharacter.
 * ownerCapVersion and ownerCapDigest are required for tx.receivingRef().
 * They go stale after each borrow/return cycle — call resolveCapRef() before TX.
 */
export interface PlayerCharacter {
  characterId:     string;
  ownerCapId:      string;
  ownerCapVersion: string;
  ownerCapDigest:  string;
}

/**
 * Runtime name-tag entry produced by useCharacterNames resolution.
 * `address` is the wallet address; `name` is the resolved EVE character display name.
 * If resolution failed, this entry is absent from the returned Map.
 */
export interface NameTagRuntime {
  address: string;
  name:    string;
}
