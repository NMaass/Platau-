// Pokémon page: header, role ratings, moveset, development (EV grade, Growth track,
// IVs, potential as a range: the only place it shows), contract, injury, season lines, awards.
import type {Mon, Grade, StatId} from '../../types.ts';
import {ROLE_LABEL} from '../../catalog/roles.ts';
import {esc, ic, money, plural} from '../dom.ts';
import {C, S, store} from '../store.ts';
import {M, api, isFixtureMode} from '../model.ts';
import {head, panel, empty} from '../components/page.ts';
import {monBadge, speciesOf, monName, isMine, stage, teamName, setOf, ratingPop} from '../components/mon.ts';
import {gradeChip, ivSummary, injuryTag, typeChips, roleBadge, rangeBadge} from '../components/badges.ts';
import {info, prow} from '../components/layer.ts';
import {table} from '../components/table.ts';
import {spr} from '../sprites.ts';
import {GRADE_AT, GRADE_PCT, GRADES} from '../fallback.ts';
import {slotRoleOf} from './roster.ts';

const STAT_LBL: Record<StatId, string> = {hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'};
const STATS: StatId[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function potentialRange(m: Mon, g: Grade): [Grade, Grade] {
  const kp = (api as unknown as {knownPotential?: (s: unknown, v: string, m: Mon) => {lo: Grade; hi: Grade}}).knownPotential;
  if (!isFixtureMode() && kp) { try { const r = kp(S(), S().userTeamId, m); return [r.lo, r.hi]; } catch { /* fall through */ } }
  const p = GRADES.indexOf(m.potential), cur = GRADES.indexOf(g);
  const w = m.age <= 23 ? 1 : 0;
  const lo = Math.max(cur, p - w), hi = Math.min(6, Math.max(lo, p + w));
  return [GRADES[lo], GRADES[hi]];
}

export function viewMon(id: string): string {
  const s = S(), c = C(), m = s.mons[id];
  const back = (store.ui.monBack as string) ?? '#roster';
  if (!m) return head('Not found', 'No Pokémon with that id.') + `<a class="btn" href="#roster">Back to roster</a>`;
  const sp = speciesOf(m), mine = isMine(m), g = M.evGrade(s, m);
  const slotRole = mine ? slotRoleOf(m) : null;
  const facts = [
    m.teamId ? (mine ? (slotRole ? `Starts as ${ROLE_LABEL[slotRole]}` : m.tier[0].toUpperCase() + m.tier.slice(1)) : teamName(m.teamId)) : 'Free agent',
    `Age ${m.age} · ${stage(m.age)}`,
    m.contract ? `${money(m.contract.salary)} · ${plural(m.contract.yearsLeft, 'yr')} left` : '',
  ].filter(Boolean);
  // roles table
  const rs = M.roles(c, s, m);
  // other clubs' Pokémon: only what scouting knows (exact for veterans/fully scouted, else a range)
  const kr = mine ? null : M.knownRating(c, s, s.userTeamId, m);
  const hidden = !!kr && !kr.exact;
  const rolesBlock = rs.length ? table({
    id: 'mon-roles', rows: rs, minWidth: 440, defaultSort: {key: 'ovr', dir: 'desc'},
    rowClass: (r) => r.role === slotRole ? 'cur' : '',
    cols: [
      {key: 'role', label: 'Role', width: '36%', cell: (r) => esc(ROLE_LABEL[r.role]), sort: (r) => ROLE_LABEL[r.role]},
      {key: 'tier', label: 'Best tier', width: '18%', cell: (r) => `<span class="tierb">${esc(sp?.roleBase[r.role]?.tier ?? '—')}</span>`},
      {key: 'set', label: 'Set', width: '28%', cell: (r) => esc(sp?.sets.find((x) => x.id === r.setId)?.name ?? '—')},
      {key: 'ovr', label: 'OVR', width: '18%', num: true, cell: (r) => hidden ? (r.role === kr!.role ? `<span class="rb range"><span class="rb-n">${kr!.lo}–${kr!.hi}</span></span>` : '<span class="dash">?</span>') : `<span class="peek" tabindex="0" aria-label="${esc(ROLE_LABEL[r.role])} ${r.ovr}"><span class="rb${r.ovr >= 90 ? ' elite' : ''}"><span class="rb-n"><span>${r.ovr}</span></span></span><span class="pop">${ratingPop(m, r.role, r.ovr)}</span></span>`, sort: (r) => hidden ? (r.role === kr!.role ? 1 : 0) : r.ovr, desc: true},
    ],
  }) : empty('No set fills a role', `${esc(monName(m))} has no competitive set yet, so it can't fill a lineup slot.`);
  // moveset
  const set = setOf(m), pct = GRADE_PCT[g];
  const evs = set ? STATS.filter((k) => Math.floor((set.evs[k] ?? 0) * pct / 400) > 0) : [];
  const moveset = set ? `<div class="slot-set"><label for="monset">Set</label><select id="monset" data-act="monset" data-mon="${esc(m.id)}"${mine ? '' : ' disabled'}>${(sp?.sets ?? []).map((x) => `<option value="${esc(x.id)}"${x.id === set.id ? ' selected' : ''}>${esc(x.tier)} · ${esc(x.name)}</option>`).join('')}</select></div>
    <ul class="moves" aria-label="Moves">${set.moves.concat(['', '', '', '']).slice(0, 4).map((x) => `<li>${esc(x) || '<span class="dash">—</span>'}</li>`).join('')}</ul>
    <dl class="l-kv"><dt>Fills</dt><dd>${esc(set.roles.map((r) => ROLE_LABEL[r]).join(', ') || 'No role')}</dd><dt>Item</dt><dd>${esc(set.item || '—')}</dd><dt>Ability</dt><dd>${esc(set.ability)}</dd><dt>Nature</dt><dd>${esc(set.nature)}</dd>
    <dt>EVs at ${g}</dt><dd>${evs.map((k) => `${Math.floor((set.evs[k]! * pct / 100) / 4) * 4} ${STAT_LBL[k]}`).join(' · ')} <span class="muted">(${pct}%)</span></dd></dl>` : empty('No set', '');
  // development
  const nxt = GRADES[GRADES.indexOf(g) + 1];
  const [plo, phi] = potentialRange(m, g);
  const dev = `<div class="ladder" role="list" aria-label="EV grade ladder">${GRADES.map((x) => `<span role="listitem" class="step${x === g ? ' cur' : ''}">${gradeChip(x, x === g ? ' aria-current="true"' : '')}<small>${x === g ? 'Now' : ''}</small></span>`).join('')}</div>
    <div class="l-stack tight">
      <div class="grow-top"><span class="cap">Growth</span><b>${m.growth}<small> /100</small></b></div>
      <div class="track" role="img" aria-label="Growth ${m.growth} of 100"><i style="width:${m.growth}%"></i>${nxt ? `<b style="left:${GRADE_AT[nxt]}%"></b>` : ''}</div>
      <div class="grow-foot"><span>EV grade ${g} · ${pct}% of the set's EVs</span><span>${nxt ? `${nxt} at ${GRADE_AT[nxt]}` : 'Top grade'}</span></div>
    </div>
    <dl class="l-kv">
      <dt>IVs</dt><dd>${ivSummary(m, sp, M.ivHeadline(m))}</dd>
      <dt>Potential</dt><dd class="l-row">${gradeChip(plo)}${plo === phi ? '' : `<span class="dash">to</span>${gradeChip(phi)}`}${info('About potential', `<strong>Potential</strong><span>Scouts' estimate of the highest EV grade this Pokémon will reach. It narrows as it plays.</span>`)}</dd>
      <dt>Stage</dt><dd>${stage(m.age)}</dd>
      ${mine ? `<dt><label for="montier">Roster spot</label></dt><dd><select id="montier" data-act="tier" data-mon="${esc(m.id)}">${(['active', 'backup', 'practice', 'ir'] as const).map((t) => `<option value="${t}"${m.tier === t ? ' selected' : ''}>${({active: 'Active', backup: 'Backup', practice: 'Practice', ir: 'Injured reserve'})[t]}</option>`).join('')}</select></dd>` : ''}
    </dl>`;
  // contract + injury
  const ct = m.contract;
  const contract = ct ? `<dl class="l-kv"><dt>Salary</dt><dd>${money(ct.salary)}</dd><dt>Years left</dt><dd>${plural(ct.yearsLeft, 'year')} (through season ${s.season + ct.yearsLeft - 1})</dd><dt>Guaranteed</dt><dd>${plural(ct.guaranteedYears, 'year')}</dd>${ct.rookie ? `<dt>Rookie deal</dt><dd>Round ${ct.rookie.round}, pick ${ct.rookie.pick}</dd>` : ''}${ct.tagged ? '<dt>Tag</dt><dd>Franchise tag</dd>' : ''}<dt>Cap share</dt><dd>${(ct.salary / s.settings.cap * 100).toFixed(1)}%</dd></dl>` : `<p class="muted">No contract.</p>`;
  const injury = m.injury ? `<div class="l-row">${injuryTag(m)}<span>${esc(m.injury.description)} · since week ${m.injury.sinceWeek}</span></div>${m.injury.severe ? `<p class="muted">Severe: ${m.injury.severe.ivLost ? `lost an IV grade in ${STAT_LBL[m.injury.severe.ivLost]}` : ''}${m.injury.severe.gradeCap ? ` EV grade capped at ${m.injury.severe.gradeCap}` : ''}</p>` : ''}` : '';
  // season lines
  const lines = m.stats.slice().sort((a, b) => a.season - b.season);
  const seasons = lines.length ? table({
    id: 'mon-seasons', rows: lines, minWidth: 720,
    cols: [
      {key: 'season', label: 'Season', width: '10%', cell: (l) => String(l.season)},
      {key: 'team', label: 'Team', width: '22%', cell: (l) => esc(s.teams[l.teamId] ? teamName(l.teamId) : l.teamId)},
      {key: 'series', label: 'Series', width: '10%', num: true, cell: (l) => String(l.series)},
      {key: 'battles', label: 'Games', width: '10%', num: true, cell: (l) => String(l.battles)},
      {key: 'wins', label: 'Wins', width: '10%', num: true, cell: (l) => String(l.wins)},
      {key: 'kos', label: 'KOs', width: '10%', num: true, cell: (l) => String(l.kos)},
      {key: 'faints', label: 'Fainted', width: '10%', num: true, cell: (l) => String(l.faints)},
      {key: 'mvp', label: 'MVPs', width: '10%', num: true, cell: (l) => String(l.seriesMvps)},
    ],
  }) : `<div class="l-pad"><p class="muted">No games played yet.</p></div>`;
  const awards = m.awards.length ? `<ul class="l-grid awards">${m.awards.map((a) => `<li class="award"><span class="chip c-honour" aria-hidden="true">${ic('trophy')}</span><div><b>${esc(a.award)}</b><span>${a.season} · ${esc(s.teams[a.teamId]?.name ?? '')}</span></div></li>`).join('')}</ul>` : `<p class="muted">No awards yet.</p>`;
  const headBadge = hidden ? rangeBadge(kr!.role, kr!.lo, kr!.hi, {full: true}) : monBadge(m, slotRole, {full: true});
  const [olo, ohi] = mine ? [plo, phi] : potentialRange(m, g);
  const scoutPanel = !kr ? '' : `<dl class="l-kv"><dt>Rating</dt><dd>${kr!.exact ? roleBadge(kr!.role, M.roleRating(c, s, m, kr!.role) ?? kr!.hi) : rangeBadge(kr!.role, kr!.lo, kr!.hi)}</dd><dt>IVs</dt><dd>${ivSummary(m, sp, M.ivHeadline(m))}</dd>
    <dt>Potential</dt><dd class="l-row">${gradeChip(olo)}${olo === ohi ? '' : `<span class="dash">to</span>${gradeChip(ohi)}`}</dd></dl>`;
  return `<a class="back" href="${esc(back)}">${ic('back')}Back</a>
  <header class="mh">${spr(sp, 'xl')}
    <div class="l-stack tight"><h1 tabindex="-1">${esc(monName(m))}</h1>
      <div class="l-row even">${typeChips(sp?.types ?? [])}${headBadge}${injuryTag(m)}</div>
      <p class="muted">${esc(facts.join(' · '))}</p></div>
  </header>
  <div class="l-cols">
    <div class="l-stack loose">
      <section class="l-panel flush l-section" aria-labelledby="h-roles"><h2 id="h-roles">Roles</h2>${rolesBlock}</section>
      ${panel('mv', 'Moveset', moveset)}
    </div>
    <div class="l-stack loose">
      ${mine ? panel('dev', 'Development', dev) : panel('dev', 'Scouting', scoutPanel)}
      ${panel('ct', 'Contract', contract + injury)}
    </div>
  </div>
  <section class="l-panel flush l-section" aria-labelledby="h-seasons"><h2 id="h-seasons">Seasons</h2>${seasons}</section>
  ${panel('aw', 'Awards', awards)}`;
}
void prow;
