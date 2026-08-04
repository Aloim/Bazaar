// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * helpData — content for the "New? Get Help here" guides.
 *
 * One guide per bazaar type (Solo / Easy / Advanced). Each guide is a small set
 * of topic tabs (Overview, Economy, Shop Types, Taxes & Fees, Roles, and Token
 * Safety on Advanced) built from plain blocks so the renderer (HelpContent.tsx)
 * stays dumb. Pure data, no JSX — shared by the in-game HelpWindow and the
 * DappHub HelpOverlay.
 *
 * Content is grounded in the live V38 contracts (tax layers per type, the 5 shop
 * types, the SSU/Tribe role ladder, and the 24h mint/burn timelock on the tribe
 * token). Keep it concise and user-facing; verify any number against source
 * before changing it.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

export type BazaarHelpKind = "notribe" | "easy" | "advanced";

export interface HelpBlock {
  heading?: string;
  body?: string;
  bullets?: string[];
  /** Soft callout (accent left-bar) for caveats and "good to know" asides. */
  note?: string;
}

export interface HelpTab {
  id: string;
  label: string;
  blocks: HelpBlock[];
}

export interface HelpGuide {
  title: string;
  tagline: string;
  tabs: HelpTab[];
}

/** Order + labels for the type chooser (pills + the HUD dropdown rows). */
export const HELP_KIND_ORDER: BazaarHelpKind[] = ["notribe", "easy", "advanced"];

export const HELP_KIND_META: Record<BazaarHelpKind, { label: string; hint: string }> = {
  notribe:  { label: "Solo (No Tribe)", hint: "One SSU, trades in EVE" },
  easy:     { label: "Standard Tribe",  hint: "A tribe trading in EVE" },
  advanced: { label: "Advanced Tribe",  hint: "A tribe with its own token" },
};

// ── Shared tab builders (keep the three guides consistent + short) ────────────

function shopTypesTab(currency: "eve" | "token"): HelpTab {
  const token = currency === "token";
  const priceLine = token
    ? "Prices and payouts are in your tribe token."
    : "Prices and payouts are in EVE.";
  const wtbNote = token
    ? "On Advanced bazaars a buy order sets tribe tokens aside up front instead of EVE."
    : "A buy order is funded with EVE up front, so a seller who fills it gets paid on the spot.";
  return {
    id: "shops",
    label: "Shop Types",
    blocks: [
      { body: `Five kinds of stall cover every way to trade. ${priceLine}` },
      { heading: "Want To Sell (WTS)", bullets: [
        "List items at a fixed price. Buyers pay and get the items right away.",
      ] },
      { heading: "Want To Buy (WTB)", bullets: [
        "Post a standing order for items you want to buy.",
        wtbNote,
      ] },
      { heading: "Direct Exchange (DE)", bullets: [
        "Barter items for items. You pay only a small flat fee, never a price.",
        "Takers can grab part of an offer, not just the whole lot.",
      ] },
      { heading: "Free Claim (FREE)", bullets: [
        "Give items or a set amount of currency away. Each wallet can claim once.",
      ] },
      { heading: "Mission (MIS)", bullets: [
        "Post a task with a reward for one or more runs.",
        "Players accept a run, complete it, and collect the reward from escrow.",
        "Require proof items or confirm completion yourself, and ask for collateral if you want.",
        "A small listing fee applies for each hour the stall stays up.",
      ] },
    ],
  };
}

