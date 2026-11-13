import en from "@/locales/en.json";
import id from "@/locales/id.json";
import zh from "@/locales/zh.json";
import my from "@/locales/my.json";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export type UiTexts = typeof en;

const dictionaries: Record<Locale, UiTexts> = { en, id, zh, my };

export function getUi(locale: Locale): UiTexts {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}
