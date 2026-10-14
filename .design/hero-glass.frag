precision highp float;
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