function rolesTab(hasTribe: boolean, advanced: boolean): HelpTab {
  const blocks: HelpBlock[] = [
    {
      heading: "Your SSU",
      body: "Roles on your SSU, strongest first: Owner, SuperAdmin, Admin, Moderator.",
      bullets: [
        "Owner: full control. Sets roles and SSU tax, bans players, sets shop limits, can close any stall, and appoints a SuperAdmin.",
        "SuperAdmin: bans players, can freeze the SSU in an emergency, sets shop limits, and closes stalls other than the owner's. Appointed and removable by the owner.",
        "Admin: sets member roles up to their own rank, bans players, and closes stalls other than the owner's.",
        "Moderator: bans players and closes stalls other than the owner's. The lightest staff role.",
      ],
      note: "Staff can never close the owner's own stalls, and a role can only act on people ranked below it.",
    },
  ];
  if (hasTribe) {
    blocks.push({
      heading: "Your Tribe",
      body: "A tribe adds a second set of roles that reach across every SSU in the tribe: Leader, SuperAdmin, Admin, Moderator.",
      bullets: [
        "Leader: full control of the tribe. Sets tribe roles and tribe tax, withdraws tribe income, bans across the whole tribe, posts tribe announcements, and can open or close the tribe." +
          (advanced ? " On Advanced tribes the leader also drives the token supply and the exchange settings." : ""),
        "SuperAdmin: withdraws tribe income, bans across the tribe, and can close any stall in any of the tribe's SSUs.",
        "Admin: removes members, posts tribe announcements, bans across the tribe, and appoints moderators.",
        "Moderator: bans across the tribe and closes stalls anywhere in it.",
      ],
      note: "A tribe ban covers every SSU in the tribe at once, and a role can only ban someone ranked below it.",
    });
  }
  return { id: "roles", label: hasTribe ? "Roles & Governance" : "Roles", blocks };
}

function taxesTab(kind: BazaarHelpKind): HelpTab {
  const blocks: HelpBlock[] = [];
  if (kind === "advanced") {
    blocks.push({
      heading: "What you pay",
      bullets: [
        "Player to player trades pay SSU tax and tribe tax in tribe tokens. There is no platform tax on these trades.",
        "The platform tax (2% by default) applies only when you swap EVE at the exchange.",
        "SSU tax and tribe tax start at 0% and are capped at 10%, set by the SSU owner and the tribe leader.",
      ],
    });
  } else {
    const list = [
      "Platform tax: 2% by default. This is the marketplace fee that keeps the Bazaar running, and the only fee on by default.",
      "SSU tax: set by the SSU owner for each role. Starts at 0% and is capped at 10%.",
    ];
    if (kind === "easy") {
      list.push("Tribe tax: set by the tribe leader for each role. Starts at 0% and is capped at 10%, and funds the tribe.");
    }
    blocks.push({ heading: "What you pay", bullets: list });
  }
  blocks.push({
    heading: "Other fees",
    bullets: [
      "Registering an SSU and creating a stall are free unless the platform sets a fee.",
      "Mission stalls pay a small listing fee for each hour they stay up, taken when you post.",
    ],
  });
  blocks.push({
    heading: "Why these fees exist",
    body: "The platform tax is the marketplace's own small fee, and it pays to keep the Bazaar online for everyone. SSU and tribe taxes are optional income for whoever hosts and governs your bazaar, and they begin at zero. Every tax is shown before you confirm a trade.",
  });
  return { id: "taxes", label: "Taxes & Fees", blocks };
}

// ── The three guides ──────────────────────────────────────────────────────────

