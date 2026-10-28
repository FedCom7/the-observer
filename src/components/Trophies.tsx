import { useState } from 'react';

export type TrophyKind = 'scudetto' | 'scudettoN' | 'bigears' | 'bigearsN' | 'coppa' | 'supercoppa' | 'cwc' | 'supercup' | 'latin' | 'interc' | 'club' | 'serieb';

/** The last cup of a kind carries the running total in it; it still counts as the same trophy. */
const BASE: Partial<Record<TrophyKind, TrophyKind>> = { scudettoN: 'scudetto', bigearsN: 'bigears' };

const GOLD = '#e3bf63';

/** Kinds of trophy in the order they are listed, with how a competition in the data maps to them. */
export const TROPHIES: { kind: TrophyKind; label: string; match: RegExp }[] = [
  { kind: 'bigears', label: 'European Cup / Champions League', match: /European Cup \/|Champions League/ },
  { kind: 'scudetto', label: 'Serie A (scudetto)', match: /^Serie A$/ },
  { kind: 'coppa', label: 'Coppa Italia', match: /^Coppa Italia/ },
  { kind: 'supercoppa', label: 'Supercoppa Italiana', match: /^Supercoppa/ },
  { kind: 'club', label: 'FIFA Club World Cup', match: /Club World/ },
  { kind: 'interc', label: 'Intercontinental Cup', match: /Intercontinental/ },
  { kind: 'supercup', label: 'UEFA Super Cup', match: /Super Cup/ },
  { kind: 'cwc', label: "Cup Winners' Cup", match: /Cup Winners/ },
  { kind: 'latin', label: 'Latin Cup', match: /Latin Cup/ },
  { kind: 'serieb', label: 'Serie B', match: /^Serie B/ },
];

type Pt = [number, number];
/** A closed outline from its left half (top to bottom), mirrored around x = cx. */
const sym = (left: Pt[], cx: number) => {
  const right = [...left].reverse().map(([x, y]): Pt => [2 * cx - x, y]);
  return 'M' + [...left, ...right].map(([x, y]) => `${x} ${y}`).join('L') + 'Z';
};
const poly = (pts: Pt[]) => 'M' + pts.map(([x, y]) => `${x} ${y}`).join('L') + 'Z';
const flip = (pts: Pt[], cx: number): Pt[] => pts.map(([x, y]): Pt => [2 * cx - x, y]);
const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;
const star = (cx: number, cy: number, r: number) => poly(Array.from({ length: 10 }, (_, i): Pt => { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r * 0.42 : r; return [+(cx + k * Math.cos(a)).toFixed(2), +(cy + k * Math.sin(a)).toFixed(2)]; }));

/** Digits in the plaque's lettering: heavy flat strokes, slightly slanted. One cell is 12 x 20. */
const DIGITS: Record<string, string> = {
  '0': 'M6 2C2.5 2 2 6 2 10s.5 8 4 8 4-4 4-8-.5-8-4-8Z',
  '1': 'M2.5 6.5L7 2V18',
  '2': 'M2 5C2 2.5 4 2 6 2s4 1 4 3.5C10 9 2 13 2 18H10.5',
  '3': 'M2 2H10L5.5 8.5C9 8.5 10.5 10.5 10.5 13.5S8.5 18 6 18 2 17 2 15',
  '4': 'M8 18V2L1.5 13H11',
  '5': 'M10 2H3L2.5 9C4 8 5.5 8 7 8.5s3.5 2 3.5 4-1.5 5.5-4.5 5.5S2 17 2 15.5',
  '6': 'M9.5 4C8 2.5 6 2 5 2 3 2 2 5 2 10s1 8 4 8 4-2.5 4-4.5S8.5 9 6 9 2 10.5 2 11.5',
  '7': 'M2 2H10L5 18',
  '8': 'M6 2C3 2 2.5 4 2.5 5.5S4 9 6 9s3.5-1.5 3.5-3.5S9 2 6 2ZM6 9c-3 0-4 2-4 4.5S3.5 18 6 18s4-2 4-4.5S9 9 6 9Z',
  '9': 'M2.5 16C4 17.5 6 18 7 18c2 0 3-3 3-8S9 2 6 2 2 4.5 2 6.5 3.5 11 6 11s4-1.5 4-2.5',
};
/** A number drawn in the plaque's lettering, fitted into a w x h box centred on (cx, cy). */
const Digits = ({ n, cx, cy, w, h }: { n: number; cx: number; cy: number; w: number; h: number }) => {
  const t = String(n), total = t.length * 12 + (t.length - 1) * 3.5, k = Math.min(h / 20, w / total);
  return (
    <g transform={`translate(${cx} ${cy}) skewX(-8) scale(${k}) translate(${-total / 2} -10)`} fill="none" stroke={GOLD} strokeWidth={4.2} strokeLinejoin="miter" strokeLinecap="butt">
      {[...t].map((c, i) => <path key={i} d={DIGITS[c]} transform={`translate(${i * 15.5} 0)`} />)}
    </g>
  );
};
/** One star per ten league titles, centred above the badge. */
const stars = (count: number, cx: number, cy: number, r: number) => Array.from({ length: count }, (_, i) => star(cx + (i - (count - 1) / 2) * r * 2.2, cy, r)).join('');

