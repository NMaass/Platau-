// Shared bits of the league / front-office screens: the fixed "opens later" panel,
// the cap strip, the will-they-accept meter, draft pick labels, status chips of one width.
import type {DraftPick, Mon, TeamId} from '../../types.ts';
import {esc, ic, money} from '../dom.ts';
import {C, S} from '../store.ts';
import {M, api} from '../model.ts';
import {head} from './page.ts';
import {roleBadge, rangeBadge} from './badges.ts';
import {monBadge} from './mon.ts';

/**
 * Screen that doesn't apply in this phase: the page head plus one fixed-size panel that says
 * when it opens (same box as comingSoon: .soon, min-height reserved), so switching tabs never
 * shifts the layout.
 */
export function closed(title: string, sub: string, text: string, links: [string, string][] = [['#week', 'Back to This week']]): string {
  return head(esc(title), esc(sub)) + `<section class="l-panel l-section soon" aria-label="${esc(title)} is closed">${ic('clock')}<p><b>${esc(text)}</b></p><div class="l-actions">${links.map(([h, l]) => `<a class="btn" href="${esc(h)}">${esc(l)}</a>`).join('')}</div></section>`;
}

/** Status chip with the column's fixed width (.chip.fix = --chip-w), icon + word. */
export const fixChip = (cat: string, icon: string, word: string): string => `<span class="chip fix c-${cat}">${ic(icon)}${esc(word)}</span>`;

/** Cap room strip (same markup as the Roster contract lens). */
export function capStrip(teamId: TeamId, extra = ''): string {
  const s = S(), pay = M.payroll(s, teamId), cap = s.settings.cap;
  return `<span class="capm"><span>Cap room</span><b>${money(cap - pay)}</b><span class="fitbar" role="img" aria-label="${money(pay)} of ${money(cap)} used"><i style="width:${Math.min(100, pay / cap * 100).toFixed(1)}%"></i></span><span>${money(pay)} of ${money(cap)}${extra ? ' · ' + extra : ''}</span></span>`;
}

/** Roster spots used (injured reserve doesn't count). */
export const rosterUsed = (teamId: TeamId): number => api.teamRoster(S(), teamId).filter((m) => m.tier !== 'ir').length;

/** "2027 round 1" (+ original club when it isn't the owner). */
export function pickLabel(p: DraftPick, o: {owner?: boolean} = {}): string {
  const s = S();
  const orig = p.originalTeamId !== p.ownerTeamId || o.owner ? ` <span class="x-small">(${esc(s.teams[p.originalTeamId].abbr)})</span>` : '';
  return `Season ${p.season} · round ${p.round}${orig}`;
}
export const pickKey = (p: DraftPick): string => `p:${p.season}:${p.round}:${p.originalTeamId}`;

/** What the user's club knows about a mon's rating: exact badge (with peek) or a fixed-width range badge. */
export function knownBadge(m: Mon, o: {full?: boolean} = {}): string {
  const s = S(), c = C();
  if (m.teamId === s.userTeamId) return monBadge(m, null, o);
  const k = api.knownRating(c, s, s.userTeamId, m);
  return k.exact ? roleBadge(k.role, k.hi, o) : rangeBadge(k.role, k.lo, k.hi, o);
}
/** Sort value for knownBadge: the middle of the range. */
export const knownMid = (m: Mon): number => {
  const s = S();
  if (m.teamId === s.userTeamId) return M.bestRole(C(), s, m).ovr;
  const k = api.knownRating(C(), s, s.userTeamId, m);
  return (k.lo + k.hi) / 2;
};

/**
 * Will-they-accept meter (All22): 5 fixed segments + a fixed-width verdict chip, never colour alone.
 * Level from the model's score (-100..100) and verdict.
 */
export function tradeMeter(ev: {accept: boolean; score: number} | null): {html: string; word: string; lv: number} {
  let lv = 0, word = 'Add something';
  if (ev) {
    lv = ev.accept ? (ev.score >= 20 ? 5 : 4) : ev.score > -15 ? 3 : ev.score > -40 ? 2 : 1;
    word = ['', 'No', 'Unlikely', 'Close', 'Yes', 'Yes'][lv];
  }
  const chip = lv >= 4 ? fixChip('growth', 'check', word) : lv === 3 ? fixChip('decline', 'alert', word) : lv > 0 ? fixChip('health', 'x', word) : fixChip('league', 'deal', word);
  return {lv, word, html: `<div class="x-verdict"><div class="x-meter lv${lv}" role="img" aria-label="Will they accept: ${esc(word)}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('')}</div>${chip}</div>`};
}

/** Before → after line pairs (cap room, payroll). */
export const beforeAfter = (rows: [string, number, number][]): string => `<div class="x-before-after">${rows.map(([k, a, b]) =>
  `<span>${esc(k)}</span><b>${money(a)}</b><span class="x-arrow" aria-label="to">→</span><b class="${b < 0 ? 'x-over' : ''}">${money(b)}</b>`).join('')}</div>`;

/** Install a document-level delegated listener once (screens re-render often; `after` runs each time). */
const installed = new Set<string>();
export function once(key: string, fn: () => void): void { if (!installed.has(key)) { installed.add(key); fn(); } }
