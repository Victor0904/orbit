// Bot (GAME_DESIGN §16, cf. mockup) : horizon 0,6 s, 16 plans {sens, orbite} × {maintenant, dans 0,3 s}.
// Temps de réaction simulé : un télégraphe n'est « vu » que `react` s après son apparition.
// Un seul doigt : le maintien prend effet après HOLD_MS ; pas de demi-tour pendant un maintien.
// Sert aussi de démo d'attraction derrière les menus.
import { R_INT, R_EXT, PR, K, clamp, angd } from '../core/data.js';
import { gapAt } from './hazards.js';
import { hzDist } from './hazards.js';
import { mulberry32 } from '../core/rng.js';

export class Bot {
  constructor(sim, o = {}) {
    this.sim = sim; this.react = o.react !== undefined ? o.react : 0.18; this.period = o.period || 0.05;
    this.holdS = (o.holdMs || 140) / 1000; this.next = 0;
    this.holding = false; this.pressAt = -1;
    this.rnd = mulberry32(o.seed || 7); this.lapse = o.lapse || 0; // probabilité de « rater » une décision
    // exécution humaine : latence moyenne du geste (s) + dispersion (écart type, s) ; l'action décidée part plus tard
    this.lat = o.lat !== undefined ? o.lat : 0; this.jit = o.jit || 0; this.act = null;
    this.vis = [];
  }
  setSim(sim) { this.sim = sim; this.holding = false; this.pressAt = -1; this.next = 0; this.act = null; }
  gauss() { let u = 0; for (let i = 0; i < 4; i++) u += this.rnd(); return (u - 2) * 1.7320508; }
  // à appeler après chaque pas de simulation
  update() {
    const s = this.sim; if (s.dead) return;
    if (this.pressAt >= 0 && s.real >= this.pressAt + this.holdS) { this.pressAt = -1; this.holding = true; s.hold(true); }
    if (this.act && s.real >= this.act.at) { const a = this.act; this.act = null; this.apply(a.d1, a.L1); }
    if (s.real < this.next || this.act) return;
    this.next = s.real + this.period;
    if (this.lapse && this.rnd() < this.lapse) return;
    this.decide();
  }
  apply(d1, L1) {
    const s = this.sim, pending = this.pressAt >= 0;
    if (L1 === 0 && this.holding) { this.holding = false; s.hold(false); }
    if (d1 !== s.dir && !this.holding && !pending) s.flip();
    if (L1 === 1 && !this.holding && this.pressAt < 0) this.pressAt = s.real;
  }
  decide() {
    const s = this.sim, T = s.T, w = s.w, vis = this.vis; vis.length = 0;
    for (let i = 0; i < s.hz.length; i++) { const h = s.hz[i]; if (h.t0 <= T - this.react && h.he > T && h.ta < T + 0.6) vis.push(h); }
    const pending = this.pressAt >= 0, holding = this.holding, held = holding || pending;
    const pendLeft = pending ? this.pressAt + this.holdS - s.real : 0;
    let best = -1e9, bi = -1;
    for (let i = 0; i < 16; i++) {
      const d1 = i & 1 ? -s.dir : s.dir, L1 = (i >> 1) & 1, d2 = i & 4 ? -d1 : d1, L2 = (i >> 3) & 1;
      // validité (un doigt)
      if (pending && L1 === 0) continue;                         // un appui en cours deviendrait un tap
      if (holding && d1 !== s.dir && L1 === 1) continue;           // pas de demi-tour en maintien
      if (L1 === 1 && d2 !== d1 && L2 === 1) continue;
      const lt = this.lat, lane1At = L1 ? (held ? pendLeft : lt + this.holdS) : 0; // instant où l'orbite cible devient EXT
      const lane2At = L2 && !L1 ? 0.3 + this.holdS : (L2 ? lane1At : 0.3);
      let th = s.th, r = s.r, minD = 30, hitAt = -1, bonus = 0;
      for (let k = 1; k <= 24; k++) {
        const tt = k * 0.025, seg2 = tt > 0.3, dd = tt < lt ? s.dir : seg2 ? d2 : d1;
        let tgt;
        if (!seg2) tgt = L1 ? (tt >= lane1At || s.lane ? R_EXT : R_INT) : (tt < lt && s.lane ? R_EXT : R_INT);
        else tgt = L2 ? (tt >= lane2At ? R_EXT : (L1 ? R_EXT : R_INT)) : R_INT;
        th += dd * w * 0.025; const v = s.radialV() * 0.025; r += clamp(tgt - r, -v, v);
        const x = r * Math.cos(th), y = r * Math.sin(th), t = T + tt;
        for (let j = 0; j < vis.length; j++) { const d = hzDist(vis[j], t, x, y, r, th) - PR; if (d < minD) minD = d; if (d < 0 && hitAt < 0) hitAt = tt; }
        if (k % 4 === 0) {
          for (const p of s.photons) if (p.on) { const dx = x - p.R * Math.cos(p.th), dy = y - p.R * Math.sin(p.th); if (dx * dx + dy * dy < 144) bonus = Math.max(bonus, 2); }
          for (const o of s.orbs) if (o.on) { const dx = x - o.R * Math.cos(o.th), dy = y - o.R * Math.sin(o.th); if (dx * dx + dy * dy < 196) bonus = Math.max(bonus, 3); }
        }
      }
      let sc = hitAt >= 0 ? -100 + hitAt * 60 : Math.min(minD, 4.5);
      if (hitAt < 0) sc -= this.farArcs(th, r, T + 0.6, w);
      sc += (d1 === s.dir ? 1.4 : 0) + (L1 === (held ? 1 : 0) ? 1 : 0) + (L1 === 0 ? 0.5 : 0) + (L2 === L1 ? 0.2 : 0) + (d2 === d1 ? 0.2 : 0) + bonus;
      if (sc > best) { best = sc; bi = i; }
    }
    if (bi < 0) return;
    const d1 = bi & 1 ? -s.dir : s.dir, L1 = (bi >> 1) & 1;
    if (d1 === s.dir && L1 === (held ? 1 : 0)) return; // rien à faire
    const delay = this.lat + this.jit * this.gauss();
    if (delay <= 0.004) this.apply(d1, L1); else this.act = { at: s.real + delay, d1, L1 };
  }
  // Au-delà de l'horizon (0,6 s) : pour chaque arc vu qui croisera l'orbite du joueur dans les 1,6 s, pénalité si la
  // brèche la plus proche est trop loin pour être atteinte à temps (anticipation des escaliers, cf. NOTES).
  farArcs(th, r, t1, w) {
    let pen = 0; const R = r > 115 ? R_EXT : R_INT;
    for (let j = 0; j < this.vis.length; j++) {
      const h = this.vis[j]; if (h.k !== K.ARC || !h.v) continue;
      const tc = h.ta + (R - h.rho) / h.v; if (tc <= t1 || tc > t1 + 1.6) continue;
      const rot = h.wg * (tc - h.ta), half = h.gw / 2 - 9 / R; let need = Math.PI;
      for (let i = 0; i < h.gn; i++) need = Math.min(need, Math.max(0, Math.abs(angd(th, gapAt(h, i) + rot)) - half));
      const short = need / w - (tc - t1) * 0.85; if (short > 0) pen += 8 + 40 * short;
    }
    return pen;
  }
}
