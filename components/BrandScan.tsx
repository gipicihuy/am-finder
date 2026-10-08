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
.bs-wrap{display:flex;flex-direction:column;align-items:center;padding:14px 0 4px}
.bs-row{display:flex;align-items:center;justify-content:center;gap:11px}
.bs-logo{position:relative;width:44px;height:44px;overflow:hidden;border-radius:10px;flex-shrink:0}
.bs-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:bs-draw .55s cubic-bezier(.22,1,.36,1) forwards}
@keyframes bs-draw{to{stroke-dashoffset:0}}
.bs-spin{transform-box:view-box;transform-origin:24px 24px;animation:bs-spin 12s linear .7s infinite}
@keyframes bs-spin{to{transform:rotate(360deg)}}
.bs-scan{position:absolute;left:0;right:0;top:0;height:14px;background:linear-gradient(to bottom,rgba(5,250,168,0) 0%,rgba(5,250,168,.55) 60%,rgba(5,250,168,0) 100%);opacity:0;pointer-events:none;animation:bs-scan 1.8s ease-in-out .6s infinite}
@keyframes bs-scan{0%{transform:translateY(-14px);opacity:0}15%{opacity:.9}75%{opacity:.75}100%{transform:translateY(44px);opacity:0}}
.bs-title{font-family:AXGC,sans-serif;font-size:18px;font-weight:800;color:#F2F2F3;letter-spacing:.3px;white-space:nowrap}
.bs-dots span{opacity:.15;animation:bs-dot 1.1s infinite}
.bs-dots span:nth-child(2){animation-delay:.18s}
.bs-dots span:nth-child(3){animation-delay:.36s}
@keyframes bs-dot{0%,100%{opacity:.15}45%{opacity:1}}
.bs-status{margin-top:8px;font-size:13px;color:#05FAA8;text-align:center}
`;

export default function BrandScan({
  status,
  title = "Mencari link preset",
}: {
  status?: string;
  title?: string;
}) {
  return (
    <div className="bs-wrap" role="status">
      <style>{KEYFRAMES}</style>
      <div className="bs-row">
        <span className="bs-logo" aria-hidden="true">
          <svg
            viewBox="0 0 48 48"
            width={44}
            height={44}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
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
          <span className="bs-scan" />
        </span>
        <span className="bs-title">
          {title}
          <span className="bs-dots">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </span>
      </div>
      {status ? <div className="bs-status">{status}</div> : null}
    </div>
  );
}
