// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

// Original location: Bazar1/dapp/frontend/src/components/CreateShopModal.tsx (lines 41-148; split for 500-line guard, section: ItemTypeSearch autocomplete).
// Re-imported into ./index.tsx.

import { useState, useEffect, useRef, useMemo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { searchCachedItemTypes } from "@bazaar/shared/hooks";

export function ItemTypeSearch({ value, onChange, className }: {
  value: number;
  onChange: (typeId: number) => void;
  className?: string;
}) {
  const [query, setQuery] = useState(value ? `#${value}` : "");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  const suggestions = useMemo(() => {
    if (query.trim().length === 0) return [];
    const results = searchCachedItemTypes(query, 10);
    // Numeric fallback: if query is a pure number, add "Use ID: X" option
    const asNum = parseInt(query, 10);
    if (!isNaN(asNum) && asNum > 0 && String(asNum) === query.trim()) {
      const alreadyIncluded = results.some(r => r.typeId === asNum);
      if (!alreadyIncluded) {
        results.push({ typeId: asNum, name: `Use ID: ${asNum}` });
      }
    }
    return results;
  }, [query]);

  // Position the dropdown via portal
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !inputRef.current) { setPos(null); return; }
    const rect = inputRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
  }, [open, query]);

  // Close on click-outside, scroll, resize
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const handleDismiss = () => setOpen(false);
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("resize", handleDismiss);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("resize", handleDismiss);
    };
  }, [open]);

  function handleSelect(typeId: number) {
    onChange(typeId);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx(i => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx(i => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && highlightIdx >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightIdx].typeId);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const dropdown = open && suggestions.length > 0 && pos ? createPortal(
    <ul ref={dropdownRef} className="item-type-search__dropdown"
      style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 220) }}>
      {suggestions.map((s, i) => (
        <li key={s.typeId}
          className={`item-type-search__option ${i === highlightIdx ? "item-type-search__option--active" : ""}`}
          onMouseDown={() => handleSelect(s.typeId)}>
          {s.iconUrl && <img className="item-type-search__icon" src={s.iconUrl} alt="" />}
          <span className="item-type-search__name">{s.name}</span>
          <span className="item-type-search__id">#{s.typeId}</span>
        </li>
      ))}
    </ul>,
    document.body,
  ) : null;

  return (
    <div className="item-type-search">
      <input
        ref={inputRef}
        type="text"
        className={`input ${className ?? ""}`}
        placeholder="Search item name or type ID..."
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHighlightIdx(-1); }}
        onFocus={() => { if (query.length > 0) setOpen(true); }}
        onKeyDown={handleKeyDown}
      />
      {dropdown}
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
