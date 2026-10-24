"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@/lib/i18n";
import { getUi, type UiTexts } from "@/lib/ui";

type LocaleContextValue = {
  locale: Locale;
  ui: UiTexts;
  setLocale: (next: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    setLocaleState(initialLocale);
  }, [initialLocale]);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
      document.documentElement.lang = next;
      startTransition(() => router.refresh());
    },
    [router],
  );

  const value = useMemo(() => ({ locale, ui: getUi(locale), setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("LocaleProvider is missing");
  return value;
}

export function useUi(): UiTexts {
  return useLocaleContext().ui;
}

export function useLocale() {
  const { locale, setLocale } = useLocaleContext();
  return { locale, setLocale };
}
