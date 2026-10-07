import type { Metadata } from "next";
import SearchTest from "../../components/SearchTest";

export const metadata: Metadata = {
  title: "Search test — finder by query",
  robots: { index: false },
};

export default function SearchTestPage() {
  return <SearchTest />;
}
