// Per-Pokémon box scores from an omniscient Showdown protocol log (the
// runner's Outcome.log). Pure: no sim, no engine; the idents in the log are
// mapped back to team slots by the sim's names (runner-plateau `names`).
//
// Attribution rules:
// - Direct damage (no [from]) goes to the user of the current |move| when it
//   is on the other side.
// - [from] ... [of] <opponent> (Rough Skin, Rocky Helmet, Bad Dreams, partial
//   trap) goes to the [of] mon.
// - Residual damage goes to whoever caused it, when derivable: poison/burn to
//   the status inflicter, Stealth Rock/Spikes to the hazard setter, Leech Seed/
//   Curse/Salt Cure/partial traps to the user that started them, sand/hail to
//   the weather setter. Otherwise nobody.
// - endStatus is the Showdown status id of a mon still standing (brn/par/psn/
//   tox/slp/frz), undefined if healthy or fainted (see `fainted`).
// - hazardsSet counts layers; hazardsRemoved counts hazards cleared (Rapid
//   Spin, Defog, Mortal Spin, Tidy Up, Court Change, Toxic Spikes absorbed).
// - A KO goes to the source of the damage that took the target to 0 HP (or
//   the Destiny Bond user). Self-KOs (recoil, Explosion, Life Orb) credit nobody.
import type {MonBox, MonId, TeamId} from '../types.ts';

export type Side = 'p1' | 'p2';
export interface BoxSide { teamId: TeamId; monIds: MonId[]; names: string[] }
export interface BoxInput { p1: BoxSide; p2: BoxSide }

export const HAZARDS = ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'];

const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const otherSide = (s: Side): Side => (s === 'p1' ? 'p2' : 'p1');

/** "p1a: Name" -> {side, pos, name}; "p1: Name" (no position) also accepted. */
export function parseIdent(ident: string): {side: Side; pos: string; name: string} | null {
  const m = /^(p[12])([a-z]?):\s?(.*)$/.exec(ident.trim());
  return m ? {side: m[1] as Side, pos: m[2], name: m[3]} : null;
}

/** HP as percent of max from a condition string ("141/297 par", "48/100", "0 fnt"). */
export function hpPercent(condition: string): number {
  const hp = condition.trim().split(/\s+/)[0];
  if (!hp.includes('/')) return 0;
  const [cur, max] = hp.split('/', 2).map(Number);
  if (!Number.isFinite(cur) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (100 * cur) / max));
}
const statusOf = (condition: string) => condition.trim().split(/\s+/)[1];

interface Mon { side: Side; index: number }
const key = (m: Mon) => `${m.side}${m.index}`;

/** Tags like "[from] item: Life Orb" / "[of] p1a: X" from a split line's tail. */
function tags(parts: string[]): {from?: string; of?: string} {
  const out: {from?: string; of?: string} = {};
  for (const p of parts) {
    if (p.startsWith('[from]')) out.from = p.slice(6).trim();
    else if (p.startsWith('[of]')) out.of = p.slice(4).trim();
  }
  return out;
}
/** "move: Leech Seed" / "ability: Rough Skin" / "Stealth Rock" -> "leechseed" etc. */
const effectId = (s: string) => toId(s.replace(/^(move|ability|item):\s*/i, ''));

