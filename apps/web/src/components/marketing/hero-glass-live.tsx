"use client";

import { useEffect, useRef } from "react";

/**
 * The hero background, live: one continuous sheet of thin, iridescent liquid glass, drawn by a fragment shader.
 *
 * How it is built. There is no mesh. A height field is folded around two hand-placed curves (a boundary curve that gives the sheet its
 * silhouette and the main folds, and a second family that crosses it), bent by smooth noise, then lit per pixel: the surface normal
 * comes from the height field, the reflection looks up a small procedural studio (white softboxes, steel-grey floor, pale pink, cyan and
 * lavender panels), thin-film colour appears at grazing angles, and a few thin specular lines and sparse sparkles finish it. The
 * top-left (the top, on phones) stays white for the headline. Phones get their own composition, not a stretched desktop one.
 *
 * Cost. Everything is per-pixel math, so the canvas resolution is the lever: it starts modest and a small controller lowers it if
 * frames run long. Drawing stops off screen and in background tabs. Reduced motion draws a single still frame. The two WebP posters
 * next to this file are frames of this same shader: they paint first and are the fallback when WebGL is missing.
 */

type Pt = [number, number];
type Layout = { c: Pt[]; c2: Pt[]; notch: number; width: number };

// Curves in normalized canvas coordinates (0,0 top-left, 1,1 bottom-right). `width` 0 means: scale x by the canvas aspect ratio.
const LAYOUTS: { desktop: Layout; mobile: Layout } = {
  desktop: { c: [[1.29, -1.27], [0.66, -0.1], [0.59, 0.03], [0.49, 0.13], [0.425, 0.24], [0.405, 0.36], [0.41, 0.48], [0.35, 0.6], [0.19, 0.68], [-1.53, 0.88]], c2: [[2.3, -0.65], [1.1, 0.1], [0.9, 0.25], [0.72, 0.45], [0.6, 0.62], [0.42, 0.8], [-1.5, 1.1]], notch: 1, width: 0 },
  mobile: { c: [[2.2, 0.05], [1.6, 0.2], [1.1, 0.33], [0.75, 0.41], [0.4, 0.47], [0.12, 0.53], [-0.15, 0.6], [-0.5, 0.66], [-1.0, 0.7], [-1.6, 0.74]], c2: [[2.5, 0.3], [1.6, 0.45], [1.0, 0.58], [0.6, 0.7], [0.2, 0.8], [-0.2, 0.9], [-1.5, 1.1]], notch: 0, width: 0.85 },
};

const T0 = 3; // the posters are frames at this time, so the live canvas fades in over an identical picture

const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";

