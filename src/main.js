// ORBIT — point d'entrée : boucle à pas fixe 1/120 s + interpolation, gestes multi-doigts, états, sauvegarde, PWA.
import { STEP, CORES, MOTIF_CODES, palierParams, localDateStr, RESONANCES, ZENITH_OFFSET } from './core/data.js';
import { GestureTracker, G } from './core/input.js';
import { Sim, EV } from './sim/sim.js';
import { Bot } from './sim/bot.js';
import { Renderer } from './render/renderer.js';
import { Audio, Haptics } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { loadSave, writeSave, defaultSave } from './meta/save.js';
import { equippedMods, buyModule, cheapestAffordable } from './meta/economy.js';
import { refreshDaily, orbitOfDay } from './meta/daily.js';
import { endRun, nextObjective, checkTrophies } from './meta/progression.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const QUALITY_DPR = [2, 1.5, 1];
const ROMAN = ['', 'I', 'II', 'III'];

const app = {
  save: null, storage: null, saveFailed: false, today: localDateStr(),
  mode: 'menu', sim: null, demo: null, bot: null, paused: false, countdown: 0, runOpts: null,
  acc: 0, last: 0, simMs: 0, gq: [], gqN: 0,
  quality: 0, qAuto: true, fpsCap: false, nextRender: 0, refreshMs: 16.67,
  ft: { sum: 0, n: 0, t: 0, work: 0, late: 0, good: 0, cool: 0 }, iv: new Float32Array(120), ivN: 0, ivI: 0, ivSort: new Float32Array(120),
  renders: 0, steps: 0, fps: 60, fpsAcc: 0, fpsN: 0, frameStats: { n: 0, sum: 0, work: 0 },
  ui0: { alpha: 1, charge: -1, countdown: 0, menu: false, best: 0, goal: '', now: 0, rdt: 0.016, resLine: '', fpsStr: '', dbgStr: '', frozen: false },
  goalT: 0, resN: -1, alphas: null, debugInvincible: false,
};
window.__orbit = app;

// ------------------------------------------------------------------ sauvegarde
function storage() { try { const s = window.localStorage; s.getItem('x'); return s; } catch { return null; } }
app.persist = function () { if (!app.storage || !writeSave(app.storage, app.save)) app.failSave(); };
app.failSave = function () { if (!app.saveFailed) { app.saveFailed = true; app.ui && app.ui.toast('Sauvegarde impossible'); } };
app.resetSave = function () { const st = app.save.settings; app.save = defaultSave(); app.save.settings = st; refreshDaily(app.save, app.today); app.persist(); app.newDemo(); };

// ------------------------------------------------------------------ réglages
app.reducedMotion = function () { const r = app.save.settings.reducedMotion; return r === 'yes' || (r === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches); };
app.applySettings = function () {
  const st = app.save.settings;
  app.audio.setVolumes(st.sfx, st.music);
  app.haptics.enabled = !!st.vibration;
  const red = app.reducedMotion();
  app.renderer.setMotion(red); if (app.sim) app.sim.reduced = red;
  document.documentElement.dataset.reducedMotion = red ? 'true' : 'false';
  app.tracker.holdMs = st.holdMs;
  app.qAuto = st.quality === 'auto';
  const cap = st.fps === '60';
  if (cap !== app.fpsCap) { const f = app.ft; f.sum = f.n = f.t = f.work = f.late = f.good = 0; app.ivN = app.ivI = 0; }
  app.fpsCap = cap;
  if (!app.qAuto) app.setQuality(st.quality === 'high' ? 0 : 2);
  app.ui0.fpsStr = st.showFps || DEBUG ? app.ui0.fpsStr || '…' : '';
  app.renderer.setTrail(app.save.trail);
};
app.setQuality = function (q) {
  q = Math.max(0, Math.min(2, q)); const changed = q !== app.quality; app.quality = q;
  app.renderer.quality = q; app.renderer.maxP = q >= 2 ? 150 : 360;
  if (changed) resize();
};

