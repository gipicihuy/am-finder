import type { Metadata } from "next";
import RekomendasiPreset from "@/components/RekomendasiPreset";

export const metadata: Metadata = {
  title: "Rekomendasi Preset — test",
  robots: { index: false },
};

export default function RekomendasiPresetPage() {
  return <RekomendasiPreset />;
}
