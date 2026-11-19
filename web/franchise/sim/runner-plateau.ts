// Plateau's copy of the minimal battle loop from web/battle/runner.ts, with the
// format as a parameter. Rollmon's FORMAT carries "Adjust Level = 100", which
// rewrites every Pokémon to level 100; Plateau needs per-mon levels (rookies at
// 74, Little Cup at 5), so its format drops that rule. web/battle/ stays
// untouched for Rollmon. Decision logic (MCTS -> pickChoice, Revival Blessing
// target, random fallback) is the same as runBattle's.
import {Battle, Dex, extractChannelMessages, type PokemonSet, type PRNGSeed} from '@pkmn/sim';
import {battleToEngineState} from '../../battle/engine-state.ts';
import {legalChoices, needsDecision, pickChoice, requestOf, type MctsResult} from '../../battle/driver.ts';
import {mulberry32, RULES, type Engine, type Outcome, type SideId, type Team} from '../../battle/runner.ts';

/** Rollmon's rules minus "Adjust Level = 100": each set's own `Level:` stands. */
export const PLATEAU_RULES = RULES.filter((r) => !/^adjust level/i.test(r));
export const PLATEAU_FORMAT = `gen9customgame@@@${PLATEAU_RULES.join(',')}`;

export interface PlateauBattleConfig {
  engine: Engine;
  p1: Team;
  p2: Team;
  seed?: number;
  budgetMs: {p1: number; p2: number};
  format?: string;
  /** hard cap on decisions loop iterations (a stalled battle ends with a problem) */
  maxSteps?: number;
}

export interface PlateauOutcome extends Outcome {
  /** the sim's name for each set, in team order: protocol idents are `p1a: <name>` */
  names: {p1: string[]; p2: string[]};
}

/**
 * Nicknames that are unique within a side, so protocol idents map back to a
 * team slot. Keeps a set's own nickname; two members that would share a name
 * (same base species, or a repeated nickname) get "Name 2", "Name 3". A
 * nickname equal to the species string is reset by the sim, hence the space.
 */
export function uniqueNicknames(team: PokemonSet[]): PokemonSet[] {
  const used = new Map<string, number>();
  return team.map((m) => {
    const sp = Dex.species.get(m.species);
    const base = (m.name || sp.baseSpecies || m.species).slice(0, 18);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    if (n === 1) return m;
    // a forme twin keeps Rollmon's readable "Arceus Fairy" when free
    const forme = !m.name && sp.forme ? `${sp.baseSpecies} ${sp.forme}`.slice(0, 18) : '';
    if (forme && !used.has(forme)) { used.set(forme, 1); return {...m, name: forme}; }
    return {...m, name: `${base.slice(0, 15)} ${n}`};
  });
}

function omniscientLines(raw: string[]): string[] {
  return extractChannelMessages(raw.join('\n'), [-1])[-1].filter((l) => !l.startsWith('|debug|') && l !== '');
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function runPlateauBattle(cfg: PlateauBattleConfig): PlateauOutcome {
  const seedNum = cfg.seed ?? 1;
  const rng = mulberry32(seedNum);
  const seed = `sodium,${(seedNum >>> 0).toString(16).padStart(16, '0')}` as PRNGSeed;
  const battle = new Battle({formatid: (cfg.format ?? PLATEAU_FORMAT) as never, seed, strictChoices: true});
  battle.setPlayer('p1', {name: cfg.p1.name, team: uniqueNicknames(cfg.p1.team)} as never);
  battle.setPlayer('p2', {name: cfg.p2.name, team: uniqueNicknames(cfg.p2.team)} as never);
  const names = {p1: battle.sides[0].pokemon.map((p) => p.name), p2: battle.sides[1].pokemon.map((p) => p.name)};

  let fallbacks = 0;
  const problems: string[] = [];
  const choices: {side: SideId; choice: string}[] = [];
  const t0 = now();
  const randomLegal = (legal: Map<string, string>) => { const all = [...legal.values()]; return all[Math.floor(rng() * all.length)]; };

  const decide = (id: SideId, legal: Map<string, string>, state: () => string): string => {
    const revives = [...legal.keys()].filter((k) => k.startsWith('revive:'));
    if (revives.length) {
      const side = battle.sides[id === 'p1' ? 0 : 1];
      const best = revives.reduce((a, b) => (side.pokemon[Number(a.slice(7))].species.bst >= side.pokemon[Number(b.slice(7))].species.bst ? a : b));
      return legal.get(best)!;
    }
    if (legal.size === 1) return [...legal.values()][0];
    try {
      const result: MctsResult = JSON.parse(cfg.engine.mcts(state(), cfg.budgetMs[id], 0));
      const pick = pickChoice(id === 'p1' ? result.s1 : result.s2, legal, rng);
      if (pick.source === 'fallback') { fallbacks++; problems.push(`fallback turn ${battle.turn} ${id}: ${pick.reason}`); }
      return pick.choice;
    } catch (err) {
      fallbacks++;
      problems.push(`engine error turn ${battle.turn} ${id}: ${(err as Error).message}`);
      return randomLegal(legal);
    }
  };

  let guard = 0;
  const maxSteps = cfg.maxSteps ?? 5000;
  loop: while (!battle.ended) {
    if (guard++ >= maxSteps) { problems.push(`step limit ${maxSteps} reached at turn ${battle.turn}`); break; }
    const reqs = battle.sides.map((s) => requestOf(s));
    if (reqs.some((r) => r?.teamPreview)) {
      for (const side of battle.sides) if (!side.isChoiceDone()) battle.choose(side.id, 'default');
      continue;
    }
    const pending = battle.sides.filter((s, i) => needsDecision(reqs[i]) && !s.isChoiceDone());
    if (pending.length === 0) {
      problems.push(`stuck at turn ${battle.turn}`);
      break;
    }
    let stateCache: string | null = null;
    const state = () => (stateCache ??= battleToEngineState(battle, {p1ForceSwitch: !!reqs[0]?.forceSwitch, p2ForceSwitch: !!reqs[1]?.forceSwitch}));
    for (const side of pending) {
      const id = side.id as SideId;
      const legal = legalChoices(requestOf(side) as never);
      let choice = decide(id, legal, state);
      if (!battle.choose(id, choice)) {
        problems.push(`sim rejected '${choice}' for ${id} on turn ${battle.turn}`);
        const retry = [...legal.values()].find((c) => c !== choice);
        if (retry === undefined || !battle.choose(id, retry)) { problems.push('no accepted choice; aborting'); break loop; }
        choice = retry;
        fallbacks++;
      }
      choices.push({side: id, choice});
    }
  }
  const log = omniscientLines(battle.log);
  return {
    winner: battle.winner ?? '(none)',
    turns: battle.turn,
    ms: Math.round(now() - t0),
    megas: log.filter((l) => l.startsWith('|-mega|')).length,
    fallbacks, problems, log, choices, names,
  };
}
