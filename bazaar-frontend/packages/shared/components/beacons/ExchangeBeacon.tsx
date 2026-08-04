// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// ExchangeBeacon.tsx — the in-world TribeToken <-> EVE exchange beacon.
// Thin wrapper over the shared HoloButton: all visuals + motion live there
// (.holo-beacon, animations-hologram.css) so every service projection reads
// identically; this only supplies the label. Accent comes from Godot beacon_config.

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

export default function ExchangeBeacon(props: Props) {
  return <HoloButton title="Exchange" subtitle="Token Exchange" {...props} />;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
