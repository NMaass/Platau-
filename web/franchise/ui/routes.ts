// Screen registry for screens outside the core loop (league / front office).
// A screen module does: ROUTES.standings = {view: (r) => html, after?: (r) => void}
// and app.ts imports that module so it is bundled.
import type {Route} from './router.ts';
export interface Screen { view: (r: Route) => string; after?: (r: Route) => void }
export const ROUTES: Record<string, Screen> = {};
