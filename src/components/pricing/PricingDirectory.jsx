import Link from "next/link";
import RollingText from "@/components/RollingText";
import { PRICING_DIRECTORY, SERVICES } from "@/data/pricing";
import { PricingIntro } from "./PricingParts";
import PricingReveal from "./PricingReveal";

// /pricing: one compact row per published service - name, short summary,
// pricing indicator and an Explore Pricing link to the service's own page,
// where the packages and everything else live. Rows come straight from
// data/pricing.js, so a new service is a new entry there, not new markup.

function ServiceRow({ service, index }) {
  return (
    <li className="pricing-dir-item">
      <div className="pricing-dir-row">
        <div className="pricing-dir-name">
          <span className="pricing-row-number">{String(index + 1).padStart(2, "0")}</span>
          <h2 className="pricing-row-title no-select">{service.name}</h2>
        </div>

        <div className="pricing-dir-body">
          <p className="pricing-row-description">{service.summary}</p>
        </div>

        <div className="pricing-dir-action">
          <p className="pricing-price">
            <span className="pricing-price-amount">{service.indicator}</span>
          </p>
          <Link
            className="pricing-button btn-glass pricing-dir-cta no-select"
            href={`/pricing/${service.slug}`}
            aria-label={`${service.cta ?? "Explore Pricing"}: ${service.name}`}
          >
            <RollingText>{service.cta ?? "Explore Pricing"}</RollingText>
            <span className="pricing-button-arrow" aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>
    </li>
  );
}

export default function PricingDirectory() {
  return (
    <div className="pricing-page">
      <PricingReveal />
      <div className="pricing-panel">
        <PricingIntro
          heading={PRICING_DIRECTORY.heading}
          text={PRICING_DIRECTORY.text}
        />

        <ol className="pricing-dir" aria-label="Services">
          {SERVICES.map((service, i) => (
            <ServiceRow key={service.slug} service={service} index={i} />
          ))}
        </ol>
      </div>
    </div>
  );
}
