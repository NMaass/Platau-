// Playing the calendar forward from This week: Watch week, Sim week, and the one-step offseason
// button. Progress shows in the locked dialog; a dialog stays open afterwards only when it has
// results (the series, or why the sim stopped). Watch week sims first, then opens game 1's replay
// in watch mode (battle.ts), which hides results until each game is watched.
import type {Mon} from '../../types.ts';
import {esc, ic, plural, money} from '../dom.ts';
import {S, C, act, playWeek} from '../store.ts';
import {api, isFixtureMode} from '../model.ts';
import {openDialog, updateDialog, closeDialog, confirmDialog} from '../components/layer.ts';
import {monBadge, monName, speciesOf, teamName} from '../components/mon.ts';
import {ico} from '../sprites.ts';
import {phaseLabel} from '../shell.ts';
import {seriesResult, type PlayMode} from './week.ts';

export const watchHash = (seriesId: string, game: number): string => `#battle-${seriesId}-${game}?watch=1`;

export async function play(mode: PlayMode): Promise<void> {
  const s = S();
  // Finishing the draft auto-picks every remaining pick of the user's: say so first.
  if (s.phase === 'draft' && s.draft && !isFixtureMode()) {
    const left = s.draft.order.slice(s.draft.picks.length).filter((p) => p.ownerTeamId === s.userTeamId);
    if (left.length) {
      const rounds = [...new Set(left.map((p) => p.round))].join(', ');
      const ok = await confirmDialog(`Auto-pick ${plural(left.length, 'pick')}?`,
        `You still own ${plural(left.length, 'pick')} in this draft (round ${esc(rounds)}). Finishing the draft picks the best available prospect for you each time.`, 'Auto-pick and finish');
      if (!ok) return;
    }
  }
  // Starting the season with more than 18 outside IR: list who would go, release only on confirm.
  if (s.phase === 'preseason' && !isFixtureMode()) {
    const cut = api.rosterExcess(C(), s, s.userTeamId);
    if (cut.length && !(await confirmTrim(cut))) return;
  }
  const wk = s.week, season = s.season, phase = s.phase;
  const games = phase === 'regular' || phase === 'playoffs';
  const bar = (done: number, total: number, label: string) => `<div class="l-stack"><p>${esc(label)}</p><div class="l-progress"><span class="fitbar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${total ? (done / total * 100).toFixed(1) : 0}%"></i></span><output>${done} / ${total}</output></div><p class="x-small">${mode === 'watch' ? 'Every battle runs first; then your games play back.' : 'Every series in the league is played in the background.'}</p></div>`;
  const title = games ? (mode === 'watch' ? `Getting week ${wk} ready` : `Simulating week ${wk}`) : esc(phaseLabel(phase));
  openDialog({title, cap: `Season ${season}`, body: bar(0, 0, 'Preparing battles'), actions: [], locked: true});
  try {
    await playWeek((p) => {
      const d = document.getElementById('dlg');
      const i = d?.querySelector<HTMLElement>('.fitbar i'), o = d?.querySelector('output'), lbl = d?.querySelector('[data-body] p');
      if (i) i.style.width = `${p.total ? (p.done / p.total * 100).toFixed(1) : 0}%`;
      if (o) o.textContent = `${p.done} / ${p.total}`;
      if (lbl) lbl.textContent = p.label;
    });
  } catch (e) {
    console.error(e);
    updateDialog({title: 'The week could not be simulated', body: `<p>${esc((e as Error).message)}</p>`, actions: [{key: 'close', label: 'Close', go: true}], locked: false});
    return;
  }
  const now = S(), me = now.userTeamId;
  const reasons = api.pauseReasons(now);
  // offseason steps keep week 17: only a played week has a series to show
  const se = games ? now.schedule.find((x) => x.season === season && x.week === wk && (x.homeId === me || x.awayId === me) && x.games.length) : undefined;
  if (!se) {
    // nothing to report unless the step was refused (e.g. the roster is over 18): no empty "moved on" dialog
    if (!reasons.length || now.phase !== phase) { closeDialog(); return; }
    updateDialog({title: esc(phaseLabel(now.phase)), cap: `Season ${now.season}`,
      body: `<ul class="l-list">${reasons.map((r) => `<li><span>${esc(r)}</span></li>`).join('')}</ul>`,
      actions: [{key: 'roster', label: `Roster ${ic('arrow')}`, href: '#roster'}, {key: 'close', label: 'Done', go: true}], locked: false});
    return;
  }
  if (mode === 'watch') { location.hash = watchHash(se.id, 1); return; }  // the hash change closes the dialog
  updateDialog({
    title: seriesTitle(se.winnerId === me), cap: `Week ${wk} · vs ${teamName(se.homeId === me ? se.awayId : se.homeId)}`,
    body: seriesResult(se) + pauseNote(reasons), locked: false,
    actions: [{key: 'watch', label: `${ic('film')}Watch game 1`, href: `#battle-${se.id}-1`}, {key: 'close', label: 'Done', go: true}],
  });
}

export const seriesTitle = (won: boolean): string => `${esc(S().teams[S().userTeamId].name)} ${won ? 'win' : 'lose'} the series`;
/** Things that happened this week that need the user (a starter out for weeks, a good trade offer). */
export const pauseNote = (reasons: string[]): string => reasons.length ? `<ul class="l-list" aria-label="This week">${reasons.map((r) => `<li><span>${esc(r)}</span></li>`).join('')}</ul>` : '';

/** "Release N to start the season?": the lowest-rated non-starters, with their salary. */
function confirmTrim(cut: Mon[]): Promise<boolean> {
  return new Promise((res) => {
    let ok = false;
    const rows = cut.map((m) => `<li><span class="l-row">${ico(speciesOf(m))}<b>${esc(monName(m))}</b></span>${monBadge(m, null, {sm: true, noPeek: true})}<span class="x-small">${m.contract ? money(m.contract.salary) : ''}</span></li>`).join('');
    openDialog({title: `Release ${plural(cut.length, 'Pokémon', 'Pokémon')}?`, cap: 'Rosters hold 18',
      body: `<p>The season starts with 18 outside injured reserve. Starting releases the lowest-rated, cheapest first (never a starter); any guaranteed money stays as dead money.</p><ul class="l-list trio" aria-label="Released">${rows}</ul>`,
      actions: [{key: 'roster', label: `Review roster ${ic('arrow')}`, href: '#roster'}, {key: 'ok', label: `Release ${cut.length} and start`, go: true}],
      onAction: (k) => { if (k === 'ok') { ok = true; act((st, c) => { api.trimRoster(c, st, st.userTeamId); }); } }, onClose: () => res(ok)});
  });
}
