const BRACKETS = [
  "M3 12V7a4 4 0 0 1 4-4h5",
  "M36 3h5a4 4 0 0 1 4 4v5",
  "M45 36v5a4 4 0 0 1-4 4h-5",
  "M12 45H7a4 4 0 0 1-4-4v-5",
];

const SPIRAL = [
  "M43.5,28.3294a19.5,19.5,0,0,0-39,0",
  "M18.4694,32.593a6.9229,6.9229,0,0,0,9.79-9.7905",
  "M23.25,39.1706a11.2273,11.2273,0,1,0,0-22.4545",
  "M34.6024,38.2223a14.6374,14.6374,0,1,0-20.7-20.7",
];

const KEYFRAMES = `
.bs-stage{display:flex;flex-direction:column;align-items:center;padding:24px 0 14px}
.bs-card{position:relative;width:230px;height:230px;border-radius:56px;background:linear-gradient(160deg,#17171A 0%,#0F0F10 100%);border:2px solid #2C2C33;box-shadow:0 24px 70px rgba(0,0,0,.55);display:grid;place-items:center;overflow:hidden;margin-bottom:22px}
.bs-glow{position:absolute;inset:-90px;background:radial-gradient(circle,rgba(5,250,168,.16) 0%,rgba(5,250,168,0) 62%);animation:bs-glow 2.3s ease-in-out infinite}
@keyframes bs-glow{0%,100%{opacity:.5;transform:scale(.96)}50%{opacity:1;transform:scale(1.04)}}
.bs-svg{position:relative}
.bs-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:bs-draw .55s cubic-bezier(.22,1,.36,1) forwards}
@keyframes bs-draw{to{stroke-dashoffset:0}}
.bs-spin{transform-box:view-box;transform-origin:24px 24px;animation:bs-spin 12s linear .7s infinite}
@keyframes bs-spin{to{transform:rotate(360deg)}}
.bs-scan{position:absolute;left:0;right:0;top:0;height:78px;background:linear-gradient(to bottom,rgba(5,250,168,0) 0%,rgba(5,250,168,.16) 55%,rgba(5,250,168,.85) 92%,rgba(5,250,168,0) 100%);opacity:0;pointer-events:none;animation:bs-scan 1.8s ease-in-out .8s infinite}
@keyframes bs-scan{0%{transform:translateY(-78px);opacity:0}12%{opacity:.95}75%{opacity:.8}100%{transform:translateY(230px);opacity:0}}
.bs-title{font-family:AXGC,sans-serif;font-size:27px;font-weight:800;color:#F2F2F3;letter-spacing:.5px;text-align:center;line-height:1.2}
.bs-dots span{opacity:.15;animation:bs-dot 1.1s infinite}
.bs-dots span:nth-child(2){animation-delay:.18s}
.bs-dots span:nth-child(3){animation-delay:.36s}
@keyframes bs-dot{0%,100%{opacity:.15}45%{opacity:1}}
.bs-status{margin-top:10px;font-size:13px;color:#05FAA8;text-align:center;min-height:18px}
`;

export default function BrandScan({ status }: { status?: string }) {
  return (
    <div className="bs-stage">
      <style>{KEYFRAMES}</style>
      <div className="bs-card">
        <div className="bs-glow" aria-hidden="true" />
        <svg
          className="bs-svg"
          viewBox="0 0 48 48"
          width={190}
          height={190}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect width="48" height="48" rx="10" fill="#0f0f10" />
          <g transform="translate(24 24) scale(0.82) translate(-24 -24)">
            <g stroke="#F2F2F3" strokeWidth={2.6}>
              {BRACKETS.map((d, i) => (
                <path
                  key={d}
                  d={d}
                  pathLength={1}
                  className="bs-draw"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </g>
          </g>
          <g className="bs-spin">
            <g
              stroke="#05FAA8"
              strokeWidth={3.2}
              transform="translate(24 24) scale(0.82) translate(-24 -24) translate(24 24) scale(0.8) translate(-24 -25.7)"
            >
              {SPIRAL.map((d, i) => (
                <path
                  key={d}
                  d={d}
                  pathLength={1}
                  className="bs-draw"
                  style={{ animationDelay: `${0.25 + i * 0.1}s` }}
                />
              ))}
            </g>
          </g>
        </svg>
        <div className="bs-scan" aria-hidden="true" />
      </div>
      <div className="bs-title">
        Mencari link preset
        <span className="bs-dots">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </div>
      {status ? <div className="bs-status">{status}</div> : null}
    </div>
  );
}
