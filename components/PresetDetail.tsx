"use client";

import { useEffect, useRef, useState } from "react";
import type { FindResult } from "@/lib/types";
import { ResultView } from "@/components/ResultView";
import { FoundToast } from "@/components/FoundToast";
import BrandScan from "./BrandScan";

type Phase = "running" | "done" | "error";

/**
 * Detail satu video, diakses lewat /preset/<sumber>/<id>.
 *
 * Pengecekan dijalankan dari browser memakai /api/find yang sudah ada — server
 * sengaja tidak menyentuh TikTok/YouTube waktu merender halaman ini. Alamatnya
 * memang ikut dibuka bot pratinjau link (WhatsApp/Telegram/Facebook) dan crawler,
 * jadi kalau datanya diambil di server, beban VPS-nya ikut naik tiap kali link
 * dibagikan. Hasilnya tetap cepat karena /api/find sudah punya cache.
 */
export function PresetDetail({ source, id }: { source: "tiktok" | "youtube"; id: string }) {
  const [phase, setPhase] = useState<Phase>("running");
  const [result, setResult] = useState<FindResult | null>(null);
  const [error, setError] = useState("");
  const finishedRef = useRef(false);

  useEffect(() => {
    finishedRef.current = false;
    // ID polos diteruskan apa adanya; resolvernya memang nerima ID langsung.
    const source0 = new EventSource(`/api/find?url=${encodeURIComponent(id)}`);

    source0.addEventListener("result", (event) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      source0.close();
      try {
        const data = JSON.parse((event as MessageEvent).data) as FindResult;
        if (data.ok === false) {
          setPhase("error");
          setError(data.error || "the scraper could not process this link");
          return;
        }
        setResult(data);
        setPhase("done");
      } catch {
        setPhase("error");
        setError("unreadable response from server");
      }
    });

    source0.addEventListener("error", (event) => {
      if (finishedRef.current) return;
      const raw = (event as MessageEvent).data;
      if (typeof raw === "string" && raw) {
        finishedRef.current = true;
        source0.close();
        setPhase("error");
        try {
          setError(JSON.parse(raw).message || "something went wrong, try again");
        } catch {
          setError("something went wrong, try again");
        }
        return;
      }
      if (source0.readyState === EventSource.CLOSED) {
        finishedRef.current = true;
        setPhase("error");
        setError("connection closed before it finished, try again");
      }
    });

    return () => {
      finishedRef.current = true;
      source0.close();
    };
  }, [source, id]);

  return (
    <div className="preset-detail">
      {phase === "running" ? (
        <div className="run" aria-live="polite">
          <BrandScan />
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="state state-error" role="alert">
          <strong>Search stopped.</strong>
          {error}
        </div>
      ) : null}

      {phase === "done" && result ? <ResultView result={result} /> : null}

      {phase === "done" && result && (result.presetLinks?.length ?? 0) > 0 ? (
        <FoundToast count={result.presetLinks?.length ?? 0} />
      ) : null}
    </div>
  );
}
