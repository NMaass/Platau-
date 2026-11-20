// Lineup builder: strategy picker, six slot cards (role name is the heading, no
// slot numbers; Pokémon + OVR; set dropdown from the mon's catalog sets; two backups
// underneath), auto-assign. Change opens a chooser dialog of eligible Pokémon.
import type {Mon, Role} from '../../types.ts';
import {ROLE_LABEL} from '../../catalog/roles.ts';
import {esc, ic} from '../dom.ts';
import {C, S} from '../store.ts';
import {M, strategies} from '../model.ts';
import {head} from '../components/page.ts';
import {monRef, monBadge, speciesOf, monName, teamName} from '../components/mon.ts';
import {roleBadge, injuryTag} from '../components/badges.ts';
import {ico, spr} from '../sprites.ts';
import {openDialog} from '../components/layer.ts';
import {oppOf, strategyName} from './week.ts';

const out = (m: Mon) => !!m.injury && m.injury.kind !== 'day-to-day';
const slotRoles = (i: number): Role[] => {
  const s = S(), st = strategies().find((x) => x.id === s.teams[s.userTeamId].lineup.strategyId);
  return st?.slots[i] ?? [s.teams[s.userTeamId].lineup.slots[i].role];
};
/** best rating of a mon over a slot's allowed roles */
function fit(m: Mon, roles: Role[]): {role: Role; ovr: number} | null {
  let best: {role: Role; ovr: number} | null = null;
  for (const r of roles) { const o = M.roleRating(C(), S(), m, r); if (o != null && (!best || o > best.ovr)) best = {role: r, ovr: o}; }
  return best;
}
function backupsFor(i: number): Mon[] {
  const s = S(), L = s.teams[s.userTeamId].lineup;
  const starters = new Set(L.slots.map((x) => x.monId));
  const listed = L.slots[i].backups.map((id) => s.mons[id]).filter((m) => m && !starters.has(m.id) && !out(m) && fit(m, slotRoles(i)));
  if (listed.length >= 2) return listed.slice(0, 2);
  const roles = slotRoles(i);
  const more = Object.values(s.mons).filter((m) => m.teamId === s.userTeamId && (m.tier === 'active' || m.tier === 'backup') && !starters.has(m.id) && !out(m) && !listed.includes(m) && fit(m, roles))
    .sort((a, b) => fit(b, roles)!.ovr - fit(a, roles)!.ovr);
  return [...listed, ...more].slice(0, 2);
}

