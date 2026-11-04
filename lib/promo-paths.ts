/**
 * Path-path di mana popup/toast promosi (SupportModal, WaChannelToast, PremiumPromo)
 * dinonaktifkan secara total.
 */
export const SUPPRESSED_PROMO_PATHS = [
  "/support-admin",
  "/monitor-givy",
  "/terms",
  "/privacy",
];

export function shouldSuppressPromo(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return SUPPRESSED_PROMO_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
}
