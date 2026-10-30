import SocialIcon from "./SocialIcon";
import ArrowSwap from "./ArrowSwap";
import { PLATFORM_LABELS } from "@/data/connect";

const ORDER = ["website", "instagram", "facebook", "linkedin"];

// One client's links - its website, then its profiles - as small links out,
// only those whose official URL has been supplied (data/connect.js); none
// yet, and it says so.
export default function ClientSocialLinks({ name, socials }) {
  const links = ORDER.filter((platform) => socials?.[platform]).map((platform) => ({ platform, url: socials[platform] }));
  if (!links.length) return <p className="client-links-empty">Profiles coming soon</p>;
  return (
    <ul className="client-links">
      {links.map(({ platform, url }) => (
        <li key={platform}>
          <a className="client-link no-select" href={url} target="_blank" rel="noopener noreferrer">
            <SocialIcon platform={platform} />
            <span>{PLATFORM_LABELS[platform]}</span>
            <ArrowSwap className="client-link-arrow" />
            <span className="visually-hidden"> - {name} (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
