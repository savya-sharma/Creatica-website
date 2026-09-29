// ---------------------------------------------------------------------------
// Card: rounded image plane with a thin luminous edge and a subtle inner
// glow. Everything border-related comes from the rounded-rect distance field,
// never from the image, so it is identical on every card and every frame.
// The soft outer glow is drawn by a separate additive quad (glowFragment).
// ---------------------------------------------------------------------------
const sdRoundBox = /* glsl */ `
float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
`;

// ---------------------------------------------------------------------------
// Flexible surface: shared by the image planes and their glow quads, which
// sit in the same plane, so image, border and halo deform as one surface,
// and by the lower rim, so the same liquid bends the rim line too.
// Each vertex reads the fullscreen fluid field at its own on-screen
// position, turns the flow into a 3D push in the plane's own surface
// (stretch/compress/bend along the flow) and bulges toward the viewer where
// the ink is dense. The field decays, so the surface recovers on its own.
// ---------------------------------------------------------------------------
export const surfaceVertex = /* glsl */ `
uniform sampler2D uFluidDye;
uniform sampler2D uFluidVelocity; // sim texels per second
uniform vec2 uFluidTexel;
uniform float uFluidOn;
uniform float uFluidWarp;         // seconds of flow applied as surface push
uniform float uFluidMaxWarp;      // cap on the push (world units)
uniform float uFluidBulge;        // max bulge toward the viewer (world units)
uniform float uTanHalf;           // tan(fov / 2)
uniform float uCamAspect;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);
#ifdef USE_PLANE_NORMAL
    // Card sidewall: deform with the card's plane (its local +z), not with
    // its own sideways normals, so it moves exactly like the card face.
    vec3 surfaceN = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
#else
    vec3 surfaceN = n;
#endif

    if (uFluidOn > 0.5) {
#ifdef USE_PLANE_NORMAL
        // Card volume: read the field where this point sits on the face
        // plane (z = 0), so the sidewall and back follow exactly the same
        // push as the image in front of them and the card moves as one body.
        vec4 clip = projectionMatrix * viewMatrix * (modelMatrix * vec4(position.xy, 0.0, 1.0));
#else
        vec4 clip = projectionMatrix * viewMatrix * worldPos;
#endif
        vec2 screenUv = clip.xy / clip.w * 0.5 + 0.5;

        // Read a smoothed, broad version of the field (centre + ring of 6):
        // the surface bends softly around the liquid instead of following
        // every small eddy, which would make the edges wiggle.
        vec2 flow = texture2D(uFluidVelocity, screenUv).xy;
        vec3 dye = texture2D(uFluidDye, screenUv).rgb;
        vec2 reach = vec2(0.035 / uCamAspect, 0.035);
        for (int i = 0; i < 6; i++) {
            float a = float(i) * 1.0471976; // 60 degrees
            vec2 o = vec2(cos(a), sin(a)) * reach;
            flow += texture2D(uFluidVelocity, screenUv + o).xy;
            dye += texture2D(uFluidDye, screenUv + o).rgb;
        }
        flow *= uFluidTexel / 7.0; // screen uv / s
        dye /= 7.0;
        float density = max(dye.r, max(dye.g, dye.b));

        // Screen-space flow -> world-space push at this vertex's depth,
        // then kept within the plane so the surface itself is dragged.
        float depth = clip.w;
        vec2 worldPerUv = vec2(2.0 * depth * uTanHalf * uCamAspect, 2.0 * depth * uTanHalf);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 push = (right * flow.x * worldPerUv.x + up * flow.y * worldPerUv.y) * uFluidWarp;
        push -= surfaceN * dot(push, surfaceN);
        push *= min(1.0, uFluidMaxWarp / max(length(push), 1e-5));

        float bulge = smoothstep(0.0, 0.6, density) * uFluidBulge;
        worldPos.xyz += push + surfaceN * bulge;
    }

    vWorldPos = worldPos.xyz;
    vWorldNormal = n;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// The fullscreen fluid field, as read by the carousel surfaces. Both textures
// are screen-aligned (FluidSim), so a surface samples them at its own
// on-screen position: that is the liquid passing over that point.
const fluidField = /* glsl */ `
uniform sampler2D uFluidDye;
uniform sampler2D uFluidVelocity; // sim texels per second
uniform vec2 uFluidTexel;         // uv size of one sim texel
uniform vec2 uResolution;         // drawing-buffer pixels
uniform float uFluidOn;           // 0 when disabled and in the reflection pass
uniform float uFluidGlow;

