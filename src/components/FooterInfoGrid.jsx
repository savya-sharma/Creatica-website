"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { scrambleHoverProps, scrambleTo } from "@/lib/scrambleHover";
import CornerRightDownIcon from "./icons/CornerRightDownIcon";
import ArrowUpRightIcon from "./icons/ArrowUpRightIcon";

const EMAIL = "contact@creaticacrown.com";

// the Social/Pages/Location/E-mail link grid - shared between the site-wide
// Footer and the Contact page, which both show this exact same block (the
// reference designs for both use identical content). Just the grid, not the
// copyright bar below it - that sits at a different nesting depth in each
// of the two layouts, so each caller renders its own .site-footer-bottom.
export default function FooterInfoGrid() {
  const emailRef = useRef(null);
  const copiedTimeoutRef = useRef(null);

  // the "Copied" swap is driven through the same scramble primitive as the
  // hover effect (rather than React state) because once GSAP starts
  // writing this span's innerHTML for the hover scramble, a React-rendered
  // child for the same node stops updating reliably
  useEffect(() => () => clearTimeout(copiedTimeoutRef.current), []);

  async function handleCopyEmail() {
    const el = emailRef.current;
    try {
      await navigator.clipboard.writeText(EMAIL);
      clearTimeout(copiedTimeoutRef.current);
      scrambleTo(el, "Copied");
      copiedTimeoutRef.current = setTimeout(() => scrambleTo(el, EMAIL), 2000);
    } catch {
      window.location.href = `mailto:${EMAIL}`;
    }
  }

  return (
    <div className="site-footer-grid">
      <div className="site-footer-col">
        <h3>
          Social <CornerRightDownIcon />
        </h3>
        <ul>
          <li>
            <a
              href="https://x.com/CreaticaCrown"
              target="_blank"
              rel="noopener noreferrer"
              {...scrambleHoverProps}
            >
              [01] <span className="scramble-target">Twitter / X</span>{" "}
              <ArrowUpRightIcon />
            </a>
          </li>
          <li>
            <a
              href="https://www.linkedin.com/company/creaticacrown/posts/?feedView=all"
              target="_blank"
              rel="noopener noreferrer"
              {...scrambleHoverProps}
            >
              [02] <span className="scramble-target">LinkedIn</span>{" "}
              <ArrowUpRightIcon />
            </a>
          </li>
          <li>
            <a
              href="https://www.instagram.com/creaticacrown?stkn=NTA1YjUwY252a29t"
              target="_blank"
              rel="noopener noreferrer"
              {...scrambleHoverProps}
            >
              [03] <span className="scramble-target">Instagram</span>{" "}
              <ArrowUpRightIcon />
            </a>
          </li>
        </ul>
      </div>

      <div className="site-footer-col">
        <h3>
          Pages <CornerRightDownIcon />
        </h3>
        <ul>
          <li>
            <Link href="/" {...scrambleHoverProps}>
              [01] <span className="scramble-target">Home</span>
            </Link>
          </li>
          <li>
            <Link href="/about" {...scrambleHoverProps}>
              [02] <span className="scramble-target">About</span>
            </Link>
          </li>
          <li>
            <Link href="/work" {...scrambleHoverProps}>
              [03] <span className="scramble-target">Projects</span>
            </Link>
          </li>
          <li>
            <Link href="/contact" {...scrambleHoverProps}>
              [04] <span className="scramble-target">Contact</span>
            </Link>
          </li>
        </ul>
      </div>

      <div className="site-footer-col">
        <h3>
          Location <CornerRightDownIcon />
        </h3>
        <p>
          G-4, Janki Complex, Loha Mandi Road,
          <br />
          Harmada, Jaipur, Rajasthan - 302013
        </p>
      </div>

      <div className="site-footer-col">
        <h3>
          E-mail <CornerRightDownIcon />
        </h3>
        <p className="site-footer-email" aria-live="polite">
          <button
            type="button"
            onClick={handleCopyEmail}
            aria-label={`Copy ${EMAIL} to clipboard`}
            {...scrambleHoverProps}
          >
            <span className="scramble-target" ref={emailRef}>
              {EMAIL}
            </span>
          </button>
        </p>
      </div>
    </div>
  );
}
