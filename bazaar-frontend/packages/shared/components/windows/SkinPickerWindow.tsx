// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// SkinPickerWindow.tsx — floating "Identity" window opened by the SkinPickerBeacon.
// A holographic salvage-terminal roster of avatar skins. Clicking a portrait
// applies it LIVE (the avatar behind the window updates instantly) and broadcasts
// it over the relay so every other player sees the change. The reserved owner
// warpaint (red-tribal) renders locked unless `ownerUnlocked`.

import { useState } from "react";
import FloatingWindow from "../FloatingWindow";
import { PLAYER_SKINS, type PlayerSkin } from "../../data/playerSkins";

interface Props {
  /** Currently-equipped skin slug (highlighted). */
  currentSkin: string;
  /** Apply a skin live — updates the Godot avatar + relay broadcast. */
  onSelect: (slug: string) => void;
  onClose: () => void;
  /** True for the DappHub owner — unlocks the reserved warpaint. */
  ownerUnlocked?: boolean;
}

const AMETHYST = "184, 110, 240";
const EMBER = "204, 112, 0";

export default function SkinPickerWindow({ currentSkin, onSelect, onClose, ownerUnlocked = false }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <FloatingWindow title="Identity ∷ Avatar" onClose={onClose} wide>
      <div style={{ fontFamily: "var(--font-display, monospace)" }}>
        <p style={{
          margin: "0 0 14px",
          fontSize: "0.72rem",
          letterSpacing: "0.5px",
          color: `rgba(${AMETHYST}, 0.85)`,
          textTransform: "uppercase",
        }}>
          Select a chassis skin — applied instantly, seen by everyone in the bazaar.
        </p>

        <div className="scroll-area" style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))",
          gap: "12px",
          /* The roster scrolls under the pinned title/intro — with 11+ skins the
             grid otherwise pushed the window past short viewports (slice 7.5). */
          maxHeight: "min(56vh, 640px)",
          overflowY: "auto",
          paddingRight: 4,
        }}>
          {PLAYER_SKINS.map((skin: PlayerSkin) => {
            const locked = !!skin.reserved && !ownerUnlocked;
            const selected = skin.slug === currentSkin;
            const isHover = hovered === skin.slug;
            const accent = skin.reserved ? EMBER : AMETHYST;
            return (
              <button
                key={skin.slug}
                type="button"
                disabled={locked}
                onClick={() => !locked && onSelect(skin.slug)}
                onMouseEnter={() => setHovered(skin.slug)}
                onMouseLeave={() => setHovered(h => (h === skin.slug ? null : h))}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "10px 8px 8px",
                  cursor: locked ? "not-allowed" : "pointer",
                  background: selected
                    ? `linear-gradient(180deg, rgba(${accent},0.18), rgba(8,7,12,0.9))`
                    : "rgba(8, 7, 12, 0.78)",
                  border: `1px solid ${selected ? `rgba(${accent},0.95)` : `rgba(${accent},0.22)`}`,
                  borderRadius: 0,
                  outline: "none",
                  transform: isHover && !locked ? "translateY(-3px)" : "translateY(0)",
                  transition: "transform 0.18s ease, border-color 0.18s ease, background 0.18s ease",
                  boxShadow: selected ? `0 0 18px rgba(${accent},0.35)` : "none",
                  opacity: locked ? 0.5 : 1,
                  overflow: "hidden",
                }}
              >
                {/* portrait stage */}
                <div style={{
                  position: "relative",
                  width: "100%",
                  height: 132,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  background:
                    "radial-gradient(120% 80% at 50% 100%, rgba(255,255,255,0.06), rgba(0,0,0,0) 70%)",
                  // faint scanlines
                  backgroundImage:
                    "repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px)",
                }}>
                  <img
                    src={skin.thumb}
                    alt={skin.name}
                    draggable={false}
                    style={{
                      height: 128,
                      imageRendering: "auto",
                      filter: locked
                        ? "grayscale(1) brightness(0.7)"
                        : `drop-shadow(0 0 6px rgba(${accent},0.35))`,
                    }}
                  />
                  {selected && (
                    <span style={{
                      position: "absolute", top: 6, right: 6,
                      fontSize: "0.5rem", letterSpacing: "1px",
                      padding: "2px 5px",
                      color: "#0a0a0a", background: `rgb(${accent})`,
                      fontWeight: 700,
                    }}>EQUIPPED</span>
                  )}
                  {locked && (
                    <span style={{
                      position: "absolute", top: 6, right: 6,
                      fontSize: "0.5rem", letterSpacing: "1px",
                      padding: "2px 5px",
                      color: `rgb(${EMBER})`, border: `1px solid rgba(${EMBER},0.7)`,
                      fontWeight: 700,
                    }}>OWNER</span>
                  )}
                </div>

                {/* name + blurb */}
                <div style={{
                  marginTop: 8, width: "100%", textAlign: "center",
                }}>
                  <div style={{
                    fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    color: selected ? `rgb(${accent})` : "rgba(235,235,245,0.92)",
                  }}>{skin.name}</div>
                  <div style={{
                    marginTop: 3, minHeight: "1.5em",
                    fontSize: "0.55rem", lineHeight: 1.3,
                    color: "rgba(190,190,205,0.6)",
                    opacity: isHover ? 1 : 0.55,
                    transition: "opacity 0.18s ease",
                  }}>{locked ? "Granted to the DappHub owner." : skin.blurb}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </FloatingWindow>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