// ------------------------------------------------------------------ taille & safe-areas
const canvas = document.getElementById('game');
function readSafe() { const cs = getComputedStyle(document.getElementById('probe')); return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 }; }
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, QUALITY_DPR[app.quality]);
  app.renderer.resize(window.innerWidth, window.innerHeight, dpr, readSafe());
  checkOrientation();
}
const landscapeMQ = matchMedia('(orientation: landscape) and (max-height: 540px)');
function checkOrientation() { const land = landscapeMQ.matches; document.getElementById('rotate').classList.toggle('on', land); if (land && app.mode === 'game' && !app.paused) app.pause(); }

// ------------------------------------------------------------------ partie
app.startGame = function (opts = {}) {
  const s = app.save;
  let core = opts.core || s.selectedCore, seed = (Date.now() >>> 0) || 1, daily = !!opts.daily;
  const tutorial = !s.tutorialDone || !!opts.tutorial;
  if (daily) { const o = orbitOfDay(s, app.today); core = o.core; seed = o.seed; }
  if (tutorial) core = 'atlas';
  if (!s.cores[core] || !s.cores[core].unlocked) core = 'atlas';
  if (!daily) s.selectedCore = core;
  app.runOpts = { core, daily, tutorial: false };
  const c = s.cores[core];
  app.sim = new Sim({ core, seed, mods: equippedMods(s, daily), daily, tutorial, bestTime: c.bestTime, bestPalier: c.bestPalier, reduced: app.reducedMotion(), invincible: app.debugInvincible });
  const r = app.renderer; r.reset(); r.setCore(core);
  app.mode = 'game'; app.paused = false; app.countdown = 0; app.acc = 0; app.simMs = performance.now(); app.gqN = 0; app.tracker.clear();
  app.goalT = 0; app.resN = -1; app.ui0.best = c.bestTime; app.ui0.goal = '';
  if (!tutorial) r.ann.push(1, 'PALIER ' + app.sim.palier, palierParams(app.sim.palier).name, 1.4);
  app.ui.hide();
  app.audio.setSeed(seed); app.audio.setMusic('off'); app.audio.setMusic('game', core); app.audio.setPalier(app.sim.palier); app.audio.pauseMusic(false);
  try { history.pushState({ orbit: 'game' }, ''); } catch { /* */ }
};
app.pause = function () {
  if (app.mode !== 'game' || !app.sim || app.sim.dead || app.paused) return;
  app.paused = true; app.countdown = 0; app.tracker.clear(); app.gqN = 0;
  app.audio.pauseMusic(true); app.persist();
  app.ui.go('pause', {}, false);
};
app.resume = function () {
  if (app.mode !== 'game' || !app.paused) return;
  app.paused = false; app.countdown = 0.9; app.ui.hide(); app.audio.pauseMusic(false); app.last = performance.now();
};
app.restart = function () { const o = app.runOpts; app.startGame({ core: o.core, daily: o.daily }); };
app.quitRun = function () { if (app.sim && !app.sim.dead) { app.paused = false; app.endGame(); } };
app.replay = function (buy) {
  if (buy) { const n = cheapestAffordable(app.save); if (n) { const r = buyModule(app.save, n.id); if (r.ok) { app.audio.play('buy'); app.haptics.vibrate([20]); const t = checkTrophies(app.save); app.ui.trophyToasts(t); } } }
  app.persist(); app.restart();
};
app.endGame = function () {
  const sim = app.sim, result = sim.result();
  const summary = endRun(app.save, result, { today: app.today });
  app.persist();
  app.mode = 'end'; app.paused = false; app.tracker.clear();
  app.audio.setMusic('end');
  if (summary.newRecord) app.audio.play('fanfare');
  app.ui.go('end', { result, summary }, false);
  app.lastResult = { result, summary };
};
app.toMenu = function () { app.mode = 'menu'; app.sim = null; app.paused = false; app.audio.setMusic('menu', app.save.selectedCore); app.newDemo(); };
app.newDemo = function () {
  const core = app.save.selectedCore;
  app.demo = new Sim({ core, seed: (Math.random() * 1e9) >>> 0, invincible: true, reduced: app.reducedMotion() });
  app.bot = new Bot(app.demo, { react: 0.12, seed: 3 });
  if (app.mode !== 'game') { app.renderer.reset(); app.renderer.setCore(core); }
};

