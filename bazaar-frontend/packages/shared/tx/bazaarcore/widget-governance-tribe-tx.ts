// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * widget-governance-tribe-tx — OS-59-tribe-widgets (V7 package_id update).
 *
 * TX builder for bazaar_mission::widget_governance::toggle_tribe_widget (V35 split).
 * TribeLeaderCap-gated. Performs triple-bind authority (cap ↔ gov ↔ config)
 * on-chain; this builder constructs the 7-arg PTB.
 *
 * Signature (Move, V7 — package_id param added per Phase 2 Move changes):
 *   toggle_tribe_widget(
 *     cap: &TribeLeaderCap,
 *     gov: &TribeGovernance,
 *     config: &mut WidgetConfig,
 *     package_id: address,  ← V7: PTB-supplied bazaar_core address (avoids @-literal zero)
 *     widget_idx: u64,
 *     enabled: bool,
 *     clock: &Clock,
 *   )
 *
 * Aborts (on-chain):
 *   E_WRONG_TRIBE (3)                 — cap.tribe_id != gov.tribe_id
 *   E_TRIBE_WIDGET_CONFIG_NOT_SET (4) — gov.widget_config_id == option::none
 *   E_WRONG_CONFIG (2)                — gov.widget_config_id != object::id(config)
 *   E_INVALID_WIDGET_INDEX (1, shared_widgets callee)
 *   E_UNAUTHORIZED_PACKAGE (2, shared_widgets callee)
 *
 * Widget index mapping (matches SharedWidgets WIDGET_COUNT=4):
 *   0 = Announcements
 *   1 = Guestbook
 *   2 = Donate
 *   3 = Multiplayer
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, SUI_CLOCK_ID } from "@bazaar/shared/constants";

export interface BuildToggleTribeWidgetParams {
  /** TribeLeaderCap object ID held by the connected wallet. Per MA-OS-59 §6.1. */
  leaderCapId: string;
  /** TribeGovernance shared object ID for this tribe. */
  tribeGovId: string;
  /** WidgetConfig shared object ID for this tribe (NOT for any of its SSUs). */
  widgetConfigId: string;
  /** Widget index, 0..3 inclusive (Announcements=0, Guestbook=1, Donate=2, Multiplayer=3). */
  widgetIdx: number;
  /** Desired post-transaction enabled state. NOT a flip; the Move callee sets this value. */
  enabled: boolean;
}

/**
 * Build a PTB that sets a per-tribe widget to the given enabled state.
 * Only the TribeLeaderCap holder for this tribe may call this entry function.
 *
 * SA SEC-004 parallel: early bounds check saves a validator round-trip on invalid input.
 */
export function buildToggleTribeWidget(
  params: BuildToggleTribeWidgetParams,
): Transaction {
  if (params.widgetIdx < 0 || params.widgetIdx > 3) {
    throw new Error(
      `buildToggleTribeWidget: widgetIdx ${params.widgetIdx} out of range [0, 3]`,
    );
  }
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::widget_governance::toggle_tribe_widget`,
    arguments: [
      tx.object(params.leaderCapId),             // cap: &TribeLeaderCap [0]
      tx.object(params.tribeGovId),              // gov: &TribeGovernance [1]
      tx.object(params.widgetConfigId),          // config: &mut WidgetConfig [2]
      tx.pure.address(PACKAGE_IDS.BAZAAR_CORE),  // package_id: address [3] V7
      tx.pure.u64(BigInt(params.widgetIdx)),     // widget_idx: u64 [4]
      tx.pure.bool(params.enabled),              // enabled: bool [5]
      tx.object(SUI_CLOCK_ID),                   // clock: &Clock [6]
    ],
  });
  return tx;
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
