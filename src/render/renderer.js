// ORBIT — rendu Canvas 2D (DESIGN §3–9) : arène pré-rendue, dangers tracés à la volée (glow = traits superposés),
// sprites pré-rendus (shadowBlur une seule fois), particules groupées par couleur, HUD toujours au-dessus, jamais tourné.
import { TAU, D2R, STEP, K, R_CORE, R_EMIT, R_INT, R_MID, R_EXT, R_BEZEL, R_EDGE, R_KILL, TIERS, CORES, EXTENTS, palierParams, ZENITH_OFFSET, RESONANCES, TRAILS, clamp, angd } from '../core/data.js';
import { rayExt, gapAt } from '../sim/hazards.js';
import { EV } from '../sim/sim.js';
import { Announcer, BANNER } from '../core/announcer.js';
import { drawCore, ZENITH_COLS, ZENITH_BG, zenithIndex } from './cores.js';
import { mulberry32 } from '../core/rng.js';

export const C = {
  bg: '#03050B', bg1: '#080C1A', bg2: '#0F1630', bg3: '#1A2447', line: '#9DB4E8', astre: '#FFFFFF', ivoire: '#FFF1CC',
  or: '#FFD45C', menthe: '#5CFFB0', danger: '#FF2E4D', dhot: '#FFB8C4', dsomb: '#5A0A1C', hi: '#EEF2FF', mid: '#A3AECF', lo: '#5A6488',
};
const MULT_COL = ['#5A6488', '#BFD4FF', '#5CFFB0', '#FFD45C', '#FFD45C', '#FFF1CC', '#FFFFFF'];
const F_NUM = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Roboto Mono", monospace';
const F_UI = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const DASH_RAY = [6, 5], DASH_ARC = [8, 6], DASH_ORB = [10, 6], DASH_SAT = [3, 3], NO_DASH = [];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const NP = 360;
export function fmtTime(t) { if (t < 60) return t.toFixed(2); const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
const fmtNum = n => Math.round(n).toLocaleString('fr-FR');

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false }); // PAS de `desynchronized` (leçon PULSAR : frames à moitié présentées)
    this.W = 360; this.H = 640; this.dpr = 1; this.S = 1; this.Cx = 180; this.Cy = 320; this.colX = 0; this.colW = 360;
    this.safe = { top: 0, right: 0, bottom: 0, left: 0 }; this.hudTop = 92; this.bandY = 127;
    this.reduced = false; this.MS = 1; this.quality = 0; this.debug = false;
    this.spr = {}; this.bg = null; this.core = 'atlas'; this.trailId = 'ivoire';
    // particules (SoA) : couleurs 0 or, 1 ivoire, 2 astre, 3 menthe, 4 couleur du noyau
    this.P = { x: new Float32Array(NP), y: new Float32Array(NP), vx: new Float32Array(NP), vy: new Float32Array(NP), l: new Float32Array(NP), m: new Float32Array(NP), c: new Uint8Array(NP), n: 0 };
    this.maxP = NP;
    this.rings = []; for (let i = 0; i < 24; i++) this.rings.push({ on: false, x: 0, y: 0, r0: 0, r1: 0, l: 0, m: 1, col: '', w: 1 });
    this.texts = []; for (let i = 0; i < 12; i++) this.texts.push({ on: false, x: 0, y: 0, s: '', col: '', size: 10, l: 0, m: 1 });
    this.trail = new Float32Array(72); this.trailN = 0; this.trailI = 0; this.trailTick = 0;
    this.ann = new Announcer();
    this.rnd = mulberry32(99);
    this.reset();
  }
  reset() {
    this.P.n = 0; for (const r of this.rings) r.on = false; for (const t of this.texts) t.on = false;
    this.trailN = 0; this.trailI = 0; this.cam = 0; this.camDir = 1; this.trauma = 0; this.flashBezel = 0; this.flashCol = C.or;
    this.bgPulse = 0; this.chroma = 0; this.phaseT = 9; this.coreGrowT = 9; this.borderFlash = 0; this.shieldBreakT = 9;
    this.scoreShown = 0; this.scoreVal = -1; this.scoreStr = '0'; this.chronoStr = ''; this.chronoVal = -1;
    this.goalStr = ''; this.goalT = 0; this.kick = 0; this.lastTier = 0; this.pipPop = 0; this.tierDownT = 9;
    this.recordMarkBurst = false; this.ann.reset();
  }
  setMotion(reduced) { this.reduced = reduced; this.MS = reduced ? 0 : 1; if (reduced) { this.trauma = 0; this.chroma = 0; } }

  // ------------------------------------------------------------ layout §8.3
  resize(w, h, dpr, safe) {
    this.W = w; this.H = h; this.dpr = dpr; this.safe = safe;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.colW = Math.min(w, Math.max(360, Math.round(h * 0.62))); this.colX = (w - this.colW) / 2;
    let S = this.colW / 360;
    const top = safe.top + 92, bot = safe.bottom + 44, avail = h - top - bot;
    if (avail < 364 * S) S = Math.max(0.4, avail / 364);
    this.S = S; this.Cx = w / 2; this.Cy = top + avail / 2; this.hudTop = top;
    const arenaTop = this.Cy - 182 * S;
    this.bandY = arenaTop - top >= 54 ? (top + arenaTop) / 2 : arenaTop - 27;
    this.arenaBottom = this.Cy + 182 * S;
    this.buildSprites(); this.buildBg();
  }
  makeSprite(sizeU, draw) {
    const SPR = this.S * this.dpr * 1.35, px = Math.max(2, Math.ceil(sizeU * SPR));
    const c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d'); g.setTransform(px / sizeU, 0, 0, px / sizeU, px / 2, px / 2);
    draw(g, px / sizeU); return { c, s: sizeU };
  }
  glowDot(col, r, a) {
    return this.makeSprite(r * 2, g => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); });
  }
  coreCol(t) { return this.core === 'zenith' ? ZENITH_COLS[zenithIndex(t)] : CORES[this.core].col; }
  buildSprites() {
    const s = this.spr, cc = CORES[this.core];
    s.halo = this.glowDot(C.ivoire, 22, 0.55); s.haloOr = this.glowDot(C.or, 26, 0.45);
    s.coreHalo = this.glowDot(this.core === 'zenith' ? '#9FB8FF' : cc.col, 70, 0.28);
    s.photonHalo = this.glowDot(C.or, 12, 0.45); s.resHalo = this.glowDot(C.menthe, 24, 0.38);
    const tr = TRAILS.find(x => x.id === this.trailId) || TRAILS[0];
    s.haloTrail = this.glowDot(tr.id === 'eclipse' ? '#FFFFFF' : tr.col, 22, tr.id === 'eclipse' ? 0.25 : 0.55);
    s.ecl = this.makeSprite(24, (g, k) => { g.shadowColor = C.danger; g.shadowBlur = 4 * k; g.fillStyle = C.danger; g.beginPath(); g.moveTo(5.5, 0); g.lineTo(-5.5, 4); g.lineTo(-5.5, -4); g.closePath(); g.fill();
      g.shadowBlur = 0; g.fillStyle = C.dhot; g.beginPath(); g.moveTo(2.5, 0); g.lineTo(-2.5, 1.5); g.lineTo(-2.5, -1.5); g.closePath(); g.fill(); });
    s.sat = this.makeSprite(30, (g, k) => { g.shadowColor = C.danger; g.shadowBlur = 5 * k; g.fillStyle = C.danger; g.beginPath();
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i & 1 ? 6 : 10; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
      g.shadowBlur = 0; g.fillStyle = C.dhot; g.beginPath(); g.arc(0, 0, 2.5, 0, TAU); g.fill(); });
    s.mine = this.makeSprite(26, (g, k) => { g.shadowColor = C.danger; g.shadowBlur = 5 * k; g.fillStyle = C.danger; g.beginPath(); g.moveTo(8, 0); g.lineTo(0, 8); g.lineTo(-8, 0); g.lineTo(0, -8); g.closePath(); g.fill();
      g.shadowBlur = 0; g.fillStyle = C.dhot; g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill(); });
    s.photon = this.makeSprite(18, (g, k) => { g.shadowColor = C.or; g.shadowBlur = 3 * k; g.fillStyle = C.or; g.beginPath();
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, r = i & 1 ? 2 : 7; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
      g.shadowBlur = 0; g.fillStyle = '#FFF6D6'; g.beginPath(); g.arc(0, 0, 1.5, 0, TAU); g.fill(); });
    // fantômes d'aberration chromatique (DESIGN §7.6)
    s.ghostR = this.makeSprite(16, g => { g.fillStyle = C.danger; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill(); });
    s.ghostB = this.makeSprite(16, g => { g.fillStyle = '#5FA8FF'; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill(); });
    s.bezel = this.makeSprite(366, g => { g.strokeStyle = C.line; g.globalAlpha = 0.22; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, R_BEZEL, 0, TAU); g.stroke();
      for (let i = 0; i < 72; i++) { const a = i * 5 * D2R, long = i % 6 === 0; g.globalAlpha = long ? 0.35 : 0.2; g.lineWidth = long ? 1.2 : 0.8; const r2 = R_BEZEL + (long ? 7 : 3);
        g.beginPath(); g.moveTo(Math.cos(a) * R_BEZEL, Math.sin(a) * R_BEZEL); g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); g.stroke(); } });
    const sr = mulberry32(777), starCol = cc.stars;
    s.stars1 = this.makeSprite(560, g => { g.fillStyle = starCol; for (let i = 0; i < 110; i++) { g.globalAlpha = 0.2 + sr() * 0.3; const a = sr() * TAU, r = 30 + sr() * 250; g.fillRect(Math.cos(a) * r, Math.sin(a) * r, 0.9, 0.9); } });
    s.stars2 = this.makeSprite(560, g => { g.fillStyle = starCol;
      for (let i = 0; i < 35; i++) { g.globalAlpha = 0.4 + sr() * 0.4; const a = sr() * TAU, r = 60 + sr() * 210; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 0.75, 0, TAU); g.fill(); }
      for (let k = 0; k < 3; k++) { const a0 = k * 2.1 + sr(), r0 = 200 + sr() * 50, cx = Math.cos(a0) * r0, cy = Math.sin(a0) * r0;
        g.strokeStyle = starCol; g.globalAlpha = 0.08; g.lineWidth = 0.75; g.beginPath(); const pts = [];
        for (let j = 0; j < 5; j++) { const x = cx + (sr() - 0.5) * 45, y = cy + (sr() - 0.5) * 45; pts.push(x, y); g.lineTo(x, y); } g.stroke();
        g.globalAlpha = 0.7; for (let j = 0; j < 10; j += 2) { g.beginPath(); g.arc(pts[j], pts[j + 1], 0.9, 0, TAU); g.fill(); } } });
  }
  buildBg() {
    const bg = this.bg = document.createElement('canvas'); bg.width = this.cv.width; bg.height = this.cv.height;
    const g = bg.getContext('2d'), d = this.dpr, cx = this.Cx * d, cy = this.Cy * d, R = 300 * this.S * d;
    g.fillStyle = C.bg; g.fillRect(0, 0, bg.width, bg.height);
    const tint = this.core === 'zenith' ? '#1E2A5A' : CORES[this.core].bg;
    const rgb = [1, 3, 5].map(i => parseInt(tint.slice(i, i + 2), 16)).join(',');
    let gr = g.createRadialGradient(cx, cy, 0, cx, cy, R); gr.addColorStop(0, `rgba(${rgb},0.30)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, bg.width, bg.height);
    gr = g.createRadialGradient(cx, cy, Math.min(bg.width, bg.height) * 0.35, cx, cy, Math.max(bg.width, bg.height) * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = gr; g.fillRect(0, 0, bg.width, bg.height);
    // halo radial « palier » (teinte .14 → .22) : sprite séparé dessiné en plus avec un alpha variable
    this.bgPulseSpr = this.glowDot(this.core === 'zenith' ? '#3B4C9A' : CORES[this.core].bg, 300, 0.5);
  }
  setCore(id) { if (id !== this.core) { this.core = id; if (this.W) { this.buildSprites(); this.buildBg(); } } }
  setTrail(id) { if (id !== this.trailId) { this.trailId = id; if (this.W) this.buildSprites(); } }

  // ------------------------------------------------------------ effets
  spark(x, y, vx, vy, life, col) { const P = this.P; if (P.n >= this.maxP) return; const i = P.n++; P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.l[i] = life; P.m[i] = life; P.c[i] = col; }
  burst(x, y, n, v0, v1, life, col) {
    n = Math.round(n * (this.reduced ? 0.5 : 1) * (this.quality >= 2 ? 0.4 : this.quality === 1 ? 0.7 : 1));
    for (let i = 0; i < n; i++) { const a = this.rnd() * TAU, v = v0 + (v1 - v0) * this.rnd(); this.spark(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.7 + 0.4 * this.rnd()), col); }
  }
  ring(x, y, r0, r1, life, col, w) {
    let o = this.rings[0]; for (const r of this.rings) { if (!r.on) { o = r; break; } if (r.l < o.l) o = r; }
    o.on = true; o.x = x; o.y = y; o.r0 = r0; o.r1 = r1; o.l = life; o.m = life; o.col = col; o.w = w;
  }
  text(x, y, s, col, size, life) {
    let o = this.texts[0]; for (const t of this.texts) { if (!t.on) { o = t; break; } if (t.l < o.l) o = t; }
    let stack = 0; for (const t of this.texts) if (t.on && t !== o && Math.abs(t.x - x) < 40 && Math.abs(t.y - y) < 40) stack++;
    o.on = true; o.x = x; o.y = y - stack * 14; o.s = s; o.col = col; o.size = size; o.l = life; o.m = life;
  }
  shake(a) { if (!this.reduced) this.trauma = Math.min(1, this.trauma + a); }
  onStep(sim) {
    if (++this.trailTick % 2 !== 0 || sim.dead) return;
    this.trail[this.trailI * 2] = sim.px; this.trail[this.trailI * 2 + 1] = sim.py; this.trailI = (this.trailI + 1) % 36; this.trailN = Math.min(36, this.trailN + 1);
  }
  onEvent(e, sim) {
    const a = this.ann;
    switch (e.type) {
      case EV.FLIP: { const th = sim.th, tx = -Math.sin(th) * -sim.dir, ty = Math.cos(th) * -sim.dir;
        for (let i = 0; i < 4; i++) { const v = 60 + 60 * this.rnd(); this.spark(e.x, e.y, tx * v + (this.rnd() - 0.5) * 60, ty * v + (this.rnd() - 0.5) * 60, 0.15, 1); } break; }
      case EV.GRAZE: this.burst(e.x, e.y, 5, 80, 160, 0.2, 0); this.pipPop = 0.12; break;
      case EV.PERFECT: this.burst(e.x, e.y, 10, 80, 160, 0.2, 0); this.ring(sim.px, sim.py, 6, 26, 0.25, C.or, 1.5); this.text(sim.px, sim.py - 14, 'PARFAIT', C.or, 12, 0.5); this.pipPop = 0.12; break;
      case EV.TIER_UP: if (e.a < 6) a.pop(e.a); this.flashBezel = 0.3; this.flashCol = MULT_COL[e.a]; break;
      case EV.TIER_DOWN: this.tierDownT = 0; break;
      case EV.SURCHARGE: a.push(BANNER.SUR, '×16', 'SURCHARGE', 1.2); this.flashBezel = 0.3; this.flashCol = C.or; break;
      case EV.PHOTON: this.burst(e.x, e.y, 8, 40, 120, 0.3, 0); this.ring(e.x, e.y, 4, 18, 0.25, C.or, 1.2); this.text(e.x, e.y - 10, '+' + e.a, C.or, 10, 0.45); break;
      case EV.RESONANCE: { this.ring(e.x, e.y, 13, 60, 0.4, C.menthe, 2); this.burst(e.x, e.y, 10, 40, 140, 0.4, 3); a.push(BANNER.RES, 'RÉSONANCE', RESONANCES[e.s].name + ' ' + ROMAN[e.a], 1.0);
        const o = sim.orbs[0].on ? sim.orbs[0] : sim.orbs[1]; break; }
      case EV.PALIER: { const P = palierParams(e.a); a.push(BANNER.PALIER, 'PALIER ' + e.a, P.name, 1.4); this.flashBezel = 0.3; this.flashCol = C.or; this.bgPulse = 0.8; this.camDir = -this.camDir; this.shake(0.15); break; }
      case EV.PHASE: a.push(BANNER.PHASE, 'NOYAU ' + CORES[sim.core].name, 'PHASE ' + ROMAN[e.a], 1.2); this.phaseT = 0; this.coreGrowT = 0; this.ring(0, 0, 30, 180, 0.6, this.coreCol(sim.real), 2); this.borderFlash = 0.3; this.shake(0.3);
        for (let i = 0; i < 24; i++) { const ang = i / 24 * TAU, v = 90 + 60 * this.rnd(); this.spark(Math.cos(ang) * 26, Math.sin(ang) * 26, Math.cos(ang + 0.6) * v, Math.sin(ang + 0.6) * v, 0.6, 4); } break;
      case EV.NEW_PALIER: a.push(BANNER.NEWPAL, 'NOUVEAU', 'PALIER ' + e.a, 1.2); break;
      case EV.RECORD: a.push(BANNER.RECORD, 'NOUVEAU', 'RECORD !', 1.2); this.recordMarkBurst = true; break;
      case EV.SHIELD: this.ring(e.x, e.y, 10, 70, 0.5, C.menthe, 2); this.burst(e.x, e.y, 12, 60, 200, 0.4, 3); this.shake(0.4); this.chroma = this.reduced ? 0 : 0.2; this.shieldBreakT = 0; break;
      case EV.DEATH: this.burst(e.x, e.y, 40, 80, 360, 0.8, 1); this.burst(e.x, e.y, 10, 80, 300, 0.6, 2); this.ring(e.x, e.y, 4, 60, 0.5, C.ivoire, 2); this.ring(e.x, e.y, 4, 110, 0.7, C.ivoire, 1); this.shake(0.6); this.chroma = this.reduced ? 0 : 0.35; break;
      case EV.TUTO: break;
      case EV.START: a.push(BANNER.PALIER, 'PALIER 1', palierParams(1).name, 1.4); break;
    }
  }
  // dt monde (effets), rdt réel (UI)
  update(dt, rdt) {
    const P = this.P;
    for (let i = P.n - 1; i >= 0; i--) {
      P.l[i] -= dt;
      if (P.l[i] <= 0) { const j = --P.n; P.x[i] = P.x[j]; P.y[i] = P.y[j]; P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]; P.l[i] = P.l[j]; P.m[i] = P.m[j]; P.c[i] = P.c[j]; continue; }
      const k = Math.exp(-4 * dt); P.vx[i] *= k; P.vy[i] *= k; P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
    }
    for (const r of this.rings) if (r.on) { r.l -= dt; if (r.l <= 0) r.on = false; }
    for (const t of this.texts) if (t.on) { t.l -= rdt; if (t.l <= 0) t.on = false; }
    this.trauma = Math.max(0, this.trauma - 1.8 * rdt); this.flashBezel -= rdt; this.bgPulse -= rdt; this.chroma -= rdt; this.borderFlash -= rdt;
    this.phaseT += rdt; this.coreGrowT += rdt; this.pipPop -= rdt; this.tierDownT += rdt; this.shieldBreakT += rdt; this.kick -= rdt;
    this.ann.update(rdt);
  }

  // ------------------------------------------------------------ transformations monde
  setWorld() {
    const z = this.zoom, k = this.S * this.dpr, co = Math.cos(this.cam), si = Math.sin(this.cam);
    const tr = this.trauma * this.trauma * 6 * this.MS, t = this.tNow;
    const shx = tr * (Math.sin(t * 26 * 6.1) + Math.sin(t * 26 * 3.7)) * 0.5 * this.S, shy = tr * (Math.sin(t * 26 * 5.3 + 1) + Math.sin(t * 26 * 2.9)) * 0.5 * this.S;
    const px = (1 - z) * this.zx, py = (1 - z) * this.zy;
    this.WA = k * z * co; this.WB = k * z * si; this.WC = -k * z * si; this.WD = k * z * co;
    this.WE = (this.Cx + shx) * this.dpr + k * (co * px - si * py); this.WF = (this.Cy + shy) * this.dpr + k * (si * px + co * py);
    this.ctx.setTransform(this.WA, this.WB, this.WC, this.WD, this.WE, this.WF);
  }
  local(x, y, a) { const c = Math.cos(a), s = Math.sin(a); this.ctx.setTransform(this.WA * c + this.WC * s, this.WB * c + this.WD * s, -this.WA * s + this.WC * c, -this.WB * s + this.WD * c, this.WA * x + this.WC * y + this.WE, this.WB * x + this.WD * y + this.WF); }
  blit(sp, x, y, a, scale) { const s = sp.s * (scale || 1); if (a) { this.local(x, y, a); this.ctx.drawImage(sp.c, -s / 2, -s / 2, s, s); this.setWorld(); } else this.ctx.drawImage(sp.c, x - s / 2, y - s / 2, s, s); }
  toScreenX(x, y) { return (this.WA * x + this.WC * y + this.WE) / this.dpr; }
  toScreenY(x, y) { return (this.WB * x + this.WD * y + this.WF) / this.dpr; }

  // ------------------------------------------------------------ rendu principal
  // ui : { alpha, charge, countdown, menu, best, goal, now (s), tut, holdMs }
  drawGame(sim, ui) {
    const ctx = this.ctx, a = ui.alpha === undefined ? 1 : ui.alpha;
    this.tNow = ui.now;
    const T = sim.T - (1 - a) * STEP * sim.tsWorld;
    const th = sim.prevTh + (sim.th - sim.prevTh) * a, r = sim.prevR + (sim.r - sim.prevR) * a;
    const x = r * Math.cos(th), y = r * Math.sin(th);
    this.px = x; this.py = y; this.pr = r; this.pth = th;
    // caméra : rotation 6°/s dès le palier 3 (sens inversé à chaque palier), zoom de mort
    if (!ui.frozen) this.cam += (sim.palier >= 3 && !this.reduced && !sim.dead ? 6 * D2R * this.camDir : 0) * (ui.rdt || 0);
    const dz = sim.dead && !this.reduced ? Math.min(1, sim.deadT / 0.5) : 0;
    this.zoom = 1 + 0.3 * (1 - (1 - dz) * (1 - dz)); this.zx = x; this.zy = y;
    if (!this.reduced && this.kick > 0) this.zoom *= 1 + 0.012 * Math.sin((1 - this.kick / 0.08) * Math.PI);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.bg, 0, 0);
    this.setWorld();
    // 2. étoiles (2 couches tournantes)
    const rm = this.reduced ? 0.3 : 1, sp = this.spr;
    if (this.bgPulse > 0) { ctx.globalAlpha = 0.6 * Math.sin(Math.min(1, this.bgPulse / 0.8) * Math.PI); this.blit(sp.bgPulse || this.bgPulseSpr, 0, 0); ctx.globalAlpha = 1; }
    this.local(0, 0, ui.now * 1.5 * D2R * rm); ctx.drawImage(sp.stars1.c, -280, -280, 560, 560);
    if (this.quality < 2) { this.local(0, 0, -ui.now * 3 * D2R * rm); ctx.drawImage(sp.stars2.c, -280, -280, 560, 560); }
    this.setWorld();
    // 3. lunette + jauge de palier + marque record
    ctx.drawImage(sp.bezel.c, -183, -183, 366, 366);
    if (!ui.menu) this.drawGauge(sim, ui);
    // 4. orbites
    const trans = Math.abs(r - R_INT) > 1 && Math.abs(r - R_EXT) > 1;
    ctx.strokeStyle = C.line; ctx.lineCap = 'butt';
    for (let l = 0; l < 2; l++) {
      const R = l ? R_EXT : R_INT; ctx.globalAlpha = trans ? 0.38 : ((r > R_MID ? 1 : 0) === l ? 0.55 : 0.18);
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 12; i++) { const an = i * 30 * D2R, c = Math.cos(an), s = Math.sin(an); ctx.moveTo(c * (R - 3), s * (R - 3)); ctx.lineTo(c * (R + 3), s * (R + 3)); } ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 5. télégraphes
    const hz = sim.hz;
    for (let i = 0; i < hz.length; i++) if (T < hz[i].ta && T >= hz[i].t0) this.drawTel(hz[i], T);
    // 6. noyau (halo lighter puis dessin)
    const ccol = this.coreCol(ui.now);
    ctx.globalCompositeOperation = 'lighter'; this.blit(sp.coreHalo, 0, 0); ctx.globalCompositeOperation = 'source-over';
    let br = 1 + (this.reduced ? 0 : 0.04 * Math.max(0, this.kick / 0.08));
    if (this.coreGrowT < 0.5) { const k = this.coreGrowT / 0.5, c1 = 1.70158; br *= 0.6 + 0.4 * (1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)); }
    drawCore(ctx, sim.core, sim.P.phase, ui.now, br, ccol, this.core === 'zenith' ? '#FFFFFF' : CORES[sim.core].acc);
    // 7. Photons, orbes
    for (const p of sim.photons) if (p.on) this.drawPhoton(p, T, ui.now);
    ctx.globalAlpha = 1;
    if (!ui.menu) for (const o of sim.orbs) if (o.on) this.drawOrbe(o, T);
    // 8. particules, anneaux (lighter, groupées par couleur)
    this.drawParticles(ccol);
    // 9. sillage + halo joueur
    if (!sim.dead || sim.deadT < 0.1) this.drawPlayerGlow(sim, ui);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // 10. dangers actifs
    for (let i = 0; i < hz.length; i++) if (T >= hz[i].ta) this.drawHz(hz[i], T, ui.now);
    // 11. chevron + cœur du joueur
    if (!sim.dead || sim.deadT < 0.1) this.drawPlayerCore(sim, ui);
    if (!ui.menu) for (const o of sim.orbs) if (o.on) this.drawOrbeLabel(o, T);
    // mort : voile de désaturation, puis le danger fautif et le joueur par-dessus
    if (sim.dead) this.drawDeath(sim, T, ui);
    if (this.debug && !ui.menu) this.drawDebug(sim, T);
    // 12. textes flottants, bannières (espace écran)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.globalAlpha = 1;
    if (ui.menu) { ctx.globalAlpha = 0.5; ctx.fillStyle = C.bg; ctx.fillRect(0, 0, this.W, this.H); ctx.globalAlpha = 1; return; }
    this.drawTexts();
    this.drawBand(sim, ui);
    // 13. voiles / bordures
    this.drawBorders(sim, ui);
    // 14. HUD
    if (!ui.noHud) this.drawHUD(sim, ui);
  }

  drawGauge(sim, ui) {
    const ctx = this.ctx, off = sim.core === 'zenith' ? ZENITH_OFFSET : 0, t = sim.chrono + off;
    const p0 = palierParams(sim.palier).start, p1 = palierParams(sim.palier + 1).start, prog = sim.tut ? 0 : clamp((t - p0) / (p1 - p0), 0, 1);
    const fl = this.flashBezel > 0 ? this.flashBezel / 0.3 : 0;
    ctx.strokeStyle = C.or; ctx.lineCap = 'butt';
    if (fl > 0 && !this.reduced) { ctx.globalAlpha = 0.8 + 0.2 * fl; ctx.lineWidth = 5; ctx.strokeStyle = this.flashCol; ctx.beginPath(); ctx.arc(0, 0, R_BEZEL, 0, TAU); ctx.stroke(); ctx.strokeStyle = C.or; }
    ctx.globalAlpha = 0.8; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, R_BEZEL, -Math.PI / 2, -Math.PI / 2 + prog * TAU); ctx.stroke();
    const best = (ui.best || 0) + off;
    if (ui.best > 0 && best > p0 && best < p1 && sim.chrono < ui.best) {
      const an = -Math.PI / 2 + (best - p0) / (p1 - p0) * TAU;
      this.local(Math.cos(an) * 176, Math.sin(an) * 176, an); ctx.fillStyle = C.or; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, -3.5); ctx.lineTo(3, 3.5); ctx.closePath(); ctx.fill(); this.setWorld();
      this.recordAngle = an;
    }
    if (this.recordMarkBurst) { this.recordMarkBurst = false; const an = this.recordAngle || -Math.PI / 2; this.burst(Math.cos(an) * 176, Math.sin(an) * 176, 6, 40, 120, 0.4, 0); }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ dangers
  rayPts(a, r0, r1) { const c = Math.cos(a), s = Math.sin(a), ctx = this.ctx; ctx.beginPath(); ctx.moveTo(c * r0, s * r0); ctx.lineTo(c * r1, s * r1); }
  arcPath(rho, h, rot) {
    const ctx = this.ctx; ctx.beginPath();
    if (h.gn === 1) { const g = h.g0 + rot; ctx.arc(0, 0, rho, g + h.gw / 2, g - h.gw / 2 + TAU); return; }
    // brèches multiples (mêmes largeurs, triées par angle croissant)
    for (let i = 0; i < h.gn; i++) {
      const g = gapAt(h, i) + rot; let next = Infinity;
      for (let j = 0; j < h.gn; j++) { if (j === i) continue; let d = gapAt(h, j) - gapAt(h, i); d = ((d % TAU) + TAU) % TAU; if (d > 0 && d < next) next = d; }
      if (next === Infinity) next = TAU;
      const a0 = g + h.gw / 2, a1 = g + next - h.gw / 2; if (a1 > a0) { ctx.moveTo(Math.cos(a0) * rho, Math.sin(a0) * rho); ctx.arc(0, 0, rho, a0, a1); }
    }
  }
  drawTel(h, T) {
    const ctx = this.ctx, frozen = h.ta - h.t0 > 1e5, p = frozen ? 0.6 + 0.3 * Math.sin(this.tNow * 6) : clamp((T - h.t0) / (h.ta - h.t0), 0, 1);
    const blink = (hz) => this.reduced ? 0.75 + 0.25 * Math.sin(this.tNow * TAU * 1.5) : (Math.sin(this.tNow * TAU * hz) > 0 ? 1 : 0.35);
    ctx.strokeStyle = C.danger; ctx.fillStyle = C.danger; ctx.lineCap = 'butt';
    switch (h.k) {
      case K.RAY: {
        const armed = !frozen && h.ta - T < 0.12, e = EXTENTS[rayExt(h, 0)];
        ctx.globalAlpha = armed ? 0.9 : 0.35 + 0.55 * p; ctx.lineWidth = armed ? 3 : 1.5; ctx.setLineDash(armed ? NO_DASH : DASH_RAY);
        this.rayPts(h.a, e[0], e[1]); ctx.stroke(); ctx.setLineDash(NO_DASH);
        this.local(Math.cos(h.a) * (R_BEZEL + 4), Math.sin(h.a) * (R_BEZEL + 4), h.a); ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(4, -4); ctx.lineTo(0, 0); ctx.lineTo(4, 4); ctx.moveTo(8, -4); ctx.lineTo(4, 0); ctx.lineTo(8, 4); ctx.stroke(); this.setWorld(); break;
      }
      case K.ARC: {
        ctx.globalAlpha = 0.45; ctx.lineWidth = 2; ctx.setLineDash(DASH_ARC); this.arcPath(h.rho, h, 0); ctx.stroke(); ctx.setLineDash(NO_DASH);
        ctx.globalAlpha = 0.8; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let i = 0; i < h.gn; i++) for (let s = -1; s <= 1; s += 2) { const e = gapAt(h, i) + s * h.gw / 2, c = Math.cos(e), si = Math.sin(e); ctx.moveTo(c * (h.rho - 6), si * (h.rho - 6)); ctx.lineTo(c * (h.rho + 6), si * (h.rho + 6)); }
        ctx.stroke();
        // émission : le bord du noyau s'illumine sur la portion concernée (arc OUT)
        if (h.v > 0) { ctx.globalAlpha = 0.6 * p; ctx.lineWidth = 3; this.arcPath(R_CORE + 1, h, 0); ctx.stroke(); }
        break;
      }
      case K.ECL: {
        if (h.v > 0) { ctx.globalAlpha = p; this.local(Math.cos(h.a) * (R_EMIT - 2), Math.sin(h.a) * (R_EMIT - 2), h.a); ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(0, -3); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill(); this.setWorld(); }
        else { ctx.globalAlpha = blink(10); this.local(Math.cos(h.a) * (R_BEZEL + 6), Math.sin(h.a) * (R_BEZEL + 6), h.a); ctx.beginPath(); ctx.moveTo(-3.5, 0); ctx.lineTo(3.5, -3.5); ctx.lineTo(3.5, 3.5); ctx.closePath(); ctx.fill(); this.setWorld(); }
        break;
      }
      case K.ORB: {
        ctx.globalAlpha = this.reduced ? 0.3 + 0.5 * p : 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(this.tNow * TAU * 8)); ctx.lineWidth = 3; ctx.setLineDash(DASH_ORB);
        const full = h.sw >= TAU - 1e-6; ctx.beginPath(); if (full) ctx.arc(0, 0, h.R, 0, TAU); else ctx.arc(0, 0, h.R, h.sc - h.sw / 2, h.sc + h.sw / 2); ctx.stroke(); ctx.setLineDash(NO_DASH);
        // 4 chevrons sur l'orbite, pointant hors de celle-ci
        ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85; ctx.beginPath();
        for (let i = 0; i < 4; i++) { const an = full ? i * Math.PI / 2 + 0.4 : h.sc + (i - 1.5) * h.sw / 4, c = Math.cos(an), s = Math.sin(an), tx = -s, ty = c;
          for (const sg of [-1, 1]) { const bx = c * (h.R + sg * 6), by = s * (h.R + sg * 6); ctx.moveTo(bx - tx * 3 - c * sg * 3, by - ty * 3 - s * sg * 3); ctx.lineTo(bx, by); ctx.lineTo(bx + tx * 3 - c * sg * 3, by + ty * 3 - s * sg * 3); } }
        ctx.stroke(); break;
      }
      case K.SAT: {
        const x = h.R * Math.cos(h.a), y = h.R * Math.sin(h.a); ctx.globalAlpha = 0.4; ctx.fillStyle = C.dsomb;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill(); ctx.globalAlpha = 0.45 + 0.45 * p; ctx.lineWidth = 1.5; ctx.setLineDash(DASH_SAT); ctx.stroke(); ctx.setLineDash(NO_DASH);
        const sg = h.ws >= 0 ? 1 : -1, a1 = h.a + sg * 14 / h.R, a2 = h.a + sg * 44 / h.R;
        ctx.beginPath(); ctx.arc(0, 0, h.R, Math.min(a1, a2), Math.max(a1, a2)); ctx.stroke();
        this.local(h.R * Math.cos(a2), h.R * Math.sin(a2), a2 + sg * Math.PI / 2); ctx.beginPath(); ctx.moveTo(-4, -3.5); ctx.lineTo(0, 0); ctx.lineTo(-4, 3.5); ctx.stroke(); this.setWorld(); break;
      }
      case K.MIN: {
        const x = h.R * Math.cos(h.a), y = h.R * Math.sin(h.a), s = 8 * p; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.5; ctx.setLineDash(DASH_SAT);
        ctx.beginPath(); ctx.moveTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.lineTo(x, y - s); ctx.closePath(); ctx.stroke(); ctx.setLineDash(NO_DASH); break;
      }
    }
    ctx.globalAlpha = 1;
  }
  drawHz(h, T, t) {
    const ctx = this.ctx, u = T - h.ta; ctx.lineCap = 'butt';
    let fade = 1; if (T > h.he) fade = clamp(1 - (T - h.he) / 0.12, 0, 1); if (fade <= 0 && h.k !== K.RAY) return;
    switch (h.k) {
      case K.RAY: {
        let w = 12 * Math.min(1, u / 0.04); if (T > h.he) w *= clamp((h.te - T) / 0.08, 0, 1); if (w <= 0) return;
        w *= 1 + (this.reduced ? 0 : 0.08 * Math.sin(t * TAU * 30));
        const an = h.a + h.wb * u, e = EXTENTS[rayExt(h, u)];
        ctx.strokeStyle = C.danger; ctx.globalAlpha = 0.28; ctx.lineWidth = w * 2.2; this.rayPts(an, e[0], e[1]); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = w; ctx.stroke(); ctx.strokeStyle = C.dhot; ctx.lineWidth = w / 3; ctx.stroke();
        // R9 : la moitié qui va s'allumer clignote en pointillés 0,3 s avant le changement d'extent
        if (h.alt) { const nx = (Math.floor(u / h.alt) + 1) * h.alt; if (nx - u < 0.3 && T + (nx - u) < h.he) { const e2 = EXTENTS[rayExt(h, nx + 0.001)]; ctx.strokeStyle = C.danger; ctx.globalAlpha = this.reduced ? 0.6 : (Math.sin(t * TAU * 10) > 0 ? 0.9 : 0.3); ctx.lineWidth = 2; ctx.setLineDash(DASH_RAY); this.rayPts(an, e2[0], e2[1]); ctx.stroke(); ctx.setLineDash(NO_DASH); } }
        break;
      }
      case K.ARC: {
        const rho = h.rho + h.v * u; if (rho < 28 || rho > R_KILL) return;
        ctx.lineCap = 'round'; this.arcPath(rho, h, h.wg * u);
        ctx.strokeStyle = C.danger; if (this.quality < 2) { ctx.globalAlpha = 0.22; ctx.lineWidth = 18; ctx.stroke(); }
        ctx.globalAlpha = 1; ctx.lineWidth = 10; ctx.stroke(); ctx.strokeStyle = C.dhot; ctx.lineWidth = 3; ctx.stroke(); break;
      }
      case K.ECL: {
        const rho = h.rho + h.v * u; if (rho > R_KILL || rho < 30) return; const an = h.a + h.wa * u;
        const dir = an + Math.atan2(rho * h.wa, h.v); this.blit(this.spr.ecl, rho * Math.cos(an), rho * Math.sin(an), dir); break;
      }
      case K.ORB: {
        const full = h.sw >= TAU - 1e-6; ctx.strokeStyle = C.danger; ctx.globalAlpha = 0.25 * fade; ctx.lineWidth = 16; ctx.beginPath();
        if (full) ctx.arc(0, 0, h.R, 0, TAU); else ctx.arc(0, 0, h.R, h.sc - h.sw / 2, h.sc + h.sw / 2); ctx.stroke();
        ctx.globalAlpha = fade * (1 - (this.reduced ? 0 : 0.1 * Math.sin(t * TAU * 20))); ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = C.dhot; ctx.lineWidth = 2; ctx.stroke(); break;
      }
      case K.SAT: {
        const an = h.a + h.ws * u; ctx.fillStyle = C.danger;
        for (let k = 4; k >= 1; k--) { const b = an - h.ws * k * 0.03; ctx.globalAlpha = 0.4 * (1 - k / 5) * fade; ctx.beginPath(); ctx.arc(h.R * Math.cos(b), h.R * Math.sin(b), 7 - k, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = fade; this.blit(this.spr.sat, h.R * Math.cos(an), h.R * Math.sin(an), t * TAU); break;
      }
      case K.MIN: {
        ctx.globalAlpha = fade; const sc = 1 + (this.reduced ? 0 : 0.05 + 0.05 * Math.sin(t * TAU * 3));
        this.blit(this.spr.mine, h.R * Math.cos(h.a), h.R * Math.sin(h.a), 0, sc); break;
      }
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ ramassables
  drawPhoton(p, T, t) {
    const ctx = this.ctx, px = p.R * Math.cos(p.th), py = p.R * Math.sin(p.th), age = T - p.t0;
    const k = Math.min(1, age / 0.2), c1 = 1.70158, sc = Math.max(0.01, 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2));
    ctx.globalAlpha = age > 3 ? (this.reduced ? 0.5 + 0.5 * Math.sin(t * TAU * 2) : (Math.sin(age * TAU * 8) > 0 ? 1 : 0.3)) : 0.75 + 0.25 * Math.sin(t * TAU * 6 + p.th * 7);
    ctx.globalCompositeOperation = 'lighter'; this.blit(this.spr.photonHalo, px, py, 0, sc); ctx.globalCompositeOperation = 'source-over';
    this.blit(this.spr.photon, px, py, t * 120 * D2R, sc);
  }
  drawOrbe(o, T) {
    const ctx = this.ctx, x = o.R * Math.cos(o.th), y = o.R * Math.sin(o.th), age = T - o.t0;
    if (age < 0.4) { ctx.strokeStyle = C.menthe; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5; ctx.setLineDash(DASH_SAT); ctx.beginPath(); ctx.arc(x, y, 13 + (1 - age / 0.4) * 20, 0, TAU); ctx.stroke(); ctx.setLineDash(NO_DASH); ctx.globalAlpha = 1; return; }
    if (age > 2.4) ctx.globalAlpha = this.reduced ? 0.6 + 0.4 * Math.sin(this.tNow * TAU * 2) : (Math.sin(age * TAU * 8) > 0 ? 1 : 0.4);
    const ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; this.blit(this.spr.resHalo, x, y); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(8,12,26,0.85)'; ctx.strokeStyle = C.menthe; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.astre; ctx.fillStyle = C.astre; ctx.lineWidth = 1.5;
    drawResIcon(ctx, o.id, x, y, 1);
    ctx.globalAlpha = 1;
  }
  // libellés des orbes : passe séparée APRÈS les dangers (jamais masqués par un arc ou un rayon)
  drawOrbeLabel(o, T) {
    const ctx = this.ctx, age = T - o.t0; if (age < 0.4) return;
    const ga = age > 2.4 ? (this.reduced ? 0.6 + 0.4 * Math.sin(this.tNow * TAU * 2) : (Math.sin(age * TAU * 8) > 0 ? 1 : 0.4)) : 1;
    // libellé : côté extérieur pour EXT, intérieur pour INT (jamais superposés)
    const lr = o.R === R_EXT ? o.R + 26 : o.R - 26, sx = this.toScreenX(lr * Math.cos(o.th), lr * Math.sin(o.th)), sy = this.toScreenY(lr * Math.cos(o.th), lr * Math.sin(o.th));
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.font = `800 9px ${F_UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const name = RESONANCES[o.id].name, tw = ctx.measureText(name).width + 10; ctx.globalAlpha = ga;
    ctx.fillStyle = 'rgba(8,12,26,0.85)'; rrect(ctx, sx - tw / 2, sy - 7, tw, 14, 7); ctx.fill();
    ctx.fillStyle = C.menthe; ctx.fillText(name, sx, sy + 0.5); this.setWorld(); ctx.globalAlpha = 1;
  }
  drawParticles(ccol) {
    const ctx = this.ctx, P = this.P;
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.9;
    for (let c = 0; c < 5; c++) {
      ctx.strokeStyle = c === 0 ? C.or : c === 1 ? C.ivoire : c === 2 ? C.astre : c === 3 ? C.menthe : ccol;
      ctx.beginPath(); let any = false;
      for (let i = 0; i < P.n; i++) { if (P.c[i] !== c) continue; any = true; const x = P.x[i], y = P.y[i]; ctx.moveTo(x, y); ctx.lineTo(x - P.vx[i] * 0.03, y - P.vy[i] * 0.03); }
      if (any) ctx.stroke();
    }
    for (const r of this.rings) if (r.on) { const k = 1 - r.l / r.m, e = 1 - (1 - k) * (1 - k); ctx.strokeStyle = r.col; ctx.globalAlpha = 1 - k; ctx.lineWidth = r.w; ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, TAU); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ joueur
  trailColor(sim, k) {
    if (sim.sur > 0) return C.or;
    const tr = TRAILS.find(x => x.id === this.trailId) || TRAILS[0];
    if (tr.id === 'prisme') return ZENITH_COLS[(zenithIndex(this.tNow) + k * 2) & 63];
    if (tr.id === 'aurore') return k < 9 ? tr.col : tr.col2;
    if (tr.id === 'eclipse') return '#FFFFFF';
    return tr.col;
  }
  drawPlayerGlow(sim, ui) {
    const ctx = this.ctx, x = this.px, y = this.py, sur = sim.sur > 0;
    const inv = sim.inv > 0 && (this.reduced ? Math.sin(this.tNow * TAU * 2) > -0.2 : Math.sin(this.tNow * TAU * 12) > 0);
    if (inv) return;
    const tr = TRAILS.find(t => t.id === this.trailId) || TRAILS[0], ecl = tr.id === 'eclipse' && !sur;
    ctx.globalCompositeOperation = ecl ? 'source-over' : 'lighter'; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    let px = x, py = y; const long = sur || tr.long || sim.slowScale < 1 && sim.slowT > 0, n = long ? this.trailN : Math.min(this.trailN, 18);
    for (let k = 0; k < n; k++) {
      const i = (this.trailI - 1 - k + 36) % 36, qx = this.trail[i * 2], qy = this.trail[i * 2 + 1], f = 1 - k / n;
      ctx.strokeStyle = ecl ? '#0A0C14' : this.trailColor(sim, k); ctx.globalAlpha = (ecl ? 0.9 : 0.6) * f; ctx.lineWidth = 0.5 + 4.5 * f;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
      if (ecl) { ctx.strokeStyle = '#FFFFFF'; ctx.globalAlpha = 0.35 * f; ctx.lineWidth = 0.6; ctx.stroke(); }
      px = qx; py = qy;
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1; this.blit(sur ? this.spr.haloOr : this.spr.haloTrail, x, y, 0, this.pr > R_MID ? 25 / 22 : 1);
    // traits de vitesse pendant la transition radiale (seuls traits radiaux autorisés)
    const tgt = sim.lane ? R_EXT : R_INT;
    if (Math.abs(this.pr - tgt) > 1) {
      const sgn = sim.lane ? -1 : 1, c = Math.cos(this.pth), s = Math.sin(this.pth);
      ctx.strokeStyle = C.ivoire; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = -1; k <= 1; k++) { const ox = -s * k * 4, oy = c * k * 4; ctx.moveTo(x + ox + c * sgn * 6, y + oy + s * sgn * 6); ctx.lineTo(x + ox + c * sgn * 12, y + oy + s * sgn * 12); }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  drawPlayerCore(sim, ui) {
    const ctx = this.ctx, x = this.px, y = this.py;
    // bouclier disponible : hexagone menthe tournant
    if (sim.shield > 0) { this.local(x, y, this.tNow * 90 * D2R); ctx.strokeStyle = C.menthe; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10); } ctx.closePath(); ctx.stroke(); this.setWorld(); }
    if (this.shieldBreakT < 0.4) { const k = this.shieldBreakT / 0.4; ctx.strokeStyle = C.menthe; ctx.globalAlpha = 1 - k; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + k * 2, d = 10 + 30 * k, b = a + TAU / 6; ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d); ctx.lineTo(x + Math.cos(a) * d + (Math.cos(b) - Math.cos(a)) * 8, y + Math.sin(a) * d + (Math.sin(b) - Math.sin(a)) * 8); } ctx.stroke(); }
    // chevron de direction (tangent), pop 1,4 → 1 au demi-tour
    const pop = 1 + 0.4 * clamp(1 - (sim.real - sim.flipT) / 0.09, 0, 1) * this.MS, ta = this.pth + sim.dir * Math.PI / 2;
    this.local(x + Math.cos(ta) * 11, y + Math.sin(ta) * 11, ta); ctx.strokeStyle = C.ivoire; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(-2.5 * pop, -3 * pop); ctx.lineTo(1.5 * pop, 0); ctx.lineTo(-2.5 * pop, 3 * pop); ctx.stroke(); this.setWorld();
    // anneau de charge (doigt posé, pas encore maintien) ; flash au maintien
    if (ui.charge >= 0) { ctx.strokeStyle = C.ivoire; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 11, -Math.PI / 2, -Math.PI / 2 + Math.min(1, ui.charge) * TAU); ctx.stroke(); }
    const hf = (sim.real - sim.holdT) / 0.12; if (hf >= 0 && hf < 1) { ctx.strokeStyle = C.ivoire; ctx.globalAlpha = 0.7 * (1 - hf); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 11 + 7 * hf, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = C.astre; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
  }
  drawDeath(sim, T, ui) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = Math.min(0.6, sim.deadT * 3); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.globalAlpha = 1; this.setWorld();
    const k = sim.killer; if (k) { const tt = Math.min(Math.max(T, k.ta), k.he - 0.001); this.drawHz(k, tt, this.tNow); }
    this.drawParticles(this.coreCol(this.tNow));
    if (this.chroma > 0 && !this.reduced) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; this.blit(this.spr.ghostR, this.px - 2, this.py); this.blit(this.spr.ghostB, this.px + 2, this.py); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    if (sim.deadT < 0.12) { ctx.fillStyle = C.astre; ctx.beginPath(); ctx.arc(this.px, this.py, 5, 0, TAU); ctx.fill(); }
  }
  drawDebug(sim, T) {
    const ctx = this.ctx; ctx.strokeStyle = '#00FF66'; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(this.px, this.py, 4, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ espace écran : textes, bande d'annonce, bordures
  drawTexts() {
    const ctx = this.ctx; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const o of this.texts) if (o.on) {
      const k = 1 - o.l / o.m, sx = this.toScreenX(o.x, o.y), sy = this.toScreenY(o.x, o.y);
      ctx.font = `800 ${o.size}px ${F_NUM}`; ctx.globalAlpha = k > 0.66 ? (1 - k) * 3 : 1; ctx.fillStyle = o.col;
      ctx.fillText(o.s, sx, sy - 16 * (1 - (1 - k) * (1 - k)));
    }
    ctx.globalAlpha = 1;
  }
  drawBand(sim, ui) {
    const ctx = this.ctx, A = this.ann, sx = this.W / 2, sy = this.bandY;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (ui.countdown > 0) { // reprise : 3-2-1 dans la bande d'annonce
      const n = Math.ceil(ui.countdown / 0.3); ctx.fillStyle = 'rgba(8,12,26,0.8)'; ctx.beginPath(); ctx.arc(sx, sy, 26, 0, TAU); ctx.fill();
      ctx.font = `800 32px ${F_NUM}`; ctx.fillStyle = C.ivoire; ctx.fillText(String(n), sx, sy + 1); return;
    }
    const occ = A.occupant();
    if (occ === 'banner' || occ === 'sticky') {
      const b = A.cur, k = b ? b.t : 0.5, dur = b ? b.dur : 9;
      const al = b ? (k < 0.15 ? k / 0.15 : k > dur - 0.25 ? Math.max(0, (dur - k) / 0.25) : 1) : 1;
      const sc = b && k < 0.15 && !this.reduced ? 1 + 0.3 * (1 - k / 0.15) : 1;
      const top = b ? b.a : 'TUTORIEL', main = b ? b.b : A.sticky;
      const col = !b ? C.ivoire : b.kind === BANNER.RES ? C.menthe : b.kind === BANNER.SUR || b.kind === BANNER.NEWPAL || b.kind === BANNER.RECORD ? C.or : C.ivoire;
      const size = main.length > 16 ? 16 : main.length > 11 ? 20 : 26;
      ctx.setTransform(this.dpr * sc, 0, 0, this.dpr * sc, sx * this.dpr, sy * this.dpr); ctx.globalAlpha = al;
      ctx.font = `800 ${size}px ${F_UI}`; setLS(ctx, size >= 26 ? '0.3em' : '0.12em');
      const w = Math.min(this.W - 24, Math.max(ctx.measureText(main).width + 36, 140));
      ctx.fillStyle = 'rgba(8,12,26,0.7)'; rrect(ctx, -w / 2, -26, w, 52, 14); ctx.fill();
      ctx.font = `800 10px ${F_UI}`; setLS(ctx, '0.14em'); ctx.fillStyle = C.mid; ctx.fillText(top, 0, -13);
      ctx.font = `800 ${size}px ${F_UI}`; setLS(ctx, size >= 26 ? '0.3em' : '0.12em'); ctx.fillStyle = col; ctx.fillText(main, 0, 8);
      setLS(ctx, '0px'); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.globalAlpha = 1; return;
    }
    if (occ === 'pop') {
      const k = A.popT / 0.6, sc = this.reduced ? 1 : k < 0.3 ? 0.5 + 0.7 * (k / 0.3) : 1.2 - 0.2 * Math.min(1, (k - 0.3) / 0.2);
      ctx.setTransform(this.dpr * sc, 0, 0, this.dpr * sc, sx * this.dpr, sy * this.dpr); ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.fillStyle = 'rgba(8,12,26,0.6)'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
      ctx.font = `800 36px ${F_NUM}`; ctx.fillStyle = MULT_COL[A.popTier]; ctx.fillText('×' + TIERS[A.popTier], 0, 2);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.globalAlpha = 1;
    }
  }
  drawBorders(sim, ui) {
    const ctx = this.ctx, W = this.W, H = this.H;
    if (sim.sur > 0) { ctx.globalAlpha = this.reduced ? 0.4 : 0.3 + 0.2 * Math.sin(this.tNow * TAU * 2); ctx.strokeStyle = C.or; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3); }
    if (sim.slowT > 0 && sim.slowScale === 0.35) { ctx.globalAlpha = 0.5; ctx.strokeStyle = C.menthe; ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, H - 4); }
    if (this.borderFlash > 0) { ctx.globalAlpha = this.reduced ? 0.4 : this.borderFlash / 0.3; ctx.strokeStyle = C.ivoire; ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, H - 4); }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ HUD §8 (px CSS, jamais tourné ni secoué)
  hudRects() { const top = this.safe.top + 8, R = this.colX + this.colW - 12 - this.safe.right; return { pause: { x: R - 48, y: top - 4, w: 48, h: 48 } }; }
  drawHUD(sim, ui) {
    const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.globalAlpha = 0.95;
    const L = this.colX + 12 + this.safe.left, R = this.colX + this.colW - 12 - this.safe.right, top = this.safe.top + 8, cx = (L + R) / 2;
    // pastilles sombres derrière les textes (lisibles au-dessus des dangers)
    ctx.fillStyle = 'rgba(8,12,26,0.72)';
    rrect(ctx, L - 6, top - 2, 92, 38, 8); ctx.fill();
    rrect(ctx, cx - 62, top - 4, 124, 52, 8); ctx.fill();
    // palier
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.font = `800 10px ${F_UI}`; ctx.fillStyle = C.lo; ctx.fillText(sim.tut ? 'TUTORIEL' : 'PALIER ' + sim.palier, L, top + 4);
    ctx.font = `800 13px ${F_UI}`; ctx.fillStyle = C.mid; ctx.fillText(sim.tut ? '—' : sim.P.name.length > 12 ? 'SINGUL. +' + (sim.palier - 10) : sim.P.name, L, top + 18);
    // chrono (ss.cc ou m:ss.cc), centièmes plus petits
    const tc = Math.floor(sim.chrono * 100);
    if (tc !== this.chronoVal) { this.chronoVal = tc; this.chronoStr = fmtTime(tc / 100); }
    const tt = this.chronoStr, cut = tt.length - 3;
    ctx.font = `800 32px ${F_NUM}`; const w1 = ctx.measureText(tt.slice(0, cut)).width; ctx.font = `800 20px ${F_NUM}`; const w2 = ctx.measureText(tt.slice(cut)).width;
    ctx.fillStyle = C.ivoire; ctx.font = `800 32px ${F_NUM}`; ctx.fillText(tt.slice(0, cut), cx - (w1 + w2) / 2, top);
    ctx.font = `800 20px ${F_NUM}`; ctx.fillText(tt.slice(cut), cx - (w1 + w2) / 2 + w1, top + 10);
    ctx.textAlign = 'center'; ctx.font = `600 10px ${F_NUM}`;
    if (ui.best > 0) {
      if (sim.chrono > ui.best && !sim.tut) { ctx.fillStyle = C.or; ctx.fillText('RECORD +' + (sim.chrono - ui.best).toFixed(1), cx, top + 36); }
      else { ctx.fillStyle = C.lo; ctx.fillText('REC ' + fmtTime(ui.best), cx, top + 36); }
    } else { ctx.fillStyle = C.lo; ctx.fillText('PREMIÈRE ORBITE', cx, top + 36); }
    // pause 48×48
    ctx.fillStyle = 'rgba(8,12,26,0.72)'; rrect(ctx, R - 48, top - 4, 48, 48, 8); ctx.fill();
    ctx.fillStyle = C.mid; ctx.fillRect(R - 30, top + 12, 4, 16); ctx.fillRect(R - 22, top + 12, 4, 16);
    // score (rattrape la valeur en ~0,25 s) + multiplicateur et pastilles
    this.scoreShown += (sim.score - this.scoreShown) * Math.min(1, (ui.rdt || 0.016) * 8);
    if (Math.abs(sim.score - this.scoreShown) < 1) this.scoreShown = sim.score;
    const sv = Math.round(this.scoreShown); if (sv !== this.scoreVal) { this.scoreVal = sv; this.scoreStr = fmtNum(sv); }
    const need = sim.tier < 6 ? sim.need(sim.tier) : 0, pipW = 9, pipsW = need ? need * pipW - 3 : 0;
    ctx.font = `800 22px ${F_NUM}`; const mw = ctx.measureText('×' + TIERS[sim.tier]).width;
    ctx.fillStyle = 'rgba(8,12,26,0.72)'; ctx.font = `700 16px ${F_NUM}`; const sw = ctx.measureText(this.scoreStr).width;
    rrect(ctx, L - 6, top + 54, sw + 12, 26, 8); ctx.fill(); rrect(ctx, R - pipsW - mw - 20, top + 52, pipsW + mw + 26, 30, 8); ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.hi; ctx.fillText(this.scoreStr, L, top + 67);
    const px0 = R - pipsW, pp = this.pipPop > 0 && !this.reduced ? 1 + 0.5 * this.pipPop / 0.12 : 1;
    for (let i = 0; i < need; i++) { const filled = i < sim.pips, s = filled && i === sim.pips - 1 ? 6 * pp : 6; ctx.fillStyle = filled ? MULT_COL[sim.tier] : C.bg3; ctx.fillRect(px0 + i * pipW + 3 - s / 2, top + 64 - s / 2 + 3, s, s); }
    const pulse = sim.tier >= 4 && !this.reduced ? 1 + 0.06 * Math.sin(this.tNow * TAU * (sim.tier >= 6 ? 2 : 1)) : 1;
    const drop = this.tierDownT < 0.25 && !this.reduced ? (1 - this.tierDownT / 0.25) * 5 : 0;
    ctx.textAlign = 'right'; ctx.font = `800 ${Math.round(22 * pulse)}px ${F_NUM}`; ctx.fillStyle = MULT_COL[sim.tier];
    ctx.fillText('×' + TIERS[sim.tier], px0 - 8, top + 67 + drop);
    if (sim.sur > 0) { ctx.fillStyle = C.bg3; ctx.fillRect(cx - 60, top + 84, 120, 4); ctx.fillStyle = C.or; ctx.fillRect(cx - 60, top + 84, 120 * sim.sur / 6, 4);
      ctx.font = `800 9px ${F_UI}`; ctx.textAlign = 'center'; ctx.fillText('SURCHARGE', cx, top + 76); }
    // bas : Photons · charges · objectif
    const by = this.H - this.safe.bottom - 22;
    ctx.fillStyle = 'rgba(8,12,26,0.72)'; rrect(ctx, L - 6, by - 14, this.colW - 12, 28, 8); ctx.fill();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = `800 14px ${F_NUM}`; ctx.fillStyle = C.or; ctx.fillText('✦ ' + sim.st.photons, L, by);
    // icônes de charges (bouclier = hexagone, réflexe = horloge ; grisées quand utilisées)
    let ix = L + 62; const shMax = Math.max(sim.shield, (sim.mods.bouclier ? 1 : 0) + (sim.res.halo ? 1 : 0)) , rfMax = sim.reflexCharges + sim.reflexUsed;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < shMax; i++) { ctx.strokeStyle = i < sim.shield ? C.menthe : C.lo; ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; ctx.lineTo(ix + Math.cos(a) * 6, by + Math.sin(a) * 6); } ctx.closePath(); ctx.stroke(); ix += 16; }
    for (let i = 0; i < rfMax; i++) { ctx.strokeStyle = i < sim.reflexCharges ? C.menthe : C.lo; ctx.beginPath(); ctx.arc(ix, by, 6, 0, TAU); ctx.moveTo(ix, by); ctx.lineTo(ix, by - 4); ctx.moveTo(ix, by); ctx.lineTo(ix + 3, by + 1); ctx.stroke(); ix += 16; }
    ctx.textAlign = 'right'; ctx.font = `600 11px ${F_UI}`; ctx.fillStyle = C.mid;
    if (ui.goal) { const maxW = R - ix - 8; let g = ui.goal; if (ctx.measureText(g).width > maxW) { ctx.font = `600 10px ${F_UI}`; } ctx.fillText(g, R, by); }
    // Résonances actives (si la place le permet)
    if (sim.resList.length && by - 14 - this.arenaBottom >= 40) {
      ctx.textAlign = 'center'; ctx.font = `700 10px ${F_UI}`; ctx.fillStyle = C.menthe;
      ctx.fillText(ui.resLine || '', cx, by - 28);
    }
    if (ui.fpsStr) { ctx.textAlign = 'left'; ctx.font = `600 10px ${F_NUM}`; ctx.fillStyle = '#7FFFA0'; ctx.fillText(ui.fpsStr, L, top + 96); if (ui.dbgStr) ctx.fillText(ui.dbgStr, L, top + 108); }
    ctx.globalAlpha = 1;
    // tutoriel étape 3 : flèche vers la jauge du multiplicateur
    if (sim.tut && sim.tut.step === 2) { const ax = R - pipsW / 2, ay = top + 86, b = this.reduced ? 0 : Math.sin(this.tNow * TAU * 2) * 3;
      ctx.strokeStyle = C.ivoire; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay + 22 + b); ctx.lineTo(ax, ay + 6 + b); ctx.moveTo(ax - 5, ay + 11 + b); ctx.lineTo(ax, ay + 6 + b); ctx.lineTo(ax + 5, ay + 11 + b); ctx.stroke(); }
  }
}

