"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { testimonials } from "@/data/testimonials";

gsap.registerPlugin(InertiaPlugin);

export default function Testimonial() {
  const sectionRef = useRef(null);
  const cardRefs = useRef([]);

  useEffect(() => {
    const cards = cardRefs.current;
    const section = sectionRef.current;
    if (!cards.length || !section) return;

    // rotation is set in CSS per-card (the only transform present when GSAP
    // first reads the element), so animating y here layers a fade-up on top
    // of it without disturbing the tilt - the card settles already rotated
    gsap.set(cards, { opacity: 0, y: 40 });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          gsap.to(cards, {
            opacity: 1,
            y: 0,
            duration: 1.1,
            ease: "power3.out",
            stagger: 0.1,
          });
          observer.disconnect();
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(section);

    // pointer velocity -> InertiaPlugin throw, desktop only - touch devices
    // have no hover/leave gesture for this to trigger off of
    const supportsHover = window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    ).matches;

    let ctx;
    const removeListeners = [];

    if (supportsHover) {
      ctx = gsap.context(() => {
        cards.forEach((card) => {
          let lastX = 0;
          let lastY = 0;
          let speedX = 0;
          let speedY = 0;

          // each card's own resting x/y/rotation, captured once - inertia
          // always throws from and settles back to exactly this, so the
          // asymmetric editorial layout is never disturbed
          const startX = gsap.getProperty(card, "x");
          const startY = gsap.getProperty(card, "y");
          const startRotation = gsap.getProperty(card, "rotation");

          const onEnter = (e) => {
            speedX = 0;
            speedY = 0;
            lastX = e.clientX;
            lastY = e.clientY;
          };

          const onMove = (e) => {
            speedX = e.clientX - lastX;
            speedY = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
          };

          const onLeave = () => {
            gsap.to(card, {
              inertia: {
                x: { velocity: speedX * 20, end: startX },
                y: { velocity: speedY * 20, end: startY },
                rotation: { velocity: speedX * 4, end: startRotation },
              },
            });
          };

          card.addEventListener("pointerenter", onEnter);
          card.addEventListener("pointermove", onMove);
          card.addEventListener("pointerleave", onLeave);

          removeListeners.push(() => {
            card.removeEventListener("pointerenter", onEnter);
            card.removeEventListener("pointermove", onMove);
            card.removeEventListener("pointerleave", onLeave);
          });
        });
      }, section);
    }

    return () => {
      observer.disconnect();
      removeListeners.forEach((remove) => remove());
      ctx?.revert();
    };
  }, []);

  return (
    <div className="testimonials" ref={sectionRef}>
      <h2 className="testimonials-heading">
        Don&apos;t take our word for it. Hear it from our clients.
      </h2>

      <p className="testimonials-featured">
        Creatica Crown didn&apos;t just manage our social media. They
        understood our brand, transformed our content and helped us connect
        with our audience in a consistently different way.
      </p>

      <div className="testimonials-cards">
        {testimonials.map((t, i) => (
          <div
            className="testimonial-card"
            key={t.name}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
          >
            <div className="testimonial-card-glass" />
            <div className="testimonial-card-content">
              <p className="testimonial-card-quote">&ldquo;{t.quote}&rdquo;</p>
              <p className="testimonial-card-name">{t.name}</p>
              <p className="testimonial-card-role">{t.role}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
