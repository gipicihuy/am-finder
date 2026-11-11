"use client";

import { useEffect, useState } from "react";
import { useUi } from "@/components/LocaleProvider";
import { NoticeToast } from "@/components/NoticeToast";

const POLL_MS = 60_000;

export function UpdateNotice() {
  const ui = useUi();
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    const mine = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!mine) return;
    let alive = true;

    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { id?: string };
        if (alive && data.id && data.id !== mine) setOutdated(true);
      } catch {
        return;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    const timer = window.setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!outdated) return null;

  return (
    <NoticeToast
      persistent
      text={ui.toast.updateAvailable}
      action={ui.toast.updateReload}
      onAction={() => window.location.reload()}
    />
  );
}
