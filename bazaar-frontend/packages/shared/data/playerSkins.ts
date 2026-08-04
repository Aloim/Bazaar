// ============================================================
// playerSkins.ts — Catalogue of selectable player avatar skins.
//
// Each slug maps 1:1 to a Godot SpriteFrames resource at
// res://sprite/players/<slug>.tres. The thumbnails are cropped 45°-S
// portraits generated from the source art (packages/shared/assets/skins/).
//
// red-tribal is RESERVED: only the DappHub owner is auto-granted the
// glowing-stripes warpaint — it is never offered in the normal picker.
// ============================================================

import crackedBlue from "../assets/skins/cracked-blue.png";
import crackedGreyYellow from "../assets/skins/cracked-grey-yellow.png";
import crackedPatchy from "../assets/skins/cracked-patchy.png";
import crackedRedish from "../assets/skins/cracked-redish.png";
import crackedWhite from "../assets/skins/cracked-white.png";
import greenHaze from "../assets/skins/green-haze.png";
import grey from "../assets/skins/grey.png";
import redGrey from "../assets/skins/red-grey.png";
import redTribal from "../assets/skins/red-tribal.png";
import whiteBlack from "../assets/skins/white-black.png";
import whiteOrange from "../assets/skins/white-orange.png";

export interface PlayerSkin {
  /** Matches res://sprite/players/<slug>.tres in the Godot client. */
  slug: string;
  /** Display name shown in the picker. */
  name: string;
  /** Short flavour line. */
  blurb: string;
  /** Cropped portrait thumbnail (bundled URL). */
  thumb: string;
  /** Reserved skins are owner-only and excluded from the open picker. */
  reserved?: boolean;
}

/** Default skin every fresh avatar starts on (replaces the old zombie set). */
export const DEFAULT_SKIN = "grey";

/** Owner-only warpaint, auto-granted to the DappHub owner. */
export const RESERVED_OWNER_SKIN = "red-tribal";

/**
 * The DappHub owner's wallet address. This wallet is auto-granted the reserved
 * red-tribal warpaint in every bazaar (compared case-insensitively).
 * Set via VITE_DAPPHUB_OWNER_ADDRESS in .env — see README.md "Deploying to Sui
 * testnet". Unset means no wallet gets the cosmetic (never falls back to the
 * original maintainer's wallet).
 */
export const DAPPHUB_OWNER_ADDRESS =
  (import.meta.env.VITE_DAPPHUB_OWNER_ADDRESS as string | undefined) ?? "";

export const PLAYER_SKINS: PlayerSkin[] = [
  { slug: "grey", name: "Ash Drifter", blurb: "Standard issue. Forgettable on purpose.", thumb: grey },
  { slug: "cracked-white", name: "Bonewhite", blurb: "Sun-bleached plating, hairline fractures.", thumb: crackedWhite },
  { slug: "cracked-blue", name: "Coolant", blurb: "Reactor-blue seams, still humming.", thumb: crackedBlue },
  { slug: "cracked-grey-yellow", name: "Hazard", blurb: "Caution stripes nobody obeys.", thumb: crackedGreyYellow },
  { slug: "cracked-patchy", name: "Patchwork", blurb: "Held together by salvage and spite.", thumb: crackedPatchy },
  { slug: "cracked-redish", name: "Rustblood", blurb: "Oxidised down to the frame.", thumb: crackedRedish },
  { slug: "green-haze", name: "Toxic Haze", blurb: "Leaks something the air filters hate.", thumb: greenHaze },
  { slug: "red-grey", name: "Cinder", blurb: "Scorched, but still standing.", thumb: redGrey },
  { slug: "white-black", name: "Monochrome", blurb: "No colour, no apologies.", thumb: whiteBlack },
  { slug: "white-orange", name: "Ember", blurb: "Foundry-warm, freshly forged.", thumb: whiteOrange },
  { slug: "red-tribal", name: "Warpaint", blurb: "Owner's mark. Glowing tribal stripes.", thumb: redTribal, reserved: true },
];

/** Look up a skin by slug. */
export function getSkin(slug: string): PlayerSkin | undefined {
  return PLAYER_SKINS.find(s => s.slug === slug);
}
