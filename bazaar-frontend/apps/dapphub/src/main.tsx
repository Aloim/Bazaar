import ReactDOM from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { EveFrontierProvider } from "@evefrontier/dapp-kit";
import { ToastProvider, AlphaFaucetNotice } from "@bazaar/shared/components";
import { DAppAnnouncementsProvider } from "@bazaar/shared/contexts/DAppAnnouncementsContext";
import { AnnouncementBanner } from "@bazaar/shared/components/announcements";
import { installGasSponsorship } from "@bazaar/shared/gas/sponsorship";
import App from "./App";

// Gas sponsorship: wrap dAppKit.signAndExecuteTransaction so the sponsor pays
// gas when the gas-sponsor function is live; falls back to user-paid silently.
installGasSponsorship();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000 } },
});

// UpdateCeremonyPlan v1 — DappHub is EXEMPT from the action-block modal (admin
// drives the ceremony from here), so we mount the banner only. The modal is
// intentionally NOT imported under apps/dapphub/src — see the vitest static
// grep at packages/shared/__tests__/dapphub-exempt.test.ts.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <EveFrontierProvider queryClient={queryClient}>
    <ToastProvider>
      <DAppAnnouncementsProvider>
        <AnnouncementBanner />
        <App />
        <AlphaFaucetNotice />
      </DAppAnnouncementsProvider>
    </ToastProvider>
  </EveFrontierProvider>,
);
