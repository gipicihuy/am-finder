import { Finder } from "@/components/Finder";
import { SectionOrnament } from "@/components/Ornament";

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
      <p className="footer-note">
        Hasil mengikuti link yang kreator bagikan di TikTok. Kalau link preset tidak dipasang di
        mana pun yang tadi dicek, halaman ini tidak bisa menghasilkan link itu sendiri.
      </p>
    </>
  );
}
