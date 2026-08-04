// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// GuestbookBeacon.tsx — the in-world guestbook beacon. Thin wrapper over the
// shared HoloButton (so it looks like every other service projection,
// .holo-beacon) that additionally relays hover/proximity to Godot via
// SET_GUESTBOOK_HOVER, so the physical in-world guestbook light reacts.

import { useCallback } from "react";
import HoloButton from "@bazaar/shared/components/HoloButton";
import { PROTOCOL_VERSION } from "@bazaar/shared/bridge";

interface Props {
  onClick:          () => void;
  color?:           string;     // "R, G, B" for rgba() — from Godot beacon_config
  scale?:           number;
  rotation?:        number;     // degrees
  enabled?:         boolean;
  proximityActive?: boolean;
}

/** Fire-and-forget to Godot. No ready-gate needed — hover is ephemeral. */
function sendToGodot(type: string, payload: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent("godot-in", {
      detail: JSON.stringify({ type, version: PROTOCOL_VERSION, payload }),
    })
  );
}

export default function GuestbookBeacon(props: Props) {
  const onHoverChange = useCallback((active: boolean) => {
    sendToGodot("SET_GUESTBOOK_HOVER", { hovered: active });
  }, []);

  return (
    <HoloButton
      title="Guestbook"
      subtitle="Sign the guestbook"
      onHoverChange={onHoverChange}
      {...props}
    />
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
