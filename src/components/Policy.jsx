"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { scrambleTo } from "@/lib/scrambleHover";
import RollingText from "./RollingText";

gsap.registerPlugin(ScrollTrigger, SplitText);

const EMAIL = "contact@creaticacrown.com";
const PHONE_DISPLAY = "+91 78771 99073";
const PHONE_TEL = "+917877199073";

// same click-to-copy "Copied" swap used for the footer's email link,
// reused here so both behave identically
function CopyableEmail() {
  const ref = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  async function handleClick() {
    const el = ref.current;
    try {
      await navigator.clipboard.writeText(EMAIL);
      clearTimeout(timeoutRef.current);
      scrambleTo(el, "Copied");
      timeoutRef.current = setTimeout(() => scrambleTo(el, EMAIL), 2000);
    } catch {
      window.location.href = `mailto:${EMAIL}`;
    }
  }

  return (
    <button type="button" className="policy-copy-email" onClick={handleClick}>
      <span ref={ref}>{EMAIL}</span>
    </button>
  );
}

const TERMS_SECTIONS = [
  {
    title: "Payment Structure",
    blocks: [
      { type: "p", text: "Our standard project payment structure is:" },
      {
        type: "list",
        items: [
          "50% Advance: Payable before commencement.",
          "50% Final Payment: Payable before final delivery.",
        ],
      },
      {
        type: "p",
        text: "The advance allows Creatica Crown to allocate resources and commence project work.",
      },
    ],
  },
  {
    title: "Advance Payments",
    blocks: [
      {
        type: "p",
        text: "Once work has commenced or project-specific resources have been committed, the 50% advance is generally non-refundable, subject to applicable law.",
      },
      {
        type: "p",
        text: "This may include work involving strategy, research, concepts, design, content, production planning, development, resource allocation, or third-party commitments.",
      },
    ],
  },
  {
    title: "Cancellation Before Commencement",
    blocks: [
      {
        type: "p",
        text: "If a client cancels before substantive work has commenced, Creatica Crown may consider a refund of the advance after deducting applicable administrative, payment-processing, third-party, or other non-recoverable costs.",
      },
      {
        type: "p",
        text: "Any refund will be assessed based on the circumstances and applicable agreement.",
      },
    ],
  },
  {
    title: "Cancellation After Commencement",
    blocks: [
      {
        type: "p",
        text: "If a project is cancelled after work has commenced, the client may remain responsible for work completed, resources committed, approved expenses, third-party costs, licences, production commitments, and other non-recoverable expenses.",
      },
      {
        type: "p",
        text: "Any refundable amount, where applicable, will be determined after deducting such amounts.",
      },
    ],
  },
  {
    title: "Revisions",
    blocks: [
      {
        type: "p",
        text: "Each project includes three (3) rounds of revisions, unless otherwise agreed.",
      },
      {
        type: "p",
        text: "Additional revisions or substantial changes outside the agreed scope may incur additional charges.",
      },
      {
        type: "p",
        text: "A request for additional revisions does not itself create an entitlement to a refund.",
      },
    ],
  },
  {
    title: "Approved Deliverables",
    blocks: [
      {
        type: "p",
        text: "Once a deliverable has been approved, published, used, or accepted by the client, fees relating to that deliverable are generally non-refundable.",
      },
      {
        type: "p",
        text: "Changes requested after approval may be treated as additional work.",
      },
    ],
  },
  {
    title: "Website, Video, 3D & VFX Projects",
    blocks: [
      {
        type: "p",
        text: "For projects involving website development, video production, 3D modelling, VFX, or other production services, cancellation may result in charges for work already completed and costs relating to booked personnel, equipment, locations, licences, software, third-party services, or other commitments.",
      },
      {
        type: "p",
        text: "Third-party purchases may be non-refundable according to the relevant provider's terms.",
      },
    ],
  },
  {
    title: "Retainer Services",
    blocks: [
      {
        type: "p",
        text: "For monthly retainer services, cancellation and payment terms will be governed by the applicable retainer agreement.",
      },
      {
        type: "p",
        text: "Services already performed during a billing period are generally non-refundable.",
      },
      {
        type: "p",
        text: "Unused deliverables do not automatically qualify for a refund or carry-forward.",
      },
    ],
  },
  {
    title: "Client Delays",
    blocks: [
      {
        type: "p",
        text: "Delays caused by missing content, feedback, approvals, access, information, or payments do not automatically entitle the client to a refund.",
      },
      {
        type: "p",
        text: "Where prolonged delays affect project resources or timelines, Creatica Crown may revise the delivery schedule or commercial terms.",
      },
    ],
  },
  {
    title: "Marketing Performance",
    blocks: [
      {
        type: "p",
        text: "Failure to achieve a particular commercial result does not, by itself, constitute grounds for a refund where the agreed services have been performed.",
      },
      {
        type: "p",
        text: "Creatica Crown does not guarantee specific sales, leads, revenue, engagement, followers, traffic, conversions, or advertising results unless expressly agreed in writing.",
      },
    ],
  },
  {
    title: "Refund Processing",
    blocks: [
      {
        type: "p",
        text: "Where a refund is approved, it will generally be processed through the original payment method where reasonably practicable.",
      },
      {
        type: "p",
        text: "Applicable payment-processing, third-party, or non-recoverable costs may be deducted where legally permissible.",
      },
      {
        type: "p",
        text: "Processing times may vary depending on banks, payment gateways, and financial institutions.",
      },
    ],
  },
  {
    title: "Statutory Rights",
    blocks: [
      {
        type: "p",
        text: "Nothing in this Policy is intended to exclude or restrict any mandatory rights or remedies available under applicable Indian law.",
      },
    ],
  },
  {
    title: "How to Request a Cancellation or Refund",
    blocks: [
      { type: "p", text: "Requests must be submitted in writing to:" },
      { type: "email", text: "contact@creaticacrown.com" },
      {
        type: "p",
        text: "Please include your name, business name, project name, invoice or proposal reference, payment details, date of payment, reason for the request, and any relevant supporting information.",
      },
      {
        type: "p",
        text: "Each request will be reviewed according to the applicable agreement, work completed, expenses incurred, and applicable law.",
      },
    ],
  },
  {
    title: "Updates",
    blocks: [
      {
        type: "p",
        text: "Creatica Crown may update this Policy from time to time. The latest version will be published on our website with the applicable effective date.",
      },
    ],
  },
  {
    title: "Contact",
    blocks: [
      { type: "address" },
    ],
  },
];

