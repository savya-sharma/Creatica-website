"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import FooterInfoGrid from "./FooterInfoGrid";
import RollingText from "./RollingText";
import CornerDownRightIcon from "./icons/CornerDownRightIcon";
import {
  PROJECT_TYPE_OPTIONS,
  BUDGET_OPTIONS,
  FOUND_THROUGH_OPTIONS,
  EMPTY_VALUES,
  FIELD_ORDER,
  toPayload,
  validate,
  describeErrors,
} from "@/lib/contactForm";

gsap.registerPlugin(ScrollTrigger, SplitText);

const STATUS_ID = "contact-form-status";
// a hung request must end in a visible error, never an endless "Sending..."
const REQUEST_TIMEOUT_MS = 15000;
const GENERIC_ERROR = "Something went wrong. Please try again.";

function RadioGroup({
  name,
  label,
  options,
  divider,
  optionLines,
  required,
  value,
  onChange,
  invalid,
}) {
  const labelId = `contact-${name}-label`;
  return (
    <div className={divider ? "contact-field contact-field--divider" : "contact-field"}>
      <span className="contact-field-label" id={labelId}>
        {label}
      </span>
      <div
        className={
          optionLines
            ? "contact-field-options contact-field-options--lines"
            : "contact-field-options"
        }
        role="radiogroup"
        aria-labelledby={labelId}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? STATUS_ID : undefined}
      >
        {options.map((option, index) => (
          <label className="contact-radio-option" key={`${name}-${index}`}>
            <input
              className="contact-radio"
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={onChange}
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
  const formRef = useRef(null);
  // synchronous guard: state lands a render later, so two fast clicks (or
  // Enter + click) could both get past a `status` check
  const submittingRef = useRef(false);
  const abortRef = useRef(null);

  const [values, setValues] = useState(EMPTY_VALUES);
  const [status, setStatus] = useState(STATUS.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  // validation feedback appears after a submit attempt, then follows the
  // fields live so the message shrinks as each one is fixed
  const [showErrors, setShowErrors] = useState(false);

  const errors = showErrors ? validate(toPayload(values)) : {};
  const validationMessage = describeErrors(errors);

  // leaving the page mid-request: drop the result rather than updating an
  // unmounted form
  useEffect(() => () => abortRef.current?.abort(), []);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((prev) => (prev[name] === value ? prev : { ...prev, [name]: value }));
    // editing after a result starts over: clear the old outcome
    if (status === STATUS.SUCCESS || status === STATUS.ERROR) {
      setStatus(STATUS.IDLE);
      setErrorMessage("");
    }
  }

  function focusField(field) {
    const control = formRef.current?.elements.namedItem(field);
    // a radio group comes back as a RadioNodeList - focus its first option
    const target = control && !control.tagName ? control[0] : control;
    target?.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submittingRef.current) return;

    const payload = toPayload(values);
    const found = validate(payload);
    const firstInvalid = FIELD_ORDER.find((field) => found[field]);
    if (firstInvalid) {
      setShowErrors(true);
      setErrorMessage("");
      setStatus(STATUS.ERROR);
      focusField(firstInvalid);
      return;
    }

    submittingRef.current = true;
    setShowErrors(false);
    setErrorMessage("");
    setStatus(STATUS.SUBMITTING);

    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || GENERIC_ERROR);
      }

      // reset only once the message has actually been accepted
      setValues(EMPTY_VALUES);
      setStatus(STATUS.SUCCESS);
    } catch (error) {
      if (controller.signal.aborted && !timedOut) return; // unmounted
      setErrorMessage(
        timedOut
          ? "The request timed out. Please try again."
          : error.name === "TypeError"
            ? "Couldn't reach the server. Check your connection and try again."
            : error.message || GENERIC_ERROR
      );
      setStatus(STATUS.ERROR);
    } finally {
      clearTimeout(timeout);
      submittingRef.current = false;
      if (abortRef.current === controller) abortRef.current = null;
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

          {/* noValidate: validation runs in handleSubmit and is reported in
              the form's own status line below, not in browser bubbles */}
          <form className="contact-form" onSubmit={handleSubmit} ref={formRef} noValidate>
            <RadioGroup
              name="projectType"
              label="I'm building...*"
              options={PROJECT_TYPE_OPTIONS}
              divider
              optionLines
              required
              value={values.projectType}
              onChange={handleChange}
              invalid={!!errors.projectType}
            />

            <RadioGroup
              name="budget"
              label="My budget is...*"
              options={BUDGET_OPTIONS}
              divider
              optionLines
              required
              value={values.budget}
              onChange={handleChange}
              invalid={!!errors.budget}
            />

            <div className="contact-field contact-field--divider">
              <span className="contact-field-label" id="contact-name-label">
                My name is...*
              </span>
              <input
                className="contact-input"
                type="text"
                name="name"
                placeholder="Name"
                autoComplete="name"
                required
                value={values.name}
                onChange={handleChange}
                aria-labelledby="contact-name-label"
                aria-invalid={!!errors.name || undefined}
                aria-describedby={errors.name ? STATUS_ID : undefined}
              />
            </div>

            <div className="contact-field contact-field--divider">
              <span className="contact-field-label" id="contact-email-label">
                Reach me at...*
              </span>
              <input
                className="contact-input"
                type="email"
                name="email"
                placeholder="Example@email.com"
                autoComplete="email"
                required
                value={values.email}
                onChange={handleChange}
                aria-labelledby="contact-email-label"
                aria-invalid={!!errors.email || undefined}
                aria-describedby={errors.email ? STATUS_ID : undefined}
              />
            </div>

            <div className="contact-field contact-field--divider">
              <span className="contact-field-label" id="contact-message-label">
                What I&apos;m picturing..*
              </span>
              <textarea
                className="contact-input contact-textarea"
                name="message"
                placeholder="Tell us about the project. What are you building, what's the timeline, and what would success look like 6 months after launch?"
                rows={3}
                required
                value={values.message}
                onChange={handleChange}
                aria-labelledby="contact-message-label"
                aria-invalid={!!errors.message || undefined}
                aria-describedby={errors.message ? STATUS_ID : undefined}
              />
            </div>

            <RadioGroup
              name="foundThrough"
              label="I found you through..."
              options={FOUND_THROUGH_OPTIONS}
              divider
              optionLines
              required
              value={values.foundThrough}
              onChange={handleChange}
              invalid={!!errors.foundThrough}
            />

            <button
              className="site-footer-button contact-submit btn-glass"
              type="submit"
              disabled={status === STATUS.SUBMITTING}
              aria-busy={status === STATUS.SUBMITTING || undefined}
            >
              <RollingText>
                {status === STATUS.SUBMITTING ? "Sending..." : "Send it"}
              </RollingText>{" "}
              <span>&rarr;</span>
            </button>

            {/* always mounted so assistive tech is already watching it when
                the result lands - a region inserted together with its text
                is usually not announced */}
            <div className="contact-form-live" role="status" aria-live="polite">
              {status === STATUS.SUCCESS && (
                <p className="contact-form-status contact-form-status--success">
                  Thanks - your message is on its way. We&apos;ll be in touch
                  within 24 hours.
                </p>
              )}

              {(validationMessage || (status === STATUS.ERROR && errorMessage)) && (
                <p className="contact-form-status contact-form-status--error" id={STATUS_ID}>
                  {validationMessage || errorMessage}
                </p>
              )}
            </div>
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
