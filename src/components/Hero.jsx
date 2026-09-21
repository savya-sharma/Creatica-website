"use client";

import { useEffect, useRef, useState } from "react";
import UnicornScene from "unicornstudio-react";
import { onLenisReady } from "@/lib/lenis";

const UNICORN_PROJECT_ID = "MSft8uYsb5EatD4L14Wc";

export default function Hero() {
  const [isUnicornSceneReady, setIsUnicornSceneReady] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleUnicornSceneLoad = () => {
    if (isMountedRef.current) setIsUnicornSceneReady(true);
  };

  // a reload on Home should always land back on the Hero, never wherever
  // the page happened to be scrolled to - disabling the browser's own
  // scroll restoration (see the inline script in layout.js) is the root
  // fix for that, but this reaffirms position 0 on mount so nothing can be
  // visibly scrolled away from the top, and keeps Lenis's own scroll state
  // in sync so a later scroll doesn't snap back from a stale position
  useEffect(() => {
    window.scrollTo(0, 0);
    return onLenisReady((lenis) => lenis.scrollTo(0, { immediate: true }));
  }, []);

  return (
    <section className="hero">
      <div className="hero-unicorn-bg">
        <UnicornScene
          projectId={UNICORN_PROJECT_ID}
          width="100%"
          height="100%"
          scale={1}
          dpi={1.5}
          className={`hero-unicorn-canvas${
            isUnicornSceneReady ? " hero-unicorn-canvas--ready" : ""
          }`}
          onLoad={handleUnicornSceneLoad}
        />
      </div>

      <div className="hero-content">
        <div className="hero-lead">
          <p className="hero-eyebrow">
            We create digital experiences where technology and creativity
            speak the same language.
          </p>
          <span className="hero-heading-lead">where</span>
        </div>

        <div className="hero-heading-row">
          <h1 className="hero-heading">
            Ambitious ideas
            <br />
            become interfaces
            <br />
            people remember
          </h1>
        </div>
      </div>
    </section>
  );
}
