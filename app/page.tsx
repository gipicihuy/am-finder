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
      <Finder />
    </>
  );
}