// ------------------------------------------------------------------ événements de la sim → son, vibration, rendu
function handleEvents(sim, demo) {
  const r = app.renderer, a = app.audio, h = app.haptics;
  for (let i = 0; i < sim.evN; i++) {
    const e = sim.events[i];
    r.onEvent(e, sim);
    if (demo) continue;
    switch (e.type) {
      case EV.FLIP: a.play('flip', e.x / 138); break;
      case EV.HOLD: a.play('whooshUp'); h.vibrate([8]); break;
      case EV.RELEASE: a.play('whooshDown'); break;
      case EV.GRAZE: a.play('graze', e.a, e.b); break;
      case EV.PERFECT: a.play('perfect', e.a, e.b); h.vibrate([12]); break;
      case EV.TIER_UP: a.play('tierUp', e.a); h.vibrate([15, 30, 15]); break;
      case EV.TIER_DOWN: a.play('tierDown'); break;
      case EV.SURCHARGE: a.play('surcharge'); a.setSurcharge(true); break;
      case EV.SURCHARGE_END: a.setSurcharge(false); break;
      case EV.PHOTON: a.play('photon'); break;
      case EV.RESONANCE: a.play('resonance'); h.vibrate([20]); break;
      case EV.PALIER: a.play('palier'); a.setPalier(e.a); break;
      case EV.PHASE: a.play('phase'); break;
      case EV.RAY_TEL: a.play('rayTel', e.a); break;
      case EV.RAY_FIRE: a.play('rayFire', e.a); break;
      case EV.ARC_TEL: a.play('arcTel'); break;
      case EV.ORB_TEL: a.play('orbTel'); break;
      case EV.ECL_EMIT: a.play('ecl'); break;
      case EV.SAT_SPAWN: a.play('sat'); break;
      case EV.SHIELD: a.play('shield'); h.vibrate([40, 30, 40]); break;
      case EV.REFLEX: a.play('reflex'); break;
      case EV.DEATH: a.play('death'); h.vibrate([60, 40, 120]); break;
      case EV.RECORD: case EV.NEW_PALIER: a.play('fanfare'); break;
      case EV.TUTO: r.ann.setSticky(sim.tutText); break;
      case EV.START: r.ann.setSticky(''); app.save.tutorialDone = true; app.persist(); a.setPalier(1); break;
    }
  }
  sim.clearEvents();
}

