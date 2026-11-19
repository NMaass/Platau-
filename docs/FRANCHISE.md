# Plateau — Pokémon franchise mode (spec for the build)

This fork turns Rollmon into **Plateau**, a browser-only, single-player Pokémon GM sim in the
style of Football GM and Pokémon All22. You run one of 16 franchises across many seasons;
every battle is simulated in the background (Web Workers, in parallel) and replays open on click.

Rollmon is kept **only for the battle engine and AI** (`engine/`, `web/battle/`) and the
Showdown replay embed (`web/replay/embed.ts`). Rollmon's game UI (`web/app/`) is not used by
Plateau. Plateau lives under `web/franchise/` and builds to `web/dist/franchise/`.

Sources of truth, in order: (1) this file, (2) the design decisions doc (summarised here),
(3) the clickable prototype in `web/franchise/design/proto-reference/` (look and layout only;
its data is fake), (4) the design system `web/franchise/design/plateau-tokens.css`.

## Standing design rules (from Nick, never break these)
1. **The design system is the source of truth.** Screens are only compositions of it. A layout
   or spacing fix goes into the design system (`plateau-tokens.css` layout layer: `--s1..--s7`,
   `--t-*`, `.l-page/.l-section/.l-grid/.l-actions/.l-tabs/.l-table/dialog.l-dialog`), never
   into a one-off screen style.
2. **Nothing pops in or shifts layout.** Results of actions go in dialogs. Comparable elements
   (cards, buttons, chips, badges) have fixed, equal sizes, sized to the largest member of the
   set (e.g. every role chip in "Projected" is the width of the widest; the AAA grade label must
   not widen anything). Reserve space for async content (skeletons with final dimensions).
3. **Roles and ratings come from structured Smogon/Showdown data.** A Pokémon only has a role
   that one of its real sets fills. Rating = tier of the best set that fills the role, adjusted
   by EV grade and relevant IVs. No arbitrary factors (no "ability" score, no vibes).
4. **Real sprites.** Pokémon sprites from Showdown (`https://play.pokemonshowdown.com/sprites/...`)
   with PokeAPI (`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/<num>.png`)
   as fallback; trainer sprites from Showdown (`/sprites/trainers/<name>.png`).
5. **Minimal headings and on-screen information.** Detail goes behind hover (peek popovers) or an
   info button. Three depths: Glance (row/card) → Peek (popover) → Page.
6. Vocabulary: "Strategy" (not archetype), "Moveset", "Series" (best of 3), "Growth" = the
   1–100 XP track (Nick has not confirmed the name; keep "growth rate" for the species XP curve).
   Glance mark = role abbreviation + OVR badge like All22 ("ATK | 88"). EV grade is development
   info (Growth lens, peek, Pokémon page), never next to OVR in default rows.

## Nick's walkthrough notes (2026-11-19) to build in
- Likely team (scouting the opponent) shows **6** slots, not 5.
- Remove the "one of the six starters hits it super effectively" line.
- "Before you play" items: the label (e.g. "Injury"), its text, and its button share **one top
  alignment**, with more breathing room. Fix it in the design system's list-item primitive.
- **Battle screen = the Pokémon Showdown replay viewer** Rollmon already embeds
  (`web/replay/embed.ts`), wrapped in a design-system frame (header with teams/score/series game,
  controls styled as `.btn`). No custom battle mock.
- AAA label width must not break any layout (fixed-width grade chips).
- Projected role chips are all the same width.
- Scouting costs **1 point**; full knowledge costs **5 points** (not All22's 6/3).
- Draft board is **sortable** (by any column, click header; keep taken players in place, dimmed).
- He likes the series MVP and the summaries. Summaries are generated from the box score with
  templates (no AI model). Showing the ceiling plainly is under question: show potential as a
  range on the Pokémon page/peek only, not in rows.

## League and season
- 16 teams = the gym cities of Gens 1–4 (`model/teams.ts`): Indigo Conference (Kanto, Johto) and Lily of the
  Valley Conference (Hoenn, Sinnoh), the divisions are the regions. Each club is named for its badge (logo = the
  badge art), leans to its gym's type and has its gym leader as trainer. Start: Pre-made teams or Draft (startup draft).
- 2 conferences × 2 divisions of 4. 14-week regular season; each week every team plays
  one **series (best of 3 battles)**. Schedule: division rivals twice (6), other division in the
  conference once (4), 4 cross-conference.
- **Indigo Plateau** (playoffs): 6 teams, per conference the 2 division winners + 1 wild card; the
  division winner with the better record gets a bye. Round 1: non-bye division winner vs wild
  card; conference final; Plateau final. Series are best of 3 (final may be best of 5, tunable).
- Preseason **Little Cup**: rookies battle at level 5; winners' rookies get bonus Growth. (Lower
  priority; build last.)
