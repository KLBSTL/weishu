// Fixed-round squad resources. Cached draws survive cancellation, prep boundaries and reconnects.
// Pending offers reserve shared stock; cancellation releases it without changing the cached draw.
import { ERR } from '../../../shared/constants.js';
import { freeSlot } from '../board.js';
import { OK, fail } from './common.js';

export class PlayerRecruitment {
  recruitmentSpec() { return this.gd.band(this.bandId)?.recruitment || null; }

  startRecruitmentRound(r) {
    const spec = this.recruitmentSpec();
    if (!spec || !this.alive) return;
    const state = this.recruitment;
    if (spec.kind === 'columbia-income') {
      if (state.granted.includes(r)) return;
      state.granted.push(r); // Check once after income, before deployed prep-start traits; never retry this round.
      if (this.funds >= spec.minFunds && (freeSlot(this.hand) >= 0 || freeSlot(this.temp) >= 0)) {
        const id = this.m.pool.roll(this.m.rngShop, { maxTier: this.shop.level, filter: candidate => {
          const c = this.gd.chess(candidate);
          return c?.visible && !c.isGolden && !c.isDiy && c.bonds.includes(spec.bond);
        } });
        if (id && this.spend(spec.cost)) {
          this.acquireChess(id, { source: 'recruitment' });
          this._afterSpend(spec.cost, 'band');
        }
      }
      this.dirty();
      return;
    }
    if (spec.rounds.includes(r) && !state.granted.includes(r)) {
      state.granted.push(r); state.charges++;
    }
    if (r === 1 && spec.initialChess && !state.initialGranted) {
      // The initial gift follows the ordinary acquisition path (Beanstalk's first-gain trait included).
      if (this.m.pool.left(spec.initialChess) > 0 && (freeSlot(this.hand) >= 0 || freeSlot(this.temp) >= 0)) {
        state.initialGranted = true;
        this.acquireChess(spec.initialChess, { source: 'recruitment' });
      }
    }
    this.dirty();
  }

  recruitmentSample(uid) {
    const p = this.find(uid)?.piece, c = p?.kind === 'chess' && this.gd.chess(p.id);
    const spec = this.recruitmentSpec();
    return spec?.kind === 'columbia' && c && !c.isGolden && !c.isDiy && c.visible && c.bonds.includes(spec.bond)
      && this.m.pool.has(c.chessId) && c.tier < 6 && c.tier < this.shop.level ? p : null;
  }

  openRecruitment(sampleUid = null) {
    const gate = this._gate(); if (gate) return gate;
    const spec = this.recruitmentSpec(), state = this.recruitment;
    if (!spec || state.charges <= 0) return fail(ERR.BAD_TARGET);
    // Replayed requests never change the current offer or its sample.
    if (state.pending) return OK;
    const sample = spec.kind === 'columbia' ? this.recruitmentSample(sampleUid) : null;
    if (spec.kind === 'columbia' && !sample) return fail(ERR.BAD_TARGET);
    const tier = sample ? this.gd.tierOf(sample.id) + 1 : null;
    // One fixed draw per target tier per resource. A cancelled order may use a different sample, but never fish
    // for new results at the same tier. A beacon keeps the same draw even after a shop upgrade.
    const cacheKey = String(tier ?? 'beacon');
    let ids = state.cache[cacheKey];
    if (!ids) {
      ids = [];
      const owned = new Set(this.allChess().map(p => this.gd.chess(p.id)?.charId));
      const eligible = id => {
        const c = this.gd.chess(id);
        return c && c.visible && !c.isGolden && !c.isDiy && c.bonds.includes(spec.bond)
          && !ids.some(x => this.gd.chess(x).charId === c.charId);
      };
      for (let n = 0; n < spec.count; n++) {
        const opts = { maxTier: this.shop.level, tier, filter: eligible };
        const unseen = spec.kind === 'sarkaz' ? this.m.pool.roll(this.m.rngShop, { ...opts,
          filter: id => eligible(id) && !owned.has(this.gd.chess(id).charId) }) : null;
        const id = unseen || this.m.pool.roll(this.m.rngShop, opts);
        if (!id) break;
        ids.push(id);
      }
      if (!ids.length) return fail(ERR.SOLD_OUT);
      state.cache[cacheKey] = ids;
    }
    const reserved = ids.filter(id => this.gd.tierOf(id) <= this.shop.level && this.m.pool.take(id, 1) === 1);
    if (!reserved.length) return fail(ERR.SOLD_OUT);
    state.pending = { id: `recruit_${++state.serial}`, sampleUid: sample?.uid ?? null, sampleId: sample?.id ?? null, ids: reserved };
    this.dirty();
    return OK;
  }