// ------------------------------------------------------------------ gestes (GAME_DESIGN §2)
app.tracker = new GestureTracker(140, (type, t) => {
  if (type === G.PRESS) { app.audio.play('tick'); return; }
  if (app.gqN < 32) { const q = app.gq[app.gqN] || (app.gq[app.gqN] = { type: 0, t: 0 }); q.type = type; q.t = t; app.gqN++; }
});
function applyGestures(tMs) {
  // file chronologique : on applique ce qui est échu (jamais rétroactivement), le reste attend le pas suivant
  const sim = app.sim, q = app.gq; let i = 0;
  for (; i < app.gqN; i++) {
    const g = q[i]; if (g.t > tMs) break;
    if (g.type === G.TAP) sim.flip(); else if (g.type === G.HOLD) sim.hold(true); else if (g.type === G.RELEASE) sim.hold(false);
  }
  if (i) { for (let k = 0; k + i < app.gqN; k++) { const tmp = q[k]; q[k] = q[k + i]; q[k + i] = tmp; } app.gqN -= i; }
}
function inPause(ev) { const p = app.renderer.hudRects().pause; return ev.clientX >= p.x - 6 && ev.clientX <= p.x + p.w + 6 && ev.clientY >= p.y - 6 && ev.clientY <= p.y + p.h + 6; }
const evT = ev => (ev.timeStamp > 1e12 ? performance.now() : ev.timeStamp) || performance.now();
canvas.addEventListener('pointerdown', ev => {
  app.audio.unlock();
  if (app.mode !== 'game' || !app.sim || app.paused) return;
  ev.preventDefault();
  if (inPause(ev)) { app.pause(); return; }   // un appui qui démarre sur le bouton pause n'est jamais un geste
  try { canvas.setPointerCapture(ev.pointerId); } catch { /* */ }
  app.tracker.down(ev.pointerId, evT(ev));
}, { passive: false });
function endPointer(ev) { if (app.mode !== 'game') return; app.tracker.up(ev.pointerId, evT(ev), ev.type === 'pointercancel'); }
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('touchstart', e => { if (e.target === canvas) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
// clavier (debug/desktop) : Espace et ↑ se comportent comme un pointeur
window.addEventListener('keydown', ev => {
  if (app.mode !== 'game' || !app.sim) return;
  if (ev.code === 'Space' || ev.code === 'ArrowUp') { ev.preventDefault(); if (!ev.repeat && !app.paused) app.tracker.down('k', evT(ev)); return; }
  if (ev.code === 'Escape' || ev.code === 'KeyP' && !DEBUG) { app.paused ? app.resume() : app.pause(); return; }
  if (!DEBUG) return;
  if (ev.code === 'KeyI') { app.debugInvincible = app.sim.invincible = !app.sim.invincible; }
  else if (ev.code === 'KeyP') { const s = app.sim, off = s.core === 'zenith' ? ZENITH_OFFSET : 0; s.T = Math.max(s.T, palierParams(s.palier + 1).start - off + 0.001); }
  else if (ev.code === 'KeyM') { const s = app.sim, i = (MOTIF_CODES.indexOf(s.forced) + 1) % (MOTIF_CODES.length + 1); s.forced = MOTIF_CODES[i] || null; s.nextCode = s.forced; app.ui.toast('Motif forcé : ' + (s.forced || 'aucun')); }
});
window.addEventListener('keyup', ev => { if (ev.code === 'Space' || ev.code === 'ArrowUp') { if (app.mode === 'game') app.tracker.up('k', evT(ev)); } });

// ------------------------------------------------------------------ boucle
function frame(now) {
  requestAnimationFrame(frame);
  if (app.fpsCap) { if (now < app.nextRender - 2) return; app.nextRender = Math.max(app.nextRender + 1000 / 60, now - 1000 / 60); }
  const w0 = performance.now();
  let rdt = (now - app.last) / 1000; app.last = now;
  if (!(rdt > 0)) rdt = 0;
  const rawMs = rdt * 1000; rdt = Math.min(0.05, rdt);
  const r = app.renderer, u = app.ui0;
  u.rdt = rdt; u.now = now / 1000; app.renders++;
  if (app.mode === 'game' && app.sim) {
    const sim = app.sim;
    u.frozen = app.paused || app.countdown > 0;
    if (!app.paused) {
      if (app.countdown > 0) {
        app.countdown -= rdt;
        if (app.countdown <= 0) { // fin du compte à rebours : maintien lu, aucun tap compté
          app.countdown = 0; app.tracker.poll(performance.now()); app.tracker.freezeTaps(); app.gqN = 0;
          sim.hold(app.tracker.holding); sim.clearEvents(); app.simMs = performance.now(); app.acc = 0;
        }
      } else {
        app.acc += rdt; let steps = 0;
        while (app.acc >= STEP && steps < 8) {
          app.acc -= STEP; steps++; app.simMs += STEP * 1000;
          app.tracker.poll(app.simMs); applyGestures(app.simMs);
          sim.step(); r.onStep(sim);
          handleEvents(sim, false);
          if (sim.over) break;
        }
        if (steps === 8 || app.simMs < now - 60) { app.acc = 0; app.simMs = now; }
        app.steps += steps;
        r.update(rdt * sim.tsWorld, rdt);
        if (sim.over && app.mode === 'game') app.endGame();
      }
      // objectif du HUD (10 Hz) et ligne des Résonances
      app.goalT -= rdt; if (app.goalT <= 0 && !sim.tut) { app.goalT = 0.1; u.goal = nextObjective(app.save, sim.core, sim.chrono); }
      if (sim.resList.length !== app.resN) { app.resN = sim.resList.length; u.resLine = resLine(sim); }
    }
    u.alpha = app.paused || app.countdown > 0 ? 1 : app.acc / STEP; u.menu = false; u.countdown = app.countdown;
    u.charge = app.tracker.charge(performance.now());
    if (app.alphas) app.alphas.add(Math.round(u.alpha * 20));
    r.drawGame(sim, u);
  } else if (app.mode === 'end' && app.sim) {
    const sim = app.sim; app.acc += rdt; let n = 0;
    while (app.acc >= STEP && n < 8) { app.acc -= STEP; n++; sim.step(); handleEvents(sim, true); }
    r.update(rdt * sim.tsWorld, rdt); u.alpha = app.acc / STEP; u.charge = -1; u.countdown = 0; u.frozen = false;
    r.drawGame(sim, u);
  } else {
    // menus : arène du noyau sélectionné jouée par le bot (invincible), α .5 sous un voile
    const d = app.demo; if (d) {
      app.acc += rdt; let n = 0;
      while (app.acc >= STEP && n < 8) { app.acc -= STEP; n++; d.step(); app.bot.update(); r.onStep(d); handleEvents(d, true); }
      if (n === 8) app.acc = 0;
      if (d.T > 75) app.newDemo();
      r.update(rdt * d.tsWorld, rdt); u.alpha = app.acc / STEP; u.menu = true; u.charge = -1; u.countdown = 0; u.frozen = false;
      r.drawGame(d, u); u.menu = false;
    }
  }
  measure(rawMs, performance.now() - w0);
}
function resLine(sim) {
  const ids = []; for (const id of Object.keys(sim.res)) if (sim.res[id] > 0) ids.push(RESONANCES[id].name + (RESONANCES[id].max > 1 ? ' ' + ROMAN[sim.res[id]] : ''));
  return ids.length ? '◇ ' + ids.join(' · ') : '';
}
// Qualité auto (DESIGN §9.1, technique PULSAR) : budget = intervalle réel de l'écran ; baisse si > 1,15 × budget (ou trop de
// frames en retard), remonte après 8 s sous 0,7 × budget. Fréquence de l'écran : 20e centile des intervalles sur 2 s.
function measure(ms, work) {
  if (ms <= 0 || ms > 1000) return;
  const fs = app.frameStats; fs.n++; fs.sum += ms; fs.work += work;
  if (!app.fpsCap) { app.iv[app.ivI] = ms; app.ivI = (app.ivI + 1) % app.iv.length; if (app.ivN < app.iv.length) app.ivN++; }
  app.fpsAcc += ms; app.fpsN++;
  if (app.fpsAcc > 500) {
    app.fps = 1000 * app.fpsN / app.fpsAcc; app.fpsAcc = 0; app.fpsN = 0;
    if (app.save.settings.showFps || DEBUG) app.ui0.fpsStr = `${app.fps.toFixed(0)} FPS · ${(1000 / app.refreshMs).toFixed(0)} Hz · Q${app.quality} · DPR ${app.renderer.dpr}`;
    if (DEBUG && app.sim) app.ui0.dbgStr = `dangers ${app.sim.hz.length}/128 éclats ${app.sim.eclN}/96 part. ${app.renderer.P.n}${app.sim.invincible ? ' INV' : ''}${app.sim.forced ? ' M=' + app.sim.forced : ''}`;
  }
  const f = app.ft;
  if (app.mode !== 'game' || app.paused) { f.sum = f.n = f.t = f.work = f.late = 0; return; }
  const budget = app.fpsCap ? Math.max(1000 / 60, app.refreshMs) : app.refreshMs;
  f.sum += ms; f.n++; f.t += ms; f.work += work; if (ms > budget * 1.5) f.late++;
  if (f.t >= 2000) {
    if (app.ivN >= 60) { const a = app.ivSort; for (let i = 0; i < app.ivN; i++) a[i] = app.iv[i]; const sub = a.subarray(0, app.ivN); sub.sort(); const p20 = sub[Math.floor(app.ivN * 0.2)]; app.refreshMs = p20 < app.refreshMs ? p20 : app.refreshMs + (p20 - app.refreshMs) * 0.15; }
    const avgWork = f.work / f.n, lateFrac = f.late / f.n, avgMs = f.sum / f.n;
    app.lastQ = { budget: +budget.toFixed(2), avgWork: +avgWork.toFixed(2), lateFrac: +lateFrac.toFixed(3), refreshMs: +app.refreshMs.toFixed(2) };
    if (f.cool > 0) f.cool -= f.t;
    if (app.qAuto) {
      if ((avgWork > budget * 1.15 || lateFrac > 0.25 || avgMs > budget * 1.15) && app.quality < 2) { app.setQuality(app.quality + 1); f.good = 0; f.cool = 8000; }
      else if (avgWork < budget * 0.7 && app.quality > 0 && f.cool <= 0) { f.good += f.t; if (f.good >= 8000) { app.setQuality(app.quality - 1); f.good = 0; } }
      else f.good = 0;
    }
    f.sum = f.n = f.t = f.work = f.late = 0;
  }
}

// ------------------------------------------------------------------ cycle de vie
function hide() { if (app.mode === 'game' && !app.paused) app.pause(); app.persist(); }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hide(); app.audio.suspend(); }
  else { app.audio.resume(); app.last = performance.now(); const t = localDateStr(); if (t !== app.today) { app.today = t; if (refreshDaily(app.save, t)) { app.persist(); app.ui.refresh(); } } }
});
window.addEventListener('pagehide', () => app.persist());
window.addEventListener('blur', () => { if (app.mode === 'game' && !app.paused) app.pause(); });
window.addEventListener('popstate', () => {
  if (app.mode === 'game') { if (!app.paused) app.pause(); try { history.pushState({ orbit: 'game' }, ''); } catch { /* */ } }
  else if (app.mode === 'end') { app.toMenu(); app.ui.go('title', {}, false); }
  else if (app.ui.current && app.ui.current !== 'title') app.ui.go('title', {}, false);
});
window.addEventListener('resize', resize);
landscapeMQ.addEventListener && landscapeMQ.addEventListener('change', checkOrientation);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => app.applySettings());

// ------------------------------------------------------------------ démarrage
function boot() {
  app.storage = storage();
  const loaded = app.storage ? loadSave(app.storage) : { save: defaultSave(), source: 'new' };
  app.save = loaded.save;
  if (refreshDaily(app.save, app.today)) app.persist();
  app.renderer = new Renderer(canvas); app.renderer.debug = DEBUG;
  app.audio = new Audio(); app.haptics = new Haptics();
  app.audio.onKick = t => { const d = Math.max(0, (t - app.audio.ctx.currentTime) * 1000); setTimeout(() => { app.renderer.kick = 0.08; }, d); };
  app.ui = new UI(app);
  app.applySettings(); resize();
  app.renderer.setCore(app.save.selectedCore);
  app.newDemo();
  app.audio.setMusic('menu', app.save.selectedCore);
  app.ui.go('title', {}, false);
  if (!app.storage) app.failSave();
  app.last = performance.now();
  requestAnimationFrame(t => { app.last = t; frame(t); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => { /* hors ligne indisponible */ });
}
app.CORES = CORES;
boot();
