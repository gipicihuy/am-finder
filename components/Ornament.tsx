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

/**
 * Ikon pengganti tampilan hasil. Bingkai sudut ala viewfinder logo AM,
 * isinya (kotak / garis) berwarna aksen. `mode` = tampilan tujuan.
 */
export function ViewIcon({ mode }: { mode: "grid" | "list" }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.8">
        <path d="M2 6V4a2 2 0 0 1 2-2h3" />
        <path d="M17 2h3a2 2 0 0 1 2 2v2" />
        <path d="M22 17v3a2 2 0 0 1-2 2h-3" />
        <path d="M7 22H4a2 2 0 0 1-2-2v-3" />
      </g>
      {mode === "grid" ? (
        <g fill="var(--accent)">
          <rect x="7" y="7" width="4" height="4" rx="1" />
          <rect x="13" y="7" width="4" height="4" rx="1" />
          <rect x="7" y="13" width="4" height="4" rx="1" />
          <rect x="13" y="13" width="4" height="4" rx="1" />
        </g>
      ) : (
        <g stroke="var(--accent)" strokeWidth="1.8">
          <path d="M7 8h10" />
          <path d="M7 12h10" />
          <path d="M7 16h10" />
        </g>
      )}
    </svg>
  );
}
