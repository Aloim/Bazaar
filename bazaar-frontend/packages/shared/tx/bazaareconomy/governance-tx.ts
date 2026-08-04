// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy governance TX builders.
 *
 * Economy setup (one-time deployment):
 *   buildBootstrapAdvancedComplete (V17 atomic; replaces buildInitializeTribeEconomy),
 *   buildReceiveShopCap, buildReceiveTaxDepositCap
 *
 * TribeLeaderCap gated:
 *   buildMintSupply, buildBurnTokens,
 *   buildAddLiquidity, buildSetSupplyCap, buildSetRequiredApprovals
 *
 * DApp Owner gated:
 *   buildSetReserve, buildSetExchangeFeeOverride,
 *   buildSetLedgerFrozen, buildLockVault, buildUnlockVault
 *
 * Move module: bazaar_economy::economy_governance
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { PACKAGE_IDS, SHARED_OBJECTS, MODULES } from "../../constants";

// ── Economy Setup (one-time deployment) ───────────────────────────────────────

/**
 * V19 atomic Advanced-tribe bootstrap. Successor to V17/V18 which took a
 * `initial_reserve_mist: u64` configuration number; V19 takes a `Coin<EVE>`
 * deposit that is seeded directly into the freshly-created TribeVault.
 *
 * Behavior:
 *  - Deposit asserts `>= 1 EVE` (the new fixed reserve floor).
 *  - Reserve floor on ExchangeConfig is hardcoded at 1 EVE — no longer user-input.
 *  - 100_000 tribe tokens are minted to the tribe wallet (`gov.id_address`)
 *    as a one-shot genesis allocation (bypasses Article XIII.4 mint-block).
 *  - All 7 shared objects (TribeGovernance, WidgetConfig, TribeTokenLedger,
 *    TribeVault, ExchangeConfig, WithdrawalBoard, MintBurnQueue) created and
 *    shared atomically; both tribe_registry one-shot setters fire in the same TX.
 *
 * Token name/symbol are read from the Tribe row (set at create_advanced_tribe
 * time); FE form displays them read-only.
 *
 * Pattern A — caller pre-splits the Coin<EVE> via `splitEveCoin(walletAddress,
 * BigInt(depositMist), tx)` and passes the resulting `TransactionArgument` as
 * `initialDepositCoin`. The builder mutates `tx` in place and returns it.
 *
 * Move: bazaar_economy::economy_governance::bootstrap_advanced_complete
 * Sig: (leader_cap, registry, package_id, initial_deposit: Coin<EVE>,
 *       initial_required_approvals, clock, ctx)
 *
 * Aborts (frequently surfaced in UI):
 *   - 11 (economy_governance::E_DEPOSIT_TOO_SMALL) — deposit < 1 EVE
 *   - bazaar_assertions::E_NOT_ADVANCED_BAZAAR — tribe is Easy (use buildBootstrapTribeGovernance instead)
 *   - tribe_registry::E_ALREADY_SET — tribe already partially bootstrapped
 *   - tribe_registry::E_NOT_TRIBE_LEADER — leader_cap mismatch
 */
