// End-to-end check of the real Plateau app (no ?fixture): build, serve web/ statically,
// start a league, lower the think budgets, Start season, Sim week 1 and Watch week 2 with
// the engine (no-spoiler replay walk), then visit every route (core + ui/routes.ts) at 1280 and 390 px;
// then start a Draft league and finish its startup draft with Sim to end.
// Fails on any console error, page error, or horizontal scroll at 390 px.
//   cd web && node franchise/scripts/e2e.mjs [--no-build] [--shots <dir>] [--headed]
// Needs Playwright (require('playwright') resolvable) with Chromium installed.
// play.pokemonshowdown.com is blocked on purpose (sandbox-safe): sprites fall back to
// PokeAPI and the replay viewer can't paint; errors from inside the replay iframe are ignored.
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const web = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;

// ---------------------------------------------------------------- build
if (!args.includes('--no-build')) {
  const b = spawnSync(process.execPath, ['franchise/scripts/build.mjs'], {cwd: web, stdio: 'inherit'});
  if (b.status !== 0) { console.error('build failed'); process.exit(1); }
}

// ---------------------------------------------------------------- serve web/
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

// ---------------------------------------------------------------- routes
const routesSrc = readFileSync(`${web}franchise/ui/routes.ts`, 'utf8');
const extra = [...routesSrc.matchAll(/^\s+(\w+):\s*\{\s*view:/gm)].map((m) => m[1]);
const core = ['week', 'opponent', 'roster', 'roster?lens=contracts', 'roster?lens=growth', 'lineup', 'settings', 'new'];
const routes = [...core, ...extra.filter((r) => !core.includes(r))];

// ---------------------------------------------------------------- browser
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire(`${process.cwd()}/`)('playwright'); }
const browser = await playwright.chromium.launch({headless: !args.includes('--headed')});
const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
const page = await ctx.newPage();
await page.route(/pokemonshowdown\.com/, (r) => r.abort());

const problems = [];
let where = 'boot';
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (/Failed to load resource/.test(m.text())) return;   // blocked/missing sprites: expected, boxes stay
  const loc = m.location()?.url ?? '';
  if (loc.startsWith('about:srcdoc')) return;              // inside the replay iframe (viewer host blocked)
  problems.push(`[${where}] console: ${m.text()}`);
});
page.on('pageerror', (e) => {
  if (/about:srcdoc/.test(e.stack ?? '') || /^\$ is not defined|^jQuery is not defined|BattleSound|Dex is not defined/.test(e.message)) return;
  problems.push(`[${where}] pageerror: ${e.message}`);
});

const step = (s) => { where = s; console.log('·', s); };
const settle = () => page.waitForTimeout(250);
async function checkScroll(label) {
  const o = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth}));
  if (o.sw > o.cw + 1) problems.push(`[${label}] horizontal scroll at ${o.cw}px: content is ${o.sw}px wide`);
}
async function checkRendered(label) {
  const broke = await page.$('#view .l-empty b');
  const t = broke ? await broke.textContent() : '';
  if (/Something went wrong/.test(t ?? '')) problems.push(`[${label}] screen crashed: ${await page.$eval('#view .l-empty span', (e) => e.textContent)}`);
}
async function shot(name) {
  if (!shotsDir) return;
  await page.screenshot({path: join(shotsDir, `${name}.png`), fullPage: true});
}
if (shotsDir) await mkdir(shotsDir, {recursive: true});

const idle = () => page.waitForFunction(() => { const d = document.getElementById('dlg'); return !d?.open || !d.querySelector('.fitbar'); }, null, {timeout: 300000});
/** Press a hero button on This week (mode: step | sim | watch) and wait for the sim to finish. */
async function playOnce(label, mode) {
  step(label);
  await page.goto(BASE + '#week'); await settle();
  if (await page.$('[data-act="until"]')) problems.push(`[${label}] Play until is still on This week`);
  await page.click(`[data-act="play"][data-mode="${mode}"]`); await settle();
  await idle();
}
/** New League wizard: 1 Pre-made teams / Draft, 2 the club (preview names it), 3 Start; then the intro plays and
 *  the team home (or the draft board) opens. `confirm`: a league is open, so Start asks first. */
