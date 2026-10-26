export function SectionOrnament() {
  return (
    <svg
      width="73"
      height="4"
      viewBox="0 0 73 4"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path d="M57.2497 0L53.6572 3.60889H0V0H57.2497Z" fill="currentColor" />
      <path d="M62.4526 0L58.8601 3.60889H56.8293L60.4218 0H62.4526Z" fill="currentColor" />
      <path d="M67.6555 0L64.063 3.60889H62.0278L65.6247 0H67.6555Z" fill="currentColor" />
      <path d="M72.8583 0L69.2614 3.60889H67.2307L70.8276 0H72.8583Z" fill="currentColor" />
    </svg>
  );
}

/** Garis tipis berujung panah » (dipakai di judul hitungan video). */
export function ArrowRuleOrnament() {
  return (
    <svg
      width="56"
      height="12"
      viewBox="0 0 56 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M0 6H46" />
      <path d="M44 2l5 4-5 4" />
      <path d="M49.5 2l5 4-5 4" />
    </svg>
  );
}

/** Ikon grid polos (2x2 kotak) untuk tombol tampilan grid. */
export function GridIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

/** Ikon list (tiga baris bertitik) untuk tombol tampilan list. */
export function ListIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="4.5" cy="6" r="0.9" />
      <circle cx="4.5" cy="12" r="0.9" />
      <circle cx="4.5" cy="18" r="0.9" />
      <line x1="9" y1="6" x2="21" y2="6" />
      <line x1="9" y1="12" x2="21" y2="12" />
      <line x1="9" y1="18" x2="21" y2="18" />
    </svg>
  );
}
