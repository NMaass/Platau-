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
| `sprites.ts` | `ico(species)` 40×30 row icon, `spr(species, ''|'md'|'xl')` framed front sprite, `trainerImg` |
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
| `teamAbbr(id)`, `teamCell(id)`, `teamName(id)`, `speciesOf`, `monName`, `setOf`, `stage` | helpers |
| `table.ts` `table({id, cols, rows, groups?, rowClass?, minWidth?, defaultSort?})` | `.l-table` with one colgroup; a column with `sort` gets a header button (`aria-sort`, reserved arrow slot). Sort state per table id; clicks handled in app.ts |
| `page.ts` `head(title, sub, actions)` | page head; actions are `.btn`s in `.l-actions` (equal widths) |
| `panel(id, title, body, {flush})` | boxed section with h2 |
| `lensTabs(key, cur, [[k,label]])` | lens tabs; click sets `store.ui[key]` |
| `itemList(items)` | "Before you play"/feed rows: label chip, text, action share ONE top edge (`.l-list.top`) |
| `skel(w, h)`, `empty(title, text, action)`, `comingSoon(title, what)` | placeholders with final size |
| `layer.ts` `openDialog({title, cap, body, actions, onAction, onClose, wide, locked})` | the one shared dialog; `updateDialog`, `closeDialog`, `confirmDialog` |
| `info(label, popHtml)`, `peekLabel(label, popHtml)`, `prow(k, v)` | peeks (one floating layer, hover/focus/tap) |

## data-* actions (app.ts)
`data-act="play|auto|swap|chooser|theme|export|import|pickteam|newleague"` (click),
`data-act="strategy|slotset|monset|tier|budget"` (change), `data-sort="<table>:<col>:<desc 0|1>"`,
`data-lens="<uiKey>:<value>"`. Re-render after state changes with `act()` or `notify()`.

## Adding a screen (league / front-office UI)
Register it, no edits to app.ts needed:
```ts
import {ROUTES} from '../routes.ts';
ROUTES.standings = {view: (r) => head('Standings') + panel(...), after: (r) => {/* DOM wiring */}};
```
Routes already stubbed with a fixed "coming soon" panel: trades, freeagents, offers, scouting,
draft, standings, playoffs, schedule, history. Import the screen module from `app.ts` so it bundles.
