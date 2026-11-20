# Plateau UI

Plain TypeScript, no framework. Screens return HTML strings built from the components below;
behaviour is wired once in `app.ts` by event delegation on `data-*` attributes. Styles: the design
system `../design/plateau-tokens.css` (tokens + `.l-*` layout layer, the source of truth) and
`screens.css` (screen compositions only: no new spacing, widths or dialog rules).

Run: `cd web && node franchise/scripts/build.mjs --serve` → http://127.0.0.1:8976/dist/franchise/
(`?fixture=1` = hand-built dev league, never saved).

## Rules (docs/FRANCHISE.md, non-negotiable)
- A layout or spacing fix goes into `plateau-tokens.css`, never one screen.
- Nothing pops in or shifts: action results open in the dialog (`openDialog`); async areas
  reserve their final size (`skel`, `.l-frame`, `.l-reserve`, `.l-clamp`).
- Comparable marks have one size: role badges (`--rb-r-w`, `--rb-n-w`, `.full` = `--rb-full-w`,
  `.range` = `--rb-range-w`), grade chips (`--grade-w`, sized for AAA), equal-width buttons in `.l-actions`.
- Minimal headings; detail behind peeks (Glance → Peek → Page). EV grade never sits next to OVR in default rows.
- Real sprites only (`sprites.ts`: Showdown, PokeAPI fallback). Team colour is an accent only.
- Vocabulary: Strategy, Moveset, Series, Growth.

## Modules
| File | What |
|---|---|
| `dom.ts` | `esc` (use on all data), `ic(icon)`, `$`, `$$`, `money`, `plural`, `record`, `listJoin` |
| `icons.ts` | SVG symbol sheet (`ic('week')`, `play`, `arrow`, `film`, `gear`, …) |
| `store.ts` | `store` (catalog, state, `ui` scratch), `S()`, `C()`, `act(fn)` (run model action → save → re-render), `playWeek(onProgress)`, IndexedDB `save/loadLast`, `exportSave/importSave` |
| `model.ts` | `M.*` = model/api.ts with per-function fallback (`fallback.ts`) while bodies throw; `api` raw; `strategies()` |
| `router.ts` | `parse()` → `{path, arg, params}` (`#mon-m12`, `#battle-<seriesId>-<game>`, `#roster?lens=contracts`), `ROOMS`, `roomOf` |
| `shell.ts` | sidebar / phone header / tab bar / room sub-tabs, `applyTeamColour`, `divisionName`, `phaseLabel` |
| `sprites.ts` | `ico(species)` 40×30 row icon, `spr(species, ''|'md'|'xl')` framed front sprite, `trainerImg`, `teamLogo(team, lg?)` the club's gym badge in the fixed `.logo` box (32 px; `.lg` 56 px on New League only) |
| `routes.ts` | `ROUTES` registry for extra screens |
| `dev-fixture.ts` | `fixtureCatalog()`, `fixtureLeague()` |

