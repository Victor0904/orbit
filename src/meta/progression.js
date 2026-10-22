// Fin de partie et progression permanente (GAME_DESIGN §9–12) : gains, étoiles, records, trophées, défis, objectifs.
import { CORES, CORE_IDS, MODULE_IDS, MODULES, STAR_TIMES, STAR_REWARDS, TROPHIES, TROPHY_IDS, BAPTISM, palierParams, palierAt, ZENITH_OFFSET } from '../core/data.js';
import { runGains, equippedMods, totalStars, cheapestAffordable, coreStatus } from './economy.js';
import { applyRun, recordOrbitRun } from './daily.js';

const fmt1 = x => x.toFixed(1).replace('.', ',');

export function checkTrophies(save, r = null) {
  const won = [], st = save.stats;
  const cond = {
    T1: st.runs >= 1, T2: !!r && r.multMax >= 8, T3: !!r && r.surcharges >= 3, T4: st.grazes >= 1000, T5: st.perfects >= 100,
    T6: st.maxNoSwapS >= 60, T7: st.maxNoFlipS >= 30, T8: CORE_IDS.every(c => save.cores[c].unlocked), T9: totalStars(save) >= 15,
    T10: totalStars(save) >= 30, T11: save.cores.zenith.bestPalier >= 10, T12: MODULE_IDS.some(m => save.modules[m] >= 3),
    T13: save.daily.streak >= 7, T14: !!r && r.resonances >= 9, T15: st.flips >= 10000,
  };
  for (const id of TROPHY_IDS) if (!save.trophies[id] && cond[id]) {
    save.trophies[id] = true; const reward = TROPHIES[id].reward; save.photons += reward; save.photonsTotal += reward;
    won.push({ id, name: TROPHIES[id].name, reward });
  }
  return won;
}

// r = Sim.result() ; opts = { today }
export function endRun(save, r, opts = {}) {
  const today = opts.today || '1970-01-01';
  const core = save.cores[r.core], C = CORES[r.core];
  const prosp = r.daily ? 0 : equippedMods(save).prospecteur;
  const gains = runGains(r, prosp);
  const sum = { gains, baptism: 0, stars: [], trophies: [], challengesDone: [], orbit: null, total: 0, newRecord: false, newScore: false, prevBest: core.bestTime };
  let add = gains.total;
  if (!save.baptismDone) { save.baptismDone = true; sum.baptism = BAPTISM; add += BAPTISM; }
  // étoiles (× mult_noyau)
  for (let i = 0; i < 5; i++) {
    if (core.stars[i]) continue;
    const ok = i < 4 ? r.time >= STAR_TIMES[i] : r.score >= C.star5;
    if (ok) { core.stars[i] = true; const rew = Math.round(STAR_REWARDS[i] * C.mult); add += rew; sum.stars.push({ i, reward: rew }); }
  }
  // records
  r.newTimeRecord = r.time > core.bestTime && core.bestTime > 0;
  if (r.time > core.bestTime) { sum.newRecord = core.bestTime > 0; core.bestTime = r.time; }
  if (r.score > core.bestScore) { sum.newScore = core.bestScore > 0; core.bestScore = r.score; }
  core.bestMult = Math.max(core.bestMult, r.multMax);
  core.bestPalier = Math.max(core.bestPalier, r.palier);
  core.top.push({ score: r.score, time: +r.time.toFixed(2), palier: r.palier, multMax: r.multMax, date: new Date().toISOString(), modules: Object.keys(r.mods).filter(k => r.mods[k] > 0).map(k => k + r.mods[k]) });
  core.top.sort((a, b) => b.score - a.score); core.top = core.top.slice(0, 5);
  // statistiques
  const st = save.stats;
  st.runs++; st.playTimeS += r.time; st.grazes += r.grazes; st.perfects += r.perfects; st.flips += r.flips; st.surcharges += r.surcharges;
  st.resonances += r.resonances; st.maxNoSwapS = Math.max(st.maxNoSwapS, r.maxNoSwap); st.maxNoFlipS = Math.max(st.maxNoFlipS, r.maxNoFlip);
  // défis du jour (D12 : dernier noyau débloqué)
  const unl = CORE_IDS.filter(c => save.cores[c].unlocked);
  r.onLastCore = r.core === unl[unl.length - 1];
  sum.challengesDone = applyRun(save, r);
  // Orbite du jour
  if (r.daily) { sum.orbit = recordOrbitRun(save, r, today); add += sum.orbit.reward; }
  save.photons += add; save.photonsTotal += add; st.photonsTotal += add;
  sum.trophies = checkTrophies(save, r);
  sum.total = add + sum.trophies.reduce((a, t) => a + t.reward, 0);
  sum.almost = almost(save, r, sum.prevBest);
  sum.next = nextObjective(save, r.core, 0);
  return sum;
}

// « Presque ! » : mort à moins de 3 s d'un palier, d'une étoile ou du record
export function almost(save, r, prevBest) {
  const t = r.time, off = r.core === 'zenith' ? ZENITH_OFFSET : 0, cands = [];
  const np = palierParams(palierAt(t + off) + 1); cands.push([np.start - off - t, 'le palier ' + np.name]);
  for (let i = 0; i < 4; i++) if (t < STAR_TIMES[i]) { cands.push([STAR_TIMES[i] - t, '★' + (i + 1)]); break; }
  if (prevBest > 0 && t < prevBest) cands.push([prevBest - t, 'le record']);
  let best = null; for (const c of cands) if (c[0] > 0 && c[0] < 3 && (!best || c[0] < best[0])) best = c;
  return best ? `Il manquait ${fmt1(best[0])} s pour ${best[1]}` : '';
}

// Prochain objectif (HUD bas et écran de fin) : record → prochaine étoile → prochain noyau → module abordable
export function nextObjective(save, coreId, t) {
  const core = save.cores[coreId];
  if (core.bestTime > 0 && t < core.bestTime) return `RECORD dans ${fmt1(core.bestTime - t)} s`;
  for (let i = 0; i < 4; i++) if (!core.stars[i] && t < STAR_TIMES[i]) return `★${i + 1} dans ${fmt1(STAR_TIMES[i] - t)} s`;
  for (const id of CORE_IDS) {
    const s = coreStatus(save, id);
    if (!s.unlocked) { if (!s.condOk) return `${CORES[id].name} : tenir ${s.need} s sur ${CORES[s.prev].name}`; return `${CORES[id].name} : ✦ ${s.cost}`; }
  }
  const m = cheapestAffordable(save); if (m) return `${MODULES[m.id].name} ${m.level} : ✦ ${m.cost}`;
  for (let i = 0; i < 5; i++) if (!core.stars[i]) return i < 4 ? `★${i + 1} : tenir ${STAR_TIMES[i]} s` : `★5 : ${CORES[coreId].star5.toLocaleString('fr-FR')} pts`;
  return 'Battre son record';
}
