// ORBIT — données normatives (GAME_DESIGN.md). Aucune dépendance au DOM : partagé par la sim, la méta et les tests.

export const TAU = Math.PI * 2, D2R = Math.PI / 180;
export const STEP = 1 / 120;                 // pas de simulation (s)

// ---------- Géométrie (u) §3.1 ----------
export const R_CORE = 30, R_EMIT = 34, R_INT = 92, R_MID = 115, R_EXT = 138, R_BEZEL = 168, R_EDGE = 178, R_KILL = 196;
export const PR = 4;                          // rayon de la hitbox du joueur
export const GRAZE = 12, PERFECT = 4;         // marge de frôlement, seuil du parfait (bord à bord)
export const RADIAL_V = 383;                  // u/s (46 u en 120 ms)
export const HOLD_MS = 140;
export const HOLD_CHOICES = [110, 140, 180];
export const MIN_TEL = 0.38;
export const laneR = l => (l ? R_EXT : R_INT);

// ---------- Primitives §4 ----------
export const K = { RAY: 0, ARC: 1, ECL: 2, ORB: 3, SAT: 4, MIN: 5 };
export const TEL_BASE = [0.75, 0.60, 0.50, 0.90, 0.75, 0.60];
export const HIT = { RAY: 4.5, ARC: 3.5, ECL: 3.5, ORB: 3, SAT: 7, MIN: 6 };
export const EXT_TOUT = 0, EXT_INT = 1, EXT_EXT = 2; // extents de rayon
export const EXTENTS = [[R_EMIT, R_EDGE], [R_EMIT, R_MID], [R_MID, R_EDGE]];

// ---------- Paliers §6.1 ----------
// [début s, nom, ω °/s, k_tel, k_v, pause, p_chev]
export const PALIERS = [
  [0, 'POUSSIÈRE', 120, 1.00, 1.00, 0.80, 0],
  [10, 'ASTÉROÏDE', 132, 0.96, 1.05, 0.70, 0],
  [20, 'LUNE', 145, 0.92, 1.10, 0.60, 0.10],
  [30, 'PLANÈTE', 158, 0.88, 1.16, 0.52, 0.15],
  [45, 'ÉTOILE', 170, 0.84, 1.22, 0.45, 0.20],
  [60, 'GÉANTE', 182, 0.80, 1.28, 0.38, 0.30],
  [75, 'NOVA', 195, 0.76, 1.34, 0.32, 0.40],
  [90, 'MAGNÉTAR', 208, 0.72, 1.40, 0.27, 0.45],
  [105, 'QUASAR', 222, 0.69, 1.46, 0.22, 0.50],
  [120, 'SINGULARITÉ', 236, 0.66, 1.52, 0.18, 0.55],
];
// Paramètres du palier n (1-based), y compris SINGULARITÉ +k.
export function palierParams(n) {
  if (n <= 10) { const p = PALIERS[n - 1]; return { n, start: p[0], name: p[1], w: p[2], kt: p[3], kv: p[4], pause: p[5], pchev: p[6], phase: n >= 7 ? 3 : n >= 4 ? 2 : 1 }; }
  const k = n - 10;
  return {
    n, start: 120 + 15 * k, name: 'SINGULARITÉ +' + k,
    w: Math.min(280, 236 + 8 * k), kt: Math.max(0.58, +(0.66 - 0.02 * k).toFixed(4)), kv: Math.min(1.70, +(1.52 + 0.04 * k).toFixed(4)),
    pause: Math.max(0.12, +(0.18 - 0.02 * k).toFixed(4)), pchev: Math.min(0.80, +(0.55 + 0.05 * k).toFixed(4)), phase: 3,
  };
}
export function palierAt(t) {
  if (t < 120) { let n = 1; for (let i = 1; i < 10; i++) if (t >= PALIERS[i][0]) n = i + 1; return n; }
  return 10 + Math.floor((t - 120) / 15);
}
export function palierName(n) { return palierParams(n).name; }

