// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * GlobalInventoryTab — the "Global" view of the Inventory page (Multi-SSU
 * Visibility Phase 4). Aggregates the connected player's lockers across EVERY
 * bazaar SSU (not just the current one), one collapsible section per SSU,
 * each headed by its in-game solar-system name + a copy button.
 *
 * The player's locker key (`character.ownerCapId`) is global — identical on
 * every SSU — so the same character is filtered correctly at each SSU by
 * `useOwnedInventory(ssuId)` inside each SSUInventoryGroup. This view doubles
 * as the cross-SSU pickup view (Phase 3): foreign SSUs are flagged
 * "fly here to collect".
 *
 * Candidate SSU set = unique `shop.ssuId`s from useShops() (the superset of
 * places the player can hold a locker via a bazaar trade), with the current
 * SSU pinned first.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { useMemo } from "react";
import { useShops } from "@bazaar/shared/hooks";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";
import SSUInventoryGroup from "./SSUInventoryGroup";

export default function GlobalInventoryTab() {
  const { shops } = useShops();

  const ssuIds = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    if (SSU_OBJECT_ID) { seen.add(SSU_OBJECT_ID); ordered.push(SSU_OBJECT_ID); }
    for (const s of shops) {
      if (s.ssuId && !seen.has(s.ssuId)) { seen.add(s.ssuId); ordered.push(s.ssuId); }
    }
    return ordered;
  }, [shops]);

  if (ssuIds.length === 0) {
    return (
      <p className="muted" style={{ padding: "2rem", textAlign: "center" }}>
        No SSUs found yet — open a bazaar to populate the list.
      </p>
    );
  }

  return (
    <div className="global-inventory-tab">
      <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 0.6rem" }}>
        Your lockers across every bazaar SSU. Items bought from a foreign SSU are
        delivered to your locker there — fly to that solar system to collect.
      </p>
      {ssuIds.map((id, i) => (
        <SSUInventoryGroup key={id} ssuId={id} defaultOpen={i === 0} />
      ))}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
