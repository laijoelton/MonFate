"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}

export function BottomSheet({ title, onClose, children, wide = false }: BottomSheetProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`bottom-sheet ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-grabber" />
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="sheet-content">{children}</div>
      </section>
    </div>
  );
}
