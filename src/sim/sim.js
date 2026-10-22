// ORBIT — simulation déterministe à pas fixe (1/120 s), sans DOM. Testable sous Node.
import {
  TAU, D2R, STEP, K, R_INT, R_EXT, R_MID, PR, GRAZE, PERFECT, RADIAL_V, PHOTON, TIERS, NEED, DECAY_DELAY, DECAY_STEP, SURCHARGE_T,
  RESONANCES, RES_IDS, POOLS, PAIRS, PAIR_OPTS, MIN_TEL, CORE_PAUSE, ZENITH_OFFSET, palierAt, palierParams, angd, clamp, MOTIF_MIN_PAL, MOTIF_NAMES, EXT_TOUT,
} from '../core/data.js';
import { mulberry32 } from '../core/rng.js';
import { blankHazard, resetHazard, hzDist, nearPoint } from './hazards.js';
import { MOTIFS, ray, orb, ecl } from './patterns.js';

export const EV = {
  FLIP: 1, HOLD: 2, RELEASE: 3, GRAZE: 4, PERFECT: 5, TIER_UP: 6, TIER_DOWN: 7, SURCHARGE: 8, SURCHARGE_END: 9,
  PHOTON: 10, RES_SPAWN: 11, RESONANCE: 12, RES_MISS: 13, PALIER: 14, PHASE: 15, NEW_PALIER: 16, RECORD: 17,
  RAY_TEL: 18, RAY_FIRE: 19, ARC_TEL: 20, ORB_TEL: 21, ECL_EMIT: 22, SAT_SPAWN: 23, SHIELD: 24, REFLEX: 25, DEATH: 26,
  TUTO: 27, START: 28, PIP: 29, SHIELD_READY: 30,
};
const PAIR_OF = {}; for (const [a, b] of PAIRS) PAIR_OF[a] = b;
const MAX_HZ = 128, MAX_ECL = 96, POOL_N = 200, MAX_PICK = 12;

export class Sim {
  constructor(o = {}) {
    this.core = o.core || 'atlas';
    this.seed = (o.seed >>> 0) || 1;
    this.rnd = mulberry32(this.seed);
    const m = o.mods || {};
    this.mods = { echo: m.echo | 0, aimant: m.aimant | 0, inertie: m.inertie | 0, dephaseur: m.dephaseur | 0, reflexe: m.reflexe | 0, prospecteur: m.prospecteur | 0, bouclier: m.bouclier | 0, elan: m.elan | 0 };
    this.daily = !!o.daily;
    this.invincible = !!o.invincible;
    this.reduced = !!o.reduced;
    this.bestTime = o.bestTime || 0;
    this.bestPalier = o.bestPalier || 0;
    this.offset = this.core === 'zenith' ? ZENITH_OFFSET : 0;
    this.forced = null; // debug : motif forcé
    // temps
    this.T = 0; this.real = 0; this.tsWorld = 1;
    this.hitstop = 0; this.slowT = 0; this.slowScale = 1; this.slowRet = 0; this.slowRetT = 0;
    // joueur
    this.th = Math.PI / 2; this.r = R_INT; this.dir = 1; this.lane = 0; this.prevTh = this.th; this.prevR = this.r;
    this.transStart = -9; this.flipT = -9; this.holdT = -9; this.releaseT = -9;
    this.lastSwapT = 0; this.lastFlipT = 0;
    // dangers
    this.pool = []; for (let i = 0; i < POOL_N; i++) this.pool.push(blankHazard());
    this.free = this.pool.slice(); this.hz = []; this.eclN = 0; this.hzId = 0;
    this.tl = []; for (let i = 0; i < 64; i++) this.tl.push({ on: false, t: 0, m: null, i: 0, a: 0, b: 0 });
    this.snap = { th: 0, d: 1, L: 0, w: 0, kt: 1, kv: 1, m: 1, orb: NaN, rnd: this.rnd, opp: false, lane: -1 };
    this.np = new Float64Array(2);
    // directeur
    this.nextStart = 1.2; this.nextCode = null; this.lastCode = ''; this.recent = []; this.motifs = 0; this.pairs = 0;
    this.resWinUntil = -1; this.orbAngle = NaN;
    // ramassables
    this.photons = []; for (let i = 0; i < MAX_PICK; i++) this.photons.push({ on: false, th: 0, R: 0, t0: 0 });
    this.orbs = [{ on: false, th: 0, R: R_INT, id: '', t0: 0 }, { on: false, th: 0, R: R_EXT, id: '', t0: 0 }];
    this.photonT = 0; this.clusterT = 0;
    // multiplicateur, score
    this.tier = Math.min(3, this.mods.elan); this.pips = 0; this.lastGraze = 0; this.decayAcc = 0; this.sur = 0;
    this.score = 0; this.multMax = TIERS[this.tier];
    // résonances
    this.res = {}; for (const id of RES_IDS) this.res[id] = 0;
    this.resList = []; this.resTaken = 0;
    // défense
    this.shield = this.mods.bouclier ? 1 : 0; this.shieldRecharge = -1; this.inv = 0;
    this.reflexCharges = this.mods.reflexe; this.reflexUsed = 0;
    // stats
    this.st = { grazes: 0, perfects: 0, photons: 0, flips: 0, swaps: 0, extTime: 0, surcharges: 0, maxNoSwap: 0, maxNoFlip: 0, shieldsUsed: 0 };
    // paliers
    this.palier = palierAt(this.offset); this.P = palierParams(this.palier);
    this.w = this.P.w * D2R; this.wFrom = this.w; this.wTo = this.w; this.wRamp = 1;
    this.newPalierShown = false; this.recordShown = this.bestTime <= 0;
    // mort
    this.dead = false; this.deadT = 0; this.killer = null; this.killerName = ''; this.over = false;
    // événements (pool fixe)
    this.events = []; for (let i = 0; i < 64; i++) this.events.push({ type: 0, a: 0, b: 0, x: 0, y: 0, s: '' }); this.evN = 0;
    // tutoriel
    this.tut = o.tutorial ? { step: 0, t: 0, h: null, n: 0, txt: '' } : null;
    this.tutText = '';
    if (this.tut) this.tutEnter(0);
  }

