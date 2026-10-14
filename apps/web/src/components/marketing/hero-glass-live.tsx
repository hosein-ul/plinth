"use client";

import { useEffect, useRef } from "react";

/**
 * The hero background, live: a few large sheets of thin, iridescent glass sweeping across a near-white canvas.
 *
 * Construction. An orthographic camera maps the scene one-to-one onto the canvas, so every sheet is art-directed in normalized
 * canvas coordinates (0,0 top-left, 1,1 bottom-right). Each sheet is a ribbon around a smooth centreline with a varying width, a
 * slow twist about its own axis and a gentle cross-section, so where it turns edge-on it narrows into a bright, coloured edge.
 * Phones get their own composition, not a stretched desktop one.
 *
 * Material. A small custom shader, not a PBR stack: a pearl body lit by one broad soft light, Fresnel-weighted reflection of a
 * procedural studio environment (softbox, a white strip, pale cyan, lavender and pink panels), silver-blue in the valleys, and a
 * thin-film tint from the brand palette that only appears at grazing angles. Interiors are partly transparent, so the white page
 * shows through and overlapping sheets read as layers. The left side (top on phones) is kept quiet for the headline.
 *
 * Motion. Only uniforms change per frame: reflections drift along the ridges and the sheets sway by a few pixels. Reduced motion
 * renders a single still frame. Drawing stops off screen and in background tabs. The baked poster underneath is the fallback for
 * no WebGL; the canvas fades in over it after its first frame.
 */

type Pt = [number, number];
type Sheet = {
  pts: Pt[]; // centreline, normalized canvas coordinates
  w: [number, number, number]; // width (fraction of canvas height) at start, middle, end
  roll: [number, number, number]; // twist: amplitude (rad), turns along the sheet, phase
  fold: number; // cross-section depth, relative to width
  alpha: number;
  tint: number; // strength of the thin-film colour
  seed: number;
};

const DESKTOP: Sheet[] = [
  // C2: the broad lower sheet that fills the bottom edge with soft silver.
  { pts: [[-0.08, 0.82], [0.12, 0.93], [0.34, 0.97], [0.55, 0.9], [0.76, 0.95], [1.1, 1.04]], w: [0.2, 0.28, 0.24], roll: [0.7, 1.1, 0.4], fold: 0.70, alpha: 0.85, tint: 0.6, seed: 1.3 },
  // B1: the right curtain, descending from the top-right and turning back out to the right.
  { pts: [[1.1, -0.06], [0.9, 0.1], [0.76, 0.29], [0.67, 0.47], [0.71, 0.64], [0.87, 0.72], [1.12, 0.68]], w: [0.34, 0.42, 0.26], roll: [0.95, 1.3, 1.9], fold: 0.96, alpha: 0.9, tint: 0.9, seed: 2.7 },
  // C: the lower fold entering from the left edge.
  { pts: [[-0.06, 0.5], [0.0, 0.51], [0.18, 0.69], [0.38, 0.68], [0.6, 0.78], [0.8, 0.82], [1.08, 0.85]], w: [0.07, 0.14, 0.18], roll: [1.1, 1.7, 0.2], fold: 0.80, alpha: 0.9, tint: 1.0, seed: 4.1 },
  // B2: the lighter fold sweeping back up to the right edge.
  { pts: [[0.52, 0.66], [0.66, 0.52], [0.8, 0.32], [0.91, 0.14], [1.06, -0.06]], w: [0.1, 0.18, 0.16], roll: [1.2, 1.2, 2.6], fold: 0.64, alpha: 0.8, tint: 1.0, seed: 5.6 },
  // A: the dominant upper sheet, entering at the top, bending to the centre and folding back to the right.
  { pts: [[0.74, -0.08], [0.7, 0.06], [0.63, 0.13], [0.55, 0.19], [0.48, 0.27], [0.44, 0.36], [0.49, 0.46], [0.64, 0.52], [0.84, 0.5], [1.1, 0.42]], w: [0.24, 0.27, 0.18], roll: [1.2, 1.5, 0.9], fold: 0.90, alpha: 0.92, tint: 1.0, seed: 7.2 },
];

