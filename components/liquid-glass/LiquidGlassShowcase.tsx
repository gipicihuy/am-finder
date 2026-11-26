"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AmLogo } from "@/components/AmLogo";
import { SectionOrnament } from "@/components/Ornament";
import {
  GlassBottomDock,
  GlassDropdown,
  GlassFab,
  GlassModal,
  GlassSearchBar,
  GlassTabs,
  GlassToast,
  IconArrowLeft,
  IconBell,
  IconCheck,
  IconSpark,
  type GlassToastData,
} from "./GlassWidgets";

const MATERIALS = [
  {
    id: "subtle",
    name: "Subtle",
    mod: "lg-m-subtle",
    use: "Rows and quiet surfaces that must stay out of the way.",
    tokens: [
      ["blur", "10px"],
      ["saturation", "1.25"],
      ["opacity", "0.08"],
      ["refraction", "0.28"],
    ],
  },
  {
    id: "standard",
    name: "Standard",
    mod: "lg-m-standard",
    use: "Cards and hero panels. The default reading of the material.",
    tokens: [
      ["blur", "18px"],
      ["saturation", "1.5"],
      ["opacity", "0.14"],
      ["refraction", "0.6"],
    ],
  },
  {
    id: "premium",
    name: "Premium",
    mod: "lg-m-premium",
    use: "Navigation bars, dialogs and anything that floats above content.",
    tokens: [
      ["blur", "24px"],
      ["saturation", "1.6"],
      ["opacity", "0.2"],
      ["refraction", "1"],
    ],
  },
  {
    id: "frosted",
    name: "Frosted",
    mod: "lg-m-frosted",
    use: "High opacity veil when the backdrop behind is busy or bright.",
    tokens: [
      ["blur", "32px"],
      ["saturation", "1.05"],
      ["opacity", "0.58"],
      ["refraction", "0.42"],
    ],
  },
  {
    id: "clear",
    name: "Clear",
    mod: "lg-m-clear",
    use: "Barely there. Thin blur, sharp edge, mostly the backdrop showing.",
    tokens: [
      ["blur", "6px"],
      ["saturation", "1.35"],
      ["opacity", "0.05"],
      ["refraction", "0.74"],
    ],
  },
  {
    id: "colored",
    name: "Colored",
    mod: "lg-m-colored",
    use: "Accent tinted glass for brand moments and empty states.",
    tokens: [
      ["blur", "20px"],
      ["saturation", "1.7"],
      ["opacity", "0.16"],
      ["refraction", "0.7"],
    ],
  },
];

const TOKEN_ROWS: [string, string, string][] = [
  ["--lg-blur", "18px", "Auralys IslandGlass bake (18dp base blur)"],
  ["--lg-saturation", "1.5", "Auralys VibrantColorFilter colorControls(1.5)"],
  ["--lg-refraction", "0.6", "CSS stand-in for the AGSL displacement ring"],
  ["--lg-rim-a / -b / -c", "0.48 / 0.05 / 0.22", "Auralys glassRim stops on a dark surface"],
  ["--lg-radius", "22px", "AM Finder radius token, kept for brand consistency"],
  ["--lg-ease", "cubic-bezier(0.2, 0, 0, 1)", "Auralys HorizonMotion.Standard"],
  ["--lg-press", "0.97", "Auralys pressScale for buttons"],
  ["--lg-duration", "220ms", "Auralys 200ms tween plus a 20ms lead"],
  ["--lg-tint", "var(--accent)", "AM Finder accent, scoped to this page only"],
];

const TABS = [
  {
    id: "recipe",
    label: "Recipe",
    body: "Blur 18px, saturation 1.5, veil opacity 0.14. This is the standard tier and it is what the hero panel and the cards below it are wearing.",
  },
  {
    id: "rim",
    label: "Rim",
    body: "The border you see is a masked gradient ring: white at 0.48 on the top left, dropping to 0.05 through the middle, lifting back to 0.22 at the bottom right. Same stops Auralys uses on a dark surface.",
  },
  {
    id: "motion",
    label: "Motion",
    body: "Every transition on this page runs on cubic-bezier(0.2, 0, 0, 1) at 220ms, with press states scaling to 0.97. Reduced motion users get a 1ms fallback.",
  },
];