  // ------------------------------------------------------------ utilitaires
  emit(type, a = 0, b = 0, x = 0, y = 0, s = '') {
    if (this.evN >= this.events.length) return;
    const e = this.events[this.evN++]; e.type = type; e.a = a; e.b = b; e.x = x; e.y = y; e.s = s;
  }
  clearEvents() { this.evN = 0; }
  get chrono() { return this.tut ? 0 : this.T; }
  get px() { return this.r * Math.cos(this.th); }
  get py() { return this.r * Math.sin(this.th); }
  graceMargin() { return GRAZE + 3 * this.mods.echo + 3 * this.res.echo; }
  perfectMargin() { return PERFECT + 2 * this.res.precision; }
  kt() { return this.P.kt * Math.pow(1.08, this.res.lenteur); }
  need(tier) { return Math.max(2, NEED[tier] - this.res.ferveur); }
  radialV() {
    const base = this.mods.dephaseur ? 46 / [0, 0.1, 0.085, 0.07][this.mods.dephaseur] : RADIAL_V;
    return base * Math.pow(1.2, this.res.phase);
  }
  scoreMult() { return TIERS[this.tier] * (this.sur > 0 ? 2 : 1) * Math.pow(1.25, this.res.eclat); }
  addScore(base) { this.score += base * this.scoreMult(); }

  // contexte des motifs
  add() {
    const h = this.free.length ? this.free.pop() : blankHazard();
    resetHazard(h); h.id = ++this.hzId; this.hz.push(h); return h;
  }
  later(t, m, i, a, b) {
    for (const e of this.tl) if (!e.on) { e.on = true; e.t = t; e.m = m; e.i = i; e.a = a; e.b = b; return; }
  }
  snapshot(m) {
    const s = this.snap; s.th = this.th; s.d = this.dir; s.L = this.lane; s.w = this.w; s.kt = this.kt(); s.kv = this.P.kv;
    s.m = m; s.orb = this.T < this.resWinUntil ? this.orbAngle : NaN; s.rnd = this.rnd; s.opp = false; s.lane = -1; return s;
  }

