// Écrans DOM (DESIGN §10) : titre, noyaux, atelier, défis, records, réglages, pause, fin de partie.
import { CORES, CORE_IDS, MODULES, MODULE_IDS, moduleEffect, STAR_TIMES, STAR_REWARDS, TROPHIES, TROPHY_IDS, TRAILS, RESONANCES, CHALLENGES, MOTIF_NAMES, K } from '../core/data.js';
import { moduleCost, buyModule, toggleEquip, nextSlot, buySlot, coreStatus, unlockCore, cheapestAffordable, anyPurchase, totalStars, equippedMods } from '../meta/economy.js';
import { claimChallenge, claimable, challengeReward, orbitOfDay } from '../meta/daily.js';
import { checkTrophies } from '../meta/progression.js';
import { drawCore, ZENITH_COLS, zenithIndex } from '../render/cores.js';
import { fmtTime } from '../render/renderer.js';

const ROMAN = ['', 'I', 'II', 'III'];
const fmt = n => Math.round(n).toLocaleString('fr-FR');
const t1 = x => x.toFixed(1).replace('.', ',');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PH = '<span class="ph">✦</span>';
const MOD_ICON = { echo: '◎', aimant: '✧', inertie: '⧗', dephaseur: '⇅', reflexe: '◷', prospecteur: '◈', bouclier: '⬡', elan: '»' };
const stars = arr => arr.map(s => `<span class="${s ? 'st-on' : 'st-off'}">${s ? '★' : '☆'}</span>`).join('');
const RES_GLYPH = { halo: '⬡', echo: '◎', lenteur: '⧗', avidite: '✦', ferveur: '×', eclat: '◆', phase: '◉', precision: '⌖', reflexe: '◷' };
const KIND_GLYPH = ['▮', '◠', '▲', '◯', '✴', '◆'];

export class UI {
  constructor(app) {
    this.app = app; this.root = document.getElementById('ui'); this.toastEl = document.getElementById('toast');
    this.current = null; this.params = {}; this.tab = 'jour'; this.recCore = 'atlas'; this.resetStep = 0; this.anim = null; this.preview = null;
    this.root.addEventListener('click', e => this.onClick(e));
    this.root.addEventListener('input', e => this.onInput(e));
    this.root.addEventListener('pointerdown', e => { this.app.audio.unlock(); this.onPointerDown(e); }, { passive: true });
    this.root.addEventListener('pointerup', e => this.onPointerUp(e), { passive: true });
  }
  get save() { return this.app.save; }
  go(name, params = {}, push = true) {
    this.stopAnims();
    const prev = this.current; this.current = name; this.params = params; this.resetStep = 0;
    if (push && name !== 'title' && name !== 'end' && name !== 'pause' && prev !== name) { try { history.pushState({ orbit: name }, ''); } catch { /* */ } }
    if (this.app.mode === 'end' && name !== 'end') this.app.toMenu();
    this.render();
  }
  hide() { this.stopAnims(); this.current = null; this.root.innerHTML = ''; this.root.className = ''; }
  refresh() { if (this.current && this.current !== 'end' && this.current !== 'pause') this.render(true); }
  stopAnims() { if (this.anim) { cancelAnimationFrame(this.anim); this.anim = null; } if (this.preview) { cancelAnimationFrame(this.preview); this.preview = null; } }
  render(keep) {
    const name = this.current, sc = keep ? this.root.querySelector('.scroll') : null, top = sc ? sc.scrollTop : 0;
    const car = keep ? this.root.querySelector('.carousel') : null, left = car ? car.scrollLeft : 0;
    this.root.className = 'on' + (name === 'pause' || name === 'end' ? ' overlay' : '');
    this.root.innerHTML = `<div class="screen screen-${name}${keep ? '' : ' enter'}">${this['scr_' + name](this.params)}</div>`;
    if (keep) { const s2 = this.root.querySelector('.scroll'); if (s2) s2.scrollTop = top; const c2 = this.root.querySelector('.carousel'); if (c2) c2.scrollLeft = left; }
    if (name === 'noyaux') this.startPreviews();
    if (name === 'end') this.startEnd();
    if (name === 'noyaux' && !keep && this.params.focus) { const el = this.root.querySelector(`[data-core="${this.params.focus}"]`); if (el) el.scrollIntoView({ inline: 'center', block: 'nearest' }); }
  }
  toast(msg, cls = '') {
    const el = document.createElement('div'); el.className = 'toast-item ' + cls; el.textContent = msg; this.toastEl.appendChild(el);
    while (this.toastEl.children.length > 3) this.toastEl.firstChild.remove();
    setTimeout(() => el.remove(), 2600);
  }
  trophyToasts(list) { for (const t of list || []) this.toast(`Trophée : ${t.name} · ✦ +${t.reward}`, 'gold'); }
  topbar(title) { return `<div class="topbar"><button class="icon-btn" data-act="back" aria-label="Retour">‹</button><h2>${title}</h2><span class="pill">${PH} <span class="num">${fmt(this.save.photons)}</span></span></div>`; }

