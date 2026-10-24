import { AmLogo } from "@/components/AmLogo";
import { getUi } from "@/lib/ui";
import { getLocale } from "@/lib/locale-server";
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
          <span className="nav-name">{ui.header.brand}</span>
        </div>

        <SideMenu />
      </div>
    </header>
  );
}
