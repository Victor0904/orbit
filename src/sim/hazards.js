// Dangers (GAME_DESIGN §4) : objets à forme fixe, distances analytiques en polaire.
import { K, HIT, EXTENTS, R_CORE, R_EMIT, R_INT, R_MID, R_EXT, R_EDGE, R_KILL, TAU, angd } from '../core/data.js';

// Crée un danger « vide » (forme fixe pour les pools et le moteur JS).
export function blankHazard() {
  return {
    k: 0, t0: 0, ta: 0, he: 0, te: 0, motif: '', id: 0,
    a: 0, r0: 0, r1: 0, ext: 0, wb: 0, alt: 0, altPh: 0,  // RAY (alt : période d'alternance INT/EXT, 0 = fixe)
    rho: 0, v: 0, gn: 0, g0: 0, g1: 0, g2: 0, g3: 0, gw: 0, wg: 0, // ARC (jusqu'à 4 brèches de même largeur)
    wa: 0,                                                 // ÉCL (dérive angulaire)
    R: 0, sc: 0, sw: TAU, ws: 0,                            // ORB (segment) / SAT / MIN
    // état de frôlement (sim)
    near: 0, minD: 99, gzT: -9, grazed: 0, rot: 0, orbArmed: 0,
  };
}
export function resetHazard(h) {
  h.k = 0; h.t0 = h.ta = h.he = h.te = 0; h.motif = ''; h.a = h.r0 = h.r1 = h.ext = h.wb = h.alt = h.altPh = 0;
  h.rho = h.v = h.gn = h.g0 = h.g1 = h.g2 = h.g3 = h.gw = h.wg = h.wa = 0; h.R = h.sc = h.ws = 0; h.sw = TAU;
  h.near = 0; h.minD = 99; h.gzT = -9; h.grazed = 0; h.rot = 0; h.orbArmed = 0;
  return h;
}

// Extent courant d'un rayon (R9 : alterne INT ↔ EXT toutes les `alt` s)
export function rayExt(h, u) {
  if (!h.alt) return h.ext;
  const ph = (Math.floor(Math.max(0, u) / h.alt) + h.altPh) & 1;
  return ph ? 2 : 1;
}
export function gapAt(h, i) { return i === 0 ? h.g0 : i === 1 ? h.g1 : i === 2 ? h.g2 : h.g3; }

// Distance bord à bord (au bord de la hitbox du danger) depuis le centre du joueur (r, th, x = r cos th, y = r sin th).
// Touché si d < 4 ; frôlement si 4 ≤ d < 16 (+ÉCHO). Renvoie 1e9 si le danger n'a pas de hitbox à l'instant t.
export function hzDist(h, t, x, y, r, th) {
  if (t < h.ta || t >= h.he) return 1e9;
  const u = t - h.ta;
  switch (h.k) {
    case K.RAY: {
      const D = angd(th, h.a + h.wb * u);
      if (D >= Math.PI / 2 || D <= -Math.PI / 2) return 1e9;
      const e = EXTENTS[rayExt(h, u)], r0 = e[0], r1 = e[1];
      const perp = r * Math.abs(Math.sin(D)), al = r * Math.cos(D);
      if (al < r0) return Math.sqrt(perp * perp + (r0 - al) * (r0 - al)) - HIT.RAY;
      if (al > r1) return Math.sqrt(perp * perp + (al - r1) * (al - r1)) - HIT.RAY;
      return perp - HIT.RAY;
    }
    case K.ARC: {
      const rho = h.rho + h.v * u;
      if (rho < 28 || rho > R_KILL) return 1e9;
      const dr = Math.abs(r - rho);
      if (dr > 60) return dr - HIT.ARC; // test grossier
      const rot = h.wg * u, hw = h.gw / 2;
      for (let i = 0; i < h.gn; i++) {
        const gc = gapAt(h, i) + rot;
        if (Math.abs(angd(th, gc)) < hw) {
          const e1 = gc + hw, e2 = gc - hw;
          const ax = x - rho * Math.cos(e1), ay = y - rho * Math.sin(e1), bx = x - rho * Math.cos(e2), by = y - rho * Math.sin(e2);
          return Math.sqrt(Math.min(ax * ax + ay * ay, bx * bx + by * by)) - HIT.ARC;
        }
      }
      return dr - HIT.ARC;
    }
    case K.ECL: {
      const rho = h.rho + h.v * u;
      if (rho > R_KILL || rho < 30) return 1e9;
      const a = h.a + h.wa * u, dx = x - rho * Math.cos(a), dy = y - rho * Math.sin(a);
      return Math.sqrt(dx * dx + dy * dy) - HIT.ECL;
    }
    case K.ORB: {
      if (h.sw < TAU - 1e-6 && Math.abs(angd(th, h.sc)) > h.sw / 2) return 1e9;
      return Math.abs(r - h.R) - HIT.ORB;
    }
    case K.SAT: {
      const a = h.a + h.ws * u, dx = x - h.R * Math.cos(a), dy = y - h.R * Math.sin(a);
      return Math.sqrt(dx * dx + dy * dy) - HIT.SAT;
    }
    case K.MIN: {
      const dx = x - h.R * Math.cos(h.a), dy = y - h.R * Math.sin(h.a);
      return Math.sqrt(dx * dx + dy * dy) - HIT.MIN;
    }
  }
  return 1e9;
}

// Point du danger le plus proche (pour les étincelles de frôlement) : renvoie [x, y] dans out.
export function nearPoint(h, t, x, y, r, th, out) {
  const u = Math.max(0, t - h.ta);
  switch (h.k) {
    case K.RAY: { const a = h.a + h.wb * u, c = Math.cos(a), s = Math.sin(a), al = Math.max(R_EMIT, Math.min(R_EDGE, x * c + y * s)); out[0] = c * al; out[1] = s * al; break; }
    case K.ARC: { const rho = h.rho + h.v * u; out[0] = rho * Math.cos(th); out[1] = rho * Math.sin(th); break; }
    case K.ECL: { const rho = h.rho + h.v * u, a = h.a + h.wa * u; out[0] = rho * Math.cos(a); out[1] = rho * Math.sin(a); break; }
    case K.ORB: out[0] = h.R * Math.cos(th); out[1] = h.R * Math.sin(th); break;
    case K.SAT: { const a = h.a + h.ws * u; out[0] = h.R * Math.cos(a); out[1] = h.R * Math.sin(a); break; }
    default: out[0] = h.R * Math.cos(h.a); out[1] = h.R * Math.sin(h.a);
  }
  return out;
}

// Instant où le danger cesse d'être pertinent pour le joueur (fin de motif pour le directeur) :
// arcs/éclats : quand ils ont dépassé la zone des orbites ; autres : fin de hitbox.
export function relevantEnd(h) {
  if (h.k === K.ARC || h.k === K.ECL) {
    const sp = Math.abs(h.v); if (!sp) return h.he;
    const target = h.v < 0 ? R_INT - 12 : R_EXT + 12;
    return Math.min(h.he, h.ta + Math.abs(target - h.rho) / sp);
  }
  return h.he;
}

export const GEOM = { R_CORE, R_EMIT, R_INT, R_MID, R_EXT, R_EDGE, R_KILL };
