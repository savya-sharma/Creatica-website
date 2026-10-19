// The carousel's items: the images in public/ProjectsImg (ASSET1..N), in
// order - each entry below describes the image at the same position.
// RingCarousel.js reads `item.src` and `item.crop` (see buildPlanes());
// the rest feeds the project detail view in WorkRingCarousel.jsx.
//
// `crop` (optional): the part of the image that fills the plane and the
// detail view, as fractions of the image from its top-left - for artwork
// shot on a backdrop, so the planes show the artwork edge to edge instead
// of the backdrop around it. Without it the whole image is used. Kept as its own small adapter file, out of
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
    title: "Freezo Fresh Belgium Chocolate",
    client: "Freezo Fresh",
    category: "Packaging Design",
    deliverables: ["Label artwork", "Flavour colour system"],
    description:
      "The Belgium Chocolate label for Freezo Fresh: flowing gold line work over rich maroon, truffle photography and a playful scoop logo, with ingredients and nutrition laid out for print.",
    crop: { x: 0.0255, y: 0.0829, w: 0.9474, h: 0.8389 },
  },
  {
    title: "Just Sipp Chai 20",
    client: "Just Sipp",
    category: "Packaging Design",
    deliverables: ["Label artwork", "Illustration"],
    description:
      "The Chai 20 label for Just Sipp's organic range: a hand-painted floral cup amid whole spices, framed in deep green with the range's shared layout.",
    crop: { x: 0.0287, y: 0.0750, w: 0.9410, h: 0.8533 },
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
    deliverables: ["Label artwork", "Illustration"],
    description:
      "The Kadak Tea label: a tea-garden illustration and bold headline type, with a tea picker among rolling green hills under the Just Sipp mark.",
    crop: { x: 0.0207, y: 0.0766, w: 0.9553, h: 0.8485 },
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
