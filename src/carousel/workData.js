const IMAGE_COUNT = 14;

// The carousel's items: all 14 images in public/ProjectsImg, in order.
// RingCarousel.js only reads `item.src` so far (see buildPlanes() ->
// getTexture(item.src)); kept as its own small adapter file, out of
// RingCarousel.js itself, per the integration brief.
export const workSlides = Array.from({ length: IMAGE_COUNT }, (_, i) => ({
  src: `/ProjectsImg/ASSET${i + 1}.webp`,
}));
