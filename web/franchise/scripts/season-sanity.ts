// Season-level sanity over N fast-sim seasons (quick sim, no engine): league OVR and ages,
// legendaries, payrolls against floor/cap, on-role lineups, injuries, Growth by tier,
// rookie evolutions and the champions. Prints one table per metric; exits 1 when a check fails.
//   cd web && node franchise/scripts/season-sanity.ts [seasons=5] [seed=11] [--quiet]
import {readFileSync} from 'node:fs';
import type {Catalog, LeagueState, Mon, MonId, TeamId} from '../types.ts';
import * as api from '../model/api.ts';
import {roleRating, bestRole} from '../model/ratings.ts';
import {canBattle} from '../model/lineup.ts';
import {strategyById} from '../model/strategies.ts';
import {payroll} from '../model/cap.ts';
import {isLegendary} from '../model/mons.ts';
import {teamMons} from '../model/util.ts';
import {GROWTH_BAND_HI, gi} from '../model/grades.ts';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const SEASONS = +(args[0] ?? 5), SEED = +(args[1] ?? 11);
const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8')) as Catalog;
const s: LeagueState = api.newLeague(catalog, {start: 'random', seed: SEED, name: 'Sanity', userTeamIndex: 0});
const teams = Object.keys(s.teams);
const user = s.userTeamId;

const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const pct = (xs: number[], p: number) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0; };
const f1 = (x: number) => x.toFixed(1);

/** On-role coverage of a team's lineup: off-role slots, and how many were unavoidable (max matching). */
function lineupCheck(teamId: TeamId): {offRole: number; unavoidable: number; noSet: number; empty: number} {
  const team = s.teams[teamId];
  const strat = strategyById(team.lineup.strategyId);
  const pool = teamMons(s, teamId).filter(m => canBattle(m) && m.tier !== 'practice');
  let offRole = 0, noSet = 0, empty = 0;
  team.lineup.slots.forEach(sl => {
    const m = sl.monId ? s.mons[sl.monId] : undefined;
    if (!m) { empty++; return; }
    if (roleRating(catalog, m, sl.role) === null) offRole++;
    const sp = catalog.species[m.speciesId];
    if (!sl.setId || !sp.sets.some(x => x.id === sl.setId)) noSet++;
  });
  // max bipartite matching of slots to pool mons that fill any of the slot's roles
  const can = strat.slots.map(roles => pool.map(m => roles.some(r => roleRating(catalog, m, r) !== null)));
  const match: number[] = pool.map(() => -1);
  const tryS = (si: number, seen: boolean[]): boolean => {
    for (let j = 0; j < pool.length; j++) if (can[si][j] && !seen[j]) {
      seen[j] = true;
      if (match[j] < 0 || tryS(match[j], seen)) { match[j] = si; return true; }
    }
    return false;
  };
  let matched = 0;
  for (let si = 0; si < strat.slots.length; si++) if (tryS(si, pool.map(() => false))) matched++;
  return {offRole, unavoidable: strat.slots.length - matched, noSet, empty};
}

interface SeasonRow {
  season: number; champ: string; ovrMean: number; ovrP10: number; ovrP90: number; starterOvr: number; ageMean: number;
  legends: number; legendsFa: number; payMin: number; payMax: number; belowFloor: number; overCap: number;
  offRole: number; unavoidable: number; noSet: number; injPerTeam: number; dtdPerTeam: number; multiWeekStarter: number; userStops: number;
  growth: Record<string, number>; young: Record<string, number>; evoRate: Record<string, number>; rookieEvo1: number; rookieEvo2: number; rosterMax: number; floorPaid: number;
}
const rows: SeasonRow[] = [];
const rookieCohort = new Map<number, Map<MonId, string>>();   // rookie season -> rookies with an evolution in reach -> species then

/** A promising rookie (potential B or better) whose next evolution is within its potential and
 * at most 25 Growth away (Growth past the potential band crawls). */
function reachableEvo(m: Mon): boolean {
  const sp = catalog.species[m.speciesId];
  return gi(m.potential) >= gi('B') && sp.evolvesTo.some(e => catalog.species[e.id]?.sets.length && e.level <= GROWTH_BAND_HI[m.potential] && e.level - m.growth <= 25);
}

