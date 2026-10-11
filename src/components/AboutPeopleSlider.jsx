"use client";

import { useEffect, useRef } from "react";
import { EmployeeCarousel } from "@/employee-section/EmployeeCarousel";
import { DragCursor } from "@/employee-section/dragCursor";
import { EMPLOYEES } from "@/employee-section/data";
import "@/employee-section/people.css";

// The employee Three.js slider (src/employee-section), mounted on its own
// stage - same carousel + drag cursor wiring as createPeopleSection(), minus
// that section's own heading; it is the last section of the About page.
// The carousel is created after hydration and fully disposed on unmount, so
// About -> elsewhere -> About gets a fresh WebGL context each time.
export default function AboutPeopleSlider() {
  const stageRef = useRef(null);
  const liveRef = useRef(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let carousel = null;
    let cursor = null;
    try {
      carousel = new EmployeeCarousel(stage, EMPLOYEES, {
        onActiveChange(employee, index) {
          stage.dataset.activeIndex = String(index);
          if (liveRef.current) liveRef.current.textContent = employee.role;
        },
      });
      // "DRAG" cursor while the mouse is over a portrait image
      cursor = new DragCursor(stage, { hitTest: (x, y) => carousel?.isOverImage(x, y) ?? false });
    } catch (error) {
      // no WebGL: hide the empty stage
      console.warn("[people] WebGL unavailable", error);
      stage.parentElement?.classList.add("is-webgl-unavailable");
    }

    return () => {
      cursor?.dispose();
      carousel?.dispose();
    };
  }, []);

  return (
    <div className="about-people">
      <div
        ref={stageRef}
        className="people-carousel"
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label="Team portraits. Drag, swipe or use the arrow keys to browse."
      />
      {/* a div, not a <p>: About's SplitText line reveal targets every p */}
      <div ref={liveRef} className="people-section__live" aria-live="polite" />
    </div>
  );
}
