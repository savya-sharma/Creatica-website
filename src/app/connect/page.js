import "./connect.css";
import ConnectMarquee from "@/components/connect/ConnectMarquee";
import ConnectReveal from "@/components/connect/ConnectReveal";
import AgencySocialLinks from "@/components/connect/AgencySocialLinks";
import ClientDirectory from "@/components/connect/ClientDirectory";

// /connect - the page behind the QR code shared with clients: who we are,
// where to follow us, and the brands we've worked with. Unlisted, not
// private: reachable by its URL (opened directly, as a QR code does), but
// linked from nowhere on the site, left out of the sitemap (app/sitemap.js
// lists pages explicitly) and marked noindex, nofollow. robots.txt does not
// block it - a crawler that may not fetch it could not see the noindex. The
// site footer (root layout) closes the page as on every other.
export const metadata = {
  title: "Connect", // the root layout's template adds " | Creatica Crown"
  description: "Creatica Crown - follow the agency and the brands we've worked with.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function ConnectPage() {
  return (
    <main className="connect-page">
      <ConnectMarquee />
      <ConnectReveal>
        <section className="connect-intro" aria-labelledby="connect-title">
          {/* eslint-disable-next-line @next/next/no-img-element -- the vector logo, nothing to optimise */}
          <img className="connect-logo" src="/logo/LOGO.svg" alt="Creatica Crown - where every idea turns into art" width="4993" height="1701" />
          <h1 id="connect-title" className="connect-title no-select" data-reveal>
            We Share Ideas Into Experiences <br className="connect-break" />
            Worth Remembering.
          </h1>
        </section>

        <section className="connect-block" aria-labelledby="connect-social-title">
          <header className="connect-block-head" data-reveal>
            <p className="connect-eyebrow no-select">(01) Connect</p>
            <h2 id="connect-social-title" className="connect-block-title">
              Find us elsewhere.
            </h2>
            <p className="connect-block-sub">Follow Creatica Crown.</p>
          </header>
          <AgencySocialLinks />
        </section>

        <section className="connect-block connect-block--clients" aria-labelledby="connect-clients-title">
          <header className="connect-block-head" data-reveal>
            <p className="connect-eyebrow no-select">(02) Clients</p>
            <h2 id="connect-clients-title" className="connect-block-title">
              Our Clients.
            </h2>
            <p className="connect-block-sub">Brands We&apos;ve Worked With.</p>
          </header>
          <ClientDirectory />
        </section>
      </ConnectReveal>
    </main>
  );
}