  // ------------------------------------------------------------ entrées (appliquées au pas courant)
  flip() {
    if (this.dead) return;
    this.dir = -this.dir; this.flipT = this.real; this.st.flips++;
    this.st.maxNoFlip = Math.max(this.st.maxNoFlip, this.T - this.lastFlipT); this.lastFlipT = this.T;
    this.emit(EV.FLIP, this.dir, 0, this.px, this.py);
    if (this.tut && this.tut.step === 0) this.tutFlip();
  }
  hold(on) {
    if (this.dead) return;
    const l = on ? 1 : 0; if (l === this.lane) return;
    // esquive limite (ORB) : on quitte une orbite moins de 0,15 s avant qu'elle devienne active
    const leaving = this.lane;
    this.lane = l; this.transStart = this.T; this.st.swaps++;
    this.st.maxNoSwap = Math.max(this.st.maxNoSwap, this.T - this.lastSwapT); this.lastSwapT = this.T;
    if (on) { this.holdT = this.real; this.emit(EV.HOLD, 0, 0, this.px, this.py); } else { this.releaseT = this.real; this.emit(EV.RELEASE, 0, 0, this.px, this.py); }
    const R = leaving ? R_EXT : R_INT;
    for (let i = 0; i < this.hz.length; i++) {
      const h = this.hz[i];
      if (h.k !== K.ORB || h.R !== R || h.grazed || !(h.ta > this.T && h.ta - this.T <= 0.15)) continue;
      if (h.sw < TAU - 1e-6 && Math.abs(angd(this.th, h.sc)) > h.sw / 2) continue;
      h.grazed = 1; this.graze(h, true);
    }
  }

  // ------------------------------------------------------------ temps (hit-stop, ralentis)
  doHitstop(s) { if (!this.reduced) this.hitstop = Math.max(this.hitstop, s); }
  slow(scale, hold, ret) { this.slowScale = scale; this.slowT = hold; this.slowRet = ret; this.slowRetT = 0; }
  timeScale() {
    if (this.hitstop > 0) { this.hitstop -= STEP; return 0; }
    if (this.slowT > 0) { this.slowT -= STEP; return this.slowScale; }
    if (this.slowRet > 0 && this.slowRetT < this.slowRet) { this.slowRetT += STEP; return this.slowScale + (1 - this.slowScale) * Math.min(1, this.slowRetT / this.slowRet); }
    return 1;
  }

  // ------------------------------------------------------------ pas de simulation
  step() {
    this.real += STEP;
    let ts = this.timeScale();
    if (this.tut) ts *= this.tutScale();
    const dt = STEP * ts; this.tsWorld = ts;
    this.T += dt;
    if (this.dead) { this.deadT += STEP; if (this.deadT >= 0.7) this.over = true; }
    if (this.inv > 0) this.inv -= STEP;
    // palier (temps de jeu + décalage ZÉNITH)
    if (!this.tut && !this.dead) {
      const n = palierAt(this.T + this.offset);
      if (n !== this.palier) this.enterPalier(n);
    }
    if (this.wRamp < 1) { this.wRamp = Math.min(1, this.wRamp + dt); this.w = this.wFrom + (this.wTo - this.wFrom) * this.wRamp; }
    // timeline (cibles calculées au début de leur télégraphe)
    for (const e of this.tl) if (e.on && this.T >= e.t) { e.on = false; e.m.later(this, e.t, e.i, this.snapshot(1), e.a, e.b); }
    if (this.tut) this.tutStep(dt); else if (!this.dead) this.director();
    // joueur
    this.prevTh = this.th; this.prevR = this.r;
    if (!this.dead) {
      this.th += this.dir * this.w * dt;
      if (this.th > TAU * 64 || this.th < -TAU * 64) { const k = Math.floor(this.th / TAU) * TAU; this.th -= k; this.prevTh -= k; }
      const tr = this.lane ? R_EXT : R_INT, v = this.radialV() * dt;
      this.r += clamp(tr - this.r, -v, v);
      if (this.r > R_MID) this.st.extTime += dt;
    }
    this.updateHazards();
    if (!this.dead) {
      this.updatePickups(dt);
      this.updateMult(dt);
      if (!this.tut) this.addScore(100 * dt);
      if (!this.tut) this.reflexCheck();
      if (this.shieldRecharge > 0) { this.shieldRecharge -= dt; if (this.shieldRecharge <= 0 && this.shield === 0) { this.shield = 1; this.emit(EV.SHIELD_READY); } }
      if (!this.recordShown && this.T > this.bestTime && !this.tut) { this.recordShown = true; this.emit(EV.RECORD); }
    }
  }

