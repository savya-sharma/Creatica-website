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
export const EMPLOYEES = [
  { image: "/images/team-01.webp", role: "Founder", focus: { top: 0.38, chin: 0.5425, x: 0.458 } },
  { image: "/images/team-02.webp", role: "Assistant Manager & Senior Graphic Designer", focus: { top: 0.095, chin: 0.526, x: 0.5 } },
  { image: "/images/team-03.webp", role: "Junior Graphic Designer", focus: { top: 0.075, chin: 0.42, x: 0.49 } },
  { image: "/images/team-04.webp", role: "Creative Developer", focus: { top: 0.485, chin: 0.587, x: 0.548 } },
  { image: "/images/team-05.webp", role: "3D Artist", focus: { top: 0.41, chin: 0.506, x: 0.555 } },
  { image: "/images/team-06.webp", role: "Video Creator", focus: { top: 0.168, chin: 0.355, x: 0.52 } },
  { image: "/images/team-07.webp", role: "Video Editor", focus: { top: 0.194, chin: 0.667, x: 0.51 } },
  { image: "/images/team-08.webp", role: "Marketing Specialist", focus: { top: 0.045, chin: 0.383, x: 0.48 } },
];
