// "Before you play" advisories for the user's club.
import type {Catalog, LeagueState, Role, MonId, Series} from '../types.ts';
import {ROLE_LABEL} from '../catalog/roles.ts';
import {canBattle, fieldedLineup} from './lineup.ts';
import {knowsExactly} from './scouting.ts';
import {roleRating} from './ratings.ts';
import {capPayroll} from './cap.ts';
import {dupNumbers, monLabel, rosterCount, teamMons} from './util.ts';
import {seriesOfWeek} from './schedule.ts';

export interface Advisory { id: string; kind: 'injury' | 'lineup' | 'offer' | 'scout' | 'contract'; label: string; text: string; action: {label: string; route: string} }

export function userSeries(state: LeagueState): Series | null {
  if (state.phase !== 'regular' && state.phase !== 'playoffs') return null;
  return seriesOfWeek(state, state.week).find(s => s.homeId === state.userTeamId || s.awayId === state.userTeamId) ?? null;
}

export function likelyLineup(catalog: Catalog, state: LeagueState, teamId: string): {role: Role; monId: MonId}[] {
  return fieldedLineup(catalog, state, teamId).map(f => ({role: f.role, monId: f.monId}));
}

export function advisories(catalog: Catalog, state: LeagueState): Advisory[] {
  const out: Advisory[] = [];
  const me = state.teams[state.userTeamId];
  const nums = dupNumbers(state);
  const name = (id: MonId) => state.mons[id] ? monLabel(catalog, state, state.mons[id], nums) : 'Unknown';
  // lineup problems only matter while games are coming (not in the offseason)
  const games = state.phase === 'preseason' || state.phase === 'regular' || state.phase === 'playoffs';
  if (games) me.lineup.slots.forEach((sl, i) => {
    const m = sl.monId ? state.mons[sl.monId] : undefined;
    if (!m || m.teamId !== me.id) {
      out.push({id: `slot-${i}`, kind: 'lineup', label: 'Lineup', text: `No one fills the ${ROLE_LABEL[sl.role]} slot. A backup will be auto-filled.`, action: {label: 'Fix lineup', route: '#lineup'}});
      return;
    }
    if (m.injury && !canBattle(m)) {
      const what = m.injury.kind === 'ir' ? 'is on injured reserve' : `is out ${m.injury.weeksLeft} week${m.injury.weeksLeft > 1 ? 's' : ''}`;
      out.push({id: `inj-${m.id}`, kind: 'injury', label: 'Injury', text: `${name(m.id)} ${what} and still starts. A backup will be auto-filled.`, action: {label: 'Review', route: '#lineup'}});
    } else if (m.injury?.kind === 'day-to-day') {
      out.push({id: `dtd-${m.id}`, kind: 'injury', label: 'Injury', text: `${name(m.id)} is day-to-day and plays one grade lower.`, action: {label: 'Review', route: '#lineup'}});
    } else if (m.tier === 'practice') {
      out.push({id: `prac-${m.id}`, kind: 'lineup', label: 'Lineup', text: `${name(m.id)} is on the practice squad and can't battle.`, action: {label: 'Fix lineup', route: '#lineup'}});
    } else if (roleRating(catalog, m, sl.role) == null) {
      out.push({id: `off-${i}`, kind: 'lineup', label: 'Lineup', text: `${name(m.id)} has no ${ROLE_LABEL[sl.role]} set and plays off-role.`, action: {label: 'Fix lineup', route: '#lineup'}});
    }
  });
  if (state.phase === 'preseason' || state.phase === 'regular' || state.phase === 'free-agency') {
    const n = rosterCount(teamMons(state, me.id));
    if (n > 18) out.push({id: 'roster', kind: 'lineup', label: 'Roster', text: `You carry ${n} outside injured reserve; release ${n - 18} before the season starts (Play lists who would go).`, action: {label: 'Roster', route: '#roster'}});
    else if (n < 18 && state.phase !== 'free-agency') out.push({id: 'roster', kind: 'lineup', label: 'Roster', text: `You carry ${n}; free agents will be signed up to 18.`, action: {label: 'Sign', route: '#freeagents'}});
  }
  for (const o of state.offers) {
    if (o.status !== 'open' || o.toTeamId !== me.id) continue;
    if (o.expiresWeek <= state.week) out.push({id: `offer-${o.id}`, kind: 'offer', label: 'Offer', text: `${state.teams[o.fromTeamId].name}' offer ends this week.`, action: {label: 'Review', route: '#offers'}});
  }
  const s = userSeries(state);
  if (s) {
    const opp = s.homeId === me.id ? s.awayId : s.homeId;
    const unknown = likelyLineup(catalog, state, opp).filter(x => !knowsExactly(state, me.id, state.mons[x.monId])).length;
    out.push({id: `scout-${opp}`, kind: 'scout', label: 'Scouting',
      text: unknown ? `${unknown} of ${state.teams[opp].name}' likely six ${unknown === 1 ? 'is' : 'are'} not fully known yet.` : `Report on ${state.teams[opp].city} ${state.teams[opp].name} is ready.`,
      action: {label: 'Read report', route: '#opponent'}});
  }
  if (capPayroll(state, me.id) > state.settings.cap) out.push({id: 'cap', kind: 'contract', label: 'Cap', text: 'You are over the cap: only minimum deals can be signed.', action: {label: 'Contracts', route: '#roster?lens=contracts'}});
  if (state.phase === 'regular' && state.week >= state.settings.weeks - 3) {
    const exp = teamMons(state, me.id).filter(m => m.contract && m.contract.yearsLeft <= 1);
    if (exp.length) out.push({id: 'exp', kind: 'contract', label: 'Contracts', text: `${exp.length} contract${exp.length > 1 ? 's' : ''} expire after this season.`, action: {label: 'Contracts', route: '#roster?lens=contracts'}});
  }
  if (state.phase === 'resign') {
    const exp = teamMons(state, me.id).filter(m => m.contract && m.contract.yearsLeft <= 0);
    if (exp.length) out.push({id: 'resign', kind: 'contract', label: 'Re-sign', text: `${exp.length} expiring contract${exp.length > 1 ? 's' : ''}: re-sign or tag before free agency.`, action: {label: 'Re-sign', route: '#freeagents'}});
  }
  return out;
}
