"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";

export default function Hero() {
  useEffect(() => {
    gsap.registerPlugin(SplitText);

    const splits = [];

    const splitTextIntoLines = (selector, options = {}) => {
      const defaults = {
        type: "lines",
        mask: "lines",
        linesClass: "line",
        ...options,
      };

      const split = SplitText.create(selector, defaults);
      splits.push(split);
      return split;
    };

    splitTextIntoLines(".preloader-copy p");
    splitTextIntoLines(".preloader-counter p");

    gsap.set(["nav", ".hero-img", ".hero-content"], {
      y: "35svh",
    });

    const animateCounter = (selector, duration = 5, delay = 0) => {
      const counterElement = document.querySelector(selector);
      let currentValue = 0;
      const updateInterval = 200;
      const maxDuration = duration * 1000;
      const startTime = Date.now();

      const timeoutId = setTimeout(() => {
        const updateCounter = () => {
          const elapsedTime = Date.now() - startTime;
          const progress = elapsedTime / maxDuration;

          if (currentValue < 100 && elapsedTime < maxDuration) {
            const target = Math.floor(progress * 100);
            const jump = Math.floor(Math.random() * 25) + 5;
            currentValue = Math.min(currentValue + jump, target, 100);

            counterElement.textContent = currentValue.toString().padStart(2, "0");
            setTimeout(updateCounter, updateInterval + Math.random() * 100);
          } else {
            counterElement.textContent = "100";
          }
        };

        updateCounter();
      }, delay * 1000);

      return timeoutId;
    };

    animateCounter(".preloader-counter p", 4.5, 2);

    const tl = gsap.timeline();

    tl.to([".preloader-copy p .line", "preloader-counter p .line"], {
      y: "0%",
      duration: 1,
      stragger: 0.075,
      ease: "power3.out",
      delay: 1,
    })
      .to(
        ".preloader-revealer",
        {
          scale: 0.1,
          duration: 0.75,
          ease: "power2.out",
        },
        "<"
      )
      .to("preloader-revealer", {
        scale: 0.25,
        duration: 1,
        ease: "power3.out",
      })
      .to(".preloader-revealer", {
        scale: 0.5,
        duration: 0.75,
        ease: "power3.out",
      })
      .to(".preloader-revealer", {
        scale: 0.75,
        duration: 0.5,
        ease: "power3.out",
      })
      .to(".preloader-revealer", {
        scale: 1,
        duration: 1,
        ease: "power3.out",
      })
      .to(
        ".preloader",
        {
          clipPath: "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%",
          duration: 1.25,
          ease: "power3.out",
        },
        "-=1"
      )
      .to(
        ["nav", ".hero-img", ".hero-content"],
        {
          y: "0%",
          duration: 1.25,
          ease: "power3.out",
        },
        "<"
      );

    return () => {
      tl.kill();
      splits.forEach((split) => split.revert());
    };
  }, []);

  return (
    <section className="hero">
      <div className="preloader">
        <div className="preloader-revealer"></div>

        <div className="preloader-copy">
          <div className="preloader-copy-col">
            <p>
              Handpicked collections shaped by artistry, balancing rare
              element with a focus on purity
            </p>
          </div>
          <div className="preloader-copy-col">
            <p>
              Handpicked collections shaped by artistry, balancing rare
              element with a focus on purity
            </p>
          </div>
        </div>

        <div className="preloader-counter">
          <p>00</p>
        </div>
      </div>

      <div className="hero-img">
        <img src="/images/img1.jpg" alt="Hero Image" />
      </div>

      <div className="hero-content">
        <div className="product-name">
          <p>[ Enter No. 04 ]</p>
        </div>
        <div className="product-link">
          <a href="#">View Collection</a>
        </div>
      </div>
    </section>
  );
}
