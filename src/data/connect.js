// Content for the /connect page (the QR-code introduction page).
//
// AGENCY_SOCIALS: Creatica Crown's own profiles - the same official URLs the
// site footer links to (components/FooterInfoGrid.jsx). Keep the two in step.
//
// CLIENTS: the client directory, in this order, names exactly as given.
// Each client's links are listed by platform - its official website first,
// then its profiles; a link shows on the page only once its official URL is
// filled in. PENDING marks a URL still to be supplied - replace it with the
// client's official URL (never a guessed one). Platforms shown: website,
// instagram, facebook, linkedin.

const PENDING = null; // TODO(connect): official URL to be supplied

export const AGENCY_SOCIALS = [
  // the agency's own site: this page is part of it, so it opens in place
  {
    platform: "website",
    label: "Website",
    handle: "creaticacrown.com",
    url: "/",
    internal: true,
  },
  {
    platform: "instagram",
    label: "Instagram",
    handle: "@creaticacrown",
    url: "https://www.instagram.com/creaticacrown?stkn=NTA1YjUwY252a29t",
  },
  {
    platform: "linkedin",
    label: "LinkedIn",
    handle: "/company/creaticacrown",
    url: "https://www.linkedin.com/company/creaticacrown/posts/?feedView=all",
  },
  {
    platform: "x",
    label: "Twitter / X",
    handle: "@CreaticaCrown",
    url: "https://x.com/CreaticaCrown",
  },
];

export const CLIENTS = [
  {
    id: "dostan-machines",
    name: "Dostan Machines",
    socials: { website: "https://dostanmachines.com/", instagram: PENDING, facebook: PENDING, linkedin: PENDING },
  },
  {
    id: "su-kam",
    name: "Su-Kam",
    socials: {
      website: "https://www.su-kam.com/",
      instagram: "https://www.instagram.com/sukampowerofficial?xtok=MWEyeWZldWdjZmpk",
      facebook: PENDING,
      linkedin: PENDING,
    },
  },
  {
    id: "freezo-fresh",
    name: "Freezo Fresh",
    socials: { website: "https://freezofresh.com/", instagram: PENDING, facebook: PENDING, linkedin: PENDING },
  },
  {
    id: "bhaman",
    name: "Bhaman",
    socials: { website: "https://www.dahamanenergy.com/", instagram: PENDING, facebook: PENDING, linkedin: PENDING },
  },
  // brands with social profiles only (names as their Instagram handles read)
  {
    id: "madras-mandir-cafe",
    name: "Madras Mandir Cafe",
    socials: { instagram: "https://www.instagram.com/madras_mandir_cafe?mdxt=MTJyaWNjbDBwaTFtcw%3D%3D", facebook: PENDING, linkedin: PENDING },
  },
  {
    id: "cleen-sol",
    name: "Cleen Sol",
    socials: { instagram: "https://www.instagram.com/cleen_sol?obrf=MW52OTY4YWozanprMw%3D%3D", facebook: PENDING, linkedin: PENDING },
  },
  {
    id: "swastik-tiles",
    name: "Swastik Tiles",
    socials: { instagram: "https://www.instagram.com/swastiktiles.jaipur?exln=bGxzNHBsd2xqOWJv", facebook: PENDING, linkedin: PENDING },
  },
  {
    id: "the-wellness-club-gym",
    name: "The Wellness Club Gym",
    socials: { instagram: "https://www.instagram.com/thewellnessclubgym_lohamandi?cplk=eXZoeHR6dXJ0NW54", facebook: PENDING, linkedin: PENDING },
  },
];

// the label each platform is shown with
export const PLATFORM_LABELS = {
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "Twitter / X",
};
