// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { useState, useRef, useEffect, useMemo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useConnection } from "@evefrontier/dapp-kit";
import { useSSURoleList } from "@bazaar/shared/hooks/useSSURoleList";
import { useShops } from "@bazaar/shared/hooks/useShops";
import { useCharacterNames } from "@bazaar/shared/hooks/useCharacterNames";
import { SSU_OBJECT_ID } from "@bazaar/shared/constants";

interface AddressInputProps {
  value: string;
  onChange: (addr: string) => void;
  placeholder?: string;
}

export default function AddressInput({ value, onChange, placeholder }: AddressInputProps) {
  const [nameQuery, setNameQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const { entries: roleEntries } = useSSURoleList(SSU_OBJECT_ID || null);
  const { shops }                = useShops();
  const { walletAddress }        = useConnection();

  const knownAddresses = useMemo(() => {
    const seen = new Set<string>(roleEntries.map(e => e.address));
    for (const shop of shops) {
      if (!seen.has(shop.owner)) seen.add(shop.owner);
    }
    if (walletAddress && !seen.has(walletAddress)) seen.add(walletAddress);
    return Array.from(seen);
  }, [roleEntries, shops, walletAddress]);
  const characterNames = useCharacterNames(knownAddresses);

  const knownUsers = useMemo(() => {
    return knownAddresses
      .map(addr => ({ address: addr, name: characterNames.get(addr) ?? "" }))
      .filter(u => u.name.length > 0);
  }, [knownAddresses, characterNames]);

  const suggestions = useMemo(() => {
    if (nameQuery.trim().length === 0) return [];
    const lower = nameQuery.toLowerCase();
    return knownUsers.filter(u => u.name.toLowerCase().includes(lower));
  }, [nameQuery, knownUsers]);

  // Position the portal dropdown relative to the search input
  useLayoutEffect(() => {
    if (!dropdownOpen || !inputRef.current) {
      setDropdownPos(null);
      return;
    }
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [dropdownOpen, nameQuery]);

  // CR-001: Check both wrapper and portal dropdown refs for click-outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        wrapperRef.current && !wrapperRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown on ancestor scroll (position: fixed won't track scroll)
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleScroll() { setDropdownOpen(false); }
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [dropdownOpen]);

  // CR-002: Close dropdown on window resize
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleResize() { setDropdownOpen(false); }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [dropdownOpen]);

  function handleSelect(address: string) {
    onChange(address);
    setNameQuery("");
    setDropdownOpen(false);
    setHighlightIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightIndex].address);
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  }

  const resolvedName = value ? characterNames.get(value) : undefined;

  const dropdownContent = dropdownOpen && suggestions.length > 0 && dropdownPos && (
    <ul
      ref={dropdownRef}
      className="user-search__dropdown user-search__dropdown--portal"
      role="listbox"
      style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
    >
      {suggestions.map((u, idx) => (
        <li
          key={u.address}
          role="option"
          aria-selected={idx === highlightIndex}
          className={[
            "user-search__option",
            idx === highlightIndex ? "user-search__option--active" : "",
          ].join(" ").trim()}
          onMouseDown={() => handleSelect(u.address)}
          onMouseEnter={() => setHighlightIndex(idx)}
        >
          <span className="user-search__name">{u.name}</span>
          <span className="user-search__addr muted">{u.address.slice(0, 8)}…</span>
        </li>
      ))}
    </ul>
  );

  const emptyContent = dropdownOpen && nameQuery.trim().length > 0 && suggestions.length === 0 && dropdownPos && (
    <div
      className="user-search__empty user-search__empty--portal muted"
      style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
    >
      No known users match "{nameQuery}"
    </div>
  );

  return (
    <div className="address-input" ref={wrapperRef}>
      <small className="form-hint" style={{ display: "block", marginBottom: "0.3rem", color: "var(--muted)", fontSize: "0.72rem" }}>
        Type a character name to search; or paste a 0x address below.
      </small>
      <div className="user-search" style={{ marginBottom: "0.25rem" }}>
        <input
          ref={inputRef}
          className="input"
          value={nameQuery}
          placeholder="Search by name..."
          autoComplete="off"
          onChange={e => {
            setNameQuery(e.target.value);
            setDropdownOpen(true);
            setHighlightIndex(-1);
          }}
          onFocus={() => { if (nameQuery.trim().length > 0) setDropdownOpen(true); }}
          onKeyDown={handleKeyDown}
        />
        {dropdownContent && createPortal(dropdownContent, document.body)}
        {emptyContent && createPortal(emptyContent, document.body)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          className="input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? "0x..."}
        />
        {resolvedName && (
          <span className="muted" style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>{resolvedName}</span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
