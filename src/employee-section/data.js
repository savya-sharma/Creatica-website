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

// Placeholder for members without a photo yet: an Instagram-style blank
// profile (white head + shoulders on light grey), with its head framed like
// the photos. The real photo each placeholder stands in for is noted on its
// line - swap it back in (with its own focus) when it's ready.
const BLANK = { image: "/images/team-blank.webp", focus: { top: 0.275, chin: 0.525, x: 0.5 } };

export const EMPLOYEES = [
  { ...BLANK, role: "Founder & CEO" }, // photo: /images/team-01.webp, focus: { top: 0.38, chin: 0.5425, x: 0.458 }
  { ...BLANK, role: "Creative Design Manager" }, // photo: /images/team-02.webp, focus: { top: 0.095, chin: 0.526, x: 0.5 }
  { image: "/images/team-03.webp", role: "Marketing Specialist", focus: { top: 0.045, chin: 0.383, x: 0.48 } },
  { ...BLANK, role: "Creative Developer" }, // photo: /images/team-04.webp, focus: { top: 0.485, chin: 0.587, x: 0.548 }
  { ...BLANK, role: "3D Artist" }, // photo: /images/team-05.webp, focus: { top: 0.41, chin: 0.506, x: 0.555 }
  { ...BLANK, role: "Visual Identity Designer" }, // photo: /images/team-06.webp, focus: { top: 0.075, chin: 0.42, x: 0.49 }
  { ...BLANK, role: "Visual Content Producer" }, // photo: /images/team-07.webp, focus: { top: 0.168, chin: 0.355, x: 0.52 }
  { ...BLANK, role: "Video & Motion Editor" }, // photo: /images/team-08.webp, focus: { top: 0.194, chin: 0.667, x: 0.51 }
];
