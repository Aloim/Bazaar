/**
 * @bazaar/shared/contexts — Shared React contexts.
 *
 * Note: BazaarProvider.tsx exists as scaffolding for standard @mysten/dapp-kit
 * adoption but is NOT exported here — it imports bare @mysten/dapp-kit which is
 * not installed. See FP1-32 for the wire-or-retire decision.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

export { ClaimBoxProvider, useClaimBoxContext } from "./ClaimBoxContext";
