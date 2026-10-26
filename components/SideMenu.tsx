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

function isHistoryPath(pathname: string): boolean {
  return pathname === "/history" || pathname.startsWith("/history/");
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

function WhatsAppIcon() {
  return (
    <svg className="drawer-icon-fill" viewBox="-3 -3 38 38" aria-hidden="true" focusable="false">
      <path d="M26.576 5.363c-2.69-2.69-6.406-4.354-10.511-4.354-8.209 0-14.865 6.655-14.865 14.865 0 2.732 0.737 5.291 2.022 7.491l-0.038-0.070-2.109 7.702 7.879-2.067c2.051 1.139 4.498 1.809 7.102 1.809h0.006c8.209-0.003 14.862-6.659 14.862-14.868 0-4.103-1.662-7.817-4.349-10.507l0 0zM16.062 28.228h-0.005c-0 0-0.001 0-0.001 0-2.319 0-4.489-0.64-6.342-1.753l0.056 0.031-0.451-0.267-4.675 1.227 1.247-4.559-0.294-0.467c-1.185-1.862-1.889-4.131-1.889-6.565 0-6.822 5.531-12.353 12.353-12.353s12.353 5.531 12.353 12.353c0 6.822-5.53 12.353-12.353 12.353h-0zM22.838 18.977c-0.371-0.186-2.197-1.083-2.537-1.208-0.341-0.124-0.589-0.185-0.837 0.187-0.246 0.371-0.958 1.207-1.175 1.455-0.216 0.249-0.434 0.279-0.805 0.094-1.15-0.466-2.138-1.087-2.997-1.852l0.010 0.009c-0.799-0.74-1.484-1.587-2.037-2.521l-0.028-0.052c-0.216-0.371-0.023-0.572 0.162-0.757 0.167-0.166 0.372-0.434 0.557-0.65 0.146-0.179 0.271-0.384 0.366-0.604l0.006-0.017c0.043-0.087 0.068-0.188 0.068-0.296 0-0.131-0.037-0.253-0.101-0.357l0.002 0.003c-0.094-0.186-0.836-2.014-1.145-2.758-0.302-0.724-0.609-0.625-0.836-0.637-0.216-0.010-0.464-0.012-0.712-0.012-0.395 0.010-0.746 0.188-0.988 0.463l-0.001 0.002c-0.802 0.761-1.3 1.834-1.3 3.023 0 0.026 0 0.053 0.001 0.079l-0-0.004c0.131 1.467 0.681 2.784 1.527 3.857l-0.012-0.015c1.604 2.379 3.742 4.282 6.251 5.564l0.094 0.043c0.548 0.248 1.25 0.513 1.968 0.74l0.149 0.041c0.442 0.14 0.951 0.221 1.479 0.221 0.303 0 0.601-0.027 0.889-0.078l-0.031 0.004c1.069-0.223 1.956-0.868 2.497-1.749l0.009-0.017c0.165-0.366 0.261-0.793 0.261-1.242 0-0.185-0.016-0.366-0.047-0.542l0.003 0.019c-0.092-0.155-0.34-0.247-0.712-0.434z" />
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

function HandHeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 10.2S8.4 8.2 8.4 5.7a1.9 1.9 0 0 1 3.6-.9 1.9 1.9 0 0 1 3.6.9c0 2.5-3.6 4.5-3.6 4.5z" />
      <path d="M3 15.5h2.5v5.5H3z" />
      <path d="M5.5 16.2l2.6-1.1c.6-.3 1.3-.3 1.9 0l2.4 1.1h2.4a1.4 1.4 0 0 1 0 2.8h-3.2" />
      <path d="M5.5 19.6l2.7.9c.5.2 1 .3 1.5.3h3.6c.9 0 1.7-.3 2.4-.9l4.3-3.7a1.4 1.4 0 0 0-1.9-2l-3.3 2.4" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="drawer-end" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="drawer-end drawer-end-toggle" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ArrowOutIcon() {
  return (
    <svg className="drawer-end" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 17L17 7M8 7h9v9" />
    </svg>
  );
}

export function SideMenu() {
  const ui = useUi();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showApk, setShowApk] = useState(false);
  const [legalOpen, setLegalOpen] = useState(true);
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
  const historyActive = isHistoryPath(pathname);
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
              <span className="drawer-item-label">{ui.menu.items.find}</span>
              <ChevronIcon />
            </Link>
            <Link
              className="drawer-item"
              href="/history"
              aria-current={historyActive ? "page" : undefined}
              onClick={dismiss}
            >
              <ClockIcon />
              <span className="drawer-item-label">{ui.menu.items.history}</span>
              <ChevronIcon />
            </Link>
          </div>

          {showApk && (
            <div className="drawer-group">
              <p className="drawer-label">{ui.menu.groups.app}</p>
              <a
                className="drawer-item"
                href={APK_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <DownloadIcon />
                <span className="drawer-item-label">{ui.menu.items.apk}</span>
                <ArrowOutIcon />
              </a>
            </div>
          )}

          <div className="drawer-group">
            <p className="drawer-label">{ui.menu.groups.support}</p>
            <a
              className="drawer-item"
              href={whatsapp.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon />
              <span className="drawer-item-label">{ui.menu.items.whatsapp}</span>
              <ArrowOutIcon />
            </a>
            <a
              className="drawer-item"
              href={donate.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <HandHeartIcon />
              <span className="drawer-item-label">{ui.menu.items.donate}</span>
              <ArrowOutIcon />
            </a>
          </div>

          <div className="drawer-group">
            <p className="drawer-label">{ui.menu.groups.info}</p>
            <button
              type="button"
              className="drawer-item"
              aria-expanded={legalOpen}
              aria-controls="drawer-legal"
              onClick={() => setLegalOpen((value) => !value)}
            >
              <DocIcon />
              <span className="drawer-item-label">{ui.menu.items.legal}</span>
              <ChevronDownIcon />
            </button>
            {legalOpen && (
              <div className="drawer-sub" id="drawer-legal">
                {legal.map((item) => (
                  <Link key={item.href} className="drawer-sub-link" href={item.href} onClick={dismiss}>
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>
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
