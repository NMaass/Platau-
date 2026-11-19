// Settings (theme, save export/import, budgets, new league) and the New League screen.
import {esc, ic, money} from '../dom.ts';
import {store} from '../store.ts';
import {head, panel} from '../components/page.ts';
import {isFixtureMode} from '../model.ts';
import {TEAM_PRESETS} from '../dev-fixture.ts';
import {divisionName} from '../shell.ts';

export const theme = (): string => { try { return localStorage.getItem('plateau-theme') ?? 'auto'; } catch { return 'auto'; } };
export function applyTheme(t = theme()): void {
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}

export function viewSettings(): string {
  const s = store.state;
  const seg = ['auto', 'light', 'dark'].map((t) => `<button type="button" data-act="theme" data-theme="${t}" aria-pressed="${theme() === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('');
  const save = s ? `<dl class="l-kv"><dt>League</dt><dd>${esc(s.name)}${isFixtureMode() ? ' <span class="chip c-scout">Dev fixture, not saved</span>' : ''}</dd><dt>Season</dt><dd>${s.season}, week ${s.week}</dd></dl>
    <div class="l-actions"><button class="btn" type="button" data-act="export">${ic('down')}Export save</button><button class="btn" type="button" data-act="import">${ic('upload')}Import save</button></div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>` : `<div class="l-actions"><button class="btn" type="button" data-act="import">${ic('upload')}Import save</button></div><input type="file" id="importFile" accept="application/json,.json" hidden>`;
  const budgets = s ? `<dl class="l-kv">
      <dt>Your games</dt><dd class="l-row"><input class="num-in" type="number" min="5" max="500" step="5" value="${s.settings.budgetMs.human}" data-act="budget" data-k="human" aria-label="Think time for your games in ms"><span class="muted">ms per decision</span></dd>
      <dt>AI vs AI</dt><dd class="l-row"><input class="num-in" type="number" min="2" max="200" step="2" value="${s.settings.budgetMs.ai}" data-act="budget" data-k="ai" aria-label="Think time for AI games in ms"><span class="muted">ms per decision</span></dd>
      <dt>Salary cap</dt><dd>${money(s.settings.cap)}</dd></dl><p class="x-small">Higher think time plays better battles and takes longer to sim a week.</p>` : '';
  return head('Settings') + `<div class="l-cols">
    <div class="l-stack loose">
      ${panel('theme', 'Theme', `<div class="l-seg" role="group" aria-label="Theme">${seg}</div>`)}
      ${panel('save', 'Save', save)}
    </div>
    <div class="l-stack loose">
      ${s ? panel('budget', 'Battle think time', budgets) : ''}
      ${panel('newl', 'New league', `<p class="muted">Start over with a new league. Your current save stays until you replace it.</p><div class="l-actions"><a class="btn" href="#new">${ic('plus')}New league</a></div>`)}
    </div></div>`;
}

export function viewNewLeague(): string {
  const pick = (store.ui.newTeam as number | undefined) ?? 0;
  const cards = TEAM_PRESETS.map(([city, name, abbr, color], i) => `<button type="button" class="pick-team" data-act="pickteam" data-i="${i}" aria-pressed="${i === pick}" style="--c:${color}">
      <span class="crest" aria-hidden="true" style="background:${color}">${esc(abbr[0])}</span><span><b>${esc(city)}</b><span>${esc(name)} · ${esc(divisionName(i >> 3, (i >> 2) & 1))}</span></span></button>`).join('');
  return head('New league', 'Pick your team. Quick start gives every team a random roster.', `<button class="btn go" type="button" data-act="newleague">${ic('play')}Start league</button>`) +
    panel('teams', 'Teams', `<div class="l-grid team-grid">${cards}</div>`) +
    panel('opts', 'Start', `<dl class="l-kv"><dt>League name</dt><dd><input type="text" id="leagueName" class="txt-in" value="Indigo League" maxlength="40" aria-label="League name"></dd>
      <dt>Rosters</dt><dd><span class="l-row"><b>Random rosters</b><span class="muted">(quick start; fantasy draft coming later)</span></span></dd></dl>`);
}
