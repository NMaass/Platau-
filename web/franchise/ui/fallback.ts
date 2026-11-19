// Stand-in implementations of model/api.ts used ONLY while the model agent's
// bodies still throw "not implemented", and always for the ?fixture=1 dev league.
// They follow docs/FRANCHISE.md closely enough for the UI to be exercised; the
// real numbers come from model/api.ts once it is implemented.
import type {
  Catalog, LeagueState, TeamId, MonId, Mon, Role, Lineup, Grade, IvGrade, StatId, Series,
  BattleResult, MonBox, InboxItem,
} from '../types.ts';
import {TIER_BASE} from '../catalog/roles.ts';
import {STRATEGIES} from '../model/strategies.ts';

export const GRADES: Grade[] = ['F', 'D', 'C', 'B', 'A', 'AA', 'AAA'];
/** Growth needed for each grade (docs: F 1–14, D 15–29 ...). */
export const GRADE_AT: Record<Grade, number> = {F: 1, D: 15, C: 30, B: 45, A: 60, AA: 75, AAA: 90};
/** % of the set's EV spread per grade. */
export const GRADE_PCT: Record<Grade, number> = {F: 40, D: 50, C: 60, B: 70, A: 80, AA: 90, AAA: 100};
const EV_ADJ: Record<Grade, number> = {F: -12, D: -9, C: -6, B: -3, A: 0, AA: 2, AAA: 4};
const IV_PTS: Record<IvGrade, number> = {A: 2, B: 0, C: -2, D: -4, F: -6};
export const STATS: StatId[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export {STRATEGIES};

const sp = (c: Catalog, m: Mon) => c.species[m.speciesId];

export function evGrade(_s: LeagueState, mon: Mon): Grade {
  let g: Grade = 'F';
  for (const x of GRADES) if (mon.growth >= GRADE_AT[x]) g = x;
  if (mon.injury?.kind === 'day-to-day') g = GRADES[Math.max(0, GRADES.indexOf(g) - 1)];
  return g;
}
export function ivHeadline(mon: Mon): IvGrade {
  const avg = STATS.reduce((t, k) => t + IV_PTS[mon.ivs[k]], 0) / 6;
  let best: IvGrade = 'B', d = 99;
  for (const [g, p] of Object.entries(IV_PTS) as [IvGrade, number][]) if (Math.abs(p - avg) < d) { d = Math.abs(p - avg); best = g; }
  return best;
}
function ivAdj(c: Catalog, mon: Mon): number {
  const ks = sp(c, mon)?.investedStats ?? [];
  if (!ks.length) return 0;
  return Math.round(ks.reduce((t, k) => t + IV_PTS[mon.ivs[k]], 0) / ks.length);
}
export function roleRating(c: Catalog, s: LeagueState, mon: Mon, role: Role): number | null {
  const rb = sp(c, mon)?.roleBase[role];
  if (!rb) return null;
  return Math.max(1, Math.min(99, rb.base + EV_ADJ[evGrade(s, mon)] + ivAdj(c, mon)));
}
export function roles(c: Catalog, s: LeagueState, mon: Mon): {role: Role; ovr: number; setId: string}[] {
  const rb = sp(c, mon)?.roleBase ?? {};
  return (Object.keys(rb) as Role[]).map((role) => ({role, ovr: roleRating(c, s, mon, role)!, setId: rb[role]!.setId}))
    .sort((a, b) => b.ovr - a.ovr);
}
export function bestRole(c: Catalog, s: LeagueState, mon: Mon): {role: Role; ovr: number} {
  const r = roles(c, s, mon)[0];
  return r ? {role: r.role, ovr: r.ovr} : {role: 'attacker', ovr: 40};
}
export function knownRating(c: Catalog, s: LeagueState, viewer: TeamId, mon: Mon): {role: Role; lo: number; hi: number; exact: boolean} {
  const b = bestRole(c, s, mon);
  if (mon.teamId === viewer || mon.teamId) return {role: b.role, lo: b.ovr, hi: b.ovr, exact: true};
  const pts = mon.scouting?.[viewer] ?? 0;
  const w = pts >= s.settings.fullScoutCost ? 0 : Math.max(2, 16 - pts * 3);
  const lo = Math.max(1, b.ovr - Math.ceil(w * .6)), hi = Math.min(99, b.ovr + Math.floor(w * .4));
  return {role: b.role, lo, hi, exact: w === 0};
}
export const payroll = (s: LeagueState, t: TeamId): number =>
  Object.values(s.mons).filter((m) => m.teamId === t && m.contract).reduce((a, m) => a + m.contract!.salary, 0)
  + s.teams[t].deadMoney.filter((d) => d.season === s.season).reduce((a, d) => a + d.amount, 0);
export const capSpace = (s: LeagueState, t: TeamId): number => s.settings.cap - payroll(s, t);

export function standings(s: LeagueState) {
  const rows = Object.values(s.teams).map((t) => ({teamId: t.id, wins: 0, losses: 0, gameWins: 0, gameLosses: 0, divRank: 0, confSeed: null as number | null, streak: '', _res: [] as string[]}));
  const by = Object.fromEntries(rows.map((r) => [r.teamId, r]));
  for (const se of s.schedule.filter((x) => x.season === s.season && x.winnerId && !x.playoff).sort((a, b) => a.week - b.week)) {
    for (const id of [se.homeId, se.awayId]) {
      const r = by[id], won = se.winnerId === id;
      if (won) r.wins++; else r.losses++;
      r._res.push(won ? 'W' : 'L');
      for (const g of se.games) { if (g.winnerTeamId === id) r.gameWins++; else r.gameLosses++; }
    }
  }
  for (const r of rows) {
    const last = r._res[r._res.length - 1];
    let n = 0; for (let i = r._res.length - 1; i >= 0 && r._res[i] === last; i--) n++;
    r.streak = last ? last + n : '';
  }
  const key = (r: typeof rows[0]) => r.wins * 1000 + (r.gameWins - r.gameLosses);
  for (const conf of [0, 1]) {
    for (const div of [0, 1]) {
      rows.filter((r) => s.teams[r.teamId].conference === conf && s.teams[r.teamId].division === div)
        .sort((a, b) => key(b) - key(a)).forEach((r, i) => { r.divRank = i + 1; });
    }
    const conf6 = rows.filter((r) => s.teams[r.teamId].conference === conf);
    const leaders = conf6.filter((r) => r.divRank === 1).sort((a, b) => key(b) - key(a));
    const wc = conf6.filter((r) => r.divRank !== 1).sort((a, b) => key(b) - key(a))[0];
    leaders.forEach((r, i) => { r.confSeed = i + 1; });
    if (wc) wc.confSeed = 3;
  }
  return rows.sort((a, b) => key(b) - key(a)).map(({_res, ...r}) => r);
}

export function userSeries(s: LeagueState): Series | null {
  return s.schedule.find((x) => x.season === s.season && x.week === s.week && (x.homeId === s.userTeamId || x.awayId === s.userTeamId)) ?? null;
}
export function likelyLineup(_c: Catalog, s: LeagueState, teamId: TeamId): {role: Role; monId: MonId}[] {
  return s.teams[teamId].lineup.slots.filter((x) => x.monId).map((x) => ({role: x.role, monId: x.monId!}));
}

export function advisories(c: Catalog, s: LeagueState) {
  const out: {id: string; kind: 'injury' | 'lineup' | 'offer' | 'scout' | 'contract'; label: string; text: string; action: {label: string; route: string}}[] = [];
  const t = s.teams[s.userTeamId];
  t.lineup.slots.forEach((slot, i) => {
    const m = slot.monId ? s.mons[slot.monId] : null;
    if (m?.injury && m.injury.kind !== 'day-to-day') out.push({id: 'inj-' + m.id, kind: 'injury', label: 'Injury', text: `${c.species[m.speciesId]?.name ?? m.speciesId} is ${m.injury.kind === 'ir' ? 'on injured reserve' : `out ${m.injury.weeksLeft} wk`} and still starts. A backup will be auto-filled.`, action: {label: 'Review', route: '#lineup'}});
    if (!slot.monId) out.push({id: 'slot-' + i, kind: 'lineup', label: 'Lineup', text: `No one fills the ${slot.role} slot. The team plays a Pokémon down.`, action: {label: 'Fix lineup', route: '#lineup'}});
  });
  const se = userSeries(s);
  if (se) {
    const opp = se.homeId === s.userTeamId ? se.awayId : se.homeId;
    out.push({id: 'scout-' + opp, kind: 'scout', label: 'Scouting', text: `Report on ${s.teams[opp].city} ${s.teams[opp].name} is ready.`, action: {label: 'Read report', route: '#opponent'}});
  }
  const exp = Object.values(s.mons).filter((m) => m.teamId === s.userTeamId && m.contract?.yearsLeft === 1);
  if (exp.length) out.push({id: 'exp', kind: 'contract', label: 'Contracts', text: `${exp.length} contracts expire after this season.`, action: {label: 'Contracts', route: '#roster?lens=contracts'}});
  return out;
}

// ---- actions
export function setStrategy(c: Catalog, s: LeagueState, teamId: TeamId, strategyId: string): void {
  s.teams[teamId].lineup.strategyId = strategyId;
  s.teams[teamId].lineup = autoLineup(c, s, teamId);
}
export function autoLineup(c: Catalog, s: LeagueState, teamId: TeamId): Lineup {
  const t = s.teams[teamId];
  const strat = STRATEGIES.find((x) => x.id === t.lineup.strategyId) ?? STRATEGIES[0];
  const pool = Object.values(s.mons).filter((m) => m.teamId === teamId && (m.tier === 'active' || m.tier === 'backup') && !(m.injury && m.injury.kind !== 'day-to-day'));
  const used = new Set<MonId>();
  const fit = (m: Mon, rs: Role[]) => Math.max(-1, ...rs.map((r) => roleRating(c, s, m, r) ?? -1));
  const slots = strat.slots.map((rs) => {
    const ranked = pool.filter((m) => fit(m, rs) > 0).sort((a, b) => fit(b, rs) - fit(a, rs));
    const pick = ranked.find((m) => !used.has(m.id)) ?? null;
    if (pick) used.add(pick.id);
    const role = pick ? rs.find((r) => roleRating(c, s, pick, r) === fit(pick, rs))! : rs[0];
    return {role, monId: pick?.id ?? null, backups: [] as MonId[], setId: pick ? c.species[pick.speciesId]?.roleBase[role]?.setId : undefined};
  });
  slots.forEach((sl, i) => {
    const rs = strat.slots[i];
    sl.backups = pool.filter((m) => !used.has(m.id) && fit(m, rs) > 0).sort((a, b) => fit(b, rs) - fit(a, rs)).slice(0, 2).map((m) => m.id);
  });
  return {strategyId: strat.id, slots, auto: true};
}
export function assignSlot(s: LeagueState, teamId: TeamId, slotIndex: number, monId: MonId | null): void {
  const L = s.teams[teamId].lineup;
  const prev = L.slots[slotIndex].monId;
  const j = monId ? L.slots.findIndex((x) => x.monId === monId) : -1;
  if (j > -1 && j !== slotIndex) L.slots[j].monId = prev;
  L.slots[slotIndex].monId = monId;
  L.slots[slotIndex].backups = L.slots[slotIndex].backups.filter((b) => b !== monId);
  L.auto = false;
}
export function setMonSet(s: LeagueState, monId: MonId, setId: string): void { s.mons[monId].setId = setId; }
export function moveTier(s: LeagueState, monId: MonId, tier: Mon['tier']): void { s.mons[monId].tier = tier; }

// ---- fake week (fixture only): random results with plausible box scores
function rnd(s: LeagueState): number {
  let t = (s.rngState = (s.rngState + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function starters(s: LeagueState, teamId: TeamId): MonId[] {
  return s.teams[teamId].lineup.slots.map((x) => x.monId).filter((x): x is MonId => !!x);
}
export function fakeGame(c: Catalog, s: LeagueState, se: Series, g: number): BattleResult {
  const a = starters(s, se.homeId), b = starters(s, se.awayId);
  const str = (ids: MonId[]) => ids.reduce((t, id) => t + bestRole(c, s, s.mons[id]).ovr, 0);
  const pHome = 0.5 + (str(a) - str(b)) / 400;
  const winner = rnd(s) < pHome ? se.homeId : se.awayId;
  const box: Record<MonId, MonBox> = {};
  const winIds = winner === se.homeId ? a : b, loseIds = winner === se.homeId ? b : a;
  const survivors = 1 + Math.floor(rnd(s) * 3);
  loseIds.forEach((id) => { box[id] = {teamId: s.mons[id].teamId!, played: true, kos: 0, fainted: true, damageDealt: Math.round(rnd(s) * 180), damageTaken: 100, statusInflicted: rnd(s) < .2 ? 1 : 0, hazardsSet: 0, hazardsRemoved: 0}; });
  winIds.forEach((id, i) => { box[id] = {teamId: s.mons[id].teamId!, played: true, kos: 0, fainted: i >= survivors, damageDealt: Math.round(rnd(s) * 200), damageTaken: i >= survivors ? 100 : Math.round(rnd(s) * 90), statusInflicted: rnd(s) < .2 ? 1 : 0, hazardsSet: i === 0 ? 1 : 0, hazardsRemoved: 0}; });
  for (let k = 0; k < loseIds.length; k++) box[winIds[Math.floor(rnd(s) * winIds.length)]].kos++;
  for (let k = 0; k < winIds.length - survivors; k++) box[loseIds[Math.floor(rnd(s) * loseIds.length)]].kos++;
  return {id: `${se.id}-g${g + 1}`, winnerTeamId: winner, turns: 18 + Math.floor(rnd(s) * 25), box, summary: ''};
}
export function finishSeries(c: Catalog, s: LeagueState, se: Series): void {
  const w: Record<string, number> = {};
  se.games.forEach((g) => { w[g.winnerTeamId] = (w[g.winnerTeamId] ?? 0) + 1; });
  se.winnerId = (w[se.homeId] ?? 0) > (w[se.awayId] ?? 0) ? se.homeId : se.awayId;
  const tot: Record<MonId, {kos: number; dmg: number}> = {};
  for (const g of se.games) for (const [id, b] of Object.entries(g.box)) {
    tot[id] ??= {kos: 0, dmg: 0}; tot[id].kos += b.kos; tot[id].dmg += b.damageDealt;
  }
  const mvp = Object.entries(tot).filter(([id]) => s.mons[id].teamId === se.winnerId).sort((a, b) => (b[1].kos - a[1].kos) || (b[1].dmg - a[1].dmg))[0];
  se.mvpMonId = mvp?.[0];
  const T = (id: TeamId) => s.teams[id];
  const loser = se.winnerId === se.homeId ? se.awayId : se.homeId;
  const mvpName = mvp ? c.species[s.mons[mvp[0]].speciesId]?.name : '';
  se.summary = `${T(se.winnerId).name} beat ${T(loser).name} ${w[se.winnerId]}–${w[loser] ?? 0}.` + (mvp ? ` ${mvpName} led the way with ${mvp[1].kos} KOs.` : '');
  se.games.forEach((g, i) => {
    const top = Object.entries(g.box).filter(([, b]) => b.teamId === g.winnerTeamId).sort((a, b) => b[1].kos - a[1].kos)[0];
    const left = Object.values(g.box).filter((b) => b.teamId === g.winnerTeamId && !b.fainted).length;
    g.summary = `${top ? c.species[s.mons[top[0]].speciesId]?.name + ` took ${top[1].kos} KO${top[1].kos === 1 ? '' : 's'}` : 'Close game'}; ${T(g.winnerTeamId).name} won with ${left} left.`;
    void i;
  });
}
export function fakeFinishWeek(c: Catalog, s: LeagueState): void {
  const played = s.schedule.filter((x) => x.season === s.season && x.week === s.week);
  for (const m of Object.values(s.mons)) {
    if (!m.teamId) continue;
    const gain = m.tier === 'active' ? 2 : m.tier === 'backup' ? 1 : 1;
    m.growth = Math.min(100, m.growth + gain);
    if (m.injury) { m.injury.weeksLeft--; if (m.injury.weeksLeft < 0) m.injury = null; }
  }
  const us = played.find((x) => x.homeId === s.userTeamId || x.awayId === s.userTeamId);
  if (us) {
    const item: InboxItem = {id: 'n' + s.nextId++, season: s.season, week: s.week, category: 'league', title: us.winnerId === s.userTeamId ? 'Series won' : 'Series lost', body: us.summary ?? '', ref: {kind: 'series', id: us.id}, read: false};
    s.inbox.unshift(item);
  }
  s.week++;
  if (s.week > s.settings.weeks) s.phase = 'playoffs';
}

export {TIER_BASE};
