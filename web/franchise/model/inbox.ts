// Inbox: messages to the user's GM (results, injuries, growth, deals, league news, honours, scouting).
import type {InboxItem, LeagueState} from '../types.ts';
import {newId} from './util.ts';

export const INBOX_MAX = 400;

export function inbox(state: LeagueState, category: InboxItem['category'], title: string, body: string, ref?: InboxItem['ref']): InboxItem {
  const item: InboxItem = {id: newId(state, 'i'), season: state.season, week: state.week, category, title, body, ref, read: false};
  state.inbox.push(item);
  if (state.inbox.length > INBOX_MAX) {
    // drop the oldest read items first, then the oldest
    let drop = state.inbox.length - INBOX_MAX;
    state.inbox = state.inbox.filter(x => !(x.read && drop-- > 0));
    if (state.inbox.length > INBOX_MAX) state.inbox.splice(0, state.inbox.length - INBOX_MAX);
  }
  return item;
}

export function markRead(state: LeagueState, ids: string[] | 'all'): void {
  for (const it of state.inbox) if (ids === 'all' || ids.includes(it.id)) it.read = true;
}
