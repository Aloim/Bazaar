// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// SkinPickerBeacon.tsx — the in-world avatar / skin picker beacon. Click opens
// the SkinPickerWindow. Thin wrapper over the shared HoloButton so it matches
// every other service projection (.holo-beacon, animations-hologram.css).
// Positioned over the Godot SkinBeacon via the "skin_picker" screen-rect payload.

import HoloButton from "@bazaar/shared/components/HoloButton";

interface Props {
  onClick:          () => void;
  color?:           string;     // "R, G, B" for rgba()
  scale?:           number;
  rotation?:        number;     // degrees
  enabled?:         boolean;
  phaseOffset?:     number;
  proximityActive?: boolean;
}

export default function SkinPickerBeacon(props: Props) {
  return <HoloButton title="Identity" subtitle="Change your look" {...props} />;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
