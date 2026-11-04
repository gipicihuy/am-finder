import { AmLogo } from "@/components/AmLogo";
import { getUi } from "@/lib/ui";
import { getLocale } from "@/lib/locale-server";
import { LanguageDropdown } from "@/components/LanguageDropdown";
import { SideMenu } from "@/components/SideMenu";

export async function SiteHeader() {
  const ui = getUi(await getLocale());
  return (
    <header className="site-header" id="top">
      <div className="nav-inner">
        <a className="nav-logo" href="/" aria-label={ui.header.homeLabel}>
          <AmLogo size={32} />
        </a>

        <div className="nav-title">
          {/* Tautan ke beranda juga di teks. aria-hidden + tabIndex -1 karena
              logo di kiri sudah jadi tautan yang sama untuk keyboard/screen reader. */}
          <a className="nav-title-link" href="/" aria-hidden="true" tabIndex={-1} draggable={false}>
            <span className="nav-name">{ui.header.brand}</span>
          </a>
        </div>

        <LanguageDropdown />

        <SideMenu />
      </div>
    </header>
  );
}
