// Hash routes: "#roster", "#mon-m12", "#battle-<seriesId>-<game>", with optional "?k=v" params.
export interface Route { path: string; arg: string; params: URLSearchParams; hash: string }

export function parse(hash = location.hash): Route {
  const h = (hash || '#week').slice(1);
  const [p, q = ''] = h.split('?');
  const params = new URLSearchParams(q);
  for (const pre of ['mon-', 'battle-', 'team-']) if (p.startsWith(pre)) return {path: pre.slice(0, -1), arg: p.slice(pre.length), params, hash: '#' + h};
  return {path: p || 'week', arg: '', params, hash: '#' + h};
}

export const go = (hash: string): void => { if (location.hash === hash) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };

export interface Room { k: string; label: string; icon: string; tabs: [string, string][] }
export const ROOMS: Room[] = [
  {k: 'team', label: 'Team', icon: 'home', tabs: [['week', 'This week'], ['roster', 'Roster'], ['lineup', 'Lineup']]},
  {k: 'moves', label: 'Moves', icon: 'swap', tabs: [['trades', 'Trades'], ['freeagents', 'Free agents'], ['offers', 'Offers']]},
  {k: 'draft', label: 'Draft', icon: 'scout', tabs: [['scouting', 'Scouting'], ['draft', 'Draft']]},
  {k: 'league', label: 'League', icon: 'trophy', tabs: [['standings', 'Standings'], ['playoffs', 'Playoffs'], ['schedule', 'Schedule'], ['history', 'History']]},
];
/** Pages outside the tab sets, and which room/tab they belong to. */
const EXTRA: Record<string, [string, string | null]> = {
  mon: ['team', 'roster'], opponent: ['team', 'week'], battle: ['team', 'week'], settings: ['settings', null], new: ['settings', null], team: ['league', 'standings'],
};
export function roomOf(path: string): {room: string; tab: string | null} {
  const r = ROOMS.find((x) => x.tabs.some((t) => t[0] === path));
  if (r) return {room: r.k, tab: path};
  const e = EXTRA[path];
  return e ? {room: e[0], tab: e[1]} : {room: 'team', tab: null};
}