async function wizard(mode, idx, city, confirm = false) {
  await page.waitForSelector('[data-nl="mode"]');
  if (await page.getAttribute('[data-nl="next"]', 'aria-disabled') !== 'true') problems.push('[wizard] Next is enabled before a choice');
  await page.click(`[data-nl="mode"][data-v="${mode}"]`);
  await page.click('[data-nl="next"]');
  await page.click(`[data-nl="team"][data-i="${idx}"]`);
  const np = await page.$eval('#h-np', (h) => h.textContent).catch(() => '');
  if (!np.includes(city)) problems.push(`[wizard ${mode}] preview shows "${np}", expected ${city}`);
  const backAt = await page.$eval('[data-nl="back"]', (b) => b.getBoundingClientRect().x);
  await page.click('[data-nl="next"]');
  const h1 = await page.$eval('#wz-body h1', (h) => h.textContent);
  if (!h1.includes(city)) problems.push(`[wizard ${mode}] step 3 shows "${h1}", expected ${city}`);
  if (await page.$eval('[data-nl="back"]', (b) => b.getBoundingClientRect().x) !== backAt) problems.push('[wizard] Back moved between steps');
  await page.click('[data-nl="start"]');
  if (confirm) {
    await page.waitForSelector('#dlg [data-dlg="ok"]');
    if (!/stays saved/.test(await page.$eval('#dlg', (d) => d.innerText))) problems.push('[new league] confirm does not say the current league stays saved');
    await page.click('#dlg [data-dlg="ok"]');
  }
  await page.waitForSelector('.l-intro', {timeout: 5000}).catch(() => problems.push('[wizard] no league-start intro'));
  await page.waitForSelector('.l-intro', {state: 'detached', timeout: 5000});
}