const LIST_ROWS = [
  { title: "Nav bar recipe", sub: "blur 10 · lens 24 · dispersion 1.0", trail: "G1" },
  { title: "Mini player recipe", sub: "blur 8 · lens 18 · dispersion 1.0", trail: "G2" },
  { title: "Island veil", sub: "luma derived alpha 0.30 to 0.68", trail: "G3" },
];

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="section-head">
      <h2 className="section-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        {title}
      </h2>
      {note ? <span className="page-tagline">{note}</span> : null}
    </div>
  );
}

export default function LiquidGlassShowcase() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<GlassToastData | null>(null);
  const toastId = useRef(0);

  const notify = (title: string, text: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, title, text });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let frame = 0;
    let active: HTMLElement | null = null;

    const reset = (node: HTMLElement | null) => {
      if (!node) return;
      node.style.setProperty("--lg-spec-x", "24%");
      node.style.setProperty("--lg-spec-y", "0%");
    };

    const onMove = (event: PointerEvent) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const target = (event.target as HTMLElement | null)?.closest?.(
          ".lg-glass",
        ) as HTMLElement | null;
        if (target !== active) {
          reset(active);
          active = target;
        }
        if (!target) return;
        const rect = target.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        target.style.setProperty("--lg-spec-x", `${x.toFixed(2)}%`);
        target.style.setProperty("--lg-spec-y", `${y.toFixed(2)}%`);
      });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) window.cancelAnimationFrame(frame);
      reset(active);
    };
  }, []);

  return (
    <div className="lg-root" ref={rootRef}>
      <div className="lg-head">
        <Link className="lg-back" href="/">
          <IconArrowLeft />
          Back to finder
        </Link>
        <h1 className="page-title">
          <span className="section-ornament" aria-hidden="true">
            <SectionOrnament />
          </span>
          Liquid Glass
        </h1>
        <p>
          An isolated experiment page that rebuilds the glass material found inside the Auralys
          Android app. Every number on this page was read out of the APK: lens blur, veil opacity,
          rim stops, refraction weight and press easing.
        </p>
        <div className="lg-note">
          <span className="lg-badge lg-badge-soft">
            <span className="lg-dot" />
            Isolated route
          </span>
          <span className="lg-badge">Scoped tokens</span>
          <span className="lg-badge">Dark and light</span>
        </div>
      </div>

      <div className="lg-stage">
        <nav className="lg-navbar lg-glass lg-m-premium" aria-label="Glass navigation">
          <span className="lg-navbar-brand">
            <AmLogo size={24} />
            AM Finder
          </span>
          <span className="lg-navbar-links">
            <span className="lg-navlink is-active">Overview</span>
            <span className="lg-navlink">Materials</span>
            <span className="lg-navlink">Tokens</span>
          </span>
          <span className="lg-badge lg-badge-soft">Preview</span>
        </nav>

        <div className="lg-hero lg-glass lg-m-standard">
          <div className="lg-hero-brand">
            <AmLogo size={34} />
            <div>
              <h2 className="lg-hero-name">Liquid Glass</h2>
              <p className="lg-hero-sub">AM Finder material lab</p>
            </div>
          </div>
          <div className="lg-note" style={{ marginBottom: 14 }}>
            <span className="lg-badge lg-badge-accent">Standard tier</span>
            <span className="lg-badge">
              <IconSpark />
              Blur 18px
            </span>
            <span className="lg-badge">
              <span className="lg-dot" />
              Saturation 1.5
            </span>
          </div>
          <p style={{ margin: "0 0 18px", maxWidth: "56ch", color: "var(--lg-ink-2)", fontSize: 14.5, lineHeight: 1.6 }}>
            The backdrop behind this panel is blurred and saturated before the veil, the gradient
            ring and the specular highlight are layered on top. Move the pointer across any glass
            surface on this page to steer the highlight.
          </p>
          <div className="lg-btn-row">
            <button type="button" className="lg-btn lg-btn-primary" onClick={() => setModalOpen(true)}>
              Open dialog
            </button>
            <button
              type="button"
              className="lg-btn lg-btn-glass"
              onClick={() => notify("Notification material", "Glass toast rendered above the stage.")}
            >
              <IconBell size={16} />
              Fire notification
            </button>
          </div>
        </div>

        <div className="lg-grid lg-grid-3">
          <div className="lg-tile lg-glass lg-m-subtle">
            <span className="lg-sweep" aria-hidden="true" />
            <span className="lg-tile-label">Backdrop</span>
            <span className="lg-tile-value">Blur then saturate, never the other way round.</span>
          </div>
          <div className="lg-tile lg-glass lg-m-standard">
            <span className="lg-sweep" aria-hidden="true" />
            <span className="lg-tile-label">Veil</span>
            <span className="lg-tile-value">A flat white at 0.14 keeps text readable.</span>
          </div>
          <div className="lg-tile lg-glass lg-m-premium">
            <span className="lg-sweep" aria-hidden="true" />
            <span className="lg-tile-label">Rim</span>
            <span className="lg-tile-value">Masked gradient ring, 0.48 to 0.05 to 0.22.</span>
          </div>
        </div>

        <div className="lg-grid lg-grid-2">
          <div className="lg-card lg-glass lg-m-standard">
            <span className="lg-demo-label">Search bar</span>
            <GlassSearchBar
              id="lg-search-demo"
              placeholder="Try the glass search field"
              onSubmit={(value) =>
                notify(
                  "Search submitted",
                  value ? `Query: ${value}` : "Empty query, the field is still live.",
                )
              }
            />
            <p className="lg-inline-note">
              The field is a real input with a real submit handler, so focus rings, keyboard order
              and the 46px hit target all behave the way the rest of the site does.
            </p>
          </div>

          <div className="lg-card lg-glass lg-m-frosted">
            <span className="lg-demo-label">Dropdown</span>
            <div className="lg-btn-row" style={{ alignItems: "center" }}>
              <GlassDropdown />
              <span className="lg-badge lg-badge-soft">
                <IconCheck />
                Selected
              </span>
              <span className="lg-badge">Neutral</span>
              <span className="lg-badge lg-badge-accent">Accent</span>
            </div>
            <p className="lg-inline-note">
              Closes on outside click, on Escape and on pick. The menu is a heavier tier than the
              card that opens it, which is how Auralys stacks overlays.
            </p>
          </div>
        </div>

        <div className="lg-card lg-glass lg-m-standard">
          <span className="lg-demo-label">Tab navigation</span>
          <GlassTabs tabs={TABS} idPrefix="lg-tabs" />
        </div>

        <div className="lg-grid lg-grid-2">
          <div className="lg-header-card lg-glass lg-m-premium">
            <div className="lg-header-top">
              <h3>Header card</h3>
              <span className="lg-badge lg-badge-soft">Premium</span>
            </div>
            <p>
              Title, one supporting line and an action on the right. This tier carries a 24px blur
              and a full refraction ring, so it reads as floating even over a bright backdrop.
            </p>
            <div className="lg-btn-row" style={{ marginTop: 14 }}>
              <button type="button" className="lg-btn lg-btn-primary lg-btn-sm" onClick={() => setModalOpen(true)}>
                Details
              </button>
              <button type="button" className="lg-btn lg-btn-quiet lg-btn-sm">
                Dismiss
              </button>
            </div>
          </div>

          <div className="lg-panel lg-glass lg-m-clear">
            <p className="lg-panel-title">Panel</p>
            <p>
              The clear tier drops the veil to 0.05 and keeps the edge sharp, so the panel mostly
              shows whatever is behind it. Useful when the backdrop already carries the colour.
            </p>
            <div className="lg-swatch-row">
              <span className="lg-badge">6px blur</span>
              <span className="lg-badge">0.05 veil</span>
              <span className="lg-badge">0.74 ring</span>
            </div>
          </div>
        </div>

        <div className="lg-grid lg-grid-2">
          <div className="lg-list lg-glass lg-m-standard" role="list">
            {LIST_ROWS.map((row) => (
              <div className="lg-row lg-interactive" role="listitem" key={row.title}>
                <span className="lg-row-mark" aria-hidden="true">
                  <IconCheck />
                </span>
                <span className="lg-row-body">
                  <span className="lg-row-title">{row.title}</span>
                  <span className="lg-row-sub">{row.sub}</span>
                </span>
                <span className="lg-row-trail">{row.trail}</span>
              </div>
            ))}
          </div>

          <div className="lg-card lg-glass lg-m-colored">
            <span className="lg-demo-label">Buttons and press</span>
            <div className="lg-btn-row">
              <button type="button" className="lg-btn lg-btn-primary">
                Primary
              </button>
              <button type="button" className="lg-btn lg-btn-glass">
                Glass
              </button>
              <button type="button" className="lg-btn lg-btn-quiet">
                Quiet
              </button>
            </div>
            <p className="lg-inline-note">
              Press any of them: the scale drops to 0.97 over 140ms, which is the pressScale
              Auralys applies to its buttons.
            </p>
          </div>
        </div>

        <GlassBottomDock />
        <GlassFab onAction={() => notify("Floating action", "The FAB uses the accent fill, not glass.")} />

        {toast ? (
          <div className="lg-toast-stack">
            <GlassToast
              toast={toast}
              onClose={() => setToast(null)}
            />
          </div>
        ) : null}
      </div>

      <section className="lg-section" aria-labelledby="lg-materials">
        <div className="section-head">
          <h2 className="section-title" id="lg-materials">
            <span className="section-ornament" aria-hidden="true">
              <SectionOrnament />
            </span>
            Material lab
          </h2>
          <span className="page-tagline">Six tiers, live values</span>
        </div>
        <div className="lg-grid lg-grid-3">
          {MATERIALS.map((material) => (
            <div className={`lg-tile lg-glass ${material.mod}`} key={material.id}>
              <span className="lg-sweep" aria-hidden="true" />
              <div>
                <span className="lg-tile-label">{material.name}</span>
                <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "var(--lg-ink-2)" }}>
                  {material.use}
                </p>
              </div>
              <ul className="lg-spec-list">
                {material.tokens.map(([label, value]) => (
                  <li key={label}>
                    <span>{label}</span>
                    <b>{value}</b>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="lg-inline-note">
          Tiers are written as modifier classes so a surface can be re-skinned without touching its
          markup. The numbers come from the Auralys lens recipes and the island bake.
        </p>
      </section>

      <section className="lg-section" aria-labelledby="lg-tokens">
        <div className="section-head">
          <h2 className="section-title" id="lg-tokens">
            <span className="section-ornament" aria-hidden="true">
              <SectionOrnament />
            </span>
            Tokens
          </h2>
          <span className="page-tagline">Where each value came from</span>
        </div>
        <div className="lg-table-wrap lg-glass lg-m-standard">
          <table className="lg-tokens">
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col">Value</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {TOKEN_ROWS.map(([token, value, source]) => (
                <tr key={token}>
                  <td>
                    <code>{token}</code>
                  </td>
                  <td>
                    <code>{value}</code>
                  </td>
                  <td>{source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lg-inline-note">
          Every one of these is declared on <code>.lg-root</code> with a <code>--lg-</code> prefix.
          Nothing is written to <code>:root</code>, so the finder page, its palette and its
          components are untouched by this experiment.
        </p>
      </section>

      <p className="lg-footer-note">
        Honest limit: CSS has no backdrop displacement primitive, so the refraction you see is an
        inset ring shadow driven by <code>--lg-refraction</code> rather than the real AGSL
        displacement shader Auralys runs on the GPU. Blur, saturation, veil, rim stops, easing and
        press scale are faithful. This route is excluded from the index.
      </p>

      <GlassModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