// Shapes traced by eye from the trophy plaque at the club museum (one source pixel = one unit).
// Holes are real holes (even-odd), so every glyph reads as a single gold silhouette.
interface Glyph { vb: [number, number, number, number]; /** height the scale is taken from, when a mark sticks out of the main shape */ ref?: number; d?: string; strokes?: { d: string; w: number }[]; fills?: string[]; marks?: React.ReactNode }

const shield = (i: number) => `M${10 + i} ${9 + i}H${55 - i}V38C${55 - i} ${47 - i * 0.3} ${46 - i * 0.8} ${55 - i * 0.5} 32.5 ${61 - i * 1.5}C${19 + i * 0.8} ${55 - i * 0.5} ${10 + i} ${47 - i * 0.3} ${10 + i} 38Z`;
const SHIELD = shield(0);
const SHIELD_HOLE = 'M27 13H38V54.5L32.5 58L27 54.5Z';
/** The thin dark line that runs inside the shield's border: the band between two offsets of the outline is a hole */
const SHIELD_LINE = shield(2.7) + shield(3.7);
const PATCH = 'M10.5 5.5H52.5V36C52.5 45 45 52 31.5 57C18 52 10.5 45 10.5 36Z';

const CL_LEFT: Pt[] = [[47.5, 17], [29, 17], [27.5, 16], [27, 12], [25, 9], [21, 7.5], [16, 8], [11, 12], [8.5, 19], [8, 28], [9, 38], [11.5, 48], [14.5, 58], [18, 67], [22, 76], [27, 85], [32, 92], [36, 97], [38.5, 99.5], [38.5, 103], [34, 104], [29.5, 105.5], [27.5, 108.5], [27.5, 115.5], [47.5, 115.5]];
const CL_HOLE: Pt[] = [[16.5, 16], [19, 13.5], [22, 13.5], [23.5, 17], [23.5, 23], [25, 26], [23, 29], [21.5, 34], [20.5, 39], [20.5, 48], [21.5, 58], [22.5, 66], [19, 60], [16.8, 50], [15.5, 40], [15, 28], [15.5, 20]];
const SC_SLIT: Pt[] = [[21, 37.5], [22.5, 37.5], [23, 50], [26, 62], [31.5, 71.5], [32, 74], [30, 74], [24.5, 64], [21.5, 51]];
const CWC_LEFT: Pt[] = [[49.5, 17], [42, 17], [34, 16], [29, 12.5], [24, 7.5], [14, 6], [11.5, 10], [13.5, 19], [18.5, 29], [23, 36], [29.5, 40], [31, 44], [33.5, 52], [38, 61], [43, 68], [46, 72], [46.5, 77], [47, 82], [41, 88], [32.5, 91], [31.5, 96], [31.5, 109], [49.5, 109]];
const CWC_HOLE: Pt[] = [[18, 12], [21.5, 11.5], [24.5, 19], [28, 30], [29.5, 37.5], [26, 34], [21, 27], [18, 18]];
const SCUP_LEFT: Pt[] = [[35.5, 11], [24, 11], [21.5, 21], [17.5, 28], [16, 36], [17, 48], [20, 60], [24, 68], [27, 74], [28, 78], [27.5, 85], [26.5, 92], [26, 99], [35.5, 99]];
const SCOP_LEFT: Pt[] = [[31.5, 14], [10.5, 14], [11, 25], [14, 40], [17, 52], [20, 58], [25, 63], [26, 68], [24, 75], [21.5, 82], [20.5, 90], [20.5, 97], [31.5, 97]];

