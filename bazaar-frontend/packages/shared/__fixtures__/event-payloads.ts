// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * Test fixtures — SSUGovernanceCreated event payloads and TX block responses.
 *
 * Used by governance-resolution-hooks.test.ts.
 * NOT exported from @bazaar/shared index — exclusively test-file consumers.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

// ── Canonical IDs used across fixtures ───────────────────────────────────────

export const MOCK_SSU_ID               = "0xabc123def456aaa000000000000000000000000000000000000000000000001";
export const MOCK_SSU_GOV_ID           = "0x0001111111111111111111111111111111111111111111111111111111111111";
export const MOCK_MEMBER_REGISTRY_ID   = "0x0002222222222222222222222222222222222222222222222222222222222222";
export const MOCK_WIDGET_CONFIG_ID     = "0x0003333333333333333333333333333333333333333333333333333333333333";
export const MOCK_ANNOUNCEMENT_BOARD_ID = "0x0004444444444444444444444444444444444444444444444444444444444444";
export const MOCK_GUESTBOOK_BOARD_ID   = "0x0005555555555555555555555555555555555555555555555555555555555555";
export const MOCK_USER_STORAGE_ID      = "0x0007777777777777777777777777777777777777777777777777777777777777";
export const MOCK_TX_DIGEST            = "HfZqXyMNP7K2abc3def456ghi789jkl0mno1pqr2stu3vwx";

// ── Full SSUGovernanceCreated event (all 4 parsedJson IDs present) ────────────

export const MOCK_SSU_GOV_CREATED_EVENT = {
  id: { txDigest: MOCK_TX_DIGEST, eventSeq: "0" },
  packageId: "0xec77f064cfd8236019416001bf316d072a9b90ab8d947492a56d25fced2ef822",
  transactionModule: "ssu_bootstrap",
  parsedJson: {
    ssu_id:               MOCK_SSU_ID,
    member_registry_id:   MOCK_MEMBER_REGISTRY_ID,
    widget_config_id:     MOCK_WIDGET_CONFIG_ID,
    announcement_board_id: MOCK_ANNOUNCEMENT_BOARD_ID,
    guestbook_board_id:   MOCK_GUESTBOOK_BOARD_ID,
  },
} as const;

// ── Alternate event (different IDs — for first-bootstrap-wins test) ───────────

export const MOCK_SSU_GOV_CREATED_EVENT_V2 = {
  id: { txDigest: "AltDigest111111111111111111111111111111111111111", eventSeq: "1" },
  packageId: "0xec77f064cfd8236019416001bf316d072a9b90ab8d947492a56d25fced2ef822",
  transactionModule: "ssu_bootstrap",
  parsedJson: {
    ssu_id:               MOCK_SSU_ID,
    member_registry_id:   "0x00ff000000000000000000000000000000000000000000000000000000000002",
    widget_config_id:     "0x00ff000000000000000000000000000000000000000000000000000000000003",
    announcement_board_id: "0x00ff000000000000000000000000000000000000000000000000000000000004",
    guestbook_board_id:   "0x00ff000000000000000000000000000000000000000000000000000000000005",
  },
} as const;

// ── Incomplete event — widget_config_id absent (deliberately missing field) ─────
// @ts-expect-error Intentionally missing widget_config_id to test null guard

export const MOCK_INCOMPLETE_EVENT = {
  id: { txDigest: MOCK_TX_DIGEST, eventSeq: "0" },
  packageId: "0xec77f064cfd8236019416001bf316d072a9b90ab8d947492a56d25fced2ef822",
  transactionModule: "ssu_bootstrap",
  parsedJson: {
    ssu_id:               MOCK_SSU_ID,
    member_registry_id:   MOCK_MEMBER_REGISTRY_ID,
    // widget_config_id intentionally absent — triggers null guard
    announcement_board_id: MOCK_ANNOUNCEMENT_BOARD_ID,
    guestbook_board_id:   MOCK_GUESTBOOK_BOARD_ID,
  },
} as const;

// ── TX block responses ────────────────────────────────────────────────────────

