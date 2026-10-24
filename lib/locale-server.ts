import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, fromAcceptLanguage, isLocale, type Locale } from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const saved = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  const list = await headers();
  return fromAcceptLanguage(list.get("accept-language"));
}
