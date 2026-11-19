// Fixed-width marks: role badge ("ATK | 88"), grade chip (F..AAA), IV summary,
// status tags, type chips. Widths come from the design system tokens
// (--rb-r-w, --rb-n-w, --rb-full-w, --rb-range-w, --grade-w), so every mark of a
// kind is the same size and an AAA or a 4-letter role never widens a column.
import type {Grade, IvGrade, Mon, Role, StatId, CatalogSpecies} from '../../types.ts';
import {ROLE_ABBR, ROLE_LABEL} from '../../catalog/roles.ts';
import {esc, ic} from '../dom.ts';
import {prow} from './layer.ts';

export interface BadgeOpts {
  /** show the role's full name (lineup cards, Pokémon page) instead of the 3-4 letter code */
  full?: boolean;
  sm?: boolean; lg?: boolean;
  /** peek content (HTML of the popover); omitted = no peek */
  pop?: string;
  /** shown dimmed (e.g. scouted/unknown) */
  ghost?: boolean;
  /** playing off-role (its best set, not the slot's role): dashed outline, same size */
  off?: boolean;
}

/** Role badge: role | OVR. role null = "No set" placeholder of the same height. */
export function roleBadge(role: Role | null, ovr: number | null, o: BadgeOpts = {}): string {
  if (!role || ovr == null) return `<span class="noset${o.full ? ' full' : ''}${o.sm ? ' sm' : ''}">No set</span>`;
  const cls = 'rb' + (ovr >= 90 ? ' elite' : '') + (o.full ? ' full' : '') + (o.sm ? ' sm' : '') + (o.lg ? ' lg' : '') + (o.ghost ? ' ghost' : '') + (o.off ? ' off' : '');
  const label = `${o.off ? 'Off-role: ' : ''}${ROLE_LABEL[role]} ${ovr}`;
  const inner = `<span class="${cls}"${o.pop ? '' : ` role="img" aria-label="${esc(label)}"`}><span class="rb-r"${o.pop ? '' : ' aria-hidden="true"'}>${esc(o.full ? ROLE_LABEL[role] : ROLE_ABBR[role])}</span><span class="rb-n"${o.pop ? '' : ' aria-hidden="true"'}>${o.pop ? `<span>${ovr}</span>` : ovr}</span></span>`;
  return o.pop ? `<span class="peek" tabindex="0" aria-label="${esc(label)}">${inner}<span class="pop">${o.pop}</span></span>` : inner;
}

/** Range badge for prospects / unscouted: role | 68–81. Fixed width (--rb-range-w) so narrowing never shifts. */
export function rangeBadge(role: Role, lo: number, hi: number, o: BadgeOpts = {}): string {
  const txt = lo === hi ? String(lo) : `${lo}–${hi}`;
  return `<span class="rb range${o.sm ? " sm" : ""}${o.full ? " full" : ""}" role="img" aria-label="${esc(ROLE_LABEL[role])} ${lo} to ${hi}"><span class="rb-r" aria-hidden="true">${esc(o.full ? ROLE_LABEL[role] : ROLE_ABBR[role])}</span><span class="rb-n" aria-hidden="true">${txt}</span></span>`;
}

/** Grade chip F..AAA, fixed width. */
export const gradeChip = (g: Grade | IvGrade, attrs = ''): string => `<span class="grade g${g}"${attrs}>${g}</span>`;

const STAT_LBL: Record<StatId, string> = {hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'};
const STATS: StatId[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

/** IV summary: headline grade + one line (strong/weak among invested stats), full table in a peek. */
export function ivSummary(mon: Mon, sp: CatalogSpecies | undefined, headline: IvGrade): string {
  const inv = sp?.investedStats?.length ? sp.investedStats : STATS;
  const strong = inv.filter((k) => mon.ivs[k] === 'A').map((k) => STAT_LBL[k]);
  const weak = inv.filter((k) => mon.ivs[k] === 'D' || mon.ivs[k] === 'F').map((k) => STAT_LBL[k]);
  const line = strong.length ? `Strong in ${strong.join(', ')}` : weak.length ? `Weak in ${weak.join(', ')}` : 'Even spread';
  const pop = `<strong>IVs</strong>${STATS.map((k) => prow(STAT_LBL[k] + (inv.includes(k) ? '' : ' (not used)'), gradeChip(mon.ivs[k]))).join('')}<span>Only stats its sets invest in count. IVs are fixed for life and cap how high the EV grade can go.</span>`;
  return `<span class="l-row">${gradeChip(headline)}<span>${esc(line)}</span><button type="button" class="info peek" aria-label="IV details">i<span class="pop">${pop}</span></button></span>`;
}

/** Status tag (injury, expiring, focus): icon + word, inline next to a name. */
export function injuryTag(mon: Mon): string {
  const inj = mon.injury;
  if (!inj) return '';
  if (inj.kind === 'day-to-day') return `<span class="tag t-dtd" title="${esc(inj.description)}">${ic('pulse')}Day-to-day</span>`;
  if (inj.kind === 'ir') return `<span class="tag t-ir" title="${esc(inj.description)}">${ic('health')}IR</span>`;
  return `<span class="tag t-out" title="${esc(inj.description)}">${ic('health')}Out ${inj.weeksLeft} wk</span>`;
}
export const expiringTag = (): string => `<span class="tag t-exp">${ic('clock')}Expiring</span>`;
export const typeChips = (types: string[]): string => types.map((t) => `<span class="type ty-${esc(t.toLowerCase())}">${esc(t)}</span>`).join('');

/** Event chip (category colour + icon + word). cat: health growth decline deal league honour scout */
export const eventChip = (cat: string, icon: string, word: string): string => `<span class="chip c-${cat}">${ic(icon)}${esc(word)}</span>`;