export const HELP_GUIDES: Record<BazaarHelpKind, HelpGuide> = {
  notribe: {
    title: "Solo Bazaar (No Tribe)",
    tagline: "A standalone shop hub on your own SSU. Trades in EVE. Best for solo players and small groups.",
    tabs: [
      { id: "overview", label: "Overview", blocks: [
        { body: "A Solo Bazaar runs on a single SSU with no tribe attached. You own and run it yourself, and everything settles in EVE." },
        { bullets: [
          "Currency: EVE",
          "Governance: your SSU only, no tribe layer",
          "Fees on a sale: your SSU tax plus the platform tax",
        ] },
        { note: "Want shared rules, a common treasury, or your own currency? See the Easy or Advanced tribe guides." },
      ] },
      { id: "economy", label: "Economy", blocks: [
        { heading: "How money moves", body: "When someone buys from a stall they pay in EVE. The platform tax and your SSU tax come out, and the seller keeps the rest." },
        { bullets: [
          "Sellers are paid instantly on a purchase.",
          "Buy orders are funded with EVE up front, so a filler is paid on the spot.",
          "Your SSU keeps its own tax wallet, which you can withdraw any time as the owner.",
        ] },
      ] },
      shopTypesTab("eve"),
      taxesTab("notribe"),
      rolesTab(false, false),
    ],
  },

  easy: {
    title: "Standard Tribe Bazaar",
    tagline: "A tribe of SSUs trading together in EVE, with shared governance and a tribe treasury.",
    tabs: [
      { id: "overview", label: "Overview", blocks: [
        { body: "A Standard Tribe links several SSUs under one set of rules. It keeps the simple EVE economy of a Solo Bazaar and adds a tribe on top for shared roles and income." },
        { bullets: [
          "Currency: EVE",
          "Governance: your SSU plus a tribe layer (leader and tribe staff)",
          "Fees on a sale: SSU tax plus tribe tax plus platform tax",
        ] },
      ] },
      { id: "economy", label: "Economy", blocks: [
        { heading: "How money moves", body: "Trades settle in EVE just like a Solo Bazaar. A tribe tax layer is added, and the tribe keeps its own treasury." },
        { bullets: [
          "Sellers are paid instantly on a purchase.",
          "A sale can pay your SSU, your tribe, and the platform, then the rest goes to the seller.",
          "The tribe leader sets the tribe tax and can withdraw the tribe's income.",
        ] },
      ] },
      shopTypesTab("eve"),
      taxesTab("easy"),
      rolesTab(true, false),
    ],
  },

  advanced: {
    title: "Advanced Tribe Bazaar",
    tagline: "A tribe with its own currency, an EVE backed exchange, and protected token supply.",
    tabs: [
      { id: "overview", label: "Overview", blocks: [
        { body: "An Advanced Tribe runs its own currency instead of trading directly in EVE. Players hold a tribe token, and EVE only enters or leaves through the exchange." },
        { bullets: [
          "Currency: your tribe's own token, tracked on chain rather than held as a coin in your wallet",
          "An exchange swaps EVE for tribe tokens and back",
          "Trades between players settle in tribe tokens",
          "Token supply is protected by a 24 hour timelock",
        ] },
        { note: "This mode is experimental and needs an EVE deposit into the exchange to start the economy." },
      ] },
      { id: "economy", label: "Economy", blocks: [
        { heading: "How money moves", body: "Players trade in the tribe token. Balances live in an on chain ledger, and EVE only crosses over at the exchange." },
        { bullets: [
          "The tribe vault holds the EVE that backs the token.",
          "Swapping EVE for tokens, or tokens back to EVE, happens at the exchange. The platform tax applies there.",
          "Player to player trades move tokens between accounts. SSU and tribe tax are taken in tokens, with no platform tax on these trades.",
        ] },
      ] },
      shopTypesTab("token"),
      taxesTab("advanced"),
      rolesTab(true, true),
      { id: "safety", label: "Token Safety", blocks: [
        { heading: "The tribe token is protected", body: "Even the Leader and SuperAdmin cannot create or destroy tribe tokens on a whim." },
        { bullets: [
          "Minting or burning tokens must be requested first, then waits a fixed 24 hours before it can happen.",
          "During that wait any Leader or SuperAdmin can veto the request.",
          "Every request, approval, and veto appears in the tribe's Finance News, so the whole tribe sees a pending supply change before it takes effect.",
        ] },
        { heading: "More safeguards", bullets: [
          "A supply cap limits how many tokens can ever exist.",
          "New tokens must be backed by EVE in the vault, so supply cannot outrun the reserve.",
          "Taking EVE out of the vault is also locked for 24 hours and needs more than one approver.",
        ] },
        { note: "The 24 hour rule covers creating and destroying supply. Routine actions, like paying out tokens the tribe already holds, take effect normally." },
      ] },
    ],
  },
};

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
