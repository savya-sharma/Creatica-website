import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { onPreloaderDone } from "@/lib/preloader";
import { createBloom } from "./bloom";

gsap.registerPlugin(ScrollTrigger);

// Motion for the Diwali composition, driven by the festival's `motion`
// settings (festivals/registry.js). Each function animates one mounted
// composition and returns its cleanup: every tween, ScrollTrigger and
// listener lives in one gsap.context (reverted on cleanup), plus the single
// pointer listener on the hero and the loader subscription.
//
// Only transform, opacity and clip-path are animated - nothing moves the
// layout. With reduced motion (or motion.enabled false) the art simply
// fades in and stays still: no loops, no pointer response.

const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function animateHero(root, motion) {
  const hero = root.parentElement;
  const mandala = root.querySelector(".diwali-rangoli");
  const eave = root.querySelector(".diwali-eave");
  const lanterns = [...root.querySelectorAll(".diwali-hanging")];
  const bunches = [...root.querySelectorAll(".diwali-bunch")];
  const diyas = [...root.querySelectorAll(".diwali-diya")];
  const flames = [...root.querySelectorAll(".diwali-flame")];
  const bloomCanvas = root.querySelector(".diwali-bloom");
  const lanternGlows = [...root.querySelectorAll(".diwali-lantern-glow")];
  const everything = [mandala, bloomCanvas, eave, ...lanterns, ...bunches, ...diyas].filter(Boolean);
  if (!everything.length) return () => {};

  const still = !motion?.enabled || prefersReduced();
  let unsubscribe = () => {};
  let removePointer = () => {};
  let embers = null;
  let bloom = null;
  // the latest pointer position and velocity (px/s), for the embers
  const pointer = { x: -1e4, y: -1e4, vx: 0, vy: 0, t: 0 };

  const ctx = gsap.context(() => {
    // hidden until the loader opens onto the hero (set before first paint)
    gsap.set(everything, { autoAlpha: 0 });
  }, root);

  // a named context method: created now, run later (inside the context, so
  // everything it makes is reverted on cleanup)
  ctx.add("enter", () => {
    // the lanterns' light in the air round them (bloom.js): drawn once,
    // still, with reduced motion; otherwise alive while the hero is on screen
    if (bloomCanvas && lanternGlows.length) bloom = createBloom(bloomCanvas, lanternGlows, motion);
    if (still) {
      bloom?.render();
      gsap.to(everything, { autoAlpha: 1, duration: 0.6, ease: "power1.out", stagger: 0.05 });
      return;
    }
    const tl = gsap.timeline({ delay: 0.5 });

    // the rangoli opens from its centre like an iris, settling from 96%
    if (mandala) {
      tl.fromTo(
        mandala,
        { clipPath: "circle(0% at 50% 50%)", scale: 0.96, autoAlpha: 1 },
        { clipPath: "circle(50% at 50% 50%)", scale: 1, duration: motion.mandalaReveal, ease: "power2.out" },
        0,
      );
      // a turn so slow it reads as stillness - paused while the hero is off screen
      if (motion.mandalaTurn > 0) {
        const spin = gsap.to(mandala, { rotation: "+=360", duration: motion.mandalaTurn, ease: "none", repeat: -1, paused: true });
        ScrollTrigger.create({
          trigger: hero,
          start: "top bottom",
          end: "bottom top",
          onToggle: (self) => (self.isActive ? spin.play() : spin.pause()),
        });
        tl.call(() => ScrollTrigger.isInViewport(hero) && spin.play(), null, motion.mandalaReveal * 0.6);
      }
      if (motion.mandalaParallax) {
        gsap.to(mandala, {
          yPercent: -motion.mandalaParallax * 100,
          ease: "none",
          scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
        });
      }
    }

    // the small pieces arrive one by one as the rangoli opens
    const at = motion.mandalaReveal * 0.35;
    // the eave slides in from its edge, the lanterns drop from it and sway,
    // each at its own pace
    if (eave) tl.fromTo(eave, { autoAlpha: 0, x: -24 }, { autoAlpha: 1, x: 0, duration: 1.3, ease: "power2.out" }, at);
    lanterns.forEach((lantern, i) => {
      const t = at + 0.35 + i * motion.entranceStagger;
      tl.fromTo(lantern, { autoAlpha: 0, y: -18 }, { autoAlpha: 1, y: 0, duration: 1.4, ease: "power2.out" }, t);
      gsap.set(lantern, { transformOrigin: "50% 0%", rotation: -motion.ornamentSway });
      tl.add(gsap.to(lantern, { rotation: motion.ornamentSway * (1 + i * 0.4), duration: 3.8 - i * 0.9, ease: "sine.inOut", yoyo: true, repeat: -1 }), t);
    });
    // their light spreads as they arrive, and their glass breathes with a
    // flame's flicker (the light in the air keeps its own gentle rhythm)
    if (bloomCanvas) tl.fromTo(bloomCanvas, { autoAlpha: 0 }, { autoAlpha: 1, duration: 2.4, ease: "power1.inOut" }, at + 0.2);
    if (bloom) {
      bloom.render();
      ScrollTrigger.create({
        trigger: hero,
        start: "top bottom",
        end: "bottom top",
        onToggle: (self) => (self.isActive ? bloom.play() : bloom.pause()),
      });
      if (ScrollTrigger.isInViewport(hero)) bloom.play();
    }
    lanternGlows.forEach((glow) => {
      gsap.to(glow, {
        opacity: `random(${1 - motion.lanternFlicker * 2}, 1)`,
        duration: "random(0.18, 0.45)",
        ease: "sine.inOut",
        repeat: -1,
        repeatRefresh: true,
      });
    });
    // the marigold clusters fade in, then stay still (no turning, no sway)
    bunches.forEach((bunch, i) => {
      const t = at + 0.2 + i * motion.entranceStagger;
      tl.fromTo(bunch, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.3, ease: "power2.out" }, t);
    });
    // the diyas by the headline
    diyas.forEach((diya, i) => {
      const t = at + 0.6 + i * motion.entranceStagger;
      tl.fromTo(diya, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 1.1, ease: "power2.out" }, t);
      // a slow float, each at its own pace
      tl.add(gsap.to(diya, { y: -motion.diyaFloat, duration: 2.6 + i * 0.7, ease: "sine.inOut", yoyo: true, repeat: -1 }), t + 1.1);
    });

    // flames breathe: small, smooth, irregular - never a strobe
    flames.forEach((flame) => {
      gsap.set(flame, { transformOrigin: "50% 100%" });
      gsap.to(flame, {
        scaleY: `random(${1 - motion.flameFlicker}, ${1 + motion.flameFlicker})`,
        scaleX: `random(${1 - motion.flameFlicker * 0.5}, ${1 + motion.flameFlicker * 0.3})`,
        opacity: "random(0.82, 1)",
        duration: "random(0.14, 0.32)",
        ease: "sine.inOut",
        repeat: -1,
        repeatRefresh: true,
      });
    });

    // golden embers from the flames, only while the hero is on screen
    const canvas = root.querySelector(".diwali-embers");
    if (canvas && flames.length && motion.embers > 0) {
      embers = createEmbers(canvas, flames, motion, pointer);
      ScrollTrigger.create({
        trigger: hero,
        start: "top bottom",
        end: "bottom top",
        onToggle: (self) => (self.isActive ? embers.play() : embers.pause()),
      });
      tl.call(() => ScrollTrigger.isInViewport(hero) && embers.play(), null, at + 1.4);
    }

    // a nearby pointer / finger: diyas lean a few pixels away, flames bend
    if (diyas.length && motion.proximityRadius > 0) {
      const lean = diyas.map((diya) => ({
        diya,
        x: gsap.quickTo(diya, "x", { duration: 0.8, ease: "power3.out" }),
        flame: diya.querySelector(".diwali-flame"),
      }));
      lean.forEach((l) => (l.bend = l.flame && gsap.quickTo(l.flame, "rotation", { duration: 0.6, ease: "power3.out" })));
      const onMove = (event) => {
        const dtp = Math.max(16, event.timeStamp - pointer.t) / 1000;
        if (pointer.t) {
          pointer.vx = (event.clientX - pointer.x) / dtp;
          pointer.vy = (event.clientY - pointer.y) / dtp;
        }
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        pointer.t = event.timeStamp;
        lean.forEach(({ diya, x, bend }) => {
          const r = diya.getBoundingClientRect();
          const dx = event.clientX - (r.left + r.width / 2);
          const dy = event.clientY - (r.top + r.height / 2);
          const d = Math.hypot(dx, dy);
          const pull = d < motion.proximityRadius ? (1 - d / motion.proximityRadius) ** 2 : 0;
          const dir = d ? dx / d : 0;
          x(-dir * motion.proximityLean * pull);
          bend?.(-dir * 14 * pull);
        });
      };
      const settle = () => lean.forEach(({ x, bend }) => (x(0), bend?.(0)));
      hero.addEventListener("pointermove", onMove, { passive: true });
      hero.addEventListener("pointerleave", settle);
      hero.addEventListener("pointercancel", settle);
      hero.addEventListener("pointerup", settle);
      removePointer = () => {
        hero.removeEventListener("pointermove", onMove);
        hero.removeEventListener("pointerleave", settle);
        hero.removeEventListener("pointercancel", settle);
        hero.removeEventListener("pointerup", settle);
      };
    }
  });

  // with the hero's other reveals: once the loader opens (at once if it has)
  unsubscribe = onPreloaderDone(() => ctx.enter());

  return () => {
    unsubscribe();
    removePointer();
    embers?.stop();
    bloom?.stop();
    ctx.revert();
  };
}

