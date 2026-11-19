// Roster: lenses List / Contracts / Growth over one fixed column grid; groups Active,
// Backup, Practice, Injured reserve; injury shown as an inline tag (no Status column).
import type {Mon, Role, Grade} from '../../types.ts';
import {ROLE_LABEL} from '../../catalog/roles.ts';
import {esc, money, plural} from '../dom.ts';
import {C, S, store} from '../store.ts';
import {M} from '../model.ts';
import {head, lensTabs} from '../components/page.ts';
import {table, type Col} from '../components/table.ts';
import {monRef, monBadge, setOf, stage, monName} from '../components/mon.ts';
import {gradeChip, injuryTag, expiringTag} from '../components/badges.ts';
import {prow} from '../components/layer.ts';
import {GRADE_AT, GRADE_PCT, GRADES} from '../fallback.ts';
import {strategyName} from './week.ts';

const GROUPS = [
  {key: 'active', label: 'Active', of: (m: Mon) => m.tier === 'active'},
  {key: 'backup', label: 'Backup', of: (m: Mon) => m.tier === 'backup'},
  {key: 'practice', label: 'Practice', of: (m: Mon) => m.tier === 'practice'},
  {key: 'ir', label: 'Injured reserve', of: (m: Mon) => m.tier === 'ir'},
];
const W = ['34%', '18%', '20%', '12%', '16%'];

export const slotRoleOf = (m: Mon): Role | null => {
  const sl = S().teams[S().userTeamId].lineup.slots.find((x) => x.monId === m.id);
  return sl?.role ?? null;
};
const nextOf = (g: Grade): Grade | null => GRADES[GRADES.indexOf(g) + 1] ?? null;

export function gradePeek(m: Mon): string {
  const g = M.evGrade(S(), m), n = nextOf(g);
  return `<span class="peek" tabindex="0" aria-label="EV grade ${g}">${gradeChip(g)}<span class="pop"><strong>EV grade ${g}: ${GRADE_PCT[g]}% of the set's EVs</strong>${prow('Growth', m.growth + '/100')}${prow('Next grade', n ? `${n} at ${GRADE_AT[n]}` : 'Top grade')}</span></span>`;
}
export function growthBar(m: Mon): string {
  const n = nextOf(M.evGrade(S(), m));
  return `<div class="gbar"><span class="fitbar" role="img" aria-label="Growth ${m.growth} of 100"><i style="width:${m.growth}%"></i>${n ? `<b style="left:${GRADE_AT[n]}%"></b>` : ''}</span><small>${m.growth}${n ? ` · ${n} at ${GRADE_AT[n]}` : ' · max'}</small></div>`;
}

export function viewRoster(): string {
  const s = S(), c = C(), me = s.userTeamId;
  const lens = (store.ui.rosterLens as string) ?? 'list';
  const mons = Object.values(s.mons).filter((m) => m.teamId === me);
  const exp = mons.filter((m) => m.contract?.yearsLeft === 1);
  const expSum = exp.reduce((t, m) => t + (m.contract?.salary ?? 0), 0);
  const who: Col<Mon> = {key: 'name', label: 'Pokémon', width: W[0], cell: (m) => `<span class="who">${monRef(m)}${injuryTag(m)}</span>`, sort: (m) => monName(m)};
  const rating = (m: Mon) => { const r = slotRoleOf(m); return r ? (M.roleRating(c, s, m, r) ?? 0) : M.bestRole(c, s, m).ovr; };
  const cols: Record<string, Col<Mon>[]> = {
    list: [who,
      {key: 'role', label: 'Role', width: W[1], cell: (m) => monBadge(m, slotRoleOf(m)), sort: rating, desc: true},
      {key: 'set', label: 'Set', width: W[2], cell: (m) => { const st = setOf(m); return st ? `${esc(st.tier)} · ${esc(st.name)}` : '<span class="dash">—</span>'; }, sort: (m) => setOf(m)?.name ?? ''},
      {key: 'age', label: 'Age', width: W[3], num: true, cell: (m) => String(m.age), sort: (m) => m.age},
      {key: 'sal', label: 'Salary', width: W[4], num: true, cell: (m) => m.contract ? money(m.contract.salary) : '—', sort: (m) => m.contract?.salary ?? 0, desc: true}],
    contracts: [who,
      {key: 'sal', label: 'Salary', width: W[1], num: true, cell: (m) => m.contract ? money(m.contract.salary) : '—', sort: (m) => m.contract?.salary ?? 0, desc: true},
      {key: 'yrs', label: 'Years left', width: W[2], cell: (m) => m.contract ? `<span class="l-row">${plural(m.contract.yearsLeft, 'year')}${m.contract.yearsLeft === 1 ? expiringTag() : ''}</span>` : '—', sort: (m) => m.contract?.yearsLeft ?? 0},
      {key: 'ends', label: 'Ends', width: W[3], num: true, cell: (m) => m.contract ? String(s.season + m.contract.yearsLeft - 1) : '—', sort: (m) => m.contract?.yearsLeft ?? 0},
      {key: 'share', label: 'Cap share', width: W[4], num: true, cell: (m) => m.contract ? (m.contract.salary / s.settings.cap * 100).toFixed(1) + '%' : '—', sort: (m) => m.contract?.salary ?? 0, desc: true}],
    growth: [who,
      {key: 'grade', label: 'EV grade', width: W[1], cell: gradePeek, sort: (m) => m.growth, desc: true},
      {key: 'growth', label: 'Growth', width: W[2], cell: growthBar, sort: (m) => m.growth, desc: true},
      {key: 'age', label: 'Age', width: W[3], num: true, cell: (m) => String(m.age), sort: (m) => m.age},
      {key: 'stage', label: 'Stage', width: W[4], cell: (m) => stage(m.age), sort: (m) => m.age}],
  };
  const pay = M.payroll(s, me), cap = s.settings.cap;
  const closest = mons.filter((m) => m.tier !== 'ir').map((m) => ({m, n: nextOf(M.evGrade(s, m))})).filter((x) => x.n)
    .map((x) => ({...x, d: GRADE_AT[x.n!] - x.m.growth})).sort((a, b) => a.d - b.d)[0];
  const bar: Record<string, string> = {
    list: `<span>Roles for the <b>${esc(strategyName(s.teams[me].lineup.strategyId))}</b> lineup. Others show their best role.</span>`,
    contracts: `<span class="capm"><span>Cap room</span><b>${money(cap - pay)}</b><span class="fitbar" role="img" aria-label="${money(pay)} of ${money(cap)} used"><i style="width:${Math.min(100, pay / cap * 100).toFixed(1)}%"></i></span><span>${money(pay)} of ${money(cap)} · ${money(expSum)} expires</span></span>`,
    growth: `<span>${closest ? `${esc(monName(closest.m))} is closest to a new grade: ${closest.d} Growth from ${closest.n}.` : 'Nobody is close to a new grade.'}</span>`,
  };
  return head('Roster', `${plural(mons.filter((m) => m.tier !== 'ir').length, 'Pokémon', 'Pokémon')} · ${money(expSum)} expires after this season`) +
    `<section class="l-panel flush" aria-label="Roster">${lensTabs('rosterLens', lens, [['list', 'List'], ['contracts', 'Contracts'], ['growth', 'Growth']])}
    <div class="lensbar">${bar[lens]}</div>
    ${table<Mon>({id: 'roster-' + lens, cols: cols[lens], rows: mons, groups: GROUPS, minWidth: 760, rowClass: (m) => m.injury && m.injury.kind !== 'day-to-day' ? 'off' : '', label: 'Roster'})}
    </section>`;
}
void ROLE_LABEL;
