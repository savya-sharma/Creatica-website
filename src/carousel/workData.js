// The carousel's items: all 14 images in public/ProjectsImg, in order.
// RingCarousel.js only reads `item.src` (see buildPlanes() ->
// getTexture(item.src)); the rest feeds the project detail view in
// WorkRingCarousel.jsx. Kept as its own small adapter file, out of
// RingCarousel.js itself, per the integration brief.
const projects = [
  {
    title: "JCT Business Cards",
    client: "Janger Construction & Trading Co.",
    category: "Brand Identity",
    deliverables: ["Logo mark", "Business cards", "Stationery"],
    description:
      "A blueprint-led identity for a construction and trading firm: a monoline house mark, architectural line work and a deep-teal palette carried across textured business cards.",
  },
  {
    title: "Celestia Aloe Vera & Tea Tree",
    client: "LDE Cosmetics",
    category: "Packaging Design",
    deliverables: ["Soap wrap", "Dieline artwork"],
    description:
      "Wrap artwork for Celestia's moisturising glycerine bar: fresh aloe and tea-tree imagery on a bright green wash, laid out to print as a single dieline.",
  },
  {
    title: "Celestia Eucalyptus & Rosemary",
    client: "LDE Cosmetics",
    category: "Packaging Design",
    deliverables: ["Soap wrap", "Range extension"],
    description:
      "The herbal variant of the Celestia range: eucalyptus and rosemary over a painterly deep green, sharing the range's typography and layout system.",
  },
  {
    title: "Celestia Almond Cream",
    client: "LDE Cosmetics",
    category: "Packaging Design",
    deliverables: ["Soap wrap", "Range extension"],
    description:
      "A Vitamin E enriched almond-cream bar: warm cream swirls, almonds and a milk splash give the range its most indulgent face.",
  },
  {
    title: "Premium Jasmine Agarbatti",
    category: "Packaging Design",
    deliverables: ["Carton design", "Product styling"],
    description:
      "A Hindi-language carton for a premium jasmine incense line: a mandala crown above a photographic jasmine field, shown in a bright split-colour flat lay.",
  },
  {
    title: "Premium Lavender Agarbatti",
    category: "Packaging Design",
    deliverables: ["Carton design", "Product styling"],
    description:
      "The lavender counterpart in the same system: the shared mandala framework, recoloured in soft violet over a full-bleed lavender field.",
  },
  {
    title: "Freezo Fresh American Nuts",
    client: "Freezo Fresh",
    category: "Packaging Design",
    deliverables: ["Tub packaging", "Flavour colour system"],
    description:
      "An ice-cream tub for Freezo Fresh: gold lid, flowing gold line work and a playful scoop logo, with colour coding that lets each flavour own the shelf.",
  },
  {
    title: "Luscious Creamery Cone",
    client: "Luscious Creamery",
    category: "Packaging Design",
    deliverables: ["Cone sleeve", "Lid artwork"],
    description:
      "A cone sleeve for Luscious Creamery's Belgium Chocolate: a bold monogram, script flavour lettering and a kraft-tone base that wraps cleanly around a tapered form.",
  },
  {
    title: "Freezo Fresh Belgium Chocolate",
    client: "Freezo Fresh",
    category: "Packaging Design",
    deliverables: ["Tub packaging", "Flavour colour system"],
    description:
      "The Belgium Chocolate tub in the Freezo Fresh range: the same gold-line system in a rich maroon, paired with truffle photography.",
  },
  {
    title: "Magic Hustle Mango Duet",
    client: "Magic Hustle",
    category: "Packaging Design",
    deliverables: ["Flow wrap", "Lettering", "Character art"],
    description:
      "A flow wrap for a children's ice lolly: illustrated characters, hand-lettered flavour name and a high-energy mango splash.",
  },
  {
    title: "Just Sipp Tea Range",
    client: "Just Sipp",
    category: "Packaging Design",
    deliverables: ["Jar labels", "Illustration", "Range system"],
    description:
      "Labels for an organic tea family: each blend gets its own illustrated scene inside a shared layout, so the range reads as one on the shelf.",
  },
  {
    title: "Oral-B Pro Repair",
    client: "Oral-B",
    category: "Advertising",
    deliverables: ["Key visual", "Illustration"],
    description:
      "An illustrated key visual for Gum & Enamel Pro Repair: a night-sky setting that makes the 'works while you sleep' message instantly readable.",
  },
  {
    title: "Guppeee",
    client: "Guppeee",
    category: "Brand Identity",
    deliverables: ["Logo", "Packaging", "Signage", "Collateral"],
    description:
      "A complete identity for an Uttarakhand ice-cream brand, 'delight of uttarakhand': logo, tubs, cone sleeves, business cards, signage and carry bags.",
  },
  {
    title: "Just Sipp Kadak Tea",
    client: "Just Sipp",
    category: "Packaging Design",
    deliverables: ["Jar label", "Illustration"],
    description:
      "The Kadak Tea label: a tea-garden illustration and bold headline type, set on an amber jar.",
  },
];

export const workSlides = projects.map((project, i) => ({
  ...project,
  src: `/ProjectsImg/ASSET${i + 1}.webp`,
}));