export function animateFooter(root, motion) {
  const footer = root.parentElement;
  const lantern = root.querySelector(".diwali-footer-lantern");
  if (!lantern) return () => {};

  const still = !motion?.enabled || prefersReduced();
  const ctx = gsap.context(() => {
    gsap.set(lantern, { autoAlpha: 0 });
    const tl = gsap.timeline({
      scrollTrigger: { trigger: footer, start: "top 85%", once: true },
    });
    if (still) {
      tl.to(lantern, { autoAlpha: 1, duration: 0.6 });
      return;
    }
    // the lantern drops in and swings to rest (one settling swing, no loop)
    gsap.set(lantern, { transformOrigin: "50% 0%" });
    tl.fromTo(lantern, { autoAlpha: 0, y: -16, rotation: 5 }, { autoAlpha: 1, y: 0, duration: motion.footerEntrance, ease: "power2.out" });
    tl.to(lantern, { rotation: 0, duration: 2.6, ease: "elastic.out(1, 0.45)" }, ">-0.4");
  }, root);
  return () => ctx.revert();
}

// Golden embers rising from the flames, on a small canvas covering only the
// corner around the diyas (never full screen). Drawn on GSAP's ticker - the
// site's existing frame loop, not a new one - with a pre-rendered glow
// sprite, at most MAX_EMBERS at a time. `pointer` (fed by the hero's pointer
// handler) carries nearby embers along with the pointer's movement.
const MAX_EMBERS = 60;

