// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarEconomy exchange TX builders.
 *
 * buildSwapEveToTokens  — EVE -> tribe token ledger credit
 * buildSwapTokensToEve  — tribe token burn -> EVE (internal transfer in Move)
 *
 * Move module: bazaar_economy::tribe_exchange
 *
 * SDC-004 NOTE: Both builders accept (params, tx): Transaction — canonical shape.
 * swap_tokens_to_eve calls transfer::public_transfer internally
 * (tribe_exchange.move line 255). PTB does NOT need transferObjects for EVE output.
 * swap_eve_to_tokens credits the ledger — no coin returned to PTB.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import { PACKAGE_IDS, SHARED_OBJECTS, MODULES } from "../../constants";

// ── buildSwapEveToTokens ───────────────────────────────────────────────────────

/**
 * Player swaps EVE for tribe token ledger credits.
 *
 * Move: bazaar_economy::tribe_exchange::swap_eve_to_tokens
 * Sig:  (ledger: &mut TribeTokenLedger, vault: &mut TribeVault,
 *        config: &mut ExchangeConfig, tribe_gov: &TribeGovernance,
 *        payment: Coin<EVE>,
 *        dapp_tax_wallet: &mut DAppTaxWallet, dapp_config: &GovernanceConfig,
 *        cap_store: &EconomyCapStore, clock: &Clock, ctx: &mut TxContext)
 * (AUD-ADV-22: the omitted tribe_gov arg [3] added to this Sig block —
 *  the code below always passed it.)
 *
 * paymentCoin is a pre-split Coin<EVE> from splitEveCoin().
 * dapp_tax_wallet, dapp_config, cap_store are singleton shared objects from constants.
 * No coin is returned to PTB — tokens are credited to sender's ledger balance.
 */
export function buildSwapEveToTokens(
params: {
  ledgerId: string;
  vaultId: string;
  configId: string;
  tribeGovernanceId: string;  // R5.2.b.3 — TribeGovernance shared object
  paymentAmountMist: number;
  /** Pre-split Coin<EVE> from splitEveCoin(walletAddress, BigInt(paymentAmountMist), tx). */
  paymentCoin: TransactionArgument;
},
tx: Transaction,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.TRIBE_EXCHANGE}::swap_eve_to_tokens`,
    arguments: [
      tx.object(params.ledgerId),                         // ledger: &mut TribeTokenLedger [0]
      tx.object(params.vaultId),                          // vault: &mut TribeVault [1]
      tx.object(params.configId),                         // config: &mut ExchangeConfig [2]
      tx.object(params.tribeGovernanceId),                // tribe_gov: &TribeGovernance [3] R5.2
      params.paymentCoin,                                  // payment: Coin<EVE> [4]
      tx.object(SHARED_OBJECTS.TAX_WALLET),               // dapp_tax_wallet: &mut DAppTaxWallet [5]
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),        // dapp_config: &GovernanceConfig [6]
      tx.object(SHARED_OBJECTS.ECONOMY_CAP_STORE),        // cap_store: &EconomyCapStore [7]
      tx.object("0x6"),                                   // clock: &Clock [8]
    ],
  });
  return tx;
}

// ── buildSwapTokensToEve ───────────────────────────────────────────────────────

/**
 * Player burns tribe token ledger balance to receive EVE (SUI).
 *
 * Move: bazaar_economy::tribe_exchange::swap_tokens_to_eve
 * Sig:  (ledger: &mut TribeTokenLedger, vault: &mut TribeVault,
 *        config: &mut ExchangeConfig, tribe_gov: &TribeGovernance,
 *        tokens_to_burn: u64,
 *        dapp_tax_wallet: &mut DAppTaxWallet, dapp_config: &GovernanceConfig,
 *        cap_store: &EconomyCapStore, clock: &Clock, ctx: &mut TxContext)
 * (AUD-ADV-22: the omitted tribe_gov arg [3] added to this Sig block.)
 *
 * tokens_to_burn is the count of ledger balance units to burn (NOT Coin<T>).
 * Move internally calls transfer::public_transfer to send net EVE to sender.
 * PTB does NOT need transferObjects — no Coin is returned from the move call.
 */
export function buildSwapTokensToEve(
  params: {
    ledgerId: string;
    vaultId: string;
    configId: string;
    tribeGovernanceId: string;  // R5.2.b.3 — TribeGovernance shared object
    /** V26 D8 polish: accepts bigint for precision past 2^53 scaled units
     *  (= ~9 quadrillion = ~90 trillion display tokens at decimals=2).
     *  number still accepted for backward compatibility. */
    tokensToBurn: number | bigint;
  },
  tx: Transaction,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_ECONOMY}::${MODULES.TRIBE_EXCHANGE}::swap_tokens_to_eve`,
    arguments: [
      tx.object(params.ledgerId),                         // ledger: &mut TribeTokenLedger [0]
      tx.object(params.vaultId),                          // vault: &mut TribeVault [1]
      tx.object(params.configId),                         // config: &mut ExchangeConfig [2]
      tx.object(params.tribeGovernanceId),                // tribe_gov: &TribeGovernance [3] R5.2
      tx.pure.u64(
        typeof params.tokensToBurn === "bigint" ? params.tokensToBurn : BigInt(params.tokensToBurn),
      ),                                                  // tokens_to_burn: u64 [4]
      tx.object(SHARED_OBJECTS.TAX_WALLET),               // dapp_tax_wallet: &mut DAppTaxWallet [5]
      tx.object(SHARED_OBJECTS.GOVERNANCE_CONFIG),        // dapp_config: &GovernanceConfig [6]
      tx.object(SHARED_OBJECTS.ECONOMY_CAP_STORE),        // cap_store: &EconomyCapStore [7]
      tx.object("0x6"),                                   // clock: &Clock [8]
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
