// Défis du jour et Orbite du jour (GAME_DESIGN §10.4–10.5), 100 % hors ligne, déterministes selon la date locale.
import { CHALLENGES, CHALLENGE_IDS, DAILY_BONUS, ORBIT_DAY_REWARD, dayNumber, CORE_IDS } from '../core/data.js';
import { mulberry32, hashString } from '../core/rng.js';

export function drawChallenges(date) {
  const r = mulberry32(hashString(date)), ids = CHALLENGE_IDS.slice(), out = [];
  for (let i = 0; i < 3; i++) out.push(ids.splice(Math.floor(r() * ids.length), 1)[0]);
  return out;
}
// Renouvelle au 1er lancement après minuit ; si la date système recule, on garde le jour le plus récent.
export function refreshDaily(save, today) {
  const d = save.daily;
  if (d.date === today || (d.date && today < d.date)) return false;
  if (d.date && d.orbitBest > 0) { d.history.push({ date: d.date, best: d.orbitBest }); d.history = d.history.slice(-7); }
  d.date = today;
  d.list = drawChallenges(today).map(id => ({ id, target: CHALLENGES[id].target, progress: 0, claimed: false }));
  d.bonusClaimed = false; d.orbitBest = 0; d.orbitRewarded = false; d.orbitTries = 0;
  return true;
}
export function challengeReward(save, id) {
  const n = CORE_IDS.filter(c => save.cores[c].unlocked).length;
  return Math.round(CHALLENGES[id].base * (1 + 0.25 * (n - 1)));
}
// Avance les défis avec le résultat d'une partie ; renvoie la liste des défis qui viennent d'être complétés.
export function applyRun(save, r) {
  const done = [];
  for (const c of save.daily.list) {
    const D = CHALLENGES[c.id]; if (c.progress >= c.target) continue;
    let p = c.progress;
    if (D.kind === 'sum') p += r[D.stat] | 0;
    else if (D.kind === 'max') p = Math.max(p, r[D.stat] | 0);
    else if (D.kind === 'count') p += D.test(r) ? 1 : 0;
    else if (D.kind === 'flag') p = D.test(r) ? 1 : p;
    c.progress = Math.min(c.target, p);
    if (c.progress >= c.target) done.push(c.id);
  }
  return done;
}
export function claimable(save) { return save.daily.list.filter(c => c.progress >= c.target && !c.claimed).length; }
export function claimChallenge(save, idx) {
  const c = save.daily.list[idx];
  if (!c || c.claimed || c.progress < c.target) return { ok: false };
  const reward = challengeReward(save, c.id); c.claimed = true; save.photons += reward; save.photonsTotal += reward;
  let bonus = 0;
  if (!save.daily.bonusClaimed && save.daily.list.every(x => x.claimed)) { save.daily.bonusClaimed = true; bonus = DAILY_BONUS; save.photons += bonus; save.photonsTotal += bonus; }
  return { ok: true, reward, bonus };
}
// Orbite du jour : graine = hash("AAAA-MM-JJ"), noyau = noyaux débloqués en rotation (jour % n)
export function orbitOfDay(save, today) {
  const list = CORE_IDS.filter(c => save.cores[c].unlocked);
  return { seed: hashString(today), core: list[dayNumber(today) % list.length], date: today };
}
function prevDay(date) { const [y, m, d] = date.split('-').map(Number); const t = new Date(y, m - 1, d - 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }
// Enregistre une partie d'Orbite du jour : meilleur score, +50 ✦ pour la 1re partie ≥ 30 s, série de jours consécutifs.
export function recordOrbitRun(save, r, today) {
  const d = save.daily; d.orbitTries = (d.orbitTries | 0) + 1;
  const newBest = r.score > d.orbitBest; if (newBest) d.orbitBest = r.score;
  let reward = 0;
  if (!d.orbitRewarded && r.time >= 30) {
    d.orbitRewarded = true; reward = ORBIT_DAY_REWARD;
    d.streak = d.lastOrbitDate === prevDay(today) ? d.streak + 1 : d.lastOrbitDate === today ? d.streak : 1;
    d.lastOrbitDate = today;
  }
  return { reward, newBest };
}
export { prevDay };
