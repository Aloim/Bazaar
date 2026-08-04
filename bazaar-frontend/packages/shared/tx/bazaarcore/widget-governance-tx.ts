// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * widget-governance-tx — OS-59 Commit 2 (V7 package_id update).
 *
 * TX builder for bazaar_mission::widget_governance::toggle_ssu_widget (V35 split).
 * SSUOwnerCap-gated. Performs triple-bind authority (cap ↔ gov ↔ config)
 * on-chain; this builder constructs the 7-arg PTB.
 *
 * Signature (Move, V7 — package_id param added per Phase 2 Move changes):
 *   toggle_ssu_widget(
 *     cap: &SSUOwnerCap,
 *     gov: &SSUGovernance,
 *     config: &mut WidgetConfig,
 *     package_id: address,  ← V7: PTB-supplied bazaar_core address (avoids @-literal zero)
 *     widget_idx: u64,
 *     enabled: bool,
 *     clock: &Clock,
 *   )
 *
 * Aborts (on-chain):
 *   E_WRONG_SSU    (1) — cap.ssu_id != gov.ssu_id
 *   E_WRONG_CONFIG (2) — gov.widget_config_id != object::id(config)
 *   E_INVALID_WIDGET_INDEX (1, shared_widgets) — widget_idx >= 4
 *   E_UNAUTHORIZED_PACKAGE (2, shared_widgets) — config.authorized_package != package_id
 *
 * Widget index mapping (matches SharedWidgets widget_config.move WIDGET_COUNT=4):
 *   0 = Announcements
 *   1 = Guestbook
 *   2 = Donate
 *   3 = Multiplayer
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_IDS, SUI_CLOCK_ID } from "@bazaar/shared/constants";

export interface BuildToggleSSUWidgetParams {
  /** SSUOwnerCap object ID held by the connected wallet. */
  ownerCapId: string;
  /** SSUGovernance shared object ID for this SSU. */
  ssuGovId: string;
  /** WidgetConfig shared object ID for this SSU. */
  widgetConfigId: string;
  /** Widget index, 0..3 inclusive (Announcements=0, Guestbook=1, Donate=2, Multiplayer=3). */
  widgetIdx: number;
  /** Desired post-transaction enabled state. NOT a flip; the Move callee sets this value. */
  enabled: boolean;
}

/**
 * Build a PTB that sets a per-SSU widget to the given enabled state.
 * Only the SSUOwnerCap holder for this SSU may call this entry function.
 *
 * SA SEC-004: early bounds check saves a validator round-trip on invalid input.
 */
export function buildToggleSSUWidget(
  params: BuildToggleSSUWidgetParams,
): Transaction {
  if (params.widgetIdx < 0 || params.widgetIdx > 3) {
    throw new Error(
      `buildToggleSSUWidget: widgetIdx ${params.widgetIdx} out of range [0, 3]`,
    );
  }
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_IDS.BAZAAR_MISSION}::widget_governance::toggle_ssu_widget`,
    arguments: [
      tx.object(params.ownerCapId),              // cap: &SSUOwnerCap [0]
      tx.object(params.ssuGovId),                // gov: &SSUGovernance [1]
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