function emberSprite() {
  const size = 32;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255, 246, 214, 1)");
  grad.addColorStop(0.18, "rgba(255, 205, 96, 0.95)");
  grad.addColorStop(0.45, "rgba(244, 163, 0, 0.35)");
  grad.addColorStop(1, "rgba(227, 66, 52, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function createEmbers(canvas, flames, motion, pointer) {
  const ctx2d = canvas.getContext("2d");
  const sprite = emberSprite();
  const embers = [];
  let width = 0;
  let height = 0;
  let ratio = 1;
  let box = null;
  let spawn = 0;
  let time = 0;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = r.width;
    height = r.height;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  const step = (_, deltaMs) => {
    const dt = Math.min(deltaMs, 50) / 1000;
    time += dt;
    box = canvas.getBoundingClientRect();
    // new embers from each visible flame's tip
    spawn += dt * motion.embers;
    while (spawn >= 1 && embers.length < MAX_EMBERS) {
      spawn -= 1;
      flames.forEach((flame) => {
        const r = flame.getBoundingClientRect();
        if (!r.width) return;
        embers.push({
          x: r.left + r.width / 2 - box.left + (Math.random() - 0.5) * r.width * 0.4,
          y: r.top - box.top + r.height * 0.15,
          vx: (Math.random() - 0.5) * 8,
          vy: -(16 + Math.random() * 18),
          life: 0,
          max: 1.6 + Math.random() * 1.6,
          size: 4 + Math.random() * 5,
          phase: Math.random() * 6.28,
        });
      });
    }
    spawn = Math.min(spawn, 1);
    // pointer movement nearby carries them, fading over ~120px
    const px = pointer.x - box.left;
    const py = pointer.y - box.top;
    ctx2d.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx2d.clearRect(0, 0, width, height);
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.life += dt;
      if (e.life >= e.max || e.y < -10) {
        embers.splice(i, 1);
        continue;
      }
      const near = Math.max(0, 1 - Math.hypot(e.x - px, e.y - py) / 120);
      e.vx += (pointer.vx * motion.emberPush * near - e.vx * 0.9) * dt;
      e.vy += (pointer.vy * motion.emberPush * near * 0.5 - 4) * dt;
      e.x += (e.vx + Math.sin(time * 2.2 + e.phase) * 6) * dt;
      e.y += e.vy * dt;
      const k = e.life / e.max;
      ctx2d.globalAlpha = Math.sin(Math.PI * k) * 0.9;
      const s = e.size * (1 - k * 0.5);
      ctx2d.drawImage(sprite, e.x - s / 2, e.y - s / 2, s, s);
    }
    ctx2d.globalAlpha = 1;
    // the pointer's push dies away when it stops
    pointer.vx *= 0.9;
    pointer.vy *= 0.9;
  };

  let running = false;
  const play = () => {
    if (running) return;
    running = true;
    gsap.ticker.add(step);
  };
  const pause = () => {
    if (!running) return;
    running = false;
    gsap.ticker.remove(step);
  };
  return {
    play,
    pause,
    stop() {
      pause();
      observer.disconnect();
      embers.length = 0;
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
