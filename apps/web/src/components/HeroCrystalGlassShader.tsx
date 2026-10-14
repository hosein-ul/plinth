"use client";

import { useEffect, useRef } from "react";

const VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const FRAGMENT_SHADER = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform float u_stack;  // 1.0 when the hero is a single column (phones, tablets)
  uniform float u_lite;   // 1.0 on phones: fewer height samples per pixel

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Sculpted liquid-glass heightfield: long diagonal ribbons, smooth valleys, pinched crystal ridges.
  float glassField(vec2 p, float t) {
    mat2 rot = mat2(0.84, -0.54, 0.54, 0.84);
    vec2 rp = rot * p;

    float w1 = snoise(vec2(rp.x * 0.8 - t * 0.12, rp.y * 1.5 + t * 0.08));
    float w2 = snoise(vec2(rp.x * 1.5 + w1 * 0.5, rp.y * 2.8 - t * 0.15));

    float fold1 = sin(rp.y * 5.2 + w1 * 2.6 + w2 * 0.9 - t * 0.3);
    float fold2 = cos(rp.y * 8.6 - w1 * 2.0 + w2 * 1.4 + t * 0.2);
    float fold3 = sin(rp.y * 3.0 + rp.x * 1.6 + w1 * 1.6);

    float ridge1 = pow(0.5 + 0.5 * fold1, 2.2);
    float ridge2 = pow(0.5 + 0.5 * fold2, 3.4);
    float swell  = 0.5 + 0.5 * fold3;

    return ridge1 * 0.52 + ridge2 * 0.28 + swell * 0.20;
  }

  // Thin-film interference palette: icy cyan, lavender, pearl rose, a hint of champagne.
  vec3 prismDispersion(float phase) {
    vec3 a = vec3(0.90, 0.93, 0.97);
    vec3 b = vec3(0.10, 0.09, 0.11);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.08, 0.38, 0.72);
    return a + b * cos(6.28318 * (c * phase + d));
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float t = u_time * 0.35;

    // Soft pointer warp on the glass surface.
    vec2 mouseP = vec2(u_mouse.x * aspect, u_mouse.y);
    float mDist = length(p - mouseP);
    vec2 sampleP = p + (p - mouseP) * exp(-mDist * 3.5) * 0.06;

    float eps = 0.0035;
    float hC = glassField(sampleP, t);
    float hX = glassField(sampleP + vec2(eps, 0.0), t);
    float hY = glassField(sampleP + vec2(0.0, eps), t);

    float chromaSplit;
    if (u_lite > 0.5) {
      chromaSplit = abs(hX - hY) * 1.4;
    } else {
      float hR = glassField(sampleP + vec2(eps * 2.2, -eps * 1.5), t);
      float hB = glassField(sampleP - vec2(eps * 2.2, -eps * 1.5), t);
      chromaSplit = abs(hR - hB);
    }

    vec3 N = normalize(vec3((hC - hX) / eps, (hC - hY) / eps, 1.35));
    vec3 V = vec3(0.0, 0.0, 1.0);

    vec3 L1 = normalize(vec3(-0.4, 0.6, 1.1));
    vec3 L2 = normalize(vec3((u_mouse.x - 0.5) * 1.2, (u_mouse.y - 0.5) * 1.2, 0.9));
    vec3 H1 = normalize(L1 + V);
    vec3 H2 = normalize(L2 + V);

    float diff = max(dot(N, L1), 0.0) * 0.65 + max(dot(N, L2), 0.0) * 0.35;
    float spec1 = pow(max(dot(N, H1), 0.0), 56.0);
    float spec2 = pow(max(dot(N, H2), 0.0), 96.0);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.3);

    vec3 deepShadow = vec3(0.68, 0.73, 0.80);
    vec3 midSilver  = vec3(0.87, 0.90, 0.94);
    vec3 pearlWhite = vec3(0.98, 0.99, 1.00);

    vec3 baseGlass = mix(deepShadow, midSilver, smoothstep(0.15, 0.65, diff));
    baseGlass = mix(baseGlass, pearlWhite, smoothstep(0.65, 0.95, diff));

    float iridPhase = hC * 1.6 + fresnel * 1.2 - t * 0.08;
    vec3 iridescence = prismDispersion(iridPhase);
    float iridMask = clamp(fresnel * 1.25 + chromaSplit * 2.2 + pow(1.0 - hC, 2.5) * 0.18, 0.0, 0.62);
    vec3 glassColor = mix(baseGlass, iridescence, iridMask);
    glassColor += vec3(1.0) * (spec1 * 0.55 + spec2 * 0.45);

    // ---- layout envelope -------------------------------------------------------------------------------------
    float alpha;
    if (u_stack > 0.5) {
      // Single column: copy sits on top, the mockups below, so the wave rides the lower half and leaves the top white.
      float spine = 0.30 + 0.16 * smoothstep(0.0, 1.0, uv.x) + 0.04 * sin(uv.x * 4.2 - t * 0.25);
      float d = uv.y - spine;
      float width = d > 0.0 ? 0.30 : 0.34;
      float nd = abs(d) / width;
      float env = 1.0 - smoothstep(0.55, 1.02, nd - hC * 0.18);
      float topFade = 1.0 - smoothstep(0.50, 0.74, uv.y);
      alpha = clamp(env * topFade, 0.0, 1.0);
    } else {
      float waveSpine = 0.08 + 0.64 * smoothstep(-0.08, 1.05, uv.x) + 0.06 * sin(uv.x * 4.2 - t * 0.25);
      float distToSpine = uv.y - waveSpine;
      float upperWidth = mix(0.16, 0.58, smoothstep(0.15, 0.85, uv.x));
      float lowerWidth = mix(0.28, 0.65, smoothstep(0.0, 0.7, uv.x));
      float normalizedDist = distToSpine > 0.0 ? distToSpine / upperWidth : abs(distToSpine) / lowerWidth;
      float envelope = 1.0 - smoothstep(0.55, 1.02, normalizedDist - hC * 0.22);
      // Pure white behind the headline.
      vec2 headlineCenter = vec2(0.20, 0.63);
      float headlineDist = length((uv - headlineCenter) * vec2(1.15, 1.45));
      alpha = clamp(envelope * smoothstep(0.20, 0.46, headlineDist), 0.0, 1.0);
    }

    gl_FragColor = vec4(mix(vec3(1.0), glassColor, alpha), 1.0);
  }
