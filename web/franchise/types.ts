// Plateau shared contract. Every module under web/franchise/ codes against these
// types; change them only by adding optional fields unless you own the module
// that consumes them (see docs/FRANCHISE.md for the rules behind each field).
// Node 22/24 type stripping: no enums, no namespaces, `.ts` import extensions.

// ---------------------------------------------------------------- catalog (static data)
export type StatId = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type StatTable = Record<StatId, number>;
export type Grade = 'F' | 'D' | 'C' | 'B' | 'A' | 'AA' | 'AAA';
export type IvGrade = 'F' | 'D' | 'C' | 'B' | 'A';
export type Weather = 'rain' | 'sun' | 'sand' | 'snow';

/** Specific roles derived from set data. Short badge codes live in ROLE_ABBR (catalog/roles.ts). */
export type Role =
  | 'rocks' | 'spikes' | 'screens'
  | 'rain-setter' | 'sun-setter' | 'sand-setter' | 'snow-setter'
  | 'rain-abuser' | 'sun-abuser' | 'sand-abuser' | 'snow-abuser'
  | 'remover' | 'pivot' | 'sweeper' | 'wallbreaker' | 'attacker' | 'wall' | 'phazer';

export type Rarity = 'legendary' | 'mythical' | 'pseudo' | 'common';
export type GrowthRate = 'fast' | 'medium-fast' | 'medium-slow' | 'slow' | 'erratic' | 'fluctuating';

export interface CatalogSet {
  id: string;            // stable: `${speciesId}:${slug(name)}`
  name: string;          // Smogon set name, e.g. "Swords Dance"
  tier: string;          // Smogon tier the set is from ("OU", "UU", ..., "Randbats")
  source: 'smogon' | 'randbats' | 'generated';
  moves: string[];       // Showdown display names, max 4
  ability: string;
  item: string;
  nature: string;
  evs: Partial<StatTable>;  // the full (AAA = 100%) spread
  roles: Role[];         // derived from moves/ability/item + randbats role label
  /** where the set came from, e.g. "SV OU", "Player set", "Gen 9 Random Battle (level 74)", "Adapted from Garchomp: ..." */
  format?: string;
  /** non-31 IVs the source set asks for (e.g. {spe: 0} on Trick Room sets) */
  ivs?: Partial<StatTable>;
}

export interface CatalogSpecies {
  id: string;            // Showdown id, e.g. "garchomp"
  name: string;          // "Garchomp"
  num: number;           // national dex number
  types: string[];
  baseStats: StatTable;
  bst: number;
  battleLevel: number;   // randbats level (64..100), see docs/FRANCHISE.md
  rarity: Rarity;
  growthRate: GrowthRate;
  /** evolutions: species id and the Growth level it happens at (level-equivalent for stones/trades) */
  evolvesTo: {id: string; level: number}[];
  evolvesFrom?: string;
  /** base of the family (for rarity-pool counts) */
  family: string;
  sets: CatalogSet[];
  /** best rating base per role (from the best tier with a set filling it) */
  roleBase: Partial<Record<Role, {base: number; tier: string; setId: string}>>;
  /** stats some set of this species invests EVs in (IV callouts only for these) */
  investedStats: StatId[];
  /** sprite ids for URLs (Showdown sprite id, e.g. "garchomp", "rotom-wash") */
  spriteId: string;
}

export interface Catalog {
  version: string;       // data build stamp
  species: Record<string, CatalogSpecies>;
  /** item names used by sets that the engine does not know (the runner searches them as no item) */
  engineUnknownItems?: string[];
}

// ---------------------------------------------------------------- league state (saved)
export type TeamId = string;   // e.g. "t0".."t15"
export type MonId = string;    // unique per individual, e.g. "m123"
export type RosterTier = 'active' | 'backup' | 'practice' | 'ir';
export type InjuryKind = 'day-to-day' | 'out' | 'ir';

export interface Injury {
  kind: InjuryKind;
  weeksLeft: number;      // 0 for day-to-day that clears after next series
  description: string;    // "Burned out", "Sprained wing" (template-generated)
  severe?: {ivLost?: StatId; gradeCap?: Grade};
  sinceWeek: number; season: number;
}

