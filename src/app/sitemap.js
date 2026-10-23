import { SERVICES } from "@/data/pricing";

export default function sitemap() {
  return [
    {
      url: 'https://www.creaticacrown.com/',
      priority: 1,
    },
    {
      url: 'https://www.creaticacrown.com/about/',
      priority: 0.8,
    },
    {
      url: 'https://www.creaticacrown.com/work/',
      priority: 0.8,
    },
    {
      url: 'https://www.creaticacrown.com/pricing/',
      priority: 0.8,
    },
    // one entry per published service page (data/pricing.js)
    ...SERVICES.map((service) => ({
      url: `https://www.creaticacrown.com/pricing/${service.slug}/`,
      priority: 0.7,
    })),
    {
      url: 'https://www.creaticacrown.com/contact/',
      priority: 0.8,
    },
    {
      url: 'https://www.creaticacrown.com/policy/',
      priority: 0.5,
    },
  ]
}