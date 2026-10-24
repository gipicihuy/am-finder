import en from "@/locales/en.json";
import id from "@/locales/id.json";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export type UiTexts = typeof en;

const dictionaries: Record<Locale, UiTexts> = { en, id };

export function getUi(locale: Locale): UiTexts {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}
