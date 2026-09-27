"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import FooterInfoGrid from "./FooterInfoGrid";
import RollingText from "./RollingText";
import CornerDownRightIcon from "./icons/CornerDownRightIcon";

gsap.registerPlugin(ScrollTrigger, SplitText);

const BUILDING_OPTIONS = [
  "Branding",
  "Social media handling",
  "an e-commerce website",
  "video creation",
  "multiple / something complex",
  "not sure - let's talk",
];

const BUDGET_OPTIONS = [
  "< $15 000",
  "$15 000-25 000",
  "$25 000-40 000",
  "$40 000-60 000",
  "$60 000-100 000",
  "$100 000+",
];

const SOURCE_OPTIONS = ["LinkedIn", "Instagram", "Twitter / X", "Google search", "Other"];

function RadioGroup({ name, label, options, divider, optionLines, required }) {
  return (
    <div className={divider ? "contact-field contact-field--divider" : "contact-field"}>
      <span className="contact-field-label">{label}</span>
      <div
        className={
          optionLines
            ? "contact-field-options contact-field-options--lines"
            : "contact-field-options"
        }
      >
        {options.map((option, index) => (
          <label className="contact-radio-option" key={`${name}-${index}`}>
            <input
              className="contact-radio"
              type="radio"
              name={name}
              value={option}
              required={required}
            />
            {option}
          </label>
        ))}
      </div>
    </div>
  );
}

const STATUS = { IDLE: "idle", SUBMITTING: "submitting", SUCCESS: "success", ERROR: "error" };

export default function Contact() {
  const pageRef = useRef(null);
  const [status, setStatus] = useState(STATUS.IDLE);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    if (status === STATUS.SUBMITTING) return;

    setStatus(STATUS.SUBMITTING);
    setErrorMessage("");

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Something went wrong. Please try again.");
      }

      setStatus(STATUS.SUCCESS);
      form.reset();
    } catch (error) {
      setStatus(STATUS.ERROR);
      setErrorMessage(error.message || "Something went wrong. Please try again.");
    }
  }

  // same masked bottom-to-top line reveal used elsewhere on the site
  // (About/Footer), scoped to this page's own text - deliberately skips
  // anything with a nested interactive control (radio labels, inputs),
  // since splitting text inside those tears down and rebuilds the DOM,
  // which silently strips their event handlers
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    function reveal(trigger, elements) {
      if (!trigger || !elements.length) return null;

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

    const heading = page.querySelector(".contact-heading");
    const subtitle = page.querySelector(".contact-subtitle");
    const altHeading = page.querySelector(".contact-alt-heading");
    const fieldLabels = Array.from(page.querySelectorAll(".contact-field-label"));

    const splits = [
      reveal(heading, [heading, subtitle].filter(Boolean)),
      ...fieldLabels.map((label) =>
        reveal(label.closest(".contact-field"), [label])
      ),
      reveal(altHeading, altHeading ? [altHeading] : []),
    ].filter(Boolean);

    return () => {
      splits.forEach((split) => split.revert());
    };
  }, []);

  return (
    <div className="contact-page" ref={pageRef}>
      <div className="contact-left">
        <img src="/images/CTA-IMG.webp" alt="Creatica Crown" />
      </div>

      <div className="contact-right">
        <div className="contact-right-inner">
          <h2 className="contact-heading">
            <em>Let&apos;s</em> Build
            <br />
            <span className="contact-arrow">
              <CornerDownRightIcon />
            </span>{" "}
            Something
            <br />
            Meaningful
          </h2>

          <p className="contact-subtitle">
            Tell us about the project.
            <br />
            We respond within 24 hours
          </p>

          <form className="contact-form" onSubmit={handleSubmit}>
            <RadioGroup
              name="building"
              label="I'm building...*"
              options={BUILDING_OPTIONS}
              divider
              optionLines
              required
            />

            <RadioGroup
              name="budget"
              label="My budget is...*"
              options={BUDGET_OPTIONS}
              divider
              optionLines
              required
            />

            <div className="contact-field contact-field--divider">
              <span className="contact-field-label">My name is...*</span>
              <input
                className="contact-input"
                type="text"
                name="name"
                placeholder="Name"
                required
              />
            </div>

            <div className="contact-field contact-field--divider">
              <span className="contact-field-label">Reach me at...*</span>
              <input
                className="contact-input"
                type="email"
                name="email"
                placeholder="Example@email.com"
                required
              />
            </div>

            <div className="contact-field contact-field--divider">
              <span className="contact-field-label">What I&apos;m picturing..*</span>
              <textarea
                className="contact-input contact-textarea"
                name="message"
                placeholder="Tell us about the project. What are you building, what's the timeline, and what would success look like 6 months after launch?"
                rows={3}
                required
              />
            </div>

            <RadioGroup
              name="source"
              label="I found you through..."
              options={SOURCE_OPTIONS}
              divider
              optionLines
            />

            <button
              className="site-footer-button contact-submit btn-glass"
              type="submit"
              disabled={status === STATUS.SUBMITTING}
            >
              <RollingText>
                {status === STATUS.SUBMITTING ? "Sending..." : "Send it"}
              </RollingText>{" "}
              <span>&rarr;</span>
            </button>

            {status === STATUS.SUCCESS && (
              <p className="contact-form-status contact-form-status--success">
                Thanks - your message is on its way. We&apos;ll be in touch
                within 24 hours.
              </p>
            )}

            {status === STATUS.ERROR && (
              <p className="contact-form-status contact-form-status--error">
                {errorMessage}
              </p>
            )}
          </form>

          <h2 className="contact-alt-heading">Or reach out directly</h2>

          <FooterInfoGrid />

          <div className="site-footer-bottom">
            <span>&copy; 2025-{new Date().getFullYear()}. All rights reserved</span>
            <div className="site-footer-bottom-links">
              <Link href="/policy">
                <RollingText>Terms of Services</RollingText>
              </Link>
              <Link href="/policy?tab=privacy">
                <RollingText>Privacy Policy</RollingText>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