const PHONE: Sheet[] = [
  { pts: [[-0.15, 0.86], [0.2, 0.93], [0.55, 0.9], [0.85, 0.97], [1.2, 1.04]], w: [0.1, 0.13, 0.11], roll: [0.7, 1.1, 0.4], fold: 0.70, alpha: 0.85, tint: 0.6, seed: 1.3 },
  { pts: [[1.2, 0.36], [0.92, 0.5], [0.74, 0.62], [0.78, 0.76], [1.0, 0.82], [1.25, 0.8]], w: [0.09, 0.12, 0.09], roll: [1.0, 1.4, 1.9], fold: 0.96, alpha: 0.9, tint: 0.9, seed: 2.7 },
  { pts: [[-0.2, 0.6], [0.05, 0.68], [0.35, 0.76], [0.65, 0.8], [1.2, 0.9]], w: [0.04, 0.07, 0.08], roll: [1.1, 1.7, 0.2], fold: 0.80, alpha: 0.9, tint: 1.0, seed: 4.1 },
  { pts: [[1.15, 0.3], [0.8, 0.4], [0.46, 0.5], [0.4, 0.6], [0.62, 0.68], [1.2, 0.66]], w: [0.06, 0.09, 0.07], roll: [1.25, 1.6, 0.9], fold: 0.90, alpha: 0.92, tint: 1.0, seed: 7.2 },
];

const PALETTE = {
  cBg: "#FCFCFD", cPearl: "#F7F7FA", cPale: "#E4E7ED", cSilver: "#CDD4DF", cSB: "#B5C2D2", cSteel: "#97A9BF",
  cCyan: "#C8EEF2", cAqua: "#B5E6E8", cTurq: "#D0F0ED", cPeri: "#C7CEF2", cLav: "#DCCCF0", cPink: "#F1CDE2",
  cBlush: "#F6E1E5", cChamp: "#F2EEDC", cPeach: "#F2D8CF",
} as const;

