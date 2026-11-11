"use client";

import { useEffect, useRef, useState } from "react";

const HOLD_MS = 4250;
const EXIT_MS = 250;

export function NoticeToast({
  text,
  onDone,
  action,
  onAction,
  persistent = false,
}: {
  text: string;
  onDone?: () => void;
  action?: string;
  onAction?: () => void;
  persistent?: boolean;
}) {
  const [phase, setPhase] = useState<"in" | "out">("in");
  const timers = useRef<number[]>([]);

  function dismiss() {
    timers.current.forEach((t) => window.clearTimeout(t));
    setPhase("out");
    timers.current = [window.setTimeout(() => onDone?.(), EXIT_MS)];
  }

  useEffect(() => {
    if (persistent) return;
    timers.current = [window.setTimeout(dismiss, HOLD_MS)];
    return () => timers.current.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      type="button"
      role="alert"
      className={phase === "out" ? "found-toast found-toast-warn is-leaving" : "found-toast found-toast-warn"}
      onClick={() => {
        if (onAction) onAction();
        else dismiss();
      }}
    >
      <span>{text}</span>
      {action ? (
        <span className="found-toast-action" aria-hidden="true">
          {action}
        </span>
      ) : null}
    </button>
  );
}