export interface Contract {
  salary: number;         // $ per season (in dollars; UI formats as $4.2M)
  yearsLeft: number;      // including the current season
  signingBonus: number;   // total, prorated over the original length
  originalYears: number;
  guaranteedYears: number;
  rookie?: {round: number; pick: number; fifthYearOption: boolean};
  tagged?: boolean;       // franchise tag
  /** signed under a cap exception (allowed over the cap): minimum deal or rookie scale */
  exception?: 'minimum' | 'rookie';
}

export interface SeasonLine {
  season: number; teamId: TeamId;
  series: number; battles: number; wins: number;
  kos: number; faints: number; damageDealt: number; damageTaken: number;
  statusInflicted: number; hazardsSet: number; hazardsRemoved: number;
  seriesMvps: number;
}

export interface Award { season: number; award: string; teamId: TeamId }

export interface Mon {
  id: MonId;
  speciesId: string;
  teamId: TeamId | null;  // null = free agent / prospect
  tier: RosterTier;
  age: number;
  ivs: Record<StatId, IvGrade>;
  growth: number;         // 1..100 Growth track
  xp: number;             // progress within the current Growth level (0..xpToNext)
  setId: string;          // chosen catalog set for this week
  contract: Contract | null;
  injury: Injury | null;
  fame: number;           // hidden
  potential: Grade;       // hidden ceiling (shown only as a scouted range)
  draft?: {season: number; round: number; pick: number; teamId: TeamId};
  rookieSeason?: number;
  stats: SeasonLine[];
  awards: Award[];
  retired?: {season: number; hallOfFame: boolean};
  /** per-team scouting knowledge: points spent (0..5); 5 = full */
  scouting?: Record<TeamId, number>;
  traits?: string[];      // revealed by scouting: "Maxed Speed", "Especially suited: Pivot"
  /** model bookkeeping (optional, owned by model/) */
  prospect?: number;      // draft season while in a draft class
  gradeCap?: Grade;       // permanent EV grade cap from a severe injury
  tempFor?: MonId;        // signed as the IR replacement for this mon
  faSince?: number;       // season it became a free agent
  askMult?: number;       // free-agent ask multiplier (drops each unsigned FA round)
  family?: string;        // rarity-pool family (returned to the pool on retirement)
}

export interface StrategyDef {
  id: string;             // "hyper-offense"
  name: string;           // "Hyper Offense"
  slots: Role[][];        // 6 slots, each the roles that may fill it (first = preferred)
  weather?: Weather;
}

export interface LineupSlot { role: Role; monId: MonId | null; backups: MonId[]; setId?: string }
export interface Lineup { strategyId: string; slots: LineupSlot[]; auto: boolean }

export interface Team {
  id: TeamId;
  city: string; name: string; abbr: string;
  color: string;          // accent hex
  trainer: string;        // Showdown trainer sprite id
  /** gym type the club leans to (rosters, AI draft); older saves have none */
  gymType?: string;
  /** badge number 1..32: the club's logo (assets/badges/<n>.png) */
  badge?: number;
  /** gym leader's display name */
  leader?: string;
  conference: 0 | 1; division: 0 | 1;
  human: boolean;
  favoriteStrategies: [string, string];
  lineup: Lineup;
  scoutingPoints: number;
  deadMoney: {season: number; amount: number}[];
  draftPicks: DraftPick[];
  savedLineups?: Record<string, LineupSlot[]>;  // the user's manual lineup per strategy, restored on switching back
  tagSeason?: number;        // season the franchise tag was last used
  /** this week's goal (model/goals.ts): bonus XP when met */
  weeklyGoal?: {kind: 'win-series' | 'sweep' | 'kos' | 'hazards'; text: string; monId?: MonId; target: number; week: number};
}

export interface DraftPick { season: number; round: number; originalTeamId: TeamId; ownerTeamId: TeamId }

export interface BattleResult {
  id: string;
  winnerTeamId: TeamId;
  turns: number;
  /** protocol log; kept for the user's games and the last N weeks, else dropped */
  log?: string[];
  box: Record<MonId, MonBox>;
  /** team-level KO tally etc. for summaries */
  summary: string;
}

export interface MonBox {
  teamId: TeamId; played: boolean; kos: number; fainted: boolean;
  damageDealt: number; damageTaken: number; statusInflicted: number;
  hazardsSet: number; hazardsRemoved: number; endStatus?: string;
}