function setLS(ctx, v) { if ('letterSpacing' in ctx) ctx.letterSpacing = v; }
export function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
// Pictos géométriques des Résonances (DESIGN §6.4), aussi utilisés par les écrans
export function drawResIcon(ctx, id, x, y, s) {
  ctx.beginPath();
  switch (id) {
    case 'halo': for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.lineTo(x + Math.cos(a) * 6 * s, y + Math.sin(a) * 6 * s); } ctx.closePath(); ctx.stroke(); break;
    case 'echo': ctx.arc(x - 3 * s, y, 4 * s, -1, 1); ctx.moveTo(x - 3 * s + 7 * s * Math.cos(-1), y + 7 * s * Math.sin(-1)); ctx.arc(x - 3 * s, y, 7 * s, -1, 1); ctx.stroke(); break;
    case 'lenteur': ctx.moveTo(x - 4 * s, y - 5 * s); ctx.lineTo(x + 4 * s, y - 5 * s); ctx.lineTo(x - 4 * s, y + 5 * s); ctx.lineTo(x + 4 * s, y + 5 * s); ctx.closePath(); ctx.stroke(); break;
    case 'avidite': for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, r = (i & 1 ? 1.6 : 6) * s; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); break;
    case 'ferveur': ctx.moveTo(x - 4 * s, y - 4 * s); ctx.lineTo(x + 4 * s, y + 4 * s); ctx.moveTo(x + 4 * s, y - 4 * s); ctx.lineTo(x - 4 * s, y + 4 * s); ctx.moveTo(x + 1 * s, y - 6 * s); ctx.lineTo(x + 5 * s, y - 6 * s); ctx.lineTo(x + 5 * s, y - 2 * s); ctx.stroke(); break;
    case 'eclat': ctx.moveTo(x, y - 6 * s); ctx.lineTo(x + 4 * s, y); ctx.lineTo(x, y + 6 * s); ctx.lineTo(x - 4 * s, y); ctx.closePath(); ctx.fill(); break;
    case 'phase': ctx.arc(x, y, 3 * s, 0, TAU); ctx.moveTo(x + 6.5 * s, y); ctx.arc(x, y, 6.5 * s, 0, TAU); ctx.stroke(); break;
    case 'precision': ctx.arc(x, y, 5 * s, 0, TAU); ctx.moveTo(x - 8 * s, y); ctx.lineTo(x + 8 * s, y); ctx.moveTo(x, y - 8 * s); ctx.lineTo(x, y + 8 * s); ctx.stroke(); break;
    case 'reflexe': ctx.arc(x, y, 6 * s, 0, TAU); ctx.moveTo(x, y); ctx.lineTo(x, y - 4 * s); ctx.moveTo(x, y); ctx.lineTo(x + 3 * s, y + 1 * s); ctx.stroke(); break;
  }
}
