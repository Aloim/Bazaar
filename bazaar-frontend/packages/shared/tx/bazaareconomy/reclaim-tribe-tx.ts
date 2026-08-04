// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Update Ceremony V2 — Phase 2 (Slice 5): tribe reclaim TX builders.
 *
 * The tribe leader re-materialises their orphaned tribe on the NEW packages in a
 * multi-PTB flow (the landed bazaar_economy::reclaim_tribe design — the shared
 * objects created by PTB 1 are only known after it executes):
 *
 *   PTB 1   buildReclaimTribe           → reclaim_tribe (consume record + remap +
 *           create fresh tribe + bootstrap governance + Advanced economy objects).
 *           Resolve the new TribeGovernance / ledger / vault ids from the events.
 *   PTB 2.. buildReclaimTribeMintPage   → reclaim_tribe_mint_page (Advanced only;
 *           re-mint snapshot token balances, paged; CEREMONY-GATED on the NEW gate).
 *   PTB     buildReclaimTribeVaultDeposit→ Advanced only; OLD vault EVE drain →
 *           deposit_reclaimed_vault_eve into the new vault.
 *   PTB last buildReclaimTribeRestore    → reclaim_tribe_restore (mission fee +
 *           global bans + lazy-drained gov EVE).
 *
 * LAZY EVE DRAIN (design §4.3): gov + vault EVE are pulled from the OUTGOING
 * version's leader-gated, CEREMONY-GATED legacy withdraws and fed straight into the
 * NEW restore/deposit calls — no permanent cross-version Move dep. The OLD withdraws
 * read the OUTGOING CeremonyGate (NOT the new one — pass `oldGateId` explicitly).
 *
 * GATING: callers MUST check `reclaimEnabled()` (and, for the drain/mint legs,
 * `outgoingDrainEnabled()` / a non-empty CEREMONY_GATE_ID) before building.
 */

import { Transaction } from "@mysten/sui/transactions";
import type { TransactionArgument } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import {
  PACKAGE_IDS,
  MODULES,
  SHARED_OBJECTS,
  RECLAIM_REGISTRY_ID,
  CEREMONY_GATE_ID,
  OUTGOING_PACKAGE_IDS,
  EVE_COIN_TYPE,
  SUI_CLOCK_ID,
} from "../../constants";
import { TribeLeaderPayloadBcs } from "../../ceremony/reclaim/payloads";

// ───────────────────────── payload decode (restore args) ────────────────────────

export interface DecodedBalanceRow { addr: string; amount: bigint }
export interface DecodedTribeBanRow { addr: string; expiresAtMs: bigint }

/** The TribeLeaderPayload fields the reclaim PTBs need (decoded from the record blob). */
export interface DecodedTribeLeaderPayload {
  originalTribeId: bigint;
  name: string;
  bazaarType: number;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenSupplyCap: bigint;
  originalTotalSupply: bigint;
  missionListingFeePerHour: bigint;
  globalBans: DecodedTribeBanRow[];
  tokenBalances: DecodedBalanceRow[];
}

function toBytes(blob: Uint8Array | number[]): Uint8Array {
  return blob instanceof Uint8Array ? blob : Uint8Array.from(blob);
}

/** Decode a TRIBE_LEADER record payload into the typed reclaim args. */
export function decodeTribeLeaderPayload(blob: Uint8Array | number[]): DecodedTribeLeaderPayload {
  const p = TribeLeaderPayloadBcs.parse(toBytes(blob));
  return {
    originalTribeId: BigInt(p.original_tribe_id),
    name: p.name,
    bazaarType: p.bazaar_type,
    tokenName: p.token_name,
    tokenSymbol: p.token_symbol,
    tokenDecimals: p.token_decimals,
    tokenSupplyCap: BigInt(p.token_supply_cap),
    originalTotalSupply: BigInt(p.original_total_supply),
    missionListingFeePerHour: BigInt(p.mission_listing_fee_per_hour),
    globalBans: p.global_bans.map((b) => ({ addr: b.addr, expiresAtMs: BigInt(b.expires_at_ms) })),
    tokenBalances: p.token_balances.map((b) => ({ addr: b.addr, amount: BigInt(b.amount) })),
  };
}

// ────────────────────────────── PTB 1 — create ──────────────────────────────────

export interface ReclaimTribeParams {
  /** Pre-split Coin<EVE> funding tribe creation (splitEveCoin(wallet, feeMist, tx).coinArg). */
  feePaymentCoin: TransactionArgument;
  originalTribeId: number | bigint;
  /** Advanced multisig quorum (1..=10); ignored for Easy. Default 1. */
  initialRequiredApprovals?: number;
  reclaimRegistryId?: string;
  tribeRegistryId?: string;
  governanceConfigId?: string;
  taxWalletId?: string;
  /** Authorized-package binding for the bootstrapped governance (the NEW bazaar_core). */
  packageId?: string;
}

