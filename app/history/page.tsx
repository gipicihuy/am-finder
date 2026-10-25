import type { Metadata } from "next";
import { HistoryView } from "@/components/HistoryView";
import { getLocale } from "@/lib/locale-server";
import { getUi } from "@/lib/ui";

export async function generateMetadata(): Promise<Metadata> {
  const ui = getUi(await getLocale());
  return {
    title: `${ui.history.title} — AM Preset Finder`,
    robots: { index: false, follow: false },
  };
}

export default function HistoryPage() {
  return <HistoryView />;
}