export function viewLineup(): string {
  const s = S(), me = s.userTeamId, L = s.teams[me].lineup;
  const se = M.userSeries(s);
  const ovrs = L.slots.map((sl) => sl.monId ? M.roleRating(C(), s, s.mons[sl.monId], sl.role) : null).filter((x): x is number => x != null);
  const avg = ovrs.length ? Math.round(ovrs.reduce((a, b) => a + b, 0) / ovrs.length) : null;
  const cards = L.slots.map((sl, i) => {
    const roles = slotRoles(i);
    const top = `<div class="slot-h"><div><h3 id="sh-${i}">${esc(ROLE_LABEL[sl.role])}</h3><p>${roles.length > 1 ? 'or ' + roles.filter((r) => r !== sl.role).map((r) => ROLE_LABEL[r]).join(' or ') : '&nbsp;'}</p></div><button class="btn sm" type="button" data-act="chooser" data-slot="${i}" aria-label="Change ${esc(ROLE_LABEL[sl.role])}">Change</button></div>`;
    const bks = backupsFor(i);
    const bkHtml = [0, 1].map((k) => {
      const b = bks[k];
      if (!b) return `<span class="bk-none">${k === 0 ? 'No backup' : '—'}</span>`;
      const f = fit(b, roles) ?? M.bestRole(C(), s, b);
      return `<button class="bk" type="button" data-act="swap" data-slot="${i}" data-mon="${esc(b.id)}" aria-label="Swap in ${esc(monName(b))}">${ico(speciesOf(b))}<span class="bn">${esc(monName(b))}</span>${roleBadge(f.role, f.ovr, {sm: true})}</button>`;
    }).join('');
    if (!sl.monId) {
      return `<article class="l-card slot flagged" aria-labelledby="sh-${i}">${top}
        <div class="l-empty slot-empty">${ic('empty')}<p>No one fills ${esc(ROLE_LABEL[sl.role])}. The team plays a Pokémon down.</p></div>
        <div class="l-stack tight"><span class="cap">Backups</span>${bkHtml}</div>
        <div class="slot-foot"><span class="si">Empty slot</span></div></article>`;
    }
    const m = s.mons[sl.monId], sp = speciesOf(m);
    const setId = sl.setId ?? m.setId;
    const set = sp?.sets.find((x) => x.id === setId) ?? sp?.sets[0];
    const opts = (sp?.sets ?? []).map((st) => {
      const fills = st.roles.some((r) => roles.includes(r));
      return `<option value="${esc(st.id)}"${st.id === set?.id ? ' selected' : ''}>${esc(st.tier)} · ${esc(st.name)}${fills ? '' : ' (off-role)'}</option>`;
    }).join('');
    const flagged = out(m);
    const foot = flagged ? `<span class="chip c-decline">${ic('alert')}Injured · backup will start</span>` : `<span class="si">${esc([set?.item, set?.ability, set?.nature].filter(Boolean).join(' · '))}</span>`;
    return `<article class="l-card slot${flagged ? ' flagged' : ''}" aria-labelledby="sh-${i}">${top}
      <div class="slot-mon">${spr(sp)}<div class="l-stack tight"><span class="l-row one">${monRef(m, {icon: false})}${injuryTag(m)}</span>${monBadge(m, sl.role, {full: true})}</div></div>
      <div class="slot-set"><label for="set-${i}">Set</label><select id="set-${i}" data-act="slotset" data-slot="${i}" data-mon="${esc(m.id)}">${opts}</select></div>
      <div class="l-stack tight"><span class="cap">Backups</span>${bkHtml}</div>
      <div class="slot-foot">${foot}</div></article>`;
  }).join('');
  const sub = se ? `Week ${se.week} ${se.homeId === me ? 'vs' : 'at'} ${esc(teamName(oppOf(se, me)))} (${esc(strategyName(s.teams[oppOf(se, me)].lineup.strategyId))}) · best of ${se.bestOf}` : 'No series this week';
  return head('Lineup', sub, `<a class="btn go" href="#week">${ic('check')}Done</a>`) + `<section class="l-panel flush" aria-label="Lineup">
    <div class="lbar"><label for="strat">Strategy</label><select id="strat" data-act="strategy">${strategies().map((x) => `<option value="${esc(x.id)}"${x.id === L.strategyId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <span class="avg">Starters average <b>${avg ?? '—'}</b></span><button class="btn" type="button" data-act="auto">${ic('wand')}Auto-assign</button></div>
    <div class="l-grid slots">${cards}</div></section>`;
}

/** Chooser dialog: every roster Pokémon that can fill the slot, best first; injured ones disabled. */
export function openChooser(i: number, onPick: (monId: string) => void): void {
  const s = S(), me = s.userTeamId, L = s.teams[me].lineup, roles = slotRoles(i);
  const list = Object.values(s.mons).filter((m) => m.teamId === me && m.tier !== 'practice' && m.tier !== 'ir').map((m) => ({m, f: fit(m, roles)})).filter((x) => x.f)
    .sort((a, b) => (Number(out(a.m)) - Number(out(b.m))) || (b.f!.ovr - a.f!.ovr));
  const body = list.length ? `<ul class="chooser" role="list">${list.map(({m, f}) => {
    const j = L.slots.findIndex((x) => x.monId === m.id);
    const dis = out(m);
    const where = dis ? (m.injury?.description ?? 'Injured') : j > -1 ? `Starts as ${ROLE_LABEL[L.slots[j].role]}` : m.tier === 'backup' ? 'Backup' : 'Active, not starting';
    return `<li><button type="button" data-pick="${esc(m.id)}"${dis ? ' aria-disabled="true"' : ''}${L.slots[i].monId === m.id ? ' aria-current="true"' : ''}>${ico(speciesOf(m))}<span><span class="nm">${esc(monName(m))}</span><span class="where">${esc(where)}</span></span>${roleBadge(f!.role, f!.ovr, {sm: true})}</button></li>`;
  }).join('')}</ul>` : `<div class="l-empty">No one on your roster fills ${esc(roles.map((r) => ROLE_LABEL[r]).join(' or '))}.</div>`;
  const d = openDialog({title: esc(roles.map((r) => ROLE_LABEL[r]).join(' or ')), cap: `${list.length} eligible`, body, actions: [{key: 'close', label: 'Cancel'}]});
  d.querySelector('[data-body]')!.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-pick]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    d.close();
    onPick(b.dataset.pick!);
  });
}
