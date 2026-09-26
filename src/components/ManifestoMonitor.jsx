"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { vertexShader, fragmentShader } from "./shaders/monitorDisplayShader";
import { projects } from "@/data/projects";
import { whenIdle } from "@/lib/whenIdle";

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

    const textureLoader = new THREE.TextureLoader();
    const textureCache = {};

    function loadTexture(src) {
      if (textureCache[src]) return textureCache[src];

      const texture = textureLoader.load(src, () => {
        displayMaterial.uniforms.imageAspect.value =
          texture.image.width / texture.image.height;
      });

      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      textureCache[src] = texture;

      return texture;
    }

    const defaultTexture = loadTexture(DEFAULT_DISPLAY_IMAGE);

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
    function handlePointerMove(e) {
      if (!isIntersecting) return;

      const rect = container.getBoundingClientRect();
      const withinBounds =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (withinBounds) {
        mouse.x = ((e.clientX - rect.left) / rect.width - 0.5) * 10;
        mouse.y = ((e.clientY - rect.top) / rect.height - 0.5) * 5;
      } else {
        mouse.x = 0;
        mouse.y = 0;
      }
    }

    function handlePointerLeave() {
      mouse.x = 0;
      mouse.y = 0;
    }

    window.addEventListener("pointermove", handlePointerMove);
    document.documentElement.addEventListener("pointerleave", handlePointerLeave);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let glitchAnimation = null;
    const glitchState = { intensity: 0 };

    function setDisplayImage(src) {
      const texture = loadTexture(src);
      displayMaterial.uniforms.map.value = texture;

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

    function startAutoCycle() {
      if (autoCycleTimer !== null) return;
      autoCycleTimer = setInterval(() => {
        autoCycleIndex = (autoCycleIndex + 1) % MONITOR_PROJECTS.length;
        setDisplayImage(MONITOR_PROJECTS[autoCycleIndex].image);
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
      return [li, handler];
    });

    const handleListLeave = () => setDisplayImage(DEFAULT_DISPLAY_IMAGE);
    listEl.addEventListener("mouseleave", handleListLeave);

    return () => {
      disposed = true;
      stopAnimating();
      stopAutoCycle();
      mobileQuery.removeEventListener("change", handleMobileChange);

      window.removeEventListener("pointermove", handlePointerMove);
      document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();

      itemHandlers.forEach(([li, handler]) =>
        li.removeEventListener("mouseenter", handler)
      );
      listEl.removeEventListener("mouseleave", handleListLeave);

      if (glitchAnimation) glitchAnimation.kill();

      monitorGroup.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material?.dispose();
      });

      displayGeometry.dispose();
      displayMaterial.dispose();
      Object.values(textureCache).forEach((texture) => texture.dispose());

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
          <li key={project.name} data-img={project.image}>
            {project.name}
          </li>
        ))}
      </ul>
    </>
  );
}
