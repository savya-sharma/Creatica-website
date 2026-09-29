import * as THREE from "three";
import { spaceGridVertex, spaceGridFragment, particleVertex, particleFragment } from "./shaders.js";

// Deterministic random (mulberry32): the same field on every load.
function random(seed) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Dark spatial environment behind the carousel: a fine perspective grid on a
 * ceiling plane receding to the horizon, and sparse glowing fireflies
 * floating in the space around the ring. Lives in the carousel's own scene and render loop; everything
 * moves on the GPU from fixed seeds, so a frame only writes a time uniform
 * and a resize only writes layout uniforms.
 *
 * Both layers draw right after the backdrop (renderOrder) with additive
 * blending and no depth, before the floor, occluder and cards, so the water
 * and the cards always cover them. They stay in the opaque list (not
 * `transparent`) so renderOrder holds them there.
 */
export class SpaceBackground {
    constructor(scene, { color, particleCount, upperCount = 0 }) {
        this.group = new THREE.Group();
        scene.add(this.group);

        this.gridUniforms = {
            uColor: { value: color.clone() },
            uStrength: { value: 0.55 },
            uCell: { value: 1 },
            uFogDistance: { value: 20 },
            uNear: { value: 1 },
            uHalfWidth: { value: 50 },
            uTime: { value: 0 },
            uDrift: { value: 0 },
        };
        this.grid = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.ShaderMaterial({
                uniforms: this.gridUniforms,
                vertexShader: spaceGridVertex,
                fragmentShader: spaceGridFragment,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthTest: false,
                depthWrite: false,
            }),
        );
        this.grid.rotation.x = Math.PI / 2; // horizontal, seen from below
        this.grid.frustumCulled = false;
        this.grid.renderOrder = -2.8;
        this.group.add(this.grid);

        // Unit-box seeds: home position (0..1 in each axis) and per-firefly
        // phase, speed, size and intensity. Homes lean toward the sides and
        // the upper area, the empty space around the ring; the centre is
        // mostly behind the cards anyway.
        // The extra `upperCount` fireflies live only in the upper part of the
        // volume (the background above and behind the ring), spread across
        // the full width and depth.
        const rand = random(5867);
        const total = particleCount + upperCount;
        const positions = new Float32Array(total * 3);
        const seeds = new Float32Array(total * 4);
        for (let i = 0; i < total; i++) {
            if (i < particleCount) {
                const side = rand() < 0.5 ? -1 : 1;
                positions[i * 3] = 0.5 + side * 0.5 * Math.pow(rand(), 0.6);
                positions[i * 3 + 1] = Math.pow(rand(), 0.7);
            } else {
                positions[i * 3] = rand();
                positions[i * 3 + 1] = 0.6 + 0.4 * rand();
            }
            positions[i * 3 + 2] = rand();
            seeds[i * 4] = rand();
            seeds[i * 4 + 1] = rand();
            seeds[i * 4 + 2] = rand();
            seeds[i * 4 + 3] = rand();
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));

        this.particleUniforms = {
            uBoxMin: { value: new THREE.Vector3() },
            uBoxSize: { value: new THREE.Vector3(1, 1, 1) },
            uTime: this.gridUniforms.uTime,
            uWander: { value: 0 },
            uSizeScale: { value: 1 },
            uMinSize: { value: 6 },
            uMaxSize: { value: 24 },
            uFogDistance: this.gridUniforms.uFogDistance,
            // Glow in the theme colour; the tiny core leans a little to white.
            uColor: { value: color.clone().multiplyScalar(3) },
            uCoreColor: { value: color.clone().lerp(new THREE.Color(1, 1, 1), 0.35).multiplyScalar(2.2) },
            uStrength: { value: 1 },
        };
        this.particles = new THREE.Points(
            geometry,
            new THREE.ShaderMaterial({
                uniforms: this.particleUniforms,
                vertexShader: particleVertex,
                fragmentShader: particleFragment,
                blending: THREE.AdditiveBlending,
                depthTest: false,
                depthWrite: false,
            }),
        );
        this.particles.frustumCulled = false; // positions are built on the GPU
        this.particles.renderOrder = -2.6;
        this.group.add(this.particles);
    }

    // Everything scales with the carousel layout (world units) and the
    // drawing buffer (pixels).
    resize(layout, cameraY, floorY, bufferHeight, pixelRatio) {
        const { radius, distance, frameH, cardW, tanHalf } = layout;
        const depth = distance + radius * 4;

        // Ceiling well above the camera, spanning from behind it to far past
        // the ring, so it recedes to the horizon at the top of the frame.
        const g = this.gridUniforms;
        const ceiling = cameraY + frameH * 1.4;
        this.grid.position.set(0, ceiling, distance - depth / 2);
        this.grid.scale.set(depth * 2, depth, 1);
        g.uCell.value = cardW * 0.9;
        g.uFogDistance.value = distance * 1.1;
        g.uNear.value = frameH * 1.2;
        g.uHalfWidth.value = depth * 0.8;
        g.uDrift.value = cardW * 0.05;

        // Firefly volume: wide and deep around and behind the ring, from just
        // above the water to below the ceiling, ending well short of the
        // camera (they always draw behind the cards regardless).
        const p = this.particleUniforms;
        const nearZ = radius + layout.frontDistance * 0.3;
        const farZ = -radius * 2.5;
        const halfWidth = (distance - farZ) * tanHalf * layout.aspect;
        p.uBoxMin.value.set(-halfWidth, floorY + frameH * 0.25, farZ);
        p.uBoxSize.value.set(halfWidth * 2, ceiling - floorY - frameH * 0.6, nearZ - farZ);
        p.uWander.value = cardW * 0.55;
        // A sprite of world size s at distance d covers s * H / (2 d tan) px.
        // Sized for the halo: the bright core is only its middle.
        p.uSizeScale.value = (cardW * 0.08 * bufferHeight) / (2 * tanHalf);
        p.uMinSize.value = 6 * pixelRatio;
        p.uMaxSize.value = 24 * pixelRatio;
    }

    update(time) {
        this.gridUniforms.uTime.value = time;
    }

    set visible(value) {
        this.group.visible = value;
    }

    dispose() {
        this.group.removeFromParent();
        this.grid.geometry.dispose();
        this.grid.material.dispose();
        this.particles.geometry.dispose();
        this.particles.material.dispose();
    }
}