`;

/**
 * A zero-dependency WebGL background: a sculpted, refractive, iridescent liquid-glass wave over a pure white studio ground.
 * On phones it renders at 1x, about 30 fps and not while the page is being scrolled; off screen or with reduced motion it
 * stops (reduced motion keeps one still frame). Mount it in a `relative overflow-hidden` container.
 */
export default function HeroCrystalGlassShader({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        if (process.env.NODE_ENV !== "production") console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return; // the white ground stays: the hero still reads
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_resolution");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");
    const uStack = gl.getUniformLocation(prog, "u_stack");
    const uLite = gl.getUniformLocation(prog, "u_lite");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lite = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
    const mouse = { x: 0.65, y: 0.55 };
    const target = { x: 0.65, y: 0.55 };
    let lastScroll = 0, lastDraw = 0, raf = 0, visible = true;
    const start = performance.now();

    const resize = () => {
      const dpr = lite ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uStack, canvas.clientWidth < 1280 ? 1 : 0);
      gl.uniform1f(uLite, lite ? 1 : 0);
    };
    const draw = (seconds: number) => {
      gl.uniform1f(uTime, seconds);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const loop = () => {
      const now = performance.now();
      mouse.x += (target.x - mouse.x) * 0.05;
      mouse.y += (target.y - mouse.y) * 0.05;
      if (!lite || (now - lastScroll > 140 && now - lastDraw > 32)) { lastDraw = now; draw((now - start) / 1000); }
      raf = requestAnimationFrame(loop);
    };
    const run = () => { if (!raf && visible && !document.hidden && !reduce) raf = requestAnimationFrame(loop); };
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    resize();
    draw(6);
    const ro = new ResizeObserver(() => { resize(); if (!raf) draw(6); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; visible ? run() : stop(); });
    io.observe(canvas);
    const onVis = () => (document.hidden ? stop() : run());
    document.addEventListener("visibilitychange", onVis);
    const onScroll = () => { lastScroll = performance.now(); };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = canvas.getBoundingClientRect();
      target.x = (e.clientX - r.left) / r.width;
      target.y = 1 - (e.clientY - r.top) / r.height;
    };
    if (lite) window.addEventListener("scroll", onScroll, { passive: true });
    else window.addEventListener("pointermove", onMove, { passive: true });
    run();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 -z-10 h-full w-full select-none ${className}`} />;
}