const PRIVACY_SECTIONS = [
  {
    title: "Information We Collect",
    blocks: [
      {
        type: "p",
        text: "Depending on your interaction with us, we may collect:",
      },
      {
        type: "list",
        items: [
          "Name and business/organisation name",
          "Email address and phone number",
          "Billing and GST information",
          "Business or correspondence address",
          "Project briefs, requirements, and communications",
          "Brand assets, images, videos, documents, and other materials provided for projects",
          "Website, social-media, or other account access information where required",
          "Technical information such as IP address, browser, device, pages visited, and website usage data",
        ],
      },
      {
        type: "p",
        text: "We may also use cookies and analytics technologies to understand website usage and improve our services.",
      },
    ],
  },
  {
    title: "How We Use Information",
    blocks: [
      { type: "p", text: "We may use collected information to:" },
      {
        type: "list",
        items: [
          "Respond to enquiries",
          "Prepare proposals, quotations, and invoices",
          "Deliver and manage projects",
          "Communicate regarding services, timelines, approvals, and revisions",
          "Process payments and maintain business records",
          "Improve our website, services, and customer experience",
          "Maintain security and prevent misuse",
          "Comply with applicable legal, tax, and regulatory requirements",
          "Protect our rights and legitimate business interests",
        ],
      },
    ],
  },
  {
    title: "Sharing of Information",
    blocks: [
      {
        type: "p",
        text: "We do not sell or commercially trade your personal information.",
      },
      {
        type: "p",
        text: "Where necessary, information may be shared with authorised team members, freelancers, contractors, production partners, hosting providers, cloud services, payment providers, accountants, legal advisers, analytics providers, or other service providers involved in delivering our services.",
      },
      {
        type: "p",
        text: "We may also disclose information where required by applicable law or lawful authority.",
      },
    ],
  },
  {
    title: "Confidentiality",
    blocks: [
      {
        type: "p",
        text: "Information shared with Creatica Crown for the purpose of a project will be handled with reasonable care and used primarily for the agreed business purpose.",
      },
      {
        type: "p",
        text: "Where additional confidentiality is required, the parties may enter into a separate Non-Disclosure Agreement (NDA).",
      },
    ],
  },
  {
    title: "Data Security & Retention",
    blocks: [
      {
        type: "p",
        text: "We take reasonable technical and organisational measures to protect information from unauthorised access, misuse, alteration, loss, or disclosure.",
      },
      {
        type: "p",
        text: "We retain information for as long as reasonably necessary for business, contractual, accounting, legal, tax, or dispute-resolution purposes.",
      },
      {
        type: "p",
        text: "No method of electronic transmission or storage can be guaranteed to be completely secure.",
      },
    ],
  },
  {
    title: "Third-Party Websites",
    blocks: [
      {
        type: "p",
        text: "Our website may contain links to third-party websites, platforms, or services. Creatica Crown is not responsible for the privacy practices or security of those third parties. We encourage users to review their respective privacy policies.",
      },
    ],
  },
  {
    title: "Your Rights",
    blocks: [
      {
        type: "p",
        text: "Subject to applicable law, you may request access to, correction of, or deletion of your personal information, or raise a privacy-related concern.",
      },
      {
        type: "p",
        text: "Requests may be submitted using the contact details below. We may request reasonable verification before processing certain requests.",
      },
    ],
  },
  {
    title: "Updates",
    blocks: [
      {
        type: "p",
        text: "We may update this Privacy Policy from time to time. Any updated version will be published on this page with a revised “Last Updated” date.",
      },
    ],
  },
  {
    title: "Contact",
    blocks: [
      { type: "address" },
    ],
  },
];