  enterPalier(n) {
    const prevPhase = this.P.phase;
    this.palier = n; this.P = palierParams(n);
    this.wFrom = this.w; this.wTo = this.P.w * D2R; this.wRamp = 0;
    this.score += 500 * n;
    this.emit(EV.PALIER, n);
    if (this.P.phase !== prevPhase) this.emit(EV.PHASE, this.P.phase);
    if (!this.newPalierShown && this.bestPalier > 0 && n === this.bestPalier + 1) { this.newPalierShown = true; this.emit(EV.NEW_PALIER, n); }
    if ((n >= 2 && n <= 10) || (n > 10 && (n - 10) % 2 === 0)) this.spawnOrbs();
  }

  // ------------------------------------------------------------ directeur §5.7
  draw(phase) {
    const pools = POOLS[this.core]; let tot = 0;
    const ok = c => MOTIF_MIN_PAL[c] <= this.palier && c !== this.lastCode;
    for (let p = 0; p < phase; p++) for (const [c, w] of pools[p]) if (ok(c)) tot += w;
    if (tot <= 0) return 'R1';
    let x = this.rnd() * tot;
    for (let p = 0; p < phase; p++) for (const [c, w] of pools[p]) { if (!ok(c)) continue; x -= w; if (x <= 0) return c; }
    return pools[0][0][0];
  }
  drawNext() {
    if (this.forced) return this.forced;
    let c = this.draw(this.P.phase);
    if ((c === 'O1' || c === 'O3') && this.recent.some(r => r === 'O1' || r === 'O3')) c = this.draw(this.P.phase);
    return c;
  }
  countFor(code) { return MOTIFS[code].n + (PAIR_OF[code] ? MOTIFS[PAIR_OF[code]].n : 0); }
  director() {
    if (this.T < this.nextStart) return;
    let code = this.nextCode || this.drawNext();
    // fenêtre de Résonance : seuls E1/E2 peuvent démarrer
    const win = this.T < this.resWinUntil;
    if (win && code !== 'E1' && code !== 'E2') code = this.lastCode === 'E1' ? 'E2' : this.lastCode === 'E2' ? 'E1' : (this.rnd() < 0.5 ? 'E1' : 'E2');
    const M = MOTIFS[code];
    // budget d'entités : on attend
    if (this.hz.length + this.countFor(code) > MAX_HZ || this.eclN + M.ecl + (PAIR_OF[code] ? MOTIFS[PAIR_OF[code]].ecl : 0) > MAX_ECL) { this.nextCode = code; return; }
    const t = this.T, mir = this.rnd() < 0.5 ? -1 : 1;
    const before = this.hz.length;
    const res = M.build(this, t, this.snapshot(mir));
    this.motifs++;
    // chevauchement : paire validée par le solveur
    const pair = PAIR_OF[code];
    if (!win && pair && MOTIF_MIN_PAL[pair] <= this.palier && this.rnd() < this.P.pchev) {
      const P2 = this.snapshot(this.rnd() < 0.5 ? -1 : 1), po = PAIR_OPTS[code + '+' + pair]; if (po) { P2.opp = !!po.opp; if (po.lane !== undefined) P2.lane = po.lane; }
      const r2 = MOTIFS[pair].build(this, t, P2);
      res.last = Math.max(res.last, r2.last); res.end = Math.max(res.end, r2.end); this.pairs++;
    }
    this.onSpawned(before);
    this.lastCode = code; this.recent.push(code); if (this.recent.length > 4) this.recent.shift();
    const next = this.drawNext();
    this.nextCode = next;
    const Tn = Math.max(MIN_TEL, MOTIFS[next].tb * this.kt());
    this.nextStart = Math.max(res.last, res.end + this.P.pause * CORE_PAUSE[this.core] - 0.5 * Tn);
  }
  onSpawned(from) {
    for (let i = from; i < this.hz.length; i++) {
      const h = this.hz[i];
      if (h.k === K.ECL) this.eclN++;
    }
  }

