// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * DeregisteredSSUScreen — full-screen gate shown by the three bazaar apps when
 * the SSU in the URL has NO row in the SSURegistry (deregistered or never
 * registered). The per-SSU shared objects persist on-chain after
 * deregister_ssu*, so without this gate the bazaar would keep operating as if
 * nothing happened. Mirrors the apps' connect-screen styling.
 */

import WalletBar from "./WalletBar";
import { reclaimEnabled } from "../constants";

export interface DeregisteredSSUScreenProps {
  ssuId: string;
  /** App heading, e.g. "NOTRIBE BAZAAR". */
  appTitle: string;
}

export default function DeregisteredSSUScreen({ ssuId, appTitle }: DeregisteredSSUScreenProps) {
  // During an Update Ceremony (reclaimEnabled), an unregistered SSU is most likely
  // an ORPHANED-by-republish SSU whose owner can re-materialise it via the DappHub
  // reclaim flow — surface that path instead of plain "register". Dormant on V37.
  const ceremony = reclaimEnabled();
  return (
    <div className="connect-screen">
      <WalletBar />
      <div className="connect-screen__body" style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
        <h1 className="connect-screen__title">{appTitle}</h1>
        <p style={{ fontSize: 16, margin: "18px 0 6px" }}>
          This SSU is not registered with the Bazaar network.
        </p>
        {ceremony ? (
          <>
            <p className="connect-screen__hint">
              An Update Ceremony is in progress. If you owned this SSU before the
              republish, you can reclaim it — restoring its config, roster, bans, and
              EVE — from the DappHub.
            </p>
            <p className="connect-screen__hint" style={{ marginTop: 10 }}>
              <a href="/dapphub/" className="connect-screen__link">
                Open DappHub → Reclaim My SSUs / Tribes ↗
              </a>
            </p>
          </>
        ) : (
          <p className="connect-screen__hint">
            The marketplace here is closed — either the owner deregistered the SSU
            or it was never registered. It can be (re-)registered at any time from
            the DappHub (Register SSU / Join a Tribe).
          </p>
        )}
        <p className="connect-screen__hint" style={{ opacity: 0.7 }}>
          SSU: {ssuId.slice(0, 10)}…{ssuId.slice(-6)}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
