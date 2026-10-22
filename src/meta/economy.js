// Économie (GAME_DESIGN §9–10) : gains de fin de partie, modules, emplacements, noyaux. Fonctions pures sur la sauvegarde.
import { MODULES, MODULE_IDS, SLOT_COSTS, SLOT3_STARS, CORES, CORE_IDS, PROSPECTEUR, BAPTISM } from '../core/data.js';

// Niveaux des modules équipés (0 si non équipé). Orbite du jour : modules désactivés.
export function equippedMods(save, daily = false) {
  const m = {}; for (const id of MODULE_IDS) m[id] = 0;
  if (daily) return m;
  for (const id of save.equipped) if (save.modules[id] > 0) m[id] = save.modules[id];
  return m;
}
// Σ 3·(n−1) pour n = 2..min(palier, 10), +30 par palier SINGULARITÉ +k
export function palierBonus(palier) {
  let b = 0; for (let n = 2; n <= Math.min(10, palier); n++) b += 3 * (n - 1);
  if (palier > 10) b += 30 * (palier - 10);
  return b;
}
export function runGains(result, prospLevel = 0) {
  const fromPhotons = result.photons | 0, fromTime = Math.floor(result.time / 2), fromGrazes = Math.floor(result.grazes / 3), fromPaliers = palierBonus(result.palier);
  const base = fromPhotons + fromTime + fromGrazes + fromPaliers;
  const mult = CORES[result.core].mult, prosp = PROSPECTEUR[prospLevel] || 0;
  const total = Math.max(5, Math.ceil(base * mult * (1 + prosp) - 1e-9));
  return { fromPhotons, fromTime, fromGrazes, fromPaliers, base, mult, prosp, total };
}
export { BAPTISM };

// ---------- modules ----------
export function moduleCost(save, id) { const lv = save.modules[id]; return lv >= 3 ? null : MODULES[id].costs[lv]; }
export function canBuyModule(save, id) { const c = moduleCost(save, id); return c !== null && save.photons >= c; }
export function buyModule(save, id) {
  const c = moduleCost(save, id);
  if (c === null || save.photons < c) return { ok: false };
  save.photons -= c; save.modules[id]++;
  // un module acheté pour la 1re fois est équipé s'il reste un emplacement
  if (save.modules[id] === 1 && !save.equipped.includes(id) && save.equipped.length < save.slots) save.equipped.push(id);
  return { ok: true, level: save.modules[id], cost: c };
}
export function toggleEquip(save, id) {
  const i = save.equipped.indexOf(id);
  if (i >= 0) { save.equipped.splice(i, 1); return true; }
  if (save.modules[id] <= 0) return false;
  if (save.equipped.length >= save.slots) return false;
  save.equipped.push(id); return true;
}
export function totalStars(save) { let n = 0; for (const id of CORE_IDS) for (const s of save.cores[id].stars) if (s) n++; return n; }
export function nextSlot(save) {
  if (save.slots >= 3) return null;
  const cost = SLOT_COSTS[save.slots], needStars = save.slots === 2 ? SLOT3_STARS : 0;
  return { index: save.slots + 1, cost, needStars, starsOk: totalStars(save) >= needStars, affordable: save.photons >= cost && totalStars(save) >= needStars };
}
export function buySlot(save) {
  const n = nextSlot(save); if (!n || !n.affordable) return { ok: false };
  save.photons -= n.cost; save.slots++; return { ok: true, slots: save.slots };
}
// Achat le moins cher possible (modules), pour « ACHETER & REJOUER » et la pastille de l'Atelier
export function cheapestAffordable(save) {
  let best = null;
  for (const id of MODULE_IDS) { const c = moduleCost(save, id); if (c !== null && c <= save.photons && (!best || c < best.cost)) best = { id, level: save.modules[id] + 1, cost: c }; }
  return best;
}
export function anyPurchase(save) {
  if (cheapestAffordable(save)) return true;
  const s = nextSlot(save); return !!(s && s.affordable);
}

// ---------- noyaux ----------
export function coreStatus(save, id) {
  const C = CORES[id], st = save.cores[id];
  if (st.unlocked) return { unlocked: true };
  const [prev, need] = C.cond, best = save.cores[prev].bestTime;
  return { unlocked: false, prev, need, best, condOk: best >= need, cost: C.cost, affordable: best >= need && save.photons >= C.cost, progress: Math.min(1, best / need) };
}
export function unlockCore(save, id) {
  const s = coreStatus(save, id); if (s.unlocked || !s.affordable) return { ok: false };
  save.photons -= s.cost; save.cores[id].unlocked = true; return { ok: true };
}
export function unlockedCores(save) { return CORE_IDS.filter(id => save.cores[id].unlocked); }
// Total des dépenses possibles (≈ 19 500 ✦)
export function totalSink() {
  let m = 0; for (const id of MODULE_IDS) for (const c of MODULES[id].costs) m += c;
  const s = SLOT_COSTS[1] + SLOT_COSTS[2]; let c = 0; for (const id of CORE_IDS) c += CORES[id].cost;
  return { modules: m, slots: s, cores: c, total: m + s + c };
}
