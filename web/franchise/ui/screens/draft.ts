// Draft room: Scouting (weekly points, Scout = 1 point, Full knowledge = 5 points,
// revealed traits; results in dialogs) and the Draft (sortable board that keeps taken
// prospects in place, dimmed, labelled with pick and club; order with lottery results;
// Draft / Sim to my pick / Sim to end).
import type {DraftPick, Mon, TeamId} from '../../types.ts';
import {ROLE_LABEL} from '../../catalog/roles.ts';
import {esc, ic, plural, money} from '../dom.ts';
import {C, S, store, act, notify} from '../store.ts';
import {api} from '../model.ts';
import {head, panel, empty, lensTabs} from '../components/page.ts';
import {table, type Col} from '../components/table.ts';
import {openDialog, updateDialog, info} from '../components/layer.ts';
import {monRef, monName, teamAbbr, teamCell, teamName, speciesOf} from '../components/mon.ts';
import {rangeBadge, roleBadge, typeChips} from '../components/badges.ts';
import {ico} from '../sprites.ts';
import {closed, fixChip, knownBadge, knownMid, once, capStrip} from '../components/front.ts';

const ordinal = (n: number): string => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

/** Who took each prospect: monId -> {overall pick, club}. */
function takenMap(): Map<string, {overall: number; teamId: TeamId; round: number}> {
  const d = S().draft;
  return new Map((d?.picks ?? []).map((p, i) => [p.monId, {overall: i + 1, teamId: p.pick.ownerTeamId, round: p.pick.round}]));
}
/** Board rank: by what the user's club knows (middle of the range), best first. */
function boardRank(ms: Mon[]): Map<string, number> {
  return new Map([...ms].sort((a, b) => knownMid(b) - knownMid(a) || a.id.localeCompare(b.id)).map((m, i) => [m.id, i + 1]));
}
const pts = (m: Mon): number => m.scouting?.[S().userTeamId] ?? 0;
const full = (): number => S().settings.fullScoutCost;

/** Scouted level: 5 fixed pips (0..5 points spent), never colour alone. */
function scoutPips(m: Mon): string {
  const n = Math.min(full(), pts(m)), exact = api.knownRating(C(), S(), S().userTeamId, m).exact;
  const shown = exact ? full() : n;
  return `<span class="x-conf"><span class="x-meter lv${shown >= full() ? 5 : shown >= 3 ? 3 : shown ? 2 : 0}" role="img" aria-label="Scouted ${shown} of ${full()}">${Array.from({length: full()}, (_, i) => `<i class="${i < shown ? 'on' : ''}"></i>`).join('')}</span><span>${exact ? 'Known' : `${n}/${full()}`}</span></span>`;
}

/** Prospect peek: projected range, potential range (only here and on the Pokémon page), traits, usual roles. */
function prospectRef(m: Mon): string {
  return monRef(m);
}

function prospectsOpen(): boolean {
  const s = S();
  return !!s.draft && !s.draft.startup && s.draft.prospects.length > 0 && s.phase !== 'resign' && s.phase !== 'free-agency';
}

