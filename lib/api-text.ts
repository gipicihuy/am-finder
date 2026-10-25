import { getUi } from "@/lib/ui";
import type { Locale } from "@/lib/i18n";

export type ApiTextKey = keyof ReturnType<typeof getUi>["api"];

/** Pesan error API sesuai bahasa pilihan user (dipakai route handler). */
export function apiText(locale: Locale, key: ApiTextKey): string {
  return getUi(locale).api[key];
}
