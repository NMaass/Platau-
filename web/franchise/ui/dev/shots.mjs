// Dev: screenshot screens from saves made by make-save.ts, at 1280 and 390, light and dark.
//   node franchise/ui/dev/shots.mjs <baseUrl> <outDir> <save.json>:<route,route,...> [...]
// Each save is imported through the app's own Import (Settings), then each route is shot.
// Also reports horizontal page scroll (must be none at 390).
import {createRequire} from 'node:module';
// playwright is installed globally here: NODE_PATH=$(npm root -g) node franchise/ui/dev/shots.mjs ...
const {chromium} = createRequire(import.meta.url)('playwright');
import {mkdirSync} from 'node:fs';
import {basename} from 'node:path';

const [base, out, ...jobs] = process.argv.slice(2);
mkdirSync(out, {recursive: true});
const browser = await chromium.launch();
const problems = [];
for (const job of jobs) {
  const [file, routes] = job.split(':');
  const tag = basename(file, '.json').replace(/^save-/, '');
  for (const scheme of ['light', 'dark']) for (const width of [1280, 390]) {
    const ctx = await browser.newContext({viewport: {width, height: 900}, colorScheme: scheme, deviceScaleFactor: 1});
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`${tag} ${width}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/sprites|Failed to load resource/.test(m.text())) problems.push(`${tag} ${width} console: ${m.text()}`); });
    await page.goto(base + '#settings');
    await page.waitForSelector('#importFile', {state: 'attached'});
    await page.setInputFiles('#importFile', file);
    await page.waitForFunction(() => location.hash === '#week');
    for (const r of routes.split(',')) {
      await page.goto(base + '#' + r);
      await page.waitForTimeout(250);
      const sx = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (sx > 0) problems.push(`${tag} #${r} ${width} ${scheme}: horizontal page scroll ${sx}px`);
      await page.screenshot({path: `${out}/${tag}-${r}-${width}-${scheme}.png`, fullPage: true});
    }
    await ctx.close();
  }
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'no problems');
