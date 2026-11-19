// End-to-end check of the real Plateau app (no ?fixture): build, serve web/ statically,
// start a league, lower the think budgets, play the preseason step and one week with
// the engine, then visit every route (core + ui/routes.ts) at 1280 and 390 px.
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

async function playOnce(label) {
  step(label);
  await page.goto(BASE + '#week'); await settle();
  await page.click('[data-act="play"]');
  await page.waitForFunction(() => { const d = document.getElementById('dlg'); return d?.open && !d.querySelector('.fitbar'); }, null, {timeout: 300000});
  await page.keyboard.press('Escape');
}

let exit = 0;
try {
  step('new league');
  await page.goto(BASE);
  await page.evaluate(async () => { indexedDB.deleteDatabase('plateau'); });
  await page.goto(BASE + '#new'); await page.reload();
  await page.waitForSelector('[data-act="newleague"]');
  await page.click('[data-act="pickteam"][data-i="5"]');
  await page.click('[data-act="newleague"]');
  await page.waitForSelector('#view h1');

  step('lower think budgets');
  await page.goto(BASE + '#settings'); await settle();
  for (const [k, v] of [['ai', '2'], ['human', '5']]) {
    await page.fill(`input[data-act="budget"][data-k="${k}"]`, v);
    await page.dispatchEvent(`input[data-act="budget"][data-k="${k}"]`, 'change');
  }

  await playOnce('preseason');
  const t0 = Date.now();
  await playOnce('week 1');
  console.log(`  week 1 simulated in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const wk = await page.$eval('#view h1', (h) => h.textContent);
  if (!/Week 2/.test(wk ?? '')) problems.push(`[week 1] expected Week 2 after playing, got "${wk}"`);

  step('practice focus');
  await page.goto(BASE + '#week'); await settle();
  await page.click('[data-act="focus"]');
  for (const b of (await page.$$('#dlg [data-pick]')).slice(0, 2)) await b.click();
  await page.click('#dlg [data-dlg="save"]'); await settle();

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
