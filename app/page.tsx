"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OceanCoreLogoCompact } from "@/components/oceancore-logo";

function BrandMark({ navHeight = 44 }: { priority?: boolean; navHeight?: number }) {
  const scale = navHeight / 38
  return (
    <div style={{ transform: `scale(${scale})`, transformOrigin: 'left center' }}>
      <OceanCoreLogoCompact theme="dark" />
    </div>
  )
}

/* ─── types ──────────────────────────────────────────────── */
interface ChatItem {
  who: "ai" | "user" | "confirm";
  text?: string;
  typing?: number;
}

/* ─── data ──────────────────────────────────────────────── */
const CHAT_SCRIPT: ChatItem[] = [
  { who: "ai", text: "Hi! I'm the concierge for The Bluefin. Ask about reservations, the menu, or hours — anytime." },
  { who: "user", text: "Do you have a table for 4 this Friday around 7:30?" },
  { who: "ai", typing: 1400, text: "We do! Friday, June 19th at 7:30 pm — a table for 4 in the main dining room. Shall I book it?" },
  { who: "user", text: "Yes please, under Marcus." },
  { who: "ai", typing: 1500, text: "Booked. Could I grab a phone or email to send your confirmation?" },
  { who: "user", text: "marcus@hey.com" },
  { who: "ai", typing: 1300, text: "All set, Marcus — confirmation sent. We look forward to seeing you Friday." },
  { who: "confirm" },
];

const FEATURES = [
  {
    title: "AI Concierge 24/7",
    desc: "Answers every guest question and handles reservations around the clock in your restaurant's own voice. Even at 2am, no one waits.",
    link: "Meet your concierge →",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 1 3 3v1a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
        <path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v3M8 21h8"/>
      </svg>
    ),
  },
  {
    title: "Smart Booking Engine",
    desc: "Guests book through natural conversation. Party size, timing, tables, and special requests — checked against live availability and confirmed automatically.",
    link: "See the booking flow →",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>
      </svg>
    ),
  },
  {
    title: "Guest CRM",
    desc: "Every guest remembered. VIP profiles, visit history, allergies and favourite tables — all built automatically from real conversations.",
    link: "Explore the CRM →",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
];

const STATS = [
  { value: "2,400+", label: "Reservations handled" },
  { value: "4 sec", label: "Average AI response time" },
  { value: "98%", label: "Guest satisfaction rate" },
  { value: "24/7", label: "Always online" },
];

const FAQS = [
  {
    q: "How long does setup take?",
    a: "Under 60 seconds. Drop one line of code onto your website and OceanCore is live — no hardware, no migration.",
  },
  {
    q: "Does it work with my existing booking system?",
    a: "Yes. OceanCore works alongside whatever you already use, handling conversations and reservations without disruption.",
  },
  {
    q: "Can I take over a conversation?",
    a: "Anytime. Jump in with one click from your dashboard and the AI steps aside instantly.",
  },
  {
    q: "Can I customise the AI's tone?",
    a: "Yes. During setup you define your menu, hours, and house style — so every reply sounds like your restaurant.",
  },
  {
    q: "What happens after the free trial?",
    a: "It's $29/month, flat. Cancel anytime in one click — no contracts, no hidden fees.",
  },
  {
    q: "Is my guest data secure?",
    a: "Always. Guest data is encrypted and never shared or sold.",
  },
];

/* ─── hooks ─────────────────────────────────────────────── */
function useScrolled(threshold = 20) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > threshold);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [threshold]);
  return scrolled;
}

function useReveal(threshold = 0.14) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, visible] as const;
}

/* ─── chat widget ──────────────────────────────────────── */
interface Msg { who: "ai" | "user" | "confirm"; text?: string; id: number }

