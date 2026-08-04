// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import HoloButton from "@bazaar/shared/components/HoloButton";

interface Props {
  onClick: () => void;
  color?: string;
  scale?: number;
  rotation?: number;
  enabled?: boolean;
}

export default function ArchiveButton({ onClick, color, scale, rotation, enabled }: Props) {
  return (
    <HoloButton
      title="Archive"
      subtitle="Opens the News Archive"
      onClick={onClick}
      color={color}
      scale={scale}
      rotation={rotation}
      enabled={enabled}
      phaseOffset={0}
    />
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
