# Plateau

A browser-only, single-player Pokémon franchise GM sim (Football GM / Pokémon All22 style). You run one of
16 clubs, the gym cities of Generations 1–4 (Kanto and Johto in the Indigo Conference, Hoenn and Sinnoh in the
Lily of the Valley Conference; each club's logo is its gym badge and it leans to its gym's type), over many seasons: set a strategy and lineup, scout, trade, draft, re-sign and sign free agents.
Every battle is a real Showdown battle, played in Web Workers by Rollmon's engine (poke-engine via wasm +
`@pkmn/sim`); replays open on click. No server: saves live in IndexedDB, with JSON export/import.

Spec: `docs/FRANCHISE.md` (rules, Nick's design rules). UI rules and component list: `ui/README.md`.

## Run it locally
Prereqs: Node 22+ (24 recommended), Rust via rustup with the `wasm32-unknown-unknown` target, wasm-pack.

```sh
cd engine && wasm-pack build --release --target web --out-dir pkg     # the battle engine (once)
cd ../web && npm install
npm run build:catalog                                                  # franchise/data/catalog.json
node franchise/scripts/build.mjs --serve                               # http://127.0.0.1:8976/dist/franchise/
```
`build.mjs` without `--serve` just writes `web/dist/franchise/`, a static site (`--minify` for release).
`?fixture=1` opens a hand-built dev league that is never saved. Without the engine wasm the app still runs,
deciding games with the quick sim.

**Fast sim** (Settings → "Fast sim (no battles, for testing)", stored per browser): weeks are decided by
`model/quicksim.ts` instead of battles, so a season takes seconds. No replays for those weeks.
**Play until…** (This week) sims to the next week, the trade deadline, the end of the regular season, the end of
the Indigo Plateau or the draft, and stops early when a starter is hurt for 2+ weeks or a club sends an offer
the model rates as good for you (`trades.ts` `offerGoodForUser`).
**Saves**: every league is its own save in IndexedDB. Settings and New league list them under *Your leagues*
(Open, Export, Delete with a confirm); starting a new league asks first and keeps the open one.
**Roster moves**: Release (roster row, Pokémon page) confirms with the dead money and the cap room it frees. In season a
full roster can't negotiate (the Negotiate dialog says so first and links to Release); a trade that leaves you short
signs nobody silently: its result dialog offers the best free agent on a minimum deal, or leaves the spot for Play.
Two of a species on one club show as "Espathra" and "Espathra #2" everywhere (`model/util.ts` `monLabel`).

## Starting a league
New league is one page: Pre-made teams or Draft, the 16 gyms as cards by region, and a preview of the picked club.
- **Pre-made**: every club gets 18 from the rarity pool, about half of them of its gym type; filler Pokémon are
  swapped until the clubs' best-six strength is within 2 points. The preview shows the actual league that starts
  (generated once per seed; Reroll draws another).
- **Draft**: the league opens on a startup draft: empty rosters, 18 snake rounds, the whole starting pool (288,
  every rating known) as the board. AI clubs draft for their favourite strategy's open slots and their gym type.
  After the last pick, Sign contracts assigns contracts and practice squads and opens the preseason.
  `newLeague({start: 'draft'})`; `'fantasy-draft'` is the same draft auto-picked to the end.

## Tests
```sh
cd web
node --test franchise/model/*.test.ts franchise/sim/*.test.ts franchise/catalog/*.test.ts   # unit
node franchise/scripts/e2e.mjs          # real engine: a week of battles, every screen at 1280 and 390 px
node franchise/scripts/e2e-season.mjs   # fast sim: a whole season, draft, re-sign, FA, save round trip
npx tsc --noEmit -p .                   # battle/worker.ts has one known Rollmon error; franchise/ is clean
node franchise/scripts/season-sanity.ts [seasons=5] [seed=11]   # quick-sim seasons: OVR, ages, legendaries,
                                        # payrolls vs floor/cap, on-role lineups, injuries, Growth by tier
```
Both e2e scripts need Playwright with Chromium and fail on any console or page error (`--no-build` skips the
build, `--headed` shows the browser, `e2e.mjs --shots <dir>` saves screenshots). Dev saves at any phase:
`node franchise/ui/dev/make-save.ts <phase|weekN> out.json [seed]`, then Settings → Import.

## Code layout
| Path | What |
|---|---|
| `types.ts` | Shared types: `LeagueState`, `Mon`, `Team`, `Series`, `BattleJob`… (the contract between layers) |
| `model/` | Pure game logic over `LeagueState`. `api.ts` is the only surface the UI calls; `season.ts` is the calendar (weeks, playoffs, offseason phases); one module per system (ratings, lineup, injuries, progression, draft, scouting, trades, freeagency, cap, awards, summaries, quicksim) |
| `sim/` | Battle layer: `pool.ts` worker pool, `worker.ts` worker entry (loads the wasm), `run.ts`/`runner-plateau.ts` level-respecting battles, `box.ts` box scores from the protocol log, `replay.ts` the replay frame |
| `catalog/` | Species, sets (Smogon → randbats → generated), roles, battle levels, growth rates; `scripts/build-catalog.ts` writes `data/catalog.json` |
| `ui/` | Plain TS screens (`screens/`), components, `store.ts` (state, IndexedDB, the week loop), `routes.ts` |
| `design/plateau-tokens.css` | The design system (tokens + `.l-*` layout layer), the source of truth for layout |
| `app.ts` | Boot, router, event delegation, the Play / Play until dialogs |

## Tuning knobs
| Where | Knobs |
|---|---|
| `model/season.ts` `DEFAULT_SETTINGS` | cap, cap growth, floor, min salary, max %, injuries (`injuryKo` 2.5% per faint, `injuryStatus` 1.2% per status ending a battle, `injuryDayToDay` 68% of injuries, `injuryIr` 6%; the rest out 1–3 weeks: ~4 injuries a club a season, ~1 multi-week to a starter), AI/human think time (ms), series lengths, scouting points/costs, deadline week, weeks |
| `model/season.ts` `START` | roster size, starting legendaries, ages, payroll target (each club 85–95% of the cap at league start), AI offer/trade chance per week |
| `model/season.ts` `STRATEGY_PICK` | how AI clubs pick a strategy: penalty per off-role slot, bonus for their 1st/2nd favourite |
| `model/lineup.ts` `ON_ROLE`, `PRACTICE_PENALTY` | auto lineups: on-role slots first (assignment solver), then rating sum; when a practice-squad Pokémon is promoted to fill a role |
| `model/progression.ts` `XP`, `xpToNext` | XP per battle action, practice XP by tier (active 30, backup 60, practice squad 75 a week), focus bonus (200); Growth curve |
| `model/grades.ts` | EV % per grade, Growth bands, IV values, IV caps on EV grade |
| `model/ratings.ts` `EV_ADJ`, `catalog/roles.ts` `TIER_BASE` | rating = tier base + EV-grade adjustment |
| `model/draft.ts` | lottery odds, rounds, class size, legendary arrivals |
| `model/scouting.ts` | range widths per scouting level, miss rate, games until revealed |
| `model/freeagency.ts`, `model/cap.ts`, `model/trades.ts` | FA rounds and ask drop, market salary curve, AI trade acceptance |
| `model/quicksim.ts` `QUICKSIM_SCALE` | how decisive rating gaps are in the quick sim (60: fitted to the engine, a 10-OVR edge ≈ 54%) |
| `model/value.ts` `PLAN_SEASONS`, `GROWTH_PER_SEASON` | how far ahead clubs value young mons (projected rating = the Growth and evolutions reachable in 3 seasons); `needBoost`/`lineupGain` = what a mon adds to the club's current and favourite strategies |
| `model/trades.ts` `AI_TRADE`, `model/freeagency.ts` `FA_BID` | AI-AI trades: fair by neutral value (30%) and a lineup gain for one side; FA bids by lineup gain, under-floor clubs spend toward next season's floor |
| `model/pool.ts`, `model/awards.ts` | rarity pool counts; fame values (hall of fame) |
| `model/teams.ts`, `model/season.ts` `THEME`, `model/draft.ts` `STARTUP_AI` | the 16 gym clubs (badge, type, leader, favourite strategies); pre-made rosters: picks drawn from the gym type, balance spread; startup-draft AI bonuses |

## Known gaps
- The replay viewer and Showdown sprites hotlink play.pokemonshowdown.com (PokeAPI sprite fallback); offline or
  blocked, the replay frame says so after 10 s (`sim/replay.ts` `LOAD_TIMEOUT_S`) and the box score stays. Fast-sim
  weeks have no replays.
- Little Cup is simplified (no battles: half the clubs' rookies get bonus Growth).
- Trainer sprites (gym leaders) hotlink Showdown too; blocked, their boxes stay empty. Badge logos are local
  (`assets/badges/<n>.png`, PokeAPI badge sprites, copied into `dist/` by `build.mjs`).
- Auto lineups solve the slot assignment (on-role first, then rating); a slot is off-role only when no one on
  the roster has a set for it, and then it plays its best set (dashed badge). The user's club keeps its strategy.
- Salary floor: a club under it at the start of the regular season pays the shortfall as dead money (inbox note).
  AI clubs spend toward next season's floor in free agency; one or two still pay it in a typical season.
- Smogon sets never rate above the species' own Showdown tier (`data/tiers.json`; AG sets only for AG species):
  `scripts/build-catalog.ts` `cappedTier`. Battle levels and the tier basis of ratings are unchanged (open question
  in `eval/RESULTS.md`: OVR barely predicts real battles, so the quick sim is now close to a coin flip too).
- In the offseason rosters can be over 18 and practice squads over 6. AI clubs are trimmed when the regular
  season starts; the user's club is never trimmed silently: Home advises, and Play lists who would be released
  (lowest-rated, then cheapest, never a starter) in a confirm dialog.
- League OVR drifts up a few points over the first ~6 seasons (prospects develop), then levels off
  (`season-sanity.ts 10`).
- The user's practice focus starts on the three prospects with the most to gain until the user picks.
- Imports are checked only for `schemaVersion` 1 and the basic shape; `migrate()` fills defaults (e.g. moves old saves to the new injury rates).
