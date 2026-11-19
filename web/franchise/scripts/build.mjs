// Builds Plateau into web/dist/franchise/: index.html, app.js, plateau-tokens.css,
// screens.css, sim-worker.js (+ the engine wasm next to it) and data/catalog.json.
//   cd web && node franchise/scripts/build.mjs [--serve] [--minify]
// --serve watches and serves web/ on :8976 -> http://127.0.0.1:8976/dist/franchise/
import {build, context} from 'esbuild';
import {copyFileSync, existsSync, mkdirSync, watch} from 'node:fs';
import {fileURLToPath} from 'node:url';

const web = fileURLToPath(new URL('../../', import.meta.url));
const fr = `${web}franchise/`;
const out = `${web}dist/franchise/`;
const repo = `${web}../`;
mkdirSync(`${out}data`, {recursive: true});

function copyStatic() {
  copyFileSync(`${fr}index.html`, `${out}index.html`);
  copyFileSync(`${fr}design/plateau-tokens.css`, `${out}plateau-tokens.css`);
  copyFileSync(`${fr}ui/screens.css`, `${out}screens.css`);
  const wasm = `${repo}engine/pkg/rollmons_engine_bg.wasm`;
  if (existsSync(wasm)) copyFileSync(wasm, `${out}rollmons_engine_bg.wasm`);
  else console.warn('engine wasm missing (build engine/ first); battles fall back to the quick sim');
  const cat = `${fr}data/catalog.json`;
  if (existsSync(cat)) copyFileSync(cat, `${out}data/catalog.json`);
  else console.warn('franchise/data/catalog.json missing; only ?fixture=1 works');
}
copyStatic();

const entryPoints = {app: `${fr}app.ts`};
if (existsSync(`${fr}sim/worker.ts`)) entryPoints['sim-worker'] = `${fr}sim/worker.ts`;

const options = {
  entryPoints,
  outdir: out,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  loader: {'.json': 'json'},
  minify: process.argv.includes('--minify'),
  sourcemap: !process.argv.includes('--minify'),
  logLevel: 'info',
};

if (process.argv.includes('--serve')) {
  const ctx = await context(options);
  await ctx.watch();
  for (const f of [`${fr}index.html`, `${fr}design/plateau-tokens.css`, `${fr}ui/screens.css`]) watch(f, () => { try { copyStatic(); } catch { /* mid-write */ } });
  const {hosts, port} = await ctx.serve({servedir: web, port: 8976});
  console.log(`plateau: http://${hosts[0]}:${port}/dist/franchise/   (dev fixture: ?fixture=1)`);
} else {
  await build(options);
}
