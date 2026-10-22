// Sauvegarde localStorage (GAME_DESIGN §14) : clé versionnée, copie .bak avant chaque écriture, migration + fusion profonde.
import { MODULE_IDS, CORE_IDS, TROPHY_IDS, localDateStr } from '../core/data.js';

export const SAVE_KEY = 'orbit.save.v1';
export const BAK_KEY = 'orbit.save.v1.bak';
// v1 : schéma de la spec. v2 : `stats.photonsTotal`/`bestPalier` par noyau et `daily.orbitTries` (ajouts dev, cf. NOTES).
export const CURRENT_VERSION = 2;

export function emptyCore(unlocked) { return { unlocked, bestTime: 0, bestScore: 0, bestMult: 1, bestPalier: 0, stars: [false, false, false, false, false], top: [] }; }

export function defaultSave(today = localDateStr()) {
  const modules = {}; for (const id of MODULE_IDS) modules[id] = 0;
  const cores = {}; for (const id of CORE_IDS) cores[id] = emptyCore(id === 'atlas');
  const trophies = {}; for (const id of TROPHY_IDS) trophies[id] = false;
  return {
    v: CURRENT_VERSION,
    photons: 0,
    photonsTotal: 0,
    baptismDone: false,
    modules,
    slots: 1,
    equipped: ['echo'],
    cores,
    selectedCore: 'atlas',
    trail: 'ivoire',
    daily: { date: '', list: [], bonusClaimed: false, orbitBest: 0, orbitRewarded: false, streak: 0, lastOrbitDate: null, history: [], orbitTries: 0 },
    trophies,
    stats: { runs: 0, playTimeS: 0, grazes: 0, perfects: 0, flips: 0, surcharges: 0, resonances: 0, maxNoSwapS: 0, maxNoFlipS: 0, photonsTotal: 0 },
    settings: { sfx: 0.8, music: 0.6, vibration: true, reducedMotion: 'system', fps: 'auto', holdMs: 140, quality: 'auto', showFps: false },
    tutorialDone: false,
  };
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
// Fusion profonde : toute clé manquante dans `obj` est prise dans `def`.
export function deepMerge(def, obj) {
  if (!isObj(obj)) return clone(def);
  const out = clone(def);
  for (const k of Object.keys(obj)) {
    if (isObj(def[k]) && isObj(obj[k])) out[k] = deepMerge(def[k], obj[k]);
    else if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

export function migrate(save) {
  let s = isObj(save) ? clone(save) : {};
  const from = typeof s.v === 'number' ? s.v : 0;
  // v0 → v1 : sauvegarde sans numéro → simple fusion.
  // v1 → v2 : meilleur palier par noyau déduit du meilleur temps ; cumul de Photons recopié dans stats.
  if (from < 2) {
    if (isObj(s.cores)) for (const id of Object.keys(s.cores)) {
      const c = s.cores[id]; if (!isObj(c)) continue;
      if (typeof c.bestPalier !== 'number') {
        const t = (c.bestTime || 0) + (id === 'zenith' ? 20 : 0);
        c.bestPalier = c.bestTime > 0 ? (t < 120 ? [0, 10, 20, 30, 45, 60, 75, 90, 105, 120].filter(x => t >= x).length : 10 + Math.floor((t - 120) / 15)) : 0;
      }
    }
    if (isObj(s.stats) && typeof s.stats.photonsTotal !== 'number' && typeof s.photonsTotal === 'number') s.stats.photonsTotal = s.photonsTotal;
  }
  const merged = deepMerge(defaultSave(), s);
  merged.v = CURRENT_VERSION;
  for (const id of CORE_IDS) {
    const c = merged.cores[id];
    if (!Array.isArray(c.stars) || c.stars.length !== 5) c.stars = [0, 1, 2, 3, 4].map(i => !!(Array.isArray(c.stars) && c.stars[i]));
    if (!Array.isArray(c.top)) c.top = [];
    c.top = c.top.slice(0, 5);
  }
  merged.cores.atlas.unlocked = true;
  if (!CORE_IDS.includes(merged.selectedCore) || !merged.cores[merged.selectedCore].unlocked) merged.selectedCore = 'atlas';
  merged.slots = Math.max(1, Math.min(3, merged.slots | 0));
  merged.equipped = (Array.isArray(merged.equipped) ? merged.equipped : []).filter((m, i, a) => MODULE_IDS.includes(m) && a.indexOf(m) === i).slice(0, merged.slots);
  if (![110, 140, 180].includes(merged.settings.holdMs)) merged.settings.holdMs = 140;
  return merged;
}

function parse(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try { const o = JSON.parse(raw); return isObj(o) && typeof o.photons === 'number' ? o : null; } catch { return null; }
}
export function loadSave(storage) {
  let raw = null, bak = null;
  try { raw = storage.getItem(SAVE_KEY); } catch { /* stockage indisponible */ }
  const main = parse(raw);
  if (main) return { save: migrate(main), source: 'main' };
  try { bak = storage.getItem(BAK_KEY); } catch { /* idem */ }
  const b = parse(bak);
  if (b) return { save: migrate(b), source: 'backup' };
  return { save: defaultSave(), source: 'new' };
}
export function writeSave(storage, save) {
  try {
    const old = storage.getItem(SAVE_KEY);
    if (old) storage.setItem(BAK_KEY, old);
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch { return false; }
}
export function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, _map: m };
}
