type Box = { left: number; top: number; width: number; height: number };

const DURATION = 340;
const EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";

let layer: HTMLDivElement | null = null;
let animations: Animation[] = [];

function rectBox(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function textBox(element: Element): Box | null {
  const range = document.createRange();
  range.selectNodeContents(element);
  const rect = range.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function centerY(box: Box): number {
  return box.top + box.height / 2;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function clearBrandFlight(): void {
  animations.forEach((animation) => animation.cancel());
  animations = [];
  layer?.remove();
  layer = null;
  delete document.documentElement.dataset.flying;
}

export function flyBrand(direction: "in" | "out", panel: HTMLElement, onDone: () => void): boolean {
  clearBrandFlight();

  const mainLogo = document.querySelector<SVGSVGElement>(".nav-logo svg");
  const mainName = document.querySelector<HTMLElement>(".nav-name");
  const sideLogo = panel.querySelector<SVGSVGElement>(".drawer-logo svg");
  const sideName = panel.querySelector<HTMLElement>(".drawer-name");
  if (!mainLogo || !mainName || !sideLogo || !sideName) return false;
  if (typeof mainLogo.animate !== "function") return false;

  const root = document.documentElement;
  const panelRect = panel.getBoundingClientRect();
  const shift = direction === "in" ? panelRect.left - (root.clientWidth - panelRect.width) : 0;

  const mainLogoBox = rectBox(mainLogo);
  const mainNameBox = textBox(mainName);
  const sideLogoRaw = rectBox(sideLogo);
  const sideNameRaw = textBox(sideName);
  if (!mainNameBox || !sideNameRaw) return false;

  const sideLogoBox: Box = { ...sideLogoRaw, left: sideLogoRaw.left - shift };
  const sideNameBox: Box = { ...sideNameRaw, left: sideNameRaw.left - shift };

  const logoFrom = direction === "in" ? mainLogoBox : sideLogoBox;
  const logoTo = direction === "in" ? sideLogoBox : mainLogoBox;
  const nameFrom = direction === "in" ? mainNameBox : sideNameBox;
  const nameTo = direction === "in" ? sideNameBox : mainNameBox;

  const mainStyle = getComputedStyle(mainName);
  const sideStyle = getComputedStyle(sideName);
  const fromStyle = direction === "in" ? mainStyle : sideStyle;
  const fontFrom = parseFloat(fromStyle.fontSize);
  const fontTo = parseFloat((direction === "in" ? sideStyle : mainStyle).fontSize);
  const scale = fontFrom > 0 && fontTo > 0 ? fontTo / fontFrom : 1;

  const wrapper = document.createElement("div");
  wrapper.className = "brand-flight";

  const logoGhost = mainLogo.cloneNode(true) as SVGSVGElement;
  logoGhost.style.left = `${logoFrom.left}px`;
  logoGhost.style.top = `${logoFrom.top}px`;
  logoGhost.style.width = `${logoFrom.width}px`;
  logoGhost.style.height = `${logoFrom.height}px`;
  logoGhost.style.color = getComputedStyle(mainLogo).color;

  const nameGhost = document.createElement("span");
  nameGhost.textContent = mainName.textContent;
  nameGhost.style.left = `${nameFrom.left}px`;
  nameGhost.style.top = `${nameFrom.top}px`;
  nameGhost.style.height = `${nameFrom.height}px`;
  nameGhost.style.lineHeight = `${nameFrom.height}px`;
  nameGhost.style.fontFamily = mainStyle.fontFamily;
  nameGhost.style.fontWeight = mainStyle.fontWeight;
  nameGhost.style.letterSpacing = fromStyle.letterSpacing;
  nameGhost.style.fontSize = `${fontFrom}px`;
  nameGhost.style.color = mainStyle.color;
  nameGhost.style.transformOrigin = "left center";

  wrapper.append(logoGhost, nameGhost);
  document.body.appendChild(wrapper);
  layer = wrapper;
  root.dataset.flying = "1";

  const options: KeyframeAnimationOptions = { duration: DURATION, easing: EASING, fill: "forwards" };
  const logoMove = logoGhost.animate(
    [
      { transform: "translate(0px, 0px)" },
      {
        transform: `translate(${logoTo.left - logoFrom.left}px, ${centerY(logoTo) - centerY(logoFrom)}px)`,
      },
    ],
    options,
  );
  const nameMove = nameGhost.animate(
    [
      { transform: "translate(0px, 0px) scale(1)" },
      {
        transform: `translate(${nameTo.left - nameFrom.left}px, ${centerY(nameTo) - centerY(nameFrom)}px) scale(${scale})`,
      },
    ],
    options,
  );
  animations = [logoMove, nameMove];

  Promise.all([logoMove.finished, nameMove.finished])
    .then(() => {
      if (layer !== wrapper) return;
      clearBrandFlight();
      onDone();
    })
    .catch(() => undefined);

  return true;
}
