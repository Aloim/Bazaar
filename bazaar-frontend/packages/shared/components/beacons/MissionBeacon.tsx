// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// MissionBeacon.tsx — the in-world Mission (MIS) beacon. Click opens the
// MissionsWindow (accept / complete / confirm). Thin wrapper over the shared
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

export default function MissionBeacon(props: Props) {
  return <HoloButton title="Missions" subtitle={"Accept · Complete · Earn"} {...props} />;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