  // ------------------------------------------------------------ dangers : collisions et frôlements
  updateHazards() {
    const T = this.T, x = this.px, y = this.py, r = this.r, th = this.th, gm = this.graceMargin();
    let killer = null;
    for (let i = this.hz.length - 1; i >= 0; i--) {
      const h = this.hz[i];
      // sons de télégraphe / tir
      if (!h.orbArmed && T >= h.t0) { h.orbArmed = 1; this.telEvent(h); }
      if (h.orbArmed === 1 && T >= h.ta) { h.orbArmed = 2; if (h.k === K.RAY) this.emit(EV.RAY_FIRE, h.he - h.ta); }
      if (T > h.te + 0.15) { this.removeAt(i); continue; }
      if (this.dead) continue;
      if (T >= h.he) { if (h.near) this.flushGraze(h); continue; }
      if (T < h.ta) continue;
      if (h.k === K.ORB) { // ORB : contact uniquement (le frôlement passe par l'esquive limite)
        if (hzDist(h, T, x, y, r, th) < PR && !killer) killer = h;
        continue;
      }
      const d = hzDist(h, T, x, y, r, th);
      if (d < PR) { if (!killer) killer = h; h.near = 0; continue; }
      const e = d - PR;
      if (e < gm) {
        if (h.grazed && !h.rot) continue;
        if (h.rot && T - h.gzT < 0.4) continue;
        if (!h.near) { h.near = 1; h.minD = e; } else if (e < h.minD) h.minD = e;
      } else if (h.near) this.flushGraze(h);
    }
    if (killer) this.onHit(killer);
  }
  flushGraze(h) {
    h.near = 0; h.grazed = 1; h.gzT = this.T;
    if (this.inv > 0 || this.dead) return;
    this.graze(h, h.minD < this.perfectMargin());
  }
  removeAt(i) {
    const h = this.hz[i];
    if (h.k === K.ECL) this.eclN--;
    const last = this.hz.length - 1; this.hz[i] = this.hz[last]; this.hz.pop();
    if (h !== this.killer) this.free.push(h);
  }
  telEvent(h) {
    switch (h.k) {
      case K.RAY: this.emit(EV.RAY_TEL, h.ta - h.t0); break;
      case K.ARC: this.emit(EV.ARC_TEL); break;
      case K.ORB: this.emit(EV.ORB_TEL); break;
      case K.ECL: this.emit(EV.ECL_EMIT); break;
      case K.SAT: this.emit(EV.SAT_SPAWN); break;
    }
  }

  graze(h, perfect) {
    this.st.grazes++; if (perfect) this.st.perfects++;
    this.lastGraze = this.T; this.decayAcc = 0;
    this.addScore(perfect ? 150 : 50);
    nearPoint(h, this.T, this.px, this.py, this.r, this.th, this.np);
    this.emit(perfect ? EV.PERFECT : EV.GRAZE, this.pips, this.tier, this.np[0], this.np[1]);
    if (perfect) this.doHitstop(0.025);
    this.addPips(perfect ? 2 : 1);
  }
  addPips(n) {
    if (this.tier >= 6) return;
    this.pips += n; this.emit(EV.PIP, this.pips);
    while (this.tier < 6 && this.pips >= this.need(this.tier)) {
      this.pips -= this.need(this.tier); this.tier++;
      this.multMax = Math.max(this.multMax, TIERS[this.tier]);
      this.emit(EV.TIER_UP, this.tier);
      if (this.tier === 6) { this.sur = SURCHARGE_T; this.pips = 0; this.st.surcharges++; this.emit(EV.SURCHARGE); }
    }
  }
  updateMult(dt) {
    if (this.tut) return;
    if (this.sur > 0) {
      this.sur -= dt;
      if (this.sur <= 0) { this.sur = 0; this.tier = 5; this.pips = 0; this.lastGraze = this.T; this.decayAcc = 0; this.emit(EV.SURCHARGE_END); }
      return;
    }
    if (this.T - this.lastGraze <= DECAY_DELAY + this.mods.inertie) return;
    this.decayAcc += dt;
    while (this.decayAcc >= DECAY_STEP) {
      this.decayAcc -= DECAY_STEP;
      if (this.pips > 0) this.pips--;
      else if (this.tier > 0) { this.tier--; this.pips = this.need(this.tier) - 1; this.emit(EV.TIER_DOWN, this.tier); }
    }
  }

