// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * HelpWindow — the in-game floating "New? Get Help here" window. Reuses the
 * shared .market-window chrome (+ WindowHeader) and renders the chrome-agnostic
 * <HelpContent/> with the bazaar-type chooser enabled, so a player can switch
 * between the Solo / Easy / Advanced guides from inside the window too.
 *
 * Opened from the HUD HelpMenu dropdown on a chosen bazaar type. Render it bare
 * (no .game-overlay-panel wrapper) — it brings its own position:absolute chrome.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { useState } from "react";
import WindowHeader from "@bazaar/shared/components/windows/WindowHeader";
import HelpContent, { type BazaarHelpKind } from "@bazaar/shared/components/help/HelpContent";

interface Props {
  /** Bazaar type to open on (from the HUD dropdown). Defaults to Solo. */
  initialKind?: BazaarHelpKind;
  onClose: () => void;
}

export default function HelpWindow({ initialKind = "notribe", onClose }: Props) {
  const [kind, setKind] = useState<BazaarHelpKind>(initialKind);
  return (
    <div className="market-window" style={{ width: "min(460px, calc(100vw - 24px))" }}>
      <WindowHeader title={<>NEW? GET HELP HERE</>} onClose={onClose} />
      <div className="market-window__body scroll-area">
        <HelpContent kind={kind} onKindChange={setKind} />
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
