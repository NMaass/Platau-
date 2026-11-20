// Moves room: Trades (two-sided builder, All22 meter from model.evaluateTrade with the
// reason in a peek, Propose and "What would make this work?" in dialogs, trade block of
// your own Pokémon), Offers (incoming AI offers: Accept / Decline / Counter), Free agents
// (ZenGM columns, negotiate in a dialog, re-sign window + franchise tag in the offseason).
import type {DraftPick, Mon, MonId, TeamId, TradeOffer} from '../../types.ts';
import {esc, ic, money, plural, signed} from '../dom.ts';
import {C, S, store, act, notify} from '../store.ts';
import {M, api} from '../model.ts';
import {head, panel, empty} from '../components/page.ts';
import {table, type Col} from '../components/table.ts';
import {openDialog, updateDialog, dialogEl, info, peekLabel, prow, type DialogOpts, type DialogAction} from '../components/layer.ts';
import {ROLE_LABEL} from '../../catalog/roles.ts';
import {monRef, monName, teamName, teamCell, speciesOf} from '../components/mon.ts';
import {expiringTag, injuryTag} from '../components/badges.ts';
import {ico, teamLogo} from '../sprites.ts';
import {closed, fixChip, capStrip, knownBadge, knownMid, pickLabel, pickKey, rosterUsed, tradeMeter, beforeAfter, once} from '../components/front.ts';
import {oppChips} from './week.ts';
import {INTEREST_MULT} from '../../model/freeagency.ts';
import {stat, stats} from '../components/stats.ts';

type Proposal = Omit<TradeOffer, 'id' | 'status' | 'expiresWeek'>;
interface TradeUi { team: TeamId; give: string[]; get: string[] }
const MAX_SIDE = 4;

function tradeUi(): TradeUi {
  const s = S(), me = s.userTeamId;
  let t = store.ui.trade as TradeUi | undefined;
  if (!t || !s.teams[t.team] || t.team === me) {
    t = {team: Object.keys(s.teams).find((id) => id !== me)!, give: [], get: []};
    store.ui.trade = t;
  }
  return t;
}
const findPick = (teamId: TeamId, key: string): DraftPick | undefined => S().teams[teamId].draftPicks.find((p) => pickKey(p) === key);
/** Resolve builder keys ("m:<id>" / pick key) to a proposal; drops assets that moved since. */
function proposal(t: TradeUi): Proposal {
  const s = S(), me = s.userTeamId;
  const side = (keys: string[], owner: TeamId) => ({
    mons: keys.filter((k) => k.startsWith('m:')).map((k) => k.slice(2)).filter((id) => s.mons[id]?.teamId === owner),
    picks: keys.filter((k) => k.startsWith('p:')).map((k) => findPick(owner, k)).filter((p): p is DraftPick => !!p),
  });
  return {fromTeamId: me, toTeamId: t.team, give: side(t.give, me), get: side(t.get, t.team)};
}
const isEmpty = (p: Proposal) => !p.give.mons.length && !p.give.picks.length && !p.get.mons.length && !p.get.picks.length;
const salary = (ids: MonId[]) => ids.reduce((t, id) => t + (S().mons[id].contract?.salary ?? 0), 0);
const assetName = (k: string, owner: TeamId): string => {
  if (k.startsWith('m:')) return monName(S().mons[k.slice(2)]);
  const p = findPick(owner, k);
  return p ? `season ${p.season} round ${p.round} pick` : 'pick';
};
type Verdict = ReturnType<typeof api.evaluateTrade>;
/** A verdict in numbers: their value score against the score they need, and the Pokémon that decides it. A broken
 *  rule (roster, cap, species) shows as its message. */
function verdictNums(ev: Verdict | null): string {
  if (!ev) return '&nbsp;';
  if (ev.problem) return `<span class="l-row x-vnums">${ic('alert')}<span>${esc(ev.problem)}</span></span>`;
  const m = ev.keyMonId ? S().mons[ev.keyMonId] : undefined;
  return `<span class="l-row x-vnums"><span class="cap">Value</span><b class="x-num${ev.score >= ev.need ? '' : ' x-over'}">${signed(ev.score)}</b><span class="muted">of ${signed(ev.need)} needed</span>${m ? `<span class="l-row" title="${esc(`Key Pokémon: ${monName(m)}`)}">${ico(speciesOf(m))}<span class="muted">key</span></span>` : ''}</span>`;
}
const verdictPop = (ev: Verdict | null, word: string): string => `<strong>Will they accept: ${esc(word)}</strong>${ev
  ? (ev.problem ? `<span>${esc(ev.problem)}.</span>` : prow('Their value', signed(ev.score)) + prow('Needed', signed(ev.need)) + (ev.keyMonId ? prow('Key Pokémon', esc(monName(S().mons[ev.keyMonId]))) : ''))
  : prow('Score', '—')}`;
const tradeClosed = (): string | null => { const w = api.tradeWindow(S()); return w.open ? null : w.reason; };

