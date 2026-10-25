import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "lenis/dist/lenis.css";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";
import Navbar from "@/components/Navbar";
import IntroLoader from "@/components/IntroLoader";
import Footer from "@/components/Footer";
import SiteFluid from "@/components/SiteFluid";
import PageTransition from "@/components/PageTransition";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://www.creaticacrown.com";
const SITE_NAME = "Creatica Crown";
const DEFAULT_TITLE = "Creatica Crown | Creative Marketing Agency";
const DESCRIPTION =
  "Creatica Crown is a creative marketing agency blending strategy, design, technology and visual storytelling - brand identities, social media, content and digital experiences that get noticed.";

// Site-wide metadata. Pages set just their own name (e.g. "Pricing") and
// the template adds the brand; pages without a title get the default.
// The favicon / app icons come from the file conventions in this folder:
// favicon.ico, icon.png and apple-icon.png (the Creatica crown).
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: DEFAULT_TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // the intro's before-paint script (below) adds classes to <html>
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* the browser's own scroll-restoration-on-reload is what causes a
            reload to snap back to whatever section you were scrolled to -
            turning it off here, before hydration, is the actual root cause
            fix (a reload then just starts at the top like any fresh
            navigation) rather than fighting it with a delayed scrollTo */}
        <Script id="disable-scroll-restoration" strategy="beforeInteractive">
          {"try{if('scrollRestoration' in history){history.scrollRestoration='manual';}}catch(e){}"}
        </Script>
        {/* the entry intro (IntroLoader.jsx): its black overlay is part of
            the server-rendered HTML, so nothing under it is seen first.
            Scrolling is locked before first paint. */}
        <Script id="intro-lock" strategy="beforeInteractive">
          {"try{document.documentElement.classList.add('preloader-lock');}catch(e){}"}
        </Script>
        <noscript>
          <style>{".intro{display:none}"}</style>
        </noscript>
        <IntroLoader />
        <SmoothScroll />
        {/* organic blob transition between in-site pages */}
        <PageTransition />
        <Navbar />
        {/* page + footer share one copy of the hero's mouse fluid, so ink
            flows from the page into the footer with no edge between them
            (SiteFluid.jsx decides where it shows) */}
        <div className="site-fluid-zone">
          {children}
          <Footer />
          <SiteFluid />
        </div>
      </body>
    </html>
  );
}
