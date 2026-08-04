// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * BazaarCustomizationTab barrel — re-exports parent component + predicates + types.
 *
 * Consumers: import BazaarCustomizationTab from "@bazaar/shared/components/governance/BazaarCustomizationTab"
 * Barrel:    import { BazaarCustomizationTab, isSSUCustomizationTabVisible } from "@bazaar/shared/components"
 *
 * Phase: AP2-D / FP1-29
 * File limit: 500 lines | Constitution Article XIV.4
 */

export { default } from "../BazaarCustomizationTab";
export {
  isSSUCustomizationTabVisible,
  isTribeCustomizationTabVisible,
} from "../BazaarCustomizationTab";
export type {
  BazaarCustomizationTabProps,
  CustomizationScope,
} from "../BazaarCustomizationTab";

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