// ---------------------------------------------------------------- scouting
export function viewScouting(): string {
  const s = S(), c = C(), me = s.userTeamId;
  if (!prospectsOpen()) return closed('Scouting', `Season ${s.season}`, 'Scouting opens with the next draft class in the preseason.', [['#draft', 'Draft results'], ['#week', 'Back to This week']]);
  const team = s.teams[me], left = team.scoutingPoints, per = s.settings.scoutingPointsPerWeek;
  const taken = takenMap();
  const ms = api.draftProspects(s);
  const rank = boardRank(ms);
  const cols: Col<Mon>[] = [
    {key: 'rank', label: '#', width: '56px', num: true, cell: (m) => String(rank.get(m.id)), sort: (m) => rank.get(m.id)!},
    {key: 'name', label: 'Prospect', width: '26%', cell: (m) => `<span class="who">${prospectRef(m)}</span>`, sort: (m) => monName(m)},
    {key: 'proj', label: 'Projected', width: '144px', cell: (m) => knownBadge(m), sort: knownMid, desc: true},
    {key: 'age', label: 'Age', width: '56px', num: true, cell: (m) => String(m.age), sort: (m) => m.age},
    {key: 'sc', label: 'Scouted', width: '152px', cell: scoutPips, sort: (m) => pts(m), desc: true},
    {key: 'traits', label: 'Traits', width: '24%', cell: (m) => { const t = api.knownTraits(c, s, me, m); return t.length ? `<span title="${esc(t.join(' · '))}">${esc(t.join(' · '))}</span>` : '<span class="dash">—</span>'; }, sort: (m) => api.knownTraits(c, s, me, m).length, desc: true},
    {key: 'act', label: '', width: '232px', cell: (m) => {
      const tk = taken.get(m.id);
      if (tk) return `<span class="x-small">Taken · #${tk.overall} ${esc(s.teams[tk.teamId].abbr)}</span>`;
      if (api.knownRating(c, s, me, m).exact) return fixChip('scout', 'check', 'Fully known');
      const cost = s.settings.scoutCost, fcost = Math.max(cost, full() - pts(m));
      return `<span class="l-cellacts"><button type="button" class="btn sm" data-fo="scout" data-mon="${esc(m.id)}"${left < cost ? ' aria-disabled="true"' : ''} aria-label="Scout ${esc(monName(m))} for ${cost} point">Scout · ${cost}</button><button type="button" class="btn sm" data-fo="fullscout" data-mon="${esc(m.id)}"${left < fcost ? ' aria-disabled="true"' : ''} aria-label="Full knowledge of ${esc(monName(m))} for ${fcost} points">Full · ${fcost}</button></span>`;
    }},
  ];
  const how = info('How ranges work', '<strong>Scouting ranges</strong><span>Each point narrows the projected range. About one range in ten misses the true rating. Two points reveal maxed stats; three reveal the role it suits best. Everyone knows a Pokémon exactly after about six battles.</span>');
  const pointsCard = `<div class="l-card"><span class="l-row"><span class="cap">Points this week</span>${how}</span><div class="x-points"><span class="fitbar" role="img" aria-label="${left} of ${per} points left"><i style="width:${Math.min(100, left / per * 100)}%"></i></span><b class="x-num">${left} / ${per}</b></div><span class="l-row x-small" title="Points refill every week of the season"><span class="cap">Cost</span><b class="x-num">${s.settings.scoutCost}</b><span class="muted">scout</span><b class="x-num">${full()}</b><span class="muted">full</span>${ic('refresh')}<span class="muted">weekly</span></span></div>`;
  const rows = store.ui.hideTaken ? ms.filter((m) => !taken.has(m.id)) : ms;
  return head('Scouting', `${s.draft!.season} draft class · ${plural(ms.length, 'prospect')}`) +
    `<div class="l-grid" style="--card-min:320px">${pointsCard}</div>` +
    `<section class="l-panel flush" aria-label="Draft class">${table<Mon>({id: 'scout', cols, rows, minWidth: 940, defaultSort: {key: 'rank', dir: 'asc'}, rowClass: (m) => taken.has(m.id) ? 'x-dim' : '', label: 'Draft class'})}</section>`;
}