  // ------------------------------------------------------------ coup reçu
  onHit(h) {
    if (this.invincible || this.inv > 0 || (this.tut && true)) return;
    if (this.shield > 0) {
      this.shield--; this.st.shieldsUsed++;
      const lv = this.mods.bouclier;
      this.inv = lv >= 2 ? 1.5 : 1.0;
      if (lv < 2 && this.tier > 0 && this.sur <= 0) { this.tier--; this.pips = 0; this.emit(EV.TIER_DOWN, this.tier); }
      if (lv >= 3 && this.shield === 0) this.shieldRecharge = 40;
      this.doHitstop(0.05); this.slow(0.3, 0.25, 0);
      this.emit(EV.SHIELD, 0, 0, this.px, this.py);
      return;
    }
    this.dead = true; this.deadT = 0;
    // copie du danger fautif (dessiné par-dessus le voile de désaturation)
    const k = blankHazard(); Object.assign(k, h); this.killer = k;
    this.killerName = MOTIF_NAMES[h.motif] || h.motif;
    this.st.maxNoSwap = Math.max(this.st.maxNoSwap, this.T - this.lastSwapT);
    this.st.maxNoFlip = Math.max(this.st.maxNoFlip, this.T - this.lastFlipT);
    this.hitstop = this.reduced ? 0 : 0.07; this.slow(0.15, 0.6 + (this.reduced ? 0 : 0.07), 0);
    this.emit(EV.DEATH, 0, 0, this.px, this.py);
  }

  // ------------------------------------------------------------ RÉFLEXE §10.1
  reflexCheck() {
    if (this.reflexCharges <= 0 || this.inv > 0 || this.slowT > 0 || this.hitstop > 0 || this.invincible) return;
    for (const tau of [0.1, 0.2]) {
      const th = this.th + this.dir * this.w * tau, tr = this.lane ? R_EXT : R_INT;
      const r = this.r + clamp(tr - this.r, -this.radialV() * tau, this.radialV() * tau);
      const x = r * Math.cos(th), y = r * Math.sin(th), t = this.T + tau;
      for (let i = 0; i < this.hz.length; i++) {
        if (hzDist(this.hz[i], t, x, y, r, th) < PR) {
          this.reflexCharges--; this.reflexUsed++;
          this.slow(0.35, this.mods.reflexe >= 3 ? 0.8 : 0.6, 0.15);
          this.emit(EV.REFLEX, this.reflexCharges);
          return;
        }
      }
    }
  }

