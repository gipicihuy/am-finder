import type { Metadata } from "next";
import LiquidGlassShowcase from "@/components/liquid-glass/LiquidGlassShowcase";
import "./liquid-glass.css";

export const metadata: Metadata = {
  title: "Liquid Glass material lab | AM Finder",
  description:
    "An isolated experiment route that rebuilds the Auralys liquid glass material on top of AM Finder tokens.",
  robots: { index: false, follow: false },
};

export default function LiquidGlassPage() {
  return <LiquidGlassShowcase />;
}
