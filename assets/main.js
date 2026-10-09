/* ==========================================================================
   SZVTECH — homepage runtime
   One rAF loop (GSAP ticker) drives Lenis, WebGL, cursor, marquee & FX.
   ========================================================================== */

const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const MOBILE = matchMedia('(max-width: 767px)').matches;
const root = document.documentElement;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;

const THEMES = {
  violet:  ['#8b5cf6', '#22d3ee', '#e879f9'],
  cyan:    ['#22d3ee', '#3b82f6', '#5eead4'],
  magenta: ['#ff2fa0', '#8b5cf6', '#ffb86b'],
  lime:    ['#a3e635', '#22d3ee', '#fde047'],
};

/* Shared scene state — scroll tweens write here, the WebGL frame reads it. */
const Z0 = MOBILE ? 9.2 : 7.4;
const S = {
  morph: 0, bright: 1, explode: 1, warp: 0, fov: 45,
  camX: 0, camY: 0, camZ: Z0, lookY: 0, rotX: 0,
  mx: 0, my: 0, mouseOn: 0, mouseVel: 0, pulse: 0,
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

/* Theme */
function setTheme(name) {
  const cols = THEMES[name];
  if (!cols) return false;
  root.style.setProperty('--a1', cols[0]);
  root.style.setProperty('--a2', cols[1]);
  root.style.setProperty('--a3', cols[2]);
  if (GL) GL.setTheme(cols);
  try { localStorage.setItem('szv-theme', name); } catch (e) { /* ignore */ }
  return true;
}

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
uniform float uTime, uMorph, uSize, uPR, uExplode, uWarp, uMouseForce, uNoise, uBright, uAspect, uPulse;
uniform vec2 uMouse;
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

  // cursor: screen-space repel + swirl
  vec4 clip = projectionMatrix*mv;
  vec2 ndc = clip.xy/clip.w;
  vec2 dd = (ndc - uMouse)*vec2(uAspect,1.0);
  float dist = length(dd);
  float f = smoothstep(0.32, 0.0, dist)*uMouseForce;
  vec2 dir = dd/(dist+0.0001);
  mv.xy += (dir*0.8 + vec2(-dir.y, dir.x)*0.9)*f*(-mv.z)*0.13;

  gl_Position = projectionMatrix*mv;
  float size = uSize*(0.35 + aRnd.w*1.15)*(1.0 + f*1.6)*(1.0 + uWarp*1.4);
  gl_PointSize = size*uPR/max(0.5, -mv.z);

  // color
  float h = smoothstep(-2.6, 2.6, p.y*0.9 + p.x*0.6);
  vec3 col = mix(uC1, uC2, h);
  col = mix(col, uC3, smoothstep(0.86, 1.0, aRnd.w)*0.9);
  float core = smoothstep(1.4, 0.0, length(aGalaxy.xz))*w3;
  col = mix(col, vec3(1.0,0.94,0.98), core*0.75);
  col += f*0.7*uC2 + uWarp*vec3(0.35);
  vColor = col;
  vAlpha = (0.55 + 0.45*sin(uTime*2.2 + aRnd.x*50.0))*uBright*(0.7+0.3*aRnd.w);
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

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, .1, 200);
  camera.position.set(0, 0, Z0);

  const N = MOBILE ? 9000 : 20000;
  const sh = buildShapes(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(sh.sphere, 3));
  geo.setAttribute('aKnot', new THREE.BufferAttribute(sh.knot, 3));
  geo.setAttribute('aWave', new THREE.BufferAttribute(sh.wave, 3));
  geo.setAttribute('aGalaxy', new THREE.BufferAttribute(sh.gal, 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(sh.rnd, 4));

  const cols = (THEMES[currentThemeName()] || THEMES.violet).map((c) => new THREE.Color(c));
  const uniforms = {
    uTime: { value: 0 }, uMorph: { value: 0 }, uSize: { value: MOBILE ? 44 : 34 }, uPR: { value: DPR * (innerHeight / 900) },
    uExplode: { value: 1 }, uWarp: { value: 0 }, uMouseForce: { value: 0 }, uNoise: { value: RM ? .08 : .22 },
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

    smx.x += (S.mx - smx.x) * Math.min(1, k * 1.6);
    smx.y += (S.my - smx.y) * Math.min(1, k * 1.6);
    if (Math.abs(smx.x) > 4) { smx.x = S.mx; smx.y = S.my; }
    uniforms.uMouse.value.set(smx.x, smx.y);
    S.mouseVel *= Math.pow(.25, dt);
    const fTarget = S.mouseOn * (RM ? .5 : 1) * (.28 + Math.min(1, S.mouseVel) * .85);
    force += (fTarget - force) * Math.min(1, k * (fTarget > force ? 1.2 : .35));
    uniforms.uMouseForce.value = force;

    spin += dt * (RM ? .015 : .07) * (1 + S.warp * 6);
    group.rotation.y = spin;
    const px = FINE ? S.mx : 0, py = FINE ? S.my : 0;
    group.rotation.x += (S.rotX + py * .12 - group.rotation.x) * k;
    group.rotation.z += (-px * .06 - group.rotation.z) * k;

    camera.position.set(S.camX + px * .25, S.camY + py * .18, S.camZ);
    camera.lookAt(0, S.lookY, 0);
    if (Math.abs(S.fov - lastFov) > .01) { camera.fov = S.fov; camera.updateProjectionMatrix(); lastFov = S.fov; }
    renderer.render(scene, camera);
  }

  function setThemeGL(c) {
    ['uC1', 'uC2', 'uC3'].forEach((u, i) => {
      const target = new THREE.Color(c[i]);
      const from = uniforms[u].value.clone();
      const o = { t: 0 };
      gsap.to(o, { t: 1, duration: 1, ease: 'power2.out', onUpdate: () => uniforms[u].value.copy(from).lerp(target, o.t) });
    });
  }

  return { frame, resize, setTheme: setThemeGL, renderer };
}