export function buildBootstrapAdvancedComplete(
  params: {
    leaderCapId: string;
    tribeRegistryId: string;
    /** Bazaar Core package ID — passed in so the on-chain WidgetConfig binds the
     *  correct package address even after fresh-publish cascades. */
    packageId: string;
    /** Pre-split Coin<EVE> from splitEveCoin(walletAddress, BigInt(depositMist), tx).
     *  Must carry value ≥ 1 EVE (1_000_000_000 MIST). */
    initialDepositCoin: TransactionArgument;
    initialRequiredApprovals: number;
  },
  tx: Transaction,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ECONOMY_GOVERNANCE}::bootstrap_advanced_complete`,
    arguments: [
      tx.object(params.leaderCapId),                          // leader_cap [0]
      tx.object(params.tribeRegistryId),                      // registry [1]
      tx.pure.address(params.packageId),                      // package_id [2]
      params.initialDepositCoin,                              // initial_deposit: Coin<EVE> [3]
      tx.pure.u64(BigInt(params.initialRequiredApprovals)),   // initial_required_approvals [4]
      tx.object("0x6"),                                       // clock [5]
    ],
  });
  return tx;
}

/**
 * Transfer TribeTokenShopCap into EconomyCapStore (DApp Owner only, one-time).
 *
 * Move: bazaar_economy::economy_governance::receive_shop_cap
 * Sig:  (store: &mut EconomyCapStore, cap: TribeTokenShopCap, owner_cap: &DAppOwnerCap)
 */
export function buildReceiveShopCap(params: {
  economyCapStoreId: string;
  shopCapId: string;
  ownerCapId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ECONOMY_GOVERNANCE}::receive_shop_cap`,
    arguments: [
      tx.object(params.economyCapStoreId),
      tx.object(params.shopCapId),
      tx.object(params.ownerCapId),
    ],
  });
  return tx;
}

/**
 * Transfer TaxDepositCap into EconomyCapStore (DApp Owner only, one-time).
 *
 * Move: bazaar_economy::economy_governance::receive_tax_deposit_cap
 * Sig:  (store: &mut EconomyCapStore, cap: TaxDepositCap, owner_cap: &DAppOwnerCap)
 */
export function buildReceiveTaxDepositCap(params: {
  economyCapStoreId: string;
  taxDepositCapId: string;
  ownerCapId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ECONOMY_GOVERNANCE}::receive_tax_deposit_cap`,
    arguments: [
      tx.object(params.economyCapStoreId),
      tx.object(params.taxDepositCapId),
      tx.object(params.ownerCapId),
    ],
  });
  return tx;
}

// ── TribeLeaderCap Gated ───────────────────────────────────────────────────────

// V16: `buildMintSupply` + `buildBurnTokens` were RETIRED — the Move entries
// `economy_governance::mint_supply` + `burn_tokens` were deleted. Use the new
// `mint_burn_queue` builders (24h-wait + single-rejection-veto) instead:
//   buildRequestMintAsLeader / buildRequestMintAsAdmin
//   buildRequestBurnAsLeader / buildRequestBurnAsAdmin
//   buildExecuteRequestAsLeader / buildExecuteRequestAsAdmin
//   buildRejectRequestAsLeader / buildRejectRequestAsAdmin
// See `packages/shared/tx/bazaareconomy/mint-burn-queue-tx.ts`.

/**
 * Tribe Leader adds EVE liquidity to the vault.
 *
 * Move: bazaar_economy::economy_governance::add_liquidity
 * Sig:  (cap: &TribeLeaderCap, tribe_gov: &TribeGovernance,
 *        vault: &mut TribeVault, ledger: &TribeTokenLedger,
 *        payment: Coin<EVE>, clock: &Clock, ctx: &mut TxContext)
 *
 * V15: ledger added so FinanceEvent emit can snapshot circulation.
 * paymentCoin is a pre-split Coin<EVE> from splitEveCoin().
 */
export function buildAddLiquidity(
params: {
  leaderCapId: string;
  tribeGovernanceId: string;   // R5.2.b.3 — TribeGovernance shared object
  vaultId: string;
  ledgerId: string;             // V15 — TribeTokenLedger for circulation snapshot
  amountMist: number;
  /** Pre-split Coin<EVE> from splitEveCoin(walletAddress, BigInt(amountMist), tx). */
  paymentCoin: TransactionArgument;
},
tx: Transaction,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ECONOMY_GOVERNANCE}::add_liquidity`,
    arguments: [
      tx.object(params.leaderCapId),            // cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovernanceId),       // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.vaultId),                 // vault: &mut TribeVault [2]
      tx.object(params.ledgerId),                // ledger: &TribeTokenLedger [3] V15
      params.paymentCoin,                        // payment: Coin<EVE> [4]
      tx.object("0x6"),                          // clock: &Clock [5]
    ],
  });
  return tx;
}

