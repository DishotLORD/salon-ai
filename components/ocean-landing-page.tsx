'use client'

import Link from 'next/link'
import { useEffect, useRef, type RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

import { useLenisReady } from '@/components/lenis-context'

gsap.registerPlugin(ScrollTrigger)

const BG = '#0a0f1a'
const ACCENT = '#38bdf8'
const TEXT = '#e2e8f0'
const MUTED = '#94a3b8'

const features = [
  {
    title: 'AI Chat Agent',
    body: 'Respond instantly, escalate gracefully, and keep every conversation on-brand—24/7.',
  },
  {
    title: 'Smart Bookings',
    body: 'Let customers self-serve slots, reminders, and changes while your calendar stays spotless.',
  },
  {
    title: 'CRM & Analytics',
    body: 'See who books, who returns, and where revenue flows—without drowning in spreadsheets.',
  },
]

const steps = [
  {
    n: '01',
    title: 'Connect your business',
    body: 'Sign in, add your services and hours, and tune the agent to your voice.',
  },
  {
    n: '02',
    title: 'Deploy the widget',
    body: 'Drop one snippet on your site. Your AI concierge goes live in minutes.',
  },
  {
    n: '03',
    title: 'Operate from one hub',
    body: 'Chats, bookings, and customer context—unified in a calm, focused dashboard.',
  },
]

function useParticleCanvas(canvasRef: RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const ctxMaybe = canvas.getContext('2d')
    if (!ctxMaybe || reduced) {
      return
    }
    const ctxDraw = ctxMaybe

    const particles: { x: number; y: number; r: number; vx: number; vy: number; a: number }[] = []
    const count = 48
    let w = 0
    let h = 0
    let raf = 0

    function resize() {
      const c = canvasRef.current
      const parent = c?.parentElement
      if (!c || !parent) {
        return
      }
      w = parent.clientWidth
      h = parent.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      c.width = Math.floor(w * dpr)
      c.height = Math.floor(h * dpr)
      c.style.width = `${w}px`
      c.style.height = `${h}px`
      ctxDraw.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.6,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.12,
        a: 0.08 + Math.random() * 0.22,
      })
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement!)

    const tick = () => {
      ctxDraw.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) {
          p.vx *= -1
        }
        if (p.y < 0 || p.y > h) {
          p.vy *= -1
        }
        ctxDraw.beginPath()
        ctxDraw.fillStyle = `rgba(56, 189, 248, ${p.a})`
        ctxDraw.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctxDraw.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [canvasRef])
}

export function OceanLandingPage() {
  const rootRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollCueRef = useRef<HTMLDivElement>(null)
  const lenisReady = useLenisReady()

  useParticleCanvas(canvasRef)

  useGSAP(
    () => {
      if (!lenisReady || !rootRef.current) {
        return
      }
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) {
        return
      }

      const words = rootRef.current.querySelectorAll('.hero-word')
      if (words.length) {
        gsap.from(words, {
          opacity: 0,
          y: 44,
          duration: 0.55,
          stagger: 0.14,
          ease: 'power3.out',
          delay: 0.06,
        })
      }

      gsap.from('.hero-sub', {
        opacity: 0,
        y: 22,
        duration: 0.5,
        delay: 0.35,
        ease: 'power2.out',
      })
      gsap.from('.hero-cta', {
        opacity: 0,
        y: 16,
        duration: 0.45,
        delay: 0.48,
        ease: 'power2.out',
      })

      const cueSvg = scrollCueRef.current?.querySelector('svg')
      if (cueSvg) {
        gsap.to(cueSvg, {
          y: 8,
          duration: 0.65,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        })
      }

      const header = headerRef.current
      if (header) {
        ScrollTrigger.create({
          trigger: '.hero-section',
          start: 'top top',
          end: 'bottom top',
          scrub: 0.12,
          onUpdate(self) {
            const p = Math.min(1, self.progress * 1.4)
            header.style.background = `rgba(10, 15, 26, ${0.92 * p})`
            header.style.backdropFilter = p > 0.05 ? 'blur(14px)' : 'blur(0px)'
            header.style.borderBottomColor = `rgba(56, 189, 248, ${0.12 * p})`
            header.style.boxShadow = `0 12px 40px rgba(0,0,0,${0.35 * p})`
          },
        })
      }

      gsap.utils.toArray<HTMLElement>('.feature-card').forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 56, willChange: 'transform, opacity' },
          {
            opacity: 1,
            y: 0,
            duration: 0.55,
            ease: 'power3.out',
            willChange: 'auto',
            scrollTrigger: {
              trigger: el,
              start: 'top 90%',
              toggleActions: 'play none none none',
            },
          },
        )
      })

      gsap.utils.toArray<HTMLElement>('.how-step').forEach((el) => {
        const line = el.querySelector('.step-line-inner') as HTMLElement | null
        gsap.fromTo(
          el,
          { opacity: 0, y: 48, willChange: 'transform, opacity' },
          {
            opacity: 1,
            y: 0,
            duration: 0.55,
            ease: 'power3.out',
            willChange: 'auto',
            scrollTrigger: {
              trigger: el,
              start: 'top 88%',
              toggleActions: 'play none none none',
            },
          },
        )
        if (line) {
          gsap.fromTo(
            line,
            { scaleX: 0, willChange: 'transform' },
            {
              scaleX: 1,
              duration: 0.65,
              ease: 'power2.inOut',
              willChange: 'auto',
              scrollTrigger: {
                trigger: el,
                start: 'top 85%',
                toggleActions: 'play none none none',
              },
            },
          )
        }
      })

      gsap.fromTo(
        '.cta-inner',
        { opacity: 0, y: 40, scale: 0.98, willChange: 'transform, opacity' },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.6,
          ease: 'power3.out',
          willChange: 'auto',
          scrollTrigger: {
            trigger: '.cta-section',
            start: 'top 82%',
            toggleActions: 'play none none none',
          },
        },
      )

      ScrollTrigger.create({
        trigger: '.cta-section',
        start: 'top 78%',
        once: true,
        onEnter() {
          gsap.fromTo(
            '.cta-animated-link',
            { scale: 0.94 },
            {
              scale: 1,
              duration: 0.35,
              ease: 'back.out(1.6)',
            },
          )
          gsap.to('.cta-animated-link', {
            boxShadow: '0 0 36px rgba(56, 189, 248, 0.55)',
            duration: 0.12,
            yoyo: true,
            repeat: 5,
            ease: 'power1.inOut',
          })
        },
      })

      requestAnimationFrame(() => ScrollTrigger.refresh())
    },
    { scope: rootRef, dependencies: [lenisReady], revertOnUpdate: true },
  )

  return (
    <div
      ref={rootRef}
      style={{
        minHeight: '100vh',
        background: BG,
        color: TEXT,
        fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
      }}
    >
      <header
        ref={headerRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 28px',
          background: 'rgba(10, 15, 26, 0)',
          backdropFilter: 'blur(0px)',
          borderBottom: '1px solid rgba(56, 189, 248, 0)',
          boxShadow: 'none',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: ACCENT,
          }}
        >
          OceanCore
        </span>
        <Link
          href="/auth/login"
          className="nav-cta-link"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: BG,
            background: ACCENT,
            padding: '10px 22px',
            borderRadius: 10,
            textDecoration: 'none',
            boxShadow: '0 0 24px rgba(56, 189, 248, 0.25)',
          }}
        >
          Get Started
        </Link>
      </header>

      <section
        className="hero-section"
        style={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '100px 24px 88px',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            opacity: 0.9,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(56, 189, 248, 0.14), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(56, 189, 248, 0.06), transparent 50%)',
            pointerEvents: 'none',
          }}
        />
        <h1
          style={{
            position: 'relative',
            margin: 0,
            fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: 'clamp(3rem, 12vw, 6.5rem)',
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1.02,
            textAlign: 'center',
            color: '#f8fafc',
          }}
        >
          <span className="hero-word" style={{ display: 'inline-block', marginRight: '0.12em' }}>
            Ocean
          </span>
          <span className="hero-word" style={{ display: 'inline-block' }}>
            Core
          </span>
        </h1>
        <p
          className="hero-sub"
          style={{
            position: 'relative',
            margin: '24px 0 0',
            maxWidth: 520,
            textAlign: 'center',
            fontSize: 'clamp(1rem, 2.4vw, 1.2rem)',
            lineHeight: 1.55,
            color: MUTED,
            fontWeight: 400,
          }}
        >
          AI-powered operations for modern business
        </p>
        <div className="hero-cta" style={{ position: 'relative', marginTop: 36 }}>
          <Link
            href="/auth/login"
            style={{
              display: 'inline-block',
              fontSize: 15,
              fontWeight: 600,
              color: BG,
              background: ACCENT,
              padding: '14px 32px',
              borderRadius: 12,
              textDecoration: 'none',
              boxShadow: '0 4px 32px rgba(56, 189, 248, 0.35)',
              border: '1px solid rgba(125, 211, 252, 0.5)',
            }}
          >
            Get Started
          </Link>
        </div>

        <div
          ref={scrollCueRef}
          style={{
            position: 'absolute',
            bottom: 28,
            left: '50%',
            translate: '-50% 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            color: MUTED,
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          <span>Scroll</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden style={{ opacity: 0.85 }}>
            <path
              d="M12 5v14M12 19l-5-5M12 19l5-5"
              stroke={ACCENT}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </section>

      <section
        style={{
          padding: '96px 24px 120px',
          maxWidth: 1120,
          margin: '0 auto',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: 'clamp(2rem, 5vw, 2.75rem)',
            fontWeight: 600,
            margin: '0 0 12px',
            color: '#f1f5f9',
            textAlign: 'center',
          }}
        >
          Built for clarity
        </h2>
        <p style={{ margin: '0 auto 52px', maxWidth: 520, textAlign: 'center', color: MUTED, fontSize: 16, lineHeight: 1.6 }}>
          Everything you need to run the front office—without the noise.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 22,
          }}
        >
          {features.map((f) => (
            <article
              key={f.title}
              className="feature-card"
              style={{
                borderRadius: 18,
                padding: '28px 26px',
                background: 'linear-gradient(155deg, rgba(30, 41, 59, 0.55) 0%, rgba(15, 23, 42, 0.85) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.14)',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 4,
                  borderRadius: 2,
                  background: ACCENT,
                  marginBottom: 18,
                  opacity: 0.9,
                }}
              />
              <h3 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 600, color: '#f8fafc' }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: MUTED }}>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        style={{
          padding: '72px 24px 112px',
          background: 'linear-gradient(180deg, transparent 0%, rgba(56, 189, 248, 0.04) 50%, transparent 100%)',
        }}
      >
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: 'var(--font-playfair), Georgia, serif',
              fontSize: 'clamp(2rem, 5vw, 2.75rem)',
              fontWeight: 600,
              margin: '0 0 48px',
              color: '#f1f5f9',
              textAlign: 'center',
            }}
          >
            How it works
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
            {steps.map((s) => (
              <div
                key={s.n}
                className="how-step"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '18px 28px',
                  alignItems: 'start',
                  padding: '24px 24px 20px',
                  borderRadius: 16,
                  border: '1px solid rgba(148, 163, 184, 0.12)',
                  background: 'rgba(15, 23, 42, 0.45)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-playfair), Georgia, serif',
                    fontSize: 'clamp(2.5rem, 6vw, 3.25rem)',
                    fontWeight: 600,
                    color: ACCENT,
                    lineHeight: 1,
                    opacity: 0.95,
                  }}
                >
                  {s.n}
                </span>
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 600, color: '#f8fafc' }}>{s.title}</h3>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: MUTED }}>{s.body}</p>
                </div>
                <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                  <div
                    className="step-line-inner"
                    style={{
                      height: 2,
                      width: '100%',
                      borderRadius: 1,
                      background: `linear-gradient(90deg, ${ACCENT}, rgba(56,189,248,0.15))`,
                      transformOrigin: 'left center',
                      transform: 'scaleX(0)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section" style={{ padding: '80px 24px 120px' }}>
        <div
          className="cta-inner"
          style={{
            maxWidth: 720,
            margin: '0 auto',
            textAlign: 'center',
            padding: '56px 32px',
            borderRadius: 24,
            border: '1px solid rgba(56, 189, 248, 0.2)',
            background: 'linear-gradient(160deg, rgba(56, 189, 248, 0.1) 0%, rgba(15, 23, 42, 0.9) 45%, rgba(10, 15, 26, 0.95) 100%)',
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-playfair), Georgia, serif',
              fontSize: 'clamp(2rem, 5vw, 2.5rem)',
              fontWeight: 600,
              margin: 0,
              color: '#f8fafc',
            }}
          >
            Ready to start?
          </h2>
          <p style={{ margin: '14px 0 28px', color: MUTED, fontSize: 16, lineHeight: 1.55 }}>
            Join teams running calmer, sharper operations on OceanCore.
          </p>
          <Link
            href="/auth/login"
            className="cta-animated-link"
            style={{
              display: 'inline-block',
              fontSize: 15,
              fontWeight: 600,
              color: BG,
              background: ACCENT,
              padding: '14px 36px',
              borderRadius: 12,
              textDecoration: 'none',
              boxShadow: '0 4px 28px rgba(56, 189, 248, 0.4)',
            }}
          >
            Get Started
          </Link>
        </div>
      </section>

      <footer
        style={{
          padding: '28px 24px 40px',
          textAlign: 'center',
          color: '#64748b',
          fontSize: 13,
          borderTop: '1px solid rgba(148, 163, 184, 0.1)',
        }}
      >
        © {new Date().getFullYear()} OceanCore
      </footer>
    </div>
  )
}
