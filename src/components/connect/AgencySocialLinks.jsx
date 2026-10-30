import Link from "next/link";
import SocialIcon from "./SocialIcon";
import ArrowSwap from "./ArrowSwap";
import { AGENCY_SOCIALS } from "@/data/connect";

// Creatica Crown's own site and profiles: one row each, the whole row a link
// - the glyph on a dark tile, its name and handle, and an arrow. The site
// itself opens in place (this page is part of it); the profiles open in a
// new tab.
export default function AgencySocialLinks() {
  return (
    <ul className="agency-links" data-reveal-group>
      {AGENCY_SOCIALS.map((social) => {
        const content = (
          <>
            <span className="agency-link-icon">
              <SocialIcon platform={social.platform} />
            </span>
            <span className="agency-link-text">
              <span className="agency-link-label">{social.label}</span>
              <span className="agency-link-handle">{social.handle}</span>
            </span>
            <span className="agency-link-arrow">
              <ArrowSwap />
            </span>
          </>
        );
        return (
          <li key={social.platform} data-reveal>
            {social.internal ? (
              <Link className="agency-link no-select" href={social.url}>
                {content}
              </Link>
            ) : (
              <a className="agency-link no-select" href={social.url} target="_blank" rel="noopener noreferrer">
                {content}
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