// ---------- Multiplicateur §7.2 ----------
export const TIERS = [1, 2, 3, 4, 5, 6, 8];
export const NEED = [3, 4, 5, 6, 7, 8];
export const DECAY_DELAY = 3.0, DECAY_STEP = 0.4, SURCHARGE_T = 6.0;

// ---------- Photons §8.1 ----------
export const PHOTON = { every: 2.2, max: 2, life: 4.0, pick: 12, cluster: 20 };

// ---------- Résonances §8.2 ----------
export const RESONANCES = {
  halo: { name: 'HALO', max: 1, w: 1, minPal: 4, desc: '+1 charge de bouclier' },
  echo: { name: 'ÉCHO', max: 3, w: 3, desc: 'Frôlement +3 u' },
  lenteur: { name: 'LENTEUR', max: 3, w: 3, desc: 'Télégraphes ×1,08' },
  avidite: { name: 'AVIDITÉ', max: 3, w: 3, desc: '+1 Photon par ramassage' },
  ferveur: { name: 'FERVEUR', max: 2, w: 2, desc: '−1 pastille par rang' },
  eclat: { name: 'ÉCLAT', max: 3, w: 3, desc: 'Score ×1,25' },
  phase: { name: 'PHASE', max: 2, w: 2, desc: 'Changement d’orbite +20 %' },
  precision: { name: 'PRÉCISION', max: 2, w: 2, desc: 'Parfait +2 u' },
  reflexe: { name: 'RÉFLEXE', max: 2, w: 1, desc: '+1 ralenti réflexe' },
};
export const RES_IDS = Object.keys(RESONANCES);

// ---------- Modules §10.1 ----------
export const MODULES = {
  echo: { name: 'ÉCHO', costs: [25, 140, 500], icon: 'echo' },
  aimant: { name: 'AIMANT', costs: [30, 160, 550], icon: 'aimant' },
  inertie: { name: 'INERTIE', costs: [60, 260, 850], icon: 'inertie' },
  dephaseur: { name: 'DÉPHASEUR', costs: [70, 300, 900], icon: 'dephaseur' },
  reflexe: { name: 'RÉFLEXE', costs: [80, 320, 1000], icon: 'reflexe' },
  prospecteur: { name: 'PROSPECTEUR', costs: [100, 420, 1300], icon: 'prospecteur' },
  bouclier: { name: 'BOUCLIER', costs: [120, 450, 1400], icon: 'bouclier' },
  elan: { name: 'ÉLAN', costs: [150, 550, 1600], icon: 'elan' },
};
export const MODULE_IDS = Object.keys(MODULES);
export const SLOT_COSTS = [0, 250, 1200];     // emplacement 2 : 250 ; 3 : 1 200 + 10 étoiles
export const SLOT3_STARS = 10;
export function moduleEffect(id, lv) {
  if (!lv) return '—';
  switch (id) {
    case 'echo': return `Frôlement +${[0, 3, 6, 9][lv]} u`;
    case 'aimant': return `Ramassage +${[0, 8, 16, 26][lv]} u`;
    case 'inertie': return `Déclin retardé de +${lv} s`;
    case 'dephaseur': return `Changement d’orbite ${[0, 100, 85, 70][lv]} ms`;
    case 'reflexe': return lv === 3 ? '3 ralentis réflexes (0,8 s)' : `${lv} ralenti${lv > 1 ? 's' : ''} réflexe${lv > 1 ? 's' : ''}`;
    case 'prospecteur': return `Photons de fin +${[0, 15, 30, 50][lv]} %`;
    case 'bouclier': return ['', 'Absorbe 1 coup', '+ invuln. 1,5 s, mult. conservé', '+ recharge 40 s'][lv];
    case 'elan': return `Départ à ×${[1, 2, 3, 4][lv]}`;
  }
  return '';
}

