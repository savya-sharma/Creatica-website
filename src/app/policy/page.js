import "./policy.css";
import Policy from "@/components/Policy";

export default async function PolicyPage({ searchParams }) {
  const params = await searchParams;
  const initialTab = params?.tab === "privacy" ? "privacy" : "terms";

  return <Policy initialTab={initialTab} />;
}
