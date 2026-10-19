import Hero from "@/components/Hero";
import Manifesto from "@/components/Manifesto";
import Brands from "@/components/Brands";
import Services from "@/components/Services";
import Work from "@/components/Work";
import Testimonial from "@/components/Testimonial";

export default function Home() {
  return (
    <>
      {/* The home sections (and the footer) share the site's one copy of
          the hero's mouse fluid (SiteFluid, in layout.js), so ink flows
          across every boundary. The hero's own canvas keeps warping its
          headline and notes, without drawing ink. */}
      <div className="home-fluid-zone">
        <Hero fluidInk={false} />
        <Manifesto />
        <Services />
      </div>
    </>
  );
}
