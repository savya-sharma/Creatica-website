"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { vertexShader, fragmentShader } from "./shaders/monitorDisplayShader";
import { projects } from "@/data/projects";
import { whenIdle } from "@/lib/whenIdle";
import { onPreloaderDone } from "@/lib/preloader";
import RollingText from "./RollingText";

const DEFAULT_DISPLAY_IMAGE = "/BrandsImg/DEFAULT-IMG-2048.webp";
const MONITOR_PROJECTS = projects.map((project) => ({
  name: project.name,
  image: project.image,
}));

function createScreenGeometry(w, h, r) {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;

  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);

  const geometry = new THREE.ShapeGeometry(shape);
  const positions = geometry.attributes.position;
  const uvs = new Float32Array(positions.count * 2);

  for (let i = 0; i < positions.count; i++) {
    uvs[i * 2] = (positions.getX(i) - x) / w;
    uvs[i * 2 + 1] = (positions.getY(i) - y) / h;
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

export default function ManifestoMonitor() {
  const containerRef = useRef(null);
  const listRef = useRef(null);

  // Everything below - renderer, PMREM environment, monitor.glb, textures -
  // used to run synchronously the moment Home mounted, ahead of the hero
  // being usable. It now runs from idle time (see the effect after this).
  function initMonitor(container, listEl) {

    let disposed = false;
    let frameId = null;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
    camera.position.set(0, 0.15, 1);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.domElement.className = "manifesto-monitor-canvas";
    container.appendChild(renderer.domElement);

    // the monitor material is fully metallic (metalness: 1) with low
    // roughness, so it has virtually no diffuse response - without an
    // environment map to reflect, direct lights alone leave it looking flat
    // black instead of the silver/brushed-metal finish the asset was made for
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;

    scene.add(new THREE.AmbientLight(0xffffff, 5));

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(15, 10, -5);
    scene.add(dirLight);

    const topLight = new THREE.PointLight(0xffffff, 5, 10);
    topLight.position.set(-5, -2.5, 0);
    topLight.decay = 0.3;
    scene.add(topLight);

    const monitorGroup = new THREE.Group();
    // nudged up from dead-center so there's a clear gap between the monitor
    // and the project buttons anchored near the bottom of the section
    monitorGroup.position.y = 0.09;
    scene.add(monitorGroup);

    const gltfLoader = new GLTFLoader();
    gltfLoader.load("/model/monitor.glb", (gltf) => {
      if (disposed) return;
      const model = gltf.scene;
      const center = new THREE.Box3()
        .setFromObject(model)
        .getCenter(new THREE.Vector3());
      model.position.sub(center);
      monitorGroup.add(model);
    });

    // The brand images are display-sized copies (1426x1600, ~9 MB each once
    // decoded - see scripts/optimize-brand-images.mjs). The 3353x3763
    // originals were 48 MB each, ~1 GB for the set and twice that counting
    // the bitmaps kept alongside the GPU textures: past iOS WebKit's per-tab
    // memory limit, so the page was killed and reloaded right after the
    // preloader, over and over.
    // Loaded through an <img>, the decode and the flip-Y happen synchronously
    // inside the GPU upload, on the main thread: preloading all of them at
    // once used to freeze the page for seconds right as the preloader handed
    // over to the Hero, stalling its fluid. createImageBitmap
    // decodes (and flips) off the main thread instead; the pixels reaching
    // the GPU are identical - an sRGB texture is uploaded with no colour
    // conversion and no premultiply either way.
    const bitmapLoader =
      typeof createImageBitmap === "function"
        ? new THREE.ImageBitmapLoader().setOptions({
            imageOrientation: "flipY",
            premultiplyAlpha: "none",
          })
        : null;
    const imageLoader = bitmapLoader ? null : new THREE.ImageLoader();
    const textureCache = {};
    const textureReady = {};

    // Returns the texture straight away (callers bind it immediately); its
    // image arrives once decoded, and three uploads it on first use - or
    // earlier, from the idle-time preload below.
    function loadTexture(src) {
      if (textureCache[src]) return textureCache[src];

      const texture = new THREE.Texture();
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      // an ImageBitmap was already flipped while decoding
      texture.flipY = !bitmapLoader;
      textureCache[src] = texture;

      textureReady[src] = new Promise((resolve) => {
        const onImage = (image) => {
          // disposed, or released by trimTextures() while still decoding
          if (disposed || textureCache[src] !== texture) {
            image.close?.();
            resolve();
            return;
          }
          texture.image = image;
          texture.needsUpdate = true;
          // only the image actually on screen sets the screen's aspect - a
          // background preload finishing must not re-fit the current image
          if (displayMaterial.uniforms.map.value === texture) {
            displayMaterial.uniforms.imageAspect.value = image.width / image.height;
          }
          resolve();
        };
        if (bitmapLoader) {
          bitmapLoader.load(src, onImage, undefined, () => resolve());
        } else {
          imageLoader.load(
            src,
            // decode() also runs off the main thread where it can
            (img) => img.decode().catch(() => {}).then(() => onImage(img)),
            undefined,
            () => resolve()
          );
        }
      });

      return texture;
    }

    // Holding every brand decoded at once only pays off where a hover would
    // otherwise wait on a decode. Touch devices have no hover (the phone
    // layout auto-cycles, a tablet tap loads on demand), and are exactly the
    // memory-constrained ones, so there only what is on screen, the default
    // and the next image are kept - the rest are freed, GPU and bitmap both.
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    function releaseTexture(src) {
      const texture = textureCache[src];
      if (!texture) return;
      delete textureCache[src];
      delete textureReady[src];
      texture.dispose();
      texture.image?.close?.();
    }

    function trimTextures(keep) {
      Object.keys(textureCache).forEach((src) => {
        if (!keep.includes(src)) releaseTexture(src);
      });
    }

    const defaultTexture = loadTexture(DEFAULT_DISPLAY_IMAGE);

    // Pre-warm every brand's texture so no hover has to pay for a decode +
    // GPU upload it's the first to trigger - only once the entry preloader
    // has finished (kicking this off during it competed with its tile
    // animation), and then one image at a time: each is decoded off-thread,
    // then uploaded in browser idle time. Uploading a 48 MB texture still
    // costs the main thread, so they're never batched, and never land in the
    // middle of a busy frame - the Hero (fluid, text) keeps its frames
    // through the whole preload. A pill hovered before its turn simply loads
    // that one right away, as before.
    let cancelPendingUpload = () => {};
    async function preloadTextures() {
      for (const project of MONITOR_PROJECTS) {
        if (disposed) return;
        const texture = loadTexture(project.image);
        await textureReady[project.image];
        if (disposed) return;
        if (!texture.image) continue; // failed to load - a hover retries nothing, same as before
        await new Promise((resolve) => {
          // initTexture is a no-op for a texture a hover already uploaded
          cancelPendingUpload = whenIdle(() => {
            if (!disposed) renderer.initTexture(texture);
            resolve();
          });
        });
      }
    }
    const cancelTexturePreload = canHover
      ? onPreloaderDone(() => {
          if (!disposed) preloadTextures();
        })
      : () => {};

    const displayMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: defaultTexture },
        imageAspect: { value: 1 },
        planeAspect: { value: 0.28 / 0.235 },
        iResolution: { value: new THREE.Vector2(512, 512) },
        glitchIntensity: { value: 0.0 },
        time: { value: 0.0 },
      },
      vertexShader,
      fragmentShader,
    });

    const displayGeometry = createScreenGeometry(1, 1, 0.03);
    const displayPlane = new THREE.Mesh(displayGeometry, displayMaterial);
    displayPlane.scale.set(0.28, 0.235, 1);
    displayPlane.position.set(-0.008, 0.005, 0.041);
    displayPlane.rotation.set(-0.18, 0, 0);
    monitorGroup.add(displayPlane);

    const mouse = { x: 0, y: 0 };
    const lerpedMouse = { x: 0, y: 0 };
    // latest raw pointer position; resolved against the container's rect
    // once per rendered frame instead of once per pointermove event (a
    // high-polling mouse fires several per frame, each forcing a layout read)
    const rawPointer = { x: 0, y: 0, pending: false };
    const timer = new THREE.Timer();

    // the aspect ratio this scene was composed at (roughly the desktop
    // viewport it was tuned against) - the vertical-FOV camera's
    // horizontal coverage narrows along with the aspect ratio, so any
    // viewport narrower than this needs the camera pulled back further or
    // the monitor's sides get cropped
    const DESKTOP_ASPECT = 1.5;
    const DESKTOP_BREAKPOINT = 1000; // matches the sitewide tablet breakpoint - desktop above this is untouched
    // matches the CSS breakpoint (see .manifesto-monitor's max-width:640px
    // rule) where the 3D viewport switches from filling the whole section
    // to a small, fixed-aspect contained box - only THAT box is small
    // enough on an actual phone screen to need extra magnification below
    const MOBILE_BREAKPOINT_WIDTH = 640;
    const SMALL_SCREEN_ZOOM = 0.2; // extra camera-distance multiplier on the compact mobile box only - smaller = closer camera = larger monitor

    function resize() {
      const { clientWidth: w, clientHeight: h } = container;
      if (!w || !h) return;

      const aspect = w / h;
      camera.aspect = aspect;

      let z = Math.max(1, 768 / h);

      // everything below is tablet/mobile-only - desktop (>1000px) keeps
      // exactly the plain height-based z above, untouched
      if (w <= DESKTOP_BREAKPOINT) {
        // narrower-than-desktop containers show less width at a given
        // distance (frustum width = frustum height * aspect) - pulling the
        // camera back in proportion to how much narrower keeps the same
        // width coverage regardless of the container's absolute size, so
        // this alone is safe for a full-height tablet-portrait fill as
        // much as the small mobile box below
        if (aspect < DESKTOP_ASPECT) {
          z *= DESKTOP_ASPECT / aspect;
        }

        // the compact mobile monitor box is small enough on an actual
        // phone screen that it still reads too small/thin even after the
        // width correction above, so it gets an additional, deliberate
        // zoom-in. Nothing else in the <=1000px range needs this: a
        // tablet in portrait or a phone in landscape both keep filling
        // the section at a size the correction above already handles
        // correctly - applying this same push-in there was over-zooming
        // the camera almost inside the screen, cropping the monitor on
        // every side
        if (w <= MOBILE_BREAKPOINT_WIDTH) {
          z *= SMALL_SCREEN_ZOOM;
        }
      }

      camera.position.z = z;
      // moving along z without re-aiming shifts the look angle (the camera
      // sits off-axis at y=0.15, so its pitch to the origin depends on z) -
      // this ResizeObserver-driven resize() can fire from layout shifts as
      // small as a hover state changing the list's size, so it has to
      // re-lookAt every time or the monitor drifts off-target
      camera.lookAt(0, 0, 0);

      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
    }

    resize();

    function animate() {
      frameId = requestAnimationFrame(animate);

      timer.update();
      displayMaterial.uniforms.time.value = timer.getElapsed();

      if (rawPointer.pending) {
        rawPointer.pending = false;
        resolvePointer(rawPointer.x, rawPointer.y);
      }

      lerpedMouse.x = gsap.utils.interpolate(lerpedMouse.x, mouse.x, 0.05);
      lerpedMouse.y = gsap.utils.interpolate(lerpedMouse.y, mouse.y, 0.05);
      monitorGroup.rotation.x = lerpedMouse.y * 0.15;
      monitorGroup.rotation.y = lerpedMouse.x * 0.15;

      renderer.render(scene, camera);
    }

    function startAnimating() {
      if (frameId === null) animate();
    }

    function stopAnimating() {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    }

    startAnimating();

    // tracked on window and gated on the container's own geometry, rather
    // than container.addEventListener("pointermove"/"pointerleave") - the
    // brand button list sits visually on top of this container (a higher
    // z-index sibling, not a child), so the browser's hit-testing treats a
    // hovered button as "leaving" the container underneath it, firing a
    // pointerleave that reset the parallax tilt every time. Computing
    // whether the cursor is within the container's rect directly sidesteps
    // that entirely - the image/glitch hover logic below never touches any
    // of this, so it stays completely decoupled from the 3D transform
    function resolvePointer(clientX, clientY) {
      const rect = container.getBoundingClientRect();
      const withinBounds =
        rect.width > 0 &&
        rect.height > 0 &&
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;

      if (withinBounds) {
        mouse.x = ((clientX - rect.left) / rect.width - 0.5) * 10;
        mouse.y = ((clientY - rect.top) / rect.height - 0.5) * 5;
      } else {
        mouse.x = 0;
        mouse.y = 0;
      }
    }

    function handlePointerMove(e) {
      // a finger dragging to scroll the page is not aiming at the monitor
      if (!isIntersecting || e.pointerType === "touch") return;
      rawPointer.x = e.clientX;
      rawPointer.y = e.clientY;
      rawPointer.pending = true;
    }

    function handlePointerLeave() {
      rawPointer.pending = false;
      mouse.x = 0;
      mouse.y = 0;
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", handlePointerLeave);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let glitchAnimation = null;
    const glitchState = { intensity: 0 };
    let currentSrc = DEFAULT_DISPLAY_IMAGE;

    // `nextSrc` is decoded ahead of time, so the following switch is instant
    function setDisplayImage(src, nextSrc) {
      // one pill can report the same intent twice in a row (a click fires
      // mouseenter, then focus, then click) - only a real change of image
      // gets the glitch transition, never a restart of the one in flight
      if (src === currentSrc) return;
      currentSrc = src;
      const texture = loadTexture(src);
      displayMaterial.uniforms.map.value = texture;
      if (nextSrc) loadTexture(nextSrc);
      if (!canHover) trimTextures([DEFAULT_DISPLAY_IMAGE, src, nextSrc]);

      if (glitchAnimation) glitchAnimation.kill();
      glitchState.intensity = 1.0;
      displayMaterial.uniforms.glitchIntensity.value = glitchState.intensity;

      glitchAnimation = gsap.to(glitchState, {
        intensity: 0,
        duration: 0.75,
        ease: "power3.out",
        onUpdate() {
          displayMaterial.uniforms.glitchIntensity.value = glitchState.intensity;
        },
      });

      if (texture.image) {
        displayMaterial.uniforms.imageAspect.value =
          texture.image.width / texture.image.height;
      }
    }

    // on mobile there's no hoverable button list, so the monitor cycles
    // through every brand on its own instead, reusing the exact same
    // glitch transition that hovering a button triggers on desktop/tablet
    const MOBILE_BREAKPOINT = `(max-width: ${MOBILE_BREAKPOINT_WIDTH}px)`; // same breakpoint used by resize() above
    const AUTO_CYCLE_INTERVAL = 2800; // ms each brand stays on screen
    const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT);
    let isMobile = mobileQuery.matches;
    let isIntersecting = false;
    let autoCycleTimer = null;
    let autoCycleIndex = 0;

    const cycleImage = (index) => MONITOR_PROJECTS[index % MONITOR_PROJECTS.length].image;

    function startAutoCycle() {
      if (autoCycleTimer !== null) return;
      loadTexture(cycleImage(autoCycleIndex + 1));
      autoCycleTimer = setInterval(() => {
        autoCycleIndex = (autoCycleIndex + 1) % MONITOR_PROJECTS.length;
        setDisplayImage(cycleImage(autoCycleIndex), cycleImage(autoCycleIndex + 1));
      }, AUTO_CYCLE_INTERVAL);
    }

    function stopAutoCycle() {
      if (autoCycleTimer !== null) {
        clearInterval(autoCycleTimer);
        autoCycleTimer = null;
      }
    }

    function syncAutoCycle() {
      if (isMobile && isIntersecting) startAutoCycle();
      else stopAutoCycle();
    }

    function handleMobileChange(e) {
      isMobile = e.matches;
      if (!isMobile) {
        autoCycleIndex = 0;
        setDisplayImage(DEFAULT_DISPLAY_IMAGE);
      }
      syncAutoCycle();
    }

    mobileQuery.addEventListener("change", handleMobileChange);

    // pause rendering (and the auto-cycle) while the section is off-screen
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isIntersecting = entry.isIntersecting;
        if (isIntersecting) startAnimating();
        else stopAnimating();
        syncAutoCycle();
      },
      { threshold: 0 }
    );
    visibilityObserver.observe(container);

    const items = Array.from(listEl.querySelectorAll("li"));
    const itemHandlers = items.map((li) => {
      const handler = () => {
        const img = li.getAttribute("data-img");
        if (img) setDisplayImage(img);
      };
      li.addEventListener("mouseenter", handler);
      // keyboard-focusing a pill previews it exactly like hovering one does
      // (tabIndex/role are set on the element itself, see the JSX below) -
      // this also gives RollingText's own focus/blur listeners on this same
      // <li> something to actually fire on, since a plain <li> is never
      // natively focusable
      li.addEventListener("focus", handler);
      // a tap (tablets show this list but have no hover) or a click that
      // comes after the pointer already previewed it - harmless either way,
      // setDisplayImage ignores a repeat of the current image
      li.addEventListener("click", handler);
      return [li, handler];
    });

    const handleListLeave = () => setDisplayImage(DEFAULT_DISPLAY_IMAGE);
    listEl.addEventListener("mouseleave", handleListLeave);

    // mirrors mouseleave, but for keyboard: focusout bubbles for *every*
    // blur, including tabbing from one pill straight to the next within
    // this same list - only reset to the default image when focus leaves
    // the list entirely, exactly like moving the mouse from one pill
    // directly onto the next never resets to the default image first (the
    // next pill's own "focus" handler above sets its image immediately,
    // so resetting here too would fire two glitch transitions back to back)
    function handleListFocusOut(event) {
      if (listEl.contains(event.relatedTarget)) return;
      handleListLeave();
    }
    listEl.addEventListener("focusout", handleListFocusOut);

    return () => {
      disposed = true;
      cancelTexturePreload();
      cancelPendingUpload();
      stopAnimating();
      stopAutoCycle();
      mobileQuery.removeEventListener("change", handleMobileChange);

      window.removeEventListener("pointermove", handlePointerMove);
      document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();

      itemHandlers.forEach(([li, handler]) => {
        li.removeEventListener("mouseenter", handler);
        li.removeEventListener("focus", handler);
        li.removeEventListener("click", handler);
      });
      listEl.removeEventListener("mouseleave", handleListLeave);
      listEl.removeEventListener("focusout", handleListFocusOut);

      if (glitchAnimation) glitchAnimation.kill();

      monitorGroup.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material?.dispose();
      });

      displayGeometry.dispose();
      displayMaterial.dispose();
      Object.values(textureCache).forEach((texture) => {
        texture.dispose();
        // decoded bitmaps hold their pixels outside the GPU texture too
        texture.image?.close?.();
      });

      envTexture.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }

  useEffect(() => {
    const container = containerRef.current;
    const listEl = listRef.current;
    if (!container || !listEl) return undefined;
    let teardown = null;
    const cancelIdle = whenIdle(() => {
      teardown = initMonitor(container, listEl);
    });
    return () => {
      cancelIdle();
      teardown?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the list is a sibling of the canvas container, not nested inside it,
  // so container.clientWidth/clientHeight (what the resize() above measures
  // for the camera/renderer) always reflects only the 3D viewport itself -
  // never inflated by the list's own height. On desktop this renders
  // identically to before (the list is absolutely positioned back over the
  // monitor via CSS); on mobile it lets the list flow in normal document
  // flow directly beneath the monitor instead.
  return (
    <>
      <div className="manifesto-monitor" ref={containerRef} />
      <ul className="manifesto-projects" ref={listRef}>
        {MONITOR_PROJECTS.map((project) => (
          <li
            key={project.name}
            className="btn-glass"
            data-img={project.image}
            // focusable so keyboard users reach the same "preview this
            // brand on the monitor" feedback a mouse hover gives (see the
            // focus/focusout wiring above) - no role="button": there's no
            // separate activation step to announce, focusing IS the whole
            // interaction, exactly like hovering is for a mouse
            tabIndex={0}
            aria-label={`Preview ${project.name} on the monitor`}
          >
            <RollingText>{project.name}</RollingText>
          </li>
        ))}
      </ul>
    </>
  );
}
