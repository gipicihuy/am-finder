import en from "@/locales/en.json";
import id from "@/locales/id.json";
import ms from "@/locales/ms.json";
import es from "@/locales/es.json";
import pt from "@/locales/pt.json";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export type UiTexts = typeof en;

const dictionaries: Record<Locale, UiTexts> = { en, id, ms, es, pt };

export function getUi(locale: Locale): UiTexts {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}
