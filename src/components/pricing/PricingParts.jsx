import Link from "next/link";

// Pieces shared by the pricing directory and the service pages.

export function Tags({ items, label = "Includes" }) {
  return (
    <ul className="pricing-tags" aria-label={label}>
      {items.map((tag) => (
        <li key={tag} className="pricing-tag">
          {tag}
        </li>
      ))}
    </ul>
  );
}

// Page introduction: an arrow one level up and the section label, the
// large heading, text to the right. `back` ({ href, label }) is the home
// page by default (the directory); a service page passes /pricing.
const HOME = { href: "/", label: "Home" };

export function PricingIntro({ heading, text, note, back = HOME }) {
  return (
    <header className="pricing-intro">
      {/* not <nav>: the sitewide nav rule (globals.css) styles every <nav>
          as the fixed header bar */}
      <div className="pricing-label pricing-trail" role="navigation" aria-label="Back">
        <Link className="pricing-trail-home" href={back.href} aria-label={back.label}>
          <span aria-hidden="true">&larr;</span>
        </Link>
        <span>Pricing</span>
      </div>
      <h1 className="pricing-heading">{heading}</h1>
      <div className="pricing-intro-side">
        <p className="pricing-intro-text">{text}</p>
        {note && <p className="pricing-intro-note">{note}</p>}
      </div>
    </header>
  );
}
