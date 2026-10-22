// Catalogue des 29 motifs (GAME_DESIGN §5). Chaque motif construit ses dangers via un contexte :
//   ctx.add()                      → danger vierge enregistré (pool côté sim, tableau côté solveur)
//   ctx.later(t, motif, i, a, b)   → rappel motif.later(ctx, t, i, P2, a, b) à l'instant monde t, avec l'état
//                                    du joueur à cet instant (cibles « calculées au début de leur télégraphe »).
// P = { th, d, L, w (rad/s), kt (k_tel × LENTEUR), kv, m (miroir ±1), orb (angle d'orbe ou NaN), rnd(), opp }.
import { K, D2R, TAU, MIN_TEL, EXT_TOUT, EXT_INT, EXT_EXT, R_EMIT, R_EDGE, R_KILL, R_INT, R_EXT, angd } from '../core/data.js';

export const tel = (P, b) => Math.max(MIN_TEL, b * P.kt);
const hit = (P, dt) => P.th + P.d * P.w * dt;

export function ray(ctx, t0, T, dur, a, ext, wb, motif) {
  const h = ctx.add(); h.k = K.RAY; h.t0 = t0; h.ta = t0 + T; h.he = h.ta + dur - 0.08; h.te = h.ta + dur;
  h.a = a; h.ext = ext; h.wb = wb; h.motif = motif; h.rot = wb !== 0 ? 1 : 0; return h;
}
export function arc(ctx, t0, T, inward, v, gw, wg, motif, gn, g0, g1, g2, g3) {
  const h = ctx.add(); h.k = K.ARC; h.t0 = t0; h.ta = t0 + T;
  h.rho = inward ? R_EDGE : R_EMIT; h.v = inward ? -v : v;
  h.he = h.te = h.ta + (inward ? R_EDGE - 28 : R_KILL - R_EMIT) / v;
  h.gn = gn; h.g0 = g0 || 0; h.g1 = g1 || 0; h.g2 = g2 || 0; h.g3 = g3 || 0; h.gw = gw; h.wg = wg; h.motif = motif; return h;
}
export function ecl(ctx, t0, T, a, inward, v, wa, motif) {
  const h = ctx.add(); h.k = K.ECL; h.t0 = t0; h.ta = t0 + T; h.a = a; h.wa = wa;
  h.rho = inward ? R_EDGE : R_EMIT; h.v = inward ? -v : v;
  h.he = h.te = h.ta + (inward ? R_EDGE - 30 : R_KILL - R_EMIT) / v; h.motif = motif; return h;
}
export function orb(ctx, t0, T, dur, lane, sc, sw, motif) {
  const h = ctx.add(); h.k = K.ORB; h.t0 = t0; h.ta = t0 + T; h.he = h.ta + dur; h.te = h.he + 0.12;
  h.R = lane ? R_EXT : R_INT; h.sc = sc; h.sw = sw; h.motif = motif; return h;
}
export function sat(ctx, t0, T, life, lane, a, ws, motif) {
  const h = ctx.add(); h.k = K.SAT; h.t0 = t0; h.ta = t0 + T; h.he = h.ta + life; h.te = h.he + 0.12;
  h.R = lane ? R_EXT : R_INT; h.a = a; h.ws = ws; h.motif = motif; h.rot = 1; return h;
}
export function mine(ctx, t0, T, dur, lane, a, motif) {
  const h = ctx.add(); h.k = K.MIN; h.t0 = t0; h.ta = t0 + T; h.he = h.ta + dur; h.te = h.he + 0.12;
  h.R = lane ? R_EXT : R_INT; h.a = a; h.motif = motif; return h;
}
const nearOrb = (P, a) => P.orb === P.orb && Math.abs(angd(a, P.orb)) < 25 * D2R; // fenêtre de Résonance : ±25° libres
// Ajustements validés par le solveur (cf. NOTES « Décisions dev ») :
export const A2_STEP = 120;   // spec : 150° — sans solution (150° − brèche > ω·0,6 s×k à tous les paliers) : 120°
export const A5_GAP = 40;    // spec : brèches de 30° (arcs de 60°) — 36–50 % de morts du bot moyen : brèches de 40°
// Corps (SAT) : le motif « se termine » pour le directeur 2,2 s après l'activation (comme le mockup), pas à la mort du
// satellite : sinon 3,5–4 s de temps mort par satellite (KEPLER trop facile, cf. NOTES).
export const BODY_END = 2.2;
export const A4_DELAY = 0.65; // spec : 0,3 s×k (fenêtre de 0,06–0,09 s entre le passage de l'IN et de l'OUT sur INT)
const outTime = v => (R_EXT + 12 - R_EMIT) / v;   // un éclat/arc OUT a dépassé EXT
const inTime = v => (R_EDGE - (R_INT - 12)) / v;   // un éclat/arc IN a dépassé INT

