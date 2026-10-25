import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { getLegal } from "@/lib/legal";
import { getLocale } from "@/lib/locale-server";

export async function generateMetadata(): Promise<Metadata> {
  const doc = getLegal(await getLocale()).terms;
  return { title: doc.metaTitle, description: doc.metaDesc };
}

export default async function TermsPage() {
  const bundle = getLegal(await getLocale());
  return <LegalPage bundle={bundle} doc={bundle.terms} />;
}
