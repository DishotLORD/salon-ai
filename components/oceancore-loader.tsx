/**
 * Full-screen brand loader: the OceanCore mark draws itself in stroke by
 * stroke (spirals → branches → dots → ripples), then settles into a gentle
 * breathing glow while the route loads. Pure CSS — safe in server components
 * (loading.tsx) and honors prefers-reduced-motion.
 */

const CSS = `
.ocld-root{min-height:100vh;display:grid;place-items:center;overflow:hidden;}
.ocld-stage{position:relative;display:grid;justify-items:center;gap:26px;}
.ocld-halo{position:absolute;top:-100px;left:50%;margin-left:-175px;width:350px;height:350px;border-radius:50%;
  background:radial-gradient(circle,rgba(56,189,248,0.14) 0%,transparent 62%);
  filter:blur(14px);pointer-events:none;
  animation:ocld-halo 3s ease-in-out .4s infinite;}
.ocld-mark{overflow:visible;animation:ocld-breathe 3.4s ease-in-out 3.2s infinite;}
.ocld-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:ocld-draw cubic-bezier(.45,0,.18,1) both;}
.ocld-s1{animation-duration:1.7s;animation-delay:.18s;}
.ocld-s2{animation-duration:1.5s;animation-delay:.48s;}
.ocld-s3{animation-duration:1.25s;animation-delay:.78s;}
.ocld-b1{animation-duration:.5s;animation-delay:1.42s;}
.ocld-b2{animation-duration:.5s;animation-delay:1.57s;}
.ocld-b3{animation-duration:.5s;animation-delay:1.72s;}
.ocld-dot{opacity:0;transform:scale(0);transform-box:fill-box;transform-origin:center;
  animation:ocld-pop .7s cubic-bezier(.34,1.56,.64,1) both;}
.ocld-d1{animation-delay:1.68s;}
.ocld-d2{animation-delay:1.83s;}
.ocld-d3{animation-delay:1.98s;}
.ocld-ripple{opacity:0;animation:ocld-ripple 1.1s cubic-bezier(.22,1,.36,1) both;}
.ocld-r1{--ocld-o:.72;animation-delay:2.12s;}
.ocld-r2{--ocld-o:.46;animation-delay:2.32s;}
.ocld-word{font-family:var(--font-plus-jakarta,system-ui,sans-serif);font-size:11.5px;font-weight:700;
  letter-spacing:.44em;margin-right:-.44em;color:#7dd3fc;opacity:0;
  animation:ocld-rise 1.1s cubic-bezier(.22,1,.36,1) 2.35s both;}
.ocld-bar{width:150px;height:2px;border-radius:2px;background:rgba(125,211,252,.13);overflow:hidden;
  opacity:0;animation:ocld-rise 1.1s cubic-bezier(.22,1,.36,1) 2.55s both;}
.ocld-bar span{display:block;height:100%;width:42%;border-radius:2px;
  background:linear-gradient(90deg,transparent,#38bdf8 45%,#7dd3fc 55%,transparent);
  animation:ocld-scan 1.9s cubic-bezier(.45,.05,.55,.95) 3s infinite;}
@keyframes ocld-draw{to{stroke-dashoffset:0;}}
@keyframes ocld-pop{60%{opacity:1;}to{opacity:1;transform:scale(1);}}
@keyframes ocld-ripple{from{opacity:0;transform:translateY(3px);}to{opacity:var(--ocld-o,1);transform:none;}}
@keyframes ocld-rise{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
@keyframes ocld-halo{0%,100%{opacity:.65;transform:scale(1);}50%{opacity:1;transform:scale(1.1);}}
@keyframes ocld-breathe{0%,100%{filter:drop-shadow(0 0 5px rgba(56,189,248,.30));}
  50%{filter:drop-shadow(0 0 14px rgba(56,189,248,.55));}}
@keyframes ocld-scan{0%{transform:translateX(-110%);}100%{transform:translateX(350%);}}
@media(prefers-reduced-motion:reduce){
  .ocld-halo,.ocld-mark,.ocld-bar span{animation:none;}
  .ocld-draw{animation:none;stroke-dashoffset:0;}
  .ocld-dot{animation:none;opacity:1;transform:scale(1);}
  .ocld-ripple{animation:none;opacity:var(--ocld-o,1);transform:none;}
  .ocld-word,.ocld-bar{animation:none;opacity:1;transform:none;}
}
`

export type OceanCoreLoaderProps = {
  /** Page background behind the mark. Defaults to the deep-ocean radial. */
  background?: string
  /** Wordmark under the logo; pass null to hide. */
  label?: string | null
}

export function OceanCoreLoader({
  background = 'radial-gradient(120% 90% at 50% 28%, #0a1c33 0%, #050d1a 58%, #040a14 100%)',
  label = 'OCEANCORE',
}: OceanCoreLoaderProps) {
  return (
    <div className="ocld-root" style={{ background }} role="status" aria-label="Loading">
      <style>{CSS}</style>
      <div className="ocld-stage">
        <div className="ocld-halo" aria-hidden />
        <svg
          className="ocld-mark"
          width={128}
          height={123}
          viewBox="-8 -4 66 62"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <linearGradient id="ocld-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7dd3fc" />
              <stop offset="1" stopColor="#38bdf8" />
            </linearGradient>
            <filter id="ocld-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="1.7" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#ocld-glow)" stroke="url(#ocld-grad)" strokeLinecap="round">
            {/* Spirals — draw outer → inner */}
            <path className="ocld-draw ocld-s1" pathLength={1} strokeWidth={1.85} fill="none"
              d="M 10,48 C 0,38 0,14 16,6 C 28,0 44,4 50,18 C 54,28 50,42 40,46" />
            <path className="ocld-draw ocld-s2" pathLength={1} strokeWidth={1.85} fill="none"
              d="M 18,44 C 10,34 12,18 24,14 C 32,10 44,14 46,26 C 47,32 44,38 36,40" />
            <path className="ocld-draw ocld-s3" pathLength={1} strokeWidth={1.85} fill="none"
              d="M 26,38 C 22,28 24,22 30,20 C 36,18 42,22 40,32 C 39,37 34,38 31,34" />
            {/* Branches + dots — pop in after the spiral lands */}
            <line className="ocld-draw ocld-b1" pathLength={1} strokeWidth={1.35} x1="8" y1="20" x2="1" y2="13" />
            <circle className="ocld-dot ocld-d1" cx="0" cy="12" r={2.2} fill="url(#ocld-grad)" stroke="none" />
            <line className="ocld-draw ocld-b2" pathLength={1} strokeWidth={1.35} x1="4" y1="28" x2="-2" y2="28" />
            <circle className="ocld-dot ocld-d2" cx="-3" cy="28" r={2} fill="url(#ocld-grad)" stroke="none" />
            <line className="ocld-draw ocld-b3" pathLength={1} strokeWidth={1.35} x1="7" y1="37" x2="1" y2="43" />
            <circle className="ocld-dot ocld-d3" cx="0" cy="44" r={2} fill="url(#ocld-grad)" stroke="none" />
            {/* Water ripples — surface last */}
            <path className="ocld-ripple ocld-r1" strokeWidth={1.25} fill="none" d="M 14,50 Q 22,47 30,50" />
            <path className="ocld-ripple ocld-r2" strokeWidth={1.25} fill="none" d="M 10,53 Q 24,49 38,53" />
          </g>
        </svg>
        {label ? <div className="ocld-word">{label}</div> : null}
        <div className="ocld-bar" aria-hidden>
          <span />
        </div>
      </div>
    </div>
  )
}
