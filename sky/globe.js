// globe.js — the 3D Earth for /sky (three.js 0.160.0 via the import map).
// Procedural "dot-matrix + night lights" texture painted once from world-atlas
// TopoJSON, a shader with a live day/night terminator, theme-tinted atmosphere,
// the ISS on its orbit, its ground track and footprint, and the viewer's spot.
// Input: drag (inertia), pinch / wheel zoom, double-tap to recenter on the ISS.
import * as THREE from 'three';

const RAD = Math.PI / 180;
const RE = 6371;
const TAU = Math.PI * 2;

export function vecLL(lat, lon, r = 1, out = new THREE.Vector3()) {
  const p = lat * RAD, l = lon * RAD;
  return out.set(r * Math.cos(p) * Math.cos(l), r * Math.sin(p), -r * Math.cos(p) * Math.sin(l));
}
const hex3 = (h) => { const n = parseInt(h.replace('#', ''), 16); return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

/* ---------------- textures ---------------- */
function glowTexture(stops, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function ringTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.lineWidth = size * 0.035;
  g.beginPath(); g.arc(size / 2, size / 2, size * 0.42, 0, TAU); g.stroke();
  return new THREE.CanvasTexture(c);
}

// Big metros for night lights (lat, lon, weight). Approximate on purpose.
const METROS = [
  [35.68, 139.69, 1], [34.69, 135.5, .8], [37.57, 126.98, .9], [39.9, 116.4, .9], [31.23, 121.47, 1], [22.54, 114.06, .9],
  [23.13, 113.26, .8], [30.57, 104.07, .6], [29.56, 106.55, .6], [34.26, 108.94, .5], [30.59, 114.3, .6], [36.07, 120.38, .5],
  [25.03, 121.56, .7], [14.6, 120.98, .8], [13.76, 100.5, .8], [10.82, 106.63, .7], [21.03, 105.85, .6], [1.35, 103.82, .7],
  [3.14, 101.69, .6], [-6.2, 106.85, .9], [-7.25, 112.75, .5], [28.61, 77.21, 1], [19.08, 72.88, 1], [12.97, 77.59, .8],
  [13.08, 80.27, .7], [22.57, 88.36, .8], [17.39, 78.49, .6], [23.81, 90.41, .8], [24.86, 67.0, .8], [31.55, 74.34, .6],
  [33.69, 73.05, .4], [35.69, 51.39, .7], [41.01, 28.98, .8], [30.04, 31.24, .9], [24.71, 46.68, .6], [25.2, 55.27, .6],
  [33.31, 44.36, .5], [32.08, 34.78, .6], [31.77, 35.21, .4], [33.89, 35.5, .3], [6.52, 3.38, .7], [-1.29, 36.82, .4],
  [-26.2, 28.05, .6], [-33.92, 18.42, .4], [5.6, -0.19, .3], [9.03, 38.74, .3], [33.57, -7.59, .4], [36.75, 3.06, .4],
  [51.51, -0.13, 1], [48.86, 2.35, .9], [52.52, 13.4, .7], [40.42, -3.7, .7], [41.39, 2.17, .5], [41.9, 12.5, .6],
  [45.46, 9.19, .6], [52.37, 4.9, .6], [50.85, 4.35, .5], [48.21, 16.37, .5], [50.08, 14.44, .4], [52.23, 21.01, .5],
  [55.76, 37.62, 1], [59.94, 30.31, .6], [50.45, 30.52, .5], [53.48, -2.24, .5], [53.35, -6.26, .3], [59.33, 18.07, .3],
  [38.72, -9.14, .4], [37.98, 23.73, .4], [44.43, 26.1, .4], [47.5, 19.04, .4], [40.71, -74.0, 1], [34.05, -118.24, 1],
  [41.88, -87.63, .8], [29.76, -95.37, .7], [32.78, -96.8, .7], [33.75, -84.39, .6], [25.76, -80.19, .6], [38.91, -77.04, .6],
  [42.36, -71.06, .6], [39.95, -75.17, .6], [37.77, -122.42, .7], [47.61, -122.33, .5], [33.45, -112.07, .5], [39.74, -104.99, .4],
  [44.98, -93.27, .4], [42.33, -83.05, .4], [43.65, -79.38, .7], [45.5, -73.57, .5], [49.28, -123.12, .4], [19.43, -99.13, 1],
  [20.67, -103.35, .5], [25.69, -100.32, .5], [23.11, -82.37, .3], [4.71, -74.07, .6], [10.48, -66.9, .4], [-12.05, -77.04, .6],
  [-0.18, -78.47, .3], [-23.55, -46.63, 1], [-22.91, -43.17, .8], [-15.79, -47.88, .4], [-19.92, -43.94, .5], [-30.03, -51.23, .4],
  [-34.6, -58.38, .8], [-33.45, -70.67, .6], [-33.87, 151.21, .6], [-37.81, 144.96, .6], [-27.47, 153.03, .3], [-31.95, 115.86, .3],
  [-36.85, 174.76, .3], [43.06, 141.35, .3], [33.59, 130.4, .4], [35.18, 136.91, .5], [39.02, 125.75, .2], [43.82, 125.32, .3],
  [41.8, 123.43, .4], [45.75, 126.65, .3], [32.06, 118.8, .5], [30.27, 120.15, .5], [26.07, 119.3, .3], [38.04, 114.51, .4],
];

/** Paint the equirectangular land/dots/lights texture. R = land dots, G = city lights, B = land fill + borders. */
export function paintEarthTexture(countries, opts = {}) {
  const W = opts.size || 2048, H = W / 2;
  const px = (lon) => ((lon + 180) / 360) * W, py = (lat) => ((90 - lat) / 180) * H;
  const path = (g, rings) => {
    for (const r of rings) {
      r.forEach(([lo, la], i) => (i ? g.lineTo(px(lo), py(la)) : g.moveTo(px(lo), py(la))));
      g.closePath();
    }
  };
  // land mask (for dot sampling)
  const mask = document.createElement('canvas');
  mask.width = W; mask.height = H;
  const mg = mask.getContext('2d', { willReadFrequently: true });
  mg.fillStyle = '#000'; mg.fillRect(0, 0, W, H);
  mg.fillStyle = '#fff';
  for (const c of countries) for (const p of c.polys) { mg.beginPath(); path(mg, p); mg.fill('evenodd'); }
  const md = mg.getImageData(0, 0, W, H).data;
  const isLand = (lat, lon) => {
    const x = Math.min(W - 1, Math.max(0, Math.floor(px(lon)))), y = Math.min(H - 1, Math.max(0, Math.floor(py(lat))));
    return md[(y * W + x) * 4] > 127;
  };

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  // B: land fill + borders
  g.fillStyle = 'rgb(0,0,110)';
  for (const c of countries) for (const p of c.polys) { g.beginPath(); path(g, p); g.fill('evenodd'); }
  g.strokeStyle = 'rgb(0,0,150)';
  g.lineWidth = Math.max(1, W / 1400);
  for (const c of countries) for (const p of c.polys) { g.beginPath(); path(g, [p[0]]); g.stroke(); }
  // R: evenly spaced dots on the sphere (Fibonacci lattice)
  const N = opts.dots || (W >= 2048 ? 26000 : 12000);
  const ga = Math.PI * (3 - Math.sqrt(5));
  const dotR = W / 900;
  const landPts = [];
  g.fillStyle = 'rgb(255,0,0)';
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N;
    const lat = Math.asin(y) / RAD;
    const lon = ((((i * ga) / RAD) % 360) + 360) % 360 - 180;
    if (!isLand(lat, lon)) continue;
    landPts.push([lat, lon]);
    const sx = Math.min(8, 1 / Math.max(0.12, Math.cos(lat * RAD)));
    g.beginPath();
    g.ellipse(px(lon), py(lat), dotR * sx, dotR, 0, 0, TAU);
    g.fill();
    if (px(lon) - dotR * sx < 0) { g.beginPath(); g.ellipse(px(lon) + W, py(lat), dotR * sx, dotR, 0, 0, TAU); g.fill(); }
    if (px(lon) + dotR * sx > W) { g.beginPath(); g.ellipse(px(lon) - W, py(lat), dotR * sx, dotR, 0, 0, TAU); g.fill(); }
  }
  // G: night lights — metros + a seeded scatter over temperate land
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const light = (lat, lon, r, a) => {
    const sx = 1 / Math.max(0.2, Math.cos(lat * RAD));
    const x = px(lon), y = py(lat);
    g.save();
    g.translate(x, y); g.scale(sx, 1);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, `rgba(0,255,0,${a})`);
    gr.addColorStop(0.35, `rgba(0,255,0,${a * 0.45})`);
    gr.addColorStop(1, 'rgba(0,255,0,0)');
    g.fillStyle = gr;
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
  };
  const k = W / 2048;
  for (const p of landPts) {
    const [lat] = p;
    if (lat < -45 || lat > 64) continue;
    const temperate = Math.abs(lat) > 18 && Math.abs(lat) < 58 ? 1 : 0.55;
    if (rnd() < 0.2 * temperate) light(p[0] + (rnd() - 0.5) * 0.6, p[1] + (rnd() - 0.5) * 0.6, (2 + rnd() * 3) * k, 0.18 + rnd() * 0.3);
  }
  for (const [lat, lon, w] of METROS.concat(opts.extraLights || [])) {
    light(lat, lon, (6 + 10 * w) * k, 0.55 + 0.45 * w);
    for (let j = 0; j < 4; j++) light(lat + (rnd() - 0.5) * 2.2 * w, lon + (rnd() - 0.5) * 2.6 * w, (3 + 4 * rnd()) * k, 0.3 * w + 0.15);
  }
  return cv;
}

