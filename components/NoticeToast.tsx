"use client";

import { useEffect, useRef, useState } from "react";

const HOLD_MS = 4250;
const EXIT_MS = 250;

export function NoticeToast({ text, onDone }: { text: string; onDone?: () => void }) {
  const [phase, setPhase] = useState<"in" | "out">("in");
  const timers = useRef<number[]>([]);

  function dismiss() {
    timers.current.forEach((t) => window.clearTimeout(t));
    setPhase("out");
    timers.current = [window.setTimeout(() => onDone?.(), EXIT_MS)];
  }

  useEffect(() => {
    timers.current = [window.setTimeout(dismiss, HOLD_MS)];
    return () => timers.current.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      type="button"
      role="alert"
      className={phase === "out" ? "found-toast found-toast-warn is-leaving" : "found-toast found-toast-warn"}
      onClick={dismiss}
    >
      <span>{text}</span>
    </button>
  );
}
