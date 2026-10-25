import "./pricing.css";
import PricingDirectory from "@/components/pricing/PricingDirectory";

export const metadata = {
  title: "Pricing", // the root layout's template adds " | Creatica Crown"
  description: "Explore our services, packages and ways to work together.",
};

export default function PricingPage() {
  return <PricingDirectory />;
}
