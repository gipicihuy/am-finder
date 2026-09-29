export function AmLogo({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M43.5,28.3294a19.5,19.5,0,0,0-39,0" />
      <path d="M18.4694,32.593a6.9229,6.9229,0,0,0,9.79-9.7905" />
      <path d="M23.25,39.1706a11.2273,11.2273,0,1,0,0-22.4545" />
      <path d="M34.6024,38.2223a14.6374,14.6374,0,1,0-20.7-20.7" />
    </svg>
  );
}
