import { Finder } from "@/components/Finder";
import { SectionOrnament } from "@/components/Ornament";
import { ui } from "@/lib/ui";

export default function HomePage() {
  return (
    <>
      <h1 className="page-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        Cari link preset
      </h1>
      <p className="page-sub">
        Tempel link video TikTok. Deskripsi video, bio akun, link di bio, komentar, dan balasan
        komentar dibuka satu per satu, lalu dicari link preset Alight Motion di dalamnya.
      </p>
      <Finder />
      {ui.footer.map((line) => (
        <p className="footer-note" key={line}>
          {line}
        </p>
      ))}
    </>
  );
}
