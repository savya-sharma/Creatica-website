"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
// import Profilegallery from "@/components/Profilegaller";

gsap.registerPlugin(ScrollTrigger, SplitText);

const CAPABILITIES = [
  {
    title: "Graphic Design",
    copy: "Refined visual identities, brand collateral, campaign creatives, and cohesive design systems.",
  },
  {
    title: "Content Creation",
    copy: "Strategic, engaging, and brand-centric content crafted to communicate with clarity and relevance.",
  },
  {
    title: "Video Production",
    copy: "Conceptualisation, production, and post-production that transform brand narratives into compelling visual experiences.",
  },
  {
    title: "Brand & Marketing Strategy",
    copy: "Insight-driven strategies that establish positioning, strengthen communication, and facilitate sustainable growth.",
  },
  {
    title: "3D Modelling & VFX",
    copy: "Immersive 3D visualisation, motion graphics, and VFX that bring ambitious concepts to life.",
  },
  {
    title: "Website Development",
    copy: "Bespoke, intuitive, and high-performance digital experiences engineered to complement and elevate your brand.",
  },
];

export default function About() {
  const pageRef = useRef(null);

  // same masked bottom-to-top line reveal used on the Services section,
  // applied per-section here so each block triggers independently as it
  // scrolls into view rather than all at once
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    function reveal(trigger, elements) {
      if (!trigger || !elements.length) return null;

      // guards against the reveal re-hiding/replaying text that has
      // already been shown once, if autoSplit re-splits later (resize, a
      // web font finishing its load, etc.)
      let hasPlayed = false;

      return SplitText.create(elements, {
        type: "lines",
        mask: "lines",
        autoSplit: true,
        onSplit(self) {
          if (prefersReducedMotion || hasPlayed) {
            gsap.set(self.lines, { yPercent: 0 });
            return;
          }

          gsap.set(self.lines, { yPercent: 110 });

          return gsap.to(self.lines, {
            yPercent: 0,
            duration: 1,
            ease: "power3.out",
            stagger: 0.05,
            scrollTrigger: {
              trigger,
              start: "top 75%",
              once: true,
              onEnter: () => {
                hasPlayed = true;
              },
            },
          });
        },
      });
    }

    const sections = Array.from(page.querySelectorAll(".about-section"));
    const splits = sections
      .map((section) =>
        reveal(section, Array.from(section.querySelectorAll("h1, h2, h3, p")))
      )
      .filter(Boolean);

    return () => {
      splits.forEach((split) => split.revert());
    };
  }, []);

  // pins the founder photo in place once its section reaches the top of the
  // viewport, holding it there while the (much taller) bio column scrolls
  // past, then releases it right as the last paragraph clears - only makes
  // sense in the desktop side-by-side layout, so it's scoped to that width
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const mm = gsap.matchMedia();

    mm.add("(min-width: 1001px)", () => {
      const image = page.querySelector(".about-owner-pic");
      const copy = page.querySelector(".about-founder-copy");
      if (!image || !copy) return;

      const trigger = ScrollTrigger.create({
        trigger: image,
        start: "top 140px",
        end: () => `+=${copy.offsetHeight - image.offsetHeight}`,
        pin: image,
        pinSpacing: false,
        invalidateOnRefresh: true,
      });

      return () => trigger.kill();
    });

    return () => mm.revert();
  }, []);

  return (
    <div className="about-page" ref={pageRef}>
      <div className="about-section">
        <h1 className="about-title">About Creatica Crown</h1>

        <p className="about-copy">
          Creatica Crown is a multidisciplinary creative and marketing
          agency operating at the intersection of strategy, creativity,
          technology, and visual storytelling. We collaborate with
          ambitious brands to transform ideas into compelling identities,
          powerful narratives, and immersive digital experiences.
        </p>

        <p className="about-copy">
          From concept to execution, we unite strategic thinking with
          creative craftsmanship to produce work that is not merely
          aesthetically refined, but purposeful, relevant, and
          commercially impactful. Our approach begins with understanding
          the essence of every brand and translating it into communication
          that commands attention, builds credibility, and fosters
          meaningful audience connections.
        </p>
      </div>

      <div className="about-section">
        <h2 className="about-heading">Our Mission</h2>

        <p className="about-copy">
          Our mission is to empower brands through strategic intelligence,
          creative ingenuity, and innovative communication. We transform
          complex ideas into clear, compelling brand experiences that
          amplify visibility, foster engagement, and accelerate meaningful
          growth.
        </p>

        <p className="about-copy">
          We are committed to delivering work that brings together purpose
          and precision, creativity and strategy, imagination and
          execution.
        </p>
      </div>

      <div className="about-section">
        <h2 className="about-heading">Our Vision</h2>

        <p className="about-copy">
          Our vision is to establish Creatica Crown as a distinguished
          creative force in the evolving landscape of brand communication.
        </p>

        <p className="about-copy">
          We aspire to shape brands that are not simply visible, but
          recognisable, influential, and enduring—leveraging creativity,
          technology, and strategic innovation to redefine how businesses
          connect with their audiences.
        </p>
      </div>

      <div className="about-section">
        <h2 className="about-heading">Our Capabilities</h2>

        <p className="about-copy">
          We offer an integrated spectrum of creative and digital
          solutions designed to build, elevate, and transform brands.
        </p>

        <ul className="about-capabilities">
          {CAPABILITIES.map((capability) => (
            <li key={capability.title} className="about-capability">
              <h3 className="about-capability-title">{capability.title}</h3>
              <p className="about-capability-copy">{capability.copy}</p>
            </li>
          ))}
        </ul>

        <p className="about-copy">
          At Creatica Crown, we don&apos;t simply create marketing
          collateral—we architect brand experiences designed to command
          attention and leave a lasting impression.
        </p>
      </div>

      <div className="about-section">
        <h2 className="about-heading">About the Founder</h2>

        <div className="about-founder">
          <div className="about-owner-pic">
            <img src="/images/OWNER.webp" alt="Founder of Creatica Crown" />
          </div>

          <div className="about-founder-copy">
            <h3 className="about-founder-name">
              Monica Jangir — Founder, Creatica Crown
            </h3>

            <p>
              Monica Jangir’s entrepreneurial journey began in 2020,
              following the completion of her Animation course from Arena
              Animation, Rajouri Garden, Delhi. What initially emerged as a
              profound interest in visual creativity gradually evolved into
              a larger aspiration — to establish an independent creative
              venture driven by originality, purpose, and excellence.
            </p>

            <p>
              While pursuing her professional career as a Graphic
              Designer, Monica simultaneously ventured into freelance
              assignments, managing professional responsibilities while
              dedicating her nights to refining her craft, exploring new
              creative possibilities, and conceptualising the foundation of
              the agency she aspired to build.
            </p>

            <p>
              Over the course of 5–6 years within the corporate creative
              industry, Monica assumed diverse responsibilities across
              Graphic Design, Video Editing, Content Creation, Marketing
              Management, and Creative Direction. These experiences
              enabled her to develop a multidimensional understanding of
              the creative ecosystem, extending beyond aesthetics into the
              realms of brand strategy, visual communication, marketing,
              storytelling, and business development.
            </p>

            <p>
              Every professional chapter contributed to a broader
              perspective — that meaningful creativity is not merely about
              creating something visually appealing, but about developing
              ideas that communicate, connect, and create lasting value.
            </p>

            <p>Throughout this journey, one principle remained unwavering:</p>

            <p>Never give up, irrespective of the challenges along the way.</p>

            <p>
              It was this perseverance, coupled with an enduring commitment
              to creativity, that transformed a long-standing ambition into
              reality. Monica founded Creatica Crown with a clear vision:
              to bring strategy, creativity, technology, and visual
              storytelling together under one roof, enabling brands to
              translate their ideas into compelling and purposeful
              experiences.
            </p>

            <p>
              Today, Creatica Crown operates from Jaipur, supported by a
              growing creative network and team presence extending to
              Delhi. What began as the pursuit of one designer working
              relentlessly towards a vision has evolved into a creative
              agency built upon a fundamental belief:
            </p>

            <p>
              Great ideas deserve the right strategy, craftsmanship, and
              execution to make a meaningful impact.
            </p>
          </div>
        </div>
      </div>

      {/* <Profilegallery /> */}
    </div>
  );
}