function currentThemeName() {
  try { const t = localStorage.getItem('szv-theme'); if (t && THEMES[t]) return t; } catch (e) { /* ignore */ }
  return 'violet';
}

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
  if (RM || !window.Lenis) return;
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
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (s) => { bar.style.transform = `scaleX(${s.progress})`; nav.classList.toggle('is-scrolled', s.scroll() > 40); } });

  // hero exit parallax
  gsap.timeline({ scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } })
    .to('.hero__center', { yPercent: -40, scale: .92, opacity: 0, ease: 'none' }, 0)
    .to('.hero__word .sw', { letterSpacing: '.06em', ease: 'none' }, 0)
    .to('.hero__meta, .hero__bottom', { opacity: 0, ease: 'none', duration: .5 }, 0);

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
  const mtl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '#morph', start: 'top top', end: 'bottom bottom', scrub: 1,
      onUpdate: (s) => {
        const idx = Math.min(3, Math.round(s.progress * 3.6 - .2));
        rail.forEach((r, i) => r.classList.toggle('is-on', i === Math.max(0, idx)));
      },
    },
  });
  mtl.fromTo(S, { morph: 0, ...cams[0] }, { morph: 0, ...cams[0], duration: .3 }, 0);
  for (let i = 0; i < 3; i++) {
    mtl.to(S, { morph: i + 1, ...cams[i + 1], duration: .7, ease: 'power2.inOut' }, i + .3);
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
    gsap.fromTo('.k1 > span', { xPercent: -45 }, { xPercent: 12, ease: 'none', scrollTrigger: { trigger: '.k1', start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.fromTo('.k2 > span', { xPercent: 40 }, { xPercent: -10, ease: 'none', scrollTrigger: { trigger: '.k2', start: 'top bottom', end: 'bottom top', scrub: true } });
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
  }

  // ---------- pinned horizontal ----------
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
  gsap.to(o, { n: to, duration: RM ? .3 : 2, ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.n); } });
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
    if (!inView || RM) return;
    const f = dms / 16.667;
    const speed = (1.1 + Math.min(Math.abs(vel) * .9, 38)) * f;
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
      if (FINE && !RM) gsap.to(inner, { rotateY: (px - .5) * 16, rotateX: -(py - .5) * 16, transformPerspective: 900, duration: .6, ease: 'power3.out', overwrite: 'auto' });
    });
    card.addEventListener('pointerleave', () => {
      if (FINE && !RM) gsap.to(inner, { rotateY: 0, rotateX: 0, duration: 1.2, ease: 'elastic.out(1, .5)', overwrite: 'auto' });
    });
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
      if (busy || RM) return;
      gsap.timeline().to(c, { yPercent: -14, duration: .25, ease: 'power2.out' }).to(c, { yPercent: 0, duration: .9, ease: 'elastic.out(1.1, .35)' });
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
    whoami: { d: 'who are you, really', fn: () => print('guest &mdash; a curious visitor. <span class="dim">probably human. probably.</span>') },
    about: { d: 'what is this place', fn: () => {
      print('<span class="grad">SZVTECH</span> is a private playground for things that move.');
      print('<span class="dim">particles, shaders, type in motion, small experiments that refuse to sit still.</span>');
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
    theme: { d: 'theme <violet|cyan|magenta|lime>', fn: (a) => {
      const n = (a[0] || '').toLowerCase();
      if (!n) { print(`usage: theme &lt;${Object.keys(THEMES).join('|')}&gt;   <span class="dim">current: ${currentThemeName()}</span>`); return; }
      if (setTheme(n)) print(`<span class="ok">&#10003;</span> accent shifted to <span class="c1">${n}</span>`);
      else print(`<span class="err">unknown theme:</span> ${esc(n)}. try ${Object.keys(THEMES).join(', ')}`);
    } },
    matrix: { d: 'follow the white rabbit', fn: () => { print('<span class="c2">wake up...</span>'); FX.matrix(5000); } },
    party: { d: 'you know what this does', fn: () => { print('<span class="c3">&#10022; &#10022; &#10022;</span> party mode'); FX.confetti(); explode(1.1); } },
    exit: { d: 'close the terminal', fn: () => hide() },
  };

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
    print(`<span class="err">command not found:</span> ${esc(cmd)} <span class="dim">&mdash; type 'help'</span>`);
  }

  function complete() {
    const v = input.value;
    if (!v || v.includes(' ')) {
      if (v.toLowerCase().startsWith('theme ')) {
        const part = v.slice(6).toLowerCase();
        const m = Object.keys(THEMES).filter((t) => t.startsWith(part));
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
/* Keyboard: terminal toggle + Konami                                          */
/* -------------------------------------------------------------------------- */
function initKeys() {
  const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  let seq = [];
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
    }
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
  console.log(
    '%c SZVTECH %c\n\nYou opened the hood. Respect.\nThere is a machine under here that talks back.\nTry pressing ` (backtick) anywhere on the page.\n',
    'font: 800 22px Syne, sans-serif; color: #fff; background: linear-gradient(90deg,#8b5cf6,#e879f9,#22d3ee); padding: 8px 16px; border-radius: 8px;',
    'font: 12px "JetBrains Mono", monospace; color: #a5a3c2; line-height: 1.6;'
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
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  const saved = currentThemeName();
  if (saved !== 'violet') setTheme(saved);

  initLenis();
  prepSplits();
  initPointer();
  initMagnetic();
  initScramble();
  initTilt();
  initBands();
  initKeys();
  initWordmark();
  $$('[data-goto]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); goto(a.dataset.goto); }));

  // Start WebGL (non-blocking) while the counter runs
  const glReady = initGL().then((g) => { GL = g; if (GL && saved !== 'violet') GL.setTheme(THEMES[saved]); return g; });

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
