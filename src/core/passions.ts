import type { CatId, PassionId } from './types';

export const CATS: Record<CatId, string> = {
  mil: 'Milan',
  usa: 'US sports',
  mot: 'Motorsport',
  pol: 'Politics',
  spa: 'Space',
  out: 'Outdoor',
  cul: 'Crown, film & fashion',
  tech: 'Apple',
  int: 'World Cup & Olympics',
};

export interface Passion {
  id: PassionId;
  name: string;
  cat: CatId;
  /** Jan..Dec intensity, 0 pause .. 3 peak */
  heat: number[];
}

const p = (id: PassionId, name: string, cat: CatId, heat: number[]): Passion => ({ id, name, cat, heat });

export const PASSIONS: Passion[] = [
  p('elez', 'US Elections', 'pol', [1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 1]),
  p('milan', 'AC Milan', 'mil', [3, 3, 3, 3, 3, 1, 0, 2, 3, 3, 3, 3]),
  p('pats', 'New England Patriots', 'usa', [3, 1, 0, 1, 1, 0, 0, 1, 3, 3, 3, 3]),
  p('nfl', 'NFL', 'usa', [3, 3, 0, 1, 1, 0, 0, 1, 3, 3, 3, 3]),
  p('texas', 'Texas Longhorns', 'usa', [3, 0, 0, 0, 0, 0, 0, 1, 3, 3, 3, 2]),
  p('cfb', 'College Football', 'usa', [3, 0, 0, 0, 0, 0, 0, 1, 3, 3, 3, 3]),
  p('dodgers', 'Los Angeles Dodgers', 'usa', [0, 1, 2, 2, 2, 2, 2, 2, 3, 3, 1, 0]),
  p('mlb', 'MLB', 'usa', [0, 1, 2, 2, 2, 2, 2, 2, 3, 3, 1, 0]),
  p('nba', 'NBA', 'usa', [2, 2, 2, 3, 3, 3, 0, 0, 0, 1, 2, 2]),
  p('f1', 'Formula 1', 'mot', [0, 1, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3]),
  p('wec', 'WEC & Le Mans', 'mot', [0, 1, 1, 2, 1, 3, 1, 1, 2, 1, 2, 0]),
  p('dakar', 'Dakar Rally', 'mot', [3, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2]),
  p('more', 'More Sports', 'mot', [1, 3, 2, 2, 3, 2, 2, 2, 2, 2, 3, 2]),
  p('space', 'Human Spaceflight', 'spa', [2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2]),
  p('cicl', 'Cycling', 'out', [1, 2, 3, 3, 3, 2, 3, 2, 3, 2, 1, 0]),
  p('sci', 'Alpine Skiing', 'out', [3, 3, 3, 1, 0, 0, 0, 0, 0, 2, 2, 3]),
  p('tennis', 'Tennis Grand Slams', 'out', [3, 0, 0, 0, 2, 3, 3, 1, 3, 0, 0, 0]),
  p('ac', "America's Cup", 'out', [0, 0, 1, 1, 2, 2, 3, 3, 1, 0, 0, 0]),
  p('royal', 'The Royal Family', 'cul', [1, 1, 1, 1, 2, 3, 1, 0, 0, 1, 2, 3]),
  p('awards', 'Awards Season', 'cul', [3, 3, 3, 0, 1, 0, 0, 0, 1, 1, 2, 3]),
  p('fashion', 'Fashion Weeks', 'cul', [3, 3, 3, 0, 0, 2, 2, 0, 3, 3, 0, 0]),
  p('wc', 'World Cup & Euros', 'int', [0, 0, 2, 0, 0, 2, 1, 0, 2, 2, 2, 1]),
  p('oly', 'Olympic Games', 'int', [1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1]),
  p('apple', 'Apple', 'tech', [0, 1, 1, 0, 0, 3, 0, 0, 3, 2, 1, 0]),
];

export const PASSION: Record<PassionId, Passion> = Object.fromEntries(PASSIONS.map(x => [x.id, x])) as Record<PassionId, Passion>;

export const catColor = (c: CatId) => `var(--c-${c})`;
export const passionColor = (id: PassionId) => catColor(PASSION[id].cat);
