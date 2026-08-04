// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// BazaarNewsBeacon.tsx — the in-world Bazaar DApp news beacon. Click opens the
// BazaarNewsWindow (latest news + poll + comments). Thin wrapper over the shared
// HoloButton so it matches every other service projection (.holo-beacon).

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

export default function BazaarNewsBeacon(props: Props) {
  return <HoloButton title="Bazaar News" subtitle={"News · Polls · Comments"} {...props} />;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
