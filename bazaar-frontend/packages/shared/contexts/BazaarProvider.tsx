/**
 * BazaarProvider.tsx — Shared context wrapper for Bazaar apps.
 *
 * Wraps the standard @mysten/dapp-kit SuiClientProvider and WalletProvider
 * together with a QueryClient. Each Bazaar app mounts this at root.
 *
 * Note: Apps currently using @evefrontier/dapp-kit will continue to use
 * their own provider wrappers. This component is the shared target for
 * the standard dapp-kit integration path.
 *
 * AP2-TODO (FP1-32): This file is orphan scaffolding. @mysten/dapp-kit is not
 * installed; this component has no call sites and is excluded from the
 * contexts/index.ts barrel. Decide: (a) install @mysten/dapp-kit + migrate all
 * 4 apps; (b) rewrite against @evefrontier/dapp-kit; or (c) delete. See
 * FutureFixplan2.md FP1-32. Natural pairing: AP2-E (CustomClientBanner).
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { NETWORK } from "../constants";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const networks = {
  testnet: { url: NETWORK.RPC_URL },
  mainnet: { url: getFullnodeUrl("mainnet") },
} as const;

type NetworkKey = keyof typeof networks;

function getNetworkKey(): NetworkKey {
  if (NETWORK.CHAIN === "sui:mainnet") return "mainnet";
  return "testnet";
}

interface BazaarProviderProps {
  children: ReactNode;
}

export default function BazaarProvider({ children }: BazaarProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider
        networks={networks}
        defaultNetwork={getNetworkKey()}
      >
        <WalletProvider autoConnect>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
