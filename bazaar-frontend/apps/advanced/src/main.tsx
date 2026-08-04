// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import ReactDOM from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { EveFrontierProvider } from "@evefrontier/dapp-kit";
import { ToastProvider, AlphaFaucetNotice } from "@bazaar/shared/components";
import { DAppAnnouncementsProvider } from "@bazaar/shared/contexts/DAppAnnouncementsContext";
import { AnnouncementBanner, ActionBlockedModal, CeremonyLockOverlay } from "@bazaar/shared/components/announcements";
import { installGasSponsorship } from "@bazaar/shared/gas/sponsorship";
import App from "./App";

// Gas sponsorship: wrap dAppKit.signAndExecuteTransaction so the sponsor pays
// gas when the gas-sponsor function is live; falls back to user-paid silently.
installGasSponsorship();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000 } },
});

// UpdateCeremonyPlan v1 — bazaar app mount: provider + top-of-page banner +
// portal-mounted action-block modal. Modal opens when useGatedTransaction
// throws ActionBlockedError during a Warning window.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <EveFrontierProvider queryClient={queryClient}>
    <ToastProvider>
      <DAppAnnouncementsProvider>
        <AnnouncementBanner />
        <App />
        <AlphaFaucetNotice />
        <ActionBlockedModal />
        <CeremonyLockOverlay />
      </DAppAnnouncementsProvider>
    </ToastProvider>
  </EveFrontierProvider>,
);

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