function scoutDialog(monId: string, fullK: boolean): void {
  const s = S(), c = C(), me = s.userTeamId, m = s.mons[monId];
  const before = api.knownRating(c, s, me, m), tBefore = api.knownTraits(c, s, me, m);
  const res = act((st, cat) => api.scoutMon(cat, st, me, monId, fullK));
  const s2 = S(), after = api.knownRating(c, s2, me, m), traits = api.knownTraits(c, s2, me, m);
  const fresh = traits.filter((t) => !tBefore.includes(t));
  const pot = api.knownPotential(s2, me, m);
  const rng = (k: typeof before) => k.exact ? String(k.hi) : `${k.lo}–${k.hi}`;
  const body = res.ok ? `<div class="l-row">${ico(speciesOf(m))}<b>${esc(monName(m))}</b>${after.exact ? roleBadge(after.role, after.hi) : rangeBadge(after.role, after.lo, after.hi)}<span class="x-small">age ${m.age}</span></div>
    <div class="x-before-after"><span>Projected ${esc(ROLE_LABEL[after.role])}</span><b>${rng(before)}</b><span class="x-arrow" aria-label="to">→</span><b>${rng(after)}</b>
    <span>Points spent</span><b>${res.spent}</b><span></span><b>${s2.teams[me].scoutingPoints} left</b>
    <span>Potential</span><b>${pot.exact ? pot.lo : `${pot.lo}–${pot.hi}`}</b><span></span><span></span></div>
    <div class="l-row"><span class="cap">Traits</span>${traits.length ? traits.map((t) => `<span class="chip ${fresh.includes(t) ? 'c-growth' : 'c-plain'}">${fresh.includes(t) ? ic('plus') : ''}${esc(t)}</span>`).join('') : '<span class="dash">—</span>'}</div>`
    : `<p>${esc(res.reason)}.</p>`;
  openDialog({title: res.ok ? `Report: ${esc(monName(m))}` : 'Not scouted', cap: res.ok ? (fullK ? 'Full knowledge' : 'Scouted') : undefined, body});
}

// ---------------------------------------------------------------- draft
function clockCard(): string {
  const s = S(), me = s.userTeamId, d = s.draft!;
  const pick = api.onTheClock(s);
  const overall = d.picks.length + 1;
  const mineLeft = d.order.slice(d.picks.length).map((p, i) => ({p, n: d.picks.length + i + 1})).filter((x) => x.p.ownerTeamId === me);
  const next = mineLeft[0];
  const lottery = s.phase === 'draft-lottery';
  const done = !pick || !api.draftBoard(s).length;
  const startup = !!d.startup;
  const myTurn = !lottery && !done && pick!.ownerTeamId === me;
  const title = lottery ? 'Lottery drawn' : done ? 'Draft complete' : `Pick ${overall} · ${myTurn ? 'you' : esc(teamName(pick!.ownerTeamId))}`;
  const line = lottery ? `You pick ${next ? ordinal(next.n) : 'no earlier than round 2'}. The draft starts when you begin it.`
    : done ? (startup ? 'Every club has its 18. Continue to sign contracts and open the preseason.' : 'Every pick is in. Undrafted prospects join free agency.')
      : myTurn ? "You're on the clock. Pick from the board."
        : next ? `Your next pick is #${next.n}, ${plural(next.n - overall, 'pick')} away.` : 'You have no picks left in this draft.';
  const acts = lottery
    ? `<button type="button" class="btn go" data-fo="draftstart">${ic('play')}Start the draft</button>`
    : startup && done ? `<button type="button" class="btn go" data-fo="startupdone">${ic('play')}Sign contracts</button>`
    : `<button type="button" class="btn${!myTurn && !done && next ? ' go' : ''}" data-fo="simmine"${done || myTurn || !next ? ' aria-disabled="true"' : ''}>Sim to my pick</button><button type="button" class="btn" data-fo="simend"${done ? ' aria-disabled="true"' : ''}>Sim to end</button>`;
  return `<section class="l-card${!done && !lottery ? ' x-live' : ''}" aria-label="Pick in progress"><div class="l-split"><div class="x-clock"><span class="x-ring">${ic(done ? 'check' : 'clock')}</span><div class="l-stack tight"><b class="l-card-title">${title}</b><span class="x-small l-reserve" aria-live="polite">${esc(line)}</span></div></div><div class="l-actions">${acts}</div></div></section>`;
}

