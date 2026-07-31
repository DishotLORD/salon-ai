"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { OceanCoreLogoCompact } from "@/components/oceancore-logo";
import { OceanCoreLoader } from "@/components/oceancore-loader";
import { getLenis } from "@/lib/lenis";
import { fs, radius } from "@/lib/marketing-scale";

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

/*
 * Every figure here has to be true of a product with no customers yet.
 *
 * This block used to read "2,400+ reservations handled" and "98% guest
 * satisfaction rate" — invented numbers, on a public page, presented as
 * measurements. That is the kind of claim a competitor screenshots and an
 * advertising regulator reads literally, and it is the one thing a restaurant
 * owner cannot forgive once they work out it was made up.
 *
 * These four are true by construction: they describe how the product is built,
 * not how it has performed. Swap in real metrics the day there are real ones —
 * and then they will actually mean something.
 */
const STATS = [
  { value: "24/7", label: "Answering, every day of the year" },
  { value: "1 line", label: "Of code, and you're live" },
  { value: "0", label: "Guests left waiting on hold" },
  { value: "14 days", label: "Free to try, no card required" },
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

/**
 * Structured data. Google reads this to draw the expandable Q&A straight into
 * the search result, and to file the product under software rather than
 * guessing from prose. Built from the same FAQS and pricing constants the page
 * renders, because structured data that disagrees with the visible page is a
 * manual-action risk, not just a wasted tag.
 */
function StructuredData() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "OceanCore",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Restaurant reservation and guest management",
        operatingSystem: "Web",
        description:
          "An AI concierge for restaurants and bars: answers guest questions, checks live availability, and books, moves or cancels tables around the clock.",
        offers: {
          "@type": "Offer",
          price: "29",
          priceCurrency: "CAD",
          category: "subscription",
          description: "14-day free trial, then $29 per month. Cancel anytime.",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // The payload is our own constants, never guest input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}

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

/**
 * Two widgets in one shell.
 *
 * Until a visitor touches it, the scripted conversation loops as an attract
 * reel. The moment they type, it hands over to a real concierge on
 * /api/demo/concierge — a sealed fictional venue with no database behind it. A
 * product that claims to answer every guest looked bad answering nobody: the
 * input box was a picture of an input box.
 */
type ChatMode = "reel" | "live";

const LIVE_GREETING =
  "Hi! I'm Marina, the concierge for The Bluefin. Ask me about a table, the menu, or how any of this works — this one's a live demo.";

function ChatWidget() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [placeholder, setPlaceholder] = useState("Type your message…");
  const [placeholderColor, setPlaceholderColor] = useState("#6b7f9c");
  const [mode, setMode] = useState<ChatMode>("reel");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const cancelRef = useRef<(() => void) | null>(null);

  const scrollToEnd = () => {
    setTimeout(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }, 16);
  };

  useEffect(() => {
    if (mode !== "reel") return;
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
  }, [mode]);

  /** Stop the reel, wipe its transcript, and start a real conversation. */
  const goLive = useCallback(() => {
    if (mode === "live") return;
    cancelRef.current?.();
    setTyping(false);
    setMode("live");
    setNotice("");
    setMsgs([{ who: "ai", text: LIVE_GREETING, id: ++idRef.current }]);
    scrollToEnd();
  }, [mode]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;

    const outgoing: Msg = { who: "user", text, id: ++idRef.current };
    // Snapshot before the state update so the request carries this turn too.
    const history = [...msgs, outgoing]
      .filter(m => m.who !== "confirm" && m.text)
      .map(m => ({ role: m.who === "user" ? "user" : "assistant", content: m.text as string }));

    setMsgs(prev => [...prev, outgoing]);
    setDraft("");
    setNotice("");
    setSending(true);
    setTyping(true);
    scrollToEnd();

    try {
      const res = await fetch("/api/demo/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = (await res.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null;

      if (res.ok && data?.message) {
        setMsgs(prev => [...prev, { who: "ai", text: data.message, id: ++idRef.current }]);
      } else if (res.status === 429) {
        setNotice(
          data?.message ??
            "That's a lot of questions — give me a minute, or start a trial and talk to your own concierge.",
        );
      } else if (res.status === 503) {
        // The demo concierge is switched off; say so rather than looking broken.
        setNotice("The live demo is offline right now. The scripted tour above shows the same flow.");
      } else {
        setNotice("I lost that one. Try asking again?");
      }
    } catch {
      setNotice("Connection dropped before I could answer. Try again?");
    } finally {
      setTyping(false);
      setSending(false);
      scrollToEnd();
    }
  }, [draft, sending, msgs]);

  return (
    <div style={{
      width: 370, maxWidth: "100%",
      background: "linear-gradient(160deg,#0e2236 0%,#0a1a2c 100%)",
      border: "1px solid rgba(125,211,252,0.30)",
      borderRadius: radius.lg, overflow: "hidden",
      boxShadow: "0 30px 70px -20px rgba(0,0,0,0.7),0 0 0 1px rgba(125,211,252,0.06),0 0 60px -10px rgba(56,189,248,0.2)",
      display: "flex", flexDirection: "column", height: 478,
      animation: mode === "live" ? "none" : "floaty 7s ease-in-out infinite",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "15px 17px", borderBottom: "1px solid rgba(125,211,252,0.14)",
        // Opaque, not a 2% white wash. A live conversation actually overflows the
        // transcript, and a translucent header let the scrolled messages show
        // through the venue name. #0e2236 is where the card's gradient starts, so
        // the seam is invisible.
        background: "linear-gradient(rgba(255,255,255,0.02), rgba(255,255,255,0.02)), #0e2236",
        position: "relative", zIndex: 1,
      }}>
        <div>
          <div style={{ fontSize: fs.bodyLg, fontWeight: 700, color: "#e8f1ff", whiteSpace: "nowrap" }}>The Bluefin · Oyster Bar</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5, fontSize: fs.caption, color: "#94a8c4" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 0 3px rgba(74,222,128,0.22)", display: "inline-block" }} />
            AI Concierge · Online
          </div>
        </div>
        {mode === "live" ? (
          <button
            type="button"
            onClick={() => { setMode("reel"); setMsgs([]); setDraft(""); setNotice(""); }}
            style={{
              flexShrink: 0, padding: "7px 11px", borderRadius: radius.xs,
              border: "1px solid rgba(125,211,252,0.22)", background: "rgba(255,255,255,0.04)",
              color: "#94a8c4", fontSize: fs.micro, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Start over
          </button>
        ) : (
          <div style={{
            width: 38, height: 38, borderRadius: radius.sm, flexShrink: 0,
            background: "linear-gradient(140deg,#38bdf8,#0284c7)",
            display: "grid", placeItems: "center",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#04121f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
        )}
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
              borderRadius: radius.md, padding: "12px 14px", animation: "msgin .4s cubic-bezier(.22,1,.36,1) both",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: fs.caption, fontWeight: 700, color: "#4ade80", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                Reservation confirmed
              </div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: fs.small, color: "#e8f1ff" }}>
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
              maxWidth: "80%", fontSize: fs.small, lineHeight: 1.5, padding: "10px 13px",
              borderRadius: radius.md, animation: "msgin .4s cubic-bezier(.22,1,.36,1) both",
              alignSelf: m.who === "user" ? "flex-end" : "flex-start",
              background: m.who === "user" ? "linear-gradient(135deg,#38bdf8 0%,#0ea5e9 100%)" : "rgba(255,255,255,0.05)",
              border: m.who === "user" ? "none" : "1px solid rgba(125,211,252,0.14)",
              color: m.who === "user" ? "#04121f" : "#e8f1ff",
              fontWeight: m.who === "user" ? 500 : 400,
              borderBottomLeftRadius: m.who === "ai" ? 5 : 15,
              borderBottomRightRadius: m.who === "user" ? 5 : 15,
              whiteSpace: "pre-wrap",
            }}>{m.text}</div>
          );
        })}
        {typing && (
          <div style={{
            alignSelf: "flex-start", display: "flex", gap: 4, alignItems: "center",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(125,211,252,0.14)",
            borderRadius: radius.md, borderBottomLeftRadius: 5, padding: "13px 15px",
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
        {notice && (
          <div style={{
            alignSelf: "flex-start", maxWidth: "88%", fontSize: fs.caption, lineHeight: 1.55,
            padding: "10px 12px", borderRadius: radius.sm,
            background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.28)",
            color: "#e7d3ad",
          }}>{notice}</div>
        )}
      </div>

      {/* suggested openers — a blank box is the hardest thing to answer */}
      {mode === "live" && msgs.length <= 1 && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", padding: "0 12px 4px" }}>
          {["Table for 2 on Friday at 7", "What's good here?", "Any gluten-free options?"].map(chip => (
            <button
              key={chip}
              type="button"
              onClick={() => { setDraft(chip); inputRef.current?.focus(); }}
              style={{
                padding: "7px 11px", borderRadius: radius.full, cursor: "pointer",
                border: "1px solid rgba(125,211,252,0.22)", background: "rgba(56,189,248,0.06)",
                color: "#c9dcf5", fontSize: fs.micro, fontWeight: 500, fontFamily: "inherit",
              }}
            >{chip}</button>
          ))}
        </div>
      )}

      {/* input */}
      <div style={{ padding: "11px 12px", borderTop: "1px solid rgba(125,211,252,0.14)", background: "rgba(255,255,255,0.02)" }}>
        {mode === "reel" ? (
          // A button, not a div: the whole point is that it can be pressed. The
          // reel's typing animation plays inside it until someone does.
          <button
            type="button"
            onClick={goLive}
            aria-label="Try the concierge yourself"
            style={{
              width: "100%", display: "flex", gap: 8, alignItems: "center", textAlign: "left",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(125,211,252,0.14)",
              borderRadius: radius.sm, padding: "9px 12px", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <span style={{ flex: 1, fontSize: fs.small, color: placeholderColor, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{placeholder}</span>
            <span style={{
              width: 30, height: 30, borderRadius: radius.xs, flexShrink: 0,
              background: "linear-gradient(135deg,#38bdf8,#0ea5e9)",
              display: "grid", placeItems: "center", color: "#04121f",
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>
              </svg>
            </span>
          </button>
        ) : (
          <form
            onSubmit={e => { e.preventDefault(); void send(); }}
            style={{
              display: "flex", gap: 8, alignItems: "center",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(125,211,252,0.22)",
              borderRadius: radius.sm, padding: "9px 12px",
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Ask about a table, the menu…"
              maxLength={600}
              autoComplete="off"
              style={{
                flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
                fontSize: fs.small, color: "#e8f1ff", fontFamily: "inherit", caretColor: "#38bdf8",
              }}
            />
            <button
              type="submit"
              disabled={sending || draft.trim().length === 0}
              aria-label="Send message"
              style={{
                width: 30, height: 30, borderRadius: radius.xs, flexShrink: 0, border: "none",
                background: "linear-gradient(135deg,#38bdf8,#0ea5e9)",
                display: "grid", placeItems: "center", color: "#04121f",
                cursor: sending || draft.trim().length === 0 ? "not-allowed" : "pointer",
                opacity: sending || draft.trim().length === 0 ? 0.5 : 1,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>
              </svg>
            </button>
          </form>
        )}
        <div style={{ marginTop: 8, fontSize: fs.micro, lineHeight: 1.4, color: "#4f627e", textAlign: "center" }}>
          {/* Kept short on purpose: the hero's decorative launcher sits over the
              right end of this row, and a longer line disappears under it. */}
          {mode === "reel"
            ? "Tap to talk to the concierge yourself"
            : "Demo venue · nothing is really booked"}
        </div>
      </div>
    </div>
  );
}

/* ─── particle canvas ───────────────────────────────────── */
/** True on devices where cursor-driven effects make sense. Safe in event handlers only. */
let _fancyPointer: boolean | null = null;
function fancyPointer(): boolean {
  if (_fancyPointer !== null) return _fancyPointer;
  if (typeof window === "undefined") return false;
  _fancyPointer =
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return _fancyPointer;
}

/**
 * Drifting plankton that comes alive near the cursor: particles brighten,
 * lean toward the pointer, and link up into a faint constellation.
 */
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const N = 46;
    const GLOW_R = 150;           // cursor influence radius (px)
    let w = 0, h = 0, dpr = 1, raf = 0;
    const mouse = { x: -9999, y: -9999, active: false };
    const parts = Array.from({ length: N }, () => ({
      x: 0, y: 0,
      r: 0.6 + Math.random() * 1.7,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.16,
      bvx: 0, bvy: 0,             // base drift to relax back to
      a: 0.1 + Math.random() * 0.5,
    }));
    parts.forEach(p => { p.bvx = p.vx; p.bvy = p.vy; });

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

    const onMove = (e: PointerEvent) => {
      if (!fancyPointer()) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = mouse.y >= 0 && mouse.y <= rect.height;
    };
    const onLeave = () => { mouse.active = false; };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);

    const near: number[] = [];
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      near.length = 0;

      for (let i = 0; i < N; i++) {
        const p = parts[i];
        let boost = 0;
        if (mouse.active) {
          const dx = mouse.x - p.x, dy = mouse.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d < GLOW_R && d > 0.001) {
            boost = 1 - d / GLOW_R;
            // gentle pull toward the cursor, like plankton drawn to light
            p.vx += (dx / d) * boost * 0.028;
            p.vy += (dy / d) * boost * 0.028;
            near.push(i);
          }
        }
        // relax back to the base drift so speeds never run away
        p.vx += (p.bvx - p.vx) * 0.015;
        p.vy += (p.bvy - p.vy) * 0.015;
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        const alpha = Math.min(1, p.a + boost * 0.55);
        const radius = p.r * (1 + boost * 1.4);
        if (boost > 0.05) {
          // soft halo — the bioluminescent flare
          ctx.beginPath();
          ctx.fillStyle = `rgba(125,211,252,${(alpha * 0.16).toFixed(3)})`;
          ctx.arc(p.x, p.y, radius * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.fillStyle = `rgba(56,189,248,${alpha.toFixed(3)})`;
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // constellation lines between lit particles near the cursor
      for (let a = 0; a < near.length; a++) {
        for (let b = a + 1; b < near.length; b++) {
          const p1 = parts[near[a]], p2 = parts[near[b]];
          const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          if (d < 80) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(125,211,252,${(0.18 * (1 - d / 80)).toFixed(3)})`;
            ctx.lineWidth = 0.7;
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}
    />
  );
}

/* One long swash rather than a row of identical humps: the repeating sine read
   as a scribble under the word, and sliding the whole thing sideways forever
   kept pulling the eye off the headline. */
const SWASH = "M2 8.4 C 28 5.2, 56 4.8, 84 6.8 C 110 8.7, 138 10.4, 164 8.6 C 178 7.7, 190 7.4, 198 7.8";

/** The accent word, underscored by a stroke that inks itself in and then
    catches the light every few seconds. */
function WaveWord({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ position: "relative", display: "inline-block", fontStyle: "italic", color: "#38bdf8" }}>
      {children}
      <svg
        aria-hidden
        viewBox="0 0 200 14"
        preserveAspectRatio="none"
        style={{
          position: "absolute", left: "0.03em", right: "0.06em", bottom: "-0.11em",
          height: "0.22em", overflow: "visible", pointerEvents: "none", display: "block",
        }}
      >
        <defs>
          {/* Tapered ends: the stroke fades in and out instead of stopping dead
              on the first and last letter. */}
          <linearGradient id="oc-swash" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0" />
            <stop offset="0.07" stopColor="#38bdf8" stopOpacity="0.9" />
            <stop offset="0.5" stopColor="#7dd3fc" stopOpacity="1" />
            <stop offset="0.9" stopColor="#38bdf8" stopOpacity="0.85" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="oc-swash-glow" d={SWASH} fill="none" stroke="url(#oc-swash)" strokeWidth="7" strokeLinecap="round" />
        <path className="oc-swash-line" d={SWASH} pathLength={1} fill="none" stroke="url(#oc-swash)" strokeWidth="2.1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path className="oc-swash-spark" d={SWASH} pathLength={1} fill="none" stroke="#e8f6ff" strokeWidth="2.1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

/** Primary CTA that leans toward the cursor and snaps back on a spring. */
function MagneticLink({ href, className, style, children, onClick }: {
  href: string; className?: string; style?: React.CSSProperties; children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const raf = useRef(0);
  const onMove = (e: React.PointerEvent) => {
    if (!fancyPointer()) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transition = "box-shadow .25s, background .25s";
      el.style.transform = `translate(${(dx * 6).toFixed(1)}px, ${(dy * 5 - 2).toFixed(1)}px)`;
    });
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.style.transition = "transform .6s cubic-bezier(.22,1,.36,1), box-shadow .25s, background .25s";
    el.style.transform = "";
  };
  return (
    <Link ref={ref} href={href} className={className} style={style} onClick={onClick} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </Link>
  );
}

/** Perspective tilt + moving glare for the hero demo, driven by the cursor. */
function TiltDemo({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const onMove = (e: React.PointerEvent) => {
    if (!fancyPointer()) return;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transition = "none";
      el.style.transform = `perspective(950px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 7).toFixed(2)}deg)`;
      const g = glareRef.current;
      if (g) {
        g.style.opacity = "1";
        g.style.background = `radial-gradient(420px circle at ${((px + 0.5) * 100).toFixed(1)}% ${((py + 0.5) * 100).toFixed(1)}%, rgba(186,230,253,0.14), transparent 62%)`;
      }
    });
  };
  const onLeave = () => {
    const el = wrapRef.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.style.transition = "transform .7s cubic-bezier(.22,1,.36,1)";
    el.style.transform = "";
    if (glareRef.current) glareRef.current.style.opacity = "0";
  };
  return (
    <div ref={wrapRef} onPointerMove={onMove} onPointerLeave={onLeave} style={{ position: "relative", zIndex: 1, willChange: "transform" }}>
      {children}
      <div ref={glareRef} aria-hidden style={{
        position: "absolute", inset: 2, borderRadius: radius.lg, pointerEvents: "none",
        opacity: 0, transition: "opacity .45s", zIndex: 4,
      }} />
    </div>
  );
}

/** Animated count-up for the stats row; keeps prefixes/suffixes ("2,400+", "24/7"). */
function CountUp({ value, go }: { value: string; go: boolean }) {
  const [txt, setTxt] = useState(value);
  const doneRef = useRef(false);
  useEffect(() => {
    if (!go || doneRef.current) return;
    doneRef.current = true;
    const m = value.match(/^(\D*)([\d.,]+)(.*)$/);
    if (!m || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const [, pre, num, post] = m;
    const target = parseFloat(num.replace(/,/g, ""));
    const decimals = (num.split(".")[1] ?? "").length;
    const grouped = num.includes(",");
    const t0 = performance.now();
    const DUR = 1500;
    let raf = 0;
    const frame = (t: number) => {
      const p = Math.min(1, (t - t0) / DUR);
      const eased = 1 - Math.pow(2, -10 * p);      // ease-out-expo
      const n = target * (p >= 1 ? 1 : eased);
      const fixed = n.toFixed(decimals);
      const shown = grouped ? Number(fixed).toLocaleString("en-US") : fixed;
      setTxt(`${pre}${shown}${post}`);
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [go, value]);
  return <>{txt}</>;
}

/* ─── main page ─────────────────────────────────────────── */
export default function Home() {
  const scrolled = useScrolled();
  const [menuOpen, setMenuOpen] = useState(false);

  // Play the brand loader as a deliberate interstitial, THEN navigate to the
  // auth route. Without the delay, Next navigates instantly and the landing
  // page (and this overlay with it) unmounts before the animation is seen.
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);
  const navTimer = useRef(0);
  const handleAuthNav = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Let modifier/middle clicks (open in new tab, etc.) behave normally — no overlay.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = e.currentTarget.getAttribute("href");
    if (!href) return;
    setMenuOpen(false);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // let default nav
    e.preventDefault();
    router.prefetch(href);
    setNavigating(true);
    // Match the loader's full draw-in choreography (~3.6s) so the animation
    // completes before the auth route takes over.
    navTimer.current = window.setTimeout(() => router.push(href), 3600);
  };
  useEffect(() => {
    // If the page comes back from bfcache (browser Back after a full-page
    // navigation), the overlay must not stay stuck over the top bar.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setNavigating(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.clearTimeout(navTimer.current);
    };
  }, []);

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
    const el = document.getElementById(id);
    if (!el) return;
    // Lenis owns the scroll on marketing pages — native smooth scrollIntoView
    // gets overwritten by its rAF loop and silently does nothing.
    const lenis = getLenis();
    if (lenis) {
      lenis.scrollTo(el, { offset: -84, duration: 1.3 });
    } else {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="oc-dark-page" style={{ fontFamily: sans, background: "#050d1a", color: "#e8f1ff", lineHeight: 1.5, WebkitFontSmoothing: "antialiased" }}>
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
        .oc-feature>*{position:relative;z-index:1;}
        .oc-feature::after{content:"";position:absolute;inset:0;z-index:0;border-radius:inherit;opacity:0;transition:opacity .35s;pointer-events:none;
          background:radial-gradient(240px circle at var(--mx,50%) var(--my,50%),rgba(56,189,248,0.13),transparent 65%);}
        .oc-feature:hover::after{opacity:1;}
        .oc-btn-primary{position:relative;overflow:hidden;}
        .oc-btn-primary::after{content:"";position:absolute;top:0;bottom:0;left:0;width:55%;pointer-events:none;
          background:linear-gradient(105deg,transparent,rgba(255,255,255,0.5),transparent);
          transform:translateX(-170%) skewX(-18deg);}
        .oc-btn-primary:hover::after{animation:oc-sheen .95s cubic-bezier(.45,0,.2,1);}
        @keyframes oc-sheen{to{transform:translateX(320%) skewX(-18deg);}}
        .oc-btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 40px -6px rgba(56,189,248,0.35);background:#7dd3fc;}
        .oc-swash-line{stroke-dasharray:1;stroke-dashoffset:1;animation:oc-swash-draw 1.15s cubic-bezier(.22,1,.36,1) 1.05s forwards;}
        .oc-swash-glow{opacity:0;filter:blur(5px);animation:oc-swash-lift .8s ease-out 1.7s forwards;}
        .oc-swash-spark{stroke-dasharray:.07 .93;stroke-dashoffset:1;opacity:0;animation:oc-swash-spark 5.4s cubic-bezier(.5,0,.5,1) 2.6s infinite;}
        @keyframes oc-swash-draw{to{stroke-dashoffset:0;}}
        @keyframes oc-swash-lift{to{opacity:.42;}}
        @keyframes oc-swash-spark{0%{stroke-dashoffset:1;opacity:0;}8%{opacity:.85;}42%{stroke-dashoffset:0;opacity:0;}100%{stroke-dashoffset:0;opacity:0;}}
        .oc-ray{position:absolute;top:-20%;height:145%;filter:blur(26px);mix-blend-mode:screen;pointer-events:none;
          background:linear-gradient(180deg,rgba(125,211,252,0.15),rgba(56,189,248,0.045) 55%,transparent);}
        .oc-ray.r1{left:16%;width:170px;animation:oc-ray-sway 15s ease-in-out infinite;}
        .oc-ray.r2{left:40%;width:110px;opacity:.7;animation:oc-ray-sway 21s ease-in-out -7s infinite reverse;}
        .oc-ray.r3{left:63%;width:230px;opacity:.5;animation:oc-ray-sway 26s ease-in-out -13s infinite;}
        @keyframes oc-ray-sway{0%,100%{transform:rotate(12deg) translateX(0);opacity:.5;}50%{transform:rotate(16deg) translateX(48px);opacity:.95;}}
        .oc-btn-ghost:hover{transform:translateY(-2px);background:rgba(255,255,255,0.07);border-color:#38bdf8;}
        .oc-nav-cta:hover{transform:translateY(-1px);background:#7dd3fc;}
        /* fixed, not absolute: tabbing after the page has scrolled must still
           show the link, and an absolute one would be parked off-screen at the
           top of the document. */
        .oc-skip-link{position:fixed;left:16px;top:-64px;z-index:200;padding:12px 20px;border-radius:0 0 12px 12px;
          background:#38bdf8;color:#04121f;font-size:14px;font-weight:700;text-decoration:none;
          transition:top .18s cubic-bezier(.22,1,.36,1);}
        .oc-skip-link:focus{top:0;}
        .oc-nav-link{position:relative;}
        .oc-nav-link::after{content:"";position:absolute;left:0;bottom:-6px;height:2px;width:100%;background:#38bdf8;border-radius:2px;transform:scaleX(0);transform-origin:left;transition:transform 1.4s cubic-bezier(.22,1,.36,1);}
        .oc-nav-link:hover::after{transform:scaleX(1);}
        .oc-feat-link{margin-top:20px;display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#38bdf8;cursor:pointer;}
        .oc-foot-link{display:block;font-size:14px;color:#94a8c4;margin-bottom:13px;text-decoration:none;transition:color .2s;}
        .oc-foot-link:hover{color:#38bdf8;}
        .oc-social-icon{width:36px;height:36px;border-radius:12px;border:1px solid rgba(125,211,252,0.14);display:grid;place-items:center;color:#94a8c4;transition:all .2s;cursor:pointer;}
        .oc-social-icon:hover{color:#38bdf8;border-color:#38bdf8;transform:translateY(-2px);}
        @media(prefers-reduced-motion:reduce){
          .oc-reveal{opacity:1!important;transform:none!important;}.oc-reveal.in{animation:none!important;}
          .oc-ray,.oc-btn-primary::after{animation:none!important;}
          .oc-swash-line{animation:none!important;stroke-dashoffset:0!important;}
          .oc-swash-glow{animation:none!important;opacity:.42!important;}
          .oc-swash-spark{animation:none!important;opacity:0!important;}
        }
      `}</style>

      <StructuredData />

      {/* Off-screen until it takes focus. First Tab on the page offers it, so a
          keyboard or screen-reader user reaches the content without walking the
          whole nav — on every visit. */}
      <a href="#main" className="oc-skip-link">Skip to content</a>

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
              <button key={id} type="button" onClick={() => scrollTo(id)} className="oc-nav-link" style={{
                background: "none", border: 0, fontSize: fs.body, color: "#94a8c4", fontWeight: 500,
                cursor: "pointer", transition: "color .2s", fontFamily: sans, padding: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#e8f1ff")}
              onMouseLeave={e => (e.currentTarget.style.color = "#94a8c4")}
              >{label}</button>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/auth/login" onClick={handleAuthNav} className="oc-get-started" style={{
              fontSize: fs.body, fontWeight: 500, color: "#94a8c4",
              padding: "10px 16px", borderRadius: radius.sm, textDecoration: "none",
              transition: "color .2s",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#e8f1ff")}
            onMouseLeave={e => (e.currentTarget.style.color = "#94a8c4")}
            >Log in</Link>
            <Link href="/auth/signup" onClick={handleAuthNav} className="oc-get-started oc-nav-cta" style={{
              fontSize: fs.body, fontWeight: 700, background: "#38bdf8", color: "#04121f",
              padding: "10px 20px", borderRadius: radius.sm, textDecoration: "none",
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
              fontSize: fs.subhead, padding: "14px 0",
              color: "#e8f1ff", background: "none", border: "none", borderBottom: "1px solid rgba(125,211,252,0.14)", textAlign: "left",
              cursor: "pointer", fontFamily: sans,
            }}>{label}</button>
          ))}
          <Link href="/auth/signup" onClick={handleAuthNav} style={{
            marginTop: 18, display: "flex", justifyContent: "center",
            background: "#38bdf8", color: "#04121f", fontWeight: 700,
            padding: "14px 26px", borderRadius: radius.sm, textDecoration: "none", fontSize: fs.bodyLg,
          }}>Get Started</Link>
        </div>
      )}

      {/* Everything between the nav and the footer. Without a main landmark a
          screen-reader user has no way to jump past the navigation, and the skip
          link above has nothing to aim at. */}
      <main id="main">

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
        {/* god rays — light shafts through water */}
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "hidden" }}>
          <div className="oc-ray r1" />
          <div className="oc-ray r2" />
          <div className="oc-ray r3" />
        </div>
        {/* particle canvas */}
        <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
          <ParticleCanvas />
        </div>
        {/* glow */}
        <div style={{ position: "absolute", width: 680, height: 680, borderRadius: "50%", top: -260, right: -160, zIndex: 0,
          background: "radial-gradient(circle,rgba(56,189,248,0.20),transparent 60%)", filter: "blur(40px)", pointerEvents: "none", willChange: "transform", transform: "translateZ(0)" }} />

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px", position: "relative", zIndex: 2, width: "100%" }}>
          {/* minmax(0,…) rather than a bare 1fr. A grid track's automatic minimum
              is its content's min-content width, so the 370px demo card refused
              to shrink and pushed BOTH columns wider than a phone screen — the
              headline and the paragraph ran off the right edge, hidden only by
              the page's overflow clip. */}
          {/* The demo card is 370px wide and gains nothing from more, while the
              headline needs every pixel: at a proportional split "again." fell
              onto a third line by itself. Capping the right column hands the
              slack to the type. */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,440px)", gap: 56, alignItems: "center" }}
            className="hero-grid">
            <style>{`
              @media(max-width:940px){.hero-grid{grid-template-columns:minmax(0,1fr)!important;gap:48px!important;}}
              .hero-grid>*{min-width:0;}
            `}</style>

            {/* copy */}
            <div>
              <h1 className="oc-reveal in d1" style={{
                fontFamily: serif, fontSize: "clamp(34px,5.4vw,76px)", lineHeight: 1.04,
                fontWeight: 600, margin: 0, letterSpacing: "-0.02em",
              }}>
                Never miss a<br /><WaveWord>reservation</WaveWord> again.
              </h1>

              <p className="oc-reveal in d2" style={{
                marginTop: 26, maxWidth: 480, fontSize: "clamp(16.5px,1.4vw,19px)",
                lineHeight: 1.62, color: "#94a8c4",
              }}>
                OceanCore is the AI concierge that answers every guest, books every table, and remembers every regular — 24 hours a day, while you run your restaurant.
              </p>

              <div className="oc-reveal in d3" style={{ marginTop: 38, display: "flex", flexWrap: "wrap", gap: 14 }}>
                <MagneticLink href="/auth/signup" onClick={handleAuthNav} className="oc-btn-primary" style={{
                  display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 700, fontSize: fs.lead,
                  borderRadius: radius.sm, padding: "17px 34px", border: "1px solid transparent",
                  background: "#38bdf8", color: "#04121f",
                  boxShadow: "0 6px 30px -4px rgba(56,189,248,0.35)",
                  textDecoration: "none", transition: "transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .25s, background .25s",
                  whiteSpace: "nowrap",
                }}>
                  Start Free Trial
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                </MagneticLink>
                <button type="button" onClick={() => scrollTo("demo")} className="oc-btn-ghost" style={{
                  display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 700, fontSize: fs.lead,
                  borderRadius: radius.sm, padding: "17px 34px", border: "1px solid rgba(125,211,252,0.30)",
                  background: "rgba(255,255,255,0.03)", color: "#e8f1ff",
                  transition: "transform .2s cubic-bezier(.34,1.56,.64,1), background .25s, border-color .25s",
                  cursor: "pointer", fontFamily: sans, whiteSpace: "nowrap",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  See it in action
                </button>
              </div>

              {/* The three objections that stop someone clicking, answered before
                  they have to go looking for the pricing section. Each one is
                  true: the trial takes no card, it really is one script tag, and
                  cancelling is a button in settings. */}
              <ul className="oc-reveal in d3" style={{
                marginTop: 30, padding: 0, listStyle: "none",
                display: "flex", flexWrap: "wrap", gap: "10px 24px",
                fontSize: fs.small, fontWeight: 500, color: "#94a8c4",
              }}>
                {["No credit card", "One line of code", "Cancel anytime"].map((item) => (
                  <li key={item} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5"/>
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* chat widget */}
            <div id="demo" className="oc-reveal in d2" style={{ position: "relative", display: "flex", justifyContent: "center" }}>
              <div style={{ position: "absolute", inset: "-10% -6%",
                background: "radial-gradient(circle at 60% 40%,rgba(56,189,248,0.18),transparent 65%)",
                filter: "blur(30px)", zIndex: 0 }} />
              <TiltDemo>
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
              </TiltDemo>
            </div>
          </div>
        </div>
      </section>

      {/* ── VALUE PROPS ── */}
      <section style={{ padding: "64px 0", borderTop: "1px solid rgba(125,211,252,0.14)", borderBottom: "1px solid rgba(125,211,252,0.14)", background: "#07101e" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
          {/* An h2, not a p: the cards under it are h3s, and a heading level
              cannot be skipped without leaving a hole in the outline. Styled
              exactly as before. */}
          <h2 style={{ textAlign: "center", fontSize: fs.caption, letterSpacing: "0.2em", textTransform: "uppercase", color: "#6b7f9c", fontWeight: 600, margin: "0 0 44px" }}>
            Built for how a restaurant actually runs
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 34, maxWidth: 980, margin: "0 auto" }}
            className="vp-grid">
            <style>{`@media(max-width:640px){.vp-grid{grid-template-columns:1fr!important;}}`}</style>
            {[
              { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>, title: "Always answering", desc: "Greets and books guests around the clock — long after the last table is cleared." },
              { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>, title: "Live in minutes", desc: "One line of code. No new hardware, no staff training, no migration." },
              { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, title: "Speaks your voice", desc: "Tuned to your menu, hours, and house style — so every reply sounds like you." },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ textAlign: "center", padding: "0 8px" }}>
                <div style={{ width: 52, height: 52, borderRadius: radius.md, display: "grid", placeItems: "center", margin: "0 auto 18px", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(125,211,252,0.30)", color: "#38bdf8" }}>
                  {icon}
                </div>
                <h3 style={{ fontFamily: serif, fontWeight: 700, fontSize: fs.subhead, marginBottom: 9, margin: "0 0 9px" }}>{title}</h3>
                <p style={{ fontSize: fs.body, color: "#94a8c4", lineHeight: 1.6, maxWidth: 280, margin: "0 auto" }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROBLEM / SOLUTION ── */}
      <section style={{ position: "relative", padding: "120px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ maxWidth: 680 }}>
            <p style={{ fontSize: fs.caption, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#38bdf8", marginBottom: 18 }}>The front-of-house problem</p>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(32px,4vw,48px)", lineHeight: 1.12, margin: 0, fontWeight: 600, letterSpacing: "-0.02em" }}>
              Every missed call is a <span style={{ color: "#38bdf8", fontStyle: "italic" }}>missed cover.</span>
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "stretch", marginTop: 54 }}
            className="ps-grid">
            <style>{`@media(max-width:860px){.ps-grid{grid-template-columns:1fr!important;}}`}</style>
            {/* pain */}
            <div style={{ borderRadius: radius.lg, padding: "36px 34px", border: "1px solid rgba(248,113,113,0.18)", background: "linear-gradient(165deg,rgba(248,113,113,0.06),rgba(248,113,113,0.01))" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: fs.caption, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "6px 13px", borderRadius: radius.full, marginBottom: 22, color: "#fca5a5", background: "rgba(248,113,113,0.1)" }}>
                Without OceanCore
              </span>
              <h3 style={{ fontFamily: serif, fontSize: fs.sectionTitle, marginBottom: 20, margin: "0 0 20px", fontWeight: 600 }}>The phone never stops — and neither do the no-shows.</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  "Calls go to voicemail during the dinner rush, and bookings walk to the restaurant next door.",
                  "Late-night DMs and emails sit unanswered until morning.",
                  "Staff juggle phones instead of guests on the floor.",
                  "Regulars and their preferences live in someone's memory — not a system.",
                ].map(text => (
                  <div key={text} style={{ display: "flex", gap: 13, alignItems: "flex-start", fontSize: fs.bodyLg, lineHeight: 1.5, color: "#94a8c4" }}>
                    <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: radius.xs, display: "grid", placeItems: "center", marginTop: 1, background: "rgba(248,113,113,0.12)", color: "#fca5a5", fontSize: fs.body, fontWeight: 700 }}>✕</span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
            {/* solution */}
            <div style={{ borderRadius: radius.lg, padding: "36px 34px", border: "1px solid rgba(125,211,252,0.30)", background: "linear-gradient(165deg,rgba(56,189,248,0.10),rgba(56,189,248,0.02))" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: fs.caption, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "6px 13px", borderRadius: radius.full, marginBottom: 22, color: "#7dd3fc", background: "rgba(56,189,248,0.12)" }}>
                With OceanCore
              </span>
              <h3 style={{ fontFamily: serif, fontSize: fs.sectionTitle, marginBottom: 20, margin: "0 0 20px", fontWeight: 600 }}>An always-on concierge that turns conversations into covers.</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  "Every guest is greeted and booked in seconds — even at 2am.",
                  "Questions about menu, hours, and dietary needs answered instantly.",
                  "Your team stays on the floor, focused on the experience.",
                  "Every guest remembered automatically in a living CRM.",
                ].map(text => (
                  <div key={text} style={{ display: "flex", gap: 13, alignItems: "flex-start", fontSize: fs.bodyLg, lineHeight: 1.5, color: "#e8f1ff" }}>
                    <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: radius.xs, display: "grid", placeItems: "center", marginTop: 1, background: "rgba(56,189,248,0.14)", color: "#7dd3fc", fontSize: fs.body, fontWeight: 700 }}>✓</span>
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
            <p style={{ fontSize: fs.caption, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#38bdf8", marginBottom: 18 }}>Features</p>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(32px,4.2vw,50px)", lineHeight: 1.12, margin: "0 0 20px", fontWeight: 600, letterSpacing: "-0.02em" }}>
              Built for restaurants that<br /><span style={{ color: "#38bdf8", fontStyle: "italic" }}>refuse to compromise.</span>
            </h2>
            <p style={{ fontSize: fs.leadLg, color: "#94a8c4", lineHeight: 1.6, maxWidth: 520, margin: 0 }}>Three systems working as one — so you delight guests and run service without burning out your team.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22, marginTop: 60 }}
            className="feat-grid">
            <style>{`@media(max-width:860px){.feat-grid{grid-template-columns:1fr!important;max-width:460px;margin-left:auto;margin-right:auto;}}`}</style>
            {FEATURES.map((f, i) => (
              <article key={f.title} className="oc-feature"
                onPointerMove={(e) => {
                  if (!fancyPointer()) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
                  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
                }}
                style={{
                position: "relative", borderRadius: radius.lg, padding: "34px 30px 32px",
                background: "linear-gradient(165deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))",
                border: "1px solid rgba(125,211,252,0.14)", overflow: "hidden",
                transition: "transform .35s cubic-bezier(.34,1.56,.64,1), border-color .3s, box-shadow .35s",
                opacity: featVisible ? 1 : 0,
                transform: featVisible ? "none" : "translateY(26px)",
                transitionDelay: featVisible ? `${i * 0.08}s` : "0s",
              }}>
                <div style={{ width: 54, height: 54, borderRadius: radius.md, display: "grid", placeItems: "center", marginBottom: 22, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(125,211,252,0.30)", color: "#38bdf8" }}>
                  {f.icon}
                </div>
                <h3 style={{ fontFamily: serif, fontSize: fs.cardTitle, margin: "0 0 11px", fontWeight: 600 }}>{f.title}</h3>
                <p style={{ fontSize: fs.body, lineHeight: 1.65, color: "#94a8c4", margin: 0 }}>{f.desc}</p>
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
            <p style={{ fontSize: fs.caption, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#38bdf8", marginBottom: 18 }}>How it works</p>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(32px,4.2vw,50px)", lineHeight: 1.12, margin: "0 0 18px", fontWeight: 600, letterSpacing: "-0.02em" }}>
              Live in three steps,<br /><span style={{ color: "#38bdf8", fontStyle: "italic" }}>not three weeks.</span>
            </h2>
            <p style={{ fontSize: fs.leadLg, color: "#94a8c4", margin: 0 }}>One install, infinite conversations — with you in the loop whenever you want to be.</p>
          </div>
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 30, marginTop: 66 }}
            className="steps-grid">
            <style>{`@media(max-width:860px){.steps-grid{grid-template-columns:1fr!important;max-width:420px;margin-left:auto;margin-right:auto;gap:40px!important;}.steps-line{display:none!important;}}`}</style>
            <div className="steps-line" style={{ position: "absolute", top: 32, left: "16%", right: "16%", height: 1, borderTop: "1px dashed rgba(125,211,252,0.30)", zIndex: 0 }} />
            {[
              { n: "1", title: "Install the widget", body: "Drop one line of code onto your website. OceanCore is live in under 60 seconds.", visual: <div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: fs.caption, color: "#7dd3fc", background: "rgba(4,12,22,0.6)", border: "1px solid rgba(125,211,252,0.14)", borderRadius: radius.xs, padding: "9px 11px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}><span>{"<script src=\"oceancore.js\">"}</span><span style={{ fontFamily: sans, fontSize: fs.micro, color: "#94a8c4" }}>Copy</span></div> },
              { n: "2", title: "Guests book themselves", body: "The AI greets, answers, and reserves — handling questions and special requests 24/7.", visual: <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{[["Booked","Table for 4 · Fri 7:30pm"],["Answered",'"Are you gluten-free friendly?"']].map(([pill,text]) => <div key={pill} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: fs.micro, color: "#94a8c4" }}><span style={{ padding: "2px 8px", borderRadius: radius.xs, background: "rgba(56,189,248,0.12)", color: "#7dd3fc", fontWeight: 600, fontSize: fs.micro }}>{pill}</span>{text}</div>)}</div> },
              { n: "3", title: "You manage everything", body: "Watch conversations live, take over with one click, and see every booking in one calm dashboard.", visual: <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{[["Live","Tonight's bookings, at a glance"],["CRM","Every guest, remembered"]].map(([pill,text]) => <div key={pill} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: fs.micro, color: "#94a8c4" }}><span style={{ padding: "2px 8px", borderRadius: radius.xs, background: "rgba(56,189,248,0.12)", color: "#7dd3fc", fontWeight: 600, fontSize: fs.micro }}>{pill}</span>{text}</div>)}</div> },
            ].map((step, i) => (
              <div key={step.n} style={{
                position: "relative", zIndex: 1, textAlign: "center",
                opacity: howVisible ? 1 : 0,
                transform: howVisible ? "none" : "translateY(26px)",
                transition: "opacity .8s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1)",
                transitionDelay: `${i * 0.08}s`,
              }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 24px", display: "grid", placeItems: "center", fontFamily: serif, fontSize: fs.sectionTitle, fontWeight: 600, color: "#04121f", background: "linear-gradient(140deg,#7dd3fc,#38bdf8)", boxShadow: "0 10px 30px -6px rgba(56,189,248,0.35),0 0 0 6px rgba(56,189,248,0.06)" }}>{step.n}</div>
                <h3 style={{ fontFamily: serif, fontSize: fs.cardTitle, margin: "0 0 11px", fontWeight: 600 }}>{step.title}</h3>
                <p style={{ fontSize: fs.body, lineHeight: 1.6, color: "#94a8c4", maxWidth: 300, margin: "0 auto 22px" }}>{step.body}</p>
                <div style={{ borderRadius: radius.md, border: "1px solid rgba(125,211,252,0.14)", background: "rgba(255,255,255,0.025)", padding: 14, fontSize: fs.caption, textAlign: "left" }}>{step.visual}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" ref={pricingRef as React.RefObject<HTMLElement>} style={{ position: "relative", padding: "120px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ textAlign: "center", maxWidth: 560, margin: "0 auto" }}>
            <p style={{ fontSize: fs.caption, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#38bdf8", marginBottom: 18 }}>Pricing</p>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(32px,4.2vw,50px)", lineHeight: 1.12, margin: "0 0 18px", fontWeight: 600, letterSpacing: "-0.02em" }}>
              One simple plan.<br /><span style={{ color: "#38bdf8", fontStyle: "italic" }}>14 days on us.</span>
            </h2>
            <p style={{ fontSize: fs.leadLg, color: "#94a8c4", margin: 0 }}>Try everything free for 14 days. No credit card required — keep going for one flat monthly price.</p>
          </div>
          <div style={{ maxWidth: 460, margin: "60px auto 0" }}
            className="plans-grid">
            {/* Pro — single plan, 14-day free trial */}
            <div style={{
              position: "relative", borderRadius: radius.lg, padding: "44px 38px 38px",
              border: "1px solid rgba(125,211,252,0.30)", display: "flex", flexDirection: "column",
              background: "linear-gradient(170deg,rgba(56,189,248,0.10),rgba(56,189,248,0.02))",
              boxShadow: "0 0 0 1px rgba(56,189,248,0.12),0 30px 60px -24px rgba(56,189,248,0.25)",
              opacity: pricingVisible ? 1 : 0,
              transform: pricingVisible ? "none" : "translateY(26px)",
              transition: "opacity .8s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1)",
            }}>
              <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: fs.micro, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#04121f", background: "linear-gradient(135deg,#7dd3fc,#38bdf8)", padding: "6px 16px", borderRadius: radius.full, boxShadow: "0 6px 18px -4px rgba(56,189,248,0.35)" }}>
                14-day free trial
              </div>
              <div style={{ fontFamily: serif, fontSize: fs.sectionTitle, fontWeight: 600 }}>OceanCore Pro</div>
              <div style={{ marginTop: 8, fontSize: fs.body, color: "#94a8c4" }}>Everything you need to never miss a cover — one plan, no tiers, no limits.</div>
              <div style={{ marginTop: 24, display: "flex", alignItems: "flex-end", gap: 6 }}>
                <span style={{ fontFamily: serif, fontSize: fs.display, fontWeight: 600, lineHeight: 0.9, color: "#38bdf8" }}>$29</span>
                <span style={{ paddingBottom: 8, fontSize: fs.bodyLg, color: "#6b7f9c" }}>/ month</span>
              </div>
              <div style={{ marginTop: 10, fontSize: fs.small, color: "#7dd3fc", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                Free for 14 days, then $29/month. Cancel anytime.
              </div>
              <div style={{ margin: "28px 0", display: "flex", flexDirection: "column", gap: 13, flex: 1 }}>
                {["Unlimited AI messages","AI Concierge 24/7","Smart reservations & live availability","Full Guest CRM & VIP profiles","Live takeover & team seats","Revenue & performance analytics","1-line website widget","Priority support"].map(f => (
                  <div key={f} style={{ display: "flex", gap: 11, alignItems: "flex-start", fontSize: fs.body, color: "#e8f1ff" }}>
                    <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: radius.xs, display: "grid", placeItems: "center", background: "rgba(56,189,248,0.14)", color: "#7dd3fc", marginTop: 1, fontSize: fs.caption }}>✓</span>
                    {f}
                  </div>
                ))}
              </div>
              <Link href="/auth/signup" onClick={handleAuthNav} className="oc-btn-primary" style={{ display: "flex", justifyContent: "center", alignItems: "center", fontWeight: 700, fontSize: fs.bodyLg, borderRadius: radius.sm, padding: "14px 26px", border: "1px solid transparent", background: "#38bdf8", color: "#04121f", textDecoration: "none", transition: "transform .2s, background .25s, box-shadow .25s", boxShadow: "0 6px 30px -4px rgba(56,189,248,0.35)" }}>
                Start 14-day free trial
              </Link>
              <span style={{ marginTop: 14, textAlign: "center", fontSize: fs.small, color: "#6b7f9c" }}>No credit card required</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section id="customers" ref={statsRef as React.RefObject<HTMLElement>} style={{ padding: "120px 0", background: "#07101e" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
            <p style={{ fontSize: fs.caption, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#38bdf8", marginBottom: 18 }}>The short version</p>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(30px,3.6vw,44px)", lineHeight: 1.12, margin: 0, fontWeight: 600, letterSpacing: "-0.02em" }}>Service that never sleeps</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 22, marginTop: 60 }}
            className="stats-grid">
            <style>{`@media(max-width:760px){.stats-grid{grid-template-columns:repeat(2,1fr)!important;}}`}</style>
            {STATS.map((s, i) => (
              <div key={s.label} style={{
                textAlign: "center", borderRadius: radius.lg, padding: "36px 22px",
                border: "1px solid rgba(125,211,252,0.14)",
                background: "linear-gradient(165deg,rgba(255,255,255,.045),rgba(255,255,255,.012))",
                opacity: statsVisible ? 1 : 0,
                transform: statsVisible ? "none" : "translateY(26px)",
                transition: "opacity .8s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1)",
                transitionDelay: `${i * 0.08}s`,
              }}>
                <div style={{ fontFamily: serif, fontSize: "clamp(34px,3.4vw,48px)", fontWeight: 600, color: "#38bdf8", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  <CountUp value={s.value} go={statsVisible} />
                </div>
                <div style={{ marginTop: 12, fontSize: fs.body, color: "#94a8c4" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" ref={faqRef as React.RefObject<HTMLElement>} style={{ position: "relative", padding: "120px 0" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
            <p style={{ fontSize: fs.caption, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#38bdf8", marginBottom: 18 }}>FAQ</p>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(30px,3.6vw,44px)", lineHeight: 1.12, margin: 0, fontWeight: 600, letterSpacing: "-0.02em" }}>Questions, answered</h2>
          </div>
          <div style={{ marginTop: 54, display: "flex", flexDirection: "column", gap: 14 }}>
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q} style={{
                  borderRadius: radius.md, overflow: "hidden",
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
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-trigger-${i}`}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                      padding: "20px 24px", background: "none", border: 0, cursor: "pointer",
                      fontFamily: sans, textAlign: "left",
                      fontSize: fs.lead, fontWeight: 600, color: "#e8f1ff",
                    }}
                  >
                    {f.q}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ flexShrink: 0, transition: "transform .3s cubic-bezier(.22,1,.36,1)", transform: open ? "rotate(180deg)" : "none" }}>
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </button>
                  {/* The 0fr → 1fr grid animation only hides the answer visually.
                      A screen reader read all six aloud whichever one was open,
                      which is the opposite of what an accordion is for. The
                      visibility flip takes it out of the a11y tree and the tab
                      order, delayed so it does not cut the closing animation. */}
                  <div
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`faq-trigger-${i}`}
                    style={{
                      display: "grid",
                      gridTemplateRows: open ? "1fr" : "0fr",
                      visibility: open ? "visible" : "hidden",
                      transition: open
                        ? "grid-template-rows .35s cubic-bezier(.22,1,.36,1), visibility 0s"
                        : "grid-template-rows .35s cubic-bezier(.22,1,.36,1), visibility 0s .35s",
                    }}
                  >
                    <div style={{ overflow: "hidden" }}>
                      <p style={{ margin: 0, padding: "0 24px 22px", fontSize: fs.bodyLg, lineHeight: 1.65, color: "#94a8c4" }}>{f.a}</p>
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
          <div style={{ position: "relative", borderRadius: radius.xl, overflow: "hidden", padding: "84px 40px", textAlign: "center",
            background: "radial-gradient(120% 130% at 50% -10%,rgba(56,189,248,0.22),transparent 55%),linear-gradient(165deg,#0c2236,#071426)",
            border: "1px solid rgba(125,211,252,0.30)", boxShadow: "0 40px 90px -30px rgba(0,0,0,0.7)" }}>
            <div style={{ position: "absolute", width: 420, height: 420, borderRadius: "50%", top: -200, left: "50%", transform: "translateX(-50%)", background: "radial-gradient(circle,rgba(56,189,248,0.25),transparent 60%)", filter: "blur(30px)" }} />
            <h2 style={{ position: "relative", fontFamily: serif, fontSize: "clamp(34px,4.6vw,56px)", lineHeight: 1.08, maxWidth: 680, margin: "0 auto", fontWeight: 600, letterSpacing: "-0.02em" }}>
              Your tables are waiting.<br />Let&apos;s fill them.
            </h2>
            <p style={{ position: "relative", margin: "22px auto 36px", fontSize: fs.subhead, color: "#94a8c4", maxWidth: 480 }}>
              Set it up in an afternoon and let it work the phones for you.
            </p>
            <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <Link href="/auth/signup" onClick={handleAuthNav} className="oc-btn-primary" style={{
                display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 700, fontSize: fs.lead,
                borderRadius: radius.sm, padding: "17px 34px", border: "1px solid transparent",
                background: "#38bdf8", color: "#04121f",
                boxShadow: "0 6px 30px -4px rgba(56,189,248,0.35)",
                textDecoration: "none", transition: "transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .25s, background .25s",
              }}>
                Start Free Trial
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </Link>
              <span style={{ fontSize: fs.small, color: "#6b7f9c", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                14-day free trial · No credit card · Live in 60 seconds
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      </main>

      <footer style={{ padding: "72px 0 40px", borderTop: "1px solid rgba(125,211,252,0.14)", background: "#040810" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr", gap: 40 }}
            className="foot-grid">
            <style>{`
              @media(max-width:1000px){.foot-grid{grid-template-columns:1.4fr 1fr 1fr!important;gap:36px!important;}}
              @media(max-width:760px){.foot-grid{grid-template-columns:1fr 1fr!important;gap:34px!important;}}
            `}</style>
            <div style={{ maxWidth: 300 }}>
              <a href="#top" style={{ textDecoration: "none" }}>
                <BrandMark navHeight={52} />
              </a>
              <p style={{ marginTop: 16, fontSize: fs.body, color: "#94a8c4", lineHeight: 1.6 }}>
                The AI concierge that answers, books, and remembers — so every restaurant runs front-of-house like a Michelin team.
              </p>
            </div>
            {[
              { heading: "Product", links: [["Features","#features"],["How it works","#how"],["Pricing","#pricing"],["Live demo","#demo"]] },
              { heading: "Company", links: [["FAQ","#faq"],["Contact","mailto:hello@oceancore.ai"]] },
              // Legal has to be reachable from the footer: Stripe checks for it
              // before enabling live payments, and "Get started" used to point at
              // /onboarding, which just bounces a stranger to the login form.
              { heading: "Get started", links: [["Create an account","/auth/signup"],["Sign in","/auth/login"]] },
              { heading: "Legal", links: [["Privacy Policy","/privacy"],["Terms of Service","/terms"]] },
            ].map(col => (
              <div key={col.heading}>
                <h4 style={{ fontSize: fs.caption, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b7f9c", marginBottom: 18, fontWeight: 700, margin: "0 0 18px" }}>{col.heading}</h4>
                {col.links.map(([label, href]) => (
                  // On-page anchors and mailto stay plain <a>; a real route goes
                  // through Link so it is prefetched instead of reloading the app.
                  href.startsWith("/") ? (
                    <Link key={label} href={href} className="oc-foot-link">{label}</Link>
                  ) : (
                    <a key={label} href={href} className="oc-foot-link">{label}</a>
                  )
                ))}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 54, paddingTop: 28, borderTop: "1px solid rgba(125,211,252,0.14)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, color: "#6b7f9c", fontSize: fs.small }}>
            <span>© {new Date().getFullYear()} OceanCore, Inc. All rights reserved.</span>
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

      {navigating && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          animation: "oc-loader-in .25s ease both",
        }}>
          <style>{"@keyframes oc-loader-in{from{opacity:0}to{opacity:1}}"}</style>
          <OceanCoreLoader />
        </div>
      )}
    </div>
  );
}
