// Les 6 noyaux (DESIGN §5), 3 phases chacun. Dessinés en traits simples (sans glow : le halo est un sprite).
// g : contexte 2D déjà transformé (origine = C, unités = u). col/acc : couleurs du noyau (ZÉNITH : couleur cyclique).
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const BG1 = 'rgba(8,12,26,0.92)';

function poly(g, n, r, a0) { g.beginPath(); for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); }
function star(g, n, r, step, a0) { g.beginPath(); for (let i = 0; i <= n; i++) { const k = (i * step) % n, a = a0 + k / n * TAU; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); }
function disk(g, r, fill, stroke, lw) { g.beginPath(); g.arc(0, 0, r, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }

export function drawCore(g, id, phase, t, br, col, acc) {
  g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = 1;
  switch (id) {
    case 'atlas': {
      disk(g, 30 * br, BG1, col, 2);
      const ex = (phase >= 2 ? 48 : 40) * br, sp = (phase >= 2 ? 32 : 20) * D2R, n = phase >= 3 ? 4 : 3;
      g.lineWidth = 1.5; g.globalAlpha = 0.9; g.strokeStyle = col;
      for (let i = 0; i < n; i++) { g.beginPath(); g.ellipse(0, 0, ex, 9 * br, t * sp + i * Math.PI / n, 0, TAU); g.stroke(); }
      if (phase >= 3) { g.strokeStyle = acc; g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * 60 * D2R + 0.3; g.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); g.lineTo(Math.cos(a + 0.18) * 16, Math.sin(a + 0.18) * 16); g.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); } g.stroke(); }
      g.globalAlpha = 1; disk(g, 8 * br, acc); break;
    }
    case 'vesta': {
      const a0 = t * 15 * D2R, R = 30 * br;
      g.fillStyle = BG1; g.strokeStyle = col; g.lineWidth = 2;
      if (phase >= 3) { g.beginPath(); for (let i = 0; i < 14; i++) { const a = a0 + i / 14 * TAU, r = i & 1 ? 24 * br : 36 * br; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); }
      else poly(g, 7, R, a0);
      g.fill(); g.stroke();
      if (phase >= 2) { g.strokeStyle = acc; g.lineWidth = 1.2; g.globalAlpha = 0.85; star(g, 7, R * 0.92, 3, a0); g.stroke(); g.globalAlpha = 1; }
      const n = phase >= 3 ? 5 : 3; g.fillStyle = acc;
      for (let i = 0; i < n; i++) { const a = t * 90 * D2R + i / n * TAU; g.beginPath(); g.arc(Math.cos(a) * 44, Math.sin(a) * 44, 4, 0, TAU); g.fill(); }
      disk(g, 6 * br, acc); break;
    }
    case 'kepler': {
      disk(g, 30 * br, BG1, null);
      const tick = phase >= 3 ? Math.floor(t / 0.5) * 30 * D2R : 0, ne = phase >= 3 ? 3 : 2;
      g.strokeStyle = col; g.lineWidth = 1.6;
      for (let i = 0; i < ne; i++) { const a = phase >= 3 ? tick + i * 60 * D2R : (i ? -1 : 1) * t * 25 * D2R; g.beginPath(); g.ellipse(Math.cos(a) * 4, Math.sin(a) * 4, 30 * br, 18 * br, a, 0, TAU); g.stroke(); }
      const gear = (r, n, a0) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = a0 + i / (n * 2) * TAU, rr = i & 1 ? r - 3 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); g.lineTo(Math.cos(a + TAU / (n * 4)) * rr, Math.sin(a + TAU / (n * 4)) * rr); } g.closePath(); g.stroke(); };
      g.strokeStyle = acc; g.lineWidth = 1.3; gear(20 * br, 12, phase >= 3 ? tick : t * 20 * D2R);
      if (phase >= 2) gear(12 * br, 8, phase >= 3 ? -tick : -t * 34 * D2R);
      disk(g, 4, acc); break;
    }
    case 'selene': {
      const R = 30 * br; disk(g, R, 'rgba(201,214,255,0.9)', null);
      const term = (k, sgn) => { const ph = ((t / 8 + k) % 1) * 2 - 1; g.fillStyle = '#03050B'; g.beginPath(); g.ellipse(sgn * ph * R * 0.9, 0, R * Math.abs(ph) * 0.95 + 4, R * 1.01, 0, 0, TAU); g.fill(); };
      g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
      if (phase >= 3) { term(0, 1); g.globalAlpha = 0.55; term(0, -1); g.globalAlpha = 1; } else if (phase >= 2) { term(0, 1); term(0.5, -1); } else term(0, 1);
      g.strokeStyle = '#8E9CC8'; g.lineWidth = 1;
      for (const [x, y, r] of [[-10, -8, 5], [8, 6, 7], [-4, 14, 3.5]]) { g.beginPath(); g.arc(x * br, y * br, r * br, 0, TAU); g.stroke(); }
      g.restore();
      g.strokeStyle = acc; g.lineWidth = 1.5; g.globalAlpha = 0.8; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke(); g.globalAlpha = 1;
      if (phase >= 3) { g.setLineDash([3, 4]); g.strokeStyle = '#C9D6FF'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, 36, t * 0.5, t * 0.5 + TAU); g.stroke(); g.setLineDash([]); }
      break;
    }
    case 'nyx': {
      const rx = (phase >= 2 ? 64 : 54) * br, sp = (phase >= 2 ? 180 : 120) * D2R, hor = (phase >= 3 ? 32 : 26) * br;
      const diskHalf = (tilt, front) => {
        g.save(); g.rotate(tilt); g.strokeStyle = col; g.lineWidth = 2.4; g.globalAlpha = 0.85;
        g.beginPath(); g.ellipse(0, 0, rx, 12 * br, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke();
        g.fillStyle = acc; g.globalAlpha = 0.8;
        for (let i = 0; i < 40; i++) { const a = t * sp + i / 40 * TAU, s = Math.sin(a); if ((s > 0) !== front) continue; const rr = 0.72 + 0.28 * ((i * 7) % 10) / 10; g.fillRect(Math.cos(a) * rx * rr - 0.7, s * 12 * br * rr - 0.7, 1.4, 1.4); }
        g.restore(); g.globalAlpha = 1;
      };
      diskHalf(15 * D2R, false); if (phase >= 3) diskHalf(-20 * D2R, false);
      disk(g, hor, '#000000', null);
      g.strokeStyle = col; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, hor + 2, 0, TAU); g.stroke();
      diskHalf(15 * D2R, true); if (phase >= 3) diskHalf(-20 * D2R, true);
      break;
    }
    case 'zenith': {
      const R = 30 * br, a = t * 20 * D2R;
      g.fillStyle = BG1; g.strokeStyle = col; g.lineWidth = 2; poly(g, 6, R, a); g.fill(); g.stroke();
      g.lineWidth = 1.4; g.strokeStyle = acc; g.globalAlpha = 0.9; poly(g, 3, R * 0.86, -a * 1.5); g.stroke(); poly(g, 3, R * 0.86, -a * 1.5 + Math.PI); g.stroke(); g.globalAlpha = 1;
      if (phase >= 2) { g.setLineDash([4, 4]); g.strokeStyle = col; g.lineWidth = 1.2; poly(g, 6, 38, -a); g.stroke(); g.setLineDash([]); }
      if (phase >= 3) { g.fillStyle = col; for (let i = 0; i < 6; i++) { const b = t * 60 * D2R + i / 6 * TAU; g.save(); g.translate(Math.cos(b) * 44, Math.sin(b) * 44); poly(g, 3, 6, b); g.fill(); g.restore(); } }
      disk(g, 5, acc); break;
    }
  }
  g.globalAlpha = 1;
}
// Couleur cyclique de ZÉNITH (HSL 190° → 290° → 190°, période 8 s) : 64 teintes pré-calculées (aucune allocation par frame)
export const ZENITH_COLS = Array.from({ length: 64 }, (_, i) => { const k = i / 64, h = 190 + 100 * (0.5 - 0.5 * Math.cos(k * TAU)); return `hsl(${h.toFixed(0)},90%,68%)`; });
export const ZENITH_BG = Array.from({ length: 64 }, (_, i) => { const k = i / 64, h = 190 + 100 * (0.5 - 0.5 * Math.cos(k * TAU)); return `hsl(${h.toFixed(0)},90%,20%)`; });
export function zenithIndex(t) { return Math.floor(((t / 8) % 1) * 64) & 63; }