let guard = 0;
for (let season = 1; season <= SEASONS && guard < 4000; season++) {
  // preseason -> regular
  while (s.phase !== 'preseason' && guard++ < 4000) step();
  rookieCohort.set(s.season, new Map(Object.values(s.mons).filter(m => m.teamId && !m.retired && m.rookieSeason === s.season && reachableEvo(m)).map(m => [m.id, m.speciesId])));
  const rosterMax = Math.max(...teams.map(t => teamMons(s, t).filter(m => m.tier !== 'ir').length));
  const floorTx0 = s.log.filter(x => x.kind === 'floor').length;
  api.advancePhase(catalog, s);   // into the regular season (rosters trimmed, floor enforced)
  if (s.phase !== 'regular') { // the user's roster blocks the season: trim it the way the dialog would
    api.trimRoster?.(catalog, s, user);
    api.advancePhase(catalog, s);
  }
  const pays = teams.map(t => payroll(s, t));
  const floorPaid = s.log.filter(x => x.kind === 'floor').length - floorTx0;
  const lc = teams.map(lineupCheck);
  const snap = new Map<MonId, {growth: number; tier: string; species: string}>();
  for (const id in s.mons) { const m = s.mons[id]; if (m.teamId && !m.retired) snap.set(id, {growth: m.growth, tier: m.tier, species: m.speciesId}); }
  let inj = 0, dtd = 0, multiStarter = 0, userStops = 0;
  const lcMid: ReturnType<typeof lineupCheck>[] = [];
  while ((s.phase === 'regular' || s.phase === 'playoffs') && guard++ < 4000) {
    const wk = s.week, se = s.season;
    const starters = new Set(teams.flatMap(t => s.teams[t].lineup.slots.map(sl => sl.monId).filter(Boolean) as MonId[]));
    api.playWeekSync(catalog, s);
    if (s.phase === 'regular' && s.week === 8) lcMid.push(...teams.map(lineupCheck));
    for (const id in s.mons) {
      const m = s.mons[id];
      const j = m.injury;
      if (!j || j.season !== se || j.sinceWeek !== wk || !m.teamId) continue;
      inj++;
      if (j.kind === 'day-to-day') dtd++;
      else if (starters.has(id) && j.weeksLeft >= 2) multiStarter++;
    }
    if ((s.pauseReasons ?? []).some(r => / out \d+ weeks/.test(r))) userStops++;
  }
  const champ = s.history.at(-1)?.championId ?? '?';
  // Growth by starting tier (in-season: games, practice, goals; Little Cup is preseason)
  const byTier: Record<string, number[]> = {active: [], backup: [], practice: []};
  const youngTier: Record<string, number[]> = {active: [], backup: [], practice: []};
  const evo: Record<string, number[]> = {active: [], backup: [], practice: []};
  for (const [id, b] of snap) {
    const m = s.mons[id];
    if (!m || m.retired || !byTier[b.tier]) continue;
    byTier[b.tier].push(m.growth - b.growth);
    if (m.age <= 24 && b.growth < GROWTH_BAND_HI[m.potential]) youngTier[b.tier].push(m.growth - b.growth);
    if (reachableEvo({...m, speciesId: b.species, growth: b.growth} as Mon)) evo[b.tier].push(m.speciesId !== b.species ? 1 : 0);
  }
  const evolvedBy = (cohortSeason: number) => {
    const c = [...(rookieCohort.get(cohortSeason) ?? new Map()).entries()].filter(([id]) => s.mons[id]?.teamId && !s.mons[id].retired);
    return c.length ? mean(c.map(([id, sp]) => (s.mons[id].speciesId !== sp ? 1 : 0))) : NaN;
  };
  const rostered = Object.values(s.mons).filter(m => m.teamId && !m.retired);
  const ovrs = rostered.map(m => bestRole(catalog, m).ovr);
  const starterOvr = mean(teams.flatMap(t => s.teams[t].lineup.slots.map(sl => sl.monId ? bestRole(catalog, s.mons[sl.monId]).ovr : 0)));
  const mid = lcMid.length ? lcMid : lc;
  rows.push({
    season: s.season, champ: s.teams[champ]?.abbr ?? champ,
    ovrMean: mean(ovrs), ovrP10: pct(ovrs, 0.1), ovrP90: pct(ovrs, 0.9), starterOvr, ageMean: mean(rostered.map(m => m.age)),
    legends: rostered.filter(m => isLegendary(catalog, m)).length,
    legendsFa: Object.values(s.mons).filter(m => !m.teamId && !m.retired && m.prospect === undefined && isLegendary(catalog, m)).length,
    payMin: Math.min(...pays) / s.settings.cap, payMax: Math.max(...pays) / s.settings.cap,
    belowFloor: pays.filter(p => p < s.settings.floor).length, overCap: teams.filter(t => api.capSpace(s, t) < 0).length,
    offRole: mean([...lc, ...mid].map(x => x.offRole + x.empty)) * 16, unavoidable: mean([...lc, ...mid].map(x => x.unavoidable)) * 16,
    noSet: [...lc, ...mid].reduce((a, x) => a + x.noSet, 0),
    injPerTeam: inj / teams.length, dtdPerTeam: dtd / teams.length, multiWeekStarter: multiStarter / teams.length, userStops,
    growth: Object.fromEntries(Object.entries(byTier).map(([k, v]) => [k, mean(v)])),
    young: Object.fromEntries(Object.entries(youngTier).map(([k, v]) => [k, mean(v)])),
    evoRate: Object.fromEntries(Object.entries(evo).map(([k, v]) => [k, mean(v)])),
    rookieEvo1: evolvedBy(s.season), rookieEvo2: evolvedBy(s.season - 1), rosterMax, floorPaid,
  });
  // offseason to the next preseason
  while (s.phase !== 'preseason' && guard++ < 4000) step();
}

