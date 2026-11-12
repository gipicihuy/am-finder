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
  const actionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    actionRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
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
        <button type="button" className="notice-close" aria-label={ui.common.close} onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        <span className="notice-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.6-3.6" />
            <path d="M8.6 8.6l4.8 4.8M13.4 8.6l-4.8 4.8" />
          </svg>
        </span>
        <h2 className="notice-title">{title}</h2>
        <p className="notice-text">{text}</p>
        <button ref={actionRef} type="button" className="notice-action" onClick={onClose}>
          {ui.common.close}
        </button>
      </div>
    </div>
  );
}
