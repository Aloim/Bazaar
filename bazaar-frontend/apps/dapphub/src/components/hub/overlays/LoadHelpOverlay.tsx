// LoadHelpOverlay.tsx — "My registered Bazaar not loading?" help overlay.
// New Station-Hub visual; surfaces the trailing-slash toggle fix and a
// shortcut into the Contact overlay.

import { HUB } from "../hubStyle";
import { OverlayShell, PrimaryBtn, GhostBtn } from "../HubPrimitives";

export default function LoadHelpOverlay({ onClose, onContact }: { onClose: () => void; onContact: () => void }) {
  return (
    <OverlayShell title="BAZAAR NOT LOADING?" width={680} onClose={onClose}>
      <p style={{ margin: "0 0 14px", color: HUB.FG2, fontSize: 13, lineHeight: 1.6 }}>
        After registering and pasting the dApp link into your SSU and saving, the Bazaar sometimes won&apos;t load right away.
      </p>
      <div style={{ background: "rgba(184,102,32,0.08)", border: `1px solid ${HUB.DIM}`, padding: "14px 18px", fontSize: 13, lineHeight: 1.6, color: HUB.FG2 }}>
        In your SSU&apos;s dApp URL field, toggle the trailing slash:
        <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
          <li>If the URL ends <strong>without</strong> a <code>/</code>, add one to the end.</li>
          <li>If the URL already ends <strong>with</strong> a <code>/</code>, remove it.</li>
        </ul>
        <p style={{ margin: "8px 0 0" }}>Then <strong>save again</strong> — this forces the SSU to reload the Bazaar.</p>
      </div>
      <p style={{ margin: "14px 0 0", color: HUB.MUTED, fontSize: 12, lineHeight: 1.6 }}>
        Still not loading? Reach out via Contact and we&apos;ll help you out.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22 }}>
        <GhostBtn onClick={() => { onClose(); onContact(); }}>Contact us</GhostBtn>
        <PrimaryBtn onClick={onClose}>Got it</PrimaryBtn>
      </div>
    </OverlayShell>
  );
}