  // ------------------------------------------------------------ Photons & Résonances §8
  photonCount() { let n = 0; for (const p of this.photons) if (p.on) n++; return n; }
  pickCount() { return this.photonCount() + (this.orbs[0].on ? 1 : 0) + (this.orbs[1].on ? 1 : 0); }
  photonValid(R, a) {
    const x = R * Math.cos(a), y = R * Math.sin(a);
    for (let i = 0; i < this.hz.length; i++) {
      const h = this.hz[i];
      for (let k = 0; k <= 2; k++) { const t = this.T + k * 0.5, tt = Math.max(t, h.ta); if (tt > this.T + 1) continue; if (hzDist(h, tt, x, y, R, a) < 20) return false; }
    }
    return true;
  }
  spawnPhoton(R, a) {
    if (this.pickCount() >= MAX_PICK) return;
    for (const p of this.photons) if (!p.on) { p.on = true; p.R = R; p.th = a; p.t0 = this.T; return; }
  }
  updatePickups(dt) {
    if (this.tut) return;
    this.photonT += dt; this.clusterT += dt;
    if (this.photonT >= PHOTON.every) {
      this.photonT = 0;
      if (this.photonCount() < PHOTON.max) for (let k = 0; k < 3; k++) {
        const R = this.rnd() < 0.7 ? R_EXT : R_INT, a = this.th + this.dir * (100 + this.rnd() * 120) * D2R;
        if (this.photonValid(R, a)) { this.spawnPhoton(R, a); break; }
      }
    }
    if (this.clusterT >= PHOTON.cluster) {
      this.clusterT = 0;
      for (let k = 0; k < 5; k++) { const a = this.th + this.dir * (120 + 10 * k) * D2R; if (this.photonValid(R_EXT, a)) this.spawnPhoton(R_EXT, a); }
    }
    const x = this.px, y = this.py, rad = PHOTON.pick + [0, 8, 16, 26][this.mods.aimant];
    for (const p of this.photons) {
      if (!p.on) continue;
      if (this.T - p.t0 > PHOTON.life) { p.on = false; continue; }
      const dx = p.R * Math.cos(p.th) - x, dy = p.R * Math.sin(p.th) - y;
      if (dx * dx + dy * dy < rad * rad) {
        p.on = false; const v = 1 + this.res.avidite; this.st.photons += v; this.addScore(20);
        this.emit(EV.PHOTON, v, 0, p.R * Math.cos(p.th), p.R * Math.sin(p.th));
      }
    }
    // orbes de Résonance
    const o0 = this.orbs[0], o1 = this.orbs[1];
    if (o0.on || o1.on) {
      const age = this.T - o0.t0;
      if (age > 3.0) { o0.on = o1.on = false; this.addScore(0); this.score += 300; this.emit(EV.RES_MISS); }
      else if (age >= 0.4) for (let k = 0; k < 2; k++) {
        const o = this.orbs[k]; if (!o.on) continue;
        const dx = o.R * Math.cos(o.th) - x, dy = o.R * Math.sin(o.th) - y;
        if (dx * dx + dy * dy < 14 * 14) { this.takeResonance(o, this.orbs[1 - k]); break; }
      }
    }
  }
  drawResonances() {
    const pool = [];
    for (const id of RES_IDS) { const R = RESONANCES[id]; if (this.res[id] >= R.max) continue; if (R.minPal && this.palier < R.minPal) continue; pool.push(id); }
    const pick = () => { let tot = 0; for (const id of pool) tot += RESONANCES[id].w; let x = this.rnd() * tot; for (let i = 0; i < pool.length; i++) { x -= RESONANCES[pool[i]].w; if (x <= 0) return pool.splice(i, 1)[0]; } return pool.pop(); };
    if (pool.length < 2) return null;
    return [pick(), pick()];
  }
  spawnOrbs() {
    if (this.tut || this.dead) return;
    const ids = this.drawResonances(); if (!ids) return;
    const a = this.th + this.dir * this.w * 1.4;
    for (let k = 0; k < 2; k++) { const o = this.orbs[k]; o.on = true; o.th = a; o.R = k ? R_EXT : R_INT; o.id = ids[k]; o.t0 = this.T; }
    this.resWinUntil = this.T + 2.5; this.orbAngle = a;
    this.emit(EV.RES_SPAWN, 0, 0, 0, 0, ids[0] + ',' + ids[1]);
  }
  takeResonance(o, other) {
    const id = o.id; this.res[id]++; this.resTaken++; this.resList.push(id);
    if (id === 'halo') this.shield = Math.min(1, this.shield + 1);
    if (id === 'reflexe') this.reflexCharges++;
    o.on = false; other.on = false;
    this.emit(EV.RESONANCE, this.res[id], 0, o.R * Math.cos(o.th), o.R * Math.sin(o.th), id);
  }