// ---------------------------------------------------------------- trades
function assetRow(k: string, side: 'give' | 'get', owner: TeamId): string {
  const s = S();
  if (k.startsWith('m:')) {
    const m = s.mons[k.slice(2)];
    return `<li><span class="x-who">${monRef(m)}</span>${knownBadge(m)}<span class="x-sal">${m.contract ? money(m.contract.salary) : '—'}</span><button type="button" class="btn" data-fo="rm" data-side="${side}" data-key="${esc(k)}" aria-label="Remove ${esc(monName(m))}">${ic('x')}</button></li>`;
  }
  const p = findPick(owner, k);
  if (!p) return '';
  return `<li><span class="x-who"><span class="x-pick" aria-hidden="true">R${p.round}</span><span>${pickLabel(p, {owner: true})}</span></span><span class="x-small">Pick</span><span class="x-sal">—</span><button type="button" class="btn" data-fo="rm" data-side="${side}" data-key="${esc(k)}" aria-label="Remove season ${p.season} round ${p.round} pick">${ic('x')}</button></li>`;
}
function addSelect(side: 'give' | 'get', owner: TeamId, chosen: string[]): string {
  const s = S(), c = C();
  const mons = api.teamRoster(s, owner).filter((m) => !chosen.includes('m:' + m.id)).sort((a, b) => knownMid(b) - knownMid(a));
  const picks = s.teams[owner].draftPicks.filter((p) => !chosen.includes(pickKey(p))).sort((a, b) => a.season - b.season || a.round - b.round);
  const mLabel = (m: Mon) => {
    const k = owner === s.userTeamId ? {lo: M.bestRole(c, s, m).ovr, hi: M.bestRole(c, s, m).ovr, role: M.bestRole(c, s, m).role} : api.knownRating(c, s, s.userTeamId, m);
    return `${monName(m)} · ${k.lo === k.hi ? k.lo : `${k.lo}–${k.hi}`} · ${m.contract ? money(m.contract.salary) : ''}`;
  };
  const full = chosen.length >= MAX_SIDE;
  return `<select data-fo="add" data-side="${side}" aria-label="${side === 'give' ? 'Add to what you give' : 'Add to what you get'}"${full ? ' disabled' : ''}><option value="">${full ? `${MAX_SIDE} is the most per side` : 'Add Pokémon or pick…'}</option><optgroup label="Pokémon">${mons.map((m) => `<option value="m:${esc(m.id)}">${esc(mLabel(m))}</option>`).join('')}</optgroup><optgroup label="Draft picks">${picks.map((p) => `<option value="${esc(pickKey(p))}">season ${p.season} round ${p.round}${p.originalTeamId !== owner ? ` (${esc(s.teams[p.originalTeamId].abbr)})` : ''}</option>`).join('')}</optgroup></select>`;
}

function builder(): string {
  const s = S(), c = C(), me = s.userTeamId, t = tradeUi();
  const p = proposal(t);
  const ev = isEmpty(p) ? null : api.evaluateTrade(c, s, p);
  const meter = tradeMeter(ev);
  const list = (side: 'give' | 'get', keys: string[], owner: TeamId) => {
    const rows = keys.map((k) => assetRow(k, side, owner)).join('');
    return `<ul class="x-assets" aria-label="${side === 'give' ? 'You give' : 'You get'}">${rows || '<li class="x-empty">Nothing yet</li>'}</ul>`;
  };
  const them = s.teams[t.team];
  const sel = `<label class="x-field-lbl">Trade with<select data-fo="team" aria-label="Trade with">${Object.values(s.teams).filter((x) => x.id !== me).map((x) => `<option value="${esc(x.id)}"${x.id === t.team ? ' selected' : ''}>${esc(x.city)} ${esc(x.name)}</option>`).join('')}</select></label>`;
  const payMe = api.payroll(s, me), cap = s.settings.cap;
  const afterMe = payMe - salary(p.give.mons) + salary(p.get.mons);
  const payThem = api.payroll(s, t.team), afterThem = payThem - salary(p.get.mons) + salary(p.give.mons);
  const why = verdictPop(ev, meter.word);
  return `<div class="l-card"><div class="l-split"><span class="l-row">${teamLogo(them)}${sel}</span>${oppChips(t.team)}</div></div>
  <div class="x-sides">
    <section class="l-card" aria-labelledby="h-give"><div class="l-split"><h2 class="l-card-title" id="h-give">You give</h2><span class="x-small">${t.give.length}/${MAX_SIDE}</span></div>${list('give', t.give, me)}${addSelect('give', me, t.give)}</section>
    <section class="l-card" aria-labelledby="h-get"><div class="l-split"><h2 class="l-card-title" id="h-get">You get</h2><span class="x-small">${t.get.length}/${MAX_SIDE}</span></div>${list('get', t.get, t.team)}${addSelect('get', t.team, t.get)}</section>
  </div>
  <section class="l-card" aria-label="Trade summary">
    <div class="l-grid" style="--card-min:320px;grid-auto-rows:auto">
      <div class="l-stack tight"><span class="cap">Cap room after the trade</span>${beforeAfter([['You', cap - payMe, cap - afterMe], [them.name, cap - payThem, cap - afterThem]])}</div>
      <div class="l-stack tight"><span class="l-row"><span class="cap">Will they accept?</span>${info('Will they accept: ' + meter.word, why)}</span>${meter.html}<span class="x-small l-clamp" style="--lines:1">${verdictNums(ev)}</span></div>
    </div>
    <div class="l-split"><div class="l-actions"><button type="button" class="btn go" data-fo="propose"${!ev ? ' aria-disabled="true"' : ''}>Propose</button><button type="button" class="btn" data-fo="balance"${!ev ? ' aria-disabled="true"' : ''} aria-label="What would make this work?">Make it work</button></div><button type="button" class="btn sm" data-fo="clear"${!ev ? ' aria-disabled="true"' : ''}>${ic('x')}Clear</button></div>
  </section>`;
}

