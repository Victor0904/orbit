// Bande d'annonce (DESIGN §1 règle 7, §7.2–7.3) : UNE seule bannière à la fois, file d'attente, doublons refusés.
// Le pop du multiplicateur n'est affiché que si aucune bannière (ni texte de tutoriel) n'occupe la bande.
// Pur (sans DOM) : testé sous Node (tests/announcer.test.js).
export const BANNER = { PALIER: 1, PHASE: 2, RES: 3, SUR: 4, NEWPAL: 5, RECORD: 6, INFO: 7 };

export class Announcer {
  constructor() { this.q = []; this.cur = null; this.sticky = ''; this.popTier = -1; this.popT = 9; this.shown = 0; this.history = null; }
  reset() { this.q.length = 0; this.cur = null; this.sticky = ''; this.popTier = -1; this.popT = 9; }
  // a = sur-titre (10 px), b = titre ; dur en s (entrée 0,15 + maintien + sortie 0,25)
  push(kind, a, b, dur = 1.4) {
    if (this.cur && this.cur.a === a && this.cur.b === b) return false;
    for (const x of this.q) if (x.a === a && x.b === b) return false;
    if (this.q.length >= 4) this.q.shift();
    this.q.push({ kind, a, b, dur, t: 0 });
    if (!this.cur) this.next();
    return true;
  }
  next() {
    this.cur = this.q.length ? this.q.shift() : null;
    if (this.cur) { this.cur.t = 0; this.shown++; if (this.history) this.history.push(this.cur.a + '|' + this.cur.b); }
  }
  setSticky(text) { this.sticky = text || ''; }
  // pop « ×4 » : jamais par-dessus une bannière ; un pop plus récent remplace le précédent (pas de file)
  pop(tier) { if (this.cur || this.sticky) return false; this.popTier = tier; this.popT = 0; return true; }
  update(dt) {
    if (this.cur) {
      // file chargée : la bannière courante raccourcit son maintien (pas d'accumulation de retard)
      this.cur.t += dt * (this.q.length ? 1.6 : 1);
      if (this.cur.t >= this.cur.dur) this.next();
    }
    if (this.popT < 9) this.popT += dt;
    if (this.cur || this.sticky) this.popT = 9; // une bannière masque le pop en cours
  }
  // ce qui occupe la bande à cet instant : 'banner', 'sticky', 'pop' ou ''
  occupant() { return this.cur ? 'banner' : this.sticky ? 'sticky' : this.popT < 0.6 ? 'pop' : ''; }
}