const FRAG = /* glsl */ `precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uLook;
uniform vec2 uSize;   // canvas extent in shader units
uniform float uNotch; // 1: the lower right falls back to white (desktop)
uniform vec2 uC[10];   // boundary curve of the glass, canvas units (x scaled by aspect), y down; glass is on its right/lower side
uniform vec2 uC2[7];  // a second, crossing fold family

#define PI 3.14159265

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// 1.0 if a ray from p toward +x crosses segment a-b.
float cross2(vec2 p, vec2 a, vec2 b) {
  return ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) ? 1.0 : 0.0;
}
// Signed distance to a polyline, the distance blended smoothly across segments so the folds have no kinks; positive on the glass side.
float sdCurve9(vec2 p) {
  float wsum = 0.0;
  float inside = 0.0;
  for (int i = 0; i < 9; i++) {
    vec2 a = uC[i], b = uC[i + 1];
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    wsum += exp(-length(pa - ba * h) * 16.0);
    inside += cross2(p, a, b);
  }
  // close the curve into a polygon around the glass side, so the sign is an exact inside/outside test
  vec2 e0 = uC[9], s0 = uC[0];
  inside += cross2(p, e0, vec2(e0.x, 8.0)) + cross2(p, vec2(e0.x, 8.0), vec2(8.0, 8.0)) + cross2(p, vec2(8.0, 8.0), vec2(8.0, s0.y)) + cross2(p, vec2(8.0, s0.y), s0);
  float sgn = mod(inside, 2.0) > 0.5 ? 1.0 : -1.0;
  return max(-log(max(wsum, 1e-30)) / 16.0, 0.0) * sgn;
}
float sdCurve7(vec2 p) {
  float wsum = 0.0;
  float inside = 0.0;
  for (int i = 0; i < 6; i++) {
    vec2 a = uC2[i], b = uC2[i + 1];
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    wsum += exp(-length(pa - ba * h) * 16.0);
    inside += cross2(p, a, b);
  }
  // close the curve into a polygon around the glass side, so the sign is an exact inside/outside test
  vec2 e0 = uC2[6], s0 = uC2[0];
  inside += cross2(p, e0, vec2(e0.x, 8.0)) + cross2(p, vec2(e0.x, 8.0), vec2(8.0, 8.0)) + cross2(p, vec2(8.0, 8.0), vec2(8.0, s0.y)) + cross2(p, vec2(8.0, s0.y), s0);
  float sgn = mod(inside, 2.0) > 0.5 ? 1.0 : -1.0;
  return max(-log(max(wsum, 1e-30)) / 16.0, 0.0) * sgn;
}

// Height of the glass; q is in canvas units, y down.
float height(vec2 q, float t) {
  vec2 w = q + (vec2(vnoise(q * 1.3 + vec2(1.7, 9.2) + t * 0.010), vnoise(q * 1.3 + vec2(8.3, 2.8) - t * 0.008)) - 0.5) * 0.46
             + (vec2(vnoise(q * 4.3 + vec2(4.1, 1.3)), vnoise(q * 4.3 + vec2(7.7, 5.5))) - 0.5) * 0.05;
  float d1 = sdCurve9(w), d2 = sdCurve7(w);
  float ph = vnoise(w * 1.7 + 3.0) * 2.2;
  float h = 0.0;
  // broad folds that follow the boundary
  h += 0.85 * sin(d1 * 11.0 + ph + t * 0.04);
  // creases: narrow, pinched ridges
  float c = 1.0 - abs(sin(d1 * 21.0 + ph * 1.6 + 1.3));
  h += 0.42 * c * c * c * (0.3 + vnoise(w * 2.4 + 9.0));
  // a crossing family
  h += 0.55 * sin(d2 * 9.5 + ph * 0.7 + 2.0 - t * 0.03) * (0.2 + vnoise(w * 1.8 + 5.0));
  h += 0.05 * sin(d1 * 33.0 + d2 * 14.0 + ph * 2.0);
  return h * 0.03;
}

vec3 film(float t) {
  vec3 c = 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  return mix(vec3(0.84), c, 0.42);
}

vec3 env(vec2 r) {
  float g = smoothstep(-1.1, 1.0, r.y * 0.8 + r.x * 0.4);
  vec3 c = mix(vec3(0.30, 0.33, 0.42), vec3(0.88, 0.89, 0.94), g);
  float bandA = exp(-pow((r.x * 0.9 + r.y * 0.5 - 0.10) * 4.2, 2.0));
  float bandB = exp(-pow((r.x * 0.5 - r.y * 0.9 + 0.30) * 4.5, 2.0));
  c = mix(c, vec3(1.0), bandA * 0.95);
  c = mix(c, vec3(0.34, 0.40, 0.52), bandB * 0.55);
  c = mix(c, vec3(1.0, 0.74, 0.90), smoothstep(0.05, 0.6, -r.x - r.y * 0.4) * 0.36);
  c = mix(c, vec3(0.58, 0.92, 0.96), smoothstep(0.1, 0.7, r.x * 0.7 + r.y * 0.3) * 0.5);
  c = mix(c, vec3(0.78, 0.70, 0.99), smoothstep(0.2, 0.8, r.y - r.x * 0.2) * 0.42);
  return c;
}

void main() {
  vec2 frag = gl_FragCoord.xy / uRes;
  vec2 q = vec2(frag.x, 1.0 - frag.y) * uSize;
  float t = uTime;

  float e = 0.0022;
  float h0 = height(q, t);
  vec2 g = vec2(height(q + vec2(e, 0.0), t) - h0, height(q + vec2(0.0, e), t) - h0) / e;
  g.y = -g.y; // reflect in y-up space
  vec3 N = normalize(vec3(-g * 2.9, 1.0));

  float ndv = N.z;
  vec2 r = N.xy * 2.0 * ndv + uLook * 0.1;
  vec3 col = env(r);

  float graze = 1.0 - ndv;
  float hue = graze * 1.4 + h0 * 2.5 + dot(q, vec2(0.9, -0.5)) * 0.8 + t * 0.004;
  col = mix(col, film(hue), smoothstep(0.0, 0.3, graze) * 0.22);
  vec3 Hh = normalize(vec3(-0.3, 0.5, 1.0));
  col = mix(col, vec3(1.0), pow(max(dot(N, Hh), 0.0), 140.0) * 0.8);
  col *= mix(0.90, 1.03, smoothstep(-0.035, 0.03, h0));

  // Silhouette: the glass lies beyond the boundary curve, with soft, uneven edges.
  float dd = sdCurve9(q + (vec2(vnoise(q * 3.0 + 2.0), vnoise(q * 3.0 + 7.0)) - 0.5) * 0.05);
  float m = smoothstep(0.0, 0.09, dd);
  // The far right, below the upper sheet, falls back to white.
  float notch = smoothstep(0.86, 0.95, frag.x) * smoothstep(0.40, 0.55, 1.0 - frag.y);
  m *= 1.0 - notch * 0.95 * uNotch;
  // Pale at the edges, full strength inside.
  col = mix(col, vec3(0.97, 0.97, 0.99), 0.12);
  float depth = smoothstep(0.0, 0.18, dd);
  col = mix(mix(vec3(0.96, 0.96, 0.98), col, 0.55), col, depth);

  // Sparkle.
  vec2 sp = frag * uSize * 200.0;
  float hs = hash(floor(sp));
  float spark = step(0.9965, hs) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5)) * (0.6 + 0.4 * sin(t * 0.8 + hs * 60.0));
  col += spark * 0.8 * m;

  col = mix(vec3(0.988, 0.988, 0.992), col, m);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function HeroGlassLive() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 800ms cubic-bezier(0.16,1,0.3,1)";
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) return; // no WebGL: the poster stays
    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (!hp || hp.precision === 0) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = U("uRes"), uTime = U("uTime"), uLook = U("uLook"), uSize = U("uSize"), uNotch = U("uNotch"), uC = U("uC"), uC2 = U("uC2");
    el.appendChild(canvas);

    let scale = coarse ? 0.7 : 1; // resolution controller output, multiplies the device pixel ratio
    let lastLayout = "";
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * scale;
      const cw = Math.max(2, Math.round(w * dpr)), ch = Math.max(2, Math.round(h * dpr));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0, 0, cw, ch);
      gl.uniform2f(uRes, cw, ch);
      const aspect = w / h;
      const key = aspect < 1.1 ? "mobile" : "desktop";
      const L = LAYOUTS[key];
      const sx = L.width || aspect, sy = L.width ? L.width / aspect : 1;
      const sig = key + sx.toFixed(3) + sy.toFixed(3);
      if (sig !== lastLayout) {
        lastLayout = sig;
        gl.uniform2f(uSize, sx, sy);
        gl.uniform1f(uNotch, L.notch);
        gl.uniform2fv(uC, new Float32Array(L.c.flatMap(([x, y]) => [x * sx, y * sy])));
        gl.uniform2fv(uC2, new Float32Array(L.c2.flatMap(([x, y]) => [x * sx, y * sy])));
      }
    };

    const look = [0, 0], lookTarget = [0, 0];
    const onMove = (e: PointerEvent) => {
      lookTarget[0] = (e.clientX / window.innerWidth) * 2 - 1;
      lookTarget[1] = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    if (!coarse && !still) window.addEventListener("pointermove", onMove, { passive: true });

    let shown = false, visible = true, raf = 0, last = performance.now(), t = T0, frames = 0, slow = 0, lost = false;
    const draw = () => {
      gl.uniform1f(uTime, t);
      gl.uniform2f(uLook, look[0] ?? 0, look[1] ?? 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!shown) { shown = true; canvas.style.opacity = "1"; }
    };
    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden || lost) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      const k = 1 - Math.exp(-dt * 2.5);
      look[0] = (look[0] ?? 0) + ((lookTarget[0] ?? 0) - (look[0] ?? 0)) * k;
      look[1] = (look[1] ?? 0) + ((lookTarget[1] ?? 0) - (look[1] ?? 0)) * k;
      draw();
      // Resolution controller: if frames keep running long, trade pixels for time (and never go below half).
      frames++;
      if (dt > (coarse ? 0.045 : 0.026)) slow++;
      if (frames === 40) {
        if (slow > 14 && scale > 0.5) { scale = Math.max(0.5, scale * 0.8); resize(); }
        frames = 0;
        slow = 0;
      }
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!still && visible && !document.hidden && !raf && !lost) { last = performance.now(); raf = requestAnimationFrame(frame); }
    };

    const ro = new ResizeObserver(() => { resize(); if (still) draw(); });
    ro.observe(el);
    resize();
    const io = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? true; start(); });
    io.observe(el);
    document.addEventListener("visibilitychange", start);
    const onLost = (e: Event) => { e.preventDefault(); lost = true; canvas.style.opacity = "0"; };
    canvas.addEventListener("webglcontextlost", onLost);
    if (still) draw(); else start();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", start);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, []);

  return <div ref={host} className="absolute inset-0" />;
}