## Components (`components/`)
| Component | Use |
|---|---|
| `badges.ts` `roleBadge(role, ovr, {full, sm, lg, pop})` | "ATK \| 88" glance mark, fixed width. `full` shows the role name (lineup cards, Pokémon page) |
| `rangeBadge(role, lo, hi)` | prospects / unscouted: "SWP \| 68–81", fixed width |
| `gradeChip(g)` | F..AAA (and IV letters), fixed width |
| `ivSummary(mon, species, headline)` | headline IV grade + one line + (i) peek with all six |
| `injuryTag(mon)`, `expiringTag()`, `typeChips(types)`, `eventChip(cat, icon, word)` | inline tags/chips |
| `mon.ts` `monRef(mon, {icon, inline, noLink})` | icon + name link to `#mon-<id>` with a peek |
| `monBadge(mon, role?, opts)` | role badge for a mon (slot role or best role) with the rating peek |
| `teamAbbr(id)` (badge + 3-letter label), `teamCell(id)` (badge + name), `teamName(id)`, `speciesOf`, `monName` (species + "#2" for a second of a species on one club; always use it for a name), `setOf`, `stage` | helpers |
| `table.ts` `table({id, cols, rows, groups?, rowClass?, minWidth?, defaultSort?})` | `.l-table` with one colgroup; a column with `sort` gets a header button (`aria-sort`, reserved arrow slot). Sort state per table id; clicks handled in app.ts |
| `page.ts` `head(title, sub, actions)` | page head; actions are `.btn`s in `.l-actions` (equal widths) |
| `panel(id, title, body, {flush})` | boxed section with h2 |
| `lensTabs(key, cur, [[k,label]])` | lens tabs; click sets `store.ui[key]` |
| `itemList(items)` | "Before you play"/feed rows: label chip, text, action share ONE top edge (`.l-list.top`) |
| `skel(w, h)`, `empty(title, text, action)`, `comingSoon(title, what)` | placeholders with final size |
| `front.ts` `closed(title, sub, text, links)` | fixed-size "opens later" panel for screens outside their phase (same box every time) |
| `fixChip(cat, icon, word)` | status chip of one width (`.chip.fix`, `--chip-w`): clinch, interest, verdict, lottery move |
| `capStrip(teamId)`, `rosterUsed`, `beforeAfter(rows)` | cap room strip; before → after money lines |
| `knownBadge(mon)`, `knownMid(mon)` | what your club knows: exact badge or fixed-width range badge; sort value |
| `tradeMeter(ev)`, `pickLabel(p)`, `pickKey(p)`, `once(key, fn)` | will-they-accept meter; draft pick label/key; install a delegated listener once |
| `layer.ts` `openDialog({title, cap, body, actions, onAction, onClose, wide, locked})` | the one shared dialog; `updateDialog`, `closeDialog`, `confirmDialog`. An action with `disabled` + `why` stays in place with the reason in a peek |
| `info(label, popHtml)`, `peekLabel(label, popHtml)`, `prow(k, v)` | peeks (one floating layer, hover/focus/tap) |

## data-* actions (app.ts)
`data-act="play|until|auto|swap|chooser|theme|fastsim|export|import|pickteam|newmode|newreroll|newleague|release|saveopen|saveexport|savedelete"` (click; `release` opens the Release confirm (moves.ts `releaseDialog`), `save*` act on Your leagues (store.ts `savedLeagues`/`openSave`/`exportSaveById`/`deleteSave`); `until` opens Play until, `fastsim` is the Settings dev toggle read by `store.fastSim()`),
`data-act="strategy|slotset|monset|tier|budget"` (change), `data-sort="<table>:<col>:<desc 0|1>"`,
`data-lens="<uiKey>:<value>"`. Re-render after state changes with `act()` or `notify()`.

## Adding a screen (league / front-office UI)
Register it, no edits to app.ts needed:
```ts
import {ROUTES} from '../routes.ts';
ROUTES.standings = {view: (r) => head('Standings') + panel(...), after: (r) => {/* DOM wiring */}};
```
League / front office screens live in `screens/league.ts` (standings, playoffs, schedule, history),
`screens/draft.ts` (scouting, draft), `screens/moves.ts` (trades, offers, free agents) and are registered in
`routes.ts`. Their buttons use `data-fo="..."`, handled by one delegated listener per module (`once`).
Design-system primitives added for them: `.chip.fix`, `.l-cellacts` (two equal buttons in a cell; `--n` for more), `.l-toolbar`.
New League (`screens/settings.ts`) adds `.logo`, `.l-pick` (selectable card of one height, accent `--c`), `.l-tiles`
(N equal fixed tiles), `.l-icons` (six row icons with a number), `.l-sticky` (side panel in view on desktop).

Dev: `node franchise/ui/dev/make-save.ts <phase|weekN> out.json [seed]` builds a quick-sim league at a phase
(draft, resign, free-agency, awards, playoffs, week6, ...); `NODE_PATH=$(npm root -g) node franchise/ui/dev/shots.mjs
<url> <outDir> save.json:route,route` imports it through Settings → Import and screenshots 1280/390 × light/dark.