export function viewTrades(): string {
  const s = S(), me = s.userTeamId;
  const why = tradeClosed();
  if (why) return closed('Trades', `Season ${s.season}`, why === 'After the trade deadline' ? `The trade deadline (week ${s.settings.tradeDeadlineWeek}) has passed. Trades reopen after the Indigo Plateau.` : `${why}.`, [['#freeagents', 'Free agents'], ['#week', 'Back to This week']]);
  const block = ((store.ui.block as MonId[] | undefined) ?? []).map((id) => s.mons[id]).filter((m) => m?.teamId === me);
  const blockRows = table<Mon>({id: 'block', minWidth: 680, label: 'Trade block', rows: block, cols: [
    {key: 'name', label: 'Pokémon', width: '34%', cell: (m) => `<span class="who">${monRef(m)}${injuryTag(m)}</span>`, sort: (m) => monName(m)},
    {key: 'role', label: 'Role', width: '120px', cell: (m) => knownBadge(m), sort: knownMid, desc: true},
    {key: 'age', label: 'Age', width: '56px', num: true, cell: (m) => String(m.age), sort: (m) => m.age},
    {key: 'sal', label: 'Salary', width: '120px', num: true, cell: (m) => m.contract ? `${money(m.contract.salary)} · ${m.contract.yearsLeft}y` : '—', sort: (m) => m.contract?.salary ?? 0, desc: true},
    {key: 'act', label: '', width: '216px', cell: (m) => `<span class="l-cellacts"><button type="button" class="btn sm" data-fo="shop" data-mon="${esc(m.id)}" aria-label="Shop ${esc(monName(m))}">Shop</button><button type="button" class="btn sm" data-fo="unblock" data-mon="${esc(m.id)}" aria-label="Take ${esc(monName(m))} off the block">Remove</button></span>`},
  ]});
  const mine = api.teamRoster(s, me).filter((m) => !block.includes(m)).sort((a, b) => monName(a).localeCompare(monName(b)));
  const addBlock = `<div class="l-toolbar l-pad"><select data-fo="block" aria-label="Put a Pokémon on the block"><option value="">Put a Pokémon on the block…</option>${mine.map((m) => `<option value="${esc(m.id)}">${esc(monName(m))}</option>`).join('')}</select><span class="x-small">Only your Pokémon. Shop puts one in the builder.</span></div>`;
  const deadline = s.phase === 'regular' ? ` · deadline after week ${s.settings.tradeDeadlineWeek}` : '';
  return head('Trades', `${money(s.settings.cap - api.payroll(s, me))} cap room${esc(deadline)}`) +
    `<div class="l-stack loose" id="x-builder">${builder()}</div>
    <section class="l-panel flush l-section" aria-labelledby="h-blk"><h2 id="h-blk">Trade block</h2>${addBlock}${block.length ? blockRows : `<div class="l-pad">${empty('Nobody on the block', 'Put Pokémon you would move on the block, then shop them to other clubs.')}</div>`}</section>`;
}

function proposeDialog(): void {
  const s = S(), t = tradeUi(), p = proposal(t), them = s.teams[t.team];
  const ev = api.evaluateTrade(C(), s, p);
  const res = act((st, c) => api.proposeTrade(c, st, p));
  if (res.accepted) { store.ui.trade = {team: t.team, give: [], get: []}; notify(); }
  const names = (side: Proposal['give'], owner: TeamId) => [...side.mons.map((id) => monName(S().mons[id])), ...side.picks.map((pk) => `season ${pk.season} round ${pk.round} pick`)].join(' and ') || 'nothing';
  void names;
  const body = `<div class="x-reply">${ic(res.accepted ? 'check' : 'x')}<span><b>${esc(them.name)} ${res.accepted ? 'accept' : 'decline'}</b></span></div><div class="l-row">${verdictNums(ev)}</div>
    ${res.accepted ? `<p class="muted">You get ${esc([...p.get.mons.map((id) => monName(S().mons[id])), ...p.get.picks.map((pk) => `season ${pk.season} round ${pk.round} pick`)].join(' and ') || 'nothing')}. New arrivals join your backups.</p>` : ''}`;
  const fill = res.accepted ? fillChoice() : null;
  openDialog({title: res.accepted ? 'Trade accepted' : 'Trade declined', cap: teamName(them.id), body: body + (fill?.html ?? ''),
    actions: fill ? fill.actions : res.accepted ? [{key: 'close', label: 'Done', go: true}] : [{key: 'close', label: 'Back'}, {key: 'balance', label: 'Make it work', go: true}],
    onAction: (k) => { if (fill) return fill.onAction(k); if (k === 'balance') { balanceDialog(true); return false; } }});
}

