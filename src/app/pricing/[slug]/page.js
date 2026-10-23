import { notFound } from "next/navigation";
import "../pricing.css";
import PricingService from "@/components/pricing/PricingService";
import { SERVICES, getService } from "@/data/pricing";

// One page per published service in data/pricing.js; any other slug 404s,
// so no empty or placeholder pricing page can exist.
export const dynamicParams = false;

export function generateStaticParams() {
  return SERVICES.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) return {};
  return {
    title: `${service.name} Pricing | Creatica Crown`,
    description: service.summary,
  };
}

export default async function ServicePricingPage({ params }) {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) notFound();
  return <PricingService service={service} />;
}
