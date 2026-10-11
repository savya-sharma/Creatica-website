import { AboutFluidBackground } from "./backgroundFluid.js";
import { DragCursor } from "./dragCursor.js";
import { collectFluidTexts } from "./fluidText.js";
import { EmployeeCarousel } from "./EmployeeCarousel.js";
import { EMPLOYEES } from "./data.js";
import { clearImageSourceCache } from "./imageCache.js";
import "./people.css";

export { AboutFluidBackground, EmployeeCarousel, EMPLOYEES, clearImageSourceCache, collectFluidTexts };

/** Warm the image cache early (e.g. on About-link hover) - optional. */
export function preloadPeopleImages(employees = EMPLOYEES) {
  // Warms the HTTP cache only; framing happens when the carousel mounts.
  for (const employee of employees) {
    const img = new Image();
    img.src = employee.image;
  }
}

/**
 * Builds the "People Behind the Work" section. Insert `element` between the
 * Founder section and the final CTA, call `mount()` once it is in the DOM and
 * `unmount()` when leaving the page. Both are idempotent, so React strict-mode
 * double effects are safe:
 *
 *   useEffect(() => { section.mount(); return () => section.unmount(); }, []);
 */
export function createPeopleSection({ employees = EMPLOYEES, title = "The People Behind the Work", ...options } = {}) {
  const element = document.createElement("section");
  element.className = "people-section";
  element.setAttribute("aria-labelledby", "people-title");
  element.innerHTML = `
    <header class="people-section__intro">
      <p class="people-section__eyebrow">Our People</p>
      <h2 class="people-section__title" id="people-title"></h2>
    </header>
    <div class="people-carousel" tabindex="0" role="region" aria-roledescription="carousel"
         aria-label="Team portraits. Drag, swipe or use the arrow keys to browse."></div>
    <p class="people-section__live" aria-live="polite"></p>
  `;
  element.querySelector(".people-section__title").textContent = title;
  const stage = element.querySelector(".people-carousel");
  const live = element.querySelector(".people-section__live");

  let carousel = null;
  let cursor = null;

  return {
    element,
    get carousel() {
      return carousel;
    },
    mount() {
      if (carousel) return carousel;
      try {
        carousel = new EmployeeCarousel(stage, employees, {
          ...options,
          // Hook for the future name/role reveal. For now it only feeds the
          // screen-reader live region and a data attribute.
          onActiveChange(employee, index) {
            stage.dataset.activeIndex = String(index);
            live.textContent = employee.role;
            options.onActiveChange?.(employee, index);
          },
        });
      } catch (error) {
        // No WebGL: keep the heading, hide the empty stage.
        console.warn("[people] WebGL unavailable", error);
        element.classList.add("is-webgl-unavailable");
      }
      // "DRAG" cursor while the mouse is over a portrait image
      if (carousel && !cursor) {
        cursor = new DragCursor(stage, { hitTest: (x, y) => carousel?.isOverImage(x, y) ?? false });
      }
      return carousel;
    },
    unmount() {
      cursor?.dispose();
      cursor = null;
      carousel?.dispose();
      carousel = null;
    },
  };
}
