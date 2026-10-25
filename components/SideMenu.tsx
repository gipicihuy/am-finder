"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AmLogo } from "@/components/AmLogo";
import { APK_URL } from "@/lib/app-links";
import { isInAndroidApp, isIos } from "@/lib/in-app";
import { clearBrandFlight, flyBrand, prefersReducedMotion } from "@/lib/brand-flight";
import { useUi } from "@/components/LocaleProvider";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isFinderPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/search" || pathname.startsWith("/preset");
}

function MenuIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <rect x="32" y="60" width="192" height="24" rx="12" />
        <rect x="32" y="116" width="192" height="24" rx="12" />
        <rect x="32" y="172" width="192" height="24" rx="12" />
      </g>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4v11M7.5 11.5L12 16l4.5-4.5M5 20h14" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
    </svg>
  );
}

export function SideMenu() {
  const ui = useUi();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showApk, setShowApk] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    setShowApk(!isInAndroidApp() && !isIos());
  }, []);

  useEffect(
    () => () => {
      clearBrandFlight();
      delete document.documentElement.dataset.menu;
    },
    [],
  );

  const openMenu = useCallback(() => {
    const panel = panelRef.current;
    openRef.current = true;
    const flying = panel && !prefersReducedMotion() ? flyBrand("in", panel, () => undefined) : false;
    if (!flying) clearBrandFlight();
    document.documentElement.dataset.menu = "open";
    setOpen(true);
  }, []);

  const closeMenu = useCallback((refocus = true) => {
    const panel = panelRef.current;
    openRef.current = false;
    const finish = () => {
      delete document.documentElement.dataset.menu;
    };
    const flying = panel && !prefersReducedMotion() ? flyBrand("out", panel, finish) : false;
    if (!flying) {
      clearBrandFlight();
      finish();
    }
    setOpen(false);
    if (refocus) openerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (openRef.current) closeMenu(false);
  }, [pathname, closeMenu]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => closeRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeMenu]);

  const [donate, whatsapp] = ui.footer.columns[0].items;
  const legal = ui.footer.columns[1].items;
  const finderActive = isFinderPath(pathname);
  const dismiss = () => closeMenu(false);

  const drawer = (
    <div className="drawer" data-open={open} inert={!open}>
      <div className="drawer-backdrop" onClick={() => closeMenu()} />
      <div className="drawer-panel" role="dialog" aria-modal="true" aria-label={ui.menu.title} ref={panelRef}>
        <div className="drawer-head">
          <Link className="drawer-logo" href="/" aria-label={ui.header.homeLabel} onClick={dismiss}>
            <AmLogo size={32} />
          </Link>
          <span className="drawer-name">{ui.header.brand}</span>
          <button ref={closeRef} type="button" className="drawer-close" aria-label={ui.menu.close} onClick={() => closeMenu()}>
            <CloseIcon />
          </button>
        </div>

        <nav className="drawer-nav" aria-label={ui.menu.title}>
          <div className="drawer-group">
            <p className="drawer-label">{ui.menu.groups.presets}</p>
            <Link
              className="drawer-item"
              href="/"
              aria-current={finderActive ? "page" : undefined}
              onClick={dismiss}
            >
              <SearchIcon />
              <span>{ui.menu.items.find}</span>
            </Link>
            <div className="drawer-item is-disabled" aria-disabled="true">
              <ClockIcon />
              <span className="drawer-item-text">
                {ui.menu.items.history}
                <span className="drawer-badge">{ui.menu.comingSoon}</span>
              </span>
            </div>
          </div>

          {showApk && (
            <div className="drawer-group">
              <p className="drawer-label">{ui.menu.groups.app}</p>
              <a className="drawer-item" href={APK_URL} target="_blank" rel="noopener noreferrer">
                <DownloadIcon />
                <span>{ui.menu.items.apk}</span>
              </a>
            </div>
          )}

          <div className="drawer-group">
            <p className="drawer-label">{ui.menu.groups.support}</p>
            <a className="drawer-item" href={whatsapp.href} target="_blank" rel="noopener noreferrer">
              <ChatIcon />
              <span>{ui.menu.items.whatsapp}</span>
            </a>
            <a className="drawer-item" href={donate.href} target="_blank" rel="noopener noreferrer">
              <HeartIcon />
              <span>{ui.menu.items.donate}</span>
            </a>
          </div>
        </nav>

        <div className="drawer-foot">
          <div className="drawer-legal">
            {legal.map((item) => (
              <Link key={item.href} href={item.href} onClick={dismiss}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="nav-menu">
      <button
        ref={openerRef}
        type="button"
        className="nav-menu-btn"
        aria-label={ui.menu.open}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openMenu}
      >
        <MenuIcon />
      </button>
      {mounted ? createPortal(drawer, document.body) : null}
    </div>
  );
}