  // ------------------------------------------------------------ TITRE §10.1
  scr_title() {
    const s = this.save, id = s.selectedCore, c = s.cores[id], C = CORES[id];
    const od = orbitOfDay(s, this.app.today), d = s.daily;
    const shop = anyPurchase(s), claim = claimable(s) > 0;
    return `
    <div class="topbar topbar-title"><span></span><button class="icon-btn" data-act="go" data-to="reglages" aria-label="Réglages">⚙</button></div>
    <div class="title-block"><h1 class="logo" aria-label="ORBIT"><span class="logo-o">O<i class="logo-dot"></i></span>RBIT</h1><p class="subtitle">esquive orbitale</p></div>
    <div class="spacer"></div>
    <div class="bottom-zone">
      <button class="core-line" data-act="go" data-to="noyaux"><b style="color:${C.col}">${C.name}</b> · <span class="num">REC ${c.bestTime ? fmtTime(c.bestTime) : '—'}</span> <span class="stars">${stars(c.stars)}</span></button>
      <button class="btn btn--primary" data-act="play">JOUER</button>
      <button class="card orbit-card" data-act="daily"><span class="oc-l"><b>ORBITE DU JOUR</b><small>${CORES[od.core].name} · meilleur ${d.orbitBest ? fmt(d.orbitBest) : '—'}${d.streak ? ` · <span class="flame">série ${d.streak}</span>` : ''}</small></span><span class="oc-r">${d.orbitRewarded ? '<span class="ok">✔</span>' : `${PH} +50`}</span></button>
      <div class="grid2">
        <button class="btn" data-act="go" data-to="noyaux">NOYAUX</button>
        <button class="btn" data-act="go" data-to="atelier">ATELIER${shop ? '<span class="badge-alert">!</span>' : ''}</button>
        <button class="btn" data-act="go" data-to="defis">DÉFIS${claim ? '<span class="badge-alert">!</span>' : ''}</button>
        <button class="btn" data-act="go" data-to="records">RECORDS</button>
      </div>
      <div class="balance">${PH} <span class="num">${fmt(s.photons)}</span></div>
    </div>`;
  }

