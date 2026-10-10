/* ==========================================================================
   SZVTECH — homepage runtime
   One rAF loop (GSAP ticker) drives Lenis, WebGL, cursor, marquee & FX.
   ========================================================================== */

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const MOBILE = matchMedia('(max-width: 767px)').matches;
/* Touch devices: no hover + coarse pointer. Drives native scrolling, lighter
   particle budget and the vertical card layout. */
const COARSE = matchMedia('(hover: none) and (pointer: coarse)').matches;
const LOWPOWER = (navigator.deviceMemory || 4) <= 4 || (navigator.hardwareConcurrency || 8) <= 4;
const root = document.documentElement;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;

/* Palettes live in /assets/theme.js (window.SZVTheme), shared by every page. */
const TH = window.SZVTheme || null;
const themeNames = () => (TH ? TH.list() : ['violet']);
function themeCols(name) {
  const p = TH && TH.palette(name);
  return p ? [p.a1, p.a2, p.a3] : ['#8b5cf6', '#22d3ee', '#e879f9'];
}

/* Shared scene state — scroll tweens write here, the WebGL frame reads it. */
const Z0 = MOBILE ? 9.2 : 7.4;
const S = {
  morph: 0, bright: 1, explode: 1, warp: 0, fov: 45,
  camX: 0, camY: 0, camZ: Z0, lookY: 0, rotX: 0,
  mx: 0, my: 0, mouseOn: 0, mouseVel: 0, pulse: 0,
  grab: 0, bx: 0, by: 0, bAge: 9, bAmp: 0, pinch: 1, tiltX: 0, tiltY: 0, spinBoost: 0,
};