/** Cheapest single asset of yours that turns the AI's verdict to yes. In place = replace the open dialog. */
function balanceDialog(inPlace = false): void {
  const show = (o: DialogOpts) => { if (inPlace) updateDialog({cap: undefined, actions: undefined, onAction: undefined, ...o}); else openDialog(o); };
  const s = S(), c = C(), me = s.userTeamId, t = tradeUi(), p = proposal(t), them = s.teams[t.team];
  if (!p.get.mons.length && !p.get.picks.length) {
    show({title: 'Pick what you want first', body: `<p class="muted">Add at least one Pokémon or pick to “You get”, and ${esc(them.name)} will say what they would need back.</p>`});
    return;
  }
  const base = api.evaluateTrade(c, s, p);
  if (base.accept) { show({title: 'Already a deal', cap: teamName(them.id), body: `<div class="l-row">${verdictNums(base)}</div>`}); return; }
  if (t.give.length >= MAX_SIDE) { show({title: 'No room to add', body: `<p class="muted">You already give ${MAX_SIDE}. Take something out first.</p>`}); return; }
  const cands: {key: string; score: number}[] = [];
  for (const m of api.teamRoster(s, me)) if (!t.give.includes('m:' + m.id)) {
    const e = api.evaluateTrade(c, s, {...p, give: {mons: [...p.give.mons, m.id], picks: p.give.picks}});
    if (e.accept) cands.push({key: 'm:' + m.id, score: e.score});
  }
  for (const pk of s.teams[me].draftPicks) if (!t.give.includes(pickKey(pk))) {
    const e = api.evaluateTrade(c, s, {...p, give: {mons: p.give.mons, picks: [...p.give.picks, pk]}});
    if (e.accept) cands.push({key: pickKey(pk), score: e.score});
  }
  // the smallest overpay: lowest score that still says yes
  const pick = cands.sort((a, b) => a.score - b.score)[0];
  if (!pick) {
    show({title: 'No single add gets it done', cap: teamName(them.id), body: `<div class="x-reply">${ic('x')}<span><b>0</b> of your Pokémon or picks bridge it alone</span></div><div class="l-row">${verdictNums(base)}</div>`});
    return;
  }
  const nm = assetName(pick.key, me);
  const m = pick.key.startsWith('m:') ? s.mons[pick.key.slice(2)] : null;
  show({title: 'What would make this work', cap: teamName(them.id),
    body: `<div class="x-reply">${ic('deal')}<span><b>Add ${esc(nm)}</b></span></div>${m ? `<div class="l-row">${ico(speciesOf(m))}<b>${esc(monName(m))}</b>${knownBadge(m)}<span class="x-small">${m.contract ? `${money(m.contract.salary)} · ${m.contract.yearsLeft}y · ` : ''}age ${m.age}</span></div>` : ''}<div class="l-row"><span class="cap">Value</span><b class="x-num x-over">${signed(base.score)}</b><span class="x-arrow" aria-label="to">→</span><b class="x-num">${signed(pick.score)}</b><span class="muted">of ${signed(base.need)} needed</span></div>`,
    actions: [{key: 'close', label: 'Cancel'}, {key: 'add', label: 'Add it', go: true}],
    onAction: (k) => { if (k === 'add') { tradeUi().give.push(pick.key); notify(); } return k === 'close' || k === 'add' ? undefined : false; }});
}

// ---------------------------------------------------------------- offers
function offerCard(o: TradeOffer): string {
  const s = S(), me = s.userTeamId, them = s.teams[o.fromTeamId];
  // the offer is from their side: they give o.give, they get o.get (= what you give)
  const mini = (side: TradeOffer['give']) => `<ul class="x-mini">${side.mons.map((id) => { const m = s.mons[id]; return `<li>${monRef(m)}${knownBadge(m)}</li>`; }).join('')}${side.picks.map((p) => `<li><span class="x-pick" aria-hidden="true">R${p.round}</span><span>${pickLabel(p, {owner: true})}</span></li>`).join('')}</ul>`;
  const room = s.settings.cap - api.payroll(s, me);
  const dSal = salary(o.give.mons.filter((id) => s.mons[id])) - salary(o.get.mons.filter((id) => s.mons[id]));
  const today = o.expiresWeek <= s.week;
  const acts = o.status === 'open'
    ? `<div class="l-actions"><button type="button" class="btn go" data-fo="accept" data-offer="${esc(o.id)}">Accept</button><button type="button" class="btn" data-fo="counter" data-offer="${esc(o.id)}">Counter</button><button type="button" class="btn" data-fo="decline" data-offer="${esc(o.id)}">Decline</button></div>`
    : o.status === 'accepted' ? fixChip('growth', 'check', 'Accepted') : o.status === 'declined' ? fixChip('league', 'x', 'Declined') : fixChip('league', 'clock', 'Expired');
  return `<article class="l-card" aria-labelledby="h-${esc(o.id)}">
    <div class="l-split">${fixChip('deal', 'deal', 'Offer')}${o.status === 'open' ? `<span class="tag ${today ? 't-dtd' : ''}">${ic('clock')}${today ? 'Ends this week' : `Ends week ${o.expiresWeek}`}</span>` : ''}</div>
    <div class="l-stack tight"><h2 class="l-card-title x-team" id="h-${esc(o.id)}">${teamLogo(them)}<span>${esc(teamName(them.id))}</span></h2>${oppChips(o.fromTeamId)}</div>
    <div class="x-offer-cols"><div class="l-stack tight"><span class="cap">You give</span>${mini(o.get)}</div><div class="l-stack tight"><span class="cap">You get</span>${mini(o.give)}</div></div>
    ${o.status === 'open' ? beforeAfter([['Cap room', room, room - dSal]]) : ''}
    <div class="x-actslot">${acts}</div></article>`;
}