  // ------------------------------------------------------------ NOYAUX §10.2
  scr_noyaux() {
    const s = this.save;
    const slides = CORE_IDS.map(id => {
      const C = CORES[id], c = s.cores[id], st = coreStatus(s, id), sel = s.selectedCore === id;
      let foot;
      if (st.unlocked) foot = `<button class="btn btn--primary" data-act="playcore" data-id="${id}">JOUER</button>`;
      else foot = `<div class="lock"><p class="desc">Verrouillé : tenir ${st.need} s sur ${CORES[st.prev].name}</p>
        <div class="bar"><i style="width:${(st.progress * 100).toFixed(0)}%"></i></div><p class="desc num">${t1(st.best)} / ${st.need} s</p>
        <button class="btn btn--buy" data-act="unlock" data-id="${id}" ${st.affordable ? '' : 'disabled'}>DÉBLOQUER · ${PH} ${fmt(st.cost)}</button></div>`;
      return `<div class="slide${st.unlocked ? '' : ' locked'}${sel ? ' sel' : ''}" data-core="${id}">
        <canvas class="core-prev" width="160" height="160" data-id="${id}"></canvas>
        <h3 class="core-name" style="color:${C.col}">${C.name}</h3><p class="desc">${C.tag}</p>
        <p class="stars big">${stars(c.stars)}</p><p class="desc num">REC ${c.bestTime ? fmtTime(c.bestTime) : '—'} · Photons ×${C.mult.toFixed(1).replace('.', ',')}</p>
        ${foot}</div>`;
    }).join('');
    return `${this.topbar('NOYAUX')}<div class="carousel">${slides}</div><p class="hint">Glissez pour changer de noyau</p>`;
  }
  startPreviews() {
    const cvs = [...this.root.querySelectorAll('.core-prev')];
    const loop = now => {
      const t = now / 1000;
      for (const cv of cvs) {
        const g = cv.getContext('2d'), id = cv.dataset.id, C = CORES[id], col = id === 'zenith' ? ZENITH_COLS[zenithIndex(t)] : C.col;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 160, 160); g.setTransform(1.15, 0, 0, 1.15, 80, 80);
        drawCore(g, id, 1, t, 1, col, id === 'zenith' ? '#FFFFFF' : C.acc);
      }
      this.preview = requestAnimationFrame(loop);
    };
    this.preview = requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ ATELIER §10.3
  scr_atelier() {
    const s = this.save, ns = nextSlot(s);
    const slots = [0, 1, 2].map(i => {
      if (i < s.slots) { const id = s.equipped[i]; return id ? `<button class="slot full" data-act="unequip" data-id="${id}"><span class="mi">${MOD_ICON[id]}</span><small>${MODULES[id].name} ${ROMAN[s.modules[id]]}</small></button>` : `<div class="slot empty"><small>vide</small></div>`; }
      if (ns && i === s.slots) return `<button class="slot locked" data-act="buyslot" ${ns.affordable ? '' : 'disabled'}><span>🔒︎</span><small>${PH} ${fmt(ns.cost)}${ns.needStars ? ` · ${ns.needStars} ★` : ''}</small></button>`;
      return `<div class="slot locked"><span>🔒︎</span></div>`;
    }).join('');
    const cards = MODULE_IDS.map(id => {
      const lv = s.modules[id], cost = moduleCost(s, id), eq = s.equipped.includes(id);
      const pips = [1, 2, 3].map(k => `<i class="${k <= lv ? 'on' : ''}"></i>`).join('');
      const eff = lv ? moduleEffect(id, lv) + (lv < 3 ? ' → ' + moduleEffect(id, lv + 1) : '') : moduleEffect(id, 1);
      const eqBtn = lv ? `<button class="btn btn--equip${eq ? ' on' : ''}" data-act="equip" data-id="${id}" ${!eq && s.equipped.length >= s.slots ? 'disabled' : ''}>${eq ? 'ÉQUIPÉ ✔' : 'ÉQUIPER'}</button>` : '<span></span>';
      const buy = cost === null ? '<span class="ok">MAX</span>' : `<button class="btn btn--buy" data-act="buy" data-id="${id}" ${s.photons >= cost ? '' : 'disabled'}>${PH} ${fmt(cost)}</button>`;
      return `<div class="card mod"><div class="mod-h"><span class="mi">${MOD_ICON[id]}</span><h3>${MODULES[id].name}</h3><span class="lv">${pips}</span></div><p class="desc">${eff}</p><div class="mod-f">${eqBtn}${buy}</div></div>`;
    }).join('');
    return `${this.topbar('ATELIER')}<p class="section">EMPLACEMENTS</p><div class="slots">${slots}</div>
      <div class="scroll">${cards}</div><div class="sticky-bottom"><button class="btn btn--primary" data-act="play">JOUER</button></div>`;
  }

