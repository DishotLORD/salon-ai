"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import * as THREE from "three";

// ——— Styles: Playfair via --font-playfair, Inter via --font-inter from layout ———

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** 3.5s whale arc; waves + Three particles run forever */
function useHeroOcean(
  threeMountRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
) {
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const mount = threeMountRef.current;
    if (!mount) return;

    let width = mount.clientWidth;
    let height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      width / -2,
      width / 2,
      height / 2,
      height / -2,
      0.1,
      1000,
    );
    camera.position.z = 100;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const count = 120;
    const positions = new Float32Array(count * 3);
    const velocities: { vx: number; vy: number }[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * width;
      positions[i * 3 + 1] = (Math.random() - 0.5) * height;
      positions[i * 3 + 2] = 0;
      velocities.push({
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.12,
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    const material = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 2,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: false,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    let threeRaf = 0;
    const renderThree = () => {
      threeRaf = requestAnimationFrame(renderThree);
      const pos = geometry.attributes.position.array as Float32Array;
      const hw = width / 2;
      const hh = height / 2;
      for (let i = 0; i < count; i++) {
        const vx = velocities[i].vx;
        const vy = velocities[i].vy;
        pos[i * 3] += vx;
        pos[i * 3 + 1] += vy;
        if (pos[i * 3] > hw + 40) pos[i * 3] = -hw - 40;
        if (pos[i * 3] < -hw - 40) pos[i * 3] = hw + 40;
        if (pos[i * 3 + 1] > hh + 40) pos[i * 3 + 1] = -hh - 40;
        if (pos[i * 3 + 1] < -hh - 40) pos[i * 3 + 1] = hh + 40;
      }
      geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
    };
    renderThree();

    const onResize = () => {
      width = mount.clientWidth;
      height = mount.clientHeight;
      camera.left = width / -2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = height / -2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(threeRaf);
      ro.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [threeMountRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let waveRaf = 0;

    const waveLayers = [
      { amp: 78, freq: 0.004, speed: 0.022, y0: 0.42, alpha: 0.12 },
      { amp: 64, freq: 0.0055, speed: 0.028, y0: 0.48, alpha: 0.1 },
      { amp: 52, freq: 0.0068, speed: 0.019, y0: 0.54, alpha: 0.09 },
      { amp: 44, freq: 0.008, speed: 0.024, y0: 0.6, alpha: 0.08 },
      { amp: 36, freq: 0.0095, speed: 0.03, y0: 0.65, alpha: 0.07 },
      { amp: 28, freq: 0.011, speed: 0.026, y0: 0.7, alpha: 0.055 },
      { amp: 22, freq: 0.013, speed: 0.021, y0: 0.74, alpha: 0.045 },
      { amp: 20, freq: 0.015, speed: 0.034, y0: 0.78, alpha: 0.04 },
    ];
    let wavePhase = 0;

    const spray: { x: number; y: number; vx: number; vy: number; born: number }[] =
      [];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio, 2);
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const drawWhale = (
      tSec: number,
      cx: number,
      cy: number,
      bodyRot: number,
      tailExtra: number,
    ) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(bodyRot);

      ctx.fillStyle = "#0a2540";
      ctx.beginPath();
      ctx.ellipse(0, 0, 90, 42, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-75, -15);
      ctx.bezierCurveTo(-130, -55, -145, 10, -95, 25);
      ctx.bezierCurveTo(-115, 40, -100, 60, -70, 40);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(20, -20);
      ctx.bezierCurveTo(55, -50, 85, -30, 75, 5);
      ctx.bezierCurveTo(65, 25, 35, 15, 20, -8);
      ctx.fill();

      ctx.save();
      ctx.translate(-105, 8);
      ctx.rotate(-0.55 + tailExtra);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-48, -35);
      ctx.lineTo(-35, 10);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-45, 32);
      ctx.lineTo(-28, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(55, -12, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    const loop = (now: number) => {
      waveRaf = requestAnimationFrame(loop);
      if (startRef.current === null) startRef.current = now;
      const tSec = (now - startRef.current) / 1000;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "#050d1a");
      grad.addColorStop(1, "#0a1628");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      wavePhase += 0.016;

      waveLayers.forEach((w) => {
        ctx.beginPath();
        const baseY = w.y0 * height;
        for (let x = 0; x <= width + 4; x += 3) {
          const y =
            baseY +
            Math.sin(x * w.freq + wavePhase * w.speed * 40) * w.amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height + 2);
        ctx.lineTo(-2, height + 2);
        ctx.closePath();
        ctx.fillStyle = `rgba(56,189,248,${w.alpha})`;
        ctx.fill();
      });

      if (tSec >= 1.5 && tSec < 2 && spray.length === 0) {
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + 0.4;
          spray.push({
            x: width * 0.54,
            y: height * 0.3 - 14,
            vx: Math.cos(angle) * 2.8,
            vy: Math.sin(angle) * 2.2 - 1.2,
            born: now,
          });
        }
      }

      for (let i = spray.length - 1; i >= 0; i--) {
        const p = spray[i];
        const age = (now - p.born) / 500;
        if (age > 1) {
          spray.splice(i, 1);
          continue;
        }
        p.x += p.vx;
        p.y += p.vy;
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = "rgba(56,189,248,0.9)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (tSec < 3.5) {
        let cx = width * 0.6;
        let cy = height * 1.18;
        let rot = 0;
        let tailExtra = 0;

        if (tSec < 1) {
          const p = easeOutCubic(tSec);
          cy = height * (1.18 - p * 0.88);
          cx = width * (0.6 - p * 0.06);
          rot = p * 0.25;
        } else if (tSec < 1.5) {
          const p = easeOutCubic((tSec - 1) / 0.5);
          cy = height * 0.3;
          cx = width * 0.54;
          rot = 0.25 + p * (0.35 - 0.25);
        } else if (tSec < 2) {
          cy = height * 0.3;
          cx = width * 0.54;
          rot = 0.35;
        } else {
          const p = easeOutCubic((tSec - 2) / 1.5);
          cy = height * (0.3 + p * 1.05);
          cx = width * (0.54 + p * p * 0.12);
          rot = 0.35 - p * 1.1;
          tailExtra = p * p * 0.9;
        }

        drawWhale(tSec, cx, cy, rot, tailExtra);
      }
    };
    waveRaf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(waveRaf);
      ro.disconnect();
      startRef.current = null;
    };
  }, [canvasRef]);
}

