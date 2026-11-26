"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type IconProps = { size?: number; className?: string };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconSearch({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

export function IconClose({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconChevron({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconArrowLeft({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className={className}>
      <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
    </svg>
  );
}

export function IconBell({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className={className}>
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function IconHome({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className={className}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function IconLayers({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className={className}>
      <path d="m12 3 8 4.5-8 4.5-8-4.5z" />
      <path d="m4 12.5 8 4.5 8-4.5" />
      <path d="m4 16.5 8 4.5 8-4.5" />
    </svg>
  );
}

export function IconUser({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export function IconCheck({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className={className}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

export function IconPlus({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconSpark({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className={className}>
      <path d="M12 3.5 13.8 9 19 10.8 13.8 12.6 12 18l-1.8-5.4L5 10.8 10.2 9z" />
    </svg>
  );
}

export function GlassSearchBar({
  id,
  placeholder,
  onSubmit,
}: {
  id: string;
  placeholder: string;
  onSubmit?: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  return (
    <form
      className="lg-search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(value.trim());
      }}
    >
      <label className="lg-field" htmlFor={id}>
        <span className="sr-only">{placeholder}</span>
        <IconSearch />
        <input
          id={id}
          className="lg-input"
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button className="lg-btn lg-btn-primary" type="submit">
        Find
      </button>
    </form>
  );
}

export function GlassTabs({
  tabs,
  idPrefix,
}: {
  tabs: { id: string; label: string; body: string }[];
  idPrefix: string;
}) {
  const [active, setActive] = useState(tabs[0].id);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const listRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const measure = useCallback(() => {
    const node = buttonRefs.current[active];
    const parent = listRef.current;
    if (!node || !parent) return;
    setPill({ left: node.offsetLeft, width: node.offsetWidth });
  }, [active]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <div>
      <div className="lg-tabs lg-glass lg-m-subtle" role="tablist" ref={listRef}>
        <span
          className="lg-tab-pill"
          aria-hidden="true"
          style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
        />
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${idPrefix}-tab-${tab.id}`}
            ref={(node) => {
              buttonRefs.current[tab.id] = node;
            }}
            type="button"
            role="tab"
            className="lg-tab"
            aria-selected={active === tab.id}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => {
              const index = tabs.findIndex((item) => item.id === active);
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const step = event.key === "ArrowRight" ? 1 : -1;
                const next = tabs[(index + step + tabs.length) % tabs.length];
                setActive(next.id);
                buttonRefs.current[next.id]?.focus();
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <p
        className="lg-tab-panel"
        role="tabpanel"
        id={`${idPrefix}-panel-${active}`}
        aria-labelledby={`${idPrefix}-tab-${active}`}
        key={active}
      >
        {tabs.find((tab) => tab.id === active)?.body}
      </p>
    </div>
  );
}

export function GlassDropdown() {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState("Standard");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const options = ["Subtle", "Standard", "Premium", "Frosted", "Clear", "Colored"];

  return (
    <div className="lg-dropdown" ref={wrapRef}>
      <button
        type="button"
        className="lg-btn lg-btn-glass"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
      >
        {picked}
        <IconChevron />
      </button>
      {open && (
        <ul className="lg-menu lg-glass lg-m-premium" role="listbox" aria-label="Glass material">
          {options.map((option) => (
            <li key={option} role="option" aria-selected={picked === option}>
              <button
                type="button"
                className="lg-menu-item"
                onClick={() => {
                  setPicked(option);
                  setOpen(false);
                }}
              >
                {picked === option ? <IconCheck /> : <span style={{ width: 16 }} />}
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function GlassModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="lg-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="lg-modal lg-glass lg-m-premium"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lg-modal-title"
        tabIndex={-1}
        ref={panelRef}
      >
        <span className="lg-badge lg-badge-soft" style={{ marginBottom: 12 }}>
          <IconSpark />
          Premium material
        </span>
        <h3 id="lg-modal-title">Apply liquid glass to this panel?</h3>
        <p>
          This dialog uses the heaviest material in the set: 24px blur, 1.6 saturation and a full
          refraction rim. Escape, the close button and the backdrop all dismiss it.
        </p>
        <div className="lg-modal-actions">
          <button type="button" className="lg-btn lg-btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="lg-btn lg-btn-primary" onClick={onClose}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export type GlassToastData = { id: number; title: string; text: string };

export function GlassToast({ toast, onClose }: { toast: GlassToastData; onClose: () => void }) {
  return (
    <div className="lg-toast lg-glass lg-m-premium" role="status">
      <span className="lg-badge lg-badge-soft">
        <IconBell size={14} />
      </span>
      <div className="lg-toast-body">
        <div className="lg-toast-title">{toast.title}</div>
        <div className="lg-toast-text">{toast.text}</div>
      </div>
      <button
        type="button"
        className="lg-btn lg-btn-quiet lg-btn-sm lg-btn-icon"
        aria-label="Dismiss notification"
        onClick={onClose}
      >
        <IconClose />
      </button>
    </div>
  );
}

const DOCK_ITEMS = [
  { id: "home", label: "Home", Icon: IconHome },
  { id: "labs", label: "Labs", Icon: IconLayers },
  { id: "you", label: "You", Icon: IconUser },
];

export function GlassBottomDock() {
  const [current, setCurrent] = useState("home");

  return (
    <nav className="lg-dock lg-glass lg-m-premium" aria-label="Glass bottom navigation">
      {DOCK_ITEMS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className="lg-dock-item"
          aria-current={current === id ? "page" : undefined}
          onClick={() => setCurrent(id)}
        >
          <Icon size={20} />
          {label}
        </button>
      ))}
    </nav>
  );
}

export function GlassFab({ onAction }: { onAction: () => void }) {
  return (
    <button type="button" className="lg-fab" aria-label="New glass element" onClick={onAction}>
      <IconPlus />
    </button>
  );
}
