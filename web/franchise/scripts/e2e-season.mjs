// End-to-end season of the real Plateau app with Settings → Fast sim (no battles): start a league,
// Sim week from This week up to every stop of a season (deadline, end of the regular season, the
// Indigo Plateau, the draft; offseason steps with the hero's one button), the draft (one pick by hand, sim the
// rest), re-signing (re-sign + franchise tag), free agency (one rejected and one accepted offer),
// into the next preseason; then a save export/import round trip. Checks league invariants on the
// way (standings add up, rosters at 18 in season, history and awards written, rookies on rosters)
// and fails on any console error or page error.
//   cd web && node franchise/scripts/e2e-season.mjs [--no-build] [--headed]
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile, mkdtemp} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const web = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (!args.includes('--no-build')) {
  const b = spawnSync(process.execPath, ['franchise/scripts/build.mjs'], {cwd: web, stdio: 'inherit'});
  if (b.status !== 0) { console.error('build failed'); process.exit(1); }
}
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.map': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'};
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(web, normalize(p));
  if (!f.startsWith(web)) { res.writeHead(403); res.end(); return; }
  try { const body = await readFile(f); res.writeHead(200, {'content-type': TYPES[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store'}); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/dist/franchise/`;

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire(`${process.cwd()}/`)('playwright'); }
const browser = await playwright.chromium.launch({headless: !args.includes('--headed')});
const ctx = await browser.newContext({viewport: {width: 1280, height: 900}, acceptDownloads: true});
const page = await ctx.newPage();
await page.route(/pokemonshowdown\.com/, (r) => r.abort());

const problems = [];
let where = 'boot';
page.on('console', (m) => {
  if (m.type() !== 'error' || /Failed to load resource/.test(m.text())) return;
  if ((m.location()?.url ?? '').startsWith('about:srcdoc')) return;
  problems.push(`[${where}] console: ${m.text()}`);
});
page.on('pageerror', (e) => {
  if (/about:srcdoc/.test(e.stack ?? '') || /^\$ is not defined|^jQuery is not defined|BattleSound|Dex is not defined/.test(e.message)) return;
  problems.push(`[${where}] pageerror: ${e.message}`);
});
const step = (s) => { where = s; console.log('·', s); };
const settle = () => page.waitForTimeout(200);
const dlgOpen = () => page.$eval('#dlg', (d) => d.open).catch(() => false);
const closeDlg = async () => { if (await dlgOpen()) { await page.keyboard.press('Escape'); await settle(); } };
const dlgText = () => page.$eval('#dlg', (d) => d.innerText);
const fail = (msg) => problems.push(`[${where}] ${msg}`);

/** The saved league, read back from IndexedDB (what a reload would load). */
const state = () => page.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('plateau', 1);
  r.onsuccess = () => {
    const os = r.result.transaction('saves').objectStore('saves');
    const g = os.get('last');
    g.onsuccess = () => { const q = os.get('league:' + g.result); q.onsuccess = () => res(q.result); };
  };
  r.onerror = () => rej(r.error);
}));

async function invariants(label, {rosters = false} = {}) {
  const s = await state();
  const tally = {};
  for (const se of s.schedule) if (!se.playoff && se.winnerId && se.season === s.season) {
    for (const t of [se.homeId, se.awayId]) { tally[t] ??= {w: 0, l: 0}; if (se.winnerId === t) tally[t].w++; else tally[t].l++; }
    const need = Math.floor(se.bestOf / 2) + 1;
    if (se.games.filter((g) => g.winnerTeamId === se.winnerId).length !== need) fail(`${label}: series ${se.id} winner does not have ${need} wins`);
  }
  const W = Object.values(tally).reduce((a, x) => a + x.w, 0), L = Object.values(tally).reduce((a, x) => a + x.l, 0);
  if (W !== L) fail(`${label}: standings don't add up (${W} wins, ${L} losses)`);
  const count = {};
  for (const m of Object.values(s.mons)) {
    if (m.retired && m.teamId) fail(`${label}: retired ${m.id} still on ${m.teamId}`);
    if (m.teamId && !m.contract) fail(`${label}: ${m.id} on ${m.teamId} has no contract`);
    if (m.teamId && m.tier !== 'ir') count[m.teamId] = (count[m.teamId] ?? 0) + 1;
  }
  if (rosters) for (const [t, n] of Object.entries(count)) if (n !== 18) fail(`${label}: ${t} carries ${n}, not 18`);
  for (const t of Object.values(s.teams)) for (const sl of t.lineup.slots) if (sl.monId && s.mons[sl.monId]?.teamId !== t.id) fail(`${label}: ${t.id} lineup has ${sl.monId} from another club`);
  return s;
}