const VERT = /* glsl */ `
attribute vec2 aUS;
uniform float uTime;
uniform float uSeed;
varying vec3 vN;
varying vec2 vUS;
varying vec2 vScreen;
void main() {
  vec3 p = position;
  p.xy += vec2(sin(uTime * 0.11 + aUS.x * 3.0 + uSeed), cos(uTime * 0.083 + aUS.x * 2.4 + uSeed)) * 0.005;
  vN = normal;
  vUS = aUS;
  vec4 cp = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vScreen = cp.xy * 0.5 + 0.5;
  gl_Position = cp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 cBg, cPearl, cPale, cSilver, cSB, cSteel, cCyan, cAqua, cTurq, cPeri, cLav, cPink, cBlush, cChamp, cPeach;
uniform float uTime, uAlpha, uTint, uSeed;
uniform vec2 uLook;
uniform vec4 uQuiet; // x: axis (0 = x, 1 = y), y..z: quiet-to-full ramp, w: opacity left in the quiet zone
varying vec3 vN;
varying vec2 vUS;
varying vec2 vScreen;

// Thin film, approximated with the palette: a slow, uneven cycle aqua > periwinkle > lavender > pink > blush/champagne > cyan.
vec3 film(float t) {
  t = fract(t) * 6.0;
  vec3 c = mix(cAqua, cPeri, smoothstep(0.0, 0.8, t));
  c = mix(c, cLav, smoothstep(0.8, 1.6, t));
  c = mix(c, cPink, smoothstep(1.6, 2.4, t));
  c = mix(c, mix(cBlush, cChamp, 0.5), smoothstep(2.8, 3.8, t));
  c = mix(c, cTurq, smoothstep(3.8, 4.8, t));
  c = mix(c, cAqua, smoothstep(4.8, 6.0, t));
  return c;
}

// A procedural studio: bright overhead softbox, a vertical white strip, cool floor, coloured side panels.
vec3 env(vec3 R) {
  float up = smoothstep(-0.75, 0.85, R.y);
  vec3 c = mix(cSteel, cPale, up);
  c = mix(c, cSilver, exp(-pow(R.y * 2.4, 2.0)) * 0.55);
  c = mix(c, cPearl, smoothstep(0.2, 0.9, R.y));
  float box = exp(-pow((R.x + 0.22) * 2.0, 2.0) - pow((R.y - 0.5) * 2.6, 2.0));
  c = mix(c, vec3(1.0), clamp(box * 1.25, 0.0, 1.0));
  float strip = exp(-pow((R.x - 0.52) * 6.5, 2.0)) * smoothstep(-0.3, 0.5, R.y);
  c = mix(c, vec3(1.0), strip * 0.85);
  c = mix(c, cAqua, smoothstep(-0.5, -0.92, R.x) * 0.8);
  c = mix(c, cLav, smoothstep(0.62, 0.95, R.x) * smoothstep(-0.4, 0.2, R.y) * 0.7);
  c = mix(c, cPink, exp(-pow((R.y + 0.5) * 4.5, 2.0)) * smoothstep(-0.1, 0.6, R.x) * 0.55);
  c = mix(c, cSteel, smoothstep(-0.6, -0.95, R.y) * 0.45);
  return c;
}

void main() {
  vec3 N = normalize(vN);
  N *= sign(N.z + 1e-4); // light both faces as the side facing the viewer
  // Reflections drift along the ridges: a slow, small rotation of the normal.
  N = normalize(N + 0.05 * vec3(sin(uTime * 0.07 + vUS.x * 6.0 + uSeed), cos(uTime * 0.053 + vUS.x * 4.0 - uSeed), 0.0));
  float ndv = clamp(N.z, 0.0, 1.0);
  vec3 R = normalize(vec3(2.0 * ndv * N.xy + uLook * 0.14, 2.0 * ndv * N.z - 1.0));
  float F = 0.04 + 0.96 * pow(1.0 - ndv, 2.4);

  vec3 L = normalize(vec3(-0.35, 0.62, 0.7));
  float ndl = dot(N, L) * 0.5 + 0.5;
  vec3 body = mix(cSB, cPearl, smoothstep(0.45, 0.98, ndl));
  body = mix(body, cSteel, (1.0 - smoothstep(0.1, 0.55, ndl)) * 0.55);

  vec3 col = mix(body, env(R), 0.42 + 0.5 * F);

  float thick = 0.3 + 0.22 * sin(vUS.x * 3.1 + uSeed * 1.7) + 0.1 * sin(vUS.y * 4.0 + vUS.x * 7.0 + uSeed) + uTime * 0.008;
  float graze = smoothstep(0.06, 0.62, 1.0 - ndv);
  col = mix(col, film(thick + ndv * 0.85), graze * 0.8 * uTint);

  float spec = pow(max(dot(R, L), 0.0), 90.0);
  col = mix(col, vec3(1.0), spec * 0.7 + pow(max(dot(R, L), 0.0), 400.0) * 0.5);

  vec2 sc = vec2(vScreen.x, 1.0 - vScreen.y);
  float loud = smoothstep(uQuiet.y, uQuiet.z, uQuiet.x < 0.5 ? sc.x : sc.y);
  col = mix(mix(cPearl, col, 0.35), col, loud);

  float edge = smoothstep(0.5, 0.43, abs(vUS.y)) * smoothstep(0.0, 0.16, vUS.x) * smoothstep(1.0, 0.9, vUS.x);
  float a = uAlpha * mix(0.88, 1.0, F) * edge * mix(uQuiet.w, 1.0, loud);
  gl_FragColor = vec4(col, a);
}
`;