function useReveal(ref: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && e.intersectionRatio >= 0.12) {
          setVisible(true);
        }
      },
      { threshold: [0, 0.12, 0.25, 0.5] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return visible;
}

function useCountUp(
  targets: readonly [number, number, number],
  durationMs: number,
  enabled: boolean,
) {
  const [values, setValues] = useState<number[]>(() =>
    targets.map(() => 0),
  );

  useEffect(() => {
    if (!enabled) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const e = easeOutCubic(t);
      setValues(targets.map((target) => Math.round(target * e)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, durationMs, targets]);

  return values;
}

const STAT_TARGETS = [340, 48000, 98] as const;

const featureCards = [
  {
    icon: "🤖",
    title: "AI Concierge 24/7",
    body: "Answers every guest question and handles reservations around the clock. Even at 2am.",
    tone: "bg-sky-100 text-sky-600",
  },
  {
    icon: "📅",
    title: "Smart Reservations",
    body: "Guests book through natural conversation. Party size, time, special requests — handled automatically.",
    tone: "bg-sky-100 text-sky-600",
  },
  {
    icon: "👥",
    title: "Guest CRM",
    body: "Every guest remembered. VIP profiles, spending history, preferences — all built automatically.",
    tone: "bg-emerald-100 text-emerald-600",
  },
  {
    icon: "💬",
    title: "Live Take Over",
    body: "Monitor every AI conversation in real time. Jump in with one click whenever you want.",
    tone: "bg-violet-100 text-violet-600",
  },
  {
    icon: "📊",
    title: "Revenue Analytics",
    body: "Real-time dashboard showing revenue, bookings, AI performance, and guest satisfaction scores.",
    tone: "bg-amber-100 text-amber-600",
  },
  {
    icon: "🔌",
    title: "1-Line Install",
    body: "Copy one script tag into your website. OceanCore is live in under 60 seconds.",
    tone: "bg-sky-100 text-sky-600",
  },
] as const;

const testimonials = [
  {
    quote:
      "OceanCore handles 90% of our reservation calls. Our staff finally focuses on guests, not phones.",
    name: "Marco Chen",
    role: "Coastal Bistro Miami",
  },
  {
    quote:
      "Guest satisfaction went from 4.2 to 4.9 stars in two months. The AI is genuinely impressive.",
    name: "Sofia Rodriguez",
    role: "The Pearl Restaurant",
  },
  {
    quote:
      "Setup took 10 minutes. Now I have a complete CRM, AI concierge, and analytics. For $99 a month.",
    name: "James Kim",
    role: "Azure Kitchen",
  },
] as const;

export default function Home() {
  const threeMountRef = useRef<HTMLDivElement>(null);
  const whaleCanvasRef = useRef<HTMLCanvasElement>(null);
  useHeroOcean(threeMountRef, whaleCanvasRef);

  const previewRef = useRef<HTMLDivElement>(null);
  const previewVisible = useReveal(previewRef);
  const featuresRef = useRef<HTMLElement>(null);
  const featuresVisible = useReveal(featuresRef);
  const howRef = useRef<HTMLElement>(null);
  const howVisible = useReveal(howRef);
  const testimonialRef = useRef<HTMLElement>(null);
  const testimonialVisible = useReveal(testimonialRef);
  const pricingRef = useRef<HTMLElement>(null);
  const pricingVisible = useReveal(pricingRef);
  const ctaRef = useRef<HTMLElement>(null);
  const ctaVisible = useReveal(ctaRef);

  const [heroMounted, setHeroMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setHeroMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const statValues = useCountUp(STAT_TARGETS, 2200, heroMounted);

  const scrollToId = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div
      className="min-h-screen bg-white text-[#0f172a]"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      {/* ——— NAV ——— */}
      <header
        className="fixed left-0 right-0 top-0 z-50 flex h-[68px] items-center border-b border-[rgba(14,165,233,0.1)] bg-white/90 px-6 backdrop-blur-[20px] md:px-10"
        style={{ WebkitBackdropFilter: "blur(20px)" }}
      >
        <Link href="/" className="flex flex-col gap-0.5">
          <span
            className="text-[1.15rem] font-semibold leading-none tracking-tight"
            style={{ fontFamily: "var(--font-playfair), serif" }}
          >
            <span className="text-[#0ea5e9]">Ocean</span>
            <span className="text-[#0f172a]">Core</span>
          </span>
          <span
            className="text-[9px] uppercase tracking-[3px] text-[#94a3b8]"
            style={{ fontFamily: "var(--font-playfair), serif" }}
          >
            AI CONCIERGE PLATFORM
          </span>
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-10 md:flex">
          {[
            ["Features", "features"],
            ["How it works", "how"],
            ["Pricing", "pricing"],
          ].map(([label, id]) => (
            <button
              key={id}
              type="button"
              onClick={() => scrollToId(id)}
              className="text-[14px] text-[#64748b] transition-colors hover:text-[#0f172a]"
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="ml-auto">
          <Link
            href="/onboarding"
            className="inline-block rounded-[9px] bg-[#0ea5e9] px-[22px] py-[9px] text-[14px] font-semibold text-white shadow-none transition hover:-translate-y-px hover:bg-[#0284c7]"
            style={{ boxShadow: "0 6px 20px rgba(14,165,233,0.25)" }}
          >
            Start Free Trial
          </Link>
        </div>
      </header>

      {/* ——— HERO ——— */}
      <section className="relative h-[100vh] min-h-[520px] overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[#050d1a] to-[#0a1628]" />
        <div
          ref={threeMountRef}
          className="pointer-events-none absolute inset-0 z-[1]"
        />
        <canvas
          ref={whaleCanvasRef}
          className="pointer-events-none absolute inset-0 z-[2] h-full w-full"
          aria-hidden
        />

        <div className="relative z-10 flex h-full flex-col items-center justify-center px-5 pt-[68px] text-center md:px-10">
          <div
            style={
              heroMounted
                ? { animation: "fadeUp 0.6s ease forwards", opacity: 0 }
                : { opacity: 0 }
            }
          >
            <span
              className="inline-flex items-center gap-1.5 rounded-[20px] border border-[rgba(14,165,233,0.2)] px-4 py-1.5 text-[12px] text-[#0ea5e9]"
              style={{ background: "rgba(14,165,233,0.08)" }}
            >
              <span className="text-[10px]">●</span> AI-Powered · Now Live
            </span>
          </div>

          <h1
            className="mt-6 max-w-[800px] px-2"
            style={{
              fontFamily: "var(--font-playfair), serif",
              fontSize: "clamp(44px, 6vw, 80px)",
              fontWeight: 700,
              lineHeight: 1.1,
              animation: heroMounted ? "fadeUp 0.7s ease 0.15s forwards" : "none",
              opacity: heroMounted ? undefined : 0,
            }}
          >
            <span className="block text-white">Your Restaurant&apos;s</span>
            <span className="block italic text-[#38bdf8]">AI Concierge</span>
            <span className="block text-white">Never Sleeps</span>
          </h1>

          <p
            className="mx-auto mt-6 max-w-[520px] text-[18px] leading-[1.7] text-[rgba(255,255,255,0.7)]"
            style={{
              animation: heroMounted ? "fadeUp 0.7s ease 0.25s forwards" : "none",
              opacity: heroMounted ? undefined : 0,
            }}
          >
            Handle reservations, answer every guest question, and grow revenue —
            automatically, 24 hours a day.
          </p>

          <div
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
            style={{
              animation: heroMounted ? "fadeUp 0.7s ease 0.35s forwards" : "none",
              opacity: heroMounted ? undefined : 0,
            }}
          >
            <Link
              href="/onboarding"
              className="rounded-[10px] bg-[#38bdf8] px-8 py-3.5 text-[15px] font-bold text-[#050d1a] transition will-change-transform hover:-translate-y-0.5 hover:scale-[1.02]"
              style={{ boxShadow: "0 4px 24px rgba(56,189,248,0.4)" }}
            >
              Start Free Trial →
            </Link>
            <button
              type="button"
              onClick={() => scrollToId("preview")}
              className="rounded-[10px] border border-[rgba(255,255,255,0.25)] px-8 py-3.5 text-[15px] font-semibold text-white transition hover:border-[rgba(255,255,255,0.45)] hover:bg-[rgba(255,255,255,0.08)]"
            >
              Watch Demo
            </button>
          </div>

          <div
            className="mt-12 flex flex-wrap items-center justify-center gap-6 md:gap-10"
            style={{
              animation: heroMounted ? "fadeUp 0.7s ease 0.45s forwards" : "none",
              opacity: heroMounted ? undefined : 0,
            }}
          >
            {(
              [
                { v: statValues[0], label: "Restaurants", fmt: (n: number) => `${n}+` },
                {
                  v: statValues[1],
                  label: "Reservations",
                  fmt: (n: number) => `${n.toLocaleString()}+`,
                },
                { v: statValues[2], label: "Satisfaction", fmt: (n: number) => `${n}%` },
              ] as const
            ).map((row, i) => (
              <div key={row.label} className="flex items-center gap-6 md:gap-10">
                {i > 0 ? (
                  <div className="hidden h-10 w-px bg-[rgba(255,255,255,0.15)] md:block" />
                ) : null}
                <div className="text-center">
                  <div
                    className="text-[28px] text-white"
                    style={{ fontFamily: "var(--font-playfair), serif" }}
                  >
                    {row.fmt(row.v)}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-wider text-[rgba(255,255,255,0.5)]">
                    {row.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-[rgba(255,255,255,0.4)]">
          <span className="text-xs uppercase tracking-widest">scroll</span>
          <span className="animate-bounce text-lg">↓</span>
        </div>
      </section>

      {/* ——— DASHBOARD PREVIEW ——— */}
      <section
        ref={previewRef}
        id="preview"
        className="bg-white px-6 pb-0 pt-16 md:px-[80px] md:pt-20"
      >
        <p className="mb-4 text-center text-[11px] uppercase tracking-[3px] text-[#0ea5e9]">
          PLATFORM PREVIEW
        </p>
        <h2
          className={`reveal mx-auto max-w-3xl text-center text-[42px] text-[#0f172a] ${
            previewVisible ? "visible" : ""
          }`}
          style={{ fontFamily: "var(--font-playfair), serif" }}
        >
          Everything in one place
        </h2>

        <div
          className="mx-auto mt-12 max-w-[1100px] origin-top [transform-style:preserve-3d]"
          style={{
            perspective: "1200px",
            transform: `perspective(1200px) rotateX(${previewVisible ? 0 : 8}deg)`,
            transition: "transform 0.6s ease",
            borderRadius: "16px 16px 0 0",
            boxShadow:
              "0 -20px 60px rgba(14,165,233,0.12), 0 40px 80px rgba(0,0,0,0.15)",
          }}
        >
          <div
            className="flex h-11 items-center border-b border-[#e2e8f0] bg-[#f8fafc] px-4"
            style={{ borderRadius: "16px 16px 0 0" }}
          >
            <div className="flex gap-2">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#ffbd2e]" />
              <span className="size-3 rounded-full bg-[#28c940]" />
            </div>
            <div className="mx-auto flex max-w-[70%] flex-1 justify-center px-6">
              <div
                className="w-full truncate rounded-md border border-[#e2e8f0] bg-white px-3 py-1.5 text-center text-[12px] text-[#64748b]"
                title="salon-ai-eta.vercel.app/dashboard"
              >
                salon-ai-eta.vercel.app/dashboard
              </div>
            </div>
          </div>

          <div className="flex h-[400px] overflow-hidden bg-[#050d1a] text-left text-white">
            <aside className="flex w-[200px] shrink-0 flex-col gap-1 border-r border-white/10 bg-[#061525] px-3 py-4">
              <div
                className="mb-3 text-sm font-semibold text-sky-300"
                style={{ fontFamily: "var(--font-playfair), serif" }}
              >
                Ocean<span className="text-white">Core</span>
              </div>
              {["Dashboard", "Bookings", "Chats", "CRM", "Settings"].map(
                (item, i) => (
                  <div
                    key={item}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] ${
                      i === 0
                        ? "bg-sky-500/15 text-sky-200"
                        : "text-slate-400"
                    }`}
                  >
                    <span className="opacity-70">
                      {["◉", "◎", "◇", "◆", "▹"][i]}
                    </span>
                    {item}
                  </div>
                ),
              )}
            </aside>
            <div className="min-w-0 flex-1 p-4">
              <div className="grid grid-cols-3 gap-2">
                {["Bookings", "Guests", "AI Chats"].map((t) => (
                  <div
                    key={t}
                    className="rounded-lg border border-white/10 bg-white/5 p-2"
                  >
                    <div className="text-[10px] text-slate-400">{t}</div>
                    <div
                      className="mt-1 text-lg font-semibold"
                      style={{ fontFamily: "var(--font-playfair), serif" }}
                    >
                      {t === "Bookings"
                        ? "128"
                        : t === "Guests"
                          ? "2.4k"
                          : "1.9k"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="h-36 rounded-lg border border-white/10 bg-white/5 p-2">
                  <div className="text-[10px] text-slate-400">
                    Live conversations
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {[1, 2, 3].map((k) => (
                      <div
                        key={k}
                        className="h-2 w-full rounded bg-sky-500/25"
                        style={{ width: `${88 - k * 14}%` }}
                      />
                    ))}
                  </div>
                </div>
                <div className="h-36 rounded-lg border border-white/10 bg-white/5 p-2">
                  <div className="text-[10px] text-slate-400">
                    Today&apos;s reservations
                  </div>
                  <div className="mt-2 space-y-2">
                    {[1, 2].map((k) => (
                      <div
                        key={k}
                        className="rounded border border-white/10 bg-black/20 p-1.5 text-[9px] text-slate-300"
                      >
                        Party {2 + k} · 7:{10 + k * 5}pm
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ——— FEATURES ——— */}
      <section
        ref={featuresRef}
        id="features"
        className="bg-white px-6 py-24 md:px-[80px] md:py-[100px]"
      >
        <p className="text-[11px] uppercase tracking-widest text-[#0ea5e9]">
          FEATURES
        </p>
        <h2
          className={`reveal mt-2 max-w-3xl text-[48px] leading-[1.15] text-[#0f172a] ${
            featuresVisible ? "visible" : ""
          }`}
          style={{ fontFamily: "var(--font-playfair), serif" }}
        >
          Built for restaurants that
          <br />
          <span className="italic text-[#0ea5e9]">refuse to compromise</span>
        </h2>
        <p className="mt-4 max-w-[500px] text-[17px] text-[#64748b]">
          Everything you need to delight guests and run service without burning
          out your team.
        </p>

        <div className="mt-[60px] grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featureCards.map((card, i) => (
            <article
              key={card.title}
              className={`reveal group rounded-[20px] border border-[rgba(14,165,233,0.15)] bg-[rgba(255,255,255,0.7)] p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-[20px] transition [transform-style:preserve-3d] hover:-translate-y-1.5 hover:border-[rgba(14,165,233,0.35)] hover:bg-[rgba(255,255,255,0.9)] hover:shadow-[0_20px_40px_rgba(14,165,233,0.12)] hover:[transform:translateY(-6px)_rotateX(2deg)_rotateY(1deg)] ${featuresVisible ? "visible" : ""}`}
              style={{
                transitionProperty: "transform, box-shadow, border-color, background",
                transitionDuration: "0.3s",
                transitionTimingFunction:
                  "cubic-bezier(0.34, 1.56, 0.64, 1)",
                transitionDelay: featuresVisible ? `${i * 100}ms` : "0ms",
              }}
            >
              <div
                className={`mb-5 inline-flex size-[52px] items-center justify-center rounded-[14px] p-3.5 ${card.tone}`}
              >
                <span className="text-xl">{card.icon}</span>
              </div>
              <h3
                className="text-lg font-semibold text-[#0f172a]"
                style={{ fontFamily: "var(--font-playfair), serif" }}
              >
                {card.title}
              </h3>
              <p className="mt-2 text-[14px] leading-[1.7] text-[#64748b]">
                {card.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ——— HOW IT WORKS ——— */}
      <section
        ref={howRef}
        id="how"
        className="px-6 py-24 text-center md:px-[80px] md:py-[100px]"
        style={{
          background:
            "linear-gradient(180deg, #f8fafc 0%, #f0f9ff 100%)",
        }}
      >
        <p className="text-[11px] uppercase tracking-widest text-[#0ea5e9]">
          HOW IT WORKS
        </p>
        <h2
          className={`reveal mx-auto mt-2 max-w-3xl text-[48px] leading-[1.15] text-[#0f172a] ${
            howVisible ? "visible" : ""
          }`}
          style={{ fontFamily: "var(--font-playfair), serif" }}
        >
          Three steps to
          <br />
          <span className="italic text-[#0ea5e9]">an always-on dining room</span>
        </h2>
        <p className="mx-auto mt-4 max-w-[500px] text-[17px] text-[#64748b]">
          One install, infinite conversations — with you in the loop whenever
          you want to be.
        </p>

        <div className="relative mx-auto mt-[60px] grid max-w-5xl gap-10 md:grid-cols-3 md:gap-6">
          <div
            className="pointer-events-none absolute left-[16%] right-[16%] top-8 hidden border-t-2 border-dashed border-[rgba(14,165,233,0.25)] md:block"
            aria-hidden
          />
          {[
            {
              n: "1",
              title: "Install the widget",
              body: "One script tag on your website. Done.",
            },
            {
              n: "2",
              title: "AI handles guests",
              body: "Reservations, questions, requests — 24/7.",
            },
            {
              n: "3",
              title: "You stay in control",
              body: "Monitor, takeover, or let it run fully autonomous.",
            },
          ].map((step) => (
            <div key={step.n} className="relative z-[1] px-2">
              <div
                className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-[#38bdf8] to-[#0ea5e9] text-2xl font-bold text-white shadow-[0_8px_24px_rgba(56,189,248,0.35)]"
                style={{ fontFamily: "var(--font-playfair), serif" }}
              >
                {step.n}
              </div>
              <h3
                className={`reveal text-lg text-[#0f172a] ${
                  howVisible ? "visible" : ""
                }`}
                style={{ fontFamily: "var(--font-playfair), serif" }}
              >
                {step.title}
              </h3>
              <p className="mt-2 text-[14px] leading-[1.65] text-[#64748b]">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ——— TESTIMONIALS ——— */}
      <section
        ref={testimonialRef}
        className="bg-white px-6 py-24 md:px-[80px] md:py-[100px]"
      >
        <p className="text-center text-[11px] uppercase tracking-widest text-[#0ea5e9]">
          TESTIMONIALS
        </p>
        <div className="mx-auto mt-12 grid max-w-6xl gap-5 md:grid-cols-3">
          {testimonials.map((t, idx) => (
            <article
              key={t.name}
              className={`reveal rounded-[20px] border border-[rgba(14,165,233,0.15)] bg-[rgba(255,255,255,0.7)] p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-[20px] ${
                testimonialVisible ? "visible" : ""
              }`}
              style={{
                transitionDelay: testimonialVisible ? `${idx * 100}ms` : "0ms",
              }}
            >
              <div className="mb-4 text-[#f59e0b]">★★★★★</div>
              <p className="text-[15px] italic leading-[1.8] text-[#374151]">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="mt-6 flex items-center gap-3">
                <div className="size-10 shrink-0 rounded-full bg-gradient-to-br from-sky-300 to-sky-600" />
                <div>
                  <div className="text-sm font-medium text-[#0f172a]">
                    {t.name}
                  </div>
                  <div className="text-xs text-[#64748b]">{t.role}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ——— PRICING ——— */}
      <section
        ref={pricingRef}
        id="pricing"
        className="px-6 py-24 md:px-[80px] md:py-[100px]"
        style={{
          background:
            "linear-gradient(180deg, #f0f9ff 0%, #ffffff 100%)",
        }}
      >
        <p className="text-center text-[11px] uppercase tracking-widest text-[#0ea5e9]">
          PRICING
        </p>
        <h2
          className={`reveal mx-auto mt-2 max-w-xl text-center text-[48px] leading-[1.15] text-[#0f172a] ${
            pricingVisible ? "visible" : ""
          }`}
          style={{ fontFamily: "var(--font-playfair), serif" }}
        >
          Scale with
          <br />
          <span className="italic text-[#0ea5e9]">confidence</span>
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-center text-[17px] text-[#64748b]">
          One plan with everything you need. No hidden fees.
        </p>

        <div
          className={`reveal relative mx-auto mt-12 max-w-[480px] rounded-3xl border-2 border-[rgba(14,165,233,0.3)] bg-white p-12 text-center shadow-[0_0_0_8px_rgba(14,165,233,0.04),0_24px_48px_rgba(14,165,233,0.08)] ${
            pricingVisible ? "visible" : ""
          }`}
        >
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
            <span className="inline-block rounded-full bg-gradient-to-br from-[#38bdf8] to-[#0ea5e9] px-4 py-1 text-[10px] font-bold uppercase tracking-[2px] text-white">
              MOST POPULAR
            </span>
          </div>
          <div
            className="text-[26px] text-[#0f172a]"
            style={{ fontFamily: "var(--font-playfair), serif" }}
          >
            Pro Plan
          </div>
          <div className="mt-4 flex items-end justify-center gap-1">
            <span
              className="text-[64px] font-bold leading-none text-[#0ea5e9]"
              style={{ fontFamily: "var(--font-playfair), serif" }}
            >
              $99
            </span>
            <span className="pb-2 text-[16px] text-[#94a3b8]">/month</span>
          </div>
          <p className="mt-2 text-sm text-[#64748b]">
            Billed monthly · Cancel anytime
          </p>
          <div className="my-8 h-px bg-[#f1f5f9]" />
          <ul className="space-y-3 text-left text-[15px] text-[#0f172a]">
            {[
              "Unlimited AI conversations",
              "Real-time reservation management",
              "Guest CRM & history",
              "Live conversation takeover",
              "Analytics dashboard",
              "Email notifications",
              "Website widget embed",
              "Priority support",
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-[#10b981]">✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/onboarding"
            className="mt-8 block w-full rounded-[10px] bg-[#38bdf8] py-3.5 text-center text-[15px] font-bold text-[#050d1a] transition will-change-transform hover:-translate-y-0.5 hover:scale-[1.01]"
            style={{ boxShadow: "0 4px 24px rgba(56,189,248,0.4)" }}
          >
            Start Free 14-Day Trial
          </Link>
          <p className="mt-3 text-center text-[12px] text-[#94a3b8]">
            No credit card required
          </p>
        </div>
      </section>

      {/* ——— CTA BANNER ——— */}
      <section
        ref={ctaRef}
        className="relative overflow-hidden px-6 py-24 text-center md:px-[80px] md:py-[100px]"
        style={{
          background:
            "linear-gradient(135deg, #050d1a 0%, #0a1628 50%, #0f1f38 100%)",
        }}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(56,189,248,0.06)] blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-32 top-20 size-64 rounded-full bg-[rgba(56,189,248,0.04)] blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 bottom-10 size-72 rounded-full bg-[rgba(56,189,248,0.05)] blur-2xl"
          aria-hidden
        />

        <div className="relative z-[1] mx-auto max-w-3xl">
          <h2
            className={`reveal text-[52px] font-bold leading-[1.2] text-white ${
              ctaVisible ? "visible" : ""
            }`}
            style={{ fontFamily: "var(--font-playfair), serif" }}
          >
            Ready to transform your restaurant?
          </h2>
          <p
            className={`reveal mx-auto mt-4 max-w-xl text-[18px] text-[rgba(255,255,255,0.6)] ${
              ctaVisible ? "visible" : ""
            }`}
          >
            Join 340+ restaurants already using OceanCore.
          </p>
          <div
            className={`reveal mt-10 flex flex-wrap justify-center gap-4 ${
              ctaVisible ? "visible" : ""
            }`}
          >
            <Link
              href="/onboarding"
              className="rounded-[10px] bg-[#38bdf8] px-8 py-3.5 text-[15px] font-bold text-[#050d1a] transition will-change-transform hover:-translate-y-0.5 hover:scale-[1.02]"
              style={{ boxShadow: "0 4px 24px rgba(56,189,248,0.4)" }}
            >
              Start Free Trial →
            </Link>
            <button
              type="button"
              onClick={() => scrollToId("preview")}
              className="rounded-[10px] border border-[rgba(255,255,255,0.25)] px-8 py-3.5 text-[15px] font-semibold text-white transition hover:border-[rgba(255,255,255,0.45)] hover:bg-[rgba(255,255,255,0.08)]"
            >
              Watch Demo
            </button>
          </div>
        </div>

        <svg
          className="relative z-[1] mt-16 w-full text-sky-500/20"
          viewBox="0 0 1200 48"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M0 32 Q300 8 600 24 T1200 20 L1200 48 L0 48 Z"
          />
        </svg>
      </section>

      {/* ——— FOOTER ——— */}
      <footer className="border-t border-[rgba(56,189,248,0.1)] bg-[#050d1a] px-6 py-12 md:px-[80px]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 md:flex-row">
          <Link href="/" className="flex flex-col gap-0.5">
            <span
              className="text-[1.05rem] font-semibold leading-none"
              style={{ fontFamily: "var(--font-playfair), serif" }}
            >
              <span className="text-[#0ea5e9]">Ocean</span>
              <span className="text-white">Core</span>
            </span>
            <span
              className="text-[9px] uppercase tracking-[3px] text-[#94a3b8]"
              style={{ fontFamily: "var(--font-playfair), serif" }}
            >
              AI CONCIERGE PLATFORM
            </span>
          </Link>

          <nav className="flex flex-wrap justify-center gap-6 text-[13px] text-[#64748b]">
            {[
              ["Features", "features"],
              ["Pricing", "pricing"],
              ["Dashboard", "dashboard"],
              ["Privacy", "#"],
            ].map(([label, href]) =>
              href === "#" ? (
                <span key={label} className="cursor-default hover:text-white">
                  {label}
                </span>
              ) : href === "dashboard" ? (
                <Link
                  key={label}
                  href="/dashboard"
                  className="transition-colors hover:text-white"
                >
                  {label}
                </Link>
              ) : (
                <button
                  key={label}
                  type="button"
                  onClick={() => scrollToId(href)}
                  className="transition-colors hover:text-white"
                >
                  {label}
                </button>
              ),
            )}
          </nav>

          <p className="text-center text-[12px] text-[#475569]">
            © 2026 OceanCore. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
