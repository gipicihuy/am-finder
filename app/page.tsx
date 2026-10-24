import { Finder } from "@/components/Finder";
import { SectionOrnament } from "@/components/Ornament";
import { getLocale } from "@/lib/locale-server";
import { getUi } from "@/lib/ui";

export default async function HomePage() {
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
    </>
  );
}
