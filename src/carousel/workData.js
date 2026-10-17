// The carousel's items: the images in public/ProjectsImg (ASSET1..N), in
// order - each entry below describes the image at the same position.
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
    title: "Oral-B Everyday Smile",
    client: "Oral-B",
    category: "Advertising",
    deliverables: ["Key visual", "Brand integration"],
    description:
      "A close, candid key visual for Oral-B: a natural, freckled smile caught mid-brush, with the brand mark riding the brush head so the product sits at the heart of the frame.",
  },
  {
    title: "Celestia Eucalyptus & Rosemary",
    client: "LDE Cosmetics",
    category: "Packaging Design",
    deliverables: ["Soap wrap", "Dieline artwork"],
    description:
      "Wrap artwork for Celestia's herbal glycerine bar: eucalyptus and rosemary over a painterly deep green, laid out to print as a single dieline.",
  },
  {
    title: "Premium Jasmine Agarbatti",
    category: "Packaging Design",
    deliverables: ["Carton design", "Product styling"],
    description:
      "A Hindi-language carton for a premium jasmine incense line: a mandala crown above a photographic jasmine field, shown in a bright split-colour flat lay.",
  },
  {
    title: "Just Sipp Kadak Tea",
    client: "Just Sipp",
    category: "Packaging Design",
    deliverables: ["Jar label", "Illustration"],
    description:
      "The Kadak Tea label: a tea-garden illustration and bold headline type, set on an amber jar.",
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
    title: "Guppeee",
    client: "Guppeee",
    category: "Brand Identity",
    deliverables: ["Logo", "Packaging", "Signage", "Collateral"],
    description:
      "A complete identity for an Uttarakhand ice-cream brand, 'delight of uttarakhand': logo, tubs, cone sleeves, business cards, signage and carry bags.",
  },
  {
    title: "Freezo Fresh Belgium Chocolate",
    client: "Freezo Fresh",
    category: "Packaging Design",
    deliverables: ["Tub packaging", "Flavour colour system"],
    description:
      "An ice-cream tub for Freezo Fresh: a gold lid and flowing gold line work over rich maroon, paired with truffle photography and a playful scoop logo.",
  },
  {
    title: "Magic Hustle Mango Duet",
    client: "Magic Hustle",
    category: "Packaging Design",
    deliverables: ["Flow wrap", "Lettering", "Character art"],
    description:
      "A flow wrap for a children's ice lolly: illustrated characters, hand-lettered flavour name and a high-energy mango splash.",
  },
];

export const workSlides = projects.map((project, i) => ({
  ...project,
  src: `/ProjectsImg/ASSET${i + 1}.webp`,
}));