const idle = () => page.waitForFunction(() => { const d = document.getElementById('dlg'); return !d?.open || !d.querySelector('.fitbar'); }, null, {timeout: 120000});
/** One press of the hero on This week: Sim week in game weeks, the one step button otherwise.
 *  Confirms auto-picks and the season-opening release; closes any result dialog. */
async function playOnce() {
  await closeDlg();
  await page.goto(BASE + '#week'); await settle();
  const b = (await page.$('[data-act="play"][data-mode="sim"]')) ?? (await page.$('[data-act="play"][data-mode="step"]'));
  if (!b) { fail('no Sim week / step button on This week'); return; }
  if (await page.$('[data-act="until"]')) fail('Play until is still on This week');
  await b.click(); await settle();
  await idle();
  if (await dlgOpen() && /Auto-pick/.test(await dlgText())) {
    await page.click('#dlg [data-dlg="ok"]'); await page.waitForTimeout(400);
    await idle();
  }
  // the season can't open with more than 18: Start season lists who goes and releases them only on confirm
  if (await page.$('#dlg ul[aria-label="Released"]')) {
    const n = await page.$$eval('#dlg ul[aria-label="Released"] li', (x) => x.length);
    step(`release ${n} to open the season`);
    const before = await state();
    const over = Object.values(before.mons).filter((m) => m.teamId === before.userTeamId && m.tier !== 'ir').length - 18;
    if (n !== over) fail(`release list has ${n}, roster is ${over} over`);
    await page.click('#dlg [data-dlg="ok"]'); await page.waitForTimeout(400);   // releases, then the season starts
    await idle();
  }
  // an offseason step that moved on leaves no dialog behind (no empty "moved on" message)
  if (await dlgOpen() && /Moved on/.test(await dlgText())) fail(`a no-content dialog after a step: ${(await dlgText()).slice(0, 120)}`);
  await closeDlg();
}
const STOP = {
  deadline: (s) => s.phase === 'regular' && s.week >= s.settings.tradeDeadlineWeek,
  regular: (s) => s.phase === 'playoffs',
  plateau: (s) => s.phase === 'awards',
  draft: (s) => s.phase === 'draft',
};
/** Sim (or step) until a point on the calendar. */
async function playUntil(target) {
  step(`sim until ${target}`);
  for (let i = 0; i < 40; i++) {
    if (STOP[target](await state())) return;
    await playOnce();
  }
  fail(`never reached ${target}`);
}
async function continueOnce(label) {
  step(label);
  await playOnce();
}
async function negotiate(nth, clicks, dir) {
  const ns = await page.$$('#view [data-fo="negotiate"]');
  if (!ns[nth]) { fail(`no Negotiate/Re-sign button #${nth}`); return ''; }
  await ns[nth].click(); await settle();
  for (let i = 0; i < clicks; i++) await page.click(`#dlg [data-dlg="${dir}"]`);
  await page.click('#dlg [data-dlg="offer"]'); await settle();
  const r = await page.$eval('#dlg .x-reply', (e) => e.innerText);
  await closeDlg();
  return r;
}
const phaseOf = async () => (await state()).phase;

