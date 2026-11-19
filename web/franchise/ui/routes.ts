// Screen registry for screens outside the core loop (league / front office).
// A screen module exports its view (+ after) functions and is registered here, so app.ts
// needs no edits: ROUTES[path] = {view: (r) => html, after?: (r) => void}.
import type {Route} from './router.ts';
import {viewStandings, viewPlayoffs, viewSchedule, viewHistory, afterLeague} from './screens/league.ts';
import {viewScouting, viewDraft, afterDraft} from './screens/draft.ts';
import {viewTrades, viewOffers, viewFreeAgents, afterMoves} from './screens/moves.ts';
export interface Screen { view: (r: Route) => string; after?: (r: Route) => void }
export const ROUTES: Record<string, Screen> = {
  standings: {view: viewStandings, after: afterLeague},
  playoffs: {view: viewPlayoffs, after: afterLeague},
  schedule: {view: viewSchedule, after: afterLeague},
  history: {view: viewHistory, after: afterLeague},
  scouting: {view: viewScouting, after: afterDraft},
  draft: {view: viewDraft, after: afterDraft},
  trades: {view: viewTrades, after: afterMoves},
  offers: {view: viewOffers, after: afterMoves},
  freeagents: {view: viewFreeAgents, after: afterMoves},
};