// The Latin Cup is a lidded urn with ring handles on a stepped base: (half-width, y) in 1/5 units.
const LATIN_LEFT: Pt[] = [[0, 40], [14, 45], [28, 62], [30, 85], [22, 110], [18, 125], [50, 135], [90, 155], [130, 180], [155, 205], [172, 225], [178, 240], [178, 270], [176, 300], [168, 350], [150, 400], [125, 440], [95, 470], [70, 490], [45, 505], [28, 520], [22, 535], [30, 555], [36, 570], [24, 590], [22, 610], [40, 635], [70, 660], [95, 685], [120, 705], [135, 725], [150, 745], [150, 760], [185, 760], [185, 860], [225, 860], [225, 960], [0, 960]];

export const GLYPHS: Record<Exclude<TrophyKind, 'scudettoN' | 'bigearsN'>, Glyph> = {
  bigears: { vb: [5, 5, 85, 113], d: sym(CL_LEFT, 47.5) + poly(CL_HOLE) + poly(flip(CL_HOLE, 47.5)),  },
  interc: {
    vb: [17, 7, 44, 113],
    d: 'M19.5 38V28A19 19 0 0 1 57.5 28V38Z' + rect(19, 39.5, 39.5, 4) + poly([[21.5, 44], [27, 44], [31.5, 93], [26, 93]]) + poly([[30.5, 44.5], [35, 44.5], [37, 93], [31.5, 93]]) + poly(flip([[21.5, 44], [27, 44], [31.5, 93], [26, 93]], 38.5)) + poly(flip([[30.5, 44.5], [35, 44.5], [37, 93], [31.5, 93]], 38.5)) + 'M32.5 46a6 2.5 0 1 0 12 0a6 2.5 0 1 0 -12 0Z' + rect(25.5, 95, 26, 4.2) + poly([[27, 100.5], [50, 100.5], [55, 116], [22, 116]]),
  },
  club: {
    vb: [13, 9, 48, 112],
    d: 'M21 25a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z' + poly([[33, 30], [44, 30], [45.5, 55], [43, 68], [44, 82], [47, 92], [50, 103], [31, 103], [32.5, 92], [34.5, 80], [35, 68], [34, 55]]) + poly([[20, 105], [50, 105], [58, 118], [14, 118]]),
    strokes: [{ d: 'M17.5 23C20 33 26 42 29 52C31 62 30 75 29 84C28 92 25 98 22 103', w: 2.6 }, { d: 'M57.5 22C54 33 50 40 47.5 50C46 55 45 59 44.5 64', w: 3 }],
  },
  supercup: {
    vb: [14, 9, 43, 110],
    d: sym(SCUP_LEFT, 35.5) + poly(SC_SLIT) + poly(flip(SC_SLIT, 35.5)) + rect(22, 100, 27, 4.5) + rect(22, 105.5, 27, 4) + rect(22, 111, 27, 4.5),
  },
  cwc: { vb: [9, 4, 81, 108], d: sym(CWC_LEFT, 49.5) + poly(CWC_HOLE) + poly(flip(CWC_HOLE, 49.5)) },
  scudetto: { vb: [8, 7, 49, 56], d: SHIELD + SHIELD_LINE + SHIELD_HOLE },
  coppa: { vb: [8, 11, 55, 55], d: 'M8.5 38.500a27 27 0 1 0 54 0a27 27 0 1 0 -54 0Z' + 'M21.5 38.500a14 14 0 1 0 28 0a14 14 0 1 0 -28 0Z' + 'M29 38.500a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0 -13 0Z' + 'M10.6 38.5a24.9 24.9 0 1 0 49.8 0a24.9 24.9 0 1 0 -49.8 0Z' + 'M11.5 38.5a24 24 0 1 0 48 0a24 24 0 1 0 -48 0Z' },
  supercoppa: { vb: [13, 12, 37, 107], d: sym(SCOP_LEFT, 31.5) + rect(15.5, 98.5, 32, 5.5) + rect(15.5, 105.5, 32, 4.5) + rect(14, 111.5, 35, 6) },
  latin: {
    vb: [-47, 6, 94, 190], ref: 190,
    d: sym(LATIN_LEFT.map(([h, y]): Pt => [-h * 0.2, y * 0.2]), 0),
    strokes: [{ d: 'M-37 55a3.6 10 0 1 0 0.010 0Z', w: 2.6 }, { d: 'M37 55a3.6 10 0 1 0 0.010 0Z', w: 2.6 }],
  },
  serieb: {
    vb: [6, 1, 51, 59],
    strokes: [{ d: PATCH, w: 3.5 }],
    fills: ['M25 17h8.500c4 0 6 2.2 6 5 0 2-1 3.5-2.8 4.3 2.3.8 3.8 2.6 3.8 5.2 0 3.5-2.5 5.5-6.5 5.500H25zM29 20.500v4.200h4c1.6 0 2.5-.9 2.5-2.100s-.9-2.1-2.5-2.100zM29 28.500v5h4.500c1.8 0 2.8-1 2.8-2.500s-1-2.5-2.8-2.500z'],
  },
};

