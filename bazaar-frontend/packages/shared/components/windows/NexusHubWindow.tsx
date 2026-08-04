// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// NexusHubWindow.tsx — the destination the Queen's Messenger points to.
//
// A full-viewport "new window" inside the dapp that loads the live Nexus-Ѫ hub
// (xcorpservicehub) in an iframe, framed in the Messenger's crimson chrome with
// a Go Back control. URL-addressable (#nexus) so it reads as its own page, and
// the hardware / browser Back gesture also maps to onBack. If the hub refuses
// to be framed, the "Open ↗" affordance launches it in a separate tab.

import { useEffect, useState } from "react";

interface Props {
  /** Return to the previous view (the Messenger dialogue). */
  onBack: () => void;
}

/** The live Nexus-Ѫ hub. */
export const NEXUS_HUB_URL = "https://xcorpservicehub.vercel.app/";
const NEXUS_HASH = "#nexus";

export default function NexusHubWindow({ onBack }: Props) {
  const [loaded, setLoaded] = useState(false);

  // URL-addressable "new window": push #nexus so the hub has its own URL, and
  // let the browser/hardware Back gesture trigger onBack. Restore on unmount.
  useEffect(() => {
    const prevHash = window.location.hash;
    if (window.location.hash !== NEXUS_HASH) {
      try { window.history.pushState({ nexus: true }, "", NEXUS_HASH); } catch { /* CEF guard */ }
    }
    const onPop = () => onBack();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.location.hash === NEXUS_HASH) {
        try {
          window.history.replaceState(null, "", prevHash || window.location.pathname + window.location.search);
        } catch { /* CEF guard */ }
      }
    };
  }, [onBack]);

  return (
    <div className="nexus-screen nexus-screen--framed" role="dialog" aria-label="Nexus hub">
      <div className="nexus-topbar">
        <button className="nexus-back" onClick={onBack} aria-label="Go back">
          <span aria-hidden>←</span> Go Back
        </button>
        <div className="nexus-topbar__title">
          <span className="nexus-topbar__sigil" aria-hidden>Ѫ</span>
          Nexus&#8202;-&#8202;Ѫ
          <span className="nexus-topbar__sub">Core Uplink</span>
        </div>
        <a className="nexus-ext" href={NEXUS_HUB_URL} target="_blank" rel="noreferrer noopener">Open ↗</a>
      </div>

      <div className="nexus-stage">
        {!loaded && (
          <div className="nexus-loading">
            <div className="nexus-sigil" aria-hidden>Ѫ</div>
            <p className="nexus-status">
              Establishing dimensional handshake<span className="nexus-dots" aria-hidden />
            </p>
          </div>
        )}
        {/* AUD-UX-01: the hub is cross-origin, so sandbox allow-same-origin
            grants the frame ITS OWN origin only — the value of the sandbox is
            withholding allow-top-navigation (no redirecting our top window);
            no-referrer keeps our SSU URL params out of the hub's logs. */}
        <iframe
          className="nexus-frame"
          src={NEXUS_HUB_URL}
          title="Nexus-Ѫ Core Uplink"
          onLoad={() => setLoaded(true)}
          allow="clipboard-write; fullscreen; clipboard-read"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