- Trade deadline after week 8. Draft picks are tradable. AI teams trade with each other.
- Calendar: preseason → regular season → Indigo Plateau → awards & retirements → draft lottery &
  draft → re-signing → free agency → next season.
- Each week (hub with advisories; Home shows the steps with status, Play always works, broken
  slots auto-filled and flagged): Inbox (results with replay links, injury report, grade-ups and
  evolutions, AI trade offers, weekly goals) → injury follow-up → Prepare (scouting report on the
  opponent, strategy and lineup, practice focus: base XP for all healthy, extra for 2–3 picks) →
  lock and sim (every match in the league in parallel).
- "Play until": next week, trade deadline, end of regular season, Indigo Plateau, draft. A
  multi-week sim pauses on a multi-week injury to a starter or a strong trade offer.

## Pokémon as players
- Every Pokémon is a unique individual: species, nickname-free name = species (+ disambiguating
  number only in data), age, IV grades, Growth, EV grade, contract, injury, stats, awards, fame.
- **Rarity pool**: finite, drawn without replacement: 1 of each legendary/mythical, ~3 of each
  pseudo-legendary, ~20 of each other species line (tunable). Legendary arrivals per season:
  0 (25%), 1 (70%), 2 (5%). ~9 legendaries in the league at start.
- **Two levels, never mixed**: battle level (Smogon random battle level for the species, 64–100,
  fixed per species, refreshes on evolution) vs **Growth** 1–100 (XP). Battle level affects stats;
  Growth sets EV grade and evolution. Battle level source: gen9 randbats level, else most recent
  older gen, alt formes inherit base, NFEs from a BST regression fit (cap 100).
- **EV grade** = % of the chosen set's EV spread: F 40, D 50, C 60, B 70, A 80, AA 90, AAA 100.
  Growth bands: F 1–14, D 15–29, C 30–44, B 45–59, A 60–74, AA 75–89, AAA 90–100. AAA never
  guaranteed. EVs are floored to multiples of 4.
- **IV grades**: fixed for life, one letter per stat: F 16, D 20, C 24, B 28, A 31. Show an
  overall headline grade plus callouts only for stats some set of the species invests in. IVs cap
  how high the EV grade can go (tunable: e.g. headline F caps at B, D at A, C at AA).
- **XP** from battle actions (box score): KOs, damage dealt, damage taken, statuses inflicted,
  hazards set/removed, win, series MVP bonus; plus weekly goals, practice focus, partial XP for
  backups, slow XP for practice squad.
- **Evolution** at the real level, measured on Growth (Gible 24, Gabite 48). Stone/trade/friendship
  evolutions get a level equivalent (e.g. 36). Keeps IVs, EV grade, age, contract; takes the new
  species' battle level and sets.
- **Aging**: prime window follows the species growth rate (fast: earlier prime/earlier decline,
  slow: later). Past prime, loses Growth each offseason and drops EV grades.
- **Sets**: any Smogon set for the species can be chosen week to week (moves + EV spread).
  Fallback: Showdown random battle sets. NFEs without sets get generated ones.

## Roster, lineups, injuries
- 18 per team: Active 6 (battle), Backup 6 (swapped in for matchups and injuries, between games of
  a series too), Practice 6 (can't battle; can't be signed away; promotion bumps salary to the
  active minimum). Injured reserve doesn't count against 18.
- **Roles** (from structured data; the visible list is short):
  Setter family: Rocks setter, Spikes setter, Rain/Sun/Sand/Snow setter, Screens setter;
  Hazard remover; Pivot; Setup sweeper; Wallbreaker; Attacker (fast/bulky attacker); Wall;
  Phazer; Weather abuser (rain/sun/sand/snow). Abbreviations for badges: SET, ROK, SPK, RAIN, SUN,
  SAND, SNOW, SCR, HAZ (remover), PIV, SWP, WBK, ATK, WAL, PHZ, and weather abusers ABU.
  Each set gets role tags derived from its moves/ability/item + the randbats role label.
  A Pokémon's rating per role = base by the best Smogon tier where a set with that role exists
  (Uber 96, OU 92, UU 86, RU 80, NU 74, PU 68, ZU/LC/other 62; randbats-only: by level), then
  adjusted by EV grade and relevant IVs. OVR = best role rating.