export interface Series {
  id: string;
  season: number; week: number;   // playoffs use week 15+ (15 = round 1, 16 = conf final, 17 = Plateau final)
  homeId: TeamId; awayId: TeamId;
  bestOf: number;
  games: BattleResult[];
  winnerId?: TeamId;
  mvpMonId?: MonId;
  summary?: string;               // template-generated recap
  playoff?: 'round1' | 'conference' | 'final';
}

export type Phase =
  | 'preseason' | 'regular' | 'playoffs' | 'awards' | 'draft-lottery' | 'draft'
  | 'resign' | 'free-agency';

export interface InboxItem {
  id: string; season: number; week: number;
  category: 'health' | 'growth' | 'decline' | 'deal' | 'league' | 'honour' | 'scout';
  title: string; body: string;
  ref?: {kind: 'mon' | 'series' | 'trade' | 'team'; id: string};
  read: boolean;
}

export interface TradeOffer {
  id: string; fromTeamId: TeamId; toTeamId: TeamId;
  give: {mons: MonId[]; picks: DraftPick[]};
  get: {mons: MonId[]; picks: DraftPick[]};
  expiresWeek: number; status: 'open' | 'accepted' | 'declined' | 'expired';
}

export interface LeagueSettings {
  cap: number; capGrowth: number; floor: number; minSalary: number; maxSalaryPct: number;
  /** injury chance per fainted Pokémon / per Pokémon ending a battle with a status */
  injuryKo: number; injuryStatus: number;
  /** share of injuries that are day-to-day, and that go to injured reserve (the rest: out 1–3 weeks) */
  injuryDayToDay: number; injuryIr: number;
  budgetMs: {ai: number; human: number};
  seriesBestOf: number; finalBestOf: number;
  scoutingPointsPerWeek: number; scoutCost: number; fullScoutCost: number;
  tradeDeadlineWeek: number; weeks: number;
}

export interface LeagueState {
  schemaVersion: 1;
  id: string; name: string; createdAt: number;
  seed: number; rngState: number;
  season: number; week: number; phase: Phase;
  settings: LeagueSettings;
  userTeamId: TeamId;
  teams: Record<TeamId, Team>;
  mons: Record<MonId, Mon>;
  schedule: Series[];                 // every series of the current season (played ones carry games)
  history: SeasonSummary[];
  inbox: InboxItem[];
  offers: TradeOffer[];
  draft?: DraftState;
  pool: Record<string, number>;       // rarity pool: species family id -> remaining count
  nextId: number;
  log: Transaction[];
  faRound?: number;                   // free-agency rounds completed this offseason (0..3)
  /** set by finishWeek: reasons a multi-week sim should stop (starter hurt long-term, strong offer) */
  pauseReasons?: string[];
}

export interface Transaction { season: number; week: number; kind: string; text: string; teamIds: TeamId[]; monIds: MonId[] }

export interface DraftState {
  season: number;
  order: DraftPick[];                 // in pick order
  prospects: MonId[];
  picks: {pick: DraftPick; monId: MonId}[];
  lottery?: {teamId: TeamId; odds: number; result: number}[];
  /** the league-start draft (season 0, 18 snake rounds, the whole starting pool as the board) */
  startup?: boolean;
}

export interface SeasonSummary {
  season: number; championId: TeamId; runnerUpId: TeamId;
  awards: {award: string; monId: MonId; teamId: TeamId}[];
  standings: {teamId: TeamId; wins: number; losses: number}[];
}

// ---------------------------------------------------------------- sim jobs (model <-> worker pool)
/** One battle to simulate: Showdown export text per side, plus how mons map to idents. */
export interface BattleJob {
  id: string;
  p1: {teamId: TeamId; name: string; trainer: string; export: string; monIds: MonId[]};
  p2: {teamId: TeamId; name: string; trainer: string; export: string; monIds: MonId[]};
  seed: number;
  budgetMs: {p1: number; p2: number};
  keepLog: boolean;
}

export interface BattleJobResult {
  id: string;
  winner: 'p1' | 'p2';
  turns: number;
  log: string[];                    // always returned; caller decides to keep it
  box: Record<MonId, MonBox>;       // keyed by monIds given in the job (slot order)
  problems: string[];
}

export interface SimPool {
  run(jobs: BattleJob[], onDone?: (r: BattleJobResult) => void): Promise<BattleJobResult[]>;
  size: number;
}