float fluidDensity(vec3 dye) {
    return max(dye.r, max(dye.g, dye.b));
}
`;

export const cardFragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uImageAspect;
uniform float uReady;

uniform vec2 uSize;
uniform float uRadius;
uniform float uBorder;
uniform vec3 uBorderColor;
uniform vec3 uCoreColor;
uniform float uInnerGlow;
uniform float uTime;

uniform vec2 uPointer;        // drawing-buffer pixels
uniform float uPointerEnergy; // 0..1, decays when the pointer rests
uniform float uPointerRadius;

uniform float uDepthNear;     // world z of the ring's front
uniform float uDepthFar;      // world z of the ring's back

uniform float uFluidDisplace; // seconds of flow applied as image drift
uniform float uFluidMaxShift; // cap on the drift, in plane uv
uniform float uFluidTint;     // theme-coloured sheen where the liquid passes
uniform float uFluidDyeScale; // display brightness of the dye colour
uniform float uFluidRefract;  // pixels of bend per unit density gradient
uniform float uFluidChroma;   // colour separation at the strongest displacement

uniform float uFocus;         // 0..1, how centred this plane is on screen
uniform float uFocusCore;     // extra edge brightness at full focus
uniform float uFocusInner;    // extra inner glow at full focus
uniform float uCenterTint;    // strength of the theme-colour wash on the centred plane
uniform float uEdgeLight;     // brightness of the luminous edge (x border colour)
uniform float uEdgeOpacity;   // how much the edge covers the image at the outline

uniform float uEdgeFeather;   // width of the soft image falloff at the edge (world)
uniform float uFeatherDepth;  // how far the image dims at the very edge (0..1)
uniform float uEdgeBloom;     // light bleeding in from the edge, away from the centre
uniform float uEdgeBloomFocused; // the same at full focus
uniform float uBloomWidth;    // falloff of the edge bleed (world)
uniform float uSurfaceBloom;  // broad, faint bleed further onto the image at full focus

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

${sdRoundBox}
${fluidField}

void main() {
    vec2 p = (vUv - 0.5) * uSize;
    float d = sdRoundBox(p, uSize * 0.5, uRadius);
    float aa = fwidth(d);
    // How the plane's uv changes per screen pixel here: the local frame of
    // the rotated, foreshortened surface (taken before any discard).
    vec2 uvPerPixelX = dFdx(vUv);
    vec2 uvPerPixelY = dFdy(vUv);
    float alpha = 1.0 - smoothstep(-aa, aa * 0.5, d);
    if (alpha < 0.01) discard;

    // Liquid passing over the glass: the fullscreen field's flow at this
    // point, projected onto the plane's own surface coordinates, drifts the
    // image along the flow. Settles back as the field calms.
    vec2 uv = vUv;
    vec3 fluidDye = vec3(0.0);
    float fluidAmount = 0.0;
    vec2 shift = vec2(0.0);
    if (uFluidOn > 0.5) {
        vec2 screenUv = gl_FragCoord.xy / uResolution;
        // Drift: the flow carries the image along with it.
        vec2 flowPx = texture2D(uFluidVelocity, screenUv).xy * uFluidTexel * uResolution * uFluidDisplace;
        // Refraction: the ink's density gradient bends the view like a thin
        // liquid lens, so warps follow the trails instead of a flat slide.
        // Measured over a wide span so only the broad shape of the ink
        // bends the view, not its fine detail.
        vec2 e = 10.0 / uResolution;
        vec2 densityGradient = vec2(
            fluidDensity(texture2D(uFluidDye, screenUv + vec2(e.x, 0.0)).rgb) - fluidDensity(texture2D(uFluidDye, screenUv - vec2(e.x, 0.0)).rgb),
            fluidDensity(texture2D(uFluidDye, screenUv + vec2(0.0, e.y)).rgb) - fluidDensity(texture2D(uFluidDye, screenUv - vec2(0.0, e.y)).rgb)
        ) / 20.0; // per pixel
        vec2 offsetPx = flowPx + densityGradient * uFluidRefract;

        shift = uvPerPixelX * offsetPx.x + uvPerPixelY * offsetPx.y;
        shift *= min(1.0, uFluidMaxShift / max(length(shift), 1e-5));
        uv -= shift;

        fluidDye = texture2D(uFluidDye, screenUv).rgb;
        fluidAmount = clamp(fluidDensity(fluidDye) * 1.8 + length(flowPx) * 0.01, 0.0, 1.0);
    }
    if (!gl_FrontFacing) uv.x = 1.0 - uv.x;

    // Pointer-driven liquid ripple across the glass.
    vec2 toPointer = gl_FragCoord.xy - uPointer;
    float pd = length(toPointer);
    float influence = exp(-(pd * pd) / (uPointerRadius * uPointerRadius)) * uPointerEnergy;
    uv += normalize(toPointer + 1e-4) * sin(pd * 0.045 - uTime * 7.0) * 0.006 * influence;

    // object-fit: cover
    float cardAspect = uSize.x / uSize.y;
    vec2 fit = cardAspect > uImageAspect
        ? vec2(1.0, uImageAspect / cardAspect)
        : vec2(cardAspect / uImageAspect, 1.0);
    // Slight colour separation where the liquid displaces the image most:
    // red and blue refract a little more/less than green. Smooth, bounded.
    float separation = clamp(length(shift) / max(uFluidMaxShift, 1e-5), 0.0, 1.0) * uFluidChroma;
    vec2 chroma = shift * separation;
    if (!gl_FrontFacing) chroma.x = -chroma.x;
    vec2 imageUv = (uv - 0.5) * fit + 0.5;
    vec3 image = vec3(
        texture2D(uMap, imageUv - chroma * fit).r,
        texture2D(uMap, imageUv).g,
        texture2D(uMap, imageUv + chroma * fit).b
    ) * 0.9;

    vec3 glassBase = uBorderColor * 0.2; // dark glass before the image loads
    vec3 col = mix(glassBase, image, uReady);

    // Soft optical falloff: the image eases down toward the outline instead
    // of running at full strength into it. Analytic (distance field only)
    // and never narrower than a couple of pixels, so it can't alias.
    float fromEdge = max(-d, 0.0);
    float feather = smoothstep(0.0, max(uEdgeFeather, aa * 2.5), fromEdge);
    col *= mix(1.0 - uFeatherDepth, 1.0, feather);

    // Glass: soft top sheen, fresnel edge, pointer response (image only).
    col += vec3(0.9, 0.86, 1.0) * smoothstep(0.55, 1.0, vUv.y) * 0.05;
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDir)), 3.0);
    col += uBorderColor * fresnel * 0.1;
    col += uBorderColor * influence * 0.15;
    col += fluidDye * uFluidDyeScale * uFluidTint;

    // Centre colour fade: a soft #586A6B wash on the plane at the screen
    // centre, strongest in its middle and easing out toward its edges
    // (a tall gaussian, so no banding). Driven by the plane's own smoothed,
    // screen-projected focus, so it rides with whichever plane is centred;
    // planes next to it get a faint share from their screen position, side
    // planes almost none. Applied as a hue shift that keeps luminance (the
    // image's detail stays) plus a slight lift of the shadows toward the
    // theme colour, never as a flat overlay.
    vec2 fromMid = (vUv - 0.5) / vec2(0.34, 0.46);
    float planeFade = exp(-dot(fromMid, fromMid));
    vec2 screenMid = (gl_FragCoord.xy / uResolution - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
    float nearCentre = exp(-(screenMid.x * screenMid.x) / 0.12);
    float tint = planeFade * uCenterTint * (uFocus + (1.0 - uFocus) * 0.25 * nearCentre);
    vec3 tintHue = uBorderColor / max(max(uBorderColor.r, uBorderColor.g), uBorderColor.b);
    float hueLum = dot(tintHue, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, col * tintHue / hueLum, tint * 0.6);
    col += uBorderColor * tint * 0.35 * (1.0 - clamp(col, 0.0, 1.0));

    // Edge bloom: the theme light bleeding gently into the image, strongest
    // at the outline and gone within a short distance; the centred plane
    // gets a little more plus a faint, broad spill. Screen-blended, so dark
    // areas lift slightly while highlights and colours are left intact.
    float bleed = exp(-fromEdge / uBloomWidth) * mix(uEdgeBloom, uEdgeBloomFocused, uFocus)
        + exp(-fromEdge / (uBloomWidth * 3.5)) * uSurfaceBloom * uFocus;
    col += uBorderColor * bleed * (1.0 - clamp(col, 0.0, 1.0));

    if (!gl_FrontFacing) col *= 0.5;

    // The far side of the ring falls into shadow (the image, not the edge).
    float depthT = smoothstep(uDepthFar, uDepthNear, vWorldPos.z);
    col *= mix(0.16, 1.0, depthT);

    // Subtle inner glow just inside the edge; where the liquid passes it
    // brightens and spreads a little further in (smooth, field-driven).
    float inside = max(-d - uBorder, 0.0);
    col += uBorderColor * exp(-inside / (uSize.y * 0.025)) * uInnerGlow
        * (1.0 + fluidAmount * uFluidGlow + uFocus * uFocusInner);
    col += uBorderColor * exp(-inside / (uSize.y * 0.06)) * fluidAmount * uFluidGlow * 0.12;

    // Luminous edge in the theme colour: a soft exponential profile peaking
    // at the outline instead of a solid stroke, partly see-through so the
    // image carries on beneath it, plus a faint wider falloff inward. Its
    // width never drops below ~1px so distant edges don't break up into dots.
    // Brighter on the centred plane, softer at the sides.
    vec3 edgeColor = uBorderColor * uEdgeLight * (1.0 + uFocus * uFocusCore);
    float edgeWidth = max(uBorder, aa * 1.2);
    float edge = exp(-fromEdge / edgeWidth);
    float edgeTail = exp(-fromEdge / (edgeWidth * 5.0));
    col = mix(col, edgeColor, edge * uEdgeOpacity);
    col += edgeColor * edgeTail * 0.12;

    gl_FragColor = vec4(col, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// Card body: the thin extruded volume behind each image plane (sidewall with
// rounded edges, plus the back), following the same rounded-rect outline.
// A darker shade of the border colour, lit by how squarely it faces the
// viewer, so it only reads when seen at an angle, plus a soft highlight
// where the rounded edge catches a fixed key light from above the camera.
// ---------------------------------------------------------------------------
export const sideFragment = /* glsl */ `
uniform vec3 uBorderColor;
uniform float uSideShade;
uniform float uSideBloom;     // soft highlight where the edge catches the light
uniform float uFocus;         // 0..1, how centred this card is on screen
uniform float uDepthNear;
uniform float uDepthFar;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 n = normalize(vWorldNormal); // outward: the volume is closed
    float facing = abs(dot(n, viewDir));
    vec3 col = uBorderColor * uSideShade * (0.6 + 0.4 * facing);

    // Broad, low-power highlight (no sharp specular, so no sparkle on thin,
    // distant edges); a little stronger on the centred card.
    vec3 lightDir = normalize(vec3(0.0, 0.8, 1.0));
    float sheen = pow(max(dot(n, normalize(lightDir + viewDir)), 0.0), 4.0);
    col += uBorderColor * sheen * uSideBloom * (0.35 + 0.65 * uFocus);
    // Always darker than the image face.
    col = min(col, uBorderColor * 1.3);

    // Same depth shading as the card images.
    float depthT = smoothstep(uDepthFar, uDepthNear, vWorldPos.z);
    col *= mix(0.16, 1.0, depthT);

    gl_FragColor = vec4(col, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// Outer glow: a dedicated emissive layer. A quad larger than the card by
// uMargin on every side, sharing its transform, draws only OUTSIDE the
// card's rounded rect: a narrow bright halo hugging the edge plus a broad,
// low tail. Additive, analytic, no threshold, no dependence on the image.
// ---------------------------------------------------------------------------
export const glowFragment = /* glsl */ `
uniform vec2 uSize;
uniform float uRadius;
uniform float uMargin;
uniform vec3 uBorderColor;
uniform float uGlowStrength;
uniform float uGlowWidth;
uniform float uFocus;         // 0..1, how centred this plane is on screen
uniform float uGlowUnfocused; // halo multiplier away from the centre
uniform float uGlowFocused;   // halo multiplier at the centre

varying vec2 vUv;

${sdRoundBox}
${fluidField}

void main() {
    vec2 p = (vUv - 0.5) * (uSize + 2.0 * uMargin);
    float d = sdRoundBox(p, uSize * 0.5, uRadius);
    float aa = fwidth(d);

    float outside = smoothstep(-aa, aa, d);
    float dist = max(d, 0.0);
    // Where the liquid passes, the halo reaches a little further and
    // brightens slightly. The field is smooth, so this can't flicker.
    float fluidAmount = uFluidOn > 0.5
        ? clamp(fluidDensity(texture2D(uFluidDye, gl_FragCoord.xy / uResolution).rgb) * 1.8, 0.0, 1.0)
        : 0.0;
    // The centred plane's halo is broader and softer as well as brighter.
    float width = uGlowWidth * (1.0 + fluidAmount * 0.6 + uFocus * 0.9);
    float halo = 0.6 * exp(-dist / (width * 0.25)) + 0.4 * exp(-dist / width);
    halo *= 1.0 + fluidAmount * uFluidGlow * 0.5;
    halo *= 1.0 - smoothstep(uMargin * 0.6, uMargin, d); // reach zero inside the quad

    float intensity = halo * outside * uGlowStrength * mix(uGlowUnfocused, uGlowFocused, uFocus);
    if (intensity < 0.002) discard;
    gl_FragColor = vec4(uBorderColor * intensity, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// Lower rim: a thin luminous line running just beneath the planes, drawn on a
// narrow open cone band that follows the ring's radius and lean. The profile
// across the band's height is a crisp core plus a soft halo, analytic like
// the plane borders. Additive. It uses the same flexible-surface vertex
// shader as the planes, so the fluid bends the line; where the liquid passes
// its halo also brightens softly (the core stays constant).
// ---------------------------------------------------------------------------
export const rimFragment = /* glsl */ `
uniform vec3 uBorderColor;
uniform vec3 uCoreColor;
uniform float uBandHeight;
uniform float uCoreWidth;
uniform float uHaloWidth;
uniform float uRimStrength;
uniform float uEdgeLight;     // same luminous-edge brightness as the card borders

varying vec2 vUv;

${fluidField}

void main() {
    float d = abs(vUv.y - 0.5) * uBandHeight; // distance from the rim line
    float aa = fwidth(d);

    // Soft luminous line in the theme colour, like the card edges: an
    // exponential profile instead of a crisp stroke, never under ~1px wide.
    float core = exp(-d / max(uCoreWidth * 1.5, aa * 1.2));

    float fluidAmount = uFluidOn > 0.5
        ? clamp(fluidDensity(texture2D(uFluidDye, gl_FragCoord.xy / uResolution).rgb) * 1.8, 0.0, 1.0)
        : 0.0;
    float haloWidth = uHaloWidth * (1.0 + fluidAmount * 0.5);
    float halo = 0.6 * exp(-d / (haloWidth * 0.3)) + 0.4 * exp(-d / haloWidth);
    halo *= 1.0 + fluidAmount * uFluidGlow * 0.6;
    halo *= 1.0 - smoothstep(uBandHeight * 0.3, uBandHeight * 0.5, d); // zero at the band edge

    vec3 color = uBorderColor * (core * uEdgeLight * 0.55 + halo * uRimStrength);
    if (max(color.r, max(color.g, color.b)) < 0.002) discard;
    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// Backdrop: full-screen gradient drawn first, without depth, in every pass.
// ---------------------------------------------------------------------------
export const backdropVertex = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0);
}
`;

const backdropColor = /* glsl */ `
vec3 backdropColor(vec2 uv, vec3 base, vec3 glowColor, float aspect) {
    vec2 p = (uv - vec2(0.5, 0.56)) * vec2(aspect, 1.0);
    float glow = exp(-dot(p, p) * 4.0);
    float vignette = smoothstep(1.25, 0.15, length((uv - 0.5) * vec2(aspect, 1.0)));
    return base * vignette + glowColor * glow;
}
`;

// Full-screen fluid layer (FluidSim dye), composited behind the carousel by
// the backdrop and the floor. Soft theme-coloured body, a broad glow from a
// wide fixed ring of taps, and a pale core only where the dye is dense.
const fluidColor = /* glsl */ `
uniform sampler2D uFluid;
uniform float uFluidStrength;
uniform vec3 uFluidCore;
uniform float uFluidDyeScale; // display brightness of the dye colour

