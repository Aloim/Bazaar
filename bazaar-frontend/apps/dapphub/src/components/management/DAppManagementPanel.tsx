// DAppManagementPanel.tsx — DApp Owner-only management panel.
// 7-tab container: Tribes, SSUs, Taxes/Fees, Tax Wallet, Tickets, Upgrade, Ceremony.
// Follows the Bazar1 panel pattern (panel > panel__header > panel__tabs > tab content).

import { useState, lazy, Suspense } from "react";
import type { DappHubScreen, ManagementTab } from "../../types";

const TribesTab         = lazy(() => import("./TribesTab"));
const SSUsTab           = lazy(() => import("./SSUsTab"));
const TaxesFeesTab      = lazy(() => import("./TaxesFeesTab"));
const TaxWalletTab      = lazy(() => import("./TaxWalletTab"));
const BazaarNewsTab     = lazy(() => import("./BazaarNewsTab"));
const TicketsTab        = lazy(() => import("./TicketsTab"));
const UpgradeTab        = lazy(() => import("./UpgradeTab"));
const UpdateCeremonyTab = lazy(() => import("./UpdateCeremonyTab"));

interface Props {
  nav: (screen: DappHubScreen) => void;
  ownerCapId: string | null;
}

const TAB_LABELS: { key: ManagementTab; label: string }[] = [
  { key: "tribes",     label: "Tribes" },
  { key: "ssus",       label: "SSUs" },
  { key: "taxes-fees", label: "Taxes & Fees" },
  { key: "tax-wallet", label: "Tax Wallet" },
  { key: "bazaar-news", label: "Bazaar News" },
  { key: "tickets",    label: "Tickets" },
  { key: "upgrade",    label: "Upgrade" },
  { key: "ceremony",   label: "Ceremony" },
];

export default function DAppManagementPanel({ nav, ownerCapId }: Props) {
  const [tab, setTab] = useState<ManagementTab>("tribes");

  return (
    <div className="panel">
      <div className="panel__header">
        <button className="btn btn--ghost btn--sm" onClick={() => nav("landing")}>
          Back
        </button>
        <h2 style={{
          fontFamily: "var(--font-display)",
          letterSpacing: "0.1em",
          color: "var(--accent)",
          flex: 1,
        }}>
          DAPP MANAGEMENT
        </h2>
      </div>

      <div className="panel__tabs">
        {TAB_LABELS.map(t => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? "tab--active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Suspense fallback={<div className="loader">Loading...</div>}>
        {tab === "tribes"     && <TribesTab ownerCapId={ownerCapId} />}
        {tab === "ssus"       && <SSUsTab ownerCapId={ownerCapId} />}
        {tab === "taxes-fees" && <TaxesFeesTab ownerCapId={ownerCapId} />}
        {tab === "tax-wallet" && <TaxWalletTab ownerCapId={ownerCapId} />}
        {tab === "bazaar-news" && <BazaarNewsTab ownerCapId={ownerCapId} />}
        {tab === "tickets"    && <TicketsTab ownerCapId={ownerCapId} />}
        {tab === "upgrade"    && <UpgradeTab ownerCapId={ownerCapId} />}
        {tab === "ceremony"   && <UpdateCeremonyTab ownerCapId={ownerCapId} />}
      </Suspense>
    </div>
  );
}