export const MOCK_TX_BLOCK_WITH_SSU_GOV = {
  digest: MOCK_TX_DIGEST,
  objectChanges: [
    {
      type: "created",
      objectId: MOCK_SSU_GOV_ID,
      objectType: "0xec77f064cfd8236019416001bf316d072a9b90ab::ssu_governance::SSUGovernance",
    },
    {
      type: "created",
      objectId: MOCK_MEMBER_REGISTRY_ID,
      objectType: "0xec77f064cfd8236019416001bf316d072a9b90ab::membership::MemberRegistry",
    },
    {
      type: "created",
      objectId: MOCK_USER_STORAGE_ID,
      objectType: "0xec77f064cfd8236019416001bf316d072a9b90ab::user_storage::UserStorage",
    },
  ],
};

export const MOCK_TX_BLOCK_WITHOUT_SSU_GOV = {
  digest: MOCK_TX_DIGEST,
  objectChanges: [
    {
      type: "created",
      objectId: MOCK_MEMBER_REGISTRY_ID,
      objectType: "0xec77f064cfd8236019416001bf316d072a9b90ab::membership::MemberRegistry",
    },
  ],
};

// ── Pruned-objectChanges TX block (fullnode dropped objectChanges) ─────────────
// Reproduces the real-world bug: an aged bootstrap TX whose objectChanges the
// fullnode has pruned to null, while `effects.created` (permanent) still carries
// the object references. SSUGovernance + UserStorage are then recovered via
// multiGetObjects(showType). Note the absence of an `objectChanges` key.

export const MOCK_TX_BLOCK_PRUNED = {
  digest: MOCK_TX_DIGEST,
  effects: {
    created: [
      { reference: { objectId: MOCK_SSU_GOV_ID } },
      { reference: { objectId: MOCK_MEMBER_REGISTRY_ID } },
      { reference: { objectId: MOCK_USER_STORAGE_ID } },
    ],
  },
};

// multiGetObjects(showType) response matching MOCK_TX_BLOCK_PRUNED's created ids.
export const MOCK_MULTIGET_TYPED = [
  { data: { objectId: MOCK_SSU_GOV_ID,         type: "0xec77f064cfd8236019416001bf316d072a9b90ab::ssu_governance::SSUGovernance" } },
  { data: { objectId: MOCK_MEMBER_REGISTRY_ID, type: "0xec77f064cfd8236019416001bf316d072a9b90ab::membership::MemberRegistry" } },
  { data: { objectId: MOCK_USER_STORAGE_ID,    type: "0xec77f064cfd8236019416001bf316d072a9b90ab::user_storage::UserStorage" } },
];

// ── Expected resolution result ────────────────────────────────────────────────

export const EXPECTED_SHARED_OBJECTS = {
  ssuGovId:            MOCK_SSU_GOV_ID,
  memberRegistryId:    MOCK_MEMBER_REGISTRY_ID,
  widgetConfigId:      MOCK_WIDGET_CONFIG_ID,
  announcementBoardId: MOCK_ANNOUNCEMENT_BOARD_ID,
  guestbookBoardId:    MOCK_GUESTBOOK_BOARD_ID,
  userStorageId:       MOCK_USER_STORAGE_ID,
  // V13 atomic-9 added per-SSU WtbEscrowPool. Mock event payload does not
  // populate `wtb_escrow_pool_id`, so the hook falls back to "".
  wtbEscrowPoolId:     "",
};

/**
 * Build N dummy events with a different ssu_id to pad the result set.
 * Used in UT-07 to construct a 1000-result page.
 */
export function buildDummyEvents(count: number): typeof MOCK_SSU_GOV_CREATED_EVENT[] {
  return Array.from({ length: count }, (_, i) => ({
    id: { txDigest: `Dummy${i}Digest`, eventSeq: String(i) },
    packageId: "0xec77f064cfd8236019416001bf316d072a9b90ab8d947492a56d25fced2ef822",
    transactionModule: "ssu_bootstrap",
    parsedJson: {
      ssu_id:               `0x${i.toString(16).padStart(64, "0")}`,
      member_registry_id:   "0x0000000000000000000000000000000000000000000000000000000000000000",
      widget_config_id:     "0x0000000000000000000000000000000000000000000000000000000000000000",
      announcement_board_id: "0x0000000000000000000000000000000000000000000000000000000000000000",
      guestbook_board_id:   "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
  })) as typeof MOCK_SSU_GOV_CREATED_EVENT[];
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