// ---------- Noyaux §10.2 ----------
export const CORES = {
  atlas: { name: 'ATLAS', mult: 1.0, col: '#5FA8FF', acc: '#BFD9FF', bg: '#123A7A', stars: '#BFD4FF', tag: 'le métronome — rayons', cond: null, cost: 0, star5: 30000 },
  vesta: { name: 'VESTA', mult: 1.2, col: '#A77BFF', acc: '#D9C6FF', bg: '#3A1E7A', stars: '#E2D4FF', tag: 'la fleur — arcs, spirales', cond: ['atlas', 40], cost: 150, star5: 40000 },
  kepler: { name: 'KEPLER', mult: 1.4, col: '#3EE0C8', acc: '#B5FFF2', bg: '#0E4D52', stars: '#C8FFF6', tag: 'l’horloger — corps, orbites', cond: ['vesta', 50], cost: 400, star5: 50000 },
  selene: { name: 'SÉLÈNE', mult: 1.6, col: '#C9D6FF', acc: '#FFFFFF', bg: '#2A3352', stars: '#E6ECFF', tag: 'le miroir — lasers croisés', cond: ['kepler', 60], cost: 900, star5: 60000 },
  nyx: { name: 'NYX', mult: 1.8, col: '#6A5CFF', acc: '#9A8CFF', bg: '#1A1452', stars: '#C9C2FF', tag: 'le gouffre — tout vient du dehors', cond: ['selene', 60], cost: 1800, star5: 75000 },
  zenith: { name: 'ZÉNITH', mult: 2.0, col: '#7FB2FF', acc: '#FFFFFF', bg: '#1E2A5A', stars: '#FFFFFF', tag: 'le prisme — tous les motifs', cond: ['nyx', 75], cost: 3500, star5: 100000 },
};
export const CORE_IDS = Object.keys(CORES);
export const STAR_TIMES = [20, 45, 75, 120];
export const STAR_REWARDS = [15, 30, 60, 120, 80];

// Pools §5.6 : [code, poids] par phase (cumulatifs).
export const POOLS = {
  atlas: [[['R1', 3], ['R2', 3], ['A1', 3], ['E1', 2], ['R3', 2], ['O1', 1]], [['R4', 2], ['R5', 2], ['A2', 2], ['E6', 1]], [['R6', 2], ['R8', 2]]],
  vesta: [[['A3', 3], ['E2', 3], ['A1', 2], ['A5', 1], ['R1', 1], ['O1', 1]], [['A2', 2], ['A6', 2], ['E3', 1], ['A4', 2]], [['A4', 3], ['E3', 2], ['R4', 1]]],
  kepler: [[['C1', 3], ['O2', 3], ['O1', 2], ['R1', 1], ['A1', 1]], [['C4', 2], ['C2', 2], ['O3', 2]], [['C3', 3], ['O3', 2], ['R5', 1]]],
  selene: [[['R2', 2], ['R3', 3], ['R4', 2], ['O1', 2], ['R1', 1]], [['R6', 3], ['R7', 2], ['R5', 2]], [['R7', 3], ['R8', 2], ['R9', 1]]],
  nyx: [[['E4', 3], ['A1', 2], ['A6', 2], ['O1', 2]], [['E5', 3], ['A7', 3], ['C1', 1]], [['A7', 3], ['E5', 2], ['O3', 2]]],
};
// ZÉNITH : tous les motifs de tous les noyaux, poids 1, + R9 (2).
POOLS.zenith = (() => {
  const set = new Set(); for (const c of ['atlas', 'vesta', 'kepler', 'selene', 'nyx']) for (const ph of POOLS[c]) for (const [m] of ph) set.add(m);
  const list = [...set].sort().map(m => [m, m === 'R9' ? 2 : 1]);
  return [list, [], []];
})();
export const ZENITH_OFFSET = 20;
// Cadence par noyau (ajout dev, cf. NOTES) : multiplie la pause entre motifs. KEPLER et NYX (motifs longs mais peu
// létaux) enchaînent plus vite pour respecter « chaque noyau ≈ −15 % de survie ».
export const CORE_PAUSE = { atlas: 1, vesta: 1.15, kepler: 0.6, selene: 1, nyx: 0.4, zenith: 1 };