  releaseRecruitment() {
    for (const id of this.recruitment.pending?.ids || []) this.m.pool.give(id, 1);
    this.recruitment.pending = null;
  }

  cancelRecruitment(offerId) {
    const gate = this._gate(); if (gate) return gate;
    if (this.recruitment.pending?.id !== offerId) return fail(ERR.BAD_TARGET);
    this.releaseRecruitment(); this.dirty();
    return OK;
  }

  pickRecruitment(offerId, idx) {
    const gate = this._gate(); if (gate) return gate;
    const state = this.recruitment, offer = state.pending;
    if (!offer || offer.id !== offerId || state.charges < 1 || !Number.isInteger(idx) || !offer.ids[idx]) return fail(ERR.BAD_TARGET);
    const id = offer.ids[idx];
    if (this.gd.tierOf(id) > this.shop.level) return fail(ERR.BAD_TARGET);
    const sample = offer.sampleUid == null ? null : this.recruitmentSample(offer.sampleUid);
    if (offer.sampleUid != null && (!sample || sample.id !== offer.sampleId || this.gd.tierOf(sample.id) + 1 !== this.gd.tierOf(id))) return fail(ERR.BAD_TARGET);
    if (!sample && freeSlot(this.hand) < 0) return fail(ERR.HAND_FULL);
    if (sample) {
      const loc = this.find(sample.uid);
      // Conservative preflight: enough room for the replacement and every returned item, even without a merge.
      // Never consume the order/sample first and discover overflow afterwards.
      const spaces = [...this.hand, ...this.temp].filter(p => !p).length + (loc.area === 'board' ? 0 : 1);
      const mergeItems = this.completesChessMerge(id) ? this.allChess().filter(p => p.id === id).reduce((n, p) => n + p.items.length, 0) : 0;
      if (spaces < 1 + sample.items.length + mergeItems) return fail(ERR.HAND_FULL);
      this._detach(loc);
      this.removeTokensOf(sample.uid);
      this.returnCopies(sample);
      for (const it of sample.items) this.stow(it, { allowTemp: true });
      sample.items = [];
      this.checkItemMerges();
    }
    // Consume before onGain can recursively dispatch effects. Reserved stock transfers to the gained piece,
    // including a resulting elite; no sell event, currency, or double acquisition.
    state.charges--;
    state.pending = null;
    state.cache = {};
    offer.ids.forEach((other, i) => { if (i !== idx) this.m.pool.give(other, 1); });
    this.acquireChess(id, { source: 'recruitment', fromPool: false, reservedCopies: 1 });
    this.recompute();
    return OK;
  }

  recruitmentView() {
    const spec = this.recruitmentSpec();
    if (!spec || spec.kind === 'columbia-income') return null;
    const state = this.recruitment, offer = state.pending;
    return { kind: spec.kind, charges: state.charges, rounds: spec.rounds, granted: [...state.granted],
      samples: spec.kind === 'columbia' ? this.allChess().filter(p => this.recruitmentSample(p.uid)).map(p => ({ uid: p.uid, id: p.id })) : [],
      offer: offer ? { id: offer.id, sampleUid: offer.sampleUid, sampleId: offer.sampleId, ids: [...offer.ids] } : null };
  }
}