function ChatWidget() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [placeholder, setPlaceholder] = useState("Type your message…");
  const [placeholderColor, setPlaceholderColor] = useState("#6b7f9c");
  const bodyRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    function addMsg(item: ChatItem) {
      if (cancelled) return;
      setMsgs(prev => [...prev, { who: item.who!, text: item.text, id: ++idRef.current }]);
      setTimeout(() => {
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }, 16);
    }

    async function run() {
      let i = 0;
      const delay = (ms: number) => new Promise<void>(res => {
        const t = setTimeout(res, ms);
        timeouts.push(t);
      });

      while (true) {
        if (cancelled) return;
        const item = CHAT_SCRIPT[i % CHAT_SCRIPT.length];
        i++;

        if (item.who === "user") {
          let shown = "";
          setPlaceholderColor("#e8f1ff");
          for (const ch of item.text ?? "") {
            if (cancelled) return;
            shown += ch;
            setPlaceholder(shown);
            await delay(38);
          }
          await delay(350);
          setPlaceholder("Type your message…");
          setPlaceholderColor("#6b7f9c");
          addMsg(item);
          await delay(700);
        } else if (item.who === "ai" && item.typing) {
          setTyping(true);
          await delay(item.typing);
          setTyping(false);
          addMsg(item);
          await delay(900);
        } else if (item.who === "confirm") {
          addMsg(item);
          await delay(4200);
          setMsgs([]);
          i = 0;
          await delay(700);
        } else {
          addMsg(item);
          await delay(900);
        }
      }
    }

    const t = setTimeout(() => { if (!cancelled) run(); }, 500);
    timeouts.push(t);

    cancelRef.current = () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
    return () => cancelRef.current?.();
  }, []);

  return (
    <div style={{
      width: 370, maxWidth: "100%",
      background: "linear-gradient(160deg,#0e2236 0%,#0a1a2c 100%)",
      border: "1px solid rgba(125,211,252,0.30)",
      borderRadius: 22, overflow: "hidden",
      boxShadow: "0 30px 70px -20px rgba(0,0,0,0.7),0 0 0 1px rgba(125,211,252,0.06),0 0 60px -10px rgba(56,189,248,0.2)",
      display: "flex", flexDirection: "column", height: 478,
      animation: "floaty 7s ease-in-out infinite",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "15px 17px", borderBottom: "1px solid rgba(125,211,252,0.14)",
        background: "rgba(255,255,255,0.02)",
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#e8f1ff", whiteSpace: "nowrap" }}>The Bluefin · Oyster Bar</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5, fontSize: 12, color: "#94a8c4" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 0 3px rgba(74,222,128,0.22)", display: "inline-block" }} />
            AI Concierge · Online
          </div>
        </div>
        <div style={{
          width: 38, height: 38, borderRadius: 12, flexShrink: 0,
          background: "linear-gradient(140deg,#38bdf8,#0284c7)",
          display: "grid", placeItems: "center",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#04121f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
      </div>

      {/* messages */}
      <div ref={bodyRef} style={{
        flex: 1, padding: "16px 14px", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {msgs.map(m => {
          if (m.who === "confirm") return (
            <div key={m.id} style={{
              alignSelf: "flex-start", maxWidth: "88%",
              background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.3)",
              borderRadius: 15, padding: "12px 14px", animation: "msgin .4s cubic-bezier(.22,1,.36,1) both",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "#4ade80", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                Reservation confirmed
              </div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#e8f1ff" }}>
                {[["Guest","Marcus"],["Party","4 guests"],["When","Fri, Jun 19 · 7:30pm"]].map(([k,v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", color: "#94a8c4" }}>
                    <span>{k}</span><b style={{ color: "#e8f1ff" }}>{v}</b>
                  </div>
                ))}
              </div>
            </div>
          );
          return (
            <div key={m.id} style={{
              maxWidth: "80%", fontSize: 13.6, lineHeight: 1.5, padding: "10px 13px",
              borderRadius: 15, animation: "msgin .4s cubic-bezier(.22,1,.36,1) both",
              alignSelf: m.who === "user" ? "flex-end" : "flex-start",
              background: m.who === "user" ? "linear-gradient(135deg,#38bdf8 0%,#0ea5e9 100%)" : "rgba(255,255,255,0.05)",
              border: m.who === "user" ? "none" : "1px solid rgba(125,211,252,0.14)",
              color: m.who === "user" ? "#04121f" : "#e8f1ff",
              fontWeight: m.who === "user" ? 500 : 400,
              borderBottomLeftRadius: m.who === "ai" ? 5 : 15,
              borderBottomRightRadius: m.who === "user" ? 5 : 15,
            }}>{m.text}</div>
          );
        })}
        {typing && (
          <div style={{
            alignSelf: "flex-start", display: "flex", gap: 4, alignItems: "center",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(125,211,252,0.14)",
            borderRadius: 15, borderBottomLeftRadius: 5, padding: "13px 15px",
          }}>
            {[0,1,2].map(i => (
              <span key={i} style={{
                width: 6, height: 6, borderRadius: "50%", background: "#94a8c4",
                display: "inline-block",
                animation: `blink 1.2s ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}
      </div>

      {/* input */}
      <div style={{ padding: "11px 12px", borderTop: "1px solid rgba(125,211,252,0.14)", background: "rgba(255,255,255,0.02)" }}>
        <div style={{
          display: "flex", gap: 8, alignItems: "center",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(125,211,252,0.14)",
          borderRadius: 12, padding: "9px 12px",
        }}>
          <span style={{ flex: 1, fontSize: 13, color: placeholderColor }}>{placeholder}</span>
          <span style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            background: "linear-gradient(135deg,#38bdf8,#0ea5e9)",
            display: "grid", placeItems: "center", color: "#04121f",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── particle canvas ───────────────────────────────────── */
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const N = 46;
    let w = 0, h = 0, dpr = 1, raf = 0;
    const parts = Array.from({ length: N }, () => ({
      x: 0, y: 0,
      r: 0.6 + Math.random() * 1.7,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.16,
      a: 0.1 + Math.random() * 0.5,
    }));

    const resize = () => {
      const p = canvas.parentElement!;
      w = p.clientWidth; h = p.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts.forEach(p => { p.x = Math.random() * w; p.y = Math.random() * h; });
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.fillStyle = `rgba(56,189,248,${p.a})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}
    />
  );
}

/* ─── main page ─────────────────────────────────────────── */
export default function Home() {
  const scrolled = useScrolled();
  const [menuOpen, setMenuOpen] = useState(false);

  const [featRef, featVisible] = useReveal();
  const [howRef, howVisible] = useReveal();
  const [pricingRef, pricingVisible] = useReveal();
  const [statsRef, statsVisible] = useReveal();
  const [faqRef, faqVisible] = useReveal();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const sans = "var(--font-montserrat), system-ui, sans-serif";
  const serif = "var(--font-playfair), Georgia, serif";

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ fontFamily: sans, background: "#050d1a", color: "#e8f1ff", lineHeight: 1.5, WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        @keyframes floaty{0%,100%{transform:translateY(0);}50%{transform:translateY(-10px);}}
        @keyframes msgin{to{opacity:1;transform:none;}}
        @keyframes blink{0%,60%,100%{opacity:.3;transform:translateY(0);}30%{opacity:1;transform:translateY(-3px);}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 3px rgba(74,222,128,0.25);}50%{box-shadow:0 0 0 6px rgba(74,222,128,0.05);}}
        @keyframes oc-reveal{from{opacity:0;transform:translateY(26px);}to{opacity:1;transform:none;}}
        .oc-reveal{opacity:0;transform:translateY(26px);}
        .oc-reveal.in{animation:oc-reveal .8s cubic-bezier(.22,1,.36,1) both;}
        .oc-reveal.d1.in{animation-delay:.08s;}
        .oc-reveal.d2.in{animation-delay:.16s;}
        .oc-reveal.d3.in{animation-delay:.24s;}
        .oc-nav-links{display:none;}
        .oc-get-started{display:none;}
        .oc-hamburger{display:flex;}
        @media(min-width:880px){
          .oc-nav-links{display:flex!important;}
          .oc-get-started{display:inline-block!important;}
          .oc-hamburger{display:none!important;}
        }
        .oc-feature:hover{transform:translateY(-6px)!important;border-color:rgba(125,211,252,0.30)!important;box-shadow:0 24px 50px -18px rgba(0,0,0,.6),0 0 40px -16px rgba(56,189,248,.3)!important;}
        .oc-btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 40px -6px rgba(56,189,248,0.35);background:#7dd3fc;}
        .oc-btn-ghost:hover{transform:translateY(-2px);background:rgba(255,255,255,0.07);border-color:#38bdf8;}
        .oc-nav-cta:hover{transform:translateY(-1px);background:#7dd3fc;}
        .oc-feat-link{margin-top:20px;display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#38bdf8;cursor:pointer;}
        .oc-foot-link{display:block;font-size:14px;color:#94a8c4;margin-bottom:13px;text-decoration:none;transition:color .2s;}
        .oc-foot-link:hover{color:#38bdf8;}
        .oc-social-icon{width:36px;height:36px;border-radius:10px;border:1px solid rgba(125,211,252,0.14);display:grid;place-items:center;color:#94a8c4;transition:all .2s;cursor:pointer;}
        .oc-social-icon:hover{color:#38bdf8;border-color:#38bdf8;transform:translateY(-2px);}
        @media(prefers-reduced-motion:reduce){.oc-reveal{opacity:1!important;transform:none!important;}.oc-reveal.in{animation:none!important;}}
      `}</style>

      {/* ── NAV ── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        transition: "background .3s, box-shadow .3s",
        borderBottom: "1px solid rgba(125,211,252,0.22)",
        background: scrolled ? "rgba(5,13,26,0.88)" : "rgba(5,13,26,0.55)",
        backdropFilter: "blur(18px) saturate(150%)",
        WebkitBackdropFilter: "blur(18px) saturate(150%)",
        boxShadow: scrolled ? "0 8px 32px rgba(0,0,0,0.4)" : "none",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", height: 72, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px" }}>
          <a href="#top" style={{ lineHeight: 0, textDecoration: "none" }} aria-label="OceanCore home">
            <BrandMark priority />
          </a>

          <nav className="oc-nav-links" style={{ alignItems: "center", gap: 38 }}>
            {[["Features","features"],["How it works","how"],["Pricing","pricing"],["FAQ","faq"],["Demo","demo"]].map(([label, id]) => (
              <button key={id} type="button" onClick={() => scrollTo(id)} style={{
                background: "none", border: 0, fontSize: 14.5, color: "#94a8c4", fontWeight: 500,
                cursor: "pointer", transition: "color .2s", fontFamily: sans, padding: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#e8f1ff")}
              onMouseLeave={e => (e.currentTarget.style.color = "#94a8c4")}
              >{label}</button>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/auth/login" className="oc-get-started" style={{
              fontSize: 14, fontWeight: 500, color: "#94a8c4",
              padding: "10px 16px", borderRadius: 10, textDecoration: "none",
              transition: "color .2s",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#e8f1ff")}
            onMouseLeave={e => (e.currentTarget.style.color = "#94a8c4")}
            >Log in</Link>
            <Link href="/auth/signup" className="oc-get-started oc-nav-cta" style={{
              fontSize: 14, fontWeight: 700, background: "#38bdf8", color: "#04121f",
              padding: "10px 20px", borderRadius: 10, textDecoration: "none",
              boxShadow: "0 4px 20px -4px rgba(56,189,248,0.35)",
              transition: "transform .2s, background .2s",
            }}>Get Started</Link>
            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Menu"
              className="oc-hamburger"
              style={{ background: "none", border: 0, color: "#e8f1ff", cursor: "pointer", padding: 6 }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {menuOpen
                  ? <><path d="M18 6 6 18M6 6l12 12"/></>
                  : <path d="M4 7h16M4 12h16M4 17h16"/>}
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* mobile menu */}
      {menuOpen && (
        <div style={{
          position: "fixed", inset: "72px 0 0", zIndex: 99,
          background: "rgba(5,13,26,0.97)", backdropFilter: "blur(16px)",
          display: "flex", flexDirection: "column", padding: "30px 28px", gap: 8,
        }}>
          {[["Features","features"],["How it works","how"],["Pricing","pricing"],["FAQ","faq"],["Demo","demo"]].map(([label, id]) => (
            <button key={id} type="button" onClick={() => scrollTo(id)} style={{
              fontSize: 18, padding: "14px 0",
              color: "#e8f1ff", background: "none", border: "none", borderBottom: "1px solid rgba(125,211,252,0.14)", textAlign: "left",
              cursor: "pointer", fontFamily: sans,
            }}>{label}</button>
          ))}
          <Link href="/auth/signup" style={{
            marginTop: 18, display: "flex", justifyContent: "center",
            background: "#38bdf8", color: "#04121f", fontWeight: 700,
            padding: "14px 26px", borderRadius: 12, textDecoration: "none", fontSize: 15,
          }}>Get Started</Link>
        </div>
      )}

      {/* ── HERO ── */}
      <section id="top" style={{ position: "relative", minHeight: "100vh", padding: "100px 0 80px", display: "flex", alignItems: "center", overflow: "hidden" }}>
        {/* bg */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
          background: "radial-gradient(120% 70% at 78% 8%,rgba(56,189,248,0.16),transparent 52%), radial-gradient(90% 60% at 12% 4%,rgba(56,189,248,0.08),transparent 55%), linear-gradient(180deg,#050d1a 0%,#071426 55%,#050d1a 100%)" }} />
        {/* doodle art */}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: "64%", zIndex: 1, pointerEvents: "none",
          backgroundImage: "url('/hero-doodles.png')", backgroundSize: "cover", backgroundPosition: "left center",
          filter: "invert(1) brightness(1.15) contrast(1.05)", mixBlendMode: "screen", opacity: 0.15,
          WebkitMaskImage: "linear-gradient(100deg,rgba(0,0,0,1) 0%,rgba(0,0,0,0.9) 26%,rgba(0,0,0,0) 64%)",
          maskImage: "linear-gradient(100deg,rgba(0,0,0,1) 0%,rgba(0,0,0,0.9) 26%,rgba(0,0,0,0) 64%)",
        }} />
        {/* particle canvas */}
        <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
          <ParticleCanvas />
        </div>
        {/* glow */}
        <div style={{ position: "absolute", width: 680, height: 680, borderRadius: "50%", top: -260, right: -160, zIndex: 0,
          background: "radial-gradient(circle,rgba(56,189,248,0.20),transparent 60%)", filter: "blur(40px)", pointerEvents: "none", willChange: "transform", transform: "translateZ(0)" }} />

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px", position: "relative", zIndex: 2, width: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 56, alignItems: "center" }}
            className="hero-grid">
            <style>{`@media(max-width:940px){.hero-grid{grid-template-columns:1fr!important;gap:48px!important;}}`}</style>

            {/* copy */}
            <div>
              <span className="oc-reveal in" style={{
                display: "inline-flex", alignItems: "center", gap: 9, fontSize: 12.5, fontWeight: 600,
                color: "#7dd3fc", background: "rgba(56,189,248,0.08)", border: "1px solid rgba(125,211,252,0.30)",
                padding: "7px 15px", borderRadius: 999, marginBottom: 26,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 0 4px rgba(74,222,128,0.22)", animation: "pulse 2.4s infinite" }} />
                AI-Powered concierge · Now live
              </span>

              <h1 className="oc-reveal in d1" style={{
                fontFamily: serif, fontSize: "clamp(44px,5.4vw,76px)", lineHeight: 1.04,
                fontWeight: 600, margin: 0, letterSpacing: "-0.02em",
              }}>
                Never miss a<br /><span style={{ fontStyle: "italic", color: "#38bdf8" }}>reservation</span> again.
              </h1>

              <p className="oc-reveal in d2" style={{
                marginTop: 26, maxWidth: 480, fontSize: "clamp(16.5px,1.4vw,19px)",
                lineHeight: 1.62, color: "#94a8c4",
              }}>
                OceanCore is the AI concierge that answers every guest, books every table, and remembers every regular — 24 hours a day, while you run your restaurant.
              </p>

              <div className="oc-reveal in d3" style={{ marginTop: 38, display: "flex", flexWrap: "wrap", gap: 14 }}>
                <Link href="/auth/signup" className="oc-btn-primary" style={{
                  display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 700, fontSize: 16,
                  borderRadius: 12, padding: "17px 34px", border: "1px solid transparent",
                  background: "#38bdf8", color: "#04121f",
                  boxShadow: "0 6px 30px -4px rgba(56,189,248,0.35)",
                  textDecoration: "none", transition: "transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .25s, background .25s",
                  whiteSpace: "nowrap",
                }}>
                  Start Free Trial
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                </Link>
                <button type="button" onClick={() => scrollTo("demo")} className="oc-btn-ghost" style={{
                  display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 700, fontSize: 16,
                  borderRadius: 12, padding: "17px 34px", border: "1px solid rgba(125,211,252,0.30)",
                  background: "rgba(255,255,255,0.03)", color: "#e8f1ff",
                  transition: "transform .2s cubic-bezier(.34,1.56,.64,1), background .25s, border-color .25s",
                  cursor: "pointer", fontFamily: sans, whiteSpace: "nowrap",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  See it in action
                </button>
              </div>
            </div>

            {/* chat widget */}
            <div id="demo" className="oc-reveal in d2" style={{ position: "relative", display: "flex", justifyContent: "center" }}>
              <div style={{ position: "absolute", inset: "-10% -6%",
                background: "radial-gradient(circle at 60% 40%,rgba(56,189,248,0.18),transparent 65%)",
                filter: "blur(30px)", zIndex: 0 }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <ChatWidget />
                <div style={{
                  position: "absolute", right: -8, bottom: -22,
                  width: 56, height: 56, borderRadius: "50%",
                  background: "linear-gradient(135deg,#0ea5e9,#0284c7)",
                  display: "grid", placeItems: "center",
                  boxShadow: "0 10px 30px -4px rgba(56,189,248,0.35)",
                  zIndex: 3, border: "3px solid #0a1a2c",
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── VALUE PROPS ── */}
      <section style={{ padding: "64px 0", borderTop: "1px solid rgba(125,211,252,0.14)", borderBottom: "1px solid rgba(125,211,252,0.14)", background: "#07101e" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
          <p style={{ textAlign: "center", fontSize: 12.5, letterSpacing: "0.2em", textTransform: "uppercase", color: "#6b7f9c", fontWeight: 600, marginBottom: 44 }}>
            Why restaurants choose OceanCore
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 34, maxWidth: 980, margin: "0 auto" }}
            className="vp-grid">
            <style>{`@media(max-width:640px){.vp-grid{grid-template-columns:1fr!important;}}`}</style>
            {[
              { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>, title: "Always answering", desc: "Greets and books guests around the clock — long after the last table is cleared." },
              { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>, title: "Live in minutes", desc: "One line of code. No new hardware, no staff training, no migration." },
              { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, title: "Speaks your voice", desc: "Tuned to your menu, hours, and house style — so every reply sounds like you." },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ textAlign: "center", padding: "0 8px" }}>
                <div style={{ width: 52, height: 52, borderRadius: 15, display: "grid", placeItems: "center", margin: "0 auto 18px", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(125,211,252,0.30)", color: "#38bdf8" }}>
                  {icon}
                </div>
                <h3 style={{ fontFamily: serif, fontWeight: 700, fontSize: 19, marginBottom: 9, margin: "0 0 9px" }}>{title}</h3>
                <p style={{ fontSize: 14, color: "#94a8c4", lineHeight: 1.6, maxWidth: 280, margin: "0 auto" }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROBLEM / SOLUTION ── */}
      <section style={{ position: "relative", padding: "120px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ maxWidth: 680 }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#38bdf8", marginBottom: 18 }}>The front-of-house problem</p>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(32px,4vw,48px)", lineHeight: 1.12, margin: 0, fontWeight: 600, letterSpacing: "-0.02em" }}>
              Every missed call is a <span style={{ color: "#38bdf8", fontStyle: "italic" }}>missed cover.</span>
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "stretch", marginTop: 54 }}
            className="ps-grid">
            <style>{`@media(max-width:860px){.ps-grid{grid-template-columns:1fr!important;}}`}</style>
            {/* pain */}
            <div style={{ borderRadius: 22, padding: "36px 34px", border: "1px solid rgba(248,113,113,0.18)", background: "linear-gradient(165deg,rgba(248,113,113,0.06),rgba(248,113,113,0.01))" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "6px 13px", borderRadius: 999, marginBottom: 22, color: "#fca5a5", background: "rgba(248,113,113,0.1)" }}>
                Without OceanCore
              </span>
              <h3 style={{ fontFamily: serif, fontSize: 25, marginBottom: 20, margin: "0 0 20px", fontWeight: 600 }}>The phone never stops — and neither do the no-shows.</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  "Calls go to voicemail during the dinner rush, and bookings walk to the restaurant next door.",
                  "Late-night DMs and emails sit unanswered until morning.",
                  "Staff juggle phones instead of guests on the floor.",
                  "Regulars and their preferences live in someone's memory — not a system.",
                ].map(text => (
                  <div key={text} style={{ display: "flex", gap: 13, alignItems: "flex-start", fontSize: 15, lineHeight: 1.5, color: "#94a8c4" }}>
                    <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", marginTop: 1, background: "rgba(248,113,113,0.12)", color: "#fca5a5", fontSize: 14, fontWeight: 700 }}>✕</span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
            {/* solution */}
            <div style={{ borderRadius: 22, padding: "36px 34px", border: "1px solid rgba(125,211,252,0.30)", background: "linear-gradient(165deg,rgba(56,189,248,0.10),rgba(56,189,248,0.02))" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "6px 13px", borderRadius: 999, marginBottom: 22, color: "#7dd3fc", background: "rgba(56,189,248,0.12)" }}>
                With OceanCore
              </span>
              <h3 style={{ fontFamily: serif, fontSize: 25, marginBottom: 20, margin: "0 0 20px", fontWeight: 600 }}>An always-on concierge that turns conversations into covers.</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  "Every guest is greeted and booked in seconds — even at 2am.",
                  "Questions about menu, hours, and dietary needs answered instantly.",
                  "Your team stays on the floor, focused on the experience.",
                  "Every guest remembered automatically in a living CRM.",
                ].map(text => (
                  <div key={text} style={{ display: "flex", gap: 13, alignItems: "flex-start", fontSize: 15, lineHeight: 1.5, color: "#e8f1ff" }}>
                    <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", marginTop: 1, background: "rgba(56,189,248,0.14)", color: "#7dd3fc", fontSize: 14, fontWeight: 700 }}>✓</span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" ref={featRef as React.RefObject<HTMLElement>} style={{ position: "relative", padding: "120px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ maxWidth: 640 }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#38bdf8", marginBottom: 18 }}>Features</p>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(32px,4.2vw,50px)", lineHeight: 1.12, margin: "0 0 20px", fontWeight: 600, letterSpacing: "-0.02em" }}>
              Built for restaurants that<br /><span style={{ color: "#38bdf8", fontStyle: "italic" }}>refuse to compromise.</span>
            </h2>
            <p style={{ fontSize: 17, color: "#94a8c4", lineHeight: 1.6, maxWidth: 520, margin: 0 }}>Three systems working as one — so you delight guests and run service without burning out your team.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22, marginTop: 60 }}
            className="feat-grid">
            <style>{`@media(max-width:860px){.feat-grid{grid-template-columns:1fr!important;max-width:460px;margin-left:auto;margin-right:auto;}}`}</style>
            {FEATURES.map((f, i) => (
              <article key={f.title} className="oc-feature" style={{
                position: "relative", borderRadius: 22, padding: "34px 30px 32px",
                background: "linear-gradient(165deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))",
                border: "1px solid rgba(125,211,252,0.14)", overflow: "hidden",
                transition: "transform .35s cubic-bezier(.34,1.56,.64,1), border-color .3s, box-shadow .35s",
                opacity: featVisible ? 1 : 0,
                transform: featVisible ? "none" : "translateY(26px)",
                transitionDelay: featVisible ? `${i * 0.08}s` : "0s",
              }}>
                <div style={{ width: 54, height: 54, borderRadius: 15, display: "grid", placeItems: "center", marginBottom: 22, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(125,211,252,0.30)", color: "#38bdf8" }}>
                  {f.icon}
                </div>
                <h3 style={{ fontFamily: serif, fontSize: 21, margin: "0 0 11px", fontWeight: 600 }}>{f.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.65, color: "#94a8c4", margin: 0 }}>{f.desc}</p>
                <span className="oc-feat-link">{f.link}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" ref={howRef as React.RefObject<HTMLElement>} style={{ padding: "120px 0", background: "linear-gradient(180deg,#050d1a 0%,#061425 50%,#050d1a 100%)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto" }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#38bdf8", marginBottom: 18 }}>How it works</p>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(32px,4.2vw,50px)", lineHeight: 1.12, margin: "0 0 18px", fontWeight: 600, letterSpacing: "-0.02em" }}>
              Live in three steps,<br /><span style={{ color: "#38bdf8", fontStyle: "italic" }}>not three weeks.</span>
            </h2>
            <p style={{ fontSize: 17, color: "#94a8c4", margin: 0 }}>One install, infinite conversations — with you in the loop whenever you want to be.</p>
          </div>
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 30, marginTop: 66 }}
            className="steps-grid">
            <style>{`@media(max-width:860px){.steps-grid{grid-template-columns:1fr!important;max-width:420px;margin-left:auto;margin-right:auto;gap:40px!important;}.steps-line{display:none!important;}}`}</style>
            <div className="steps-line" style={{ position: "absolute", top: 32, left: "16%", right: "16%", height: 1, borderTop: "1px dashed rgba(125,211,252,0.30)", zIndex: 0 }} />
            {[
              { n: "1", title: "Install the widget", body: "Drop one line of code onto your website. OceanCore is live in under 60 seconds.", visual: <div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, color: "#7dd3fc", background: "rgba(4,12,22,0.6)", border: "1px solid rgba(125,211,252,0.14)", borderRadius: 8, padding: "9px 11px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}><span>{"<script src=\"oceancore.js\">"}</span><span style={{ fontFamily: sans, fontSize: 11, color: "#94a8c4" }}>Copy</span></div> },
              { n: "2", title: "Guests book themselves", body: "The AI greets, answers, and reserves — handling questions and special requests 24/7.", visual: <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{[["Booked","Table for 4 · Fri 7:30pm"],["Answered",'"Are you gluten-free friendly?"']].map(([pill,text]) => <div key={pill} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "#94a8c4" }}><span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(56,189,248,0.12)", color: "#7dd3fc", fontWeight: 600, fontSize: 10.5 }}>{pill}</span>{text}</div>)}</div> },
              { n: "3", title: "You manage everything", body: "Watch conversations live, take over with one click, and see every booking in one calm dashboard.", visual: <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{[["Live","Tonight's bookings, at a glance"],["CRM","Every guest, remembered"]].map(([pill,text]) => <div key={pill} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "#94a8c4" }}><span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(56,189,248,0.12)", color: "#7dd3fc", fontWeight: 600, fontSize: 10.5 }}>{pill}</span>{text}</div>)}</div> },
            ].map((step, i) => (
              <div key={step.n} style={{
                position: "relative", zIndex: 1, textAlign: "center",
                opacity: howVisible ? 1 : 0,
                transform: howVisible ? "none" : "translateY(26px)",
                transition: "opacity .8s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1)",
                transitionDelay: `${i * 0.08}s`,
              }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 24px", display: "grid", placeItems: "center", fontFamily: serif, fontSize: 26, fontWeight: 600, color: "#04121f", background: "linear-gradient(140deg,#7dd3fc,#38bdf8)", boxShadow: "0 10px 30px -6px rgba(56,189,248,0.35),0 0 0 6px rgba(56,189,248,0.06)" }}>{step.n}</div>
                <h3 style={{ fontFamily: serif, fontSize: 21, margin: "0 0 11px", fontWeight: 600 }}>{step.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#94a8c4", maxWidth: 300, margin: "0 auto 22px" }}>{step.body}</p>
                <div style={{ borderRadius: 14, border: "1px solid rgba(125,211,252,0.14)", background: "rgba(255,255,255,0.025)", padding: 14, fontSize: 12, textAlign: "left" }}>{step.visual}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" ref={pricingRef as React.RefObject<HTMLElement>} style={{ position: "relative", padding: "120px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ textAlign: "center", maxWidth: 560, margin: "0 auto" }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#38bdf8", marginBottom: 18 }}>Pricing</p>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(32px,4.2vw,50px)", lineHeight: 1.12, margin: "0 0 18px", fontWeight: 600, letterSpacing: "-0.02em" }}>
              One simple plan.<br /><span style={{ color: "#38bdf8", fontStyle: "italic" }}>14 days on us.</span>
            </h2>
            <p style={{ fontSize: 17, color: "#94a8c4", margin: 0 }}>Try everything free for 14 days. No credit card required — keep going for one flat monthly price.</p>
          </div>
          <div style={{ maxWidth: 460, margin: "60px auto 0" }}
            className="plans-grid">
            {/* Pro — single plan, 14-day free trial */}
            <div style={{
              position: "relative", borderRadius: 24, padding: "44px 38px 38px",
              border: "1px solid rgba(125,211,252,0.30)", display: "flex", flexDirection: "column",
              background: "linear-gradient(170deg,rgba(56,189,248,0.10),rgba(56,189,248,0.02))",
              boxShadow: "0 0 0 1px rgba(56,189,248,0.12),0 30px 60px -24px rgba(56,189,248,0.25)",
              opacity: pricingVisible ? 1 : 0,
              transform: pricingVisible ? "none" : "translateY(26px)",
              transition: "opacity .8s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1)",
            }}>
              <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#04121f", background: "linear-gradient(135deg,#7dd3fc,#38bdf8)", padding: "6px 16px", borderRadius: 999, boxShadow: "0 6px 18px -4px rgba(56,189,248,0.35)" }}>
                14-day free trial
              </div>
              <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 600 }}>OceanCore Pro</div>
              <div style={{ marginTop: 8, fontSize: 14, color: "#94a8c4" }}>Everything you need to never miss a cover — one plan, no tiers, no limits.</div>
              <div style={{ marginTop: 24, display: "flex", alignItems: "flex-end", gap: 6 }}>
                <span style={{ fontFamily: serif, fontSize: 62, fontWeight: 600, lineHeight: 0.9, color: "#38bdf8" }}>$29</span>
                <span style={{ paddingBottom: 8, fontSize: 15, color: "#6b7f9c" }}>/ month</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 13.5, color: "#7dd3fc", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                Free for 14 days, then $29/month. Cancel anytime.
              </div>
              <div style={{ margin: "28px 0", display: "flex", flexDirection: "column", gap: 13, flex: 1 }}>
                {["Unlimited AI messages","AI Concierge 24/7","Smart reservations & live availability","Full Guest CRM & VIP profiles","Live takeover & team seats","Revenue & performance analytics","1-line website widget","Priority support"].map(f => (
                  <div key={f} style={{ display: "flex", gap: 11, alignItems: "flex-start", fontSize: 14.5, color: "#e8f1ff" }}>
                    <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", background: "rgba(56,189,248,0.14)", color: "#7dd3fc", marginTop: 1, fontSize: 12 }}>✓</span>
                    {f}
                  </div>
                ))}
              </div>
              <Link href="/auth/signup" className="oc-btn-primary" style={{ display: "flex", justifyContent: "center", alignItems: "center", fontWeight: 700, fontSize: 15, borderRadius: 12, padding: "14px 26px", border: "1px solid transparent", background: "#38bdf8", color: "#04121f", textDecoration: "none", transition: "transform .2s, background .25s, box-shadow .25s", boxShadow: "0 6px 30px -4px rgba(56,189,248,0.35)" }}>
                Start 14-day free trial
              </Link>
              <span style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: "#6b7f9c" }}>No credit card required</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section id="customers" ref={statsRef as React.RefObject<HTMLElement>} style={{ padding: "120px 0", background: "#07101e" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#38bdf8", marginBottom: 18 }}>By the numbers</p>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(30px,3.6vw,44px)", lineHeight: 1.12, margin: 0, fontWeight: 600, letterSpacing: "-0.02em" }}>Service that never sleeps</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 22, marginTop: 60 }}
            className="stats-grid">
            <style>{`@media(max-width:760px){.stats-grid{grid-template-columns:repeat(2,1fr)!important;}}`}</style>
            {STATS.map((s, i) => (
              <div key={s.label} style={{
                textAlign: "center", borderRadius: 22, padding: "36px 22px",
                border: "1px solid rgba(125,211,252,0.14)",
                background: "linear-gradient(165deg,rgba(255,255,255,.045),rgba(255,255,255,.012))",
                opacity: statsVisible ? 1 : 0,
                transform: statsVisible ? "none" : "translateY(26px)",
                transition: "opacity .8s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1)",
                transitionDelay: `${i * 0.08}s`,
              }}>
                <div style={{ fontFamily: serif, fontSize: "clamp(34px,3.4vw,48px)", fontWeight: 600, color: "#38bdf8", lineHeight: 1 }}>{s.value}</div>
                <div style={{ marginTop: 12, fontSize: 14, color: "#94a8c4" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" ref={faqRef as React.RefObject<HTMLElement>} style={{ position: "relative", padding: "120px 0" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#38bdf8", marginBottom: 18 }}>FAQ</p>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(30px,3.6vw,44px)", lineHeight: 1.12, margin: 0, fontWeight: 600, letterSpacing: "-0.02em" }}>Questions, answered</h2>
          </div>
          <div style={{ marginTop: 54, display: "flex", flexDirection: "column", gap: 14 }}>
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q} style={{
                  borderRadius: 16, overflow: "hidden",
                  border: `1px solid ${open ? "rgba(125,211,252,0.30)" : "rgba(125,211,252,0.14)"}`,
                  background: "linear-gradient(165deg,rgba(255,255,255,.045),rgba(255,255,255,.012))",
                  opacity: faqVisible ? 1 : 0,
                  transform: faqVisible ? "none" : "translateY(20px)",
                  transition: "opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1), border-color .25s",
                  transitionDelay: `${i * 0.05}s`,
                }}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                      padding: "20px 24px", background: "none", border: 0, cursor: "pointer",
                      fontFamily: sans, textAlign: "left",
                      fontSize: 16.5, fontWeight: 600, color: "#e8f1ff",
                    }}
                  >
                    {f.q}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ flexShrink: 0, transition: "transform .3s cubic-bezier(.22,1,.36,1)", transform: open ? "rotate(180deg)" : "none" }}>
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </button>
                  <div style={{
                    display: "grid",
                    gridTemplateRows: open ? "1fr" : "0fr",
                    transition: "grid-template-rows .35s cubic-bezier(.22,1,.36,1)",
                  }}>
                    <div style={{ overflow: "hidden" }}>
                      <p style={{ margin: 0, padding: "0 24px 22px", fontSize: 15, lineHeight: 1.65, color: "#94a8c4" }}>{f.a}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ position: "relative", padding: "120px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ position: "relative", borderRadius: 32, overflow: "hidden", padding: "84px 40px", textAlign: "center",
            background: "radial-gradient(120% 130% at 50% -10%,rgba(56,189,248,0.22),transparent 55%),linear-gradient(165deg,#0c2236,#071426)",
            border: "1px solid rgba(125,211,252,0.30)", boxShadow: "0 40px 90px -30px rgba(0,0,0,0.7)" }}>
            <div style={{ position: "absolute", width: 420, height: 420, borderRadius: "50%", top: -200, left: "50%", transform: "translateX(-50%)", background: "radial-gradient(circle,rgba(56,189,248,0.25),transparent 60%)", filter: "blur(30px)" }} />
            <h2 style={{ position: "relative", fontFamily: serif, fontSize: "clamp(34px,4.6vw,56px)", lineHeight: 1.08, maxWidth: 680, margin: "0 auto", fontWeight: 600, letterSpacing: "-0.02em" }}>
              Your tables are waiting.<br />Let&apos;s fill them.
            </h2>
            <p style={{ position: "relative", margin: "22px auto 36px", fontSize: 18, color: "#94a8c4", maxWidth: 480 }}>
              Join restaurants running calmer, sharper service on OceanCore.
            </p>
            <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <Link href="/auth/signup" className="oc-btn-primary" style={{
                display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 700, fontSize: 16,
                borderRadius: 12, padding: "17px 34px", border: "1px solid transparent",
                background: "#38bdf8", color: "#04121f",
                boxShadow: "0 6px 30px -4px rgba(56,189,248,0.35)",
                textDecoration: "none", transition: "transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .25s, background .25s",
              }}>
                Start Free Trial
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </Link>
              <span style={{ fontSize: 13, color: "#6b7f9c", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                14-day free trial · No credit card · Live in 60 seconds
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: "72px 0 40px", borderTop: "1px solid rgba(125,211,252,0.14)", background: "#040810" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 40 }}
            className="foot-grid">
            <style>{`@media(max-width:760px){.foot-grid{grid-template-columns:1fr 1fr!important;gap:34px!important;}}`}</style>
            <div style={{ maxWidth: 300 }}>
              <a href="#top" style={{ textDecoration: "none" }}>
                <BrandMark navHeight={52} />
              </a>
              <p style={{ marginTop: 16, fontSize: 14, color: "#94a8c4", lineHeight: 1.6 }}>
                The AI concierge that answers, books, and remembers — so every restaurant runs front-of-house like a Michelin team.
              </p>
            </div>
            {[
              { heading: "Product", links: [["Features","#features"],["How it works","#how"],["Pricing","#pricing"],["Live demo","#demo"]] },
              { heading: "Company", links: [["FAQ","#faq"],["Contact","mailto:hello@oceancore.ai"]] },
              { heading: "Resources", links: [["Get started","/onboarding"],["Live demo","#demo"]] },
            ].map(col => (
              <div key={col.heading}>
                <h4 style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b7f9c", marginBottom: 18, fontWeight: 700, margin: "0 0 18px" }}>{col.heading}</h4>
                {col.links.map(([label, href]) => (
                  <a key={label} href={href} className="oc-foot-link">{label}</a>
                ))}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 54, paddingTop: 28, borderTop: "1px solid rgba(125,211,252,0.14)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, color: "#6b7f9c", fontSize: 13 }}>
            <span>© 2026 OceanCore, Inc. All rights reserved.</span>
            <div style={{ display: "flex", gap: 14 }}>
              <a
                href="https://instagram.com/oceancore"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="oc-social-icon"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
