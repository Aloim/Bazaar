/**
 * FloatingWindow.tsx — Reusable modal overlay wrapper.
 *
 * Extracts the .modal-overlay + .modal pattern used across all DappHub
 * floating windows. Renders a backdrop and centred modal box with a
 * title bar and close button.
 *
 * Styling uses CSS custom properties defined in @bazaar/shared/css/index.css
 * or the consuming app's own stylesheet — the class names are identical.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

import { type ReactNode } from "react";
import WindowHeader from "./windows/WindowHeader";

export interface FloatingWindowProps {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}

export default function FloatingWindow({
  title,
  onClose,
  wide = false,
  children,
}: FloatingWindowProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal${wide ? " modal--wide" : ""}`}
        onClick={e => e.stopPropagation()}
      >
        <WindowHeader
          title={title}
          onClose={onClose}
          className="modal__header"
          titleClassName="modal__title"
        />
        {children}
      </div>
    </div>
  );
}
