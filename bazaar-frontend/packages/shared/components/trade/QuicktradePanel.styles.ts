// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

/**
 * QuicktradePanel.styles — Extracted inline style objects from QuicktradePanel.tsx
 *
 * Original location: Bazar1/dapp/frontend/src/components/QuicktradePanel.tsx (split for 500-line guard)
 *
 * This file centralizes all React.CSSProperties style definitions previously
 * inlined in QuicktradePanel.tsx, reducing the main component to ~408 LOC
 * post-extraction, leaving room for V9 hook migration edits.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */

import type { CSSProperties } from "react";

export const panelStyle: CSSProperties = {
  background:   "rgba(10,20,30,0.97)",
  border:       "1px solid rgba(204,112,0,0.4)",
  borderRadius: "8px",
  padding:      "0",
  minWidth:     "360px",
  maxWidth:     "480px",
  maxHeight:    "90vh",
  overflowY:    "auto",
  color:        "#e0e0e0",
  fontFamily:   "inherit",
};

export const headerStyle: CSSProperties = {
  display:        "flex",
  alignItems:     "center",
  justifyContent: "space-between",
  padding:        "12px 16px",
  borderBottom:   "1px solid rgba(204,112,0,0.3)",
  position:       "sticky",
  top:            0,
  background:     "rgba(10,20,30,0.99)",
  zIndex:         1,
};

export const titleStyle: CSSProperties = {
  margin:     0,
  fontSize:   "0.95rem",
  fontWeight: 700,
  color:      "rgb(204,112,0)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

export const warningStyle: CSSProperties = {
  background:   "rgba(204,112,0,0.12)",
  border:       "1px solid rgba(204,112,0,0.3)",
  borderRadius: "4px",
  padding:      "8px 12px",
  fontSize:     "0.78rem",
  color:        "#c8a060",
  margin:       "12px 16px 0",
  lineHeight:   1.4,
};

export const sectionStyle: CSSProperties = {
  padding: "12px 16px",
};

export const sectionTitleStyle: CSSProperties = {
  fontSize:      "0.78rem",
  fontWeight:    600,
  color:         "rgba(204,112,0,0.8)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom:  "8px",
};

export const dividerStyle: CSSProperties = {
  borderTop: "1px solid rgba(204,112,0,0.2)",
  margin:    "0 16px",
};

export const itemRowStyle: CSSProperties = {
  display:        "flex",
  alignItems:     "center",
  justifyContent: "space-between",
  padding:        "6px 0",
  borderBottom:   "1px solid rgba(204,112,0,0.15)",
};

export const inputStyle: CSSProperties = {
  width:          "50px",
  padding:        "3px 6px",
  background:     "rgba(255,255,255,0.07)",
  border:         "1px solid rgba(204,112,0,0.3)",
  borderRadius:   "3px",
  color:          "#e0e0e0",
  fontSize:       "0.82rem",
  textAlign:      "right",
};

export const mutedStyle: CSSProperties = {
  color:    "#666",
  fontSize: "0.78rem",
  padding:  "8px 0",
};

export const statusStyle: CSSProperties = {
  padding:      "8px 12px",
  margin:       "0 16px 8px",
  borderRadius: "4px",
  fontSize:     "0.8rem",
};

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
