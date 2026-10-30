"use client";

import { useId, useState } from "react";
import RollingText from "@/components/RollingText";
import { PricingIntro, Tags } from "./PricingParts";
import PricingReveal from "./PricingReveal";

// /pricing/<slug>: one service's packages, add-ons, process and terms.
// Every section is optional except the intro, so a custom-quote
// service with no fixed packages uses the same page.

function PlanRow({ plan, open, onToggle }) {
  const detailsId = useId();
  const headingId = useId();

  return (
    <article className={`pricing-row${open ? " is-open" : ""}`} aria-labelledby={headingId}>
      <div className="pricing-row-name">
        <span className="pricing-row-number">{plan.number}</span>
        <h3 className="pricing-row-title no-select" id={headingId}>
          {plan.name}
        </h3>
      </div>

      <div className="pricing-row-body">
        <Tags items={plan.tags} />
        <p className="pricing-row-description">
          {plan.headline && <span className="pricing-row-headline">{plan.headline}</span>}{" "}
          {plan.description}
        </p>
      </div>

      <div className="pricing-row-action">
        <p className="pricing-price">
          {plan.price ? (
            <>
              <span className="pricing-price-amount">
                {plan.price.amount} <span className="pricing-price-period">{plan.price.period}</span>
              </span>
            </>
          ) : (
            <span className="pricing-price-amount">{plan.quote ?? "Custom quote"}</span>
          )}
        </p>
        <button
          type="button"
          className="pricing-button btn-glass no-select"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={onToggle}
        >
          <RollingText>{open ? "Close Plan" : (plan.cta ?? "Explore Plan")}</RollingText>
          <span className="pricing-button-icon" aria-hidden="true" />
        </button>
      </div>

      {/* collapses to zero height when closed (grid 0fr -> 1fr), and is
          inert then, so its contents can't be tabbed into or read out */}
      <div className="pricing-details" id={detailsId} role="region" aria-labelledby={headingId} inert={!open}>
        <div className="pricing-details-inner">
          <div className="pricing-details-content">
            <p className="pricing-label no-select">What&apos;s included</p>
            <ul className="pricing-deliverables">
              {plan.deliverables.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {plan.bestFor && <p className="pricing-best-for">{plan.bestFor}</p>}
          </div>
        </div>
      </div>
    </article>
  );
}

function Plans({ plans, note }) {
  const [openId, setOpenId] = useState(null);

  return (
    <section className="pricing-service" aria-labelledby="pricing-plans">
      <header className="pricing-service-head">
        <h2 className="pricing-label no-select" id="pricing-plans">
          Packages &amp; Monthly Retainers
        </h2>
      </header>
      {plans.map((plan) => (
        <PlanRow
          key={plan.id}
          plan={plan}
          open={openId === plan.id}
          onToggle={() => setOpenId((id) => (id === plan.id ? null : plan.id))}
        />
      ))}
      {note && <p className="pricing-plans-note">{note}</p>}
    </section>
  );
}

export default function PricingService({ service }) {
  const { intro, plans, plansNote, addOns, process, terms } = service.detail;

  return (
    <div className="pricing-page">
      <PricingReveal />
      <div className="pricing-panel">
        <PricingIntro
          heading={intro.heading}
          text={intro.text}
          note={intro.note}
          back={{ href: "/pricing", label: "Back to all pricing" }}
        />

        {plans?.length > 0 && <Plans plans={plans} note={plansNote} />}

        {addOns && (
          <section className="pricing-block" aria-labelledby="pricing-addons">
            <h2 className="pricing-block-title no-select" id="pricing-addons">
              {addOns.heading}
            </h2>
            <div className="pricing-block-body">
              <ul className="pricing-addons">
                {addOns.items.map((item) => (
                  <li key={item.name} className="pricing-addon">
                    <span className="pricing-tag no-select">{item.name}</span>
                    <span className="pricing-addon-note">{item.note}</span>
                  </li>
                ))}
              </ul>
              {addOns.exclusions && (
                <p className="pricing-note">
                  <span className="pricing-label no-select">{addOns.exclusionsLabel ?? "Not included"}</span>{" "}
                  {addOns.exclusions}
                </p>
              )}
            </div>
          </section>
        )}

        {process && (
          <section className="pricing-block" aria-labelledby="pricing-process">
            <h2 className="pricing-block-title no-select" id="pricing-process">
              {process.heading}
            </h2>
            <ol className="pricing-steps">
              {process.steps.map((step, i) => (
                <li key={step.name} className="pricing-step">
                  <span className="pricing-row-number">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="pricing-step-title">{step.name}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {terms && (
          <section className="pricing-block" aria-labelledby="pricing-terms">
            <h2 className="pricing-block-title no-select" id="pricing-terms">
              {terms.heading}
            </h2>
            <ul className="pricing-terms">
              {terms.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}

      </div>
    </div>
  );
}
