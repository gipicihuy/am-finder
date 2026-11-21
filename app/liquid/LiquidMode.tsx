"use client";

import { useEffect, useState } from "react";

export function LiquidMode() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    if (on) root.dataset.liquid = "1";
    else delete root.dataset.liquid;
    return () => {
      delete root.dataset.liquid;
    };
  }, [on]);

  return (
    <button
      type="button"
      className="liquid-toggle"
      aria-pressed={on}
      onClick={() => setOn((value) => !value)}
    >
      <span className="liquid-toggle-dot" aria-hidden="true" />
      Liquid {on ? "ON" : "OFF"}
    </button>
  );
}