const POLICIES = {
  terms: {
    label: "Terms of Services",
    title: "Refund & Cancellation Policy",
    effectiveDate: "15 October 2025",
    lastUpdated: "15 October 2025",
    intro: [
      "Creatica Crown is committed to maintaining transparent and professional commercial relationships. As our services involve dedicated creative resources, production time, software, third-party services, and project-specific commitments, refunds and cancellations are subject to the terms below.",
    ],
    sections: TERMS_SECTIONS,
  },
  privacy: {
    label: "Privacy Policy",
    title: "Privacy Policy",
    effectiveDate: "15 October 2025",
    lastUpdated: "15 October 2025",
    intro: [
      "Creatica Crown (“we”, “our”, or “us”) is a proprietorship-based creative and marketing agency based in Jaipur, Rajasthan, India. We respect your privacy and are committed to handling your personal information responsibly.",
      "This Privacy Policy explains how we collect, use, and protect information when you visit our website, contact us, submit an enquiry, or engage our services.",
    ],
    sections: PRIVACY_SECTIONS,
  },
};

function SectionBlock({ block }) {
  if (block.type === "list") {
    return (
      <ul className="policy-list">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }

  if (block.type === "email") {
    return (
      <p className="policy-p--interactive">
        Email: <CopyableEmail />
      </p>
    );
  }

  if (block.type === "address") {
    return (
      <p className="policy-p--interactive">
        Creatica Crown
        <br />
        G-4 Ground Floor, Plot No. 325, Janki Complex,
        <br />
        Macheda, New Loha Mandi Road, Near BR Paradise,
        <br />
        Harmada, Jaipur, Rajasthan &ndash; 302013, India
        <br />
        <br />
        GSTIN: 08BXLPJ2234G1ZJ
        <br />
        Email: <CopyableEmail />
        <br />
        Phone:{" "}
        <a className="policy-mono" href={`tel:${PHONE_TEL}`}>
          {PHONE_DISPLAY}
        </a>
        <br />
        <br />
        Jurisdiction: Jaipur, Rajasthan, India
      </p>
    );
  }

  return <p>{block.text}</p>;
}

export default function Policy({ initialTab = "terms" }) {
  const router = useRouter();
  const pageRef = useRef(null);
  const [activeTab, setActiveTab] = useState(
    initialTab === "privacy" ? "privacy" : "terms"
  );
  const policy = POLICIES[activeTab];

  // same masked bottom-to-top line reveal used elsewhere on the site
  // (About/Footer/Contact/Playground) - skips the paragraphs that carry
  // the copy-email button/links (see policy-p--interactive above), since
  // splitting their text tears down and rebuilds the DOM, silently
  // stripping the button's click handler
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

    const header = page.querySelector(".policy-header");
    const sections = Array.from(page.querySelectorAll(".policy-section"));

    const splits = [
      reveal(header, header ? Array.from(header.querySelectorAll("h1, p")) : []),
      ...sections.map((section) =>
        reveal(
          section,
          Array.from(section.querySelectorAll("h2, p:not(.policy-p--interactive), li"))
        )
      ),
    ].filter(Boolean);

    // ScrollTrigger measures each section's trigger position using
    // whatever font is painted at the moment it's created. This page's
    // custom fonts (PP Neue/IBM) can still be swapping in shortly after
    // that first measurement, especially on a first visit - the resulting
    // reflow shifts every section below the swap point, so their cached
    // "top 75%" pixel offsets no longer line up with the real layout and
    // the reveal's `once: true` onEnter can end up permanently missed for
    // everything after that. Refreshing once fonts finish loading
    // re-measures every trigger against the settled, final layout.
    let cancelled = false;
    document.fonts?.ready?.then(() => {
      if (!cancelled) ScrollTrigger.refresh();
    });

    return () => {
      cancelled = true;
      splits.forEach((split) => split.revert());
    };
  }, [activeTab]);

  return (
    <div className="policy-page" ref={pageRef}>
      <div className="policy-tabs">
        <button
          type="button"
          className="policy-close"
          onClick={() => router.back()}
        >
          <span aria-hidden="true">&larr;</span> <RollingText>Close</RollingText>
        </button>

        {Object.entries(POLICIES).map(([tabId, tabPolicy]) => (
          <button
            key={tabId}
            type="button"
            className={`policy-tab${
              activeTab === tabId ? " policy-tab--active" : ""
            }`}
            onClick={() => setActiveTab(tabId)}
          >
            <RollingText>{tabPolicy.label}</RollingText>
          </button>
        ))}
      </div>

      <div className="policy-content" key={activeTab}>
        <div className="policy-header">
          <h1 className="policy-title">{policy.title}</h1>

          <p className="policy-meta">
            <strong>Effective Date:</strong> {policy.effectiveDate}
            <br />
            <strong>Last Updated:</strong> {policy.lastUpdated}
          </p>

          {policy.intro.map((paragraph) => (
            <p className="policy-intro" key={paragraph}>
              {paragraph}
            </p>
          ))}
        </div>

        {policy.sections.map((section, index) => (
          <div className="policy-section" key={section.title}>
            <h2>
              {index + 1}. {section.title}
            </h2>
            {section.blocks.map((block, blockIndex) => (
              <SectionBlock block={block} key={blockIndex} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
