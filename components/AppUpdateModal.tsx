"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useLocale, useUi } from "@/components/LocaleProvider";
import type { Locale } from "@/lib/i18n";
import {
  LEGACY_FLOOR_VERSION,
  decideUpdate,
  detectApkVersion,
  isLikelyAndroidWebView,
} from "@/lib/apk-version";

type UpdateData = {
  latest_version: string;
  minimum_version: string;
  update_url: string;
  release_notes: string | Partial<Record<Locale, string>>;
};

// Pilih catatan pembaruan sesuai bahasa web; cadangan: en, lalu id, lalu bahasa apa pun yang ada.
function pickReleaseNotes(notes: UpdateData["release_notes"] | undefined, locale: Locale): string {
  if (!notes) return "";
  if (typeof notes === "string") return notes;
  return (
    notes[locale] ||
    notes.en ||
    notes.id ||
    Object.values(notes).find((text) => typeof text === "string" && text) ||
    ""
  );
}

export function AppUpdateModal() {
  const ui = useUi();
  const { locale } = useLocale();
  const [modalType, setModalType] = useState<"force" | "optional" | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateData | null>(null);
  const [userApkVersion, setUserApkVersion] = useState<string>("1.0");
  const [userApkExact, setUserApkExact] = useState<boolean>(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryBtnRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const apk = detectApkVersion();
    if (!apk.isApk && !isLikelyAndroidWebView(navigator.userAgent || "")) return;

    if (apk.isApk && apk.version) {
      setUserApkVersion(apk.version);
      setUserApkExact(apk.exact);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    fetch(`/api/app-update?_t=${Date.now()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: (UpdateData & { ok?: boolean; from_apk?: boolean }) | null) => {
        clearTimeout(timer);
        if (!data || !data.minimum_version) return;

        let current = detectApkVersion();
        if (!current.isApk || !current.version) {
          if (data.from_apk !== true) return;
          current = {
            isApk: true,
            version: LEGACY_FLOOR_VERSION,
            exact: false,
            source: "header",
          };
        }
        const currentVer = current.version as string;
        setUserApkVersion(currentVer);
        setUserApkExact(current.exact);

        setUpdateInfo({
          latest_version: data.latest_version,
          minimum_version: data.minimum_version,
          update_url: data.update_url,
          release_notes: data.release_notes,
        });

        const decision = decideUpdate(currentVer, data.minimum_version, data.latest_version);

        // 1. Versi APK < minimum_version: wajib update (tidak bisa dilewati)
        if (decision === "force") {
          setModalType("force");
          return;
        }

        // 2. Versi APK < latest_version (dan >= minimum_version): update opsional
        if (decision === "optional") {
          const dismissKey = `am_update_dismissed_${data.latest_version}`;
          try {
            if (sessionStorage.getItem(dismissKey) !== "1") {
              setModalType("optional");
            }
          } catch {
            setModalType("optional");
          }
          return;
        }

        // 3. Versi APK >= latest_version: tidak tampil dialog sama sekali
        setModalType(null);
      })
      .catch(() => {
        clearTimeout(timer);
        // Error koneksi ditangani dengan aman agar tidak crash
      });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const dismissOptional = useCallback(() => {
    if (modalType === "optional" && updateInfo) {
      try {
        sessionStorage.setItem(`am_update_dismissed_${updateInfo.latest_version}`, "1");
      } catch {}
      setModalType(null);
    }
  }, [modalType, updateInfo]);

  // Kunci scroll & keyboard saat modal aktif
  useEffect(() => {
    if (!modalType) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primaryBtnRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (modalType === "force") {
        // Pada Force Update: Kunci total, tidak bisa ditutup atau dilewati
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          primaryBtnRef.current?.focus();
          return;
        }
      } else if (modalType === "optional") {
        if (e.key === "Escape") {
          e.preventDefault();
          dismissOptional();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });

    let onPopState: (() => void) | null = null;
    if (modalType === "force") {
      try {
        window.history.pushState(null, "", window.location.href);
        onPopState = () => {
          window.history.pushState(null, "", window.location.href);
        };
        window.addEventListener("popstate", onPopState);
      } catch {}
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      if (onPopState) window.removeEventListener("popstate", onPopState);
    };
  }, [modalType, dismissOptional]);

  if (!modalType || !updateInfo) return null;

  const isForce = modalType === "force";

  const handleUpdateClick = () => {
    if (updateInfo.update_url) {
      // WebView APK otomatis mencegat URL eksternal dan membukanya di browser native
      window.location.assign(updateInfo.update_url);
    }
  };

  const t = ui.update;
  const releaseNotes = pickReleaseNotes(updateInfo.release_notes, locale);
  const versionLabel = userApkExact ? `v${userApkVersion}` : t.legacyVersion;

  return (
    <div
      className={`app-update-overlay ${isForce ? "is-force" : "is-optional"}`}
      data-nosnippet
      onClick={isForce ? undefined : dismissOptional}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
    >
      <div
        ref={dialogRef}
        className="app-update-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {!isForce && (
          <button
            type="button"
            className="app-update-close"
            onClick={dismissOptional}
            aria-label={ui.common.close}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}

        <div className="app-update-icon-wrap">
          {isForce ? (
            <div className="app-update-icon is-force" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          ) : (
            <div className="app-update-icon is-optional" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
          )}
        </div>

        <h2 id="app-update-title" className="app-update-title">
          {isForce ? t.forceTitle : t.optionalTitle}
        </h2>

        <div className="app-update-badges">
          <span className="app-update-badge is-current">
            {t.currentVersion}: {versionLabel}
          </span>
          <span className="app-update-arrow" aria-hidden="true">→</span>
          <span className={`app-update-badge ${isForce ? "is-target-force" : "is-target-optional"}`}>
            {isForce ? `${t.minVersion}: v${updateInfo.minimum_version}` : `${t.newVersion}: v${updateInfo.latest_version}`}
          </span>
        </div>

        <p className="app-update-desc">
          {isForce
            ? t.forceDesc
                .replace("{version}", versionLabel)
                .replace("{latest}", `v${updateInfo.latest_version}`)
            : t.optionalDesc
                .replace("{version}", versionLabel)
                .replace("{latest}", `v${updateInfo.latest_version}`)}
        </p>

        {releaseNotes ? (
          <div className="app-update-notes-box">
            <span className="app-update-notes-label">{t.releaseNotes}</span>
            <p className="app-update-notes-content">{releaseNotes}</p>
          </div>
        ) : null}

        <div className="app-update-actions">
          <a
            ref={primaryBtnRef}
            href={updateInfo.update_url}
            onClick={(e) => {
              e.preventDefault();
              handleUpdateClick();
            }}
            className="btn btn-primary app-update-primary"
            rel="noopener noreferrer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{t.updateNow}</span>
          </a>

          {!isForce && (
            <button
              type="button"
              className="btn btn-secondary app-update-later"
              onClick={dismissOptional}
            >
              {t.later}
            </button>
          )}
        </div>

        <p className="app-update-safelink-notice">
          {t.safelinkNotice}
        </p>
      </div>
    </div>
  );
}
