"use client";

import { LOCALES, type Locale } from "@/lib/i18n";
import { useLocale, useUi } from "@/components/LocaleProvider";

export function LanguageSwitch() {
  const ui = useUi();
  const { locale, setLocale } = useLocale();

  return (
    <div className="nav-lang">
      <div className="lang-switch" role="group" aria-label={ui.lang.label}>
        {LOCALES.map((code: Locale) => (
          <button
            key={code}
            type="button"
            className="lang-btn"
            lang={code}
            aria-pressed={locale === code}
            aria-label={ui.lang[code]}
            title={ui.lang[code]}
            onClick={() => setLocale(code)}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