// Paires autorisées §5.7 (premier = motif tiré)
// Options de placement du 2e motif d'une paire (cf. NOTES) : R1+O2 segment opposé (spec) ; R4+O1 et A3+O1 :
// l'O1 est posé sur EXT (sinon il impose l'orbite extérieure, où un seul doigt ne peut pas faire demi-tour).
export const PAIR_OPTS = { 'R1+O2': { opp: true }, 'R4+O1': { lane: 1 }, 'A3+O1': { lane: 1 } };
export const PAIRS = [['E2', 'O1'], ['A1', 'C1'], ['A3', 'O1'], ['R1', 'O2'], ['E1', 'C4'], ['R2', 'E2'], ['R5', 'E4'], ['A6', 'C1'], ['E5', 'O2'], ['R4', 'O1']];

// ---------- Économie §9 ----------
export const BAPTISM = 40;
export const PROSPECTEUR = [0, 0.15, 0.30, 0.50];

// ---------- Défis du jour §10.4 ----------
export const CHALLENGES = {
  D1: { text: 'Frôler des dangers', target: 60, base: 40, kind: 'sum', stat: 'grazes' },
  D2: { text: 'Atteindre ×6 en une partie', target: 1, base: 50, kind: 'flag', test: r => r.multMax >= 6 },
  D3: { text: 'Ramasser des Photons', target: 40, base: 40, kind: 'sum', stat: 'photons' },
  D4: { text: 'Atteindre PLANÈTE (parties)', target: 3, base: 50, kind: 'count', test: r => r.palier >= 4 },
  D5: { text: 'Frôlements parfaits en une partie', target: 6, base: 60, kind: 'max', stat: 'perfects' },
  D6: { text: 'Jouer des parties', target: 6, base: 30, kind: 'count', test: () => true },
  D7: { text: 'Rester 15 s sur l’orbite extérieure en une partie', target: 1, base: 50, kind: 'flag', test: r => r.extTime >= 15 },
  D8: { text: 'Faire demi-tour', target: 200, base: 30, kind: 'sum', stat: 'flips' },
  D9: { text: 'Déclencher une SURCHARGE', target: 1, base: 70, kind: 'flag', test: r => r.surcharges >= 1 },
  D10: { text: 'Prendre 4 Résonances en une partie', target: 1, base: 50, kind: 'flag', test: r => r.resonances >= 4 },
  D11: { text: 'Battre un record de temps', target: 1, base: 60, kind: 'flag', test: r => !!r.newTimeRecord },
  D12: { text: 'Tenir 45 s sur le dernier noyau débloqué', target: 1, base: 70, kind: 'flag', test: r => r.onLastCore && r.time >= 45 },
};
export const CHALLENGE_IDS = Object.keys(CHALLENGES);
export const DAILY_BONUS = 100, ORBIT_DAY_REWARD = 50;

