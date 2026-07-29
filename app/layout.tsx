import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Montserrat, Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";

import { AppProviders } from "@/components/app-providers";
import { SessionGuard } from "@/components/session-guard";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "OceanCore — AI Concierge for Restaurants & Bars",
  description:
    "Handle reservations, guest questions, and revenue growth automatically with OceanCore — a 24/7 AI concierge for restaurants and bars.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // The inline theme script below sets data-theme before hydration, so the
      // server-rendered attribute never matches — suppress that known diff.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${inter.variable} ${plusJakarta.variable} ${montserrat.variable} h-full antialiased`}
    >
      <head>
        {/* Always stamp data-theme (default dark). Without the attribute the
            token systems disagree: --t-* falls back dark while --bk-* falls
            back light, so a first visit rendered half-dark, half-light. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');document.documentElement.dataset.theme=t==='light'?'light':'dark';}catch(e){document.documentElement.dataset.theme='dark';}})();` }} />
        {/* Signed-in HTML the browser kept in its cache must not be shown again
            after logout. This runs while the document is still parsing — before
            any pixel and without waiting for React, which never finishes
            hydrating a page replayed from cache — so a dashboard whose session
            is gone is replaced by the login form instead of rendering. The
            server-side gate in proxy.ts remains the actual authority. */}
        <script
          dangerouslySetInnerHTML={{
            // The cookie name carries the Supabase project ref, and a long
            // session is split into `…-auth-token.0`, `.1` — so match the stem,
            // not an exact name. Guessing wrong here would bounce a signed-in
            // owner straight back to the login form.
            // window.stop() first: the redirect fires mid-parse, and letting the
            // framework keep booting a page we are abandoning made Next throw
            // "Router action dispatched before initialization" — which killed
            // hydration on the page that did load.
            __html: `(function(){try{var p=location.pathname;if(!/^\\/(dashboard|onboarding)(\\/|$)/.test(p))return;if(/(^|;\\s*)sb-[^=;]*-auth-token[^=;]*=[^;]/.test(document.cookie))return;try{window.stop();}catch(e){}location.replace('/auth/login?next='+encodeURIComponent(p+location.search));}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className="min-h-full flex flex-col"
        style={{ margin: 0, background: "#ffffff", color: "#0f172a", overflowX: "hidden" }}
        suppressHydrationWarning
      >
        <SessionGuard />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
