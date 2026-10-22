// Gestes (GAME_DESIGN §2) : chaque pointeur est suivi indépendamment.
// tap  = relâché avant HOLD_MS → demi-tour ; maintien = enfoncé ≥ HOLD_MS → orbite EXT ;
// relâchement du dernier maintien → orbite INT ; cancel = relâchement sans tap.
// Pur (aucun DOM) : horodatages en ms, événements émis via un callback (type, t).
export const G = { PRESS: 1, TAP: 2, HOLD: 3, RELEASE: 4 };

export class GestureTracker {
  constructor(holdMs = 140, emit = () => {}) {
    this.holdMs = holdMs; this.emit = emit;
    // pool fixe (10 doigts max) : aucune allocation par geste
    this.ids = new Array(10).fill(null); this.tDown = new Float64Array(10);
    this.held = new Uint8Array(10); this.noTap = new Uint8Array(10);
    this.holding = false;
  }
  slot(id) { for (let i = 0; i < 10; i++) if (this.ids[i] === id) return i; return -1; }
  get count() { let n = 0; for (let i = 0; i < 10; i++) if (this.ids[i] !== null) n++; return n; }
  down(id, t) {
    if (this.slot(id) >= 0) return;
    const i = this.ids.indexOf(null); if (i < 0) return;
    this.ids[i] = id; this.tDown[i] = t; this.held[i] = 0; this.noTap[i] = 0;
    this.emit(G.PRESS, t);
  }
  // à appeler avant chaque pas de simulation : promeut les appuis longs au temps exact tDown + holdMs
  poll(t) {
    for (let i = 0; i < 10; i++) {
      if (this.ids[i] === null || this.held[i]) continue;
      const th = this.tDown[i] + this.holdMs;
      if (t >= th) { this.held[i] = 1; if (!this.holding) { this.holding = true; this.emit(G.HOLD, th); } }
    }
  }
  up(id, t, cancel = false) {
    const i = this.slot(id); if (i < 0) return;
    // relâchement arrivé en retard : si l'horodatage du pointerup dit « avant le seuil », c'était un tap, même si un
    // poll a déjà promu l'appui (événement livré après le pas de simulation) → on annule le maintien et on tape.
    const early = this.held[i] && t < this.tDown[i] + this.holdMs;
    if (!early) this.poll(t);
    const wasHeld = this.held[i] && !early, noTap = this.noTap[i];
    this.ids[i] = null; this.held[i] = 0;
    if (early) { let other = false; for (let k = 0; k < 10; k++) if (this.ids[k] !== null && this.held[k]) other = true; if (!other) { this.holding = false; this.emit(G.RELEASE, t); } }
    if (!wasHeld) { if (!cancel && !noTap) this.emit(G.TAP, t); return; }
    for (let k = 0; k < 10; k++) if (this.ids[k] !== null && this.held[k]) return; // un autre maintien reste actif
    this.holding = false; this.emit(G.RELEASE, t);
  }
  // fin du compte à rebours de reprise : aucun tap n'est comptabilisé pour les doigts déjà posés
  freezeTaps() { for (let i = 0; i < 10; i++) if (this.ids[i] !== null) this.noTap[i] = 1; }
  // charge visuelle de l'anneau (0..1) du doigt non promu le plus avancé, −1 si aucun
  charge(t) {
    let c = -1;
    for (let i = 0; i < 10; i++) if (this.ids[i] !== null && !this.held[i]) c = Math.max(c, Math.min(1, (t - this.tDown[i]) / this.holdMs));
    return c;
  }
  clear() { for (let i = 0; i < 10; i++) { this.ids[i] = null; this.held[i] = 0; } this.holding = false; }
}