  // ------------------------------------------------------------ DÉFIS §10.4
  scr_defis() {
    const tab = this.tab;
    const tabs = [['jour', 'DU JOUR'], ['const', 'CONSTELLATIONS'], ['troph', 'TROPHÉES']].map(([k, l]) => `<button class="tab${tab === k ? ' on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('');
    return `${this.topbar('DÉFIS')}<div class="tabs">${tabs}</div><div class="scroll">${this['tab_' + tab]()}</div>`;
  }
  tab_jour() {
    const s = this.save, d = s.daily, now = new Date(), mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), left = Math.max(0, mid - now);
    const hh = Math.floor(left / 3600000), mm = Math.floor(left / 60000) % 60;
    const cards = d.list.map((c, i) => {
      const done = c.progress >= c.target, rew = challengeReward(s, c.id);
      const btn = c.claimed ? '<span class="ok">✔ RÉCLAMÉ</span>' : done ? `<button class="btn btn--claim" data-act="claim" data-i="${i}">RÉCLAMER ${PH} ${rew}</button>` : `<span class="desc">${PH} ${rew}</span>`;
      return `<div class="card"><h3>${CHALLENGES[c.id].text}</h3><div class="bar"><i style="width:${(Math.min(1, c.progress / c.target) * 100).toFixed(0)}%"></i></div><div class="row"><span class="desc num">${fmt(c.progress)} / ${fmt(c.target)}</span>${btn}</div></div>`;
    }).join('');
    const od = orbitOfDay(s, this.app.today);
    return `${cards}<p class="desc center">${d.bonusClaimed ? '<span class="ok">Bonus des 3 défis réclamé ✔</span>' : `Les 3 réclamés : ${PH} +100`} · renouvellement dans ${hh} h ${String(mm).padStart(2, '0')}</p>
      <div class="card orbit-big"><h3>ORBITE DU JOUR · ${CORES[od.core].name}</h3><p class="desc">Même graine pour tous, modules désactivés, essais illimités.</p>
      <p class="desc num">Meilleur aujourd'hui : ${d.orbitBest ? fmt(d.orbitBest) : '—'} · série <span class="flame">${d.streak}</span> jour${d.streak > 1 ? 's' : ''}</p>
      <p class="desc">${d.orbitRewarded ? '<span class="ok">Récompense du jour obtenue ✔</span>' : `1re partie ≥ 30 s : ${PH} +50`}</p>
      <button class="btn btn--primary" data-act="daily">JOUER</button></div>`;
  }
  tab_const() {
    const s = this.save, n = totalStars(s);
    const rows = CORE_IDS.map(id => {
      const c = s.cores[id], C = CORES[id], pts = [[10, 26], [42, 12], [74, 30], [106, 14], [138, 28]];
      const lines = pts.slice(1).map((p, i) => `<line x1="${pts[i][0]}" y1="${pts[i][1]}" x2="${p[0]}" y2="${p[1]}" stroke="${C.stars}" stroke-opacity=".25"/>`).join('');
      const dots = pts.map((p, i) => `<text x="${p[0]}" y="${p[1] + 5}" text-anchor="middle" font-size="15" fill="${c.stars[i] ? '#FFD45C' : 'none'}" stroke="${c.stars[i] ? 'none' : '#5A6488'}">★</text>`).join('');
      const conds = [0, 1, 2, 3, 4].map(i => `<span class="${c.stars[i] ? 'st-on' : 'st-off'}">★${i + 1} ${i < 4 ? STAR_TIMES[i] + ' s' : fmt(C.star5)}</span>`).join(' ');
      return `<div class="card const"><div class="row"><h3 style="color:${C.col}">${C.name}</h3>${c.unlocked ? '' : '<small class="desc">verrouillé</small>'}</div>
        <svg viewBox="0 0 148 40" class="constel" aria-hidden="true">${lines}${dots}</svg><p class="desc small">${conds}</p></div>`;
    }).join('');
    const trails = TRAILS.map(t => { const ok = n >= t.stars, on = s.trail === t.id;
      return `<button class="trail${on ? ' on' : ''}" data-act="trail" data-id="${t.id}" ${ok ? '' : 'disabled'}><i style="background:${t.col};${t.ring ? 'box-shadow:0 0 0 2px #fff inset' : ''}"></i><small>${ok ? t.name : t.stars + ' ★'}</small></button>`; }).join('');
    return `<p class="desc center">${n} / 30 étoiles</p>${rows}<p class="section">SILLAGES</p><div class="trails">${trails}</div>`;
  }
  tab_troph() {
    const s = this.save;
    return TROPHY_IDS.map(id => { const T = TROPHIES[id], ok = s.trophies[id];
      return `<div class="card troph${ok ? ' got' : ''}"><div class="row"><h3>${ok ? '★ ' : ''}${T.name}</h3><span class="${ok ? 'ok' : 'desc'}">${PH} ${T.reward}</span></div><p class="desc">${T.desc}${ok ? '' : this.trophyProgress(id)}</p></div>`; }).join('');
  }
  trophyProgress(id) {
    const st = this.save.stats, p = { T4: [st.grazes, 1000], T5: [st.perfects, 100], T6: [Math.floor(st.maxNoSwapS), 60], T7: [Math.floor(st.maxNoFlipS), 30], T9: [totalStars(this.save), 15], T10: [totalStars(this.save), 30], T13: [this.save.daily.streak, 7], T15: [st.flips, 10000] }[id];
    return p ? ` <span class="num">(${fmt(Math.min(p[0], p[1]))} / ${fmt(p[1])})</span>` : '';
  }

  // ------------------------------------------------------------ RECORDS §12
  scr_records() {
    const s = this.save, id = this.recCore, c = s.cores[id], C = CORES[id], st = s.stats;
    const tabs = CORE_IDS.map(k => `<button class="tab small${k === id ? ' on' : ''}" data-act="reccore" data-id="${k}" style="${k === id ? `color:${CORES[k].col};border-color:${CORES[k].col}` : ''}">${CORES[k].name}</button>`).join('');
    const top = c.top.length ? c.top.map((r, i) => `<div class="row rec"><span class="num">${i + 1}. ${fmt(r.score)}</span><span class="desc num">${fmtTime(r.time)} s · P${r.palier} · ×${r.multMax}</span></div>`).join('') : '<p class="desc">Aucune partie.</p>';
    const hist = s.daily.history.slice(-7).reverse().map(h => `<div class="row rec"><span class="num">${h.date}</span><span class="num">${fmt(h.best)}</span></div>`).join('') || '<p class="desc">—</p>';
    return `${this.topbar('RECORDS')}<div class="mtabs">${tabs}</div><div class="scroll">
      <div class="card"><h3 style="color:${C.col}">${C.name}</h3><div class="row"><span class="desc">Meilleur temps</span><span class="num big">${c.bestTime ? fmtTime(c.bestTime) + ' s' : '—'}</span></div>
      <div class="row"><span class="desc">Meilleur score</span><span class="num">${fmt(c.bestScore)}</span></div><div class="row"><span class="desc">Meilleur multiplicateur</span><span class="num">×${c.bestMult}</span></div>
      <div class="row"><span class="desc">Étoiles</span><span class="stars">${stars(c.stars)}</span></div></div>
      <p class="section">TOP 5</p><div class="card">${top}</div>
      <p class="section">ORBITE DU JOUR (7 DERNIERS JOURS)</p><div class="card"><div class="row rec"><span class="num">aujourd'hui</span><span class="num">${s.daily.orbitBest ? fmt(s.daily.orbitBest) : '—'}</span></div>${hist}</div>
      <p class="section">STATISTIQUES</p><div class="card stats">
        ${[['Parties', fmt(st.runs)], ['Temps de jeu', `${Math.floor(st.playTimeS / 60)} min`], ['Frôlements', fmt(st.grazes)], ['Parfaits', fmt(st.perfects)], ['Demi-tours', fmt(st.flips)], ['Photons gagnés', fmt(s.photonsTotal)], ['SURCHARGES', fmt(st.surcharges)], ['Résonances prises', fmt(st.resonances)]].map(([a, b]) => `<div class="row"><span class="desc">${a}</span><span class="num">${b}</span></div>`).join('')}
      </div></div>`;
  }

  // ------------------------------------------------------------ RÉGLAGES §15
  scr_reglages() {
    const st = this.save.settings;
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(st[key]) === String(v) ? 'on' : ''}" data-act="set" data-key="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const tog = key => `<button class="toggle${st[key] ? ' on' : ''}" data-act="toggle" data-key="${key}" aria-pressed="${!!st[key]}">${st[key] ? 'OUI' : 'NON'}</button>`;
    const reset = ['RÉINITIALISER LA SAUVEGARDE', 'CONFIRMER ? (tout sera effacé)', 'DERNIÈRE CONFIRMATION'][this.resetStep];
    return `${this.topbar('RÉGLAGES')}<div class="scroll">
      <label class="set"><span>Son</span><input type="range" min="0" max="100" value="${Math.round(st.sfx * 100)}" data-key="sfx"></label>
      <label class="set"><span>Musique</span><input type="range" min="0" max="100" value="${Math.round(st.music * 100)}" data-key="music"></label>
      <div class="set"><span>Vibration</span>${tog('vibration')}</div>
      <div class="set col"><span>Mouvements réduits</span>${seg('reducedMotion', [['system', 'SYSTÈME'], ['yes', 'OUI'], ['no', 'NON']])}</div>
      <div class="set col"><span>Fréquence d’image</span>${seg('fps', [['auto', 'AUTO'], ['60', '60 FPS']])}</div>
      <div class="set col"><span>Seuil d’appui long</span>${seg('holdMs', [[110, 'COURT 110'], [140, 'NORMAL 140'], [180, 'LONG 180']])}
        <div class="tryzone" id="tryzone">Tapez ou maintenez ici<b id="tryres"></b></div></div>
      <div class="set col"><span>Qualité</span>${seg('quality', [['auto', 'AUTO'], ['high', 'HAUTE'], ['low', 'BASSE']])}</div>
      <div class="set"><span>Afficher les FPS</span>${tog('showFps')}</div>
      <button class="btn" data-act="tutorial">REJOUER LE TUTORIEL</button>
      <p class="desc small">Astuces : maintenir un instant puis relâcher fait un « saut court » vers l’extérieur. Avec deux pouces, l’un maintient et l’autre tape : demi-tour sur l’orbite extérieure.</p>
      <button class="btn btn--ghost" data-act="reset">${reset}</button>
      <p class="desc small center">ORBIT 1.0 · 100 % hors ligne</p></div>`;
  }

  // ------------------------------------------------------------ PAUSE §10.6
  scr_pause() {
    const sim = this.app.sim, st = this.save.settings, res = sim ? sim.resList.map(id => RESONANCES[id].name) : [];
    return `<div class="spacer"></div><div class="panel pause-panel">
      <h2 class="pause-title">PAUSE</h2>
      <p class="desc center num">${CORES[sim.core].name} · ${fmtTime(sim.chrono)} · ${sim.tut ? 'TUTORIEL' : sim.P.name}</p>
      ${res.length ? `<p class="desc center menthe">Résonances : ${[...new Set(res)].join(' · ')}</p>` : ''}
      <button class="btn btn--primary" data-act="resume">REPRENDRE</button>
      <div class="grid2"><button class="toggle wide${st.sfx > 0 ? ' on' : ''}" data-act="mute">SON ${st.sfx > 0 ? '✔' : '✕'}</button><button class="toggle wide${st.vibration ? ' on' : ''}" data-act="toggle" data-key="vibration">VIBR. ${st.vibration ? '✔' : '✕'}</button></div>
      <div class="grid2"><button class="btn" data-act="restart">RECOMMENCER</button><button class="btn" data-act="quit">QUITTER</button></div>
    </div><div class="spacer"></div>`;
  }

  // ------------------------------------------------------------ FIN DE PARTIE §11
  scr_end({ result: r, summary: s }) {
    const g = s.gains, C = CORES[r.core], core = this.save.cores[r.core];
    const glyph = KIND_GLYPH[r.killerKind] || '▲';
    const res = r.resList.length ? Object.entries(r.res).filter(([, v]) => v > 0).map(([id, v]) => `<span class="rchip">${RES_GLYPH[id]} ${RESONANCES[id].name}${RESONANCES[id].max > 1 ? ' ' + ROMAN[v] : ''}</span>`).join('') : '<span class="desc">aucune Résonance</span>';
    const cards = [
      ...s.stars.map(x => `<div class="gcard"><span>★${x.i + 1} obtenue !</span><span class="num">${PH} +${x.reward}</span></div>`),
      ...s.trophies.map(x => `<div class="gcard"><span>Trophée : ${x.name}</span><span class="num">${PH} +${x.reward}</span></div>`),
      ...(s.baptism ? [`<div class="gcard"><span>Prime de 1re partie</span><span class="num">${PH} +${s.baptism}</span></div>`] : []),
      ...(s.orbit && s.orbit.reward ? [`<div class="gcard"><span>Orbite du jour</span><span class="num">${PH} +${s.orbit.reward}</span></div>`] : []),
    ].join('');
    const ch = this.save.daily.list.map(c => `<span class="chal${c.progress >= c.target ? ' done' : ''}" title="${esc(CHALLENGES[c.id].text)}"><i style="width:${(Math.min(1, c.progress / c.target) * 100).toFixed(0)}%"></i></span>`).join('');
    const buy = cheapestAffordable(this.save);
    const lines = [
      `<div class="end-l"><div class="end-chrono num">${fmtTime(r.time)} s</div><p class="desc center">${r.palierName} · palier ${r.palier}${r.daily ? ' · ORBITE DU JOUR' : ''}</p>
        <p class="center killer">Touché par : <span class="danger-glyph">${glyph} ${esc(r.killer || '—')}</span></p></div>`,
      `<div class="end-l">${s.newRecord ? '<p class="center gold rec-banner">★ NOUVEAU RECORD ★</p>' : ''}<p class="center num">Score ${fmt(r.score)} · ×${r.multMax} max</p><p class="center desc num">Frôlements ${r.grazes} (${r.perfects} parfaits)</p></div>`,
      `<div class="end-l center">${res}</div>`,
      `<div class="end-l gains"><div class="row"><span>Ramassés</span><span class="num">${PH} ${g.fromPhotons}</span></div><div class="row"><span>Temps</span><span class="num">${PH} ${g.fromTime}</span></div>
        <div class="row"><span>Frôlements</span><span class="num">${PH} ${g.fromGrazes}</span></div><div class="row"><span>Paliers</span><span class="num">${PH} ${g.fromPaliers}</span></div>
        <div class="row desc"><span>${C.name} ×${g.mult.toFixed(1).replace('.', ',')}${g.prosp ? ` · Prosp. +${Math.round(g.prosp * 100)} %` : ''}</span><span></span></div>
        <div class="row total"><span>TOTAL</span><span class="num" id="end-total">${PH} ${fmt(s.total)}</span></div>${cards}</div>`,
      `<div class="end-l"><div class="row"><span class="desc">Défis</span><span class="chals">${ch}</span></div></div>`,
      `<div class="end-l">${s.almost ? `<p class="center gold">${esc(s.almost)}</p>` : ''}<p class="center desc">Prochain objectif : ${esc(s.next)}</p></div>`,
    ];
    return `<div class="panel end-panel"><div class="end-scroll scroll" data-act="skip">${lines.join('')}</div>
      <div class="end-btns"><button class="btn btn--primary is-arming" data-act="replay" id="replay">REJOUER</button>
      ${buy ? `<button class="btn btn--buy" data-act="buyreplay">ACHETER ${MODULES[buy.id].name} ${buy.level} ET REJOUER · ${PH} ${buy.cost}</button>` : ''}
      <div class="grid2"><button class="btn" data-act="go" data-to="atelier">ATELIER</button><button class="btn" data-act="go" data-to="noyaux" data-focus="${r.core}">NOYAUX</button></div></div></div>`;
  }
  startEnd() {
    const ls = [...this.root.querySelectorAll('.end-l')], btn = this.root.querySelector('#replay'), t0 = performance.now();
    const arm = 0.2; // l'écran apparaît 0,7 s après l'impact ; REJOUER actif à 0,9 s
    ls.forEach(l => l.classList.add('pending')); btn.disabled = true;
    this.endShown = 0;
    const loop = now => {
      const t = (now - t0) / 1000, k = Math.min(1, t / arm);
      btn.style.setProperty('--arm', (k * 100).toFixed(0) + '%');
      if (k >= 1 && btn.disabled) { btn.disabled = false; btn.classList.remove('is-arming'); }
      const n = Math.min(ls.length, Math.floor(t / 0.4) + 1);
      for (let i = this.endShown; i < n; i++) { ls[i].classList.remove('pending'); if (i === 3) this.app.audio.play('count'); }
      this.endShown = Math.max(this.endShown, n);
      if (k < 1 || this.endShown < ls.length) this.anim = requestAnimationFrame(loop); else this.anim = null;
    };
    this.anim = requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ interactions
  onClick(e) {
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    const a = el.dataset.act, s = this.save, app = this.app;
    if (a !== 'skip') app.audio.play('ui');
    switch (a) {
      case 'back': history.length > 1 ? history.back() : this.go('title', {}, false); break;
      case 'go': this.go(el.dataset.to, { focus: el.dataset.focus }); break;
      case 'play': app.startGame({}); break;
      case 'daily': app.startGame({ daily: true }); break;
      case 'playcore': s.selectedCore = el.dataset.id; app.persist(); app.startGame({ core: el.dataset.id }); break;
      case 'unlock': { const r = unlockCore(s, el.dataset.id); if (r.ok) { app.audio.play('buy'); app.haptics.vibrate([20]); s.selectedCore = el.dataset.id; this.trophyToasts(checkTrophies(s)); app.persist(); app.newDemo(); this.toast(`${CORES[el.dataset.id].name} débloqué !`, 'gold'); this.render(true); } break; }
      case 'buy': { const r = buyModule(s, el.dataset.id); if (r.ok) { app.audio.play('buy'); app.haptics.vibrate([20]); this.trophyToasts(checkTrophies(s)); app.persist(); this.render(true); this.sparkle(); } break; }
      case 'equip': case 'unequip': if (toggleEquip(s, el.dataset.id)) { app.persist(); this.render(true); } break;
      case 'buyslot': { const r = buySlot(s); if (r.ok) { app.audio.play('buy'); app.haptics.vibrate([20]); app.persist(); this.render(true); this.sparkle(); } break; }
      case 'tab': this.tab = el.dataset.tab; this.render(); break;
      case 'claim': { const r = claimChallenge(s, +el.dataset.i); if (r.ok) { app.audio.play('buy'); this.toast(`✦ +${r.reward}${r.bonus ? ` · bonus ✦ +${r.bonus}` : ''}`, 'menthe'); app.persist(); this.render(true); } break; }
      case 'trail': s.trail = el.dataset.id; app.renderer.setTrail(s.trail); app.persist(); this.render(true); break;
      case 'reccore': this.recCore = el.dataset.id; this.render(true); break;
      case 'set': { const k = el.dataset.key; let v = el.dataset.v; if (k === 'holdMs') v = +v; s.settings[k] = v; app.applySettings(); app.persist(); this.render(true); break; }
      case 'toggle': { const k = el.dataset.key; s.settings[k] = !s.settings[k]; app.applySettings(); app.persist(); this.render(true); break; }
      case 'mute': s.settings.sfx = s.settings.sfx > 0 ? 0 : 0.8; s.settings.music = s.settings.sfx > 0 ? 0.6 : 0; app.applySettings(); app.persist(); this.render(true); break;
      case 'tutorial': s.tutorialDone = false; app.persist(); app.startGame({ tutorial: true }); break;
      case 'reset': if (this.resetStep < 2) { this.resetStep++; this.render(true); } else { app.resetSave(); this.toast('Sauvegarde réinitialisée'); this.go('title', {}, false); } break;
      case 'resume': app.resume(); break;
      case 'restart': app.restart(); break;
      case 'quit': app.quitRun(); break;
      case 'replay': app.replay(false); break;
      case 'buyreplay': app.replay(true); break;
      case 'skip': { const ls = this.root.querySelectorAll('.end-l.pending'); ls.forEach(l => l.classList.remove('pending')); this.endShown = 99; break; }
    }
  }
  onInput(e) {
    const el = e.target; if (!el.dataset.key) return;
    this.save.settings[el.dataset.key] = (+el.value) / 100; this.app.applySettings(); clearTimeout(this.pt); this.pt = setTimeout(() => this.app.persist(), 300);
  }
  onPointerDown(e) { if (e.target.id === 'tryzone' || e.target.closest && e.target.closest('#tryzone')) { this.tryT = e.timeStamp; const z = this.root.querySelector('#tryzone'); z.classList.add('press'); } }
  onPointerUp(e) {
    if (this.tryT === undefined || this.tryT === null) return;
    const ms = e.timeStamp - this.tryT, hold = this.save.settings.holdMs; this.tryT = null;
    const z = this.root.querySelector('#tryzone'), r = this.root.querySelector('#tryres'); if (!z) return;
    z.classList.remove('press'); r.textContent = `${ms >= hold ? 'MAINTIEN' : 'TAP'} · ${Math.round(ms)} ms`;
  }
  sparkle() {
    const b = this.root.querySelector('.pill'); if (!b || this.app.reducedMotion()) return;
    const r = b.getBoundingClientRect();
    for (let i = 0; i < 10; i++) { const s = document.createElement('i'); s.className = 'spark'; s.style.left = (r.left + r.width / 2) + 'px'; s.style.top = (r.top + r.height / 2) + 'px';
      const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 30; s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d + 'px'); document.body.appendChild(s); setTimeout(() => s.remove(), 600); }
  }
}