  // ------------------------------------------------------------ Tutoriel §13 (pas de mort possible)
  tutEnter(step) {
    const t = this.tut; t.step = step; t.t = 0; t.h = null; t.n = 0;
    this.tutText = ['TAPE POUR FAIRE DEMI-TOUR', 'MAINTIENS POUR PASSER À L’EXTÉRIEUR', 'FRÔLE POUR MULTIPLIER', 'C’EST PARTI'][step];
    this.emit(EV.TUTO, step);
    if (step === 0) { const h = ray(this, this.T, 1e6, 0.45, this.th + this.dir * 50 * D2R, EXT_TOUT, 0, 'TUTO'); t.h = h; }
    if (step === 1) { t.h = orb(this, this.T, 1e6, 1.2, 0, 0, TAU, 'TUTO'); }
  }
  tutScale() { const t = this.tut; return (t.step === 0 && t.h && t.h.ta > this.T + 1e5) ? 0.4 : 1; }
  tutFlip() { const h = this.tut.h; if (h && h.ta > this.T + 1e5) { h.ta = this.T + 0.3; h.he = h.ta + 0.37; h.te = h.ta + 0.45; } }
  tutStep(dt) {
    const t = this.tut; t.t += dt;
    switch (t.step) {
      case 0: if (t.h.ta > this.T + 1e5) t.h.a = this.th + this.dir * 50 * D2R; else if (this.T > t.h.te + 0.5) this.tutEnter(1); break;
      case 1: {
        const h = t.h;
        if (h.ta > this.T + 1e5) { if (this.lane === 1 && this.r > R_MID) { h.ta = this.T + 0.4; h.he = h.ta + 1.2; h.te = h.he + 0.12; } }
        else if (this.T > h.he - 0.4 && t.n === 0) { t.n = 1; this.tutText = 'RELÂCHE POUR REVENIR'; this.emit(EV.TUTO, 10); }
        if (t.n === 1 && this.T > h.te && (this.lane === 0 || this.T > h.te + 2)) this.tutEnter(2);
        break;
      }
      case 2: {
        if (t.n < 3 && t.t >= 0.3 + t.n * 0.7) {
          // éclat OUT qui passe à ~8 u du joueur (sur son orbite, au moment du croisement)
          const R = this.lane ? R_EXT : R_INT, v = 150, T = 0.5, tt = T + (R - 34) / v;
          const off = (PR + 3.5 + 8) / R;
          ecl(this, this.T, T, this.th + this.dir * this.w * tt + (t.n & 1 ? off : -off), false, v, 0, 'TUTO');
          t.n++;
        }
        if (t.n >= 3 && t.t > 3.4) this.tutEnter(3);
        break;
      }
      case 3: if (t.t > 1.2) this.endTutorial(); break;
    }
  }
  endTutorial() {
    for (let i = this.hz.length - 1; i >= 0; i--) this.removeAt(i);
    for (const e of this.tl) e.on = false;
    this.tut = null; this.tutText = ''; this.T = 0; this.nextStart = 1.2; this.nextCode = null; this.lastCode = '';
    this.tier = Math.min(3, this.mods.elan); this.pips = 0; this.score = 0; this.lastGraze = 0; this.decayAcc = 0;
    this.st.grazes = this.st.perfects = 0; this.st.extTime = 0; this.lastSwapT = 0; this.lastFlipT = 0; this.st.maxNoFlip = this.st.maxNoSwap = 0; this.st.flips = 0; this.st.swaps = 0;
    this.emit(EV.START);
  }

  // ------------------------------------------------------------ résultat
  result() {
    return {
      core: this.core, daily: this.daily, time: this.T, palier: this.palier, palierName: this.P.name,
      score: Math.round(this.score), multMax: this.multMax, grazes: this.st.grazes, perfects: this.st.perfects,
      photons: this.st.photons, flips: this.st.flips, swaps: this.st.swaps, extTime: this.st.extTime, surcharges: this.st.surcharges,
      resonances: this.resTaken, resList: this.resList.slice(), res: Object.assign({}, this.res),
      maxNoSwap: Math.max(this.st.maxNoSwap, this.T - this.lastSwapT), maxNoFlip: Math.max(this.st.maxNoFlip, this.T - this.lastFlipT),
      killer: this.killerName, killerKind: this.killer ? this.killer.k : -1, mods: Object.assign({}, this.mods), seed: this.seed,
    };
  }
}
