// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Update-Ceremony snapshot generator.
 *
 * `generateSnapshot()` walks the LIVE on-chain Bazaar state (no writes) and returns
 * a v2.0 BazaarSnapshot plus a human coverage SnapshotSummary. The Create-Backup
 * form pastes the JSON, hashes it, and anchors the hash on-chain. Designed to feed
 * the V2 reclaim/restore flow. Run during the ceremony Warning window when mutating
 * actions are locked, so reads are quiescent (best-effort checkpoint pin).
 *
 * Partial failures are collected into `summary.warnings` rather than aborting — a
 * non-empty warnings list means the snapshot has GAPS and must not be trusted.
 */

import { PACKAGE_IDS, SHARED_OBJECTS, BAZAAR_NEWS_BOARD_ID } from "../constants";
import {
  getObjectFields, balanceMist, getLatestCheckpoint, sumMist,
} from "./snapshot/readers";
import { readSsuSnapshots } from "./snapshot/ssus";
import { readTribeSnapshots } from "./snapshot/tribes";
import { readBazaarNews } from "./snapshot/social";
import { SNAPSHOT_SCHEMA_VERSION } from "./snapshot/types";
import type { BazaarSnapshot, SnapshotSummary } from "./snapshot/types";

export type { BazaarSnapshot, SnapshotSummary } from "./snapshot/types";

export async function generateSnapshot(): Promise<{ snapshot: BazaarSnapshot; summary: SnapshotSummary }> {
  const warnings: string[] = [];

  const checkpoint = await getLatestCheckpoint();

  // Global DappHub wallet.
  let taxWalletEveMist = "0";
  try {
    const taxFields = await getObjectFields(SHARED_OBJECTS.TAX_WALLET);
    taxWalletEveMist = balanceMist(taxFields?.balance);
  } catch {
    warnings.push("DAppTaxWallet: failed to read balance");
  }

  // SSUs first (their member rows feed the tribe roster union), then tribes.
  const ssus = await readSsuSnapshots(warnings);
  const tribes = await readTribeSnapshots(ssus, warnings);

  let bazaarNews: BazaarSnapshot["bazaarNews"] = [];
  try {
    bazaarNews = await readBazaarNews(BAZAAR_NEWS_BOARD_ID);
  } catch {
    warnings.push("BazaarNewsBoard: failed to read (capture-only, non-blocking)");
  }

  warnings.push("tx_history is capture-only and not collected in Phase 1 (historical events cannot be replayed on-chain).");

  const snapshot: BazaarSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    outgoingCheckpoint: checkpoint,
    createdByNote: "",
    outgoingPackageIds: {
      dapp_hub: PACKAGE_IDS.DAPP_HUB,
      shared_widgets: PACKAGE_IDS.SHARED_WIDGETS,
      bazaar_core: PACKAGE_IDS.BAZAAR_CORE,
      bazaar_mission: PACKAGE_IDS.BAZAAR_MISSION,
      bazaar_economy: PACKAGE_IDS.BAZAAR_ECONOMY,
    },
    dappHub: { taxWalletId: SHARED_OBJECTS.TAX_WALLET, taxWalletEveMist },
    tribes,
    ssus,
    bazaarNews,
    txHistory: [],
  };

  // Coverage summary.
  const memberAddrs = new Set<string>();
  let tokenHolders = 0, announcements = bazaarNews.length, guestbookEntries = 0;
  const eveFigures: string[] = [taxWalletEveMist];
  for (const s of ssus) {
    s.members.forEach((m) => memberAddrs.add(m.address));
    announcements += s.announcements.length;
    guestbookEntries += s.guestbook.length;
    eveFigures.push(s.taxWalletEveMist, s.wtbEscrowPoolEveMist);
  }
  for (const t of tribes) {
    t.members.forEach((m) => memberAddrs.add(m.address));
    tokenHolders += Object.keys(t.tokenBalances).length;
    eveFigures.push(t.tribeGovTaxWalletEveMist, t.tribeVaultEveMist);
  }

  const summary: SnapshotSummary = {
    tribes: tribes.length,
    ssus: ssus.length,
    members: memberAddrs.size,
    tokenHolders,
    announcements,
    guestbookEntries,
    totalEveMist: sumMist(eveFigures),
    warnings,
  };

  return { snapshot, summary };
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
