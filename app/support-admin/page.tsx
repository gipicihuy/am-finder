import type { Metadata } from "next";
import { SupportAdminView } from "@/components/SupportAdminView";

export const metadata: Metadata = {
  title: "Dukungan Admin | AM Preset Finder",
  description: "Dukung operasional server dan pemeliharaan AM Preset Finder.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SupportAdminPage() {
  return <SupportAdminView />;
}