// ---------- Trophées §10.6 ----------
export const TROPHIES = {
  T1: { name: 'Première orbite', desc: 'Finir une partie', reward: 20 },
  T2: { name: 'Huit', desc: 'Atteindre ×8', reward: 60 },
  T3: { name: 'Surtension', desc: '3 SURCHARGES en une partie', reward: 120 },
  T4: { name: 'Frôleur', desc: '1 000 frôlements (cumul)', reward: 100 },
  T5: { name: 'Orfèvre', desc: '100 frôlements parfaits (cumul)', reward: 100 },
  T6: { name: 'Fidèle', desc: 'Tenir 60 s sans changer d’orbite', reward: 80 },
  T7: { name: 'Droit devant', desc: 'Tenir 30 s sans faire demi-tour', reward: 80 },
  T8: { name: 'Système complet', desc: 'Débloquer les 6 noyaux', reward: 200 },
  T9: { name: 'Constellation', desc: '15 étoiles', reward: 150 },
  T10: { name: 'Voûte céleste', desc: '30 étoiles', reward: 400 },
  T11: { name: 'Horizon des événements', desc: 'Atteindre SINGULARITÉ sur ZÉNITH', reward: 300 },
  T12: { name: 'Artisan', desc: 'Acheter un module niveau 3', reward: 50 },
  T13: { name: 'Rituel', desc: 'Orbite du jour 7 jours d’affilée', reward: 150 },
  T14: { name: 'Harmonie', desc: 'Prendre 9 Résonances en une partie', reward: 120 },
  T15: { name: 'Toupie', desc: '10 000 demi-tours (cumul)', reward: 100 },
};
export const TROPHY_IDS = Object.keys(TROPHIES);

// ---------- Sillages §10.3 ----------
export const TRAILS = [
  { id: 'ivoire', name: 'IVOIRE', stars: 0, col: '#FFF1CC' },
  { id: 'givre', name: 'GIVRE', stars: 5, col: '#BFE3FF' },
  { id: 'aurore', name: 'AURORE', stars: 10, col: '#5CFFB0', col2: '#A77BFF' },
  { id: 'or', name: 'OR', stars: 15, col: '#FFD45C' },
  { id: 'comete', name: 'COMÈTE', stars: 20, col: '#FFFFFF', long: true },
  { id: 'prisme', name: 'PRISME', stars: 25, col: '#5FA8FF', cycle: true },
  { id: 'eclipse', name: 'ÉCLIPSE', stars: 30, col: '#0A0C14', ring: '#FFFFFF' },
];

// Noms affichés des motifs (cause de la mort)
export const MOTIF_NAMES = {
  R1: 'PIQUE', R2: 'PORTE', R3: 'GUICHET', R4: 'PEIGNE', R5: 'BALAYAGE', R6: 'CROIX', R7: 'CROIX ALTERNÉE', R8: 'ÉCLAIRS', R9: 'PRISME',
  A1: 'COURONNE', A2: 'ESCALIER', A3: 'FLORAISON', A4: 'MARÉES', A5: 'PÉTALES', A6: 'ÉCLIPSE', A7: 'HORIZON',
  E1: 'RAFALE', E2: 'SPIRALE', E3: 'DOUBLE SPIRALE', E4: 'PLUIE', E5: 'ACCRÉTION', E6: 'SALVE',
  O1: 'ORBITE INTERDITE', O2: 'SEGMENT', O3: 'NŒUD', C1: 'SATELLITE', C2: 'RELAIS', C3: 'CHAPELET', C4: 'GARDIENS', TUTO: 'TUTORIEL',
};
export const MOTIF_CODES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'O1', 'O2', 'O3', 'C1', 'C2', 'C3', 'C4'];
export const MOTIF_MIN_PAL = { R1: 1, R2: 1, R3: 2, R4: 3, R5: 4, R6: 5, R7: 6, R8: 6, R9: 7, A1: 1, A2: 2, A3: 1, A4: 5, A5: 2, A6: 3, A7: 5, E1: 1, E2: 1, E3: 5, E4: 2, E5: 4, E6: 4, O1: 2, O2: 2, O3: 5, C1: 1, C2: 4, C3: 5, C4: 3 };

// Fonctions utilitaires
export const angd = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d <= -Math.PI) d += TAU; return d; };
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function localDateStr(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth() + 1, j = d.getDate();
  return `${y}-${m < 10 ? '0' : ''}${m}-${j < 10 ? '0' : ''}${j}`;
}
export function dayNumber(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }
