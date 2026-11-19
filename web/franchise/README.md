# Plateau

A browser-only, single-player Pokémon franchise GM sim (Football GM / Pokémon All22 style). You run one of
16 clubs over many seasons: set a strategy and lineup, scout, trade, draft, re-sign and sign free agents.
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
the Indigo Plateau or the draft, and stops early when a starter is hurt for 2+ weeks or a club sends an offer.

## Tests
```sh
cd web
node --test franchise/model/*.test.ts franchise/sim/*.test.ts franchise/catalog/*.test.ts   # unit
node franchise/scripts/e2e.mjs          # real engine: a week of battles, every screen at 1280 and 390 px
node franchise/scripts/e2e-season.mjs   # fast sim: a whole season, draft, re-sign, FA, save round trip
npx tsc --noEmit -p .                   # battle/worker.ts has one known Rollmon error; franchise/ is clean
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
| `model/season.ts` `DEFAULT_SETTINGS` | cap, cap growth, floor, min salary, max %, injury rates, AI/human think time (ms), series lengths, scouting points/costs, deadline week, weeks |
| `model/season.ts` `START` | roster size, starting legendaries, ages, payroll target, AI offer/trade chance per week |
| `model/progression.ts` `XP`, `xpToNext` | XP per battle action, practice XP by tier, focus bonus; Growth curve |
| `model/grades.ts` | EV % per grade, Growth bands, IV values, IV caps on EV grade |
| `model/ratings.ts` `EV_ADJ`, `catalog/roles.ts` `TIER_BASE` | rating = tier base + EV-grade adjustment |
| `model/draft.ts` | lottery odds, rounds, class size, legendary arrivals |
| `model/scouting.ts` | range widths per scouting level, miss rate, games until revealed |
| `model/freeagency.ts`, `model/cap.ts`, `model/trades.ts` | FA rounds and ask drop, market salary curve, AI trade acceptance |
| `model/quicksim.ts` `QUICKSIM_SCALE` | how decisive rating gaps are in the quick sim |
| `model/pool.ts`, `model/awards.ts` | rarity pool counts; fame values (hall of fame) |

## Known gaps
- The replay viewer and Showdown sprites hotlink play.pokemonshowdown.com (PokeAPI sprite fallback); offline or
  blocked, replays don't paint. Fast-sim weeks have no replays.
- Little Cup is simplified (no battles: half the clubs' rookies get bonus Growth). Fantasy-draft start exists in
  the model but not in the New league screen.
- Auto lineups put the best Pokémon in a slot even off-role ("No set"); the user's club keeps its strategy.
- Starting payrolls sit well under the $70M floor; nothing enforces the floor yet.
- Practice-squad Growth is slow (an unevolved prospect needs several seasons to evolve without practice focus).
- In the offseason rosters can be under or over 18 and practice squads over 6; they are trimmed/filled when the
  regular season starts (Home warns).
- Injuries are frequent (~1–2 per club per week), so Play until stops often; tune `injuryKo`/`injuryStatus`.
- Imports are checked only for `schemaVersion` 1 and the basic shape; no migrations yet.
