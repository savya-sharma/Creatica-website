// Content for the pricing pages, kept apart from the layout so services can
// be added without touching any component:
//   /pricing          - the directory (components/PricingDirectory.jsx)
//   /pricing/<slug>   - one detail page per service (PricingService.jsx),
//                       generated from SERVICES by app/pricing/[slug]/page.js
//
// Only add a service once the agency has confirmed its content. A service
// in SERVICES is published - it gets a directory row and its own page.
//
// SERVICES[n]:
//   slug                  - URL: /pricing/<slug>
//   name, summary         - the directory row
//   indicator             - pricing indicator for the row, e.g.
//                           "From ₹12,000 / month", or "Custom quote"
//   cta?                  - row action label (default "Explore Pricing")
//   source                - where the content comes from (not shown)
//   detail                - the service page:
//     intro               - { heading, text, note? }
//     plansNote?          - a line under the packages
//     plans[]             - fixed packages, or omit/[] for a custom-quote service
//       id, number, name
//       price: { amount, period } | null  (null: shows `quote`)
//       quote?, headline?, description, bestFor?, tags[], deliverables[], cta?
//     addOns?             - { heading, items[{ name, note }], exclusionsLabel?, exclusions? }
//     process?            - { heading, steps[{ name, text }] }
//     terms?              - { heading, items[] }

export const PRICING_DIRECTORY = {
  eyebrow: "Creatica Crown / Pricing",
  heading: "Find your creative fit.",
  text: "Explore our services, packages and ways to work together.",
};

export const SERVICES = [
  {
    slug: "social-media-management",
    name: "Social Media Management",
    summary: "Packages & monthly retainers - strategy, content, design, reels and growth.",
    indicator: "From ₹12,000 / month",
    cta: "Explore Pricing",
    // Source: "Creatica Crown SM Packagee.pdf" (9 pages). Wording follows it.
    // Known conflict in the PDF: its overview (p.3) lists Growth as
    // "10 reels" and Signature as "16 reels", while the package pages (pp.5-6)
    // list Growth as 5 UGC videos + 5 AI-generated or edited videos, and
    // Signature as 16 professionally shot and edited videos. The package
    // pages are used here.
    source: "Creatica Crown SM Packagee.pdf",
    detail: {
      intro: {
        heading: "Social Media Management",
        text: "We combine thoughtful strategy, scroll-stopping creative and consistent publishing to help your brand stay relevant and memorable.",
        note: "Indicative monthly retainers • pricing can be customised after a discovery call. Packages can be tailored to your industry, goals and content needs.",
      },
      plansNote: "Content counts are a suggested starting point and can be adjusted to your brief.",
      plans: [
        {
          id: "essential",
          number: "01",
          name: "Essential",
          price: { amount: "₹12,000", period: "/ month" },
          tags: ["Static posts", "Carousels", "Reels", "Stories", "Content calendar", "1 platform"],
          headline: "A strong foundation.",
          description: "For brands that want to look active, professional and consistent.",
          bestFor: "Best for getting the basics right and building a dependable posting rhythm.",
          deliverables: [
            "12 content pieces: static posts and carousels",
            "4 edited reels using client-provided footage",
            "8 story frames",
            "Monthly content calendar and captions",
            "Hashtag / keyword research",
            "Scheduling and publishing on 1 platform",
            "Monthly performance snapshot",
          ],
        },
        {
          id: "growth",
          number: "02",
          name: "Growth",
          price: { amount: "₹20,000", period: "/ month" },
          tags: ["Static posts", "Carousels", "UGC videos", "AI videos", "Stories", "Up to 2 platforms", "Insights"],
          headline: "More content. More momentum.",
          description: "For brands ready to increase their creative output and strengthen engagement.",
          bestFor: "Our balanced option for brands that want consistency and stronger creative variety.",
          deliverables: [
            "16 content pieces: static posts and carousels",
            "5 UGC Videos – including shooting & complete video editing",
            "5 AI-generated or edited videos – created using AI or edited from client-provided footage",
            "12 story frames",
            "Monthly content calendar and captions",
            "Hashtag / keyword research",
            "Scheduling and publishing on up to 2 platforms",
            "Community monitoring and monthly insights report",
          ],
        },
        {
          id: "signature",
          number: "03",
          name: "Signature",
          price: { amount: "₹32,000", period: "/ month" },
          tags: ["Static posts", "Carousels", "Shot & edited videos", "Stories", "Creative direction", "Up to 3 platforms", "Insights"],
          headline: "A richer, video-led presence.",
          description: "For brands looking for a more active content engine across key social channels.",
          bestFor: "Designed for brands that need a fuller, more frequent social presence.",
          deliverables: [
            "20 content pieces: static posts and carousels",
            "16 professionally shot and edited videos",
            "16 story frames",
            "Monthly content calendar, captions and creative direction",
            "Scheduling and publishing on up to 3 platforms",
            "Community monitoring and monthly insights report",
            "Monthly strategy review and next-month recommendations",
          ],
        },
      ],
      addOns: {
        heading: "Optional Add-ons",
        items: [
          { name: "Influencer collaborations", note: "Quoted per creator / campaign" },
          { name: "Paid ads management", note: "Quoted based on campaign scope; ad spend extra" },
          { name: "Branding / campaign creatives", note: "Quoted based on deliverables" },
          { name: "Additional reels", note: "Quoted based on editing complexity" },
        ],
        exclusionsLabel: "Not included unless agreed",
        exclusions: "Ad spend, influencer fees, travel, GST and third-party subscriptions.",
      },
      process: {
        heading: "How It Works",
        steps: [
          { name: "Discover", text: "Goals, audience, brand voice and priorities." },
          { name: "Plan", text: "Monthly calendar and content direction for approval." },
          { name: "Create", text: "Design, edit, caption and prepare content." },
          { name: "Publish", text: "Schedule approved content and monitor performance." },
        ],
      },
      terms: {
        heading: "Working Terms",
        items: [
          "Monthly fee is payable in advance.",
          "Client provides timely access, brand assets and footage where needed.",
          "Content is published after client approval; delays may affect the calendar.",
          "Results depend on audience, offer, creative, consistency and platform changes; specific reach or sales cannot be guaranteed.",
        ],
      },
    },
  },
];

export const getService = (slug) => SERVICES.find((service) => service.slug === slug);
