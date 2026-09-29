import { Finder } from "@/components/Finder";
import { SectionOrnament } from "@/components/Ornament";

export default function HomePage() {
  return (
    <>
      <h1 className="page-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        Find preset links
      </h1>
      <p className="page-sub">
        Paste a TikTok video link. The description, account bio, bio link, comments and replies are
        opened one by one, then scanned for Alight Motion preset links.
      </p>
      <Finder />
    </>
  );
}
