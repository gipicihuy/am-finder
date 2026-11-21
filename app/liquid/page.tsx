import type { Metadata } from "next";
import { Finder } from "@/components/Finder";
import { SectionOrnament } from "@/components/Ornament";
import { getLocale } from "@/lib/locale-server";
import { getUi } from "@/lib/ui";
import { LiquidMode } from "./LiquidMode";
import "./liquid.css";

export const metadata: Metadata = {
  title: "Liquid — preview tema glass",
  robots: { index: false, follow: false },
};

export default async function LiquidPage() {
  const ui = getUi(await getLocale());
  return (
    <>
      <p className="page-tagline">{ui.home.tagline}</p>
      <h1 className="page-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        {ui.home.title}
      </h1>
      <Finder />
      <LiquidMode />
    </>
  );
}
