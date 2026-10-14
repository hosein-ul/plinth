"use client";

import { useEffect, useRef } from "react";

/**
 * The live version of the hero glass. The ribbon is a real 3D surface: a flat (u, s) grid that the vertex shader bends into the
 * ribbon every frame, with a physically based iridescent clearcoat lit by a studio environment. All the motion runs on the GPU;
 * the CPU only updates three uniforms a frame. The pointer presses a soft swell into the glass and tilts it a little.
 *
 * It mounts over the baked poster and fades in after its first frame, so nothing pops. It never runs on touch devices, on small
 * screens or for reduced motion (the poster stays), and it stops drawing while off screen or in a background tab.
 */

const RIBBON_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uPointer;   // xy in object space, z = strength 0..1
const float PI = 3.14159265;

vec3 centreLine(float u) {
  float x = mix(-13.5, 14.0, u);
  float y = mix(-8.4, 8.6, u) + 1.9 * sin(u * 4.4 + 0.4 + 0.18 * sin(uTime * 0.21)) - 1.6 * sin(u * 2.0);
  float z = 2.6 * sin(u * 3.4 + 0.4 + 0.25 * sin(uTime * 0.13)) + 1.2 * cos(u * 8.0 - uTime * 0.17);
  return vec3(x, y, z);
}

vec3 ribbonAt(float u, float s) {
  vec3 c = centreLine(u);
  vec3 t = normalize(centreLine(min(1.0, u + 0.002)) - centreLine(max(0.0, u - 0.002)));
  vec3 side0 = normalize(vec3(-t.y, t.x, 0.0));
  vec3 up0 = normalize(cross(t, side0));
  float roll = 0.9 * sin(u * 6.0 + 0.3 + 0.22 * sin(uTime * 0.17)) + 0.7 * sin(u * 2.3 + 1.7);
  vec3 side = side0 * cos(roll) + up0 * sin(roll);
  vec3 nrm = normalize(cross(t, side));
  float width = mix(3.4, 9.6, smoothstep(0.0, 0.9, u)) * (1.0 + 0.14 * sin(u * 8.0 + 1.0));
  float a = s * 2.0;
  float f1 = sin(a * 5.2 + u * 9.0 + 0.5 + uTime * 0.31);
  float f2 = sin(a * 9.6 - u * 5.0 + 2.1 - uTime * 0.23) * 0.5;
  float f3 = pow(abs(sin(a * 3.1 + u * 12.0 - uTime * 0.19)), 1.6) * 0.9;
  float edge = 0.5 + 0.5 * cos(a * PI * 0.5);
  float lift = (0.70 * f1 + 0.34 * f2 + 0.46 * f3) * (0.55 + 0.9 * edge) * mix(0.55, 1.15, u);
  vec3 p = c + side * (s * width);
  vec2 d = p.xy - uPointer.xy;
  lift += 1.1 * uPointer.z * exp(-dot(d, d) / 7.0);
  return p + nrm * lift;
}
`;

const FILM_GLSL = /* glsl */ `
  vec3 Vv = normalize(vViewPosition);
  float ndv = clamp(abs(dot(normalize(vNormal), Vv)), 0.0, 1.0);
  float ph = ndv * 2.2 + vViewPosition.x * 0.012 + uTime * 0.04;
  vec3 film = 0.5 + 0.5 * cos(6.28318 * (vec3(1.0) * ph + vec3(0.0, 0.33, 0.67)));
  film = mix(vec3(0.78, 0.94, 1.0), film, 0.8);
  float rim = pow(1.0 - ndv, 1.7);
  outgoingLight = mix(outgoingLight, outgoingLight * (0.66 + 0.7 * film) + film * 0.2, clamp(rim * 1.7 + 0.38, 0.0, 0.97));
  #include <opaque_fragment>