vec3 fluidColor(vec2 uv, float aspect) {
    if (uFluidStrength <= 0.0) return vec3(0.0);
    vec3 dye = texture2D(uFluid, uv).rgb;

    vec3 glow = vec3(0.0);
    vec2 reach = vec2(0.045 / aspect, 0.045);
    for (int i = 0; i < 12; i++) {
        float a = float(i) * 0.5235988; // 30 degrees
        glow += texture2D(uFluid, uv + vec2(cos(a), sin(a)) * reach).rgb;
    }
    glow /= 12.0;

    float density = max(dye.r, max(dye.g, dye.b));
    vec3 core = uFluidCore * smoothstep(0.22, 0.9, density);
    return ((dye * 0.85 + glow * 0.7) * uFluidDyeScale + core * 0.55) * uFluidStrength;
}
`;

export const backdropFragment = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uGlow;
uniform float uAspect;
varying vec2 vUv;

${backdropColor}
${fluidColor}

void main() {
    vec3 color = backdropColor(vUv, uBase, uGlow, uAspect) + fluidColor(vUv, uAspect);
    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// Floor: replaces Reflector's default shader. Samples the mirrored render
// target with a distance-growing blur, darkening and a fade away from the
// ring's footprint.
// ---------------------------------------------------------------------------
export const floorShader = {
    name: "ReflectiveFloorShader",

    uniforms: {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        uTexel: { value: null },
        uRadius: { value: 1 },
        uMaskSoftness: { value: 0.05 },
        uFadeLength: { value: 1 },
        uFrontDistance: { value: 10 },
        uStrength: { value: 0.36 },
        uBlur: { value: 2 },
        uResolution: { value: null },
        uBackdropBase: { value: null },
        uBackdropGlow: { value: null },
        uFluid: { value: null },
        uFluidStrength: { value: 0 },
        uFluidCore: { value: null },
        uFluidDyeScale: { value: 1 },
    },

    vertexShader: /* glsl */ `
        uniform mat4 textureMatrix;
        varying vec4 vUv;
        varying vec3 vWorldPos;

        void main() {
            vUv = textureMatrix * vec4(position, 1.0);
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        uniform float uRadius;
        uniform float uMaskSoftness;
        uniform float uFadeLength;
        uniform float uFrontDistance;
        uniform float uStrength;
        uniform float uBlur;
        uniform vec2 uResolution;
        uniform vec3 uBackdropBase;
        uniform vec3 uBackdropGlow;

        varying vec4 vUv;
        varying vec3 vWorldPos;

        ${backdropColor}
        ${fluidColor}

        // Fixed spiral of taps: deterministic, no per-pixel noise or grain.
        vec3 blurSample(vec2 uv, float radius) {
            vec3 acc = vec3(0.0);
            float total = 0.0;
            for (int i = 0; i < 16; i++) {
                float fi = float(i);
                float r = sqrt((fi + 0.5) / 16.0);
                float theta = fi * 2.39996323;
                vec2 offset = vec2(cos(theta), sin(theta)) * r * radius * uTexel;
                float w = 1.0 - r * 0.5;
                acc += texture2D(tDiffuse, uv + offset).rgb * w;
                total += w;
            }
            return acc / total;
        }

        void main() {
            vec2 uv = vUv.xy / vUv.w;

            // Reflection lives only on the floor in front of / beside the
            // ring. Inside the ring footprint (seen through the gaps) and
            // behind it, the floor stays plain and dark.
            // uRadius is the planes' bottom-edge radius: the ring footprint.
            float radial = length(vWorldPos.xz);
            float edgeDist = radial - uRadius;
            float frontSide = smoothstep(-0.15, 0.25, vWorldPos.z / uRadius);
            float frontMask = smoothstep(-uMaskSoftness, uMaskSoftness, edgeDist) * frontSide;

            vec3 reflection = blurSample(uv, uBlur * (1.0 + 3.0 * max(edgeDist, 0.0) / uFadeLength));
            float fade = (1.0 - smoothstep(0.0, uFadeLength, edgeDist)) * frontMask;

            vec3 floorColor = color + reflection * uStrength * fade;

            // Dissolve into the backdrop toward the horizon: no hard edge.
            float camDist = distance(cameraPosition, vWorldPos);
            vec2 screenUv = gl_FragCoord.xy / uResolution;
            float aspect = uResolution.x / uResolution.y;
            vec3 backdrop = backdropColor(screenUv, uBackdropBase, uBackdropGlow, aspect);
            float horizon = smoothstep(uFrontDistance * 1.4, uFrontDistance * 3.0, camDist);
            // The fluid layer continues across the floor, in screen space.
            vec3 color = mix(floorColor, backdrop, horizon) + fluidColor(screenUv, aspect);
            gl_FragColor = vec4(color, 1.0);

            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }
    `,
};

// ---------------------------------------------------------------------------
// Space environment (SpaceBackground). Both layers draw right after the
// backdrop and before the floor, occluder and cards, additively and without
// depth, so the water and every card always cover them.
// ---------------------------------------------------------------------------

// Ceiling grid: fine lines on a huge horizontal plane above the camera,
// receding to the horizon for the vanishing-point perspective. Lines are
// analytic and ~1px wide (fwidth), and fade out before they get denser than
// a few pixels per cell, so the horizon never moirés or shimmers. Fogged to
// black with distance and faded near the camera. Drifts slowly toward the
// viewer with the particles.
export const spaceGridVertex = /* glsl */ `
varying vec3 vWorldPos;
void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const spaceGridFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uCell;         // world size of one grid cell
uniform float uFogDistance;  // e-folding distance of the fog
uniform float uNear;         // fade-in distance from the camera
uniform float uHalfWidth;    // sideways fade, world units
uniform float uTime;
uniform float uDrift;        // world units per second toward the viewer

varying vec3 vWorldPos;

void main() {
    vec2 coord = vec2(vWorldPos.x, vWorldPos.z - uTime * uDrift) / uCell;
    vec2 w = fwidth(coord);
    vec2 g = abs(fract(coord - 0.5) - 0.5) / max(w, vec2(1e-5));
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    float resolvable = 1.0 - smoothstep(0.06, 0.3, max(w.x, w.y));

    float dist = distance(cameraPosition, vWorldPos);
    float fog = exp(-dist / uFogDistance);
    float nearFade = smoothstep(uNear, uNear * 2.5, dist);
    float sideFade = 1.0 - smoothstep(uHalfWidth * 0.4, uHalfWidth, abs(vWorldPos.x));

    float intensity = line * resolvable * fog * nearFade * sideFade * uStrength;
    if (intensity < 0.0005) discard;
    gl_FragColor = vec4(uColor * intensity, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

// Fireflies: sparse glowing points floating in the space around the ring.
// Each one's home comes from fixed seeds inside a box that follows the
// layout (so resizing only updates uniforms). It then wanders around that
// home along its own slow, non-repeating path (sines at incommensurate,
// per-particle frequencies), mostly sideways and up/down with only a slight
// depth sway, so none of them travel toward or away from the camera. Their
// brightness breathes on a per-particle rate and phase, never in sync.
export const particleVertex = /* glsl */ `
attribute vec4 aSeed;        // phase, speed, size, intensity

uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform float uTime;
uniform float uWander;       // wander radius, world units
uniform float uSizeScale;    // world size -> pixels at unit distance
uniform float uMinSize;      // smallest drawn sprite, pixels
uniform float uMaxSize;
uniform float uFogDistance;
uniform float uStrength;

varying float vIntensity;

void main() {
    float phase = aSeed.x * 6.2831853;
    float rate = 0.6 + 0.8 * aSeed.y;   // each firefly keeps its own pace
    float t = uTime * 0.06 * rate;
    vec3 p = uBoxMin + position * uBoxSize;
    p += vec3(
        sin(t * 1.00 + phase) + 0.6 * sin(t * 2.31 + phase * 1.7),
        0.7 * sin(t * 1.37 + phase * 2.3) + 0.4 * sin(t * 2.83 + phase * 0.6),
        0.25 * sin(t * 0.83 + phase * 3.1)
    ) * uWander;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(-mv.z, 0.001);
    float size = mix(0.55, 1.0, aSeed.z) * uSizeScale / dist;
    float drawn = clamp(size, uMinSize, uMaxSize);
    float energy = min(size * size / (drawn * drawn), 1.0);

    // Breathing: long dim spells, soft swells (a raised, sharpened sine),
    // on a per-firefly period of roughly 5 to 15 seconds.
    float pulseRate = 0.5 + 1.0 * fract(aSeed.x * 7.13 + aSeed.y * 3.7);
    float swell = 0.5 + 0.5 * sin(uTime * pulseRate * 0.8 + phase * 3.0);
    float pulse = 0.25 + 0.75 * swell * swell * swell;

    // Most are faint; about one in eight is noticeably brighter.
    float intensity = aSeed.w > 0.88 ? 1.0 : mix(0.18, 0.45, aSeed.w / 0.88);
    float fog = exp(-dist / uFogDistance);
    vIntensity = intensity * pulse * energy * fog * uStrength;

    gl_PointSize = drawn;
    gl_Position = projectionMatrix * mv;
}
`;

// Soft glow sprite: a small bright core inside a wide, diffuse halo, both
// gaussian, so it reads as light blooming off a firefly, not a hard dot.
export const particleFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCoreColor;

varying float vIntensity;

void main() {
    vec2 q = (gl_PointCoord - 0.5) * 2.0;
    float r2 = dot(q, q);
    if (r2 >= 1.0) discard;
    float core = exp(-r2 * 28.0);
    float halo = exp(-r2 * 5.0) * (1.0 - r2); // reaches zero at the sprite edge
    vec3 color = (uCoreColor * core * 1.4 + uColor * halo * 1.1) * vIntensity;
    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