/* ---------------- shaders ---------------- */
const EARTH_VS = /* glsl */`
varying vec3 vObj; varying vec3 vN; varying vec3 vPos;
void main() {
  vObj = position;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const EARTH_FS = /* glsl */`
precision highp float;
uniform sampler2D map; uniform vec3 sunObj; uniform vec3 sunView;
uniform vec3 cA1; uniform vec3 cA2; uniform vec3 cA3; uniform float ready;
varying vec3 vObj; varying vec3 vN; varying vec3 vPos;
void main() {
  vec3 n = normalize(vObj);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(-n.z, n.x);
  vec2 uv = vec2(lon / 6.2831853 + 0.5, lat / 3.1415927 + 0.5);
  vec4 tx = texture2D(map, uv) * ready;
  float d = dot(n, sunObj);
  float day = smoothstep(-0.10, 0.22, d);
  vec3 V = normalize(-vPos); vec3 N = normalize(vN);
  float land = smoothstep(0.25, 0.42, tx.b);
  float border = smoothstep(0.5, 0.6, tx.b);
  vec3 oceanDay = mix(vec3(0.016, 0.04, 0.095), cA2 * 0.24, 0.32);
  vec3 oceanNight = vec3(0.005, 0.007, 0.016) + cA1 * 0.022;
  vec3 col = mix(oceanNight, oceanDay, day);
  vec3 landDay = mix(vec3(0.07, 0.09, 0.13), cA1 * 0.4, 0.3);
  vec3 landNight = cA1 * 0.045 + 0.008;
  col = mix(col, mix(landNight, landDay, day), land * 0.92);
  vec3 dotDay = mix(vec3(0.92, 0.95, 1.0), cA2, 0.4);
  vec3 dotNight = mix(cA1, cA3, 0.3) * 0.26;
  col += tx.r * mix(dotNight, dotDay * 0.8, day);
  col += border * mix(cA1 * 0.10, cA2 * 0.22, day);
  float night = 1.0 - smoothstep(-0.16, 0.06, d);
  vec3 warm = mix(vec3(1.0, 0.74, 0.40), cA3, 0.22);
  col += tx.g * tx.g * warm * 1.8 * night;
  col += exp(-pow(d / 0.075, 2.0)) * mix(cA3, cA2, 0.3) * 0.16;
  vec3 H = normalize(sunView + V);
  float spec = pow(max(dot(N, H), 0.0), 70.0) * (1.0 - land) * day;
  col += spec * mix(vec3(1.0), cA2, 0.35) * 0.6;
  float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += fr * mix(cA1 * 0.55, cA2 * 0.95, day) * 0.8;
  gl_FragColor = vec4(col, 1.0);
}`;
const ATMO_VS = /* glsl */`
varying vec3 vN; varying vec3 vObj;
void main() { vObj = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ATMO_FS = /* glsl */`
uniform vec3 cA1; uniform vec3 cA2; uniform vec3 sunObj; uniform float k;
varying vec3 vN; varying vec3 vObj;
void main() {
  float z = -dot(normalize(vN), vec3(0.0, 0.0, 1.0));
  float i = pow(clamp(z * k, 0.0, 1.0), 2.4);
  float s = dot(normalize(vObj), sunObj);
  vec3 c = mix(cA1, cA2, smoothstep(-0.35, 0.45, s)) * (0.45 + 0.8 * smoothstep(-0.6, 0.5, s));
  gl_FragColor = vec4(c * i, i);
}`;
const LINE_VS = /* glsl */`
attribute float aT; varying float vT;
void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LINE_FS = /* glsl */`
uniform vec3 cPast; uniform vec3 cFut; uniform float alpha; uniform float span;
varying float vT;
void main() {
  float a;
  vec3 c;
  if (vT < 0.0) { a = 0.12 + 0.6 * (1.0 + vT / span); c = cPast; }
  else { a = (0.85 - 0.6 * vT / 95.0) * step(0.38, fract(vT / 1.6)); c = cFut; }
  gl_FragColor = vec4(c, max(0.0, a) * alpha);
}`;

/* ---------------- the globe ---------------- */
export function createGlobe(canvas, opts = {}) {
  const lowPower = !!opts.lowPower;
  const reduce = () => (opts.reducedMotion ? opts.reducedMotion() : false);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const dprCap = opts.dprCap || 2;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
  const world = new THREE.Group();   // everything that turns with a drag
  world.rotation.order = 'XYZ';
  scene.add(world);

  const pal = { a1: hex3('#8b5cf6'), a2: hex3('#22d3ee'), a3: hex3('#e879f9') };
  const seg = lowPower ? 72 : 128;

  // Earth
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  const earthU = {
    map: { value: blank }, sunObj: { value: new THREE.Vector3(1, 0, 0) }, sunView: { value: new THREE.Vector3(1, 0, 0) },
    cA1: { value: pal.a1 }, cA2: { value: pal.a2 }, cA3: { value: pal.a3 }, ready: { value: 0 },
  };
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, seg, seg / 2), new THREE.ShaderMaterial({ uniforms: earthU, vertexShader: EARTH_VS, fragmentShader: EARTH_FS }));
  world.add(earth);

  // Atmosphere
  const atmoR = 1.16;
  const atmoU = { cA1: earthU.cA1, cA2: earthU.cA2, sunObj: earthU.sunObj, k: { value: 1 / Math.sqrt(1 - 1 / (atmoR * atmoR)) } };
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(atmoR, 64, 32), new THREE.ShaderMaterial({
    uniforms: atmoU, vertexShader: ATMO_VS, fragmentShader: ATMO_FS, side: THREE.BackSide, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  world.add(atmo);

  // Stars
  {
    const n = lowPower ? 500 : 1400;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, th = r() * TAU, rr = Math.sqrt(1 - u * u);
      pos.set([60 * rr * Math.cos(th), 60 * u, 60 * rr * Math.sin(th)], i * 3);
      const b = 0.25 + Math.pow(r(), 3) * 0.75, t = r();
      col.set([b * (0.85 + 0.15 * t), b * 0.9, b * (0.9 + 0.1 * (1 - t))], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    world.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false })));
  }

  // Sun glow, far away in the sun's direction
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture([[0, 'rgba(255,250,235,1)'], [0.08, 'rgba(255,240,210,.9)'], [0.25, 'rgba(255,210,150,.25)'], [1, 'rgba(255,200,140,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sunSprite.scale.set(9, 9, 1);
  world.add(sunSprite);

  // ISS
  const issGlowTex = glowTexture([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,.95)'], [0.3, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);
  const iss = new THREE.Sprite(new THREE.SpriteMaterial({ map: issGlowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  iss.scale.set(0.12, 0.12, 1);
  const issHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: issGlowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
  issHalo.scale.set(0.3, 0.3, 1);
  const issRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  issRing.scale.set(0.16, 0.16, 1);
  const issGroup = new THREE.Group();
  issGroup.add(issHalo, iss, issRing);
  issGroup.visible = false;
  world.add(issGroup);
  const stalkGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const stalk = new THREE.Line(stalkGeo, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }));
  world.add(stalk);

  // track lines (orbit at altitude + projection on the surface)
  const lineU = (alpha) => ({ cPast: { value: pal.a1 }, cFut: { value: pal.a2 }, alpha: { value: alpha }, span: { value: 50 } });
  const lineMat = (alpha) => new THREE.ShaderMaterial({ uniforms: lineU(alpha), vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const orbitLine = new THREE.Line(new THREE.BufferGeometry(), lineMat(0.9));
  const groundLine = new THREE.Line(new THREE.BufferGeometry(), lineMat(0.38));
  world.add(orbitLine, groundLine);

  // footprint ring
  const fpLine = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending }));
  world.add(fpLine);

  // observer
  const youTex = glowTexture([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,.9)'], [0.35, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']]);
  const you = new THREE.Sprite(new THREE.SpriteMaterial({ map: youTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  you.scale.set(0.07, 0.07, 1);
  const youRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
  youRing.scale.set(0.1, 0.1, 1);
  const youGroup = new THREE.Group();
  youGroup.add(you, youRing);
  youGroup.visible = false;
  world.add(youGroup);

  function applyTheme(p) {
    if (!p) return;
    pal.a1.copy(hex3(p.a1)); pal.a2.copy(hex3(p.a2)); pal.a3.copy(hex3(p.a3));
    const c2 = new THREE.Color().setRGB(pal.a2.x, pal.a2.y, pal.a2.z, THREE.SRGBColorSpace);
    const c3 = new THREE.Color().setRGB(pal.a3.x, pal.a3.y, pal.a3.z, THREE.SRGBColorSpace);
    const c2hi = c2.clone().lerp(new THREE.Color(1, 1, 1), 0.35);
    issHalo.material.color.copy(c2);
    issRing.material.color.copy(c2hi);
    stalk.material.color.copy(c2);
    fpLine.material.color.copy(c2);
    you.material.color.copy(c3.clone().lerp(new THREE.Color(1, 1, 1), 0.3));
    youRing.material.color.copy(c3);
    kick();
  }

  /* ---------- state ---------- */
  const view = {
    yaw: -Math.PI / 2 + 74 * RAD, pitch: 0.5, zoom: 1, // zoom: multiplier of the fitted distance
    vy: 0, vp: 0,
    follow: opts.follow !== false,
    target: null,     // { yaw, pitch } easing goal
    intro: 0,         // 1 → 0 during the opening flight
    lastInput: 0,
    spin: false,
  };
  const data = { iss: null, sun: { lat: 0, lon: 0 }, obs: null, issPos: new THREE.Vector3() };
  let fitDist = 3.2, W = 1, H = 1;
  let onFollow = opts.onFollowChange || (() => {});

  function setFollow(on, why) {
    if (view.follow === on) return;
    view.follow = on;
    onFollow(on, why);
    kick();
  }
  function issTarget() {
    if (!data.iss) return null;
    return { yaw: -Math.PI / 2 - data.iss.lon * RAD, pitch: Math.max(-1.2, Math.min(1.2, data.iss.lat * RAD * 0.8)) };
  }
  function center() {
    setFollow(true, 'center');
    view.vy = view.vp = 0;
    view.spin = false;
    const t = issTarget();
    if (t && reduce()) { view.yaw = t.yaw; view.pitch = t.pitch; }
    if (view.zoom > 1.5 || view.zoom < 0.6) view.zoom = 1;
    kick();
  }

  /* ---------- data setters ---------- */
  function setISS(s) {
    const first = !data.iss;
    data.iss = s;
    if (!s) { issGroup.visible = false; return; }
    vecLL(s.lat, s.lon, 1 + s.alt / RE, data.issPos);
    issGroup.position.copy(data.issPos);
    issGroup.visible = true;
    const base = vecLL(s.lat, s.lon, 1.002);
    const pa = stalkGeo.attributes.position;
    pa.setXYZ(0, base.x, base.y, base.z); pa.setXYZ(1, data.issPos.x, data.issPos.y, data.issPos.z);
    pa.needsUpdate = true;
    if (first) {
      const t = issTarget();
      view.yaw = t.yaw; view.pitch = t.pitch;
      if (!reduce() && opts.intro !== false) { view.intro = 1; }
    }
  }
  function setTrack(points, nowT) {
    const mk = (r) => {
      const pos = new Float32Array(points.length * 3), at = new Float32Array(points.length);
      const v = new THREE.Vector3();
      points.forEach((p, i) => {
        vecLL(p.lat, p.lon, r === 'alt' ? 1 + p.alt / RE : r, v);
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        at[i] = (p.t - nowT) / 60000;
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aT', new THREE.BufferAttribute(at, 1));
      return g;
    };
    orbitLine.geometry.dispose(); orbitLine.geometry = mk('alt');
    groundLine.geometry.dispose(); groundLine.geometry = mk(1.003);
    const span = points.length ? Math.max(1, (nowT - points[0].t) / 60000) : 50;
    orbitLine.material.uniforms.span.value = groundLine.material.uniforms.span.value = span;
    kick();
  }
  function setFootprint(lat, lon, deg) {
    const c = vecLL(lat, lon, 1);
    const up = Math.abs(c.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(c, up).normalize();
    const v = new THREE.Vector3().crossVectors(c, u).normalize();
    const r = deg * RAD, n = 96, pts = [];
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU;
      pts.push(c.clone().multiplyScalar(Math.cos(r)).addScaledVector(u, Math.sin(r) * Math.cos(th)).addScaledVector(v, Math.sin(r) * Math.sin(th)).multiplyScalar(1.004));
    }
    fpLine.geometry.dispose();
    fpLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }
  function setSun(lat, lon) {
    data.sun = { lat, lon };
    vecLL(lat, lon, 1, earthU.sunObj.value);
    sunSprite.position.copy(earthU.sunObj.value).multiplyScalar(40);
  }
  function setObserver(o) {
    data.obs = o;
    if (!o) { youGroup.visible = false; return; }
    youGroup.position.copy(vecLL(o.lat, o.lon, 1.006));
    youGroup.visible = true;
    kick();
  }
  function setLand(countries) {
    const cv = paintEarthTexture(countries, { size: lowPower ? 1024 : 2048, extraLights: opts.extraLights });
    const tex = new THREE.CanvasTexture(cv);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping;
    earthU.map.value = tex;
    earthU.ready.value = 1;
    kick();
  }

  /* ---------- size ---------- */
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // fit the atmosphere-included globe into ~88% of the shorter side
    const frac = (0.86 * Math.min(W, H)) / H;
    fitDist = 1.1 / (Math.tan((camera.fov / 2) * RAD) * frac);
    camera.updateProjectionMatrix();
    kick();
  }

  /* ---------- input ---------- */
  const ptrs = new Map();
  let drag = null, pinch = null, lastTap = null, samples = [];
  const zoomMin = 0.42, zoomMax = 2.4;
  const rotK = () => (Math.PI / Math.max(260, Math.min(W, H))) * 0.9 * Math.min(1, view.zoom * 1.1);
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    view.vy = view.vp = 0;
    view.intro = 0;
    view.spin = false;
    view.lastInput = performance.now();
    if (ptrs.size === 1) { drag = { moved: false }; samples = [{ t: performance.now(), x: e.clientX, y: e.clientY }]; }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.zoom };
      drag = null;
    }
    kick();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    view.lastInput = performance.now();
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      view.zoom = Math.max(zoomMin, Math.min(zoomMax, pinch.z * (pinch.d / Math.max(10, d))));
      kick();
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 6) return;
    if (!drag.moved) { drag.moved = true; setFollow(false, 'drag'); }
    const k = rotK();
    view.yaw += dx * k;
    view.pitch = Math.max(-1.35, Math.min(1.35, view.pitch + dy * k));
    const now = performance.now();
    samples.push({ t: now, x: e.clientX, y: e.clientY });
    while (samples.length > 2 && now - samples[0].t > 90) samples.shift();
    kick();
  });
  const end = (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    const now = performance.now();
    if (pinch) { if (ptrs.size < 2) pinch = null; if (ptrs.size === 1) { const q = [...ptrs.values()][0]; q.x0 = q.x; q.y0 = q.y; drag = { moved: true }; samples = [{ t: now, x: q.x, y: q.y }]; } return; }
    if (drag && drag.moved && e.type !== 'pointercancel' && !reduce()) {
      const s0 = samples[0], dt = Math.max(16, now - s0.t);
      if (now - s0.t < 140) {
        const k = rotK();
        view.vy = ((e.clientX - s0.x) / dt) * 1000 * k;
        view.vp = ((e.clientY - s0.y) / dt) * 1000 * k;
      }
    } else if (drag && !drag.moved && e.type === 'pointerup' && now - p.t0 < 350) {
      // tap — double tap recenters on the ISS
      if (lastTap && now - lastTap.t < 330 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        lastTap = null;
        center();
        opts.onDoubleTap && opts.onDoubleTap();
      } else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    drag = null;
    kick();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', (e) => { if (ptrs.has(e.pointerId)) end(e); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dz = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    view.zoom = Math.max(zoomMin, Math.min(zoomMax, view.zoom * Math.exp(dz * 0.0012)));
    view.intro = 0;
    view.lastInput = performance.now();
    kick();
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function nudge(dyaw, dpitch, dzoom) {
    if (dyaw || dpitch) setFollow(false, 'keys');
    view.yaw += dyaw || 0;
    view.pitch = Math.max(-1.35, Math.min(1.35, view.pitch + (dpitch || 0)));
    if (dzoom) view.zoom = Math.max(zoomMin, Math.min(zoomMax, view.zoom * dzoom));
    view.intro = 0;
    view.lastInput = performance.now();
    kick();
  }

  /* ---------- labels (HTML overlays) ---------- */
  const tmp = new THREE.Vector3(), camW = new THREE.Vector3();
  function project(local, el, pad = 0) {
    if (!el) return;
    tmp.copy(local).applyMatrix4(world.matrixWorld);
    camW.copy(camera.position);
    const v = tmp.clone().sub(camW), L = v.length();
    v.divideScalar(L);
    const b = camW.dot(v), c = camW.lengthSq() - 1, disc = b * b - c;
    let hidden = false;
    if (disc > 0) { const t1 = -b - Math.sqrt(disc); if (t1 > 0 && t1 < L - 1e-3) hidden = true; }
    tmp.project(camera);
    const x = (tmp.x * 0.5 + 0.5) * W, y = (-tmp.y * 0.5 + 0.5) * H;
    const off = x < -pad || x > W + pad || y < -pad || y > H + pad;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    el.classList.toggle('hid', hidden || off);
  }

  /* ---------- loop ---------- */
  let running = false, raf = 0, idleT = 0, lastT = 0, lastRender = 0, dirty = true;
  function kick() { dirty = true; if (running && !raf) { clearTimeout(idleT); idleT = 0; raf = requestAnimationFrame(frame); } }
  function frame(ts) {
    raf = 0;
    if (!running) return;
    const dt = Math.min(0.1, lastT ? (ts - lastT) / 1000 : 0.016);
    lastT = ts;
    const rm = reduce();
    let active = !!drag || !!pinch;

    // inertia
    if (!drag && !pinch && (Math.abs(view.vy) > 1e-3 || Math.abs(view.vp) > 1e-3)) {
      view.yaw += view.vy * dt;
      view.pitch = Math.max(-1.35, Math.min(1.35, view.pitch + view.vp * dt));
      const f = Math.exp(-dt * 3.2);
      view.vy *= f; view.vp *= f;
      if (Math.abs(view.vy) < 0.004 && Math.abs(view.vp) < 0.004) view.vy = view.vp = 0;
      active = true;
    }
    // follow the ISS
    if (view.follow && !drag && !pinch) {
      const t = issTarget();
      if (t) {
        const dy = angDiff(view.yaw, t.yaw), dp = t.pitch - view.pitch;
        const k = rm ? 1 : 1 - Math.exp(-dt * 2.6);
        view.yaw += dy * k; view.pitch += dp * k;
        if (Math.abs(dy) + Math.abs(dp) > 0.002) active = true;
      }
    }
    // gentle idle spin in free mode (never with reduced motion)
    if (!view.follow && !rm && !drag && !pinch && performance.now() - view.lastInput > 40000) { view.spin = true; }
    if (view.spin && !rm) { view.yaw += dt * 0.04; active = true; }
    // intro flight
    let introK = 0;
    if (view.intro > 0) {
      view.intro = Math.max(0, view.intro - dt / 2.4);
      introK = view.intro * view.intro * (3 - 2 * view.intro);
      active = true;
    }
    world.rotation.set(view.pitch, view.yaw - introK * 1.6, 0);
    const dist = fitDist / view.zoom * (1 + introK * 1.6);
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    world.updateMatrixWorld();

    // sun in view space for the glint
    earthU.sunView.value.copy(earthU.sunObj.value).applyQuaternion(world.quaternion).normalize();

    // ISS pulse (soft breathing; calm & static under reduced motion)
    const tt = ts / 1000;
    const zs = Math.min(1.25, Math.max(0.6, dist / 3.4));
    if (!rm) {
      const ph = (tt % 2.2) / 2.2;
      issRing.scale.setScalar((0.1 + ph * 0.32) * zs);
      issRing.material.opacity = 0.75 * (1 - ph);
      youRing.scale.setScalar((0.06 + ((tt * 0.8) % 1) * 0.16) * zs);
      youRing.material.opacity = 0.7 * (1 - ((tt * 0.8) % 1));
    } else {
      issRing.scale.setScalar(0.2 * zs); issRing.material.opacity = 0.45;
      youRing.scale.setScalar(0.12 * zs); youRing.material.opacity = 0.5;
    }
    iss.scale.setScalar(0.11 * zs);
    issHalo.scale.setScalar(0.34 * zs);
    you.scale.setScalar(0.075 * zs);

    // render (full rate while something moves, throttled when idle)
    const interval = active || dirty ? 0 : rm ? 1000 : 1000 / 24;
    if (ts - lastRender >= interval - 2) {
      renderer.render(scene, camera);
      lastRender = ts;
      dirty = false;
      if (opts.labels) {
        if (data.iss) project(data.issPos, opts.labels.iss, 40);
        if (data.obs) project(youGroup.position, opts.labels.you, 40);
      }
      opts.onFrame && opts.onFrame();
    }
    if (active) raf = requestAnimationFrame(frame);
    else idleT = setTimeout(() => { idleT = 0; if (running && !raf) raf = requestAnimationFrame(frame); }, rm ? 1000 : 1000 / 24);
  }
  function start() { if (running) return; running = true; lastT = 0; kick(); }
  function stop() { running = false; cancelAnimationFrame(raf); raf = 0; clearTimeout(idleT); idleT = 0; }

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); }, false);
  canvas.addEventListener('webglcontextrestored', () => { if (earthU.map.value) earthU.map.value.needsUpdate = true; start(); }, false);

  return {
    setISS, setTrack, setFootprint, setSun, setObserver, setLand, applyTheme, resize, start, stop, center, nudge, kick,
    setFollow, get follow() { return view.follow; },
    onFollowChange(cb) { onFollow = cb; },
    renderer,
  };
}
