// Catalog loaders. The catalog is static JSON built by franchise/scripts/build-catalog.ts.
import type {Catalog} from '../types.ts';

/** Repo-relative path of the built catalog. */
export const CATALOG_PATH = 'web/franchise/data/catalog.json';

function check(c: Catalog): Catalog {
  if (!c || typeof c !== 'object' || !c.species || typeof c.version !== 'string') throw new Error('not a Plateau catalog');
  return c;
}

/** Node: read the catalog from the repo (repoRoot with or without a trailing slash). */
export async function loadCatalogNode(repoRoot: string): Promise<Catalog> {
  const {readFileSync} = await import('node:fs');
  const root = repoRoot.endsWith('/') ? repoRoot : `${repoRoot}/`;
  return check(JSON.parse(readFileSync(`${root}${CATALOG_PATH}`, 'utf8')));
}

/** Browser: fetch the catalog (e.g. fetchCatalog('data/catalog.json')). */
export async function fetchCatalog(url: string): Promise<Catalog> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status} ${url}`);
  return check(await res.json() as Catalog);
}