let lenis = null;
let GL = null;
let pageVisible = !document.hidden;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */
function mk(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function splitText(el, mode = 'chars') {
  const text = el.textContent.trim().replace(/\s+/g, ' ');
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const out = [];
  const words = text.split(' ');
  words.forEach((word, wi) => {
    const w = mk('span', 'sw');
    w.setAttribute('aria-hidden', 'true');
    if (mode === 'words') {
      const m = mk('span', 'sm'); const i = mk('span', 'si', word); m.append(i); w.append(m); out.push(i);
    } else {
      for (const ch of word) { const m = mk('span', 'sm'); const c = mk('span', 'sc', ch); m.append(c); w.append(m); out.push(c); }
    }
    el.append(w);
    if (wi < words.length - 1) el.append(document.createTextNode(' '));
  });
  return out;
}

function goto(target) {
  const el = typeof target === 'string' ? (target === '#top' ? 0 : $(target)) : target;
  if (lenis) lenis.scrollTo(el, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
  else if (el === 0) scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' });
  else el && el.scrollIntoView({ behavior: RM ? 'auto' : 'smooth' });
}

/* The training terminal lives at /learn/ (its own page). */
const LEARN_URL = '/learn/';
const LEARN_LINK = `<a class="c2" href="${LEARN_URL}">learn</a>`;

/* Toast */
let toastTl = null;
function toast(msg) {
  const t = $('.toast');
  t.textContent = msg;
  if (!gsap) return;
  if (toastTl) toastTl.kill();
  toastTl = gsap.timeline()
    .fromTo(t, { yPercent: 140, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .6, ease: 'expo.out' })
    .to(t, { yPercent: 140, opacity: 0, duration: .5, ease: 'power3.in' }, '+=2.4');
}

/* Theme — CSS variables are painted by theme.js; the particles follow here.
   Fires for picks on this page AND for picks made in other tabs. */
function setTheme(name) { return TH ? TH.set(name) : false; }
if (TH) TH.on((name, p) => { PAL.at = 0; if (GL) GL.setTheme([p.a1, p.a2, p.a3]); });

/* -------------------------------------------------------------------------- */
/* WebGL particle field                                                        */
/* -------------------------------------------------------------------------- */
const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const VERT = /* glsl */`
uniform float uTime, uMorph, uSize, uPR, uExplode, uWarp, uMouseForce, uNoise, uBright, uAspect, uPulse, uGrab;
uniform vec2 uMouse;
uniform vec4 uBurst; // xy: ndc origin, z: age (s), w: amplitude (springs through 0)
uniform vec3 uC1, uC2, uC3;
attribute vec3 aKnot;
attribute vec3 aWave;
attribute vec3 aGalaxy;
attribute vec4 aRnd;
varying vec3 vColor;
varying float vAlpha;
${NOISE}
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
void main(){
  float fr = fract(uMorph);
  float tr = sin(3.14159265*fr);
  float m = clamp(uMorph + (aRnd.y-0.5)*0.55*tr, 0.0, 3.0);
  float w0 = clamp(1.0-abs(m-0.0),0.0,1.0);
  float w1 = clamp(1.0-abs(m-1.0),0.0,1.0);
  float w2 = clamp(1.0-abs(m-2.0),0.0,1.0);
  float w3 = clamp(1.0-abs(m-3.0),0.0,1.0);

  vec3 wave = aWave;
  wave.y = sin(wave.x*0.9 + uTime*1.1)*0.42 + cos(wave.z*1.15 + uTime*0.85)*0.42 + sin((wave.x+wave.z)*0.55 - uTime*0.6)*0.3;

  vec3 gal = aGalaxy;
  float gr = length(gal.xz);
  gal.xz = rot(uTime*0.35/(0.6+gr*0.8)) * gal.xz;

  vec3 knot = aKnot;
  knot.xy = rot(uTime*0.12) * knot.xy;

  vec3 p = position*w0 + knot*w1 + wave*w2 + gal*w3;

  // breathing / organic drift
  float nt = uTime*0.18;
  vec3 nz = vec3(snoise(p*0.55+nt), snoise(p*0.55+vec3(31.7)+nt), snoise(p*0.55+vec3(73.1)+nt));
  float amp = uNoise*(w0*1.0 + w1*0.5 + w2*0.15 + w3*0.35) + tr*0.7;
  p += nz*amp;
  p *= 1.0 + w0*0.035*sin(uTime*1.25 + aRnd.x*0.6);

  // explosion
  vec3 dirOut = normalize(p + vec3(0.0001, 0.0002, 0.0003));
  float ex = uExplode + uPulse*0.35;
  p += dirOut*ex*(1.5 + aRnd.z*7.0) + nz*ex*1.5;

  vec4 world = modelMatrix*vec4(p,1.0);

  // hyperspace tunnel (in front of the camera)
  if (uWarp > 0.001) {
    float th = aRnd.x*6.2831853;
    float rad = 0.9 + aRnd.y*aRnd.y*7.0;
    float zz = mod(aRnd.z*70.0 - uTime*48.0, 70.0) + 0.5;
    vec3 tunnel = cameraPosition + vec3(cos(th)*rad, sin(th)*rad, -zz);
    world.xyz = mix(world.xyz, tunnel, smoothstep(0.0,1.0,uWarp));
  }

  vec4 mv = viewMatrix*world;

  // cursor / finger: screen-space repel + swirl (uGrab turns repel into attract)
  vec4 clip = projectionMatrix*mv;
  vec2 ndc = clip.xy/clip.w;
  vec2 dd = (ndc - uMouse)*vec2(uAspect,1.0);
  float dist = length(dd);
  float f = smoothstep(0.32 + uGrab*0.16, 0.0, dist)*uMouseForce;
  vec2 dir = dd/(dist+0.0001);
  vec2 perp = vec2(-dir.y, dir.x);
  mv.xy += (dir*0.8 + perp*0.9)*(1.0-uGrab)*f*(-mv.z)*0.13;
  // grab: a vortex around the finger. Rotate + contract each particle's offset
  // from the finger (proportional, so nothing is flung past it or out of a hole)
  if (uGrab > 0.001) {
    float gf = uGrab*f;
    vec2 nd = rot(gf*1.5)*dd*(1.0 - min(0.82, gf*0.6));
    mv.xy += (nd - dd)*(-mv.z)*0.414;
  }

  // tap shockwave: blast outward from the tap, spring back; a glowing ring travels out
  float ring = 0.0;
  if (uBurst.z < 3.0) {
    vec2 bd = (ndc - uBurst.xy)*vec2(uAspect,1.0);
    float bl = length(bd);
    vec2 bdir = bd/(bl+0.0001);
    mv.xy += bdir*uBurst.w*exp(-bl*2.3)*(0.55 + aRnd.z*0.9)*(-mv.z)*0.24;
    ring = exp(-pow((bl - uBurst.z*1.6)*7.0, 2.0))*exp(-uBurst.z*2.0);
  }

  gl_Position = projectionMatrix*mv;
  float size = uSize*(0.35 + aRnd.w*1.15)*(1.0 + f*1.6 + ring*1.4)*(1.0 + uWarp*1.4);
  gl_PointSize = size*uPR/max(0.5, -mv.z);

  // color
  float h = smoothstep(-2.6, 2.6, p.y*0.9 + p.x*0.6);
  vec3 col = mix(uC1, uC2, h);
  col = mix(col, uC3, smoothstep(0.86, 1.0, aRnd.w)*0.9);
  float core = smoothstep(1.4, 0.0, length(aGalaxy.xz))*w3;
  col = mix(col, vec3(1.0,0.94,0.98), core*0.75);
  col += f*0.7*uC2 + uWarp*vec3(0.35) + ring*(uC2*0.8 + vec3(0.25));
  vColor = col;
  vAlpha = (0.55 + 0.45*sin(uTime*2.2 + aRnd.x*50.0))*uBright*(0.7+0.3*aRnd.w) + ring*0.6;
}`;

const FRAG = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = pow(1.0 - d*2.0, 1.7);
  a += smoothstep(0.12, 0.0, d)*0.6;
  a *= vAlpha;
  gl_FragColor = vec4(vColor*a, a);
}`;

function buildShapes(N) {
  const sphere = new Float32Array(N * 3), knot = new Float32Array(N * 3), wave = new Float32Array(N * 3), gal = new Float32Array(N * 3), rnd = new Float32Array(N * 4);
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const gw = Math.ceil(Math.sqrt(N));
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const i3 = i * 3;
    // sphere (fibonacci shell + a soft inner core)
    const y = 1 - (i + .5) / N * 2, rr = Math.sqrt(1 - y * y), th = golden * i;
    let R = 2.05 * (0.96 + Math.random() * .08);
    if (Math.random() < .14) R *= Math.pow(Math.random(), .6);
    sphere[i3] = Math.cos(th) * rr * R; sphere[i3 + 1] = y * R; sphere[i3 + 2] = Math.sin(th) * rr * R;
    // torus knot (p=2, q=3) with gaussian tube
    const u = Math.random() * Math.PI * 2, p = 2, q = 3, kr = .62;
    const cx = (2 + Math.cos(q * u)) * Math.cos(p * u), cy = (2 + Math.cos(q * u)) * Math.sin(p * u), cz = Math.sin(q * u);
    const tube = .2;
    knot[i3] = cx * kr + gauss() * tube * .6; knot[i3 + 1] = cy * kr + gauss() * tube * .6; knot[i3 + 2] = cz * kr + gauss() * tube * .6;
    // wave field grid
    const gx = i % gw, gz = Math.floor(i / gw);
    wave[i3] = (gx / gw - .5) * 11 + (Math.random() - .5) * .03; wave[i3 + 1] = 0; wave[i3 + 2] = (gz / gw - .5) * 11;
    // galaxy spiral, 3 arms
    const arms = 3, gr = Math.pow(Math.random(), 1.5) * 5.6 + .04;
    const ang = (i % arms) / arms * Math.PI * 2 + gr * 1.05;
    const sc = .05 + gr * .075;
    gal[i3] = Math.cos(ang) * gr + gauss() * sc; gal[i3 + 1] = gauss() * (.06 + .12 / (1 + gr)); gal[i3 + 2] = Math.sin(ang) * gr + gauss() * sc;
    rnd[i * 4] = Math.random(); rnd[i * 4 + 1] = Math.random(); rnd[i * 4 + 2] = Math.random(); rnd[i * 4 + 3] = Math.random();
  }
  return { sphere, knot, wave, gal, rnd };
}

function noGL(reason) {
  root.classList.add('no-webgl');
  if (reason) console.info('[szvtech] WebGL unavailable, using CSS fallback:', reason);
  return null;
}

async function initGL() {
  const canvas = $('#gl');
  // quick capability probe
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return noGL('no context');
  } catch (e) { return noGL(e.message); }

  let THREE;
  try { THREE = await import('three'); } catch (e) { return noGL('three.js failed to load'); }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance', premultipliedAlpha: true });
  } catch (e) { return noGL(e.message); }

  // Cap the pixel ratio hard on phones — the retina backing store is the single
  // biggest cost on mobile GPUs. 1.5 on dense screens, 1.0 on low-power devices.
  const DPR_CAP = COARSE ? (LOWPOWER ? 1.25 : 1.5) : 2;
  const DPR = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, .1, 200);
  camera.position.set(0, 0, Z0);

  // Fewer particles on touch devices (and fewer still on weak ones) keeps the
  // scrub-heavy morph/pin sections at frame rate.
  const N = COARSE ? (LOWPOWER ? 4800 : 7000) : (MOBILE ? 9000 : 20000);
  const sh = buildShapes(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(sh.sphere, 3));
  geo.setAttribute('aKnot', new THREE.BufferAttribute(sh.knot, 3));
  geo.setAttribute('aWave', new THREE.BufferAttribute(sh.wave, 3));
  geo.setAttribute('aGalaxy', new THREE.BufferAttribute(sh.gal, 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(sh.rnd, 4));

  const cols = themeCols(currentThemeName()).map((c) => new THREE.Color(c));
  const uniforms = {
    uTime: { value: 0 }, uMorph: { value: 0 }, uSize: { value: MOBILE ? 44 : 34 }, uPR: { value: DPR * (innerHeight / 900) },
    uExplode: { value: 1 }, uWarp: { value: 0 }, uMouseForce: { value: 0 }, uNoise: { value: RM ? .14 : .22 }, uGrab: { value: 0 },
    uBurst: { value: new THREE.Vector4(0, 0, 9, 0) },
    uBright: { value: 1 }, uAspect: { value: innerWidth / innerHeight }, uPulse: { value: 0 },
    uMouse: { value: new THREE.Vector2(5, 5) },
    uC1: { value: cols[0] }, uC2: { value: cols[1] }, uC3: { value: cols[2] },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.add(points);
  scene.add(group);

  // compile once up-front so the first visible frame doesn't hitch
  try { renderer.compile(scene, camera); } catch (e) { /* ignore */ }

  let lastFov = 45, spin = 0, force = 0;
  const smx = { x: 5, y: 5 };

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    uniforms.uAspect.value = w / h;
    uniforms.uPR.value = DPR * Math.max(.6, h / 900);
  }

  function frame(time, dt) {
    const k = 1 - Math.pow(.0025, dt); // frame-rate independent smoothing
    uniforms.uTime.value = time;
    uniforms.uMorph.value = S.morph;
    uniforms.uExplode.value = S.explode;
    uniforms.uWarp.value = S.warp;
    uniforms.uBright.value = S.bright;
    uniforms.uPulse.value = S.pulse;
    uniforms.uGrab.value = S.grab;
    S.bAge = Math.min(9, S.bAge + dt);
    uniforms.uBurst.value.set(S.bx, S.by, S.bAge, S.bAmp);

    smx.x += (S.mx - smx.x) * Math.min(1, k * 1.6);
    smx.y += (S.my - smx.y) * Math.min(1, k * 1.6);
    if (Math.abs(smx.x) > 4) { smx.x = S.mx; smx.y = S.my; }
    uniforms.uMouse.value.set(smx.x, smx.y);
    S.mouseVel *= Math.pow(.25, dt);
    const fTarget = S.mouseOn * (RM ? .5 : 1) * (.28 + Math.min(1, S.mouseVel) * .85 + S.grab * .55);
    force += (fTarget - force) * Math.min(1, k * (fTarget > force ? 1.2 : .35));
    uniforms.uMouseForce.value = force;

    spin += dt * ((RM ? .03 : .07) * (1 + S.warp * 6) + S.spinBoost);
    group.rotation.y = spin;
    const px = FINE ? S.mx : S.tiltX, py = FINE ? S.my : S.tiltY;
    group.rotation.x += (S.rotX + py * .12 - group.rotation.x) * k;
    group.rotation.z += (-px * .06 - group.rotation.z) * k;
    const sc = group.scale.x + (S.pinch - group.scale.x) * Math.min(1, k * 1.4);
    group.scale.setScalar(sc);

    camera.position.set(S.camX + px * .25, S.camY + py * .18, S.camZ);
    camera.lookAt(0, S.lookY, 0);
    if (Math.abs(S.fov - lastFov) > .01) { camera.fov = S.fov; camera.updateProjectionMatrix(); lastFov = S.fov; }
    renderer.render(scene, camera);
  }

  const themeTw = {};
  function setThemeGL(c) {
    ['uC1', 'uC2', 'uC3'].forEach((u, i) => {
      const target = new THREE.Color(c[i]);
      const from = uniforms[u].value.clone();
      if (themeTw[u]) themeTw[u].kill();
      if (RM || !gsap) { uniforms[u].value.copy(target); return; }
      const o = { t: 0 };
      themeTw[u] = gsap.to(o, { t: 1, duration: 1, ease: 'power2.out', onUpdate: () => uniforms[u].value.copy(from).lerp(target, o.t) });
    });
  }

  return { frame, resize, setTheme: setThemeGL, renderer };
}

function currentThemeName() { return TH ? TH.get() : 'violet'; }

/* -------------------------------------------------------------------------- */
/* Pointer + custom cursor                                                     */
/* -------------------------------------------------------------------------- */
function initPointer() {
  let idle, lastPX = null, lastPY = null;
  const cx = $('#cx'), cy = $('#cy');
  const fmt = (v) => (v >= 0 ? '+' : '') + v.toFixed(3);
  addEventListener('pointermove', (e) => {
    S.mx = (e.clientX / innerWidth) * 2 - 1;
    S.my = -(e.clientY / innerHeight) * 2 + 1;
    if (lastPX != null) S.mouseVel = Math.min(1.2, S.mouseVel + Math.hypot(e.clientX - lastPX, e.clientY - lastPY) / 260);
    lastPX = e.clientX; lastPY = e.clientY;
    S.mouseOn = 1;
    if (cx) { cx.textContent = fmt(S.mx); cy.textContent = fmt(S.my); }
    if (e.pointerType !== 'mouse') { clearTimeout(idle); idle = setTimeout(() => { S.mouseOn = 0; }, 900); }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { S.mouseOn = 0; });
  addEventListener('blur', () => { S.mouseOn = 0; });

  if (!FINE || !gsap) return;
  root.classList.add('has-cursor');
  const cur = $('.cursor'), dot = $('.cursor__dot'), ring = $('.cursor__ring'), label = $('.cursor__label');
  gsap.set([dot, ring], { x: innerWidth / 2, y: innerHeight / 2 });
  const dX = gsap.quickTo(dot, 'x', { duration: .1, ease: 'power3' }), dY = gsap.quickTo(dot, 'y', { duration: .1, ease: 'power3' });
  const rX = gsap.quickTo(ring, 'x', { duration: .5, ease: 'power3' }), rY = gsap.quickTo(ring, 'y', { duration: .5, ease: 'power3' });
  addEventListener('pointermove', (e) => { dX(e.clientX); dY(e.clientY); rX(e.clientX); rY(e.clientY); cur.classList.remove('is-hidden'); }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('a, button, [data-tilt], .hero__word, .term__line, [data-hover]');
    cur.classList.toggle('is-hover', !!t);
    const lab = t && t.dataset.cursor;
    cur.classList.toggle('has-label', !!lab);
    if (lab) label.textContent = lab;
  });
  addEventListener('pointerdown', () => cur.classList.add('is-down'));
  addEventListener('pointerup', () => cur.classList.remove('is-down'));
  document.documentElement.addEventListener('mouseleave', () => cur.classList.add('is-hidden'));
}

/* Magnetic buttons */
function initMagnetic() {
  if (!FINE || !gsap) return;
  $$('[data-magnetic]').forEach((el) => {
    const inner = el.querySelector('.btn__in') || el.firstElementChild;
    const xTo = gsap.quickTo(el, 'x', { duration: .7, ease: 'power3' }), yTo = gsap.quickTo(el, 'y', { duration: .7, ease: 'power3' });
    const ixTo = gsap.quickTo(inner, 'x', { duration: .7, ease: 'power3' }), iyTo = gsap.quickTo(inner, 'y', { duration: .7, ease: 'power3' });
    let rect = null;
    el.addEventListener('pointerenter', () => { gsap.set(el, { x: 0, y: 0 }); rect = el.getBoundingClientRect(); });
    el.addEventListener('pointermove', (e) => {
      if (!rect) rect = el.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2), dy = e.clientY - (rect.top + rect.height / 2);
      xTo(dx * .35); yTo(dy * .45); ixTo(dx * .15); iyTo(dy * .2);
    });
    el.addEventListener('pointerleave', () => { rect = null; xTo(0); yTo(0); ixTo(0); iyTo(0); });
  });
}

/* Text scramble on hover */
const GLYPHS = '!<>-_\\/[]{}=+*^?#%&ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
function scramble(el, dur = .55) {
  if (!gsap) return;
  const final = el.dataset.text || (el.dataset.text = el.textContent);
  if (el._sc) el._sc.kill();
  const o = { p: 0 };
  el._sc = gsap.to(o, {
    p: 1, duration: dur, ease: 'none',
    onUpdate() {
      let s = '';
      for (let i = 0; i < final.length; i++) {
        const ch = final[i];
        s += (ch === ' ' || i < final.length * o.p) ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = s;
    },
    onComplete() { el.textContent = final; },
  });
}
function initScramble() {
  $$('[data-scramble]').forEach((el) => {
    el.dataset.text = el.textContent;
    const host = el.closest('a, button') || el;
    host.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') scramble(el); });
  });
}

/* -------------------------------------------------------------------------- */
/* Scroll choreography                                                         */
/* -------------------------------------------------------------------------- */
function initLenis() {
  // On touch, Lenis fights the browser's own momentum + address-bar hide/show,
  // which feels laggy and rubber-bandy. Use native scrolling there instead;
  // ScrollTrigger falls back to the real scroll position automatically.
  if (RM || COARSE || !window.Lenis) return;
  lenis = new window.Lenis({ lerp: .09, smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.4 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}

let heroChars = [], tagChars = [];
function prepSplits() {
  heroChars = splitText($('.hero__word-txt'), 'chars');
  tagChars = splitText($('.hero__tag'), 'chars');
}

function initScroll() {
  ScrollTrigger.config({ ignoreMobileResize: true });

  // progress bar
  const bar = $('.progress span');
  const nav = $('.nav');
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (s) => {
    bar.style.transform = `scaleX(${s.progress})`;
    nav.classList.toggle('is-scrolled', s.scroll() > 40);
    // past the hero: mobile CSS gives the header a blurred backdrop (no-op on desktop)
    nav.classList.toggle('is-solid', s.scroll() > innerHeight * .7);
  } });

  // hero exit parallax
  // (reduced motion: a soft fade with a small lift instead of the big parallax)
  const heroOut = gsap.timeline({ scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
  if (RM) heroOut.to('.hero__center', { yPercent: -10, opacity: 0, ease: 'none' }, 0);
  else heroOut.to('.hero__center', { yPercent: -40, scale: .92, opacity: 0, ease: 'none' }, 0).to('.hero__word .sw', { letterSpacing: '.06em', ease: 'none' }, 0);
  heroOut.to('.hero__meta, .hero__bottom', { opacity: 0, ease: 'none', duration: .5 }, 0);

  // ---------- morph stage (sticky) ----------
  const stages = $$('.stage');
  const stageWords = stages.map((s) => splitText(s.querySelector('.stage__title'), 'words'));
  const labels = stages.map((s) => s.querySelector('.stage__label'));
  const rail = $$('.morph__rail span');
  gsap.set(stages, { visibility: 'visible' });
  stageWords.forEach((w) => gsap.set(w, { yPercent: 115 }));
  gsap.set(labels, { opacity: 0, x: -20 });

  const cams = [
    { camX: 0, camY: 0, camZ: Z0, lookY: 0, rotX: 0 },
    { camX: MOBILE ? 0 : -1.1, camY: .4, camZ: Z0 * .9, lookY: 0, rotX: .5 },
    { camX: 0, camY: 3.6, camZ: Z0 * .78, lookY: -.4, rotX: 0 },
    { camX: 0, camY: 4.6, camZ: Z0 * .72, lookY: 0, rotX: .28 },
  ];
  // Touch: the section is ~25% shorter (CSS), the scrub catches up faster and
  // each morph starts almost as soon as you scroll into its stage, with an
  // ease that moves visibly from the first pixel. Desktop pacing unchanged.
  const stepDots = $$('.morph__dots i'), stepN = $('.morph__count b'), stepCue = $('.morph__cue');
  const CUES = ['keep scrolling', 'keep going', 'one more', 'that\u2019s all four'];
  let stepIdx = -1;
  const mtl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '#morph', start: 'top top', end: 'bottom bottom', scrub: COARSE ? .45 : 1,
      onUpdate: (s) => {
        const idx = Math.max(0, Math.min(3, Math.round(s.progress * 3.6 - .2)));
        if (idx === stepIdx) return;
        stepIdx = idx;
        rail.forEach((r, i) => r.classList.toggle('is-on', i === idx));
        stepDots.forEach((d, i) => { d.classList.toggle('is-on', i === idx); d.classList.toggle('is-past', i < idx); });
        if (stepN) stepN.textContent = idx + 1;
        if (stepCue) stepCue.firstChild.textContent = CUES[idx] + ' ';
        if (stepCue) stepCue.lastElementChild.style.display = idx === 3 ? 'none' : '';
      },
    },
  });
  const hold0 = COARSE ? .12 : .3;
  mtl.fromTo(S, { morph: 0, ...cams[0] }, { morph: 0, ...cams[0], duration: hold0 }, 0);
  for (let i = 0; i < 3; i++) {
    mtl.to(S, { morph: i + 1, ...cams[i + 1], duration: COARSE ? .86 : .7, ease: COARSE ? 'sine.inOut' : 'power2.inOut' }, i + hold0);
  }
  // Touch: the cloud keeps turning while you hold still, and spins up with
  // your scroll speed inside the morph, so it never reads as frozen.
  if (COARSE) {
    let inMorph = false;
    const mst = mtl.scrollTrigger;
    ScrollTrigger.create({ trigger: '#morph', start: 'top bottom', end: 'bottom top', onToggle: (s) => { inMorph = s.isActive; } });
    gsap.ticker.add((t, dms) => {
      const v = inMorph ? Math.abs(mst.getVelocity()) : 0;
      const target = (inMorph ? (RM ? .03 : .1) : 0) + Math.min(RM ? .1 : .55, v / (RM ? 9000 : 2600));
      S.spinBoost += (target - S.spinBoost) * Math.min(1, dms / 1000 * 3);
    });
  }
  mtl.to(S, { morph: 3, duration: .6 }, 3);
  mtl.fromTo('.morph__rail-bar i', { scaleY: 0 }, { scaleY: 1, duration: 3.6 }, 0);
  mtl.fromTo('.morph__num-in', { yPercent: 0 }, { yPercent: 0, duration: .3 }, 0);
  for (let i = 1; i < 4; i++) mtl.to('.morph__num-in', { yPercent: -25 * i, duration: .5, ease: 'power3.inOut' }, i - .25 + .1);
  // stage 0 enters on arrival (not scrubbed) so it's fully readable at once
  gsap.set(labels[0], { opacity: 0, x: 0 });
  ScrollTrigger.create({
    trigger: '#morph', start: 'top 55%',
    onEnter: () => { gsap.to(stageWords[0], { yPercent: 0, duration: 1.1, stagger: .05, ease: 'expo.out', overwrite: true }); gsap.to(labels[0], { opacity: 1, duration: .8, overwrite: true }); },
    onLeaveBack: () => { gsap.to(stageWords[0], { yPercent: 115, duration: .5, stagger: .02, ease: 'power3.in', overwrite: true }); gsap.to(labels[0], { opacity: 0, duration: .4, overwrite: true }); },
  });
  mtl.fromTo(stages[0], { opacity: 1, y: 0 }, { opacity: 0, y: -60, duration: .25, ease: 'power2.in', immediateRender: false }, .55);
  stages.forEach((s, i) => {
    if (i === 0) return;
    const tin = i - .12;
    mtl.to(stageWords[i], { yPercent: 0, duration: .3, stagger: .025, ease: 'power3.out' }, tin);
    mtl.to(labels[i], { opacity: 1, x: 0, duration: .25, ease: 'power3.out' }, tin);
    if (i < 3) {
      mtl.to(stageWords[i], { yPercent: -115, duration: .22, stagger: .015, ease: 'power3.in' }, i + .55);
      mtl.to(labels[i], { opacity: 0, x: 20, duration: .2, ease: 'power3.in' }, i + .55);
    }
  });

  // dim particles behind the content-heavy sections
  gsap.fromTo(S, { bright: 1, camZ: cams[3].camZ, camY: cams[3].camY }, {
    bright: .42, camZ: Z0 * 1.25, camY: 3.2, ease: 'none', immediateRender: false,
    scrollTrigger: { trigger: '#type', start: 'top bottom', end: 'top top', scrub: true },
  });

  // ---------- kinetic type ----------
  if (!RM) {
    // Gentler horizontal drift on narrow screens so full words stay readable.
    const kx = MOBILE ? .28 : 1;
    gsap.fromTo('.k1 > span', { xPercent: -45 * kx }, { xPercent: 12 * kx, ease: 'none', scrollTrigger: { trigger: '.k1', start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.fromTo('.k2 > span', { xPercent: 40 * kx }, { xPercent: -10 * kx, ease: 'none', scrollTrigger: { trigger: '.k2', start: 'top bottom', end: 'bottom top', scrub: true } });
    const k3 = splitText($('.k3__txt'), 'chars');
    const mid = (k3.length - 1) / 2;
    gsap.fromTo(k3, {
      x: (i) => (i - mid) * (MOBILE ? 40 : 110), y: (i) => (i % 2 ? 1 : -1) * (40 + (i * 37) % 90), rotate: (i) => (i - mid) * 9, opacity: 0, filter: 'blur(8px)',
    }, {
      x: 0, y: 0, rotate: 0, opacity: 1, filter: 'blur(0px)', ease: 'power2.out',
      scrollTrigger: { trigger: '.k3', start: 'top bottom', end: 'center 55%', scrub: 1 },
    });
    gsap.fromTo('.k4 > span', { scale: .45, opacity: .2 }, { scale: 1.12, opacity: 1, ease: 'none', scrollTrigger: { trigger: '.k4', start: 'top bottom', end: 'bottom 30%', scrub: true } });
    gsap.fromTo('.kinetic__label', { y: 40, opacity: 0 }, { y: 0, opacity: 1, scrollTrigger: { trigger: '.kinetic', start: 'top 80%', end: 'top 40%', scrub: true } });
  } else {
    // calm version: no sideways drift, each line just settles in
    $$('.kline').forEach((l) => gsap.from(l, { y: 24, opacity: 0, duration: 1.4, ease: 'power2.out', scrollTrigger: { trigger: l, start: 'top 92%', once: true } }));
  }

  // ---------- pinned horizontal ----------
  // On touch devices the horizontal pin fights the finger; the CSS lays the
  // cards out as a vertical glass stack instead, and we give each a soft reveal.
  if (!COARSE) {
    const track = $('.horiz__track');
    const dist = () => Math.max(0, track.scrollWidth - innerWidth);
    const hBar = $('.horiz__progress span');
    const hTween = gsap.to(track, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: {
        trigger: '.horiz', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1,
        onUpdate: (s) => { hBar.style.transform = `scaleX(${s.progress})`; },
      },
    });
    if (!RM) {
      $$('.card').forEach((card) => {
        gsap.fromTo(card.querySelector('.card__art'), { xPercent: 10 }, {
          xPercent: -10, ease: 'none',
          scrollTrigger: { trigger: card, containerAnimation: hTween, start: 'left right', end: 'right left', scrub: true },
        });
        gsap.fromTo(card, { rotateY: MOBILE ? 0 : -16, opacity: .25 }, {
          rotateY: 0, opacity: 1, ease: 'power2.out', transformPerspective: 1200, transformOrigin: '0% 50%',
          scrollTrigger: { trigger: card, containerAnimation: hTween, start: 'left 105%', end: 'left 55%', scrub: true },
        });
      });
    }
  } else {
    $$('.card').forEach((card) => {
      gsap.from(card, {
        y: RM ? 12 : 44, opacity: 0, duration: RM ? 1.2 : 1, ease: 'expo.out',
        scrollTrigger: { trigger: card, start: 'top 88%', once: true },
      });
    });
  }

  // ---------- word reveals for section headings ----------
  $$('.split-words').forEach((h) => {
    const w = splitText(h, 'words');
    gsap.from(w, { yPercent: 115, duration: 1.1, ease: 'expo.out', stagger: .05, scrollTrigger: { trigger: h, start: 'top 85%', once: true } });
  });
  $$('[data-reveal]').forEach((el) => {
    gsap.from(el, { y: 40, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
  });

  // ---------- counters ----------
  $$('[data-count]').forEach((el) => {
    ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => countUp(el) });
  });

  initLearn();

  // ---------- outro ----------
  const outChars = splitText($('.outro__txt'), 'chars');
  gsap.fromTo(outChars, { yPercent: 110, rotateX: -70, opacity: 0 }, {
    yPercent: 0, rotateX: 0, opacity: 1, stagger: .06, ease: 'power3.out',
    scrollTrigger: { trigger: '.outro__big', start: 'top 92%', end: 'center 55%', scrub: 1 },
  });
  // galaxy folds back into the sphere: full circle
  gsap.fromTo(S, { morph: 3, bright: .42, camZ: Z0 * 1.25, camY: 3.2, rotX: cams[3].rotX }, {
    morph: 0, bright: 1, camZ: Z0 * 1.05, camY: 0, rotX: 0, ease: 'none', immediateRender: false,
    scrollTrigger: { trigger: '#outro', start: 'top bottom', end: 'center center', scrub: 1.2 },
  });
}

function countUp(el) {
  const v = el.dataset.count;
  if (v === 'inf') {
    const o = { t: 0 };
    gsap.to(o, {
      t: 1, duration: 1.3, ease: 'power1.in',
      onUpdate: () => { el.textContent = String((Math.random() * 9999) | 0); },
      onComplete: () => { el.textContent = '∞'; gsap.fromTo(el, { scale: 1.35, filter: 'blur(6px)' }, { scale: 1, filter: 'blur(0px)', duration: 1, ease: 'elastic.out(1, .45)' }); },
    });
    return;
  }
  const to = +v, from = +(el.dataset.from || 0);
  const o = { n: from };
  gsap.to(o, { n: to, duration: RM ? 1.4 : 2, ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.n); } });
}

/* Marquee bands: speed + direction follow scroll velocity */
function initBands() {
  const bands = $$('.band').map((el, i) => {
    const track = el.querySelector('.band__track');
    track.innerHTML += track.innerHTML; // duplicate for seamless loop
    return { el, track, x: 0, w: 0, base: i ? 1 : -1 };
  });
  const measure = () => bands.forEach((b) => { b.w = b.track.scrollWidth / 2; });
  measure();
  addEventListener('resize', measure);
  document.fonts && document.fonts.ready.then(measure);
  let inView = false, dir = 1, lastY = scrollY, vel = 0;
  new IntersectionObserver((en) => { inView = en[0].isIntersecting; }, { rootMargin: '100px' }).observe($('.bands'));
  gsap.ticker.add((t, dms) => {
    const dy = scrollY - lastY; lastY = scrollY;
    const v = lenis ? lenis.velocity : dy;
    vel += (v - vel) * .15;
    if (Math.abs(vel) > .3) dir = vel > 0 ? 1 : -1;
    if (!inView) return;
    const f = dms / 16.667;
    // reduced motion: a slow steady drift, not coupled to scroll speed
    const speed = (RM ? .35 : 1.1 + Math.min(Math.abs(vel) * .9, 38)) * f;
    for (const b of bands) {
      b.x += speed * b.base * dir;
      if (b.w) { if (b.x <= -b.w) b.x += b.w; if (b.x > 0) b.x -= b.w; }
      b.track.style.transform = `translate3d(${b.x.toFixed(2)}px,0,0)`;
    }
  });
}

/* Card tilt + spotlight */
function initTilt() {
  $$('[data-tilt]').forEach((card) => {
    const inner = card.querySelector('.card__in');
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      if (FINE) gsap.to(inner, { rotateY: (px - .5) * (RM ? 7 : 16), rotateX: -(py - .5) * (RM ? 7 : 16), transformPerspective: 900, duration: .6, ease: 'power3.out', overwrite: 'auto' });
    });
    card.addEventListener('pointerleave', () => {
      if (FINE) gsap.to(inner, { rotateY: 0, rotateX: 0, duration: 1.2, ease: RM ? 'power2.out' : 'elastic.out(1, .5)', overwrite: 'auto' });
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Gestures: tell a tap / a hold-drag apart from a page scroll                 */
/* -------------------------------------------------------------------------- */
/* Touch: a quick tap fires `tap`. Holding still for `hold` ms arms a drag —
   from then on touchmove is preventDefault-ed (no scroll, no pull-to-refresh)
   and fed to `move`. Moving before the hold elapses is a scroll and is left to
   the browser untouched. With `axisX`, a clearly horizontal first move starts
   the drag immediately (vertical still scrolls). Two fingers -> `pinch`.
   Mouse: press + move drags at once, press + release in place is a tap.
   Card surfaces (`card`) also: forgive more finger jitter (`slop`), never open
   the long-press context / selection UI, and treat an Android `touchcancel`
   that arrives during a hold (long-press detection) as a normal release.
   `free`: an element (the cube's art) where a move in ANY direction starts
   the drag at once — it is touch-action:none, so the browser never scrolls it. */
function bindGesture(el, h, opt = {}) {
  const HOLD = opt.hold === false ? 0 : (opt.hold ?? 200), SLOP = opt.slop ?? 9;
  let inFree = false;
  let st = 0; // 0 idle, 1 pending, 2 dragging, 3 scrolling (browser owns it), 4 pinching
  let sx = 0, sy = 0, lx = 0, ly = 0, t0 = 0, tid = null, timer = 0, d0 = 1, moved = false, byTimer = false;
  const arm = (x, y, timed) => { st = 2; moved = false; byTimer = !!timed; clearTimeout(timer); root.classList.add('is-gesturing'); h.start && h.start(x, y); };
  const finish = (cancelled) => {
    clearTimeout(timer);
    if (st === 2 || st === 4) { root.classList.remove('is-gesturing'); h.end && h.end(cancelled); }
    if (st === 4 && h.pinchEnd) h.pinchEnd();
    st = 0; tid = null;
  };
  const tdist = (tl) => Math.hypot(tl[0].clientX - tl[1].clientX, tl[0].clientY - tl[1].clientY) || 1;
  const find = (tl) => { for (const t of tl) if (t.identifier === tid) return t; return null; };

  el.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2 && h.pinch) {
      if (st === 2) { h.end && h.end(true); }
      clearTimeout(timer); st = 4; d0 = tdist(e.touches); root.classList.add('is-gesturing');
      return;
    }
    if (e.touches.length > 1 || st) return;
    const t = e.changedTouches[0];
    tid = t.identifier; sx = lx = t.clientX; sy = ly = t.clientY; t0 = e.timeStamp; st = 1;
    inFree = !!(opt.free && opt.free.contains(e.target));
    h.down && h.down(sx, sy);
    if (HOLD) timer = setTimeout(() => { if (st === 1) arm(lx, ly, true); }, HOLD);
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (st === 4) {
      if (e.cancelable) e.preventDefault();
      if (e.touches.length >= 2) h.pinch(tdist(e.touches) / d0);
      return;
    }
    if (st !== 1 && st !== 2) return;
    const t = find(e.changedTouches);
    if (!t) return;
    const x = t.clientX, y = t.clientY;
    // A busy main thread can run the hold timer after a move that actually
    // happened earlier: trust the event's own timestamp and give it back to
    // the browser as a scroll.
    if (st === 2 && byTimer && !moved && e.timeStamp - t0 < HOLD - 20 && Math.hypot(x - sx, y - sy) > SLOP) {
      // ...unless this move would have started the drag anyway
      const dx = x - sx, dy = y - sy;
      if (e.cancelable && (inFree || (opt.axisX && Math.abs(dx) > Math.abs(dy) * 1.3))) byTimer = false;
      else { root.classList.remove('is-gesturing'); h.end && h.end(true); st = 3; h.scroll && h.scroll(); return; }
    }
    if (st === 1) {
      const dx = x - sx, dy = y - sy;
      if (Math.hypot(dx, dy) > SLOP) {
        if (((opt.axisX && Math.abs(dx) > Math.abs(dy) * 1.3) || inFree) && e.cancelable) arm(sx, sy);
        else { st = 3; clearTimeout(timer); h.scroll && h.scroll(); return; }
      }
    }
    if (st === 2) {
      if (e.cancelable) e.preventDefault();
      moved = true;
      h.move && h.move(x, y, x - lx, y - ly);
    }
    lx = x; ly = y;
  }, { passive: false });

  el.addEventListener('touchend', (e) => {
    if (st === 4) { if (e.touches.length < 2) finish(false); return; }
    if (!find(e.changedTouches)) return;
    const quick = e.timeStamp - t0 < (HOLD ? 450 : 1500); // tap-only surfaces forgive a slow tap
    // same timestamp check for taps: released before the hold could elapse
    if (st === 2 && byTimer && !moved && e.timeStamp - t0 < HOLD) { root.classList.remove('is-gesturing'); h.end && h.end(true); st = 1; }
    if (st === 1 && quick) { clearTimeout(timer); st = 0; h.tap && h.tap(sx, sy); h.up && h.up(); tid = null; return; }
    finish(false); h.up && h.up();
  });
  el.addEventListener('touchcancel', (e) => {
    // Android can cancel a still finger once its long-press detector fires.
    // On a card that is just "the hold ended": finish it, don't abort it.
    if (opt.card && (st === 1 || st === 2) && e.timeStamp - t0 < 8000) {
      if (st === 1) { clearTimeout(timer); st = 0; tid = null; if (!HOLD || e.timeStamp - t0 < 450) h.tap && h.tap(sx, sy); h.up && h.up(); return; }
      finish(false); h.up && h.up(); return;
    }
    finish(true); h.up && h.up();
  });
  if (opt.card) {
    // a long press must never open the selection / context UI on a card
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('selectstart', (e) => e.preventDefault());
  }

  // mouse (and pen): immediate drag, click = tap
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    sx = lx = e.clientX; sy = ly = e.clientY; st = 1;
    h.down && h.down(sx, sy);
    clearTimeout(timer);
    if (HOLD) timer = setTimeout(() => { if (st === 1) { st = 2; h.start && h.start(lx, ly); } }, HOLD);
    const mv = (ev) => {
      const x = ev.clientX, y = ev.clientY;
      if (st === 1 && Math.hypot(x - sx, y - sy) > 4) { st = 2; h.start && h.start(sx, sy); }
      if (st === 2) h.move && h.move(x, y, x - lx, y - ly);
      lx = x; ly = y;
    };
    const upH = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', upH); removeEventListener('pointercancel', upH);
      clearTimeout(timer);
      if (st === 1) { st = 0; h.tap && h.tap(sx, sy); }
      else if (st === 2) { st = 0; h.end && h.end(false); }
      st = 0; h.up && h.up();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', upH); addEventListener('pointercancel', upH);
  });
}

/* -------------------------------------------------------------------------- */
/* Playing with the particle cloud: tap = shockwave, hold + drag = attract     */
/* -------------------------------------------------------------------------- */
function initTouchPlay() {
  if (!gsap) return;
  const fx = mk('div', 'touchfx'); fx.setAttribute('aria-hidden', 'true');
  const holdEl = mk('div', 'touchfx__hold');
  fx.append(holdEl); document.body.append(fx);
  const hint = $('.hero__hint');
  let hinted = false;
  try { hinted = localStorage.getItem('szv-hero-hint') === '1'; } catch (e) { /* ignore */ }
  if (hinted && hint) hint.remove();
  const played = () => {
    if (hinted) return;
    hinted = true;
    try { localStorage.setItem('szv-hero-hint', '1'); } catch (e) { /* ignore */ }
    if (hint) { hint.classList.add('is-gone'); setTimeout(() => hint.remove(), 900); }
  };
  const toNdc = (x, y) => [(x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1];
  let bursts = 0, offT = 0;

  function burst(x, y) {
    const [nx, ny] = toNdc(x, y);
    S.bx = nx; S.by = ny; S.bAge = 0;
    const amp = RM ? .55 : 1;
    gsap.timeline({ overwrite: true })
      .to(S, { bAmp: amp, duration: .13, ease: 'power2.out' })
      .to(S, { bAmp: 0, duration: RM ? 1.1 : 1.9, ease: RM ? 'power2.out' : 'elastic.out(1, .32)' });
    const p = mk('i', 'touchfx__ping' + (RM ? ' is-calm' : ''));
    p.style.left = x + 'px'; p.style.top = y + 'px';
    p.addEventListener('animationend', () => p.remove(), { once: true });
    fx.append(p);
    bursts++;
    $('.hero').dataset.bursts = bursts;
    played();
  }
  const follow = (x, y) => {
    const [nx, ny] = toNdc(x, y);
    S.mx = nx; S.my = ny;
    holdEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };
  const handlers = {
    tap: burst,
    start(x, y) {
      clearTimeout(offT);
      follow(x, y);
      S.mouseOn = 1; S.mouseVel = .6;
      gsap.to(S, { grab: 1, duration: .45, ease: 'power2.out', overwrite: 'auto' });
      holdEl.classList.add('is-on');
      root.classList.add('is-grabbing');
      played();
    },
    move(x, y, dx, dy) {
      follow(x, y);
      S.mouseOn = 1;
      S.mouseVel = Math.min(1.2, S.mouseVel + Math.hypot(dx, dy) / 260);
    },
    end() {
      gsap.to(S, { grab: 0, duration: .9, ease: 'power2.out', overwrite: 'auto' });
      holdEl.classList.remove('is-on');
      root.classList.remove('is-grabbing');
      if (!FINE) offT = setTimeout(() => { S.mouseOn = 0; }, 400);
    },
    pinch(r) { S.pinch = Math.max(.55, Math.min(1.9, r)); played(); },
    pinchEnd() { gsap.to(S, { pinch: 1, duration: 1.4, ease: RM ? 'power2.out' : 'elastic.out(1, .4)', overwrite: true }); },
  };
  bindGesture($('.hero'), handlers, { hold: 200 });
  bindGesture($('.morph__sticky'), handlers, { hold: 200 });

  // Gentle device-tilt parallax — Android only (iOS needs a permission
  // prompt, which we never show). Off under reduced motion: it's parallax.
  if (COARSE && !RM && window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') {
    let bb = null, bg = 0;
    addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      if (bb === null) { bb = e.beta; bg = e.gamma; }
      // slowly re-centre on however the phone is being held
      bb += (e.beta - bb) * .02; bg += (e.gamma - bg) * .02;
      S.tiltX = Math.max(-1, Math.min(1, (e.gamma - bg) / 25));
      S.tiltY = Math.max(-1, Math.min(1, -(e.beta - bb) / 25));
    }, { passive: true });
  }
}

/* -------------------------------------------------------------------------- */
/* The five glass cards: each one idles on its own and answers a touch         */
/* -------------------------------------------------------------------------- */
const PAL = { a1: '#8b5cf6', a2: '#22d3ee', a3: '#e879f9', at: 0 };
function palette(now) {
  if (now - PAL.at > 1500) {
    const cs = getComputedStyle(root);
    PAL.a1 = cs.getPropertyValue('--a1').trim() || PAL.a1;
    PAL.a2 = cs.getPropertyValue('--a2').trim() || PAL.a2;
    PAL.a3 = cs.getPropertyValue('--a3').trim() || PAL.a3;
    PAL.at = now;
  }
  return PAL;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const touched = (art) => { art.classList.add('was-touched'); art.dataset.hits = (+art.dataset.hits || 0) + 1; };
const localXY = (el, x, y) => { const r = el.getBoundingClientRect(); return [x - r.left, y - r.top]; };
/* On touch the WHOLE card is the touch surface (finger anywhere on the glass
   plays that card's art); on desktop the mouse plays the art box as before.
   Handlers still get client coordinates; cards map them into the art's space.
   Every tap / hold also drops a small glow pulse right under the finger. */
function cardGesture(art, h, opt = {}) {
  const inner = art.closest('.card__in') || art;
  const surf = COARSE ? inner : art;
  const ping = (x, y, hold) => {
    const [px, py] = localXY(inner, x, y);
    const p = mk('i', 'card__ping' + (hold ? ' is-hold' : '') + (RM ? ' is-calm' : ''));
    p.style.left = px.toFixed(1) + 'px'; p.style.top = py.toFixed(1) + 'px';
    p.addEventListener('animationend', () => p.remove(), { once: true });
    setTimeout(() => p.remove(), 1600); // in case animations are off entirely
    inner.append(p);
  };
  bindGesture(surf, {
    ...h,
    tap(x, y) { ping(x, y, false); h.tap && h.tap(x, y); },
    start(x, y) { ping(x, y, true); h.start && h.start(x, y); },
  }, { ...opt, slop: COARSE ? 12 : 9, card: COARSE });
}
function fitCanvas(cv, art, onSize) {
  const ctx = cv.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, COARSE ? 1.5 : 2);
  const sz = { w: 0, h: 0, ctx };
  const fit = () => {
    const w = art.clientWidth, h = art.clientHeight;
    if (!w || !h || (w === sz.w && h === sz.h)) return;
    sz.w = w; sz.h = h;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onSize && onSize(w, h);
  };
  if (window.ResizeObserver) new ResizeObserver(fit).observe(art); else addEventListener('resize', fit);
  fit();
  return sz;
}

/* 01 Motion — orbits that never stop; tap = spin burst, hold = charge */
function orbitCard(art) {
  const rings = $$(':scope > i', art), sun = $(':scope > b', art);
  const base = [40, -60, 90].map((v) => v * (RM ? .35 : 1)); // deg/s
  const ang = [0, 140, 260];
  const st = { boost: 1, trail: RM ? .35 : .3, sun: 1 };
  const idleTrail = st.trail;
  let lastTrail = -1;
  const settle = (d) => gsap.to(st, { boost: 1, trail: idleTrail, duration: d, ease: 'power3.out', overwrite: 'auto' });
  const pop = () => gsap.fromTo(st, { sun: RM ? 1.35 : 1.9 }, { sun: 1, duration: 1.3, ease: RM ? 'power2.out' : 'elastic.out(1, .35)', overwrite: 'auto' });
  cardGesture(art, {
    tap() {
      touched(art);
      gsap.timeline()
        .to(st, { boost: RM ? 7 : 10, trail: 1, duration: .22, ease: 'power2.out', overwrite: 'auto' })
        .add(() => settle(2.6), '+=.35');
      pop();
    },
    start() { touched(art); gsap.to(st, { boost: RM ? 8 : 14, trail: 1, duration: 1, ease: 'power2.in', overwrite: 'auto' }); },
    end() { settle(2.8); pop(); },
  }, { hold: 220 });
  return {
    tick(t, dt) {
      for (let i = 0; i < 3; i++) {
        ang[i] = (ang[i] + base[i] * st.boost * dt) % 360;
        rings[i].style.transform = `rotate(${ang[i].toFixed(2)}deg)`;
      }
      if (Math.abs(st.trail - lastTrail) > .005) { art.style.setProperty('--trail', st.trail.toFixed(3)); lastTrail = st.trail; }
      sun.style.transform = `scale(${(st.sun * (1 + .08 * Math.sin(t * 2.1))).toFixed(3)})`;
    },
  };
}

/* 02 Interaction — a dot field that gets pushed, rippled and drawn on */
function gridCard(art) {
  const cv = mk('canvas');
  art.prepend(cv);
  let dots = new Float32Array(0), hx = new Float32Array(0), n = 0;
  const sz = fitCanvas(cv, art, (w, h) => {
    let sp = 18;
    while ((w / sp) * (h / sp) > 460) sp += 2;
    const cols = Math.max(1, Math.floor(w / sp)), rows = Math.max(1, Math.floor(h / sp));
    const ox = (w - (cols - 1) * sp) / 2, oy = (h - (rows - 1) * sp) / 2;
    n = cols * rows; dots = new Float32Array(n * 4); hx = new Float32Array(n * 2);
    for (let r = 0, k = 0; r < rows; r++) for (let c = 0; c < cols; c++, k++) { hx[k * 2] = ox + c * sp; hx[k * 2 + 1] = oy + r * sp; }
  });
  const ctx = sz.ctx;
  const ripples = [], trail = [];
  const ptr = { x: 0, y: 0, on: false };
  let nextIdle = .6, clock = 0;
  const RS = RM ? 190 : 260, BW = 26, LIFE = 1.8;
  const rings = [];
  const ripple = (x, y, amp) => { ripples.push({ x, y, age: 0, amp }); if (ripples.length > 5) ripples.shift(); };
  // a tap is a slam: an instant outward kick near the finger + a strong ripple
  // that physically shoves every dot as it passes, and a visible ring
  const slam = (x, y) => {
    for (let i = 0; i < n; i++) {
      const dx = hx[i * 2] + dots[i * 4] - x, dy = hx[i * 2 + 1] + dots[i * 4 + 1] - y, d = Math.sqrt(dx * dx + dy * dy) + .01;
      if (d < 130) { const k = (1 - d / 130) * (RM ? 9 : 14); dots[i * 4 + 2] += dx / d * k; dots[i * 4 + 3] += dy / d * k; }
    }
    ripple(x, y, RM ? 2.6 : 3.4);
    rings.push({ x, y, age: 0 }); if (rings.length > 4) rings.shift();
  };
  // finger anywhere on the card -> nearest point inside the dot field
  const lxy = (x, y) => { const [lx, ly] = localXY(art, x, y); return [clamp(lx, 0, sz.w || art.clientWidth), clamp(ly, 0, sz.h || art.clientHeight)]; };
  const point = (x, y) => { const [lx, ly] = lxy(x, y); ptr.x = lx; ptr.y = ly; ptr.on = true; trail.push({ x: lx, y: ly, t: clock }); if (trail.length > 40) trail.shift(); };
  cardGesture(art, {
    down(x, y) { const [lx, ly] = lxy(x, y); ptr.x = lx; ptr.y = ly; ptr.on = true; },
    scroll() { ptr.on = false; },
    tap(x, y) { const [lx, ly] = lxy(x, y); slam(lx, ly); touched(art); },
    start(x, y) { point(x, y); touched(art); },
    move(x, y) { point(x, y); },
    up() { if (!FINE) ptr.on = false; },
  }, { axisX: true });
  art.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') point(e.clientX, e.clientY); });
  art.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') ptr.on = false; });

  const buckets = [[], [], [], [], [], []];
  return {
    tick(t, dt) {
      clock = t;
      const w = sz.w, h = sz.h;
      if (!n || !w) return;
      const f = dt * 60, damp = Math.pow(.86, f), K = .09, R = 88, PUSH = RM ? 2.6 : 3.4;
      nextIdle -= dt;
      if (nextIdle <= 0) { ripple(w * (.2 + Math.random() * .6), h * (.2 + Math.random() * .6), RM ? .5 : .8); nextIdle = RM ? 4.5 : 2.8; }
      for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].age += dt; if (ripples[i].age > LIFE) ripples.splice(i, 1); }
      for (let i = trail.length - 1; i >= 0; i--) if (t - trail[i].t > .55) trail.splice(0, i + 1), i = 0;
      for (const b of buckets) b.length = 0;
      for (let i = 0; i < n; i++) {
        const j = i * 4, x0 = hx[i * 2], y0 = hx[i * 2 + 1];
        let ox = dots[j], oy = dots[j + 1], vx = dots[j + 2], vy = dots[j + 3];
        let ax = -ox * K, ay = -oy * K;
        if (ptr.on) {
          const dx = x0 + ox - ptr.x, dy = y0 + oy - ptr.y, d2 = dx * dx + dy * dy;
          if (d2 < R * R) { const d = Math.sqrt(d2) + .01, s = (1 - d / R) ** 2 * PUSH; ax += dx / d * s; ay += dy / d * s; }
        }
        for (const rp of ripples) {
          const dx = x0 - rp.x, dy = y0 - rp.y, d = Math.sqrt(dx * dx + dy * dy) + .01, band = Math.abs(d - rp.age * RS);
          if (band < BW) { const s = (1 - band / BW) * rp.amp * (1 - rp.age / LIFE); ax += dx / d * s; ay += dy / d * s; }
        }
        vx = (vx + ax * f) * damp; vy = (vy + ay * f) * damp;
        ox += vx * f; oy += vy * f;
        dots[j] = ox; dots[j + 1] = oy; dots[j + 2] = vx; dots[j + 3] = vy;
        const e = Math.min(1, (Math.abs(ox) + Math.abs(oy)) / 8);
        const shimmer = .5 + .5 * Math.sin(t * (RM ? .8 : 1.3) - (x0 * .022 + y0 * .016));
        const b = Math.min(5, ((shimmer * .32 + e) * 5) | 0);
        buckets[b].push(x0 + ox, y0 + oy);
      }
      const P = palette(performance.now());
      ctx.clearRect(0, 0, w, h);
      // fading finger / cursor trail
      if (trail.length > 1) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let i = 1; i < trail.length; i++) {
          const a = 1 - (t - trail[i].t) / .55;
          if (a <= 0) continue;
          ctx.globalAlpha = a * .35; ctx.strokeStyle = P.a2; ctx.lineWidth = 10 * a;
          ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
          ctx.globalAlpha = a * .9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * a;
          ctx.stroke();
        }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const rg = rings[i]; rg.age += dt;
        const a = 1 - rg.age / 1.1;
        if (a <= 0) { rings.splice(i, 1); continue; }
        ctx.globalAlpha = a * .85; ctx.strokeStyle = P.a2; ctx.lineWidth = 2 + 6 * a;
        ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.age * RS, 0, 6.2832); ctx.stroke();
      }
      if (ptr.on) {
        const g = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, 90);
        g.addColorStop(0, P.a2); g.addColorStop(1, 'transparent');
        ctx.globalAlpha = .28; ctx.fillStyle = g; ctx.fillRect(ptr.x - 90, ptr.y - 90, 180, 180);
      }
      for (let b = 0; b < 6; b++) {
        const pts = buckets[b];
        if (!pts.length) continue;
        const r = 1.1 + b * .32;
        ctx.globalAlpha = .22 + b * .15;
        ctx.fillStyle = b >= 3 ? P.a2 : '#fff';
        ctx.beginPath();
        for (let k = 0; k < pts.length; k += 2) { ctx.moveTo(pts[k] + r, pts[k + 1]); ctx.arc(pts[k], pts[k + 1], r, 0, 6.2832); }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };
}

/* 03 3D — always turning; drag to spin with inertia, tap to blow it apart */
function cubeCard(art) {
  const cube = $('.cube', art);
  const BASE = RM ? 12 : 36; // deg/s
  let rx = -24, ry = 20, vx = 0, vy = BASE, dragging = false, lt = 0, dragged = 0;
  const SENS = COARSE ? .8 : .6; // deg per px — a finger should feel it turn
  const explode = () => {
    touched(art);
    vy += RM ? 120 : 420;
    cube.classList.add('is-hot');
    gsap.timeline({ onComplete: () => cube.classList.remove('is-hot') })
      .to(cube, { '--ex': RM ? .6 : 1, duration: .42, ease: 'back.out(2)', overwrite: 'auto' })
      .to(cube, { '--ex': 0, duration: 1.4, ease: RM ? 'power2.out' : 'elastic.out(1, .4)' }, '+=.45');
  };
  /* Touch: a drag that starts ON the cube's art turns it at once, in both
     axes (that box is touch-action:none). From the card's text, a sideways
     swipe or a hold-then-drag turns it; a vertical swipe there scrolls. */
  cardGesture(art, {
    start() { dragging = true; dragged = 0; vx = vy = 0; lt = performance.now(); art.classList.add('is-dragging'); touched(art); },
    move(x, y, dx, dy) {
      const now = performance.now(), d = Math.max(8, now - lt) / 1000; lt = now;
      dragged += Math.abs(dx) + Math.abs(dy);
      ry += dx * SENS; rx = clamp(rx - dy * SENS, -85, 85);
      vy = clamp(dx * SENS / d, -900, 900); vx = clamp(-dy * SENS / d, -600, 600);
    },
    end(cancelled) {
      dragging = false; art.classList.remove('is-dragging');
      if (!cancelled && dragged < 6) { vx = 0; vy = BASE; explode(); return; } // a hold without a drag = explode too
      if (performance.now() - lt > 90) { vx = 0; vy = BASE; }
    },
    tap: explode,
  }, { axisX: true, free: COARSE ? art : null });
  return {
    tick(t, dt) {
      if (!dragging) {
        const kk = 1 - Math.exp(-dt * 1.1);
        vy += (BASE - vy) * kk; vx *= Math.exp(-dt * 2.5);
        ry += vy * dt; rx += vx * dt;
        rx += (-24 + Math.sin(t * .5) * (RM ? 3 : 8) - rx) * (1 - Math.exp(-dt * .9));
      }
      cube.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${(ry % 360).toFixed(2)}deg)`;
    },
  };
}

