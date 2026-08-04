/**
 * @bazaar/shared/components — Shared React components.
 *
 * Reusable UI components used across multiple apps.
 * FloatingWindow, LoadingSpinner, GodotCanvas.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

export { default as FloatingWindow } from "./FloatingWindow";
export { default as LoadingSpinner } from "./LoadingSpinner";
export { default as GodotCanvas }    from "./GodotCanvas";
export type { FloatingWindowProps }  from "./FloatingWindow";
export { default as FloatingPanel }  from "./FloatingPanel";
export type { FloatingPanelProps, FloatingPanelPosition } from "./FloatingPanel";
export type { GodotCanvasProps, GodotCanvasHandle, GodotCanvasPhase } from "./GodotCanvas";
export { default as MatrixRain }      from "./MatrixRain";
export type { MatrixRainProps }        from "./MatrixRain";
export { default as HoloButton }      from "./HoloButton";
export type { HoloButtonProps }        from "./HoloButton";
export { default as BazarWindow }     from "./BazarWindow";
export type { BazarWindowProps }       from "./BazarWindow";
export { default as AddressInput }    from "./AddressInput";
export type { AddressInputProps }      from "./AddressInput";
export { default as WalletBar }       from "./WalletBar";
export type { WalletBarProps }         from "./WalletBar";
export { default as DeregisteredSSUScreen } from "./DeregisteredSSUScreen";
export type { DeregisteredSSUScreenProps }   from "./DeregisteredSSUScreen";
// Phase B: landing sub-components
export * from "./landing";
// Phase D: docking overlay components
export { default as DockingText }      from "./docking/DockingText";
export type { DockingTextProps }       from "./docking/DockingText";
export { default as ArrivalOverlay }   from "./docking/ArrivalOverlay";
export type { ArrivalOverlayProps }    from "./docking/ArrivalOverlay";
// Phase 8a: trade + inventory shared primitives
export * from "./trade";
export * from "./inventory";
// FP1-25: governance components
export { default as SSUSuperAdminCapManager } from "./governance/SSUSuperAdminCapManager";
export type { SSUSuperAdminCapManagerProps } from "./governance/SSUSuperAdminCapManager";
// AP2-D / FP1-29: Bazaar Customization tab
export { default as BazaarCustomizationTab } from "./governance/BazaarCustomizationTab";
export { isSSUCustomizationTabVisible, isTribeCustomizationTabVisible } from "./governance/BazaarCustomizationTab";
export type { BazaarCustomizationTabProps, CustomizationScope } from "./governance/BazaarCustomizationTab";
// AP2-E / FP1-30: Godot client banner
export { default as CustomClientBanner } from "./godot/CustomClientBanner";
export type { CustomClientBannerProps } from "./godot/CustomClientBanner";
// Phase 6b: beacon components
export * from "./beacons";
// Phase 6c: BeaconLayer rAF consumer
export { default as BeaconLayer } from "./BeaconLayer";
export type { BeaconLayerProps, BeaconRefs } from "./BeaconLayer";
// shop sub-components (used by bazaar app App.tsx screen routing)
export { default as ArchivePage }        from "./shop/ArchivePage";
export { default as ManageAnnouncements } from "./widgets/ManageAnnouncements";
export { default as MyShopsPanel }       from "./shop/MyShopsPanel";
// R2.4: GodotGameWrapper build stub (OS-14; full port in R3)
export { default as GodotGameWrapper }   from "./godot/GodotGameWrapper";
export type { GodotGameWrapperProps }    from "./godot/GodotGameWrapper";
// R6.6.4: DAppGovernancePanel export gap fix (FA §1.2 §9)
export { default as DAppGovernancePanel } from "./governance/DAppGovernancePanel";
// R6.6.4b: SSUGovernancePanel port (closes OS-32)
export { default as SSUGovernancePanel } from "./governance/SSUGovernancePanel";
export type { SSUGovernancePanelProps } from "./governance/SSUGovernancePanel";
// R2.4 CEF deliverable 2: SSU Governance topbar nav button
export { default as SSUGovernanceNavButton } from "./governance/SSUGovernanceNavButton";
export type { SSUGovernanceNavButtonProps }  from "./governance/SSUGovernanceNavButton";
// R6.6.4c: TribeGovernancePanel port (closes OS-33)
export { TribeGovernancePanel } from "./governance/TribeGovernancePanel";
export type { TribeGovernancePanelProps } from "./governance/TribeGovernancePanel";

// R5.3: bazaar-type feature gate components
export {
  BazaarFeature,
  BazaarFeatureRoot,
  NoTribeOnly,
  EasyOnly,
  AdvancedOnly,
  EasyOrAdvanced,
}                                            from "./BazaarFeature";
export type { BazaarFeatureProps, BazaarFeatureRootProps } from "./BazaarFeature";

// Beta: faucet notice card (users pay own SUI gas during EVE Frontier Beta)
export { default as AlphaFaucetNotice } from "./AlphaFaucetNotice";

// Post-V26: reusable Toast notification system
export { ToastProvider, useToast } from "./widgets/Toast";
export type { ToastVariant, ToastOptions } from "./widgets/Toast";

// Post-V26: lifted floating windows reusable across all 4 apps
export { default as ContactTicketWindow } from "./windows/ContactTicketWindow";