`;

export function HeroGlassLive() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ok =
      window.matchMedia("(min-width: 1280px) and (pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!ok) return;

    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
      if (disposed) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      } catch {
        return; // no WebGL: the poster stays
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.04;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const canvas = renderer.domElement;
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 900ms cubic-bezier(0.16,1,0.3,1)";
      el.appendChild(canvas);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xffffff);
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      const panel = (hex: number, i: number, x: number, y: number, z: number, w: number, h: number, ry = 0) => {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(i), side: THREE.DoubleSide }),
        );
        m.position.set(x, y, z);
        m.rotation.y = ry;
        room.add(m);
      };
      panel(0x7fe9ff, 16, -7, 3, 2, 1.6, 6, 0.9);
      panel(0xc4a8ff, 14, 6, 4, -3, 1.4, 7, -0.8);
      panel(0xff9fe4, 13, 2, -2, 6, 5, 1.2, 0);
      panel(0xffe9a0, 5, -3, 6, -5, 4, 1.0, 0.3);
      panel(0xffffff, 3.2, 0, 7, 3, 12, 3, 0); // a broad softbox overhead lifts the greys into silver
      panel(0xffffff, 2.2, 0, 0, 9, 14, 6, 0);
      const envTex = pmrem.fromScene(room, 0.035).texture;
      scene.environment = envTex;

      const camera = new THREE.PerspectiveCamera(30, 1.6, 0.1, 100);
      camera.position.set(0, 0, 18.5);
      camera.lookAt(0, 0, 0);

      // A flat grid of (u, s); the vertex shader turns it into the ribbon.
      const U = 360, S = 110;
      const grid = new Float32Array((U + 1) * (S + 1) * 3);
      for (let i = 0; i <= U; i++) for (let j = 0; j <= S; j++) {
        const k = (i * (S + 1) + j) * 3;
        grid[k] = i / U;
        grid[k + 1] = j / S - 0.5;
      }
      const index: number[] = [];
      for (let i = 0; i < U; i++) for (let j = 0; j < S; j++) {
        const a = i * (S + 1) + j, b = a + 1, c = a + S + 1, d = c + 1;
        index.push(a, b, c, b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(grid, 3));
      geo.setIndex(index);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);

      const uniforms = { uTime: { value: 0 }, uPointer: { value: new THREE.Vector3(0, 0, 0) } };
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xe2e7f1),
        metalness: 0.72, roughness: 0.12,
        clearcoat: 1, clearcoatRoughness: 0.06,
        iridescence: 1, iridescenceIOR: 2.0, iridescenceThicknessRange: [320, 1150],
        sheen: 0.4, sheenColor: new THREE.Color(0xdde8ff), sheenRoughness: 0.4,
        envMapIntensity: 1.35, side: THREE.DoubleSide,
      });
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uniforms);
        sh.vertexShader = RIBBON_GLSL + sh.vertexShader
          .replace(
            "#include <beginnormal_vertex>",
            `float ru = position.x, rs = position.y;
             vec3 ribbonPos = ribbonAt(ru, rs);
             vec3 dU = ribbonAt(min(1.0, ru + 0.0015), rs) - ribbonAt(max(0.0, ru - 0.0015), rs);
             vec3 dS = ribbonAt(ru, min(0.5, rs + 0.004)) - ribbonAt(ru, max(-0.5, rs - 0.004));
             vec3 objectNormal = normalize(cross(dU, dS));`,
          )
          .replace("#include <begin_vertex>", "vec3 transformed = ribbonPos;");
        sh.fragmentShader = "uniform float uTime;\n" + sh.fragmentShader.replace("#include <opaque_fragment>", FILM_GLSL);
      };
      const group = new THREE.Group();
      const ribbon = new THREE.Mesh(geo, mat);
      ribbon.frustumCulled = false;
      group.add(ribbon);

      // Glitter: fixed points near the glass that drift with it.
      const NS = 420, sp = new Float32Array(NS * 3);
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let n = 0; n < NS; n++) {
        const u = rnd();
        const x = -13.5 + 27.5 * u, y = -8.4 + 17 * u + 1.9 * Math.sin(u * 4.4 + 0.4) - 1.6 * Math.sin(u * 2.0);
        const spread = (rnd() - 0.5) * (5 + 7 * u);
        sp[n * 3] = x + (rnd() - 0.5) * 4 + spread * 0.3;
        sp[n * 3 + 1] = y + spread * 0.9;
        sp[n * 3 + 2] = 2.6 * Math.sin(u * 3.4 + 0.4) + 1 + rnd() * 2;
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
      const sm = new THREE.PointsMaterial({ color: 0xffffff, size: 0.045, transparent: true, opacity: 0.9, depthWrite: false });
      group.add(new THREE.Points(sg, sm));
      group.position.set(2.6, 0.2, 0);
      scene.add(group);

      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // Keep the horizontal field of view of the 16:10 bake, so the ribbon frames the same on wider or taller heroes.
        const hfov = 2 * Math.atan(Math.tan((30 * Math.PI) / 360) * 1.6);
        camera.fov = Math.min(42, Math.max(24, (2 * Math.atan(Math.tan(hfov / 2) / camera.aspect) * 180) / Math.PI));
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      // Pointer, eased: target in object space on the z = 0 plane, plus a strength that fades when the pointer rests.
      const ndc = new THREE.Vector2(0, 0);
      const target = new THREE.Vector3(), eased = new THREE.Vector3();
      let strength = 0, lastMove = -1e9, tiltX = 0, tiltY = 0;
      const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        if (e.clientY > r.bottom || e.clientY < r.top) return;
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        if (ray.ray.intersectPlane(plane, hit)) target.copy(hit).sub(group.position).divideScalar(group.scale.x);
        lastMove = performance.now();
      };
      window.addEventListener("pointermove", onMove, { passive: true });

      let visible = true, raf = 0, shown = false, last = performance.now(), t = 0;
      const io = new IntersectionObserver(([entry]) => {
        visible = entry?.isIntersecting ?? true;
        if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
      });
      io.observe(el);
      const onVis = () => {
        if (!document.hidden && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
      };
      document.addEventListener("visibilitychange", onVis);

      function frame(now: number) {
        raf = 0;
        if (!visible || document.hidden) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;
        const k = 1 - Math.exp(-dt * 3.2);
        eased.lerp(target, k);
        const want = now - lastMove < 1400 ? 1 : 0;
        strength += (want - strength) * (1 - Math.exp(-dt * (want ? 2.4 : 0.9)));
        uniforms.uTime.value = t;
        uniforms.uPointer.value.set(eased.x, eased.y, strength);
        tiltX += (ndc.y * 0.05 - tiltX) * k;
        tiltY += (ndc.x * 0.07 - tiltY) * k;
        group.rotation.set(-tiltX, tiltY, 0);
        renderer.render(scene, camera);
        if (!shown) { shown = true; canvas.style.opacity = "1"; }
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);

      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("visibilitychange", onVis);
        geo.dispose(); mat.dispose(); sg.dispose(); sm.dispose(); envTex.dispose(); pmrem.dispose();
        renderer.dispose();
        canvas.remove();
      };
    })();

    return () => { disposed = true; cleanup(); };
  }, []);

  return <div ref={host} className="absolute inset-0" />;
}