function step(): void {
  if (s.phase === 'regular' || s.phase === 'playoffs') api.playWeekSync(catalog, s);
  else if (s.phase === 'draft') { api.simDraftToUser?.(catalog, s); api.advancePhase(catalog, s); }
  else api.advancePhase(catalog, s);
}

const pad = (x: string | number, n: number) => String(x).padStart(n);
console.log(`Plateau sanity: ${SEASONS} fast-sim seasons, seed ${SEED}\n`);
console.log('Season | Champ | OVR mean p10–p90 | Start OVR | Age  | Legends(FA) | Payroll/cap min–max | <floor (paid up) | >cap | Off-role/16 (unavoid) | NoSet | Roster max (pre)');
for (const r of rows) console.log([pad(r.season, 6), pad(r.champ, 5), `${f1(r.ovrMean)} ${r.ovrP10}–${r.ovrP90}`.padStart(16), pad(f1(r.starterOvr), 9), pad(f1(r.ageMean), 4),
  pad(`${r.legends}(${r.legendsFa})`, 11), pad(`${(r.payMin * 100).toFixed(0)}%–${(r.payMax * 100).toFixed(0)}%`, 19), pad(`${r.belowFloor} (${r.floorPaid})`, 16), pad(r.overCap, 4),
  pad(`${f1(r.offRole)} (${f1(r.unavoidable)})`, 21), pad(r.noSet, 5), pad(r.rosterMax, 16)].join(' | '));
console.log('\nSeason | Injuries/team | DTD/team | Multi-wk starter/team | User stops | Growth act/bkp/prac | Young <=24 act/bkp/prac | Evo rate act/bkp/prac | Rookies evolved (1 season / 2 seasons)');
for (const r of rows) console.log([pad(r.season, 6), pad(f1(r.injPerTeam), 13), pad(f1(r.dtdPerTeam), 8), pad(r.multiWeekStarter.toFixed(2), 21), pad(r.userStops, 10),
  pad(`${f1(r.growth.active)}/${f1(r.growth.backup)}/${f1(r.growth.practice)}`, 19),
  pad(`${f1(r.young.active)}/${f1(r.young.backup)}/${f1(r.young.practice)}`, 23),
  pad(`${(r.evoRate.active * 100).toFixed(0)}/${(r.evoRate.backup * 100).toFixed(0)}/${(r.evoRate.practice * 100).toFixed(0)}%`, 21),
  pad(`${isNaN(r.rookieEvo1) ? '-' : (r.rookieEvo1 * 100).toFixed(0) + '%'} / ${isNaN(r.rookieEvo2) ? '-' : (r.rookieEvo2 * 100).toFixed(0) + '%'}`, 14)].join(' | '));
const champs = new Set(rows.map(r => r.champ));
console.log(`\nChampions: ${rows.map(r => r.champ).join(', ')} (${champs.size} different clubs in ${rows.length} seasons)`);

const bad: string[] = [];
for (const r of rows) {
  if (r.belowFloor || r.overCap) bad.push(`season ${r.season}: payroll outside floor/cap (${r.belowFloor} below, ${r.overCap} over)`);
  if (r.noSet) bad.push(`season ${r.season}: ${r.noSet} fielded slots without a set`);
  if (r.offRole - r.unavoidable > 0.01) bad.push(`season ${r.season}: avoidable off-role slots (${f1(r.offRole)} vs ${f1(r.unavoidable)} unavoidable)`);
  if (r.legends < 4 || r.legends > 14) bad.push(`season ${r.season}: ${r.legends} legendaries on rosters`);
}
if (rows.length >= 4 && champs.size < 2) bad.push('one club won every season');
if (bad.length) { console.log('\nFAIL\n' + bad.map(b => '  ' + b).join('\n')); process.exitCode = 1; }
else console.log('\nOK');
