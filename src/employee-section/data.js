// The carousel is fully data-driven: order here is the order of the stream
// (left -> right). Each entry's role is shown under its own image and stays
// with it through auto-movement, dragging, looping and plane recycling.
//
// focus (optional): where the head is in the photo, as fractions of the image
//   top  - top of the head (hair/hat), 0 = image top
//   chin - bottom of the chin
//   x    - horizontal centre of the face, 0 = image left
// The carousel uses it to frame every portrait alike (same head line and
// size). Without it the photo is simply cover-cropped around its centre.
//
// extendTop (optional): for a photo cropped close above the head, adds the
// missing headroom from its own top edge (mirrored, softened), so the head
// sits on the same line as the others instead of at the very top.
//
// headSize (optional): head height as a share of the card for this photo
// only (default: headSize in config.js) - raise it to zoom a wider shot in
// to match the tight headshots around it.

// Placeholder for members without a photo yet: an Instagram-style blank
// profile (white head + shoulders on light grey), with its head framed like
// the photos. The real photo each placeholder stands in for is noted on its
// line - swap it back in (with its own focus) when it's ready.
const BLANK = { image: "/images/team-blank.webp", focus: { top: 0.275, chin: 0.525, x: 0.5 } };

export const EMPLOYEES = [
  { image: "/images/team-01.webp", role: "Founder & CEO", focus: { top: 0.124, chin: 0.378, x: 0.536 }, headSize: 0.36 },
  { image: "/images/team-02.webp", role: "Creative Design Manager", focus: { top: 0.095, chin: 0.526, x: 0.5 } },
  { image: "/images/team-03.webp", role: "Marketing Specialist", focus: { top: 0.143, chin: 0.344, x: 0.513 }, headSize: 0.36 },
  { image: "/images/team-04.webp", role: "Creative Developer", focus: { top: 0.345, chin: 0.69, x: 0.505 } },
  { image: "/images/team-05.webp", role: "3D Artist", focus: { top: 0.319, chin: 0.464, x: 0.487 }, headSize: 0.36 },
  { image: "/images/team-06.webp", role: "Visual Identity Designer", focus: { top: 0.075, chin: 0.42, x: 0.49 } },
  { image: "/images/team-07.webp", role: "Visual Content Producer", focus: { top: 0.168, chin: 0.355, x: 0.52 } },
  { image: "/images/team-08.webp", role: "Video & Motion Editor", focus: { top: 0.194, chin: 0.667, x: 0.51 } },
  { image: "/images/team-09.webp", role: "Social Media Strategist", focus: { top: 0.056, chin: 0.594, x: 0.51 }, extendTop: true },
];