const SEVEN = poly([[41, 53], [44, 51], [63, 51], [64, 54], [53, 87], [46, 87], [45, 84], [57, 60], [45, 59], [41, 57]]);
const NINETEEN = poly([[10.8, 12.4], [21.5, 12.2], [23.2, 13.5], [23.6, 17], [22.2, 20], [19.5, 22.5], [17.5, 24.3], [15.5, 23.5], [14.2, 24.3], [11.9, 24.2], [11.9, 14], [10.8, 13.6]]) + poly([[18.4, 13.6], [19.8, 14], [19.8, 18.8], [18.4, 19.2]]);

/** The league title that closes the list: the shield becomes a patch with the number of titles won. */
const scudettoN = (n: number, count: number): Glyph => ({
  vb: count ? [6, -8, 51, 67] : [6, 1, 51, 59], ref: 59,
  strokes: [{ d: PATCH, w: 3.5 }, { d: 'M20.5 15C16 22 17 33 24 42M42.5 15C47 22 46 33 39 42', w: 3 }],
  fills: count ? [stars(count, 31.5, -1, 6.5)] : [],
  // The 19 on the plaque is a single ligature (a 1 fused to a 9): traced from the photo; other totals use the digits
  marks: n === 19 ? <path d={NINETEEN} fill={GOLD} fillRule="evenodd" transform="translate(14 10)" /> : <Digits n={n} cx={31.5} cy={27.5} w={14} h={15} />,
});
/** The European Cup that closes the list: the cup is drawn in outline around the number of cups won. */
const bigearsN = (n: number): Glyph => ({
  vb: [5, 3, 90, 118],
  strokes: [
    { d: 'M12 40C9.5 25 14 9 25 8.5C33 8.5 36 17 32 21C28 24 24 27 24 33C24 38 22 43 20.5 47C19 62 24 78 32 92C35 98 38 104 41 110', w: 3 },
    { d: 'M11 45C11 60 17 78 26 92C31 100 36 106 40 111', w: 3 },
    { d: 'M88 40C90.5 25 86 9 75 8.5C67 8.5 64 17 68 21C72 24 76 27 76 33C76 38 78 43 79.5 47C81 62 76 78 68 92C65 98 62 104 59 110', w: 3 },
    { d: 'M89 45C89 60 83 78 74 92C69 100 64 106 60 111', w: 3 },
    { d: 'M33 32C40 28 60 28 67 32M21 49L44 42M79 49L56 42M27 51C28 70 33 92 41 110M73 51C72 70 67 92 59 110', w: 3 },
  ],
  // The 7 is the plaque's own, the other totals use the digits
  marks: n === 7 ? <path d={SEVEN} fill={GOLD} /> : <Digits n={n} cx={53} cy={69} w={24} h={36} />,
});
const shieldStars = (count: number): Glyph => ({ ...GLYPHS.scudetto, vb: [8, -8, 49, 71], ref: 56, d: GLYPHS.scudetto.d + stars(count, 32.5, 0, 7.5) });

/** The trophy as a gold silhouette, drawn at the given height. `n` is the total shown in the closing badges, `stars` the stars over a league title. */
export function TrophyIcon({ kind, size = 20, n = 0, stars: nStars = 0 }: { kind: TrophyKind; size?: number; n?: number; stars?: number }) {
  const g = kind === 'scudettoN' ? scudettoN(n, nStars) : kind === 'bigearsN' ? bigearsN(n) : kind === 'scudetto' && nStars ? shieldStars(nStars) : GLYPHS[kind];
  const ref = g.ref ?? g.vb[3];
  return (
    <svg viewBox={g.vb.join(' ')} height={(size * g.vb[3]) / ref} width={(size * g.vb[2]) / ref} aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      <g>
        {g.d && <path d={g.d} fill={GOLD} fillRule="evenodd" />}
        {g.strokes?.map((st, i) => <path key={i} d={st.d} fill="none" stroke={GOLD} strokeWidth={st.w} strokeLinecap="round" strokeLinejoin="round" />)}
        {g.fills?.map((d, i) => <path key={i} d={d} fill={GOLD} fillRule="evenodd" />)}
        {g.marks}
      </g>
    </svg>
  );
}

