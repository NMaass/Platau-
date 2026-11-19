// Pokémon and team references: Glance (icon + name + badge) -> Peek (popover) -> Page.
import type {Mon, Role, Team, TeamId, CatalogSet, CatalogSpecies, Grade} from '../../types.ts';
import {ROLE_LABEL} from '../../catalog/roles.ts';
import {esc, money} from '../dom.ts';
import {C, S} from '../store.ts';
import {M, api, isFixtureMode} from '../model.ts';
import {ico, teamLogo} from '../sprites.ts';
import {prow} from './layer.ts';
import {roleBadge, gradeChip, typeChips} from './badges.ts';
import {GRADE_PCT} from '../fallback.ts';

export const speciesOf = (m: Mon): CatalogSpecies | undefined => C().species[m.speciesId];
export const monName = (m: Mon): string => speciesOf(m)?.name ?? m.speciesId;
export const setOf = (m: Mon, setId = m.setId): CatalogSet | undefined => speciesOf(m)?.sets.find((x) => x.id === setId) ?? speciesOf(m)?.sets[0];
export const team = (id: TeamId): Team => S().teams[id];
export const teamName = (id: TeamId): string => `${team(id).city} ${team(id).name}`;
export const isMine = (m: Mon): boolean => m.teamId === S().userTeamId;

export const stage = (age: number): string => age <= 23 ? 'Rising' : age <= 29 ? 'Prime' : 'Past prime';

/** Peek for a rating: role, best tier and set, grade, IVs. */
export function ratingPop(m: Mon, role: Role, ovr: number): string {
  const sp = speciesOf(m), rb = sp?.roleBase[role];
  const set = rb ? sp!.sets.find((x) => x.id === rb.setId) : undefined;
  const g = M.evGrade(S(), m);
  return `<strong>${esc(ROLE_LABEL[role])} · ${ovr}</strong>
    ${rb ? prow('Best tier', `${esc(rb.tier)}${set ? ' · ' + esc(set.name) : ''}`) : ''}
    ${prow('EV grade', `${g} · ${GRADE_PCT[g]}% of the set's EVs`)}
    ${prow('IVs', M.ivHeadline(m))}`;
}

/** Glance badge for a mon: its current slot role if given, else its best role. */
export function monBadge(m: Mon, role?: Role | null, o: {full?: boolean; sm?: boolean; lg?: boolean; noPeek?: boolean} = {}): string {
  let r: Role | null, ovr: number | null;
  let off: Role | null = null;
  if (role) { r = role; ovr = M.roleRating(C(), S(), m, role); if (ovr == null) { r = null; } }
  else { const b = M.bestRole(C(), S(), m); r = b.role; ovr = b.ovr; }
  // off-role in its slot: it still plays a real set, its best one; mark the badge, never "No set"
  if (role && r == null) { const b = M.bestRole(C(), S(), m); off = role; r = b.role; ovr = b.ovr; }
  const pop = o.noPeek || !r || ovr == null ? undefined
    : (off ? `<strong>Off-role</strong><span>No set of ${esc(monName(m))} fills ${esc(ROLE_LABEL[off])}: it plays its best set.</span>` : '') + ratingPop(m, r!, ovr!);
  return roleBadge(r, ovr, {...o, off: !!off, pop});
}

/** Potential as a range (peek and Pokémon page only, never in rows). */
function potentialText(m: Mon): string {
  if (isFixtureMode()) return '';
  try { const p = api.knownPotential(S(), S().userTeamId, m); return p.lo === p.hi ? gradeChip(p.lo) : `${gradeChip(p.lo)} <span class="dash">to</span> ${gradeChip(p.hi)}`; } catch { return ''; }
}

/** Icon + name, linking to the Pokémon page, with a peek (role, grade, age, contract, status). */
export function monRef(m: Mon, o: {icon?: boolean; inline?: boolean; noLink?: boolean} = {}): string {
  const sp = speciesOf(m), name = monName(m);
  const g = M.evGrade(S(), m);
  // other clubs' Pokémon show only what scouting knows
  let roleTxt: string;
  if (isMine(m)) { const b = M.bestRole(C(), S(), m); roleTxt = `${esc(ROLE_LABEL[b.role])} · ${b.ovr}`; }
  else { const k = M.knownRating(C(), S(), S().userTeamId, m); roleTxt = `${esc(ROLE_LABEL[k.role])} · ${k.exact || k.lo === k.hi ? (M.roleRating(C(), S(), m, k.role) ?? k.hi) : `${k.lo}–${k.hi}`}`; }
  const pot = potentialText(m);
  const rows = [
    prow('Role', roleTxt),
    isMine(m) ? prow('EV grade', `${gradeChip(g)} <span class="muted">Growth ${m.growth}</span>`) : '',
    pot ? prow('Potential', pot) : '',
    prow('Age', `${m.age} · ${stage(m.age)}`),
    m.contract ? prow('Contract', `${money(m.contract.salary)} · ${m.contract.yearsLeft} ${m.contract.yearsLeft === 1 ? 'yr' : 'yrs'}`) : '',
    m.injury ? prow('Status', esc(m.injury.description)) : '',
    m.teamId && !isMine(m) ? prow('Team', esc(teamName(m.teamId))) : '',
  ].join('');
  const pop = `<span class="pop"><strong>${esc(name)}</strong><span class="types">${typeChips(sp?.types ?? [])}</span>${rows}</span>`;
  const inner = `${o.icon !== false ? ico(sp) : ''}<span class="nm">${esc(name)}</span>${pop}`;
  const cls = 'ref peek' + (o.inline ? ' inline' : '');
  return o.noLink ? `<span class="${cls}" tabindex="0">${inner}</span>` : `<a class="${cls}" href="#mon-${esc(m.id)}">${inner}</a>`;
}
export const nameLink = (m: Mon): string => monRef(m, {icon: false, inline: true});

/** Compact club label: badge logo + 3-letter abbreviation (fixed width), full name for screen readers. */
export function teamAbbr(id: TeamId): string {
  const t = team(id), me = id === S().userTeamId;
  return `<span class="x-team">${teamLogo(t)}<span class="x-abbr${me ? ' x-me' : ''}" aria-hidden="true">${esc(t.abbr)}</span><span class="sr">${esc(teamName(id))}</span></span>`;
}
/** Club in a row: badge logo + full name. */
export function teamCell(id: TeamId): string {
  const t = team(id), me = id === S().userTeamId;
  return `<span class="x-team${me ? ' x-me' : ''}">${teamLogo(t)}<span>${esc(teamName(id))}</span></span>`;
}

export const nextGrade = (m: Mon): Grade | null => {
  const order: Grade[] = ['F', 'D', 'C', 'B', 'A', 'AA', 'AAA'];
  const i = order.indexOf(M.evGrade(S(), m));
  return order[i + 1] ?? null;
};
