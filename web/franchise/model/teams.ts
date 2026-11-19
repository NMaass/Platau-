// The 16 original Plateau franchises (invented cities and nicknames).
import type {TeamId} from '../types.ts';

export const CONFERENCE_NAMES: [string, string] = ['Summit Conference', 'Tideline Conference'];
export const DIVISION_NAMES: [[string, string], [string, string]] = [['Highlands', 'Ember Coast'], ['Riverlands', 'Frost Reach']];

export interface TeamSeed { city: string; name: string; abbr: string; color: string; trainer: string }

/** Index i: conference = i >> 3, division = (i >> 2) & 1. Trainers are Showdown trainer sprite ids. */
export const TEAM_SEEDS: TeamSeed[] = [
  {city: 'Ashgrove', name: 'Embers', abbr: 'ASH', color: '#d9480f', trainer: 'blaine'},
  {city: 'Cobalt Ridge', name: 'Rockslides', abbr: 'COB', color: '#5c7cfa', trainer: 'roark'},
  {city: 'Harrowgate', name: 'Thornbacks', abbr: 'HAR', color: '#2b8a3e', trainer: 'gardenia'},
  {city: 'Kestrel Point', name: 'Galecrest', abbr: 'KES', color: '#15aabf', trainer: 'winona'},
  {city: 'Emberfall', name: 'Wyverns', abbr: 'EMB', color: '#c92a2a', trainer: 'lance'},
  {city: 'Lumenport', name: 'Lanterns', abbr: 'LUM', color: '#f59f00', trainer: 'elesa'},
  {city: 'Dunmere', name: 'Sandstriders', abbr: 'DUN', color: '#a07a3c', trainer: 'clay'},
  {city: 'Glimmerdale', name: 'Voltwings', abbr: 'GLI', color: '#fab005', trainer: 'volkner'},
  {city: 'Brinehaven', name: 'Tidecallers', abbr: 'BRI', color: '#1c7ed6', trainer: 'misty'},
  {city: 'Saltmarsh', name: 'Mudskippers', abbr: 'SAL', color: '#5f7d4e', trainer: 'crasherwake'},
  {city: 'Juniper Bay', name: 'Driftwoods', abbr: 'JUN', color: '#8d6e63', trainer: 'juan'},
  {city: 'Oakhollow', name: 'Moonhowls', abbr: 'OAK', color: '#7048e8', trainer: 'morty'},
  {city: 'Frostholm', name: 'Frostbite', abbr: 'FRO', color: '#74c0fc', trainer: 'candice'},
  {city: 'Northcliff', name: 'Ironhides', abbr: 'NOR', color: '#868e96', trainer: 'byron'},
  {city: 'Mistral Heights', name: 'Starfall', abbr: 'MIS', color: '#e64980', trainer: 'cynthia'},
  {city: 'Ironvale', name: 'Forgehammers', abbr: 'IRO', color: '#495057', trainer: 'jasmine'},
];

export const teamIdAt = (i: number): TeamId => `t${i}`;