/**
 * Set or clear the tribe token supply cap (TribeLeaderCap gated).
 *
 * Move: bazaar_economy::economy_governance::set_supply_cap
 * Sig:  (cap: &TribeLeaderCap, ledger: &mut TribeTokenLedger,
 *        new_cap: u64, clock: &Clock, _ctx: &mut TxContext)
 *
 * 0 = no cap (uncapped). Non-zero must be >= current total_supply.
 */
export function buildSetSupplyCap(params: {
  leaderCapId: string;
  tribeGovernanceId: string;   // R5.2.b.3 — TribeGovernance shared object
  ledgerId: string;
  newCap: number;    // 0 = uncapped
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ECONOMY_GOVERNANCE}::set_supply_cap`,
    arguments: [
      tx.object(params.leaderCapId),            // cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovernanceId),       // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.ledgerId),                // ledger: &mut TribeTokenLedger [2]
      tx.pure.u64(BigInt(params.newCap)),        // new_cap: u64 [3]
      tx.object("0x6"),                          // clock: &Clock [4]
    ],
  });
  return tx;
}

/**
 * Set the withdrawal approval quorum (TribeLeaderCap gated).
 *
 * Move: bazaar_economy::economy_governance::set_required_approvals
 * Sig:  (cap: &TribeLeaderCap, board: &mut WithdrawalBoard,
 *        n: u64, _clock: &Clock, _ctx: &mut TxContext)
 *
 * Must be between 1 and 10 (MIN_QUORUM..MAX_QUORUM).
 */
export function buildSetRequiredApprovals(params: {
  leaderCapId: string;
  tribeGovernanceId: string;   // R5.2.b.3 — TribeGovernance shared object
  boardId: string;
  requiredApprovals: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ECONOMY_GOVERNANCE}::set_required_approvals`,
    arguments: [
      tx.object(params.leaderCapId),            // cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovernanceId),       // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.boardId),                 // board: &mut WithdrawalBoard [2]
      tx.pure.u64(BigInt(params.requiredApprovals)), // n: u64 [3]
      tx.object("0x6"),                          // _clock: &Clock [4]
    ],
  });
  return tx;
}

// ── DApp Owner Gated ──────────────────────────────────────────────────────────

/**
 * Set the reserve floor for a tribe's exchange (DApp Owner only).
 *
 * Move: bazaar_economy::economy_governance::set_reserve
 * Sig:  (_owner_cap: &DAppOwnerCap, config: &mut ExchangeConfig,
 *        reserve_mist: u64, clock: &Clock, _ctx: &mut TxContext)
 *
 * Max: 1_000_000_000_000 MIST (1000 SUI). Article XIII.5.
 */
export function buildSetReserve(params: {
  ownerCapId: string;
  tribeGovernanceId: string;   // R5.2.b.3 — TribeGovernance shared object
  configId: string;
  reserveMist: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ECONOMY_GOVERNANCE}::set_reserve`,
    arguments: [
      tx.object(params.ownerCapId),             // _owner_cap: &DAppOwnerCap [0]
      tx.object(params.tribeGovernanceId),       // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.configId),                // config: &mut ExchangeConfig [2]
      tx.pure.u64(BigInt(params.reserveMist)),   // reserve_mist: u64 [3]
      tx.object("0x6"),                          // clock: &Clock [4]
    ],
  });
  return tx;
}

/**
 * Override the exchange fee for a specific tribe (DApp Owner only).
 *
 * Move: bazaar_economy::economy_governance::set_exchange_fee_override
 * Sig:  (_owner_cap: &DAppOwnerCap, config: &mut ExchangeConfig,
 *        override_bps: Option<u64>, clock: &Clock, _ctx: &mut TxContext)
 *
 * Pass null to revert to the global dApp rate.
 * Max 5000 bps (50%). CC-003 function.
 */
export function buildSetExchangeFeeOverride(params: {
  ownerCapId: string;
  tribeGovernanceId: string;     // R5.2.b.3 — TribeGovernance shared object
  configId: string;
  overrideBps: number | null;    // null -> option::none() in Move
}): Transaction {
  const tx = new Transaction();
  const optionArg = params.overrideBps !== null
    ? tx.pure(bcs.option(bcs.u64()).serialize({ Some: BigInt(params.overrideBps) }).toBytes())
    : tx.pure(bcs.option(bcs.u64()).serialize(null).toBytes());
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ECONOMY_GOVERNANCE}::set_exchange_fee_override`,
    arguments: [
      tx.object(params.ownerCapId),             // _owner_cap: &DAppOwnerCap [0]
      tx.object(params.tribeGovernanceId),       // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.configId),                // config: &mut ExchangeConfig [2]
      optionArg,                                 // override_bps: Option<u64> [3]
      tx.object("0x6"),                          // clock: &Clock [4]
    ],
  });
  return tx;
}