function orderTable(): string {
  const s = S(), me = s.userTeamId, d = s.draft!;
  const lot = new Map((d.lottery ?? []).map((l) => [l.teamId, l]));
  const taken = d.picks;
  const curRound = d.order[taken.length]?.round ?? 1;
  const rounds = d.startup ? 18 : 3;
  const round = Math.min(rounds, Math.max(1, Number(store.ui.draftRound ?? curRound)));
  const rows = d.order.map((p, i) => ({p, i})).filter((r) => r.p.round === round);
  const cols: Col<{p: DraftPick; i: number}>[] = [
    {key: 'n', label: '#', width: '64px', num: true, cell: (r) => String(r.i + 1)},
    {key: 'club', label: 'Club', width: '84px', cell: (r) => teamAbbr(r.p.ownerTeamId) + (r.p.originalTeamId !== r.p.ownerTeamId ? `<span class="sr">via ${esc(teamName(r.p.originalTeamId))}</span>` : '')},
    {key: 'sel', label: 'Selection', width: 'auto', cell: (r) => {
      const t = taken[r.i];
      if (t) return monRef(s.mons[t.monId]);
      if (r.i === taken.length && s.phase === 'draft') return fixChip('scout', 'clock', 'On the clock');
      const l = r.p.round === 1 ? lot.get(r.p.originalTeamId) : undefined;
      return `<span class="x-small">${l ? `Lottery · ${l.odds}% odds` : r.p.originalTeamId !== r.p.ownerTeamId ? `via ${esc(s.teams[r.p.originalTeamId].abbr)}` : '—'}</span>`;
    }},
  ];
  // 3 rounds: tabs; the 18-round startup draft: previous / next with the round in a fixed-width label
  const nav = rounds <= 3 ? lensTabs('draftRound', String(round), [['1', 'Round 1'], ['2', 'Round 2'], ['3', 'Round 3']])
    : `<div class="l-toolbar l-pad"><button type="button" class="btn sm" data-lens="draftRound:${Math.max(1, round - 1)}"${round <= 1 ? ' aria-disabled="true"' : ''} aria-label="Previous round">${ic('back')}</button><b>Round ${round} of ${rounds}</b><button type="button" class="btn sm" data-lens="draftRound:${Math.min(rounds, round + 1)}"${round >= rounds ? ' aria-disabled="true"' : ''} aria-label="Next round">${ic('arrow')}</button></div>`;
  return nav + table({id: 'draft-order', cols, rows, minWidth: 300, rowClass: (r) => (r.p.ownerTeamId === me ? 'cur' : '') + (taken[r.i] ? ' x-dim' : ''), label: 'Draft order'});
}

function lotteryTable(): string {
  const s = S(), d = s.draft!;
  if (!d.lottery?.length) return '';
  const rows = [...d.lottery].sort((a, b) => b.odds - a.odds);
  const cols: Col<typeof rows[number]>[] = [
    {key: 'club', label: 'Club', width: '44%', cell: (l) => teamCell(l.teamId)},
    {key: 'odds', label: `Odds ${info('About the lottery', `<strong>Draft lottery</strong><span>The ${rows.length} clubs that missed the Indigo Plateau draw the top 4 picks. Worse records get better odds; nobody drops more than 4 places.</span>`)}`, width: '88px', num: true, cell: (l) => `${l.odds}%`, sort: (l) => l.odds, desc: true},
    {key: 'pre', label: 'Seed', width: '64px', num: true, cell: (l) => String(rows.indexOf(l) + 1)},
    {key: 'res', label: 'Pick', width: '64px', num: true, cell: (l) => `<b>${l.result}</b>`, sort: (l) => l.result},
    {key: 'move', label: 'Move', width: '152px', cell: (l) => { const dlt = rows.indexOf(l) + 1 - l.result; return dlt > 0 ? fixChip('growth', 'up', `Up ${dlt}`) : dlt < 0 ? fixChip('health', 'down', `Down ${-dlt}`) : fixChip('league', 'check', 'Held'); }},
  ];
  return `<section class="l-panel flush l-section" aria-labelledby="h-lot"><h2 id="h-lot">Lottery</h2>${table({id: 'lottery', cols, rows, minWidth: 520, rowClass: (l) => l.teamId === s.userTeamId ? 'cur' : '', label: 'Lottery results'})}</section>`;
}