export interface TrophyWin { year: number; season: string; kind: TrophyKind; competition: string; /** total won, on the badge that closes the list */ n?: number; /** stars earned (one per ten league titles) */ stars?: number }

/**
 * Every trophy from the honours table with the year it was won (the season's first year).
 * As on the plaque, the latest European Cup and the latest league title are drawn as badges
 * with the running total, and every tenth league title earns a star.
 */
export function trophyWins(honours: { competition: string; seasons: string[] }[]): TrophyWin[] {
  const wins = honours.flatMap(h => {
    const t = TROPHIES.find(x => x.match.test(h.competition));
    if (!t) return [];
    return h.seasons.flatMap(s => {
      // The scraped lists sometimes keep stray words after the season ("1978–79 18px")
      const m = s.match(/^(\d{4})(?:[–-](\d{2,4}))?/);
      return m ? [{ year: +m[1], season: m[2] ? `${m[1]}–${m[2].slice(-2)}` : m[1], kind: t.kind, competition: h.competition } as TrophyWin] : [];
    });
  });
  for (const kind of ['bigears', 'scudetto'] as const) {
    const of = wins.filter(w => w.kind === kind).sort((a, b) => a.year - b.year);
    of.forEach((w, i) => { if (kind === 'scudetto' && (i + 1) % 10 === 0) w.stars = (i + 1) / 10; });
    const last = of[of.length - 1];
    if (last) { last.n = of.length; last.kind = kind === 'bigears' ? 'bigearsN' : 'scudettoN'; }
  }
  return wins;
}

/**
 * Trophies year by year: one row per decade, one cell per year, a glyph for each trophy won.
 * Gold years are the ones with more than one.
 */
export function TrophyTimeline({ honours, from = 1899, to = new Date().getFullYear() }: { honours: { competition: string; seasons: string[] }[]; from?: number; to?: number }) {
  const wins = trophyWins(honours);
  const [hover, setHover] = useState<number | null>(null);
  const byYear = new Map<number, TrophyWin[]>();
  wins.forEach(w => byYear.set(w.year, [...(byYear.get(w.year) ?? []), w]));
  const decades: number[] = [];
  for (let d = Math.floor(from / 10) * 10; d <= to; d += 10) decades.push(d);
  const totals = TROPHIES.map(t => ({ ...t, n: wins.filter(w => (BASE[w.kind] ?? w.kind) === t.kind).length })).filter(t => t.n > 0);
  const best = [...byYear.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0];
  const sel = hover != null ? byYear.get(hover) : null;

  return (
    <div className="tl" onPointerLeave={() => setHover(null)}>
      <div className="tl-key">
        {totals.map(t => <span key={t.kind}><TrophyIcon kind={t.kind} size={18} />{t.label} <b>{t.n}</b></span>)}
      </div>
      <div className="tl-grid">
        {decades.map(d => (
          <div className="tl-row" key={d}>
            <div className="tl-dec">{d}s</div>
            {Array.from({ length: 10 }, (_, i) => {
              const y = d + i, ws = byYear.get(y) ?? [];
              if (y < from || y > to) return <div key={y} className="tl-cell off" />;
              return (
                <div key={y} className={`tl-cell${ws.length ? ' won' : ''}${ws.length > 1 ? ' multi' : ''}${hover === y ? ' on' : ''}`} onPointerEnter={() => ws.length && setHover(y)} onClick={() => ws.length && setHover(y)}>
                  <small>{String(y).slice(2)}</small>
                  <div className="tl-ico">{ws.map((w, k) => <TrophyIcon key={k} kind={w.kind} size={(ws.length > 2 ? 15 : 19) * (w.n ? 1.45 : 1)} n={w.n} stars={w.stars} />)}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="tl-note">
        {sel ? <><b>{sel[0].season}</b> {sel.map(w => w.competition).join(' · ')}</> : best ? <>Most trophies in a season: <b>{best[1].length}</b> in {best[1][0].season}. Hover a year to see what was won.</> : null}
      </div>
    </div>
  );
}