// Chaque motif : tb = télégraphe de base du 1er danger (directeur), n = dangers créés, ecl = éclats créés.
export const MOTIFS = {
  // ---------------- RAYONS ----------------
  R1: { tb: 0.75, n: 1, ecl: 0, build(ctx, t, P) { const T = tel(P, 0.75); ray(ctx, t, T, 0.45, hit(P, T + 0.15), EXT_TOUT, 0, 'R1'); return { last: t + T, end: t + T + 0.45 }; } },
  R2: { tb: 0.75, n: 2, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.75);
    ray(ctx, t, T, 0.5, hit(P, T + 0.15), EXT_TOUT, 0, 'R2');
    ray(ctx, t, T, 0.5, P.th - P.d * (P.w * (T + 0.15) + 60 * D2R), EXT_TOUT, 0, 'R2');
    return { last: t + T, end: t + T + 0.5 };
  } },
  R3: { tb: 0.75, n: 1, ecl: 0, build(ctx, t, P) { const T = tel(P, 0.75); ray(ctx, t, T, 0.6, hit(P, T + 0.15), P.L ? EXT_EXT : EXT_INT, 0, 'R3'); return { last: t + T, end: t + T + 0.6 }; } },
  R4: { tb: 0.75, n: 12, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.75), t2 = t + 0.5 * P.kt;
    for (let k = 0; k < 6; k++) ray(ctx, t, T, 0.35, P.th + (30 + 60 * k) * D2R, EXT_TOUT, 0, 'R4');
    for (let k = 0; k < 6; k++) ray(ctx, t2, T, 0.35, P.th + P.m * 60 * k * D2R, EXT_TOUT, 0, 'R4');
    return { last: t2 + T, end: t2 + T + 0.35 };
  } },
  R5: { tb: 0.75, n: 1, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.75), lane = P.rnd() < 0.5 ? EXT_INT : EXT_EXT;
    ray(ctx, t, T, 2.4, P.th + Math.PI, lane, -P.d * 1.4 * P.w, 'R5'); return { last: t + T, end: t + T + 2.4 };
  } },
  R6: { tb: 0.75, n: 4, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.75), b = P.th + P.d * 45 * D2R, wb = P.d * 0.35 * P.w;
    for (let k = 0; k < 4; k++) ray(ctx, t, T, 3.0, b + k * Math.PI / 2, EXT_TOUT, wb, 'R6');
    return { last: t + T, end: t + T + 3.0 };
  } },
  R7: { tb: 0.75, n: 4, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.75), b = P.th + P.d * 45 * D2R, wb = -P.d * 0.5 * P.w;
    for (let k = 0; k < 4; k++) ray(ctx, t, T, 3.0, b + k * Math.PI / 2, k & 1 ? EXT_EXT : EXT_INT, wb, 'R7');
    return { last: t + T, end: t + T + 3.0 };
  } },
  R8: { tb: 0.75, n: 3, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.75), ta1 = t + T, t2 = ta1 + 0.35 * P.kt, t3 = t2 + T + 0.35 * P.kt;
    ray(ctx, t, T, 0.45, hit(P, T + 0.15), EXT_TOUT, 0, 'R8');
    ctx.later(t2, this, 0, T, 0); ctx.later(t3, this, 0, T, 0);
    return { last: t3 + T, end: t3 + T + 0.45 };
  }, later(ctx, t, i, P, T) { ray(ctx, t, T, 0.45, hit(P, T + 0.15), EXT_TOUT, 0, 'R8'); } },
  R9: { tb: 0.75, n: 6, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.75), s = P.rnd() < 0.5 ? 1 : -1, ph = P.rnd() < 0.5 ? 1 : 0, b = P.th + 30 * D2R;
    for (let k = 0; k < 6; k++) { const h = ray(ctx, t, T, 4.0, b + k * 60 * D2R, EXT_INT, s * 25 * D2R * P.kv, 'R9'); h.alt = 0.8 * P.kt; h.altPh = (k & 1) ^ ph; }
    return { last: t + T, end: t + T + 4.0 };
  } },
  // ---------------- ARCS ----------------
  A1: { tb: 0.6, n: 1, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.6), v = 140 * P.kv; arc(ctx, t, T, true, v, 80 * D2R, 0, 'A1', 1, P.th + P.d * 60 * D2R);
    return { last: t + T, end: t + T + inTime(v) };
  } },
  A2: { tb: 0.6, n: 3, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.6), v = 140 * P.kv, G = P.th + P.d * 60 * D2R, dt = 0.6 * P.kt;
    arc(ctx, t, T, true, v, 80 * D2R, 0, 'A2', 1, G);
    arc(ctx, t + dt, T, true, v, 80 * D2R, 0, 'A2', 1, G + P.m * A2_STEP * D2R);
    arc(ctx, t + 2 * dt, T, true, v, 80 * D2R, 0, 'A2', 1, G);
    return { last: t + 2 * dt + T, end: t + 2 * dt + T + inTime(v) };
  } },
  A3: { tb: 0.6, n: 1, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.6), v = 120 * P.kv; arc(ctx, t, T, false, v, 80 * D2R, 0, 'A3', 1, P.th + P.d * 90 * D2R);
    return { last: t + T, end: t + T + outTime(v) };
  } },
  A4: { tb: 0.6, n: 2, ecl: 0, build(ctx, t, P) {
    // IN : brèche là où sera le joueur quand l'IN croise EXT. OUT : part 0,65 s ×k après l'IN, brèche là où sera le
    // joueur quand l'OUT croise INT (ajustement validé par le solveur, cf. NOTES : la version « G + 180° » n'a pas de solution).
    const T = tel(P, 0.6), v = 140 * P.kv, G = hit(P, T + 40 / v), taIn = t + T, taOut = taIn + A4_DELAY * P.kt;
    arc(ctx, t, T, true, v, 90 * D2R, 0, 'A4', 1, G);
    arc(ctx, taOut - T, T, false, v, 90 * D2R, 0, 'A4', 1, hit(P, taOut - t + (R_INT - R_EMIT) / v));
    return { last: taOut, end: taOut + outTime(v) };
  } },
  A5: { tb: 0.6, n: 2, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.6), v = 140 * P.kv, g = hit(P, 0.5), q = Math.PI / 2, t2 = t + 0.45 * P.kt, o = P.m * Math.PI / 4;
    arc(ctx, t, T, false, v, A5_GAP * D2R, 0, 'A5', 4, g, g + q, g + 2 * q, g + 3 * q);
    arc(ctx, t2, T, false, v, A5_GAP * D2R, 0, 'A5', 4, g + o, g + o + q, g + o + 2 * q, g + o + 3 * q);
    return { last: t2 + T, end: t2 + T + outTime(v) };
  } },
  A6: { tb: 0.6, n: 1, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.6), v = 90 * P.kv; arc(ctx, t, T, true, v, 90 * D2R, P.d * 0.6 * P.w, 'A6', 1, P.th + P.d * 30 * D2R);
    return { last: t + T, end: t + T + inTime(v) };
  } },
  A7: { tb: 0.6, n: 3, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.6), v = 200 * P.kv, G = hit(P, 0.6), dt = 0.5 * P.kt;
    for (let i = 0; i < 3; i++) { const g = G + P.m * i * Math.PI / 2; arc(ctx, t + i * dt, T, true, v, 60 * D2R, 0, 'A7', 2, g, g + Math.PI); }
    return { last: t + 2 * dt + T, end: t + 2 * dt + T + inTime(v) };
  } },
  // ---------------- ÉCLATS ----------------
  E1: { tb: 0.5, n: 8, ecl: 8, build(ctx, t, P) {
    const T = tel(P, 0.5), v = 150 * P.kv, b = hit(P, T + 0.4);
    for (let k = 0; k < 8; k++) { const a = b + k * Math.PI / 4; if (!nearOrb(P, a)) ecl(ctx, t, T, a, false, v, 0, 'E1'); }
    return { last: t + T, end: t + T + outTime(v) };
  } },
  E2: { tb: 0.5, n: 26, ecl: 26, build(ctx, t, P) {
    const T = tel(P, 0.5), v = 150 * P.kv, s = P.rnd() < 0.5 ? 1 : -1, a0 = P.th + P.d * 150 * D2R;
    for (let i = 0; i < 26; i++) { const a = a0 + s * i * 20 * D2R; if (!nearOrb(P, a)) ecl(ctx, t + i * 0.07, T, a, false, v, 0, 'E2'); }
    const last = t + 25 * 0.07 + T; return { last, end: last + outTime(v) };
  } },
  E3: { tb: 0.5, n: 50, ecl: 50, build(ctx, t, P) {
    const T = tel(P, 0.5), v = 150 * P.kv, s = P.rnd() < 0.5 ? 1 : -1, a0 = P.th + P.d * 150 * D2R;
    for (let i = 0; i < 25; i++) for (let arm = 0; arm < 2; arm++) ecl(ctx, t + i * 0.08, T, a0 + arm * Math.PI + s * i * 20 * D2R, false, v, 0, 'E3');
    const last = t + 24 * 0.08 + T; return { last, end: last + outTime(v) };
  } },
  E4: { tb: 0.5, n: 10, ecl: 10, build(ctx, t, P) {
    const T = tel(P, 0.5), v = 130 * P.kv, dt = 0.12 * P.kt;
    this.later(ctx, t, 0, P, T, P.rnd());
    for (let i = 1; i < 10; i++) ctx.later(t + i * dt, this, i, T, P.rnd());
    const last = t + 9 * dt + T; return { last, end: last + inTime(v) };
  }, later(ctx, t, i, P, T, u) {
    // angle aléatoire hors de ±25° autour de θhit à l'instant où l'éclat atteindra l'orbite du joueur
    const v = 130 * P.kv, arrive = T + (R_EDGE - (P.L ? R_EXT : R_INT)) / v, ex = hit(P, arrive);
    ecl(ctx, t, T, ex + (25 + u * 310) * D2R, true, v, 0, 'E4');
  } },
  E5: { tb: 0.5, n: 12, ecl: 12, build(ctx, t, P) {
    const T = tel(P, 0.5), v = 110 * P.kv, wa = 80 * D2R * P.kv;
    for (let k = 0; k < 12; k++) ecl(ctx, t, T, P.th + (15 + 30 * k) * D2R, true, v, (k & 1 ? -1 : 1) * P.m * wa, 'E5');
    return { last: t + T, end: t + T + inTime(v) };
  } },
  E6: { tb: 0.5, n: 15, ecl: 15, build(ctx, t, P) {
    const T = tel(P, 0.5), v = 190 * P.kv, dt = 0.4 * P.kt;
    this.later(ctx, t, 0, P, T, 0); ctx.later(t + dt, this, 1, T, 0); ctx.later(t + 2 * dt, this, 2, T, 0);
    const last = t + 2 * dt + T; return { last, end: last + outTime(v) };
  }, later(ctx, t, i, P, T) {
    const v = 190 * P.kv, b = hit(P, T + 0.35);
    for (let k = -2; k <= 2; k++) ecl(ctx, t, T, b + k * 10 * D2R, false, v, 0, 'E6');
  } },
  // ---------------- ORBITES ----------------
  O1: { tb: 0.9, n: 1, ecl: 0, build(ctx, t, P) { const T = tel(P, 0.9); orb(ctx, t, T, 1.2, P.lane >= 0 ? P.lane : P.L, 0, TAU, 'O1'); return { last: t + T, end: t + T + 1.2 }; } },
  O2: { tb: 0.9, n: 1, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.9), c = P.opp ? P.th - P.d * P.w * (T + 0.3) : hit(P, T + 0.3);
    orb(ctx, t, T, 1.0, P.L, c, 120 * D2R, 'O2'); return { last: t + T, end: t + T + 1.0 };
  } },
  O3: { tb: 0.9, n: 4, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.9), a0 = t + T, k = P.kt, W = [[0, 0, 0.8], [1, 1.05, 1.85], [0, 2.1, 2.9], [1, 3.15, 3.95]];
    for (const [lane, s, e] of W) orb(ctx, a0 + s * k - T, T, (e - s) * k, lane, 0, TAU, 'O3');
    return { last: a0 + 3.15 * k, end: a0 + 3.95 * k };
  } },
  // ---------------- CORPS ----------------
  C1: { tb: 0.75, n: 1, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.75); sat(ctx, t, T, 3.5, P.L, P.th + Math.PI, -P.d * 0.9 * P.w, 'C1'); return { last: t + T, end: t + T + BODY_END };
  } },
  C2: { tb: 0.75, n: 2, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.75);
    sat(ctx, t, T, 4.0, 0, P.th + Math.PI, -P.d * 0.9 * P.w, 'C2');
    sat(ctx, t, T, 4.0, 1, P.th + Math.PI, P.d * 0.6 * P.w, 'C2');
    return { last: t + T, end: t + T + BODY_END + 0.3 };
  } },
  C3: { tb: 0.6, n: 5, ecl: 0, build(ctx, t, P) {
    // 5 mines à 72° : celle qui tomberait sur le joueur (< 50°) est omise → 4 mines (cf. NOTES)
    const T = tel(P, 0.6), ta = t + T, ts = ta + 0.3 * P.kt, Ts = tel(P, 0.75);
    for (let k = 1; k <= 4; k++) mine(ctx, t, T, 3.0, 1, P.th + k * 72 * D2R, 'C3');
    ctx.later(ts, this, 0, Ts, 0);
    return { last: ts + Ts, end: Math.max(ta + 3.0, ts + Ts + BODY_END) };
  }, later(ctx, t, i, P, Ts) { sat(ctx, t, Ts, 3.5, 0, P.th + Math.PI, -P.d * 0.9 * P.w, 'C3'); } },
  C4: { tb: 0.75, n: 3, ecl: 0, build(ctx, t, P) {
    const T = tel(P, 0.75), ws = P.d * 0.5 * P.w;
    for (const o of [60, 180, 300]) sat(ctx, t, T, 4.0, 0, P.th + P.d * o * D2R, ws, 'C4');
    return { last: t + T, end: t + T + BODY_END + 0.3 };
  } },
};