/* 04 Sound of silence — the bars breathe; a tap drops a beat through them */
function barsCard(art) {
  const bars = $$(':scope > i', art), N = bars.length;
  const beats = [];
  let centers = [], hover = -1, hoverAmp = 0, finger = -1, nextBlip = 2.5;
  const measure = () => { centers = bars.map((b) => { const r = b.getBoundingClientRect(); return r.left + r.width / 2; }); };
  const idxAt = (x) => { measure(); let bi = 0, bd = 1e9; centers.forEach((c, i) => { const d = Math.abs(c - x); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const beat = (o, amp) => { beats.push({ o, age: 0, amp }); if (beats.length > 8) beats.shift(); };
  cardGesture(art, {
    tap(x) { beat(idxAt(x), 1); touched(art); },
    start(x) { finger = idxAt(x); beat(finger, .8); touched(art); },
    move(x) { const i = idxAt(x); if (i !== finger) { finger = i; beat(i, .7); } },
    end() { finger = -1; },
  }, { axisX: true });
  art.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') hover = idxAt(e.clientX); });
  art.addEventListener('pointerleave', () => { hover = -1; });
  const SPD = RM ? 12 : 22;
  return {
    tick(t, dt) {
      nextBlip -= dt;
      if (nextBlip <= 0) { beat((Math.random() * N) | 0, RM ? .25 : .4); nextBlip = (RM ? 6 : 3.5) + Math.random() * 3; }
      for (let i = beats.length - 1; i >= 0; i--) { beats[i].age += dt; if (beats[i].age > 2.2) beats.splice(i, 1); }
      hoverAmp += ((hover >= 0 || finger >= 0 ? 1 : 0) - hoverAmp) * (1 - Math.exp(-dt * 8));
      const hi = finger >= 0 ? finger : hover;
      const breath = .5 + .5 * Math.sin(t * (RM ? .7 : 1.1));
      for (let i = 0; i < N; i++) {
        let v = .06 + .1 * breath + .05 * (.5 + .5 * Math.sin(t * (RM ? 1 : 1.7) - i * .55));
        for (const b of beats) {
          const x = Math.abs(i - b.o) - b.age * SPD;
          v += b.amp * Math.exp(-x * x * .5) * Math.exp(-b.age * 1.7);
        }
        if (hi >= 0) v += hoverAmp * .3 * Math.exp(-(i - hi) * (i - hi) * .6);
        v = Math.min(1, v);
        bars[i].style.transform = `scaleY(${v.toFixed(3)})`;
        bars[i].style.opacity = (.55 + v * .45).toFixed(3);
      }
    },
  };
}

/* 05 Entropy — order, then chaos, then a better kind of order */
function blobCard(art) {
  const label = $('.blob__state', art);
  const cv = mk('canvas');
  art.insertBefore(cv, label);
  const sz = fitCanvas(cv, art);
  const ctx = sz.ctx;
  const N = 120, P = new Float32Array(N * 6); // x y vx vy sx sy
  let phase = 'idle', pt = 0, rot = 0, alpha = 0;
  const say = (s) => { if (s) { label.textContent = s; label.classList.add('is-on'); } else label.classList.remove('is-on'); art.dataset.phase = phase; };
  const go = (p) => {
    phase = p; pt = 0;
    art.classList.toggle('is-order', p === 'order');
    art.classList.toggle('is-scattered', p === 'chaos' || p === 'better');
    if (p === 'order') say('order');
    else if (p === 'chaos') { say('chaos'); scatter(true); }
    else if (p === 'better') { say('better order'); for (let i = 0; i < N; i++) { P[i * 6 + 4] = P[i * 6]; P[i * 6 + 5] = P[i * 6 + 1]; } }
    else if (p === 'melt') { say(''); for (let i = 0; i < N; i++) { P[i * 6 + 4] = P[i * 6]; P[i * 6 + 5] = P[i * 6 + 1]; } }
    else say('');
  };
  function scatter(spawn) {
    const w = sz.w, h = sz.h, ar = art.getBoundingClientRect();
    const bl = $$(':scope > i', art).map((b) => { const r = b.getBoundingClientRect(); return [r.left - ar.left + r.width / 2, r.top - ar.top + r.height / 2, r.width * .36]; });
    const sp = RM ? 70 : 240;
    for (let i = 0; i < N; i++) {
      const j = i * 6;
      if (spawn) {
        const b = bl[i % bl.length] || [w / 2, h / 2, 40];
        const a = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * b[2];
        P[j] = clamp(b[0] + Math.cos(a) * r, 4, w - 4); P[j + 1] = clamp(b[1] + Math.sin(a) * r, 4, h - 4);
      }
      const a = Math.random() * 6.2832, s = sp * (.35 + Math.random());
      P[j + 2] = Math.cos(a) * s; P[j + 3] = Math.sin(a) * s;
    }
  }
  const run = () => {
    touched(art);
    if (phase === 'idle') go('order');
    else if (phase === 'chaos') scatter(false);
  };
  // tap = run; a long press runs it as soon as the hold registers (200ms)
  cardGesture(art, { tap: run, start: run }, { hold: 200 });
  const D = { order: .6, chaos: RM ? 1.6 : 1.3, better: RM ? 2.6 : 2.4, melt: 1.1 };
  const eio = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  return {
    tick(t, dt) {
      if (phase === 'idle') { if (alpha) { ctx.clearRect(0, 0, sz.w, sz.h); alpha = 0; } return; }
      pt += dt;
      const w = sz.w, h = sz.h, cx = w / 2, cy = h / 2;
      if (phase === 'order') { if (pt > D.order) go('chaos'); return; }
      if (phase === 'chaos') {
        alpha = Math.min(1, alpha + dt * 6);
        const jit = RM ? 120 : 600, fr = Math.exp(-dt * .8);
        for (let i = 0; i < N; i++) {
          const j = i * 6;
          P[j + 2] = (P[j + 2] + (Math.random() - .5) * jit * dt) * fr; P[j + 3] = (P[j + 3] + (Math.random() - .5) * jit * dt) * fr;
          P[j] += P[j + 2] * dt; P[j + 1] += P[j + 3] * dt;
          if (P[j] < 4 || P[j] > w - 4) { P[j + 2] *= -1; P[j] = clamp(P[j], 4, w - 4); }
          if (P[j + 1] < 4 || P[j + 1] > h - 4) { P[j + 3] *= -1; P[j + 1] = clamp(P[j + 1], 4, h - 4); }
        }
        if (pt > D.chaos) go('better');
      } else if (phase === 'better') {
        rot += dt * (RM ? .15 : .4);
        const e = eio(Math.min(1, pt / 1.1)), R = Math.min(w, h) * .4, c = R / Math.sqrt(N), GA = 2.39996;
        for (let i = 0; i < N; i++) {
          const j = i * 6, r = c * Math.sqrt(i + .5), a = i * GA + rot;
          const tx = cx + Math.cos(a) * r, ty = cy + Math.sin(a) * r;
          P[j] = P[j + 4] + (tx - P[j + 4]) * e; P[j + 1] = P[j + 5] + (ty - P[j + 5]) * e;
        }
        if (pt > D.better) go('melt');
      } else if (phase === 'melt') {
        const e = Math.min(1, pt / D.melt), ee = e * e;
        for (let i = 0; i < N; i++) { const j = i * 6; P[j] = P[j + 4] + (cx - P[j + 4]) * ee; P[j + 1] = P[j + 5] + (cy - P[j + 5]) * ee; }
        alpha = 1 - e;
        if (e >= 1) go('idle');
      }
      const C = palette(performance.now()), cols = [C.a1, C.a2, C.a3];
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = cols[k];
        ctx.globalAlpha = alpha * .16; ctx.beginPath();
        for (let i = k; i < N; i += 3) { ctx.moveTo(P[i * 6] + 7, P[i * 6 + 1]); ctx.arc(P[i * 6], P[i * 6 + 1], 7, 0, 6.2832); }
        ctx.fill();
        ctx.globalAlpha = alpha * .95; ctx.beginPath();
        for (let i = k; i < N; i += 3) { ctx.moveTo(P[i * 6] + 2.4, P[i * 6 + 1]); ctx.arc(P[i * 6], P[i * 6 + 1], 2.4, 0, 6.2832); }
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    },
  };
}

function initCards() {
  if (!gsap) return;
  const horiz = $('.horiz');
  if (!horiz) return;
  horiz.classList.add('cards-live');
  const make = { orbit: orbitCard, grid: gridCard, cube: cubeCard, bars: barsCard, blob: blobCard };
  const live = new Set();
  const io = new IntersectionObserver((ents) => {
    for (const en of ents) {
      const c = en.target._card;
      if (!c) continue;
      en.target.closest('.card').classList.toggle('is-off', !en.isIntersecting);
      if (en.isIntersecting) live.add(c); else live.delete(c);
    }
  }, { rootMargin: '60px' });
  $$('[data-art]').forEach((art) => {
    const fn = make[art.dataset.art];
    if (!fn) return;
    art._card = fn(art);
    io.observe(art);
  });
  gsap.ticker.add((time, dms) => {
    if (!pageVisible || !live.size) return;
    const dt = Math.min(.05, dms / 1000);
    for (const c of live) c.tick(time, dt);
  });
}

/* -------------------------------------------------------------------------- */
/* Preloader + intro                                                           */
/* -------------------------------------------------------------------------- */
function runIntro() {
  const num = $('.loader__num'), bar = $('.loader__bar span');
  const o = { v: 0 };
  gsap.set(heroChars, { yPercent: 118, rotate: 6 });
  gsap.set(tagChars, { opacity: 0, y: 14 });
  gsap.set('.nav, .hero__meta, .hero__bottom', { opacity: 0 });
  const words = ['Calibrating feelings', 'Untangling light', 'Teaching pixels to breathe', 'Almost alive'];
  const word = $('.loader__word');
  let wi = 0;
  const tl = gsap.timeline();
  tl.to(o, {
    v: 100, duration: RM ? .5 : 1.6, ease: 'power2.inOut',
    onUpdate: () => {
      num.textContent = Math.round(o.v);
      bar.style.transform = `scaleX(${o.v / 100})`;
      const nw = Math.min(words.length - 1, Math.floor(o.v / 26));
      if (nw !== wi) { wi = nw; word.textContent = words[nw]; }
    },
  });
  tl.to('.loader__count', { yPercent: -110, duration: .45, ease: 'power3.in' }, '+=.05');
  tl.to('.loader__top, .loader__mid, .loader__bar', { opacity: 0, duration: .3 }, '<');
  tl.to('.loader', { clipPath: 'inset(0% 0% 100% 0%)', duration: .9, ease: 'power4.inOut' }, '-=.1');
  tl.add(() => {
    document.body.classList.remove('is-loading');
    if (lenis) lenis.start();
    ScrollTrigger.refresh();
  }, '-=.45');
  tl.to(heroChars, { yPercent: 0, rotate: 0, duration: RM ? .4 : 1.2, ease: 'expo.out', stagger: RM ? 0 : .055 }, '-=.6');
  tl.to(S, { explode: 0, duration: RM ? .5 : 2.4, ease: 'expo.out' }, '<-.2');
  tl.to(tagChars, { opacity: 1, y: 0, duration: .8, ease: 'power3.out', stagger: RM ? 0 : .018 }, '<.45');
  tl.to('.nav, .hero__meta, .hero__bottom', { opacity: 1, duration: 1, stagger: .1 }, '<.2');
  tl.add(() => { $('.hero__word').classList.add('unmask'); $('.loader').style.display = 'none'; });
  return tl;
}

/* Hero wordmark: per-letter hop + 5 fast clicks => gravity drop */
function initWordmark() {
  const word = $('.hero__word');
  let clicks = [], busy = false;
  heroChars.forEach((c) => {
    c.addEventListener('pointerenter', () => {
      if (busy) return;
      gsap.timeline().to(c, { yPercent: RM ? -6 : -14, duration: .25, ease: 'power2.out' }).to(c, { yPercent: 0, duration: .9, ease: RM ? 'power2.out' : 'elastic.out(1.1, .35)' });
    });
  });
  word.addEventListener('click', () => {
    const now = performance.now();
    clicks = clicks.filter((t) => now - t < 1700);
    clicks.push(now);
    S.pulse = 1; gsap.to(S, { pulse: 0, duration: .9, ease: 'power3.out', overwrite: true });
    if (clicks.length >= 5 && !busy) { clicks = []; gravity(); }
  });
  function gravity() {
    busy = true;
    word.classList.add('unmask');
    const hero = $('.hero').getBoundingClientRect();
    const tl = gsap.timeline({ onComplete: () => { busy = false; } });
    heroChars.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const fall = hero.bottom - r.bottom - 24 - Math.random() * 40;
      tl.to(c, { y: fall, x: (Math.random() - .5) * 160, rotate: (Math.random() - .5) * 120, duration: .9 + Math.random() * .4, ease: 'bounce.out' }, i * .04);
    });
    tl.to(heroChars, { y: 0, x: 0, rotate: 0, duration: 1.4, ease: 'elastic.out(1, .45)', stagger: { each: .05, from: 'center' } }, '+=.9');
    toast('Gravity restored. Mostly.');
  }
}

/* -------------------------------------------------------------------------- */
/* FX: matrix rain, confetti, explosion, warp                                  */
/* -------------------------------------------------------------------------- */
const FX = (() => {
  const cv = $('#fx');
  const ctx = cv.getContext('2d');
  let mode = null, tick = null, data = null;
  function size() { const d = Math.min(devicePixelRatio || 1, 2); cv.width = innerWidth * d; cv.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  function stop() {
    if (tick) gsap.ticker.remove(tick);
    tick = null; mode = null;
    gsap.to(cv, { opacity: 0, duration: .5, onComplete: () => { cv.style.display = 'none'; ctx.clearRect(0, 0, cv.width, cv.height); } });
  }
  function start(m, fn) {
    if (tick) gsap.ticker.remove(tick);
    gsap.killTweensOf(cv);
    mode = m; size(); cv.style.display = 'block'; gsap.set(cv, { opacity: 1 });
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    tick = fn; gsap.ticker.add(tick);
  }
  function matrix(ms = 5000) {
    const fs = 16, cols = Math.ceil(innerWidth / fs);
    const drops = Array.from({ length: cols }, () => Math.random() * -18);
    const chars = 'アカサタナハマヤラワ0123456789SZVTECHｦｱｳｴｵｶｷｸｹｺ<>{}=+*';
    const accent = getComputedStyle(root).getPropertyValue('--a2').trim() || '#22d3ee';
    const t0 = performance.now();
    let acc = 0;
    start('matrix', (t, dms) => {
      acc += dms;
      if (acc < 33) return; acc = 0;
      ctx.fillStyle = 'rgba(5,5,10,0.12)'; ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.font = `${fs}px "JetBrains Mono", monospace`;
      for (let i = 0; i < cols; i++) {
        const y = drops[i] * fs;
        ctx.fillStyle = Math.random() > .96 ? '#ffffff' : accent;
        ctx.fillText(chars[(Math.random() * chars.length) | 0], i * fs, y);
        if (y > innerHeight && Math.random() > .975) drops[i] = 0;
        drops[i] += 1;
      }
      if (performance.now() - t0 > ms) stop();
    });
  }
  function confetti() {
    const cs = getComputedStyle(root);
    const pal = ['--a1', '--a2', '--a3'].map((v) => cs.getPropertyValue(v).trim()).concat(['#ffffff']);
    const P = [];
    const n = MOBILE ? 120 : 220;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 6 + Math.random() * 14;
      P.push({ x: innerWidth / 2, y: innerHeight * .45, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4, w: 6 + Math.random() * 8, h: 3 + Math.random() * 5, c: pal[i % pal.length], life: 1 });
    }
    start('confetti', (t, dms) => {
      const f = dms / 16.667;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      let alive = 0;
      for (const p of P) {
        p.vy += .32 * f; p.vx *= Math.pow(.985, f); p.vy *= Math.pow(.985, f);
        p.x += p.vx * f; p.y += p.vy * f; p.r += p.vr * f; p.life -= .0045 * f;
        if (p.life <= 0 || p.y > innerHeight + 40) continue;
        alive++;
        ctx.save(); ctx.globalAlpha = Math.min(1, p.life * 2); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.cos(p.r * 3));
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
      if (!alive) stop();
    });
  }
  return { matrix, confetti, get mode() { return mode; } };
})();

function explode(power = 1) {
  if (!gsap) return;
  gsap.timeline()
    .to(S, { explode: power, duration: .55, ease: 'expo.out', overwrite: 'auto' })
    .to(S, { explode: 0, duration: 2.6, ease: 'elastic.out(1, .55)' });
}
function warp(hold = 1.8) {
  if (!gsap) return;
  document.body.classList.add('warping');
  gsap.timeline({ onComplete: () => document.body.classList.remove('warping') })
    .to(S, { warp: 1, fov: 78, duration: .8, ease: 'power3.in' })
    .to(S, { fov: 70, duration: hold, ease: 'sine.inOut' })
    .to(S, { warp: 0, fov: 45, duration: 1.2, ease: 'expo.out' });
}

/* -------------------------------------------------------------------------- */
/* Hidden terminal                                                             */
/* -------------------------------------------------------------------------- */
const Term = (() => {
  const el = $('.term'), out = $('.term__out'), input = $('.term__input'), body = $('.term__body');
  const pre = $('.term__pre'), car = $('.term__caret'), post = $('.term__post');
  let open = false, booted = false, hist = [], hi = 0, game = null;
  try { hist = JSON.parse(sessionStorage.getItem('szv-hist') || '[]'); } catch (e) { hist = []; }
  hi = hist.length;

  const print = (html, cls = '') => { const d = mk('div', 'tl ' + cls); d.innerHTML = html; out.append(d); body.scrollTop = body.scrollHeight; return d; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function render() {
    const v = input.value, s = input.selectionStart ?? v.length;
    pre.textContent = v.slice(0, s);
    car.textContent = v[s] || ' ';
    post.textContent = v.slice(s + 1);
  }

  const PUBLIC = {
    help: { d: 'list available commands', fn: () => {
      print('<span class="dim">available commands:</span>');
      Object.entries(PUBLIC).forEach(([k, c]) => print(`  <span class="c2">${k.padEnd(14)}</span><span class="dim">${c.d}</span>`));
      print('<span class="dim">some doors are not on this list.</span>');
    } },
    whoami: { d: 'who are you, really', fn: () => {
      print('guest &mdash; a curious visitor. <span class="dim">probably human. probably.</span>');
      print(`<span class="dim">fun fact: whoami works in real terminals too. ${LEARN_LINK} teaches the rest.</span>`);
    } },
    about: { d: 'what is this place', fn: () => {
      print('<span class="grad">SZVTECH</span> is a private playground for things that move.');
      print('<span class="dim">particles, shaders, type in motion, small experiments that refuse to sit still.</span>');
      print(`<span class="dim">also: a training terminal for the real thing. type</span> ${LEARN_LINK}`);
    } },
    date: { d: 'print the current date', fn: () => print(new Date().toString()) },
    clear: { d: 'clear the screen', fn: () => { out.innerHTML = ''; } },
    echo: { d: 'echo <text>', fn: (a) => print(esc(a.join(' ')) || '&nbsp;') },
    ls: { d: 'list files', fn: () => {
      print('<span class="dim">drwxr-xr-x</span>  <span class="c2">particles/</span>');
      print('<span class="dim">drwxr-xr-x</span>  <span class="c2">shaders/</span>');
      print('<span class="dim">drwxr-xr-x</span>  <span class="c2">dreams/</span>');
      print('<span class="dim">-rw-r--r--</span>  manifesto.txt');
      print('<span class="dim">-rw-r--r--</span>  noise.glsl');
      print('<span class="dim">-rw-r--r--</span>  todo.md            <span class="dim"># 1. make it feel alive</span>');
    } },
    theme: { d: `theme &lt;${themeNames().join('|')}&gt;`, fn: (a) => {
      const n = (a[0] || '').toLowerCase();
      if (!n) {
        print(`usage: theme &lt;${themeNames().join('|')}&gt;   <span class="dim">current: ${currentThemeName()}</span>`);
        print('<span class="dim">applies to every page on the site. tip: press t anywhere to cycle.</span>');
        return;
      }
      if (n === 'next' || n === 'random') {
        const list = themeNames().filter((t) => t !== currentThemeName());
        return PUBLIC.theme.fn([n === 'next' ? themeNames()[(themeNames().indexOf(currentThemeName()) + 1) % themeNames().length] : list[Math.floor(Math.random() * list.length)]]);
      }
      if (n === currentThemeName()) { print(`<span class="dim">already ${esc(n)}.</span>`); return; }
      if (setTheme(n)) print(`<span class="ok">&#10003;</span> accent shifted to <span class="c1">${n}</span> <span class="dim">&mdash; site-wide</span>`);
      else print(`<span class="err">unknown theme:</span> ${esc(n)}. try ${themeNames().join(', ')}`);
    } },
    matrix: { d: 'follow the white rabbit', fn: () => { print('<span class="c2">wake up...</span>'); FX.matrix(5000); } },
    party: { d: 'you know what this does', fn: () => { print('<span class="c3">&#10022; &#10022; &#10022;</span> party mode'); FX.confetti(); explode(1.1); } },
    learn: { d: 'boot the training terminal', fn: (a) => {
      const free = /^(free|play|freeplay)$/i.test(a[0] || '');
      print(`<span class="c3">&#9670;</span> booting training terminal&hellip; <span class="dim">${free ? 'free play, no missions' : '15 spells, missions, xp'}</span>`);
      return portal(LEARN_URL + (free ? '#free' : ''));
    } },
    exit: { d: 'close the terminal', fn: () => hide() },
  };

  /* Real shell commands this toy shell doesn't run: point people at /learn instead. */
  const REAL = {
    dir: 'lists what is inside a folder (windows)', cd: 'moves you between folders', tree: 'draws a folder and everything under it',
    color: 'repaints the console. try color 0a (windows)', pwd: 'prints the folder you are in (linux)', cat: 'prints a file (linux)',
    type: 'prints a file (windows)', mkdir: 'creates a folder', md: 'creates a folder (windows)', rmdir: 'removes a folder', rd: 'removes a folder (windows)',
    rm: 'deletes things. carefully (linux)', del: 'deletes files (windows)', erase: 'deletes files (windows)', copy: 'copies files (windows)', cp: 'copies files (linux)',
    move: 'moves files (windows)', mv: 'moves or renames files (linux)', ren: 'renames files (windows)', touch: 'creates an empty file (linux)',
    ping: 'checks if another machine answers', ipconfig: 'shows your network setup (windows)', ifconfig: 'shows your network setup (linux)',
    ip: 'shows your network setup (linux)', tracert: 'traces the hops to a server (windows)', traceroute: 'traces the hops to a server (linux)',
    nslookup: 'asks dns who a name belongs to', netstat: 'lists open network connections', ver: 'prints the windows version', uname: 'prints the system name (linux)',
    hostname: 'prints this machine\'s name', systeminfo: 'dumps everything about the machine (windows)', tasklist: 'lists running programs (windows)',
    taskkill: 'stops a running program (windows)', ps: 'lists running programs (linux)', top: 'live view of what the cpu is doing (linux)', kill: 'stops a running program (linux)',
    man: 'opens the manual for a command (linux)', history: 'shows what you typed before', grep: 'finds text inside files (linux)', find: 'finds files, or text in files',
    findstr: 'finds text inside files (windows)', chmod: 'changes who may touch a file (linux)', nano: 'a tiny text editor (linux)', vim: 'an editor you can never leave (linux)',
    vi: 'an editor you can never leave (linux)', title: 'renames the console window (windows)', start: 'opens a program or file (windows)', ssh: 'logs into another machine',
    curl: 'fetches things from the web', wget: 'downloads things from the web', shutdown: 'turns the machine off. not today.', cls: 'clears the screen (windows)',
  };
  function realHint(cmd, what) {
    print(`<span class="c2">${esc(cmd)}</span> is a real command <span class="dim">&mdash; ${what}.</span>`);
    print(`<span class="dim">this shell only fakes a few. want to learn it properly? type</span> ${LEARN_LINK}`);
  }

  async function portal(path) {
    print(`<span class="c2">&rsaquo;</span> opening portal &rarr; <span class="c1">${path}</span>`);
    input.disabled = true;
    warp(1.2);
    const bar = print('<span class="dim">[                    ]</span>');
    for (let i = 1; i <= 20; i++) { await sleep(RM ? 10 : 38); bar.innerHTML = `<span class="c2">[${'&#9608;'.repeat(i)}${' '.repeat(20 - i)}]</span> <span class="dim">${i * 5}%</span>`; }
    print('<span class="ok">portal stable. stepping through...</span>');
    await sleep(RM ? 50 : 260);
    window.location.href = path;
  }

  const SECRET = {
    hack: () => portal('/hack/'),
    more: () => portal('/more/'),
    contact: () => portal('/contact/'),
    sys: () => { print('<span class="err">[!]</span> <span class="dim">staging ops console &mdash; you weren\'t supposed to find this</span>'); return portal('/sys/'); },
    admin: () => { print('<span class="err">[!]</span> <span class="dim">restricted. authorized personnel only</span>'); return portal('/sys/'); },
    sudo: () => {
      const jokes = [
        'nice try. this incident will be reported to... nobody. nobody is watching.',
        'sudo: you are already as powerful as you are going to get here.',
        'permission granted to: have a nice day. everything else: denied.',
      ];
      print(`<span class="err">[sudo]</span> ${jokes[(Math.random() * jokes.length) | 0]}`);
    },
    snake: () => startSnake(),
  };

  async function run(raw) {
    const line = raw.trim();
    print(`<span class="c2">&rsaquo;</span> <span class="cmd">${esc(line)}</span>`, 'echo');
    if (!line) return;
    hist.push(line); if (hist.length > 50) hist.shift(); hi = hist.length;
    try { sessionStorage.setItem('szv-hist', JSON.stringify(hist)); } catch (e) { /* ignore */ }
    const [cmd, ...args] = line.split(/\s+/);
    const c = cmd.toLowerCase();
    if (PUBLIC[c]) return PUBLIC[c].fn(args);
    if (SECRET[c]) return SECRET[c](args);
    if (c === 'hello' || c === 'hi') return print('hi. the machine hears you.');
    if (c === 'cls') { out.innerHTML = ''; return realHint('cls', 'windows-speak for clear. done'); }
    if (Object.prototype.hasOwnProperty.call(REAL, c)) return realHint(c, REAL[c]);
    print(`<span class="err">command not found:</span> ${esc(cmd)} <span class="dim">&mdash; type 'help'</span>`);
  }

  function complete() {
    const v = input.value;
    if (!v || v.includes(' ')) {
      if (v.toLowerCase().startsWith('theme ')) {
        const part = v.slice(6).toLowerCase();
        const m = themeNames().filter((t) => t.startsWith(part));
        if (m.length === 1) input.value = 'theme ' + m[0];
        else if (m.length > 1) print(m.join('   '), 'dim');
      }
      return;
    }
    const m = Object.keys(PUBLIC).filter((k) => k.startsWith(v.toLowerCase()));
    if (m.length === 1) input.value = m[0] + (m[0] === 'theme' || m[0] === 'echo' ? ' ' : '');
    else if (m.length > 1) print(`<span class="dim">${m.join('   ')}</span>`);
  }

  function boot() {
    booted = true;
    print('<span class="grad">SZVTECH</span> <span class="dim">shell v2.6.0 &mdash; ' + new Date().toLocaleDateString() + '</span>');
    print('<span class="dim">the machine is listening. type</span> <span class="c2">help</span> <span class="dim">to begin.</span>');
    print(`<span class="dim">new:</span> ${LEARN_LINK} <span class="dim">boots a training terminal for real commands.</span>`);
  }

  function show() {
    if (open) return;
    open = true;
    root.classList.add('term-open');
    el.setAttribute('aria-hidden', 'false');
    if (lenis) lenis.stop();
    if (!booted) boot();
    input.disabled = false;
    setTimeout(() => { input.focus({ preventScroll: true }); render(); }, 60);
  }
  function hide() {
    if (!open) return;
    if (game) game.stop(true);
    open = false;
    root.classList.remove('term-open');
    el.setAttribute('aria-hidden', 'true');
    input.blur();
    if (lenis && !document.body.classList.contains('is-loading')) lenis.start();
  }
  const toggle = () => (open ? hide() : show());

  input.addEventListener('input', render);
  ['keyup', 'click', 'select', 'focus'].forEach((ev) => input.addEventListener(ev, render));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const v = input.value; input.value = ''; render(); run(v); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) { hi--; input.value = hist[hi]; requestAnimationFrame(() => { input.setSelectionRange(input.value.length, input.value.length); render(); }); } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (hi < hist.length) { hi++; input.value = hist[hi] || ''; render(); } }
    else if (e.key === 'Tab') { e.preventDefault(); complete(); render(); }
    else if (e.key.toLowerCase() === 'l' && e.ctrlKey) { e.preventDefault(); out.innerHTML = ''; }
    requestAnimationFrame(render);
  });
  body.addEventListener('click', () => { if (!game && getSelection().isCollapsed) input.focus({ preventScroll: true }); });
  $('.term__close').addEventListener('click', hide);
  $('.term-backdrop').addEventListener('click', hide);

  /* ---------- Snake ---------- */
  function startSnake() {
    const cols = 24, rows = 14;
    const cell = Math.max(10, Math.floor(Math.min(body.clientWidth - 40, 480) / cols));
    const W = cols * cell, H = rows * cell, d = Math.min(devicePixelRatio || 1, 2);
    const wrap = mk('div', 'snake');
    const cv = mk('canvas'); cv.width = W * d; cv.height = H * d; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const hud = mk('div', 'snake__hud', 'score 0  ·  arrows / wasd  ·  esc to quit');
    wrap.append(cv, hud); out.append(wrap);
    el.classList.add('is-gaming');
    input.blur();
    body.scrollTop = body.scrollHeight;
    const ctx = cv.getContext('2d'); ctx.scale(d, d);
    const cs = getComputedStyle(root);
    const A1 = cs.getPropertyValue('--a1').trim(), A2 = cs.getPropertyValue('--a2').trim(), A3 = cs.getPropertyValue('--a3').trim();
    let snake, dir, queue, food, score, over, acc, step, best = 0;
    try { best = +localStorage.getItem('szv-snake') || 0; } catch (e) { /* ignore */ }
    function reset() {
      snake = [{ x: 6, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 7 }];
      dir = { x: 1, y: 0 }; queue = []; score = 0; over = false; acc = 0; step = 120; placeFood();
    }
    function placeFood() {
      do { food = { x: (Math.random() * cols) | 0, y: (Math.random() * rows) | 0 }; } while (snake.some((s) => s.x === food.x && s.y === food.y));
    }
    function turn(nx, ny) {
      const last = queue.length ? queue[queue.length - 1] : dir;
      if (last.x === -nx && last.y === -ny) return;
      if (last.x === nx && last.y === ny) return;
      if (queue.length < 3) queue.push({ x: nx, y: ny });
    }
    function update() {
      if (queue.length) dir = queue.shift();
      const h = { x: (snake[0].x + dir.x + cols) % cols, y: (snake[0].y + dir.y + rows) % rows };
      if (snake.some((s, i) => i < snake.length - 1 && s.x === h.x && s.y === h.y)) {
        over = true;
        if (score > best) { best = score; try { localStorage.setItem('szv-snake', best); } catch (e) { /* ignore */ } }
        hud.textContent = `game over  ·  score ${score}  ·  best ${best}  ·  enter to retry, esc to quit`;
        return;
      }
      snake.unshift(h);
      if (h.x === food.x && h.y === food.y) { score++; step = Math.max(60, step - 3); placeFood(); hud.textContent = `score ${score}  ·  arrows / wasd  ·  esc to quit`; }
      else snake.pop();
    }
    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) ctx.fillRect(x * cell + cell / 2 - 1, y * cell + cell / 2 - 1, 2, 2);
      const pulse = 1 + Math.sin(t * 6) * .15;
      ctx.shadowBlur = 16; ctx.shadowColor = A3; ctx.fillStyle = A3;
      ctx.beginPath(); ctx.arc(food.x * cell + cell / 2, food.y * cell + cell / 2, cell * .3 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = A2;
      snake.forEach((s, i) => {
        const k = i / Math.max(1, snake.length - 1);
        ctx.fillStyle = i === 0 ? '#ffffff' : (k < .5 ? A2 : A1);
        ctx.globalAlpha = 1 - k * .45;
        const p = i === 0 ? 1 : 2;
        ctx.beginPath(); ctx.roundRect(s.x * cell + p, s.y * cell + p, cell - p * 2, cell - p * 2, cell * .28); ctx.fill();
      });
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      if (over) {
        ctx.fillStyle = 'rgba(5,5,10,.6)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.round(cell * 1.1)}px "JetBrains Mono", monospace`; ctx.textAlign = 'center';
        ctx.fillText('game over', W / 2, H / 2);
        ctx.font = `${Math.round(cell * .6)}px "JetBrains Mono", monospace`; ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.fillText(`score ${score}`, W / 2, H / 2 + cell * 1.2);
      }
    }
    const tick = (t, dms) => {
      if (!over) { acc += dms; while (acc >= step) { acc -= step; update(); if (over) break; } }
      draw(t);
    };
    const keys = (e) => {
      const k = e.key;
      const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
      if (map[k]) { e.preventDefault(); e.stopPropagation(); turn(...map[k]); }
      else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); api.stop(); }
      else if (k === 'Enter' && over) { e.preventDefault(); reset(); hud.textContent = 'score 0  ·  arrows / wasd  ·  esc to quit'; }
      else if (k === '`') { e.preventDefault(); e.stopPropagation(); }
    };
    let tx = 0, ty = 0;
    cv.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
    cv.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
      if (over) { reset(); return; }
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) turn(Math.sign(dx), 0); else turn(0, Math.sign(dy));
    });
    const api = {
      stop(silent) {
        gsap.ticker.remove(tick);
        removeEventListener('keydown', keys, true);
        el.classList.remove('is-gaming');
        game = null;
        if (!silent) { print(`<span class="dim">snake closed. final score</span> <span class="c2">${score}</span>`); input.focus({ preventScroll: true }); }
      },
    };
    reset();
    addEventListener('keydown', keys, true);
    gsap.ticker.add(tick);
    game = api;
    print('<span class="dim">snake.exe loaded. eat the glow, avoid yourself.</span>');
  }

  return { show, hide, toggle, get open() { return open; }, get gaming() { return !!game; } };
})();