export function viewOffers(): string {
  const s = S(), me = s.userTeamId;
  const why = tradeClosed();
  if (why) return closed('Offers', `Season ${s.season}`, why === 'After the trade deadline' ? 'Clubs stop sending offers after the trade deadline. They start again after the Indigo Plateau.' : `${why}.`, [['#freeagents', 'Free agents'], ['#week', 'Back to This week']]);
  const open = s.offers.filter((o) => o.toTeamId === me && o.status === 'open');
  const done = s.offers.filter((o) => o.toTeamId === me && o.status !== 'open').slice(-4).reverse();
  const sub = open.length ? `${plural(open.length, 'offer')} open` : 'No open offers';
  return head('Offers', sub) +
    (open.length ? `<div class="l-grid" style="--card-min:min(100%,400px)">${open.map(offerCard).join('')}</div>` : empty('No offers right now', `Clubs send offers during the season, up to the trade deadline after week ${s.settings.tradeDeadlineWeek}. Put Pokémon on your trade block to draw interest.`, `<a class="btn" href="#trades">Trade block</a>`)) +
    (done.length ? `<section class="l-section" aria-labelledby="h-past"><h2 id="h-past">Recent</h2><div class="l-grid" style="--card-min:min(100%,400px)">${done.map(offerCard).join('')}</div></section>` : '');
}

function offerDialog(id: string, accept: boolean): void {
  const s = S(), o = s.offers.find((x) => x.id === id);
  if (!o) return;
  const them = s.teams[o.fromTeamId];
  const nm = (side: TradeOffer['give']) => [...side.mons.map((m) => monName(s.mons[m])), ...side.picks.map((p) => `season ${p.season} round ${p.round} pick`)].join(' and ');
  openDialog({title: accept ? `Accept ${esc(them.name)}' offer?` : `Decline ${esc(them.name)}' offer?`,
    body: `<p class="muted">You give <b>${esc(nm(o.get))}</b> and get <b>${esc(nm(o.give))}</b>.${accept ? '' : ' They won\'t ask again this week.'}</p>`,
    actions: [{key: 'close', label: 'Keep open'}, {key: 'yes', label: accept ? 'Accept trade' : 'Decline', go: true}],
    onAction: (k) => {
      if (k !== 'yes') return;
      const before = s.offers.find((x) => x.id === id)?.status;
      act((st, c) => api.respondOffer(c, st, id, accept));
      const after = S().offers.find((x) => x.id === id)?.status;
      void before;
      if (!accept) return;
      const fill = after === 'accepted' ? fillChoice() : null;
      updateDialog({title: after === 'accepted' ? 'Trade done' : 'The trade fell through', actions: fill ? fill.actions : [{key: 'close', label: 'Done', go: true}], onAction: fill ? fill.onAction : undefined,
        body: (after === 'accepted' ? `<p>${esc(nm(o.give))} ${o.give.mons.length + o.give.picks.length === 1 ? 'joins' : 'join'} you.</p>` : `<p class="muted">The offer could no longer go through (rosters or cap changed since it was made).</p>`) + (fill?.html ?? '')});
      return false;
    }});
}

// ---------------------------------------------------------------- free agents
type FaRow = {m: Mon; resign: boolean};
const INTEREST: Record<string, [string, string]> = {Keen: ['growth', 'up'], Neutral: ['deal', 'deal'], Cool: ['decline', 'alert']};

export function viewFreeAgents(): string {
  const s = S(), c = C(), me = s.userTeamId;
  const fa = api.freeAgents(s).filter((m) => m.prospect === undefined && !m.retired);
  const used = rosterUsed(me);
  const resignPhase = s.phase === 'resign';
  const expiring = resignPhase ? api.teamRoster(s, me).filter((m) => api.isExpiring(m)) : [];
  const ask = (m: Mon) => api.askingPrice(c, s, m.id);
  const cols = (resign: boolean): Col<Mon>[] => [
    {key: 'name', label: 'Pokémon', width: '30%', cell: (m) => `<span class="who">${monRef(m)}${resign ? expiringTag() : injuryTag(m)}</span>`, sort: (m) => monName(m)},
    {key: 'role', label: 'Role', width: '120px', cell: (m) => knownBadge(m), sort: knownMid, desc: true},
    {key: 'age', label: 'Age', width: '56px', num: true, cell: (m) => String(m.age), sort: (m) => m.age},
    {key: 'ask', label: 'Asking', width: '136px', num: true, cell: (m) => { const a = ask(m); return `${money(a.salary)} × ${a.years}y`; }, sort: (m) => ask(m).salary, desc: true},
    {key: 'int', label: `Interest ${info('About interest', '<strong>Interest</strong><span>How keen this Pokémon is on your club. Keen ones take a little under their ask; cool ones want a little over.</span>')}`, width: '152px', cell: (m) => { const i = api.interest(s, m, me); return fixChip(INTEREST[i][0], INTEREST[i][1], i); }, sort: (m) => ['Keen', 'Neutral', 'Cool'].indexOf(api.interest(s, m, me))},
    {key: 'act', label: '', width: '232px', cell: (m) => resign
      ? `<span class="l-cellacts"><button type="button" class="btn sm" data-fo="negotiate" data-mon="${esc(m.id)}" aria-label="Re-sign ${esc(monName(m))}">Re-sign</button>${tagButton(m)}</span>`
      : `<button type="button" class="btn sm" data-fo="negotiate" data-mon="${esc(m.id)}" aria-label="Negotiate with ${esc(monName(m))}">Negotiate</button>`},
  ];
  const phaseNote = resignPhase ? 'Re-sign window'
    : s.phase === 'free-agency' ? `Round ${(s.faRound ?? 0) + 1} of 3 · asks drop each round` : '';
  const reSign = resignPhase ? `<section class="l-panel flush l-section" aria-labelledby="h-rs"><h2 id="h-rs">Your expiring contracts</h2><div class="l-toolbar l-pad"><span class="x-small">${s.teams[me].tagSeason === s.season ? 'You used your franchise tag this offseason.' : 'One franchise tag per offseason: one year at a high fixed price.'}</span></div>${expiring.length ? table<Mon>({id: 'resign', cols: cols(true), rows: expiring, minWidth: 820, label: 'Expiring contracts'}) : `<div class="l-pad">${empty('Nothing expiring', 'Every contract runs past this season.')}</div>`}</section>` : '';
  return head('Free agents', `${plural(fa.length, 'free agent')}${phaseNote ? ' · ' + esc(phaseNote) : ''}`) +
    `<div class="l-card"><div class="l-split x-capwrap">${capStrip(me)}<span class="x-small"><b class="x-num">${used} / 18</b> roster spots</span></div></div>` +
    reSign +
    `<section class="l-panel flush l-section" aria-labelledby="h-fa"><h2 id="h-fa">Available</h2>${fa.length ? table<Mon>({id: 'fa', cols: cols(false), rows: fa, minWidth: 760, defaultSort: {key: 'role', dir: 'desc'}, label: 'Free agents'}) : `<div class="l-pad">${empty('No free agents', 'Players reach free agency when contracts run out or clubs release them.')}</div>`}</section>`;
}