export function viewDraft(): string {
  const s = S(), c = C(), me = s.userTeamId;
  const d = s.draft;
  const live = s.phase === 'draft-lottery' || s.phase === 'draft';
  const review = (s.phase === 'resign' || s.phase === 'free-agency') && d && d.picks.length > 0;
  if (!d || (!live && !review)) {
    return closed('Draft', d ? `${d.season} class · ${plural(d.prospects.length, 'prospect')}` : `Season ${s.season}`, 'The draft opens after the Indigo Plateau. Scout the class until then.', [['#scouting', 'Scout the class'], ['#week', 'Back to This week']]);
  }
  const taken = takenMap();
  const ms = api.draftProspects(s);
  const rank = boardRank(ms);
  const pick = api.onTheClock(s);
  const myTurn = s.phase === 'draft' && pick?.ownerTeamId === me && api.draftBoard(s).length > 0;
  const cols: Col<Mon>[] = [
    {key: 'rank', label: '#', width: '52px', num: true, cell: (m) => String(rank.get(m.id)), sort: (m) => rank.get(m.id)!},
    {key: 'name', label: d.startup ? 'Pokémon' : 'Prospect', width: 'auto', cell: (m) => `<span class="who">${prospectRef(m)}</span>`, sort: (m) => monName(m)},
    {key: 'proj', label: d.startup ? 'Rating' : 'Projected', width: '144px', cell: (m) => knownBadge(m), sort: knownMid, desc: true},
    {key: 'age', label: 'Age', width: '56px', num: true, cell: (m) => String(m.age), sort: (m) => m.age},
    {key: 'sc', label: 'Scouted', width: '72px', num: true, cell: (m) => api.knownRating(c, s, me, m).exact ? 'Known' : `${pts(m)}/${full()}`, sort: (m) => pts(m), desc: true},
    {key: 'st', label: 'Status', width: '152px', cell: (m) => {
      const tk = taken.get(m.id);
      if (tk) return `<span class="x-small">Taken · #${tk.overall} ${esc(s.teams[tk.teamId].abbr)}</span>`;
      if (m.prospect === undefined) return '<span class="x-small">Undrafted</span>';
      return `<button type="button" class="btn sm" data-fo="draft" data-mon="${esc(m.id)}"${myTurn ? '' : ' aria-disabled="true"'} aria-label="Draft ${esc(monName(m))}">Draft</button>`;
    }, sort: (m) => taken.get(m.id)?.overall ?? (m.prospect === undefined ? 999 : 0)},
  ];
  const hide = !!store.ui.hideTaken;
  const rows = hide ? ms.filter((m) => !taken.has(m.id) && m.prospect !== undefined) : ms;
  const mine = d.order.map((p, i) => ({p, n: i + 1})).filter((x) => x.p.ownerTeamId === me);
  const nextMine = mine.find((x) => x.n > d.picks.length);
  const sub = d.startup ? (review || !nextMine ? 'Startup draft · complete' : `Startup draft · 18 rounds · your next pick #${nextMine.n}`)
    : s.phase === 'draft-lottery' ? `Season ${d.season} draft · the lottery is drawn` : review ? `Season ${d.season} draft · complete` : `Season ${d.season} draft · ${mine.length ? `your picks: ${mine.map((x) => '#' + x.n).join(', ')}` : 'you have no picks'}`;
  const toolbar = `<div class="l-toolbar l-pad"><label><button type="button" class="switch" role="switch" aria-checked="${hide}" data-fo="hidetaken" aria-label="Hide taken"></button>Hide taken</label><span class="x-small">${d.startup ? `${api.draftBoard(s).length} Pokémon` : plural(api.draftBoard(s).length, 'prospect')} left</span></div>`;
  return head('Draft', esc(sub)) +
    (review ? '' : clockCard()) +
    `<div class="x-draft">
      <div class="l-stack loose">${panel('ord', 'Order', orderTable(), {flush: true})}</div>
      <section class="l-panel flush l-section" aria-labelledby="h-board"><h2 id="h-board">Board</h2>${toolbar}${table<Mon>({id: 'board', cols, rows, minWidth: 660, defaultSort: {key: 'rank', dir: 'asc'}, rowClass: (m) => taken.has(m.id) || m.prospect === undefined ? 'x-dim' : '', label: 'Draft board'})}</section>
    </div>` + lotteryTable();
}