export function HeroGlassLive() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      if (disposed) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: coarse ? "low-power" : "high-performance" });
      } catch {
        return; // no WebGL: the poster stays
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the shader works directly in sRGB palette values
      renderer.setClearColor(PALETTE.cBg, 1);
      const canvas = renderer.domElement;
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 700ms cubic-bezier(0.16,1,0.3,1)";
      el.appendChild(canvas);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);

      const srgb = (hex: string) => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
      const shared = {
        uTime: { value: 0 },
        uLook: { value: new THREE.Vector2() },
        uQuiet: { value: new THREE.Vector4(0, 0.1, 0.46, 0.45) },
        ...Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, { value: srgb(v) }])),
      };

      const meshes: import("three").Mesh[] = [];
      const clear = () => {
        for (const m of meshes) { scene.remove(m); m.geometry.dispose(); (m.material as import("three").Material).dispose(); }
        meshes.length = 0;
      };

      const smooth = (x: number) => x * x * (3 - 2 * x);
      const build = (aspect: number) => {
        clear();
        const phone = aspect < 1.1;
        shared.uQuiet.value.set(phone ? 1 : 0, phone ? 0.3 : 0.1, phone ? 0.5 : 0.46, phone ? 0.5 : 0.45);
        (phone ? PHONE : DESKTOP).forEach((sh, order) => {
          const curve = new THREE.CatmullRomCurve3(sh.pts.map(([x, y]) => new THREE.Vector3(x * aspect, -y, 0)), false, "centripetal");
          const U = 280, S = 44;
          const pos = new Float32Array((U + 1) * (S + 1) * 3);
          const us = new Float32Array((U + 1) * (S + 1) * 2);
          const side0 = new THREE.Vector3(), side = new THREE.Vector3(), nrm = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1);
          for (let i = 0; i <= U; i++) {
            const u = i / U;
            const c = curve.getPointAt(u);
            const t = curve.getTangentAt(u);
            side0.set(-t.y, t.x, 0).normalize();
            const roll = sh.roll[0] * Math.sin(u * sh.roll[1] * Math.PI * 2 + sh.roll[2]);
            side.copy(side0).multiplyScalar(Math.cos(roll)).addScaledVector(z, Math.sin(roll));
            nrm.crossVectors(t, side).normalize();
            const w = u < 0.5 ? sh.w[0] + (sh.w[1] - sh.w[0]) * smooth(u * 2) : sh.w[1] + (sh.w[2] - sh.w[1]) * smooth(u * 2 - 1);
            for (let j = 0; j <= S; j++) {
              const s = j / S - 0.5, a = s * 2;
              const lift = sh.fold * w * (0.42 * (1 - a * a) + 0.3 * Math.sin(a * 2.4 + u * 7 + sh.seed) + 0.14 * Math.sin(a * 4.6 - u * 4 + sh.seed * 2));
              const k = (i * (S + 1) + j) * 3;
              pos[k] = c.x + side.x * s * w + nrm.x * lift;
              pos[k + 1] = c.y + side.y * s * w + nrm.y * lift;
              pos[k + 2] = c.z + side.z * s * w + nrm.z * lift;
              us[(i * (S + 1) + j) * 2] = u;
              us[(i * (S + 1) + j) * 2 + 1] = s;
            }
          }
          const index: number[] = [];
          for (let i = 0; i < U; i++) for (let j = 0; j < S; j++) {
            const a = i * (S + 1) + j, b = a + 1, c = a + S + 1, d = c + 1;
            index.push(a, b, c, b, d, c);
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          geo.setAttribute("aUS", new THREE.BufferAttribute(us, 2));
          geo.setIndex(index);
          geo.computeVertexNormals();
          const mat = new THREE.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: FRAG,
            uniforms: { ...shared, uAlpha: { value: sh.alpha }, uTint: { value: sh.tint }, uSeed: { value: sh.seed } },
            transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.renderOrder = order;
          mesh.frustumCulled = false;
          scene.add(mesh);
          meshes.push(mesh);
        });
      };

      let shown = false;
      const draw = () => {
        renderer.render(scene, camera);
        if (!shown) { shown = true; canvas.style.opacity = "1"; }
      };

      let builtFor = 0;
      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        const aspect = w / h;
        camera.right = aspect;
        camera.updateProjectionMatrix();
        if (Math.abs(aspect - builtFor) > 0.01) { build(aspect); builtFor = aspect; }
        if (still) draw();
      };

      const look = new THREE.Vector2(), lookTarget = new THREE.Vector2();
      const onMove = (e: PointerEvent) => {
        lookTarget.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
      };
      if (!coarse && !still) window.addEventListener("pointermove", onMove, { passive: true });

      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      let visible = true, raf = 0, last = performance.now(), t = 0, acc = 0;
      const minStep = coarse ? 1 / 30 : 0; // phones: 30 fps is plenty for motion this slow
      const frame = (now: number) => {
        raf = 0;
        if (!visible || document.hidden) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        acc += dt;
        if (acc >= minStep) {
          t += acc;
          acc = 0;
          look.lerp(lookTarget, 1 - Math.exp(-dt * 2.5));
          shared.uTime.value = t;
          shared.uLook.value.copy(look);
          draw();
        }
        raf = requestAnimationFrame(frame);
      };
      const start = () => { if (!still && visible && !document.hidden && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
      const io = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? true; start(); });
      io.observe(el);
      document.addEventListener("visibilitychange", start);
      if (still) draw(); else start();

      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("visibilitychange", start);
        clear();
        renderer.dispose();
        canvas.remove();
      };
    })();

    return () => { disposed = true; cleanup(); };
  }, []);

  return <div ref={host} className="absolute inset-0" />;
}
