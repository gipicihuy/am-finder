"use client";

import { useEffect } from "react";
import { getDeviceId, setClientRisk } from "@/lib/anti-scrape-client";

const GOOD_BOT =
  /googlebot|bingbot|duckduckbot|slurp|yandexbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|applebot|petalbot|semrushbot|ahrefsbot/i;

const GLOBAL_MARKERS: RegExp[] = [
  /^cdc_/i,
  /^\$cdc_/i,
  /__playwright/i,
  /__puppeteer/i,
  /__nightmare/i,
  /^_phantom/i,
  /^callPhantom$/i,
  /^domAutomation/i,
  /^__webdriver/i,
  /^__selenium/i,
  /^_selenium/i,
  /^__driver/i,
];

type Finding = { score: number; reasons: string[] };

let lastReportedScore = 0;
let lastReportedAt = 0;

function hasMarker(value: object): string | null {
  for (const key of Object.getOwnPropertyNames(value)) {
    for (const pattern of GLOBAL_MARKERS) {
      if (pattern.test(key)) return key;
    }
  }
  return null;
}

function webglRenderer(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as
      | WebGLRenderingContext
      | null;
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "") : "";
  } catch {
    return "";
  }
}

function detect(): Finding {
  const reasons: string[] = [];
  const nav = navigator as Navigator & { webdriver?: boolean };
  const ua = navigator.userAgent || "";
  const desktopChrome = /Chrome\//i.test(ua) && !/Mobile|Android|iPhone|iPad/i.test(ua);

  if (nav.webdriver === true) reasons.push("navigator.webdriver");
  if (/HeadlessChrome|Headless/i.test(ua)) reasons.push("headless user-agent");
  if (!("chrome" in window) && desktopChrome) reasons.push("chrome object missing");
  if (desktopChrome && navigator.plugins.length === 0) reasons.push("empty plugins");
  if (!navigator.languages || navigator.languages.length === 0) reasons.push("empty languages");
  if (window.outerWidth === 0 || window.outerHeight === 0) reasons.push("zero viewport");

  const marker = hasMarker(window) || hasMarker(document);
  if (marker) reasons.push(`automation global: ${marker}`);

  if (/SwiftShader|llvmpipe/i.test(webglRenderer())) reasons.push("software webgl");

  let score = 0;
  for (const reason of reasons) {
    if (reason === "navigator.webdriver" || reason.startsWith("automation global")) score += 10;
    else if (reason === "headless user-agent") score += 8;
    else if (reason === "zero viewport") score += 4;
    else score += 2;
  }

  return { score: Math.min(score, 100), reasons };
}

function report(score: number, reasons: string[]): void {
  setClientRisk(score, reasons);
  if (score <= lastReportedScore) return;
  const now = Date.now();
  if (now - lastReportedAt < 1200 && score < 100) return;
  lastReportedScore = score;
  lastReportedAt = now;

  try {
    void fetch("/api/v/29936b7f", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        did: getDeviceId(),
        score,
        reasons,
        path: location.pathname,
      }),
      cache: "no-store",
      keepalive: true,
    }).catch(() => {});
  } catch {
  }
}

function installHoneypot(): () => void {
  const box = document.createElement("div");
  const id = `amf-${Math.random().toString(36).slice(2)}`;
  box.id = id;
  box.setAttribute("aria-hidden", "true");
  box.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;";
  box.innerHTML = `
    <form action="#" method="post" autocomplete="off">
      <label>Company<input name="amf_company" tabindex="-1" autocomplete="off"></label>
      <label>Website<input name="amf_website" tabindex="-1" autocomplete="off"></label>
      <label>Message<textarea name="amf_message" tabindex="-1"></textarea></label>
      <a href="/amf-hidden" tabindex="-1" rel="nofollow">Open</a>
    </form>
  `;

  const touched = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    if (String(target.value || "").trim()) {
      report(100, ["honeypot filled"]);
    }
  };

  box.addEventListener("input", touched, true);
  box.addEventListener("change", touched, true);
  box.addEventListener(
    "click",
    () => {
      report(100, ["honeypot link clicked"]);
    },
    true,
  );

  document.body.appendChild(box);
  return () => box.remove();
}

export function AntiScrapeGuard() {
  useEffect(() => {
    if (GOOD_BOT.test(navigator.userAgent || "")) return;

    const first = detect();
    setClientRisk(first.score, first.reasons);
    if (first.score >= 8) report(first.score, first.reasons);

    let stopped = false;
    let removeHoneypot: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      if (!stopped) removeHoneypot = installHoneypot();
    }, 1200);

    const scan = () => {
      if (stopped) return;
      const next = detect();
      setClientRisk(next.score, next.reasons);
      if (next.score >= 8) report(next.score, next.reasons);
    };

    const observer = new MutationObserver((mutations) => {
      if (stopped || lastReportedScore >= 100) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          const id = `${node.id} ${node.className}`;
          if (/puppeteer|playwright|cdc_|webdriver|__nightmare/i.test(id)) {
            report(100, [`injected automation node: ${id.slice(0, 60)}`]);
            return;
          }
        }
        if (mutation.removedNodes.length && removeHoneypot) {
          if (!document.querySelector('[id^="amf-"]')) report(90, ["honeypot removed"]);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const interval = window.setInterval(scan, 2500);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      observer.disconnect();
      removeHoneypot?.();
    };
  }, []);

  return null;
}