function draftDialog(monId: string): void {
  const s = S(), me = s.userTeamId, m = s.mons[monId];
  const n = (s.draft?.picks.length ?? 0) + 1;
  openDialog({
    title: `Draft ${esc(monName(m))} at #${n}?`, cap: `${s.draft!.season} draft`,
    body: `<div class="l-row">${ico(speciesOf(m))}<b>${esc(monName(m))}</b>${knownBadge(m)}<span class="x-small">age ${m.age}</span></div><p class="muted">${s.draft!.startup ? 'Contracts are signed for every club when the startup draft ends; the youngest six start on the practice squad.' : `Rookies sign the rookie scale for their slot and start on the practice squad. Cap room now: ${money(s.settings.cap - api.payroll(s, me))}.`}</p>`,
    actions: [{key: 'close', label: 'Keep looking'}, {key: 'yes', label: 'Draft', go: true}],
    onAction: (k) => {
      if (k !== 'yes') return;
      act((st, c) => api.draftPick(c, st, monId));
      const got = S().mons[monId];
      updateDialog({title: got.teamId === me ? `You drafted ${esc(monName(got))}` : 'Pick not made', cap: `Pick ${n}`, actions: [{key: 'close', label: 'Done', go: true}], onAction: undefined,
        body: got.teamId === me && S().draft?.startup ? `<p>${esc(monName(got))} joins the ${esc(S().teams[me].name)}.</p>` : got.teamId === me ? `<p>${esc(monName(got))} joins your practice squad on a rookie deal${got.contract ? ` (${money(got.contract.salary)} × ${plural(got.contract.yearsLeft, 'year')})` : ''}.</p>` : '<p>That prospect is no longer available.</p>'});
      return false;
    },
  });
}

function simDialog(toEnd: boolean): void {
  const s = S(), me = s.userTeamId;
  const before = s.draft!.picks.length;
  act((st, c) => toEnd ? api.simDraftToEnd(c, st) : api.simDraftToUser(c, st));
  const d = S().draft!;
  const made = d.picks.slice(before);
  const best = api.draftBoard(S()).sort((a, b) => knownMid(b) - knownMid(a))[0];
  const list = made.length ? `<ol class="x-mini x-picks">${made.map((p, i) => `<li><b class="x-num">#${before + i + 1}</b>${teamAbbr(p.pick.ownerTeamId)}${monRef(S().mons[p.monId])}</li>`).join('')}</ol>` : '<p class="muted">No picks were made.</p>';
  const mine = made.filter((p) => p.pick.ownerTeamId === me);
  openDialog({
    title: toEnd ? 'Draft complete' : "You're on the clock", cap: `${plural(made.length, 'pick')} made`,
    body: `${list}${toEnd ? (mine.length ? `<p class="muted">Your auto-picks: ${esc(mine.map((p) => monName(S().mons[p.monId])).join(', '))}.</p>` : '') : best ? `<p class="muted">Best left on your board: <b>${esc(monName(best))}</b>.</p>` : ''}`,
  });
}

// ---------------------------------------------------------------- wiring
export function afterDraft(): void {
  once('draft', () => {
    document.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-fo]');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      switch (b.dataset.fo) {
        case 'scout': scoutDialog(b.dataset.mon!, false); break;
        case 'fullscout': scoutDialog(b.dataset.mon!, true); break;
        case 'hidetaken': store.ui.hideTaken = !store.ui.hideTaken; notify(); document.querySelector<HTMLElement>('[data-fo="hidetaken"]')?.focus(); break;
        case 'draft': draftDialog(b.dataset.mon!); break;
        case 'simmine': simDialog(false); break;
        case 'simend': simDialog(true); break;
        case 'draftstart': act((st, c) => api.advancePhase(c, st)); break;
        case 'startupdone': act((st, c) => api.advancePhase(c, st)); location.hash = '#roster'; break;
      }
    });
  });
}
void empty; void typeChips; void capStrip;