- **Strategies** (6 slots each): Hyper Offense (Setter, 2 Sweepers, 2 Wallbreakers, Attacker),
  Bulky Offense (Setter, Pivot, 2 Attackers, Wallbreaker, Sweeper), Balance (Setter, 2 Walls,
  Pivot, Attacker, Wallbreaker), Stall (Setter, 4 Walls, Pivot), Rain/Sun/Sand/Snow (Weather
  setter, 3 weather abusers, Sweeper, Pivot), Hazard Stack (Rocks setter, Spikes setter, Phazer,
  Wall, Pivot, Attacker). Saved lineups; auto-assign or manual; each slot has backups in a depth
  chart. No stat penalty for off-role picks. Lineup cards: role name is the card heading (no slot
  numbers), Pokémon + OVR, set dropdown from its Smogon sets, backups underneath.
- AI GMs have a primary and secondary favourite strategy and value Pokémon by role ratings.
- **Injuries** (all tunable): KO ~2.5%, ending a battle with a status ~1.2% (burn/toxic riskier, age
  raises risk). Designations: day-to-day (plays one EV grade lower), out 1–3 weeks, injured
  reserve 4+ weeks (spot can be filled from FA). Tuned to ~4 per club a season, ~2/3 day-to-day. Injuries carry between games of a series. Rare
  severe injuries permanently cost an IV grade or cap the EV grade.

## Contracts, cap, free agency
- Hard cap $100M (grows ~4%/yr), floor, $0.5M minimum, max 20% of cap. Over cap → minimum deals
  only. Contracts up to 7 years; rookie deals by draft slot with a fifth-year option on
  first-rounders; second contract at market value. Signing bonuses prorated; cuts/trades leave
  dead money. Asking price by EV grade (and role OVR) and age; no fame/legendary premium.
- Re-sign window first + one franchise tag (1 yr, high fixed price). Then 3 FA bidding rounds:
  each FA takes the best offer by total money weighted to guaranteed years; unsigned lower their
  ask. AI bids by role-slot needs + cap room. In season: waivers (reverse standings), FA anytime
  (incl. IR replacement). After the deadline FA only.
- Retirement between ages 30 and 36 by role, species, injuries; farewell seasons; late-career
  injuries; badly injured may retire outright.

## Draft, scouting, league start
- 3 rounds, 48 picks. NBA-style lottery for the 10 non-playoff teams: top 4 picks drawn with
  odds 18,18,16,13,10,8,6,5,4,2%; worst picks no lower than 5th; the rest reverse standings.
- Draft classes from the rarity pool; rookies 21–23, mostly unevolved; undrafted → FA.
- **Scouting**: ranges of equal width for equal scouting spent, the true value uniformly placed
  inside, ~10% fall outside. **Scouting a prospect costs 1 point; full knowledge costs 5 points.**
  Points per week (e.g. 10). True grade revealed after ~6 games. Each team scouts separately.
  Scouting reveals traits ("maxed Speed", "especially well suited" to a role). Species' usual
  roles are always visible.
- League start: fantasy draft (16 teams, 18 rounds, snake) or random rosters (default quick
  start). ~9 legendaries in the starting pool; ages staggered 21–33; contracts at market value
  with 1–5 years left.

## Awards, hall of fame, history
- MVP, Offensive/Defensive/Support Pokémon of the Year, Rookie of the Year, Comeback, Indigo
  Plateau MVP, All-League 1st/2nd teams; from the box score. Series MVP each series.
- Hall of fame at retirement if hidden fame clears a threshold. Records book, franchise history,
  Pokémon pages with awards and career stats. Summaries are template-generated from box scores.

## Platform
- Static site, no server. Saves in IndexedDB with JSON file export/import. Battles in a pool of
  Web Workers (`navigator.hardwareConcurrency - 1`), each running `web/battle/runner.ts`.
  AI vs AI think budget is low (tunable, default 10 ms/decision) so a week sims in seconds;
  the user's own games use a higher budget (default 40 ms). Replays stored as protocol logs.