export function boxScore(log: string[], input: BoxInput): Record<MonId, MonBox> {
  const box: Record<MonId, MonBox> = {};
  const boxes: Record<Side, MonBox[]> = {p1: [], p2: []};
  for (const s of ['p1', 'p2'] as Side[]) {
    for (const id of input[s].monIds) {
      const b: MonBox = {teamId: input[s].teamId, played: false, kos: 0, fainted: false, damageDealt: 0, damageTaken: 0, statusInflicted: 0, hazardsSet: 0, hazardsRemoved: 0};
      box[id] = b;
      boxes[s].push(b);
    }
  }
  const byName: Record<Side, Map<string, number>> = {p1: new Map(), p2: new Map()};
  for (const s of ['p1', 'p2'] as Side[]) input[s].names.forEach((n, i) => { if (!byName[s].has(n)) byName[s].set(n, i); });

  const active = new Map<string, number>();              // "p1a" -> team index
  const hp = new Map<string, number>();                  // mon key -> percent
  const status = new Map<string, string>();              // mon key -> status id
  const statusSrc = new Map<string, Mon | null>();       // who inflicted the current status
  const volatileSrc = new Map<string, Mon>();            // `${monKey}|${effect}` -> source
  const hazardSrc = new Map<string, Mon>();              // `${side}|${hazard}` -> setter
  const hazardOn = new Set<string>();                    // `${side}|${hazard}` currently up
  const weatherSrc = new Map<string, Mon>();             // weather id -> setter
  const zeroBy = new Map<string, Mon | null>();          // mon key -> source of the hit that took it to 0
  const switchedIn = new Set<string>();                  // mon keys that switched in since the current move
  let mover: Mon | null = null;
  let abilityUser: Mon | null = null;                    // last "-activate|X|ability: ..." in this action (Toxic Debris)
  let destinyBond: Mon | null = null;

  const resolve = (ident: string | undefined): Mon | null => {
    if (!ident) return null;
    const p = parseIdent(ident);
    if (!p) return null;
    if (p.pos) {
      const a = active.get(`${p.side}${p.pos}`);
      if (a !== undefined) return {side: p.side, index: a};
    }
    const i = byName[p.side].get(p.name);
    return i === undefined ? null : {side: p.side, index: i};
  };
  const boxOf = (m: Mon): MonBox | undefined => boxes[m.side][m.index];
  const opp = (src: Mon | null | undefined, target: Mon): Mon | null => (src && src.side !== target.side ? src : null);

  /** Who caused this damage/status line to `target`, if an opponent did. */
  const sourceOf = (target: Mon, t: {from?: string; of?: string}, kind: 'damage' | 'status'): Mon | null => {
    const of = resolve(t.of);
    if (t.from) {
      if (of) return opp(of, target);
      const e = effectId(t.from);
      if (e === 'psn' || e === 'tox' || e === 'brn') return opp(statusSrc.get(key(target)), target);
      if (HAZARDS.includes(e) || e === 'gmaxsteelsurge') return opp(hazardSrc.get(`${target.side}|${e}`), target);
      if (e === 'sandstorm' || e === 'hail') return opp(weatherSrc.get(e), target);
      const v = volatileSrc.get(`${key(target)}|${e}`);
      if (v) return opp(v, target);
      if (/^item:/i.test(t.from) || e === 'recoil' || e === 'confusion') return null;
      if (/^move:/i.test(t.from) && kind === 'status') return opp(mover, target);
      return null;
    }
    // no tag: the current move's user, unless the target only just arrived
    // (Toxic Spikes poisons a mon that was dragged or switched in)
    if (kind === 'status' && switchedIn.has(key(target))) return opp(hazardSrc.get(`${target.side}|toxicspikes`), target);
    return opp(mover, target);
  };

  for (const line of log) {
    const parts = line.split('|');
    const ev = parts[1];
    if (ev === undefined) continue;
    switch (ev) {
      case 'switch': case 'drag': case 'replace': {
        const p = parseIdent(parts[2] ?? '');
        if (!p) break;
        const i = byName[p.side].get(p.name);
        if (i === undefined) break;
        active.set(`${p.side}${p.pos || 'a'}`, i);
        const m = {side: p.side, index: i};
        const b = boxOf(m);
        if (b) b.played = true;
        if (ev !== 'replace' && parts[4] !== undefined) {
          hp.set(key(m), hpPercent(parts[4]));
          const st = statusOf(parts[4]);
          if (st && st !== 'fnt') status.set(key(m), st);
          switchedIn.add(key(m));
        }
        break;
      }
      case 'move': {
        mover = resolve(parts[2]);
        abilityUser = null;
        switchedIn.clear();
        break;
      }
      case 'turn': case 'upkeep': case 'win': case 'tie':
        mover = null;
        abilityUser = null;
        switchedIn.clear();
        break;
      case '-heal': case '-sethp': {
        const m = resolve(parts[2]);
        if (m && parts[3] !== undefined) hp.set(key(m), hpPercent(parts[3]));
        break;
      }
      case '-damage': {
        const m = resolve(parts[2]);
        if (!m || parts[3] === undefined) break;
        const cur = hpPercent(parts[3]);
        const prev = hp.get(key(m)) ?? 100;
        hp.set(key(m), cur);
        const dealt = Math.max(0, prev - cur);
        const src = sourceOf(m, tags(parts.slice(4)), 'damage');
        const tb = boxOf(m);
        if (tb) tb.damageTaken += dealt;
        if (src && dealt > 0) { const sb = boxOf(src); if (sb) sb.damageDealt += dealt; }
        if (cur === 0) zeroBy.set(key(m), src);
        break;
      }
      case '-status': {
        const m = resolve(parts[2]);
        if (!m) break;
        const src = sourceOf(m, tags(parts.slice(4)), 'status');
        status.set(key(m), parts[3] ?? '');
        statusSrc.set(key(m), src);
        if (src) { const sb = boxOf(src); if (sb) sb.statusInflicted++; }
        break;
      }
      case '-curestatus': {
        const m = resolve(parts[2]);
        if (m) { status.delete(key(m)); statusSrc.delete(key(m)); }
        break;
      }
      case '-cureteam': {
        const m = resolve(parts[2]);
        if (m) for (let i = 0; i < boxes[m.side].length; i++) { status.delete(`${m.side}${i}`); statusSrc.delete(`${m.side}${i}`); }
        break;
      }
      case '-start': case '-activate': {
        const m = resolve(parts[2]);
        if (!m || parts[3] === undefined) break;
        const e = effectId(parts[3]);
        const t = tags(parts.slice(4));
        const src = resolve(t.of) ?? mover;
        if (ev === '-activate' && e === 'destinybond') { destinyBond = m; break; }
        if (ev === '-activate' && /^ability:/i.test(parts[3])) abilityUser = m;
        if (src && src.side !== m.side) volatileSrc.set(`${key(m)}|${e}`, src);
        break;
      }
      case '-weather': {
        const e = effectId(parts[2] ?? '');
        const t = tags(parts.slice(3));
        if (parts.includes('[upkeep]')) break;
        const src = resolve(t.of) ?? mover;
        if (src) weatherSrc.set(e, src); else weatherSrc.delete(e);
        break;
      }
      case '-sidestart': {
        const side = (parts[2] ?? '').slice(0, 2) as Side;
        const e = effectId(parts[3] ?? '');
        if (!HAZARDS.includes(e)) break;
        hazardOn.add(`${side}|${e}`);
        let src = resolve(tags(parts.slice(4)).of) ?? mover;
        if ((!src || src.side === side) && abilityUser && abilityUser.side !== side) src = abilityUser;
        if (src && src.side !== side) {
          hazardSrc.set(`${side}|${e}`, src);
          const sb = boxOf(src);
          if (sb) sb.hazardsSet++;
        }
        break;
      }
      case '-sideend': {
        const side = (parts[2] ?? '').slice(0, 2) as Side;
        const e = effectId(parts[3] ?? '');
        if (!HAZARDS.includes(e)) break;
        hazardSrc.delete(`${side}|${e}`);
        hazardOn.delete(`${side}|${e}`);
        const src = resolve(tags(parts.slice(4)).of) ?? mover;
        if (src) { const sb = boxOf(src); if (sb) sb.hazardsRemoved++; }
        break;
      }
      case '-swapsideconditions': {
        // Court Change: the user's side's hazards go to the foe; counts as removal
        if (mover) {
          const own = HAZARDS.filter((h) => hazardSrc.has(`${mover!.side}|${h}`) || hazardOn.has(`${mover!.side}|${h}`));
          const sb = boxOf(mover);
          if (sb) sb.hazardsRemoved += own.length;
        }
        const swapped = new Map<string, Mon>();
        for (const [k, v] of hazardSrc) swapped.set(`${otherSide(k.slice(0, 2) as Side)}${k.slice(2)}`, mover ?? v);
        hazardSrc.clear();
        for (const [k, v] of swapped) hazardSrc.set(k, v);
        const on = [...hazardOn].map((k) => `${otherSide(k.slice(0, 2) as Side)}${k.slice(2)}`);
        hazardOn.clear();
        for (const k of on) hazardOn.add(k);
        break;
      }
      case 'faint': {
        const m = resolve(parts[2]);
        if (!m) break;
        const b = boxOf(m);
        if (b) b.fainted = true;
        hp.set(key(m), 0);
        let killer = zeroBy.has(key(m)) ? zeroBy.get(key(m))! : null;
        if (!zeroBy.has(key(m)) && destinyBond && destinyBond.side !== m.side) killer = destinyBond;
        zeroBy.delete(key(m));
        if (killer && killer.side !== m.side) { const kb = boxOf(killer); if (kb) kb.kos++; }
        if (destinyBond && killer === destinyBond) destinyBond = null;
        break;
      }
    }
    if (ev === 'turn') destinyBond = null;
  }

  for (const s of ['p1', 'p2'] as Side[]) {
    boxes[s].forEach((b, i) => {
      b.damageDealt = round1(b.damageDealt);
      b.damageTaken = round1(b.damageTaken);
      const st = status.get(`${s}${i}`);
      if (!b.fainted && st) b.endStatus = st;
    });
  }
  return box;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