/* -------------------------------------------------------------------------- */
/* Learn teaser: a fake training terminal that types itself on scroll          */
/* -------------------------------------------------------------------------- */
const LearnDemo = (() => {
  const win = $('.lterm');
  if (!win) return { play() {}, final() {} };
  const body = $('.lterm__body', win), out = $('.lterm__out', win);
  const xpEl = $('.lterm__xp b', win), misNum = $('.lterm__mission b', win), misTxt = $('.lterm__mission em', win), meter = $('.lterm__meter i', win);
  const spells = (k) => { const li = $(`.learn__spells [data-spell="${k}"]`); if (li) li.classList.add('is-done'); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const D = '<span class="d">', H = '<span class="h">', E = '</span>';
  const STEPS = [
    { cmd: 'dir', spell: 'dir', xp: 10, mission: 'look around', out: [
      ` Volume in drive C is ${H}SZVTECH${E}`,
      ' Directory of C:\\',
      '',
      `${D}10/09/2026  09:41${E}  &lt;DIR&gt;  ${H}projects${E}`,
      `${D}10/09/2026  09:41${E}  &lt;DIR&gt;  ${H}secrets${E}`,
      `${D}10/09/2026  09:41${E}   1,337  todo.txt`,
    ] },
    { cmd: 'cd projects', spell: 'cd', xp: 10, mission: 'move around', prompt: 'C:\\projects&gt;', out: [] },
    { cmd: 'tree', spell: 'tree', xp: 15, mission: 'see the whole map', out: [
      'C:\\PROJECTS',
      `├───${H}particles${E}`,
      `│   └───shaders`,
      `├───${H}portal${E}`,
      `└───${H}dreams${E}`,
    ] },
    { cmd: 'color 0a', spell: 'color', xp: 15, mission: 'hacker mode', fx: 'green', out: [] },
  ];
  let prompt = 'C:\\&gt;', xp = 0, n = 0, state = 0; // 0 idle, 1 playing, 2 done

  const line = (html, cls = '') => { const d = mk('span', 'll ' + cls); d.innerHTML = html || '&#8203;'; out.append(d); body.scrollTop = body.scrollHeight; return d; };
  const promptLine = () => line(`<span class="p">${prompt}</span><span class="c"></span><span class="k"> </span>`, 'is-active');
  function header() {
    out.textContent = '';
    line(`${H}SZVTECH${E} training shell ${D}[version 1.0.15]${E}`);
    line(`${D}15 spells. missions. xp. type to learn.${E}`);
    line('');
  }
  function award(st) {
    xp += st.xp; n += 1;
    spells(st.spell);
    line(`<span class="ok">&#10003;</span> ${D}mission ${String(n).padStart(2, '0')} &middot;${E} ${st.mission} <span class="xp">+${st.xp} xp</span>`, 'in');
    misNum.textContent = String(n).padStart(2, '0');
    misTxt.textContent = n < STEPS.length ? STEPS[n].mission : `${15 - n} spells to go`;
    meter.style.transform = `scaleX(${n / 15})`;
    if (!gsap) xpEl.textContent = String(xp).padStart(3, '0');
    else { const o = { v: xp - st.xp }; gsap.to(o, { v: xp, duration: .8, ease: 'power2.out', onUpdate: () => { xpEl.textContent = String(Math.round(o.v)).padStart(3, '0'); } }); }
  }
  function fx(st) {
    if (st.fx === 'green') { win.classList.add('is-green', 'flash'); setTimeout(() => win.classList.remove('flash'), 600); }
    if (st.prompt) prompt = st.prompt;
  }
  function final() {
    if (state === 2) return;
    state = 2;
    header();
    for (const st of STEPS) {
      line(`<span class="p">${prompt}</span><span class="c">${st.cmd}</span>`);
      st.out.forEach((o) => line(o));
      fx(st); award(st);
      line('');
    }
    promptLine();
  }
  async function play() {
    if (state) return;
    state = 1;
    header();
    await wait(300);
    for (const st of STEPS) {
      const pl = promptLine();
      await wait(st === STEPS[0] ? 350 : 420);
      const c = $('.c', pl);
      for (const ch of st.cmd) { c.textContent += ch; await wait(42 + Math.random() * 70); }
      await wait(240);
      pl.classList.remove('is-active');
      for (const o of st.out) { line(o, 'in'); await wait(45); }
      fx(st);
      await wait(st.out.length ? 200 : 300);
      award(st);
      line('');
    }
    await wait(200);
    promptLine();
    state = 2;
  }
  header(); promptLine();
  return { play, final };
})();

function initLearn() {
  const sec = $('#learn');
  if (!sec) return;
  const l1 = splitText($('.learn__l1'), 'words');
  const l2 = $('.learn__l2');
  {
    // reduced motion still types: only the 3D tip-up and the parallax glyph go
    gsap.set(l1, { yPercent: 115 });
    gsap.set(l2, { clipPath: 'inset(-10% 100% -10% 0%)' });
    ScrollTrigger.create({
      trigger: '.learn__title', start: 'top 85%', once: true,
      onEnter: () => {
        gsap.to(l1, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: .05 });
        l2.classList.add('is-typing');
        gsap.to(l2, { clipPath: 'inset(-10% 0% -10% 0%)', duration: 1.2, ease: 'steps(26)', delay: .55, onComplete: () => setTimeout(() => l2.classList.remove('is-typing'), 1600) });
      },
    });
    gsap.from('.learn__spells li', { y: 18, opacity: 0, duration: .8, ease: 'expo.out', stagger: .04, scrollTrigger: { trigger: '.learn__spells', start: 'top 90%', once: true } });
    gsap.from('.learn__actions', { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.learn__actions', start: 'top 95%', once: true } });
    // the window tips up from the floor as it arrives
    if (RM) {
      gsap.from('.lterm', { opacity: 0, y: 16, duration: 1.2, ease: 'power2.out', scrollTrigger: { trigger: '.learn__stage', start: 'top 92%', once: true } });
    } else {
      gsap.fromTo('.lterm', { rotateX: MOBILE ? 14 : 26, rotateY: MOBILE ? 0 : -10, y: 90, scale: .9, opacity: .35 }, {
        rotateX: 0, rotateY: 0, y: 0, scale: 1, opacity: 1, ease: 'none',
        scrollTrigger: { trigger: '.learn__stage', start: 'top bottom', end: 'center 58%', scrub: 1 },
      });
      gsap.fromTo('.learn__bg span', { xPercent: 12 }, { xPercent: -18, ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true } });
    }
    ScrollTrigger.create({ trigger: '.lterm', start: COARSE ? 'top 88%' : 'top 72%', once: true, onEnter: () => LearnDemo.play() });
  }
  // spotlight + subtle tilt on the window
  const lt = $('.lterm');
  if (FINE) {
    const win = $('.lterm__win');
    const amt = RM ? 3 : 7;
    lt.addEventListener('pointermove', (e) => {
      const r = lt.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
      gsap.to(win, { rotateY: px * amt, rotateX: -py * amt, transformPerspective: 1200, duration: .7, ease: 'power3.out', overwrite: 'auto' });
    });
    lt.addEventListener('pointerleave', () => gsap.to(win, { rotateY: 0, rotateX: 0, duration: 1.1, ease: 'elastic.out(1, .55)', overwrite: 'auto' }));
  }
}

/* Type `cmd` or `learn` anywhere: glitch, toast, step through to /learn/ */
let unlocking = false;
function unlockLearn() {
  if (unlocking) return;
  unlocking = true;
  toast('Training terminal unlocked — booting…');
  if (!RM) {
    document.body.classList.add('glitching');
    setTimeout(() => document.body.classList.remove('glitching'), 700);
    S.pulse = 1; gsap.to(S, { pulse: 0, duration: .9, ease: 'power3.out' });
    setTimeout(() => warp(1.2), 350);
  }
  setTimeout(() => { window.location.href = LEARN_URL; }, RM ? 700 : 1500);
}

/* -------------------------------------------------------------------------- */
/* Mobile nav: burger -> full-screen overlay menu                              */
/* -------------------------------------------------------------------------- */
function initNav() {
  const burger = $('.nav__burger'), menu = $('#menu');
  if (!burger || !menu) return;
  let openM = false;
  const setOpen = (v) => {
    openM = v;
    root.classList.toggle('menu-open', v);
    burger.setAttribute('aria-expanded', v ? 'true' : 'false');
    burger.setAttribute('aria-label', v ? 'Close menu' : 'Open menu');
    menu.setAttribute('aria-hidden', v ? 'false' : 'true');
    if (lenis) { v ? lenis.stop() : (document.body.classList.contains('is-loading') || lenis.start()); }
  };
  burger.addEventListener('click', () => setOpen(!openM));
  // Section links: close the overlay, then the shared [data-goto] handler scrolls.
  $$('[data-menu]').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  // Tap on empty overlay space (not a link) closes it too.
  menu.addEventListener('click', (e) => { if (!e.target.closest('a')) setOpen(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && openM) setOpen(false); });
}

/* Touch affordance for the hidden terminal (phones can't press backtick). */
function initTermFab() {
  const fab = $('.term-fab');
  if (!fab || !COARSE) return; // desktop keeps the ` / Ctrl+K shortcut
  fab.hidden = false;
  fab.addEventListener('click', () => Term.toggle());
  const tap = $('.foot__tap');
  if (tap) tap.addEventListener('click', () => Term.show());

  // Visible on the hero and whenever the user scrolls back up (the "looking
  // for something" gesture). Tucked away while reading downwards so it never
  // sits on content, and near the footer, which has its own "tap >_" button.
  const foot = $('.foot');
  const nearFoot = () => !!foot && foot.getBoundingClientRect().top < innerHeight - 24;
  let lastY = scrollY, queued = false;
  const update = () => {
    queued = false;
    const y = scrollY, dy = y - lastY;
    lastY = y;
    if (nearFoot()) fab.classList.add('is-tucked');
    else if (y < innerHeight * .5) fab.classList.remove('is-tucked');
    else if (dy > 3) fab.classList.add('is-tucked');
    else if (dy < -6) fab.classList.remove('is-tucked');
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });

  // Keep the terminal inside the *visible* viewport when the keyboard opens.
  const vv = window.visualViewport;
  if (vv) {
    const tb = $('.term__body');
    const fit = () => {
      root.style.setProperty('--vvh', vv.height + 'px');
      root.style.setProperty('--vvt', vv.offsetTop + 'px');
      if (Term.open && tb) requestAnimationFrame(() => { tb.scrollTop = tb.scrollHeight; });
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    fit();
  }
}

/* -------------------------------------------------------------------------- */
/* Keyboard: terminal toggle + Konami                                          */
/* -------------------------------------------------------------------------- */
function initKeys() {
  const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  let seq = [];
  const WORDS = ['cmd', 'learn'];
  let typed = '', typedAt = 0;
  addEventListener('keydown', (e) => {
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && k && k.toLowerCase() === 'k') { e.preventDefault(); Term.toggle(); return; }
    if ((k === '`' || (e.code === 'Backquote' && !e.shiftKey)) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && !t.classList.contains('term__input');
      if (!typing) { e.preventDefault(); Term.toggle(); return; }
    }
    if (k === 'Escape' && Term.open) { e.preventDefault(); Term.hide(); return; }
    if (Term.open) return;
    seq.push((k || '').toLowerCase());
    if (seq.length > KONAMI.length) seq.shift();
    if (seq.length === KONAMI.length && seq.every((v, i) => v === KONAMI[i])) {
      seq = [];
      explode(1.4);
      warp(2);
      FX.confetti();
      toast('Cheat code accepted — hyperspace engaged');
      return;
    }
    // secret words: only plain letters, never while typing into a field
    const t = e.target;
    if (!k || k.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (!/[a-z]/i.test(k)) { typed = ''; return; }
    const now = performance.now();
    if (now - typedAt > 1500) typed = '';
    typedAt = now;
    typed = (typed + k.toLowerCase()).slice(-8);
    if (WORDS.some((w) => typed.endsWith(w))) { typed = ''; unlockLearn(); }
  });
}

/* Clocks */
function initClock() {
  const a = $('#clock'), b = $('#clock2');
  const upd = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    if (a) a.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    if (b) b.textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  upd(); setInterval(upd, 1000);
}

function consoleHello() {
  const [c1, c2, c3] = themeCols(currentThemeName());
  console.log(
    '%c SZVTECH %c\n\nYou opened the hood. Respect.\nThere is a machine under here that talks back.\nTry pressing ` (backtick) anywhere on the page.\n\n%cC:\\> learn%c  Curious how terminals actually work? Fifteen real commands,\n            missions and XP, zero setup: %c' + location.origin + LEARN_URL + '%c\n',
    'font: 800 22px Syne, sans-serif; color: #fff; background: linear-gradient(90deg,' + c1 + ',' + c3 + ',' + c2 + '); padding: 8px 16px; border-radius: 8px;',
    'font: 12px "JetBrains Mono", monospace; color: #a5a3c2; line-height: 1.6;',
    'font: 600 12px "JetBrains Mono", monospace; color: #05050a; background: ' + c2 + '; padding: 2px 6px; border-radius: 4px;',
    'font: 12px "JetBrains Mono", monospace; color: #a5a3c2; line-height: 1.6;',
    'font: 12px "JetBrains Mono", monospace; color: ' + c2 + '; text-decoration: underline;',
    'font: 12px "JetBrains Mono", monospace; color: #a5a3c2;'
  );
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */
async function boot() {
  consoleHello();
  initClock();

  if (!gsap || !ScrollTrigger) {
    root.classList.add('no-gsap');
    document.body.classList.remove('is-loading');
    initKeysFallback();
    initNav();
    initTermFab();
    LearnDemo.final();
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  initLenis();
  prepSplits();
  initPointer();
  initMagnetic();
  initScramble();
  initTilt();
  initBands();
  initKeys();
  initNav();
  initTermFab();
  initWordmark();
  initTouchPlay();
  initCards();
  $$('[data-goto]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); goto(a.dataset.goto); }));

  // Start WebGL (non-blocking) while the counter runs
  // GL is built with the current theme; picks made while it loads still land
  const glStart = currentThemeName();
  const glReady = initGL().then((g) => { GL = g; if (GL && currentThemeName() !== glStart) GL.setTheme(themeCols(currentThemeName())); return g; });

  initScroll();
  runIntro();

  // single render loop on the GSAP ticker
  let last = performance.now();
  gsap.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!GL || !pageVisible) return;
    GL.frame(now / 1000, dt);
  });
  document.addEventListener('visibilitychange', () => { pageVisible = !document.hidden; });

  let rT;
  addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { if (GL) GL.resize(); }, 80); });

  await glReady;
  if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
}

function initKeysFallback() {
  addEventListener('keydown', (e) => {
    if (e.key === '`' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); Term.toggle(); }
    if (e.key === 'Escape') Term.hide();
  });
}

boot();