let exit = 0;
try {
  step('new league');
  await page.goto(BASE);
  await page.evaluate(async () => { indexedDB.deleteDatabase('plateau'); });
  await page.goto(BASE + '#new'); await page.reload();
  await wizard('premade', 5, 'Goldenrod');
  await page.waitForFunction(() => location.hash === '#week');
  await page.waitForSelector('#view h1');

  step('lower think budgets');
  await page.goto(BASE + '#settings'); await settle();
  for (const [k, v] of [['ai', '2'], ['human', '5']]) {
    await page.fill(`input[data-act="budget"][data-k="${k}"]`, v);
    await page.dispatchEvent(`input[data-act="budget"][data-k="${k}"]`, 'change');
  }

  await playOnce('preseason', 'step');
  if (await page.evaluate(() => document.getElementById('dlg')?.open)) problems.push(`[preseason] a dialog stayed open after Start season: ${await page.$eval('#dlg', (d) => d.innerText.slice(0, 120))}`);
  const w1 = await page.$eval('#view h1', (h) => h.textContent);
  if (!/Week 1/.test(w1 ?? '')) problems.push(`[preseason] expected Week 1 after Start season, got "${w1}"`);
  if (await page.$('#h-last')) problems.push('[week 1] an empty Last week panel before any game');
  // the hero: Set lineup, then two equal choices
  const sizes = await page.$$eval('.l-hero .btn.xl', (b) => b.map((x) => `${Math.round(x.getBoundingClientRect().height)}`));
  if (sizes.length !== 3 || new Set(sizes).size !== 1) problems.push(`[week 1] hero buttons: ${sizes.join(', ')} (want Set lineup + Watch week + Sim week, one height)`);
  await shot('hub-week1-before');
  const t0 = Date.now();
  await playOnce('week 1: sim', 'sim');
  console.log(`  week 1 simulated in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (!(await page.$('#dlg .score'))) problems.push('[week 1] Sim week did not show the series result');
  await shot('sim-result');
  await page.keyboard.press('Escape'); await settle();
  const wk = await page.$eval('#view h1', (h) => h.textContent);
  if (!/Week 2/.test(wk ?? '')) problems.push(`[week 1] expected Week 2 after playing, got "${wk}"`);

  // Watch week: sims, then opens game 1 in watch mode with no spoilers; walk to the series result
  await playOnce('week 2: watch', 'watch');
  await page.waitForFunction(() => /^#battle-.+\?watch=1$/.test(location.hash), null, {timeout: 10000}).catch(() => {});
  if (!/watch=1/.test(await page.evaluate(() => location.hash))) problems.push('[week 2] Watch week did not open the replay');
  else {
    if (await page.$('#h-box')) problems.push('[watch] the box score shows before the game is watched');
    await shot('watch-game1');
    for (let k = 0; k < 3 && !(await page.$('[data-watch="series"]')); k++) { await page.click('#view .l-actions a.btn.go[href*="watch=1"]'); await settle(); }
    await page.click('[data-watch="series"]'); await settle();
    if (!(await page.$('#dlg .score'))) problems.push('[watch] Series result did not open the result dialog');
    await page.click('#dlg [data-dlg="week"]');
    await page.waitForFunction(() => location.hash === '#week');
  }

  // pick a Pokémon page and a replay from what the week produced
  await page.goto(BASE + '#week'); await settle();
  const battle = await page.$eval('#view a[href^="#battle-"]', (a) => a.getAttribute('href')).catch(() => null);
  const mon = await page.$eval('#view a[href^="#mon-"]', (a) => a.getAttribute('href')).catch(() => null);
  if (!battle) problems.push('[week 2] no replay link on This week after a played week');
  await page.goto(BASE + '#roster'); await settle();
  const ownMon = await page.$eval('#view a[href^="#mon-"]', (a) => a.getAttribute('href')).catch(() => null);
  if (!ownMon) problems.push('[roster] no Pokémon links');
  // an opponent's Pokémon (scouting view) and one of ours (development view)
  const mons = [...new Set([mon, ownMon].filter(Boolean))].map((h) => h.slice(1));
  const all = [...routes, ...mons, ...(battle ? [battle.slice(1)] : [])];

  for (const [w, h] of [[1280, 900], [390, 844]]) {
    await page.setViewportSize({width: w, height: h});
    for (const r of all) {
      step(`#${r} @${w}`);
      await page.goto(BASE + '#' + r); await settle();
      await checkRendered(`#${r} @${w}`);
      if (w === 390) await checkScroll(`#${r} @${w}`);
      await shot(`${r.replace(/[^\w-]+/g, '_').slice(0, 40)}-${w}`);
    }
  }

  // the hosted replay viewer is blocked here: after ~10 s the frame says so, the box score stays
  if (battle) {
    await page.setViewportSize({width: 1280, height: 900});
    step('replay viewer timeout');
    await page.goto(BASE + battle); await settle();
    await page.waitForFunction(() => /couldn't load/.test(document.querySelector('#replay-host')?.textContent ?? ''), null, {timeout: 20000}).catch(() => {});
    const ok = await page.evaluate(() => /couldn't load/.test(document.querySelector('#replay-host')?.textContent ?? ''));
    const online = await page.evaluate(() => /Turn \d|Team preview/.test(document.querySelector('#replay-host')?.textContent ?? ''));
    if (!ok && !online) problems.push('[battle] the replay frame neither played nor said it could not load');
    if (!(await page.$('#h-box'))) problems.push('[battle] no box score next to the replay');
  }

  // Draft start: the league opens on the startup draft (empty rosters); Sim to end, then sign contracts
  await page.setViewportSize({width: 1280, height: 900});
  step('new league: Draft');
  await page.goto(BASE + '#new'); await settle();
  // a league is open: starting another asks first, and the open one stays saved
  await wizard('draft', 12, 'Eterna', true);
  await page.waitForFunction(() => location.hash === '#draft');
  await page.waitForSelector('[data-fo="simend"]');
  await checkRendered('#draft (startup)');
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    await page.setViewportSize({width: w, height: h});
    for (const r of ['week', 'roster', 'lineup', 'standings', 'draft']) {
      step(`startup draft #${r} @${w}`);
      await page.goto(BASE + '#' + r); await settle();
      await checkRendered(`startup #${r} @${w}`);
      if (w === 390) await checkScroll(`startup #${r} @${w}`);
    }
  }
  step('startup draft: sim to end');
  await page.click('[data-fo="simend"]'); await settle();
  await page.keyboard.press('Escape'); await settle();
  await page.click('[data-fo="startupdone"]');
  await page.waitForFunction(() => location.hash === '#roster'); await settle();
  await checkRendered('#roster after the startup draft');
  const n = await page.$$eval('#view a[href^="#mon-"]', (a) => new Set(a.map((x) => x.getAttribute('href'))).size);
  if (n !== 18) problems.push(`[startup draft] roster has ${n} Pokémon after the draft, expected 18`);
  await page.goto(BASE + '#week'); await settle();
  const ph = await page.$eval('#view h1', (h) => h.textContent);
  if (!/preseason/i.test(ph ?? '')) problems.push(`[startup draft] expected the preseason after the draft, got "${ph}"`);
  step('your leagues');
  await page.goto(BASE + '#settings'); await settle();
  const saves = await page.$$eval('#view [data-act="saveopen"]', (b) => b.length);
  if (saves !== 2) problems.push(`[your leagues] ${saves} saved leagues listed, expected 2`);
  await page.click('#view [data-act="saveopen"]:not([aria-disabled="true"])');
  await page.waitForFunction(() => location.hash === '#week'); await settle();
  const back = await page.$eval('#view h1', (h) => h.textContent);
  if (!/Week 3/.test(back ?? '')) problems.push(`[your leagues] reopening the first league shows "${back}", expected Week 3`);
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
} else console.log(`\nOK: ${routes.length} routes + Pokémon page + replay at 1280 and 390 px, no errors, no horizontal scroll`);
process.exit(exit);