let exit = 0;
try {
  step('new league');
  await page.goto(BASE);
  await page.evaluate(() => indexedDB.deleteDatabase('plateau'));
  await page.goto(BASE + '#new'); await page.reload();
  // New League wizard: Pre-made teams → Lavaridge → Start (the intro plays, then the team home)
  await page.click('[data-nl="mode"][data-v="premade"]');
  await page.click('[data-nl="next"]');
  await page.click('[data-nl="team"][data-i="9"]');
  await page.click('[data-nl="next"]');
  await page.click('[data-nl="start"]');
  await page.waitForFunction(() => location.hash === '#week');
  await page.waitForSelector('.l-intro', {state: 'detached', timeout: 5000});
  await page.waitForSelector('#view h1');

  step('turn on fast sim');
  await page.goto(BASE + '#settings'); await settle();
  await page.click('[data-act="fastsim"][data-v="1"]');
  if (await page.getAttribute('[data-act="fastsim"][data-v="1"]', 'aria-pressed') !== 'true') fail('Fast sim toggle did not turn on');

  await playUntil('deadline');
  let s = await invariants('deadline', {rosters: true});
  if (!(s.phase === 'regular' && s.week === s.settings.tradeDeadlineWeek)) fail(`deadline stop at ${s.phase} week ${s.week}`);
  await playUntil('regular');
  s = await invariants('end of regular season', {rosters: true});
  if (s.phase !== 'playoffs') fail(`regular season stop at ${s.phase}`);
  await playUntil('plateau');
  s = await invariants('after the Plateau');
  if (s.phase !== 'awards' || s.history.length !== 1 || !s.history[0].awards.length) fail('no champion/awards after the Indigo Plateau');
  await playUntil('draft');
  if (await phaseOf() !== 'draft') fail('did not stop at the draft');

  step('draft');
  await page.goto(BASE + '#draft'); await settle();
  await page.click('[data-sort^="board:age"]'); await settle();   // the board sorts
  const sim = await page.$('[data-fo="simmine"]:not([aria-disabled="true"])');
  if (sim) { await sim.click(); await settle(); await closeDlg(); }
  const pick = await page.$('[data-fo="draft"]:not([aria-disabled="true"])');
  if (!pick) fail('no Draft button on the clock');
  else {
    await pick.click(); await settle();
    await page.click('#dlg .btn.go'); await settle();
    if (!/You drafted/.test(await dlgText())) fail('hand pick did not land');
    await closeDlg();
  }
  await continueOnce('finish the draft');
  s = await state();
  if (s.phase !== 'resign') fail(`after the draft: ${s.phase}`);
  const rookies = Object.values(s.mons).filter((m) => m.teamId === s.userTeamId && m.draft?.season === 1);
  if (rookies.length < 1) fail('no rookies joined the roster');

  step('re-sign and tag');
  await page.goto(BASE + '#freeagents'); await settle();
  const resigned = await negotiate(0, 4, 'up');
  if (!/re-signs/.test(resigned)) fail(`re-sign failed: ${resigned}`);
  const tag = await page.$('#view [data-fo="tag"]');
  if (tag) {
    await tag.click(); await settle();
    const go = await page.$('#dlg [data-dlg="tag"]');
    if (go) { await go.click(); await settle(); if (!/tagged/.test(await dlgText())) fail('franchise tag failed'); }
    await closeDlg();
    // the tag is used: every remaining Tag button stays in place, disabled
    if (go) for (const b of await page.$$('#view [data-fo="tag"]')) if (await b.getAttribute('aria-disabled') !== 'true') fail('Tag button still enabled after the tag was used');
  }
  await continueOnce('open free agency');
  step('free agency');
  await page.goto(BASE + '#freeagents'); await settle();
  const low = await negotiate(0, 30, 'dn');
  if (!/No deal/.test(low)) fail(`a lowball offer was not rejected: ${low}`);
  // payrolls start near the cap (85–95%), so walk down the list to someone the club can afford
  let signed = '';
  // (over the cap only minimum deals fit: Send offer stays disabled with the reason, so try the next one)
  for (let nth = 6; nth < 40 && !/signs/.test(signed); nth++) signed = await negotiate(nth, 6, 'up');
  if (!/signs/.test(signed)) fail(`signing failed: ${signed}`);
  for (let i = 0; i < 4 && (await phaseOf()) !== 'preseason'; i++) await continueOnce(`free agency round ${i + 1}`);
  s = await invariants('next preseason');
  if (!(s.season === 2 && s.phase === 'preseason')) fail(`expected season 2 preseason, got season ${s.season} ${s.phase}`);
  await continueOnce('season 2 opens');
  await invariants('season 2 week 1', {rosters: true});

  step('in season: roster full is said before any offer, then release and sign');
  await page.goto(BASE + '#freeagents'); await settle();
  const neg = await page.$('#view [data-fo="negotiate"]');
  if (!neg) fail('no free agent to negotiate with in season');
  else {
    await neg.click(); await settle();
    const note = await page.$eval('#dlg .x-note', (e) => e.innerText).catch(() => '');
    if (!/Roster full/.test(note)) fail(`full roster: no note before the offer (got "${note}")`);
    if (await page.getAttribute('#dlg [data-dlg="offer"]', 'aria-disabled') !== 'true') fail('Send offer enabled on a full roster');
    if (!(await page.$('#dlg a[data-dlg="release"]'))) fail('no "Release someone" in the Negotiate dialog');
    await closeDlg();
  }
  await page.goto(BASE + '#roster'); await settle();
  const rel = (await page.$$('#view [data-act="release"]')).at(-1);
  if (!rel) fail('no Release action on the roster');
  else {
    await rel.click(); await settle();
    if (!/Dead money/.test(await dlgText())) fail('release confirm does not show dead money');
    await page.click('#dlg [data-dlg="release"]'); await settle();
    if (!/released/.test(await dlgText())) fail('release did not go through');
    await closeDlg();
    s = await state();
    const n = Object.values(s.mons).filter((m) => m.teamId === s.userTeamId && m.tier !== 'ir').length;
    if (n !== 17) fail(`after a release the roster has ${n}, expected 17`);
    await page.goto(BASE + '#freeagents'); await settle();
    let ok = '';
    for (let nth = 0; nth < 30 && !/signs/.test(ok); nth++) ok = await negotiate(nth, 0, 'up');
    if (!/signs/.test(ok)) fail(`in-season signing after a release failed: ${ok}`);
  }

  step('export / import');
  const before = JSON.stringify(await state());
  await page.goto(BASE + '#settings'); await settle();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
  const file = join(await mkdtemp(join(tmpdir(), 'plateau-')), 'save.json');
  await dl.saveAs(file);
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('plateau'); q.onsuccess = q.onerror = q.onblocked = () => r(1); }));
  await page.goto(BASE + '#settings'); await page.reload(); await settle();
  await page.setInputFiles('#importFile', file);
  await page.waitForFunction(() => location.hash === '#week', null, {timeout: 10000});
  if (JSON.stringify(await state()) !== before) fail('imported save differs from the exported one');

  step('visit screens');
  for (const r of ['week', 'roster', 'lineup', 'standings', 'playoffs', 'schedule', 'history', 'draft', 'scouting', 'trades', 'offers', 'freeagents']) {
    where = `#${r}`;
    await page.goto(BASE + '#' + r); await settle();
    const broke = await page.$('#view .l-empty b');
    if (broke && /Something went wrong/.test(await broke.textContent())) fail('screen crashed');
  }
} catch (e) {
  problems.push(`[${where}] ${e.message}`);
} finally {
  await browser.close();
  server.close();
}
if (problems.length) {
  console.error(`\nFAIL: ${problems.length} problem(s)`);
  for (const p of problems) console.error('  ' + p);
  exit = 1;
} else console.log('\nOK: a fast-sim season, draft, re-signing, free agency and save round trip, no errors');
process.exit(exit);
