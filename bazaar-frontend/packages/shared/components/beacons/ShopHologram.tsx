// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import type { Shop } from "@bazaar/shared/types";

const WORD_LIMIT = 10;

function truncateTitle(title: string): { truncated: string; isTruncated: boolean } {
  const words = title.split(/\s+/);
  if (words.length <= WORD_LIMIT) return { truncated: title, isTruncated: false };
  return { truncated: words.slice(0, WORD_LIMIT).join(" ") + "...", isTruncated: true };
}

interface Props {
  shop: Shop;
  index: number;
  onClick: () => void;
  sellerName?: string;
  /** Number of shops stacked at this map position. >1 renders "N Shops". */
  stackCount?: number;
  /** Tier colour (own/tribe/other) — applied to the badge + a left accent. */
  tierColor?: string;
}

export default function ShopHologram({ shop, index, onClick, sellerName, stackCount, tierColor }: Props) {
  const isStack = (stackCount ?? 1) > 1;
  const { truncated, isTruncated: titleTruncated } = truncateTitle(shop.title);
  // Stacks never run the typewriter (their title is the synthetic "N Shops").
  const isTruncated = titleTruncated && !isStack;
  const [hovered, setHovered] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sellerDisplayed, setSellerDisplayed] = useState("");
  const sellerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTypewriter = useCallback(() => {
    setHovered(true);

    // Title typewriter — only when truncated
    if (isTruncated) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const prefix = truncated.slice(0, -3);
      setDisplayedText(prefix);
      let idx = prefix.length;
      const full = shop.title;
      intervalRef.current = setInterval(() => {
        idx++;
        if (idx <= full.length) {
          setDisplayedText(full.slice(0, idx));
        } else {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }, 40);
    }

    // Seller name typewriter — independent
    if (sellerName) {
      if (sellerIntervalRef.current) clearInterval(sellerIntervalRef.current);
      setSellerDisplayed("");
      let si = 0;
      sellerIntervalRef.current = setInterval(() => {
        si++;
        if (si <= sellerName.length) {
          setSellerDisplayed(sellerName.slice(0, si));
        } else {
          if (sellerIntervalRef.current) clearInterval(sellerIntervalRef.current);
        }
      }, 45);
    }
  }, [shop.title, truncated, isTruncated, sellerName]);

  const stopTypewriter = useCallback(() => {
    setHovered(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setDisplayedText("");
    if (sellerIntervalRef.current) {
      clearInterval(sellerIntervalRef.current);
      sellerIntervalRef.current = null;
    }
    setSellerDisplayed("");
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (sellerIntervalRef.current) clearInterval(sellerIntervalRef.current);
    };
  }, []);

  const titleText = isStack
    ? `${stackCount} Shops`
    : hovered && isTruncated ? displayedText : truncated;

  return (
    <div
      data-shop-id={shop.id}
      onClick={onClick}
      onMouseEnter={startTypewriter}
      onMouseLeave={stopTypewriter}
      className="shop-hologram"
      style={{
        animationDelay: `${index * 0.2}s`,
        ...(tierColor ? { borderLeft: `2px solid ${tierColor}`, paddingLeft: "4px" } : {}),
      }}
    >
      <span
        className="shop-hologram__kind"
        data-kind={shop.kind}
        style={tierColor ? { color: tierColor } : undefined}
      >
        {isStack ? `[${stackCount}]` : `[${shop.kind}]`}
      </span>
      {" "}{titleText}
      {hovered && isTruncated && displayedText.length < shop.title.length && (
        <span className="typewriter-cursor">|</span>
      )}
      {hovered && sellerName && (
        <div className="shop-hologram__seller">
          {sellerDisplayed}
          {sellerDisplayed.length < sellerName.length && (
            <span className="typewriter-cursor">|</span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
