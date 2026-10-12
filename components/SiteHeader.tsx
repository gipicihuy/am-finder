import { AmLogo } from "@/components/AmLogo";
import { ui } from "@/lib/ui";

export function SiteHeader() {
  return (
    <header className="site-header" id="top">
      <div className="nav-inner">
        <a className="nav-logo" href="/" aria-label={`${ui.header.brand}, beranda`}>
          <AmLogo size={32} />
        </a>

        <div className="nav-title">
          <span className="nav-name">{ui.header.brand}</span>
          <p className="nav-tagline">{ui.header.tagline}</p>
        </div>
      </div>
    </header>
  );
}