/**
 * Build PTB 1 — `bazaar_economy::reclaim_tribe::reclaim_tribe`.
 * Sig: (reclaim_registry: &mut, tribe_registry: &mut, config: &GovernanceConfig,
 *       wallet: &mut DAppTaxWallet, fee_payment: Coin<EVE>, package_id: address,
 *       original_tribe_id: u64, initial_required_approvals: u64, clock, ctx)
 */
export function buildReclaimTribe(
  params: ReclaimTribeParams,
  tx: Transaction = new Transaction(),
): Transaction {
  // Clamp to the Move bound 1..=10 (E_INVALID_QUORUM) so a stray default never aborts.
  const quorum = Math.min(10, Math.max(1, params.initialRequiredApprovals ?? 1));
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.RECLAIM_TRIBE}::reclaim_tribe`,
    arguments: [
      tx.object(params.reclaimRegistryId ?? RECLAIM_REGISTRY_ID),
      tx.object(params.tribeRegistryId ?? SHARED_OBJECTS.TRIBE_REGISTRY),
      tx.object(params.governanceConfigId ?? SHARED_OBJECTS.GOVERNANCE_CONFIG),
      tx.object(params.taxWalletId ?? SHARED_OBJECTS.TAX_WALLET),
      params.feePaymentCoin,
      tx.pure.address(params.packageId ?? PACKAGE_IDS.BAZAAR_CORE),
      tx.pure.u64(BigInt(params.originalTribeId)),
      tx.pure.u64(BigInt(quorum)),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ──────────────────────── PTB 2.. — Advanced token re-mint ───────────────────────

/** FE mint page size — kept small for gas; the Move entry has no hard row cap. */
export const RECLAIM_MINT_PAGE_SIZE = 50;

export interface ReclaimTribeMintPageParams {
  leaderCapId: string;
  ledgerId: string;
  /** The NEW CeremonyGate (CEREMONY_GATE_ID) — mint-page is inert outside the ceremony. */
  ceremonyGateId?: string;
  holders: string[];
  amounts: (bigint | number | string)[];
}

/**
 * Build one `reclaim_tribe_mint_page` call (Advanced only).
 * Sig: (leader_cap: &TribeLeaderCap, ledger: &mut TribeTokenLedger, gate: &CeremonyGate,
 *       holders: vector<address>, amounts: vector<u64>, clock, _ctx)
 */
export function buildReclaimTribeMintPage(
  params: ReclaimTribeMintPageParams,
  tx: Transaction = new Transaction(),
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.RECLAIM_TRIBE}::reclaim_tribe_mint_page`,
    arguments: [
      tx.object(params.leaderCapId),
      tx.object(params.ledgerId),
      tx.object(params.ceremonyGateId ?? CEREMONY_GATE_ID),
      tx.pure(bcs.vector(bcs.Address).serialize(params.holders).toBytes()),
      tx.pure(bcs.vector(bcs.u64()).serialize(params.amounts.map((a) => BigInt(a))).toBytes()),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export interface MintPage {
  index: number;
  rows: DecodedBalanceRow[];
  tx: Transaction;
}

/**
 * Split a balance set into signed mint pages of ≤ pageSize rows. Each page is one
 * `reclaim_tribe_mint_page` call. The leader signs them sequentially within the
 * ceremony window; total minted == Σ balances (bounded by the snapshot supply cap).
 */
export function buildReclaimTribeMintPages(
  balances: DecodedBalanceRow[],
  opts: { leaderCapId: string; ledgerId: string; ceremonyGateId?: string; pageSize?: number },
): MintPage[] {
  const size = Math.max(1, opts.pageSize ?? RECLAIM_MINT_PAGE_SIZE);
  const pages: MintPage[] = [];
  for (let i = 0; i < balances.length; i += size) {
    const rows = balances.slice(i, i + size);
    const tx = buildReclaimTribeMintPage({
      leaderCapId: opts.leaderCapId,
      ledgerId: opts.ledgerId,
      ceremonyGateId: opts.ceremonyGateId,
      holders: rows.map((r) => r.addr),
      amounts: rows.map((r) => r.amount),
    });
    pages.push({ index: pages.length, rows, tx });
  }
  return pages;
}

// ─────────────────────── Advanced — vault EVE lazy-drain restore ─────────────────

/** OLD-version vault legacy-withdraw spec (CEREMONY-GATED on the OUTGOING gate). */
export interface TribeVaultDrainSpec {
  oldLeaderCapId: string;
  oldVaultId: string;
  /** The OUTGOING CeremonyGate id the OLD withdraw reads (NOT the new gate). */
  oldGateId: string;
  /** OUTGOING bazaar_economy package id (defaults to OUTGOING_PACKAGE_IDS.BAZAAR_ECONOMY). */
  outgoingBazaarEconomyPkg?: string;
}

export interface ReclaimTribeVaultDepositParams {
  /** NEW TribeLeaderCap (owned). */
  leaderCapId: string;
  /** NEW TribeVault (shared, resolved from PTB 1). */
  vaultId: string;
  /** Optional OLD vault drain; omitted ⇒ a zero coin is deposited (no-op). */
  drain?: TribeVaultDrainSpec;
}

/**
 * Build the Advanced vault EVE restore: OLD `withdraw_legacy_tribe_vault → coin →
 * NEW deposit_reclaimed_vault_eve`. A zero coin is a no-op (Move destroys it).
 * Sig (new): deposit_reclaimed_vault_eve(cap: &TribeLeaderCap, vault: &mut TribeVault,
 *            eve_coin: Coin<EVE>, clock, ctx)
 */
export function buildReclaimTribeVaultDeposit(
  params: ReclaimTribeVaultDepositParams,
  tx: Transaction = new Transaction(),
): Transaction {
  let coin;
  if (params.drain) {
    const oldEcon = params.drain.outgoingBazaarEconomyPkg ?? OUTGOING_PACKAGE_IDS.BAZAAR_ECONOMY;
    [coin] = tx.moveCall({
      target: `${oldEcon}::${MODULES.TRIBE_VAULT}::withdraw_legacy_tribe_vault`,
      arguments: [
        tx.object(params.drain.oldLeaderCapId),
        tx.object(params.drain.oldVaultId),
        tx.object(params.drain.oldGateId),
        tx.object(SUI_CLOCK_ID),
      ],
    });
  } else {
    [coin] = tx.moveCall({ target: "0x2::coin::zero", typeArguments: [EVE_COIN_TYPE], arguments: [] });
  }
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.TRIBE_VAULT}::deposit_reclaimed_vault_eve`,
    arguments: [
      tx.object(params.leaderCapId),
      tx.object(params.vaultId),
      coin,
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ────────────────────────────── PTB last — restore ──────────────────────────────

/** OLD-version gov-EVE legacy-withdraw spec (CEREMONY-GATED on the OUTGOING gate). */
export interface TribeGovDrainSpec {
  oldLeaderCapId: string;
  oldTribeGovId: string;
  /** The OUTGOING CeremonyGate id the OLD withdraw reads (NOT the new gate). */
  oldGateId: string;
  /** OUTGOING bazaar_core package id (defaults to OUTGOING_PACKAGE_IDS.BAZAAR_CORE). */
  outgoingBazaarCorePkg?: string;
}

export interface ReclaimTribeRestoreParams {
  leaderCapId: string;
  tribeGovId: string;
  /** The consumed record's TribeLeaderPayload blob (decoded TS-side for the restore args). */
  payloadBlob: Uint8Array | number[];
  /** Reclaim time (ms) — bans whose expiry <= now are pre-filtered. */
  nowMs: number;
  /** Optional gov-EVE lazy drain; omitted ⇒ a zero coin is deposited. */
  drain?: TribeGovDrainSpec;
}

/**
 * Build PTB last — `bazaar_economy::reclaim_tribe::reclaim_tribe_restore`, composing
 * the gov-EVE lazy drain into the same PTB.
 * Sig: (leader_cap: &TribeLeaderCap, gov: &mut TribeGovernance, gov_eve_coin: Coin<EVE>,
 *       mission_listing_fee_per_hour: u64, ban_addrs: vector<address>,
 *       ban_expiries: vector<u64>, clock, ctx)
 */
export function buildReclaimTribeRestore(
  params: ReclaimTribeRestoreParams,
  tx: Transaction = new Transaction(),
): Transaction {
  const p = decodeTribeLeaderPayload(params.payloadBlob);

  const now = BigInt(params.nowMs);
  const liveBans = p.globalBans.filter((b) => b.expiresAtMs > now);
  const banAddrs = liveBans.map((b) => b.addr);
  const banExpiries = liveBans.map((b) => b.expiresAtMs);

  // Gov-EVE lazy drain (OLD tribe_admin_drain, OUTGOING-gate gated) or a zero coin.
  let govEveCoin;
  if (params.drain) {
    const oldCore = params.drain.outgoingBazaarCorePkg ?? OUTGOING_PACKAGE_IDS.BAZAAR_CORE;
    [govEveCoin] = tx.moveCall({
      target: `${oldCore}::${MODULES.TRIBE_ADMIN_DRAIN}::withdraw_legacy_tribe_gov_eve`,
      arguments: [
        tx.object(params.drain.oldLeaderCapId),
        tx.object(params.drain.oldTribeGovId),
        tx.object(params.drain.oldGateId),
        tx.object(SUI_CLOCK_ID),
      ],
    });
  } else {
    [govEveCoin] = tx.moveCall({ target: "0x2::coin::zero", typeArguments: [EVE_COIN_TYPE], arguments: [] });
  }

  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.RECLAIM_TRIBE}::reclaim_tribe_restore`,
    arguments: [
      tx.object(params.leaderCapId),
      tx.object(params.tribeGovId),
      govEveCoin,
      tx.pure.u64(p.missionListingFeePerHour),
      tx.pure(bcs.vector(bcs.Address).serialize(banAddrs).toBytes()),
      tx.pure(bcs.vector(bcs.u64()).serialize(banExpiries).toBytes()),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