/**
 * Freeze or unfreeze a tribe's token ledger (DApp Owner only, emergency).
 *
 * Move: bazaar_economy::economy_governance::set_ledger_frozen
 * Sig:  (_owner_cap: &DAppOwnerCap, ledger: &mut TribeTokenLedger,
 *        frozen: bool, clock: &Clock, ctx: &mut TxContext)
 *
 * When frozen: all ledger transfers, mints, and swaps are blocked.
 */
export function buildSetLedgerFrozen(params: {
  ownerCapId: string;
  tribeGovernanceId: string;   // R5.2.b.3 — TribeGovernance shared object
  ledgerId: string;
  frozen: boolean;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ECONOMY_GOVERNANCE}::set_ledger_frozen`,
    arguments: [
      tx.object(params.ownerCapId),             // _owner_cap: &DAppOwnerCap [0]
      tx.object(params.tribeGovernanceId),       // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.ledgerId),                // ledger: &mut TribeTokenLedger [2]
      tx.pure.bool(params.frozen),               // frozen: bool [3]
      tx.object("0x6"),                          // clock: &Clock [4]
    ],
  });
  return tx;
}

/**
 * Lock a tribe vault (DApp Owner only, emergency).
 *
 * Move: bazaar_economy::economy_governance::lock_vault
 * Sig:  (_owner_cap: &DAppOwnerCap, vault: &mut TribeVault,
 *        clock: &Clock, _ctx: &mut TxContext)
 */
export function buildLockVault(params: {
  ownerCapId: string;
  tribeGovernanceId: string;   // R5.2.b.3 — TribeGovernance shared object
  vaultId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ECONOMY_GOVERNANCE}::lock_vault`,
    arguments: [
      tx.object(params.ownerCapId),             // _owner_cap: &DAppOwnerCap [0]
      tx.object(params.tribeGovernanceId),       // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.vaultId),                 // vault: &mut TribeVault [2]
      tx.object("0x6"),                          // clock: &Clock [3]
    ],
  });
  return tx;
}

/**
 * Unlock a tribe vault (DApp Owner only).
 *
 * Move: bazaar_economy::economy_governance::unlock_vault
 * Sig:  (_owner_cap: &DAppOwnerCap, vault: &mut TribeVault,
 *        clock: &Clock, _ctx: &mut TxContext)
 */
export function buildUnlockVault(params: {
  ownerCapId: string;
  tribeGovernanceId: string;   // R5.2.b.3 — TribeGovernance shared object
  vaultId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.ECONOMY_GOVERNANCE}::unlock_vault`,
    arguments: [
      tx.object(params.ownerCapId),             // _owner_cap: &DAppOwnerCap [0]
      tx.object(params.tribeGovernanceId),       // tribe_gov: &TribeGovernance [1] R5.2
      tx.object(params.vaultId),                 // vault: &mut TribeVault [2]
      tx.object("0x6"),                          // clock: &Clock [3]
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