function negotiateDialog(monId: string): void {
  const s = S(), c = C(), me = s.userTeamId, m = s.mons[monId];
  const a = api.askingPrice(c, s, monId);
  const resign = m.teamId === me;
  let sal = a.salary, yrs = a.years;
  const lean = api.interest(s, m, me), pct = Math.round((INTEREST_MULT[lean] - 1) * 100);
  let reply = `${ic('deal')}<span class="muted" aria-label="No offer sent yet">—</span>`;
  let signed = false;
  const step = 250_000;
  // checked before any offer is built: a full roster (or the cap at this salary) blocks Send, with the reason
  const block = () => signed ? {reason: '', rosterFull: false} : api.signBlock(S(), monId);
  const capWhy = () => signed ? '' : api.capBlock(S(), sal);
  const body = () => {
    const room = s.settings.cap - api.payroll(S(), me);
    const cur = resign ? (m.contract?.salary ?? 0) : 0;
    const b = block(), cw = capWhy();
    const note = b.reason ? `${ic('alert')}<span><b>${esc(b.reason)}.</b>${b.rosterFull ? ' Release someone to make room, then come back.' : ''}</span>` : cw ? `${ic('alert')}<span><b>${esc(cw)}.</b> Lower the salary to the minimum or free cap room.</span>` : '';
    return `<div class="l-row">${ico(speciesOf(m))}<b>${esc(monName(m))}</b>${knownBadge(m)}<span class="x-small">age ${m.age}</span></div>
     ${stats([stat('Asking', money(a.salary), {icon: 'deal', sub: 'a year'}), stat('Years', String(a.years), {icon: 'clock', sub: 'asked'}),
       stat('Interest', `${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct)}%`, {icon: INTEREST[lean][1], sub: `${lean} · on the ask`})], 3, 3)}
     <div class="x-note l-reserve" style="--lines:2" aria-live="polite">${note}</div>
     <div class="x-form">
       <div class="x-field-lbl">Salary per year<div class="x-steps"><button type="button" class="btn" data-dlg="dn" aria-label="Lower by $0.25M"${signed || b.reason ? ' aria-disabled="true"' : ''}>−</button><output aria-live="polite">${money(sal)}</output><button type="button" class="btn" data-dlg="up" aria-label="Raise by $0.25M"${signed || b.reason ? ' aria-disabled="true"' : ''}>+</button></div></div>
       <label class="x-field-lbl">Years<select data-yrs${signed || b.reason ? ' disabled' : ''}>${[1, 2, 3, 4, 5, 6, 7].map((y) => `<option${y === yrs ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
     </div>
     ${beforeAfter([['Cap room after signing', room, signed ? room : room - sal + cur]])}
     <div class="x-reply" aria-live="polite">${reply}</div>`;
  };
  const actions = () => {
    if (signed) return [{key: 'close', label: 'Done', go: true}];
    const b = block(), why = b.reason || capWhy();
    return [b.rosterFull ? {key: 'release', label: 'Release someone', href: '#roster?lens=contracts'} : {key: 'close', label: 'Cancel'},
      {key: 'offer', label: 'Send offer', go: true, disabled: !!why, why}];
  };
  openDialog({title: `${resign ? 'Re-sign' : 'Sign'} ${esc(monName(m))}`, cap: resign ? 'Re-sign window' : 'Free agent', body: body(), actions: actions(),
    onAction: (k) => {
      if (k === 'close' || k === 'release') return;
      if (k === 'up' || k === 'dn') { if (!signed) { sal = Math.max(s.settings.minSalary, sal + (k === 'up' ? step : -step)); } }
      if (k === 'offer' && !signed) {
        const r = act((st, cat) => api.offerContract(cat, st, monId, sal, yrs));
        signed = r.accepted;
        reply = r.accepted ? `${ic('check')}<span><b>${esc(monName(m))} ${resign ? 're-signs' : 'signs'}.</b> ${money(sal)} × ${plural(yrs, 'year')}.${resign ? '' : ' Joins your backups.'}</span>` : `${ic('x')}<span><b>No deal.</b> ${esc(r.reason)}.</span>`;
      }
      updateDialog({body: body(), actions: actions()});
      dialogEl().querySelector<HTMLElement>(k === 'up' || k === 'dn' ? `[data-dlg="${k}"]` : '[data-acts] .btn.go')?.focus();
      return false;
    }});
  const d = dialogEl();
  const onChange = (e: Event) => {
    const t = e.target as HTMLSelectElement;
    if (!t.matches('[data-yrs]')) return;
    yrs = +t.value;
    updateDialog({body: body()});
    d.querySelector<HTMLElement>('[data-yrs]')?.focus();
  };
  d.addEventListener('change', onChange);
  d.addEventListener('close', () => d.removeEventListener('change', onChange), {once: true});
}

/** Release (cut) one of your Pokémon: confirm with the dead money and the cap room it frees. Roster row, Pokémon page. */
export function releaseDialog(monId: string): void {
  const s = S(), c = C(), m = s.mons[monId];
  if (!m) return;
  const info = api.releaseInfo(c, s, monId);
  const slot = s.teams[s.userTeamId].lineup.slots.find((x) => x.monId === monId);
  const who = `<div class="l-row">${ico(speciesOf(m))}<b>${esc(monName(m))}</b>${knownBadge(m)}<span class="x-small">age ${m.age}${m.contract ? ` · ${money(m.contract.salary)} × ${plural(m.contract.yearsLeft, 'year')}` : ''}</span></div>`;
  if (!info.ok) { openDialog({title: `Can't release ${esc(monName(m))}`, body: `${who}<p class="muted">${esc(info.reason)}.</p>`}); return; }
  openDialog({title: `Release ${esc(monName(m))}?`, cap: 'Roster',
    body: `${who}
      <dl class="l-kv"><dt>Dead money</dt><dd><b class="x-num">${money(info.deadMoney)}</b> <span class="muted">${info.deadMoney ? 'stays on your cap this season (the guaranteed part)' : 'nothing guaranteed is left'}</span></dd>
      <dt>Roster</dt><dd>${info.rosterAfter} / 18 after${slot ? ` · starts as ${esc(ROLE_LABEL[slot.role])}: the lineup refills the slot` : ''}</dd></dl>
      ${beforeAfter([['Cap room', info.capRoomBefore, info.capRoomAfter]])}
      <p class="muted">${esc(monName(m))} becomes a free agent; any club can sign it.</p>`,
    actions: [{key: 'close', label: 'Cancel'}, {key: 'release', label: 'Release', go: true}],
    onAction: (k) => {
      if (k !== 'release') return;
      const r = act((st, cat) => api.release(cat, st, monId));
      updateDialog({title: r.ok ? `${esc(monName(m))} released` : 'Not released', cap: undefined, onAction: undefined,
        body: r.ok ? `<p>${info.rosterAfter} / 18 on the roster. Cap room now ${money(info.capRoomAfter)}${info.deadMoney ? ` (${money(info.deadMoney)} dead money)` : ''}.</p>` : `<p class="muted">${esc(r.reason)}.</p>`,
        actions: r.ok ? [{key: 'fa', label: `Free agents ${ic('arrow')}`, href: '#freeagents'}, {key: 'close', label: 'Done', go: true}] : [{key: 'close', label: 'Done', go: true}]});
      return false;
    }});
}

/** After a trade leaves your roster short (in season): who Play would sign on a minimum deal; sign now or leave it open. */
function fillChoice(): {html: string; actions: DialogAction[]; onAction: (k: string) => boolean | void} | null {
  const s = S(), fill = api.rosterFill(C(), s);
  if (!fill.open) return null;
  const n = api.teamRoster(s, s.userTeamId).filter((m) => m.tier !== 'ir').length;
  const first = fill.candidates[0];
  const rows = fill.candidates.map((m) => `<li><span class="l-row">${ico(speciesOf(m))}<b>${esc(monName(m))}</b></span>${knownBadge(m)}<span class="x-small">${money(s.settings.minSalary)}</span></li>`).join('');
  const html = `<div class="l-stack tight"><span class="cap">Your roster: ${n} / 18</span><p class="muted">Nobody is signed for you. Before the next week Play fills open spots with the best free agents on minimum deals:</p>
    ${rows ? `<ul class="l-list trio" aria-label="Would be signed">${rows}</ul>` : '<p class="muted">No free agents now: a replacement-level Pokémon would be signed.</p>'}</div>`;
  const actions: DialogAction[] = [{key: 'open', label: 'Leave it open'}, ...(first ? [{key: 'fill', label: `Sign ${esc(monName(first))}`, go: true}] : [{key: 'fa', label: `Free agents ${ic('arrow')}`, href: '#freeagents', go: true}])];
  return {html, actions, onAction: (k) => {
    if (k !== 'fill' || !first) return;
    const r = act((st, cat) => api.signToFill(cat, st, first.id));
    updateDialog({title: r.ok ? `${esc(monName(first))} signs` : 'Not signed', cap: undefined, onAction: undefined, actions: [{key: 'close', label: 'Done', go: true}],
      body: r.ok ? `<p>${esc(monName(first))} joins your backups on a ${money(S().settings.minSalary)} deal.</p>` : `<p class="muted">${esc(r.reason)}.</p>`});
    return false;
  }};
}

/** Tag button of fixed width; when the tag can't be used it stays in place, disabled, with the reason in a peek. */
function tagButton(m: Mon): string {
  const chk = api.franchiseTagCheck(C(), S(), m.id);
  if (chk.ok) return `<button type="button" class="btn sm" data-fo="tag" data-mon="${esc(m.id)}" aria-label="Franchise tag ${esc(monName(m))}">Tag</button>`;
  return `<button type="button" class="btn sm peek" data-fo="tag" data-mon="${esc(m.id)}" aria-disabled="true" aria-label="Franchise tag ${esc(monName(m))}: ${esc(chk.reason)}">Tag<span class="pop"><strong>Franchise tag</strong><span>${esc(chk.reason)}.</span></span></button>`;
}

function tagDialog(monId: string): void {
  const s = S(), c = C(), m = s.mons[monId];
  const chk = api.franchiseTagCheck(c, s, monId);
  openDialog({title: `Franchise tag ${esc(monName(m))}?`, cap: 'Re-sign window',
    body: `<div class="l-row">${ico(speciesOf(m))}<b>${esc(monName(m))}</b>${knownBadge(m)}<span class="x-small">age ${m.age}</span></div><p class="muted">${chk.ok ? `One year at ${money(chk.salary)}, guaranteed. One tag per offseason.` : esc(chk.reason) + '.'}</p>`,
    actions: chk.ok ? [{key: 'close', label: 'Cancel'}, {key: 'tag', label: 'Use the tag', go: true}] : [{key: 'close', label: 'OK', go: true}],
    onAction: (k) => { if (k === 'tag') { act((st, cat) => api.franchiseTag(st, monId, cat)); updateDialog({title: `${esc(monName(m))} is tagged`, body: `<p>One year at ${money(chk.salary)}, guaranteed.</p>`, actions: [{key: 'close', label: 'Done', go: true}], onAction: undefined}); return false; } }});
}

// ---------------------------------------------------------------- wiring
export function afterMoves(): void {
  once('moves', () => {
    document.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-fo]');
      if (!b || b.tagName === 'SELECT' || b.getAttribute('aria-disabled') === 'true') return;
      const t = () => tradeUi();
      switch (b.dataset.fo) {
        case 'rm': { const side = b.dataset.side as 'give' | 'get'; t()[side] = t()[side].filter((k) => k !== b.dataset.key); notify(); document.querySelector<HTMLElement>(`select[data-side="${side}"]`)?.focus(); break; }
        case 'clear': t().give = []; t().get = []; notify(); break;
        case 'propose': proposeDialog(); break;
        case 'balance': balanceDialog(); break;
        case 'shop': { const k = 'm:' + b.dataset.mon; if (!t().give.includes(k) && t().give.length < MAX_SIDE) t().give.push(k); notify(); const g = document.querySelector<HTMLElement>('select[data-side="give"]'); g?.scrollIntoView({block: 'center'}); g?.focus(); break; }
        case 'unblock': store.ui.block = ((store.ui.block as MonId[]) ?? []).filter((id) => id !== b.dataset.mon); notify(); break;
        case 'accept': offerDialog(b.dataset.offer!, true); break;
        case 'decline': offerDialog(b.dataset.offer!, false); break;
        case 'counter': {
          const o = S().offers.find((x) => x.id === b.dataset.offer);
          if (!o) break;
          store.ui.trade = {team: o.fromTeamId, give: [...o.get.mons.map((id) => 'm:' + id), ...o.get.picks.map(pickKey)], get: [...o.give.mons.map((id) => 'm:' + id), ...o.give.picks.map(pickKey)]} satisfies TradeUi;
          location.hash = '#trades';
          break;
        }
        case 'negotiate': negotiateDialog(b.dataset.mon!); break;
        case 'tag': tagDialog(b.dataset.mon!); break;
      }
    });
    document.addEventListener('change', (e) => {
      const el = e.target as HTMLSelectElement;
      if (!el.dataset?.fo) return;
      if (el.dataset.fo === 'team') { store.ui.trade = {team: el.value, give: tradeUi().give, get: []} satisfies TradeUi; notify(); document.querySelector<HTMLElement>('select[data-fo="team"]')?.focus(); }
      if (el.dataset.fo === 'add' && el.value) { const side = el.dataset.side as 'give' | 'get'; if (tradeUi()[side].length < MAX_SIDE) tradeUi()[side].push(el.value); notify(); document.querySelector<HTMLElement>(`select[data-side="${side}"]`)?.focus(); }
      if (el.dataset.fo === 'block' && el.value) { store.ui.block = [...((store.ui.block as MonId[]) ?? []), el.value]; notify(); document.querySelector<HTMLElement>('select[data-fo="block"]')?.focus(); }
    });
  });
}
void panel; void teamCell; void peekLabel;
