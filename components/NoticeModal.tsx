"use client";

import { useEffect, useRef } from "react";
import { useUi } from "@/components/LocaleProvider";

type Props = {
  title: string;
  text: string;
  onClose: () => void;
};

export function NoticeModal({ title, text, onClose }: Props) {
  const ui = useUi();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="notice-backdrop" onClick={onClose}>
      <div
        className="notice-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="notice-head">
          <h2 className="notice-title">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="notice-close"
            aria-label={ui.common.close}
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <p className="notice-text">{text}</p>
      </div>
    </div>
  );
}
