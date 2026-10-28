// Extra screens of the team pages: the whole season game by game, and the team's
// strength against the rest of its league. The home screen stays in TeamPage.
import { useMemo } from 'react';
import { BumpChart } from '../components/charts';
import { NflLogo } from '../components/common';
import { DriveEnds, PassField, RunGaps, splitRank } from '../components/football';
import { Dumbbells, QuadrantScatter, RankStrips, Spaghetti, ordinal, type StripMetric } from '../components/power';
import { useNflSeason, standingsByWeek, winPct, type NflSeasonFile } from '../sources/nflData';
import { TeamProfile, TeamSeason, teamInk, teamValues } from './NflScreens';
import { useRosters } from '../sources/rosters';
import { DodgersRoster, MilanRoster, PatsRoster, TexasRoster } from './RosterScreens';
import { TexasPower, TexasSeason, useCfbSeason } from './CfbScreens';
import { DodgersPower, DodgersSeason, useMlbSeason } from './MlbScreens';
import { MilanPower, MilanSeason, useFootballSeason } from './FootballScreens';

export type TeamId = 'milan' | 'pats' | 'texas' | 'dodgers';
export type TeamTab = 'now' | 'season' | 'power' | 'roster';
const ALL: [TeamTab, string][] = [['now', 'Now'], ['season', 'Season'], ['power', 'Power'], ['roster', 'Roster']];
/** The screens built so far for each team (Season and Power arrive with each league's section) */
const BUILT: Record<TeamId, TeamTab[]> = { pats: ['now', 'season', 'power', 'roster'], milan: ['now', 'season', 'power', 'roster'], texas: ['now', 'season', 'power', 'roster'], dodgers: ['now', 'season', 'power', 'roster'] };
export const teamTabs = (id: TeamId) => ALL.filter(([k]) => BUILT[id].includes(k));

export function TeamScreens({ id, tab }: { id: TeamId; tab: TeamTab }) {
  const nfl = useNflSeason(id === 'pats' && tab !== 'roster');
  const rosters = useRosters(tab === 'roster');
  const cfb = useCfbSeason(id === 'texas' && tab !== 'roster');
  const mlb = useMlbSeason(id === 'dodgers' && tab !== 'roster');
  const fb = useFootballSeason(id === 'milan' && tab !== 'roster');
  const wait = <section className="ocard"><p className="dek">Loading…</p></section>;
  if (tab === 'roster') {
    if (!rosters) return wait;
    const r = rosters[id];
    if (!r || r.error) return <section className="ocard"><p className="dek">The roster is not available right now.</p></section>;
    return id === 'pats' ? <PatsRoster r={rosters.pats} /> : id === 'texas' ? <TexasRoster r={rosters.texas} /> : id === 'dodgers' ? <DodgersRoster r={rosters.dodgers} /> : <MilanRoster r={rosters.milan} />;
  }
  if (id === 'milan') {
    if (!fb) return wait;
    return tab === 'season' ? <MilanSeason s={fb} /> : <MilanPower s={fb} />;
  }
  if (id === 'dodgers') {
    if (!mlb) return wait;
    return tab === 'season' ? <DodgersSeason d={mlb} /> : <DodgersPower d={mlb} />;
  }
  if (id === 'texas') {
    if (!cfb) return wait;
    return tab === 'season' ? <TexasSeason d={cfb} /> : <TexasPower d={cfb} />;
  }
  if (id === 'pats') {
    if (!nfl) return wait;
    return tab === 'season' ? <NflTeamSeason d={nfl} abbr="NE" /> : <NflTeamPower d={nfl} abbr="NE" />;
  }
  return null;
}

const sign = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`;

export function NflTeamSeason({ d, abbr }: { d: NflSeasonFile; abbr: string }) {
  const T = useMemo(() => Object.fromEntries(d.teams.map(t => [t.abbr, t])), [d]);
  const me = T[abbr];
  const upTo = Math.max(0, ...d.games.filter(g => g.type === 2 && g.st === 'post').map(g => g.wk));
  const hist = upTo >= 2 ? standingsByWeek(d.games, d.teams, upTo) : [];
  const div = d.teams.filter(t => t.div === me?.div);
  const conf = d.teams.filter(t => t.conf === me?.conf);
  const rankIn = (pool: typeof conf, h: typeof hist[number]) => Object.fromEntries([...pool].sort((a, b) => winPct(h.table[b.abbr]) - winPct(h.table[a.abbr]) || (h.table[b.abbr].pf - h.table[b.abbr].pa) - (h.table[a.abbr].pf - h.table[a.abbr].pa)).map((t, i) => [t.abbr, i + 1]));
  return (
    <>
      <TeamSeason d={d} abbr={abbr} />
      {hist.length >= 2 && <section className="s-two">
        <div className="ocard">
          <h2>The {me?.div} race</h2>
          <p className="dek">Place in the division after every week (record, then point differential).</p>
          <BumpChart weeks={hist.map(h => h.wk)} maxRank={4} series={div.map((t, i) => ({ id: t.abbr, name: t.short, ranks: hist.map(h => rankIn(div, h)[t.abbr]), color: t.abbr === abbr ? teamInk(t) : ['var(--o-s4)', 'var(--o-s3)', 'var(--o-s2)'][i % 3] }))} />
        </div>
        <div className="ocard">
          <h2>Place in the {me?.conf}</h2>
          <p className="dek">Rank among the 16 {me?.conf} teams after every week; the top seven make the playoffs.</p>
          <BumpChart weeks={hist.map(h => h.wk)} maxRank={16} series={conf.map(t => ({ id: t.abbr, name: t.short, ranks: hist.map(h => rankIn(conf, h)[t.abbr]), color: t.abbr === abbr ? teamInk(t) : undefined }))} />
        </div>
      </section>}
    </>
  );
}

export function NflTeamPower({ d, abbr }: { d: NflSeasonFile; abbr: string }) {
  const T = useMemo(() => Object.fromEntries(d.teams.map(t => [t.abbr, t])), [d]);
  const V = useMemo(() => teamValues(d), [d]);
  const me = T[abbr], p = d.pbp;
  if (!me || !p) return <TeamProfile d={d} abbr={abbr} />;
  const rivals = d.teams.filter(t => t.div === me.div && t.abbr !== abbr).map(t => t.abbr);
  const top = Object.entries(V).filter(([, v]) => v.net != null).sort((a, b) => b[1].net! - a[1].net!).slice(0, 3).map(([k]) => k);
  const lit = new Set([abbr, ...rivals, ...top]);
  const weeks = Array.from({ length: p.maxWeek }, (_, i) => i + 1);
  const rolling = (a: string) => { const ws = p.teams[a]?.weeks ?? []; return weeks.map(w => { const last = ws.filter(x => x.wk <= w && x.off != null && x.def != null).slice(-3); return last.length && ws.some(x => x.wk === w) ? last.reduce((s, x) => s + x.off! - x.def!, 0) / last.length : null; }); };
  const avg = (k: string) => { const xs = Object.values(V).map(v => v[k]).filter((x): x is number => x != null); return xs.reduce((a, x) => a + x, 0) / xs.length; };
  const mine = p.teams[abbr];
  const phases: [string, string][] = [['q1', '1st quarter'], ['q2', '2nd quarter'], ['q3', '3rd quarter'], ['q4', '4th quarter'], ['close', 'Close 4th quarters']];
  return (
    <>
      <TeamProfile d={d} abbr={abbr} />
      <section className="s-two">
        <div className="ocard">
          <h2>Against the league</h2>
          <p className="dek">Offence (EPA per play, right is better) against defence (EPA allowed, up is better). In colour: the {me.short}, the division rivals and the three strongest teams.</p>
          <QuadrantScatter height={380} invertY xLabel="Offence: EPA per play" yLabel="Defence: EPA allowed (less is better)" corners={['Complete teams', 'Win with defence', 'Win with offence', 'Struggling']}
            points={d.teams.filter(t => p.teams[t.abbr]).map(t => ({ id: t.abbr, label: t.abbr, x: p.teams[t.abbr].offEpa, y: p.teams[t.abbr].defEpa, color: lit.has(t.abbr) ? teamInk(t) : undefined, tip: <><div className="k">{t.name}</div>Offence {sign(p.teams[t.abbr].offEpa)} · Defence {sign(p.teams[t.abbr].defEpa)}</> }))} />
        </div>
        <div className="ocard">
          <h2>When the {me.short} are strongest</h2>
          <p className="dek">Net EPA per play (offence minus defence) by phase of the game, against the league average.</p>
          <Dumbbells aLabel="League average" bLabel={me.short} aColor="var(--o-other)" bColor={teamInk(me)} fmt={sign}
            rows={phases.filter(([k]) => V[abbr][k] != null).map(([k, label]) => ({ id: k, label, a: avg(k), b: V[abbr][k]! }))} />
          <p className="dek" style={{ fontSize: 12 }}>Fourth quarters within eight points: offence {mine.close4.off != null ? sign(mine.close4.off) : '–'}, defence {mine.close4.def != null ? sign(mine.close4.def) : '–'} over {mine.close4.plays} plays.</p>
        </div>
      </section>
      <section className="ocard">
        <h2>Form</h2>
        <p className="dek">Net EPA per play over the last three games, the {me.short} against the division rivals and the league's best. Grey: every other team.</p>
        <Spaghetti steps={weeks.map(w => `Wk ${w}`)} series={d.teams.map(t => ({ id: t.abbr, label: t.short, values: rolling(t.abbr), color: lit.has(t.abbr) ? teamInk(t) : undefined }))} />
        <div className="osrc">Source: nflverse play-by-play</div>
      </section>
      <NflSituations d={d} abbr={abbr} />
      <section className="ocard">
        <h2>Head to head with the division</h2>
        <table className="otable">
          <thead><tr><th>Team</th><th className="n">FPI</th><th className="n">Off. EPA</th><th className="n">Def. EPA</th><th className="n">Pass off.</th><th className="n">Run off.</th><th className="n">Pts/drive</th><th className="n">TO margin</th><th className="n">Playoffs</th></tr></thead>
          <tbody>{[abbr, ...rivals].map(a => { const x = p.teams[a], f = d.fpi[a]; return x && <tr key={a} className={a === abbr ? 'me' : ''}><td><NflLogo abbr={a} />{T[a].short}</td><td className="n">{f ? f.fpi.toFixed(1) : '–'}</td><td className="n">{sign(x.offEpa)}</td><td className="n">{sign(x.defEpa)}</td><td className="n">{sign(x.offPassEpa)}</td><td className="n">{sign(x.offRushEpa)}</td><td className="n">{x.offPtsDrive.toFixed(2)}</td><td className="n">{x.toMargin > 0 ? '+' : ''}{x.toMargin}</td><td className="n">{f ? `${Math.round(f.playoff)}%` : '–'}</td></tr>; })}</tbody>
        </table>
        <div className="osrc">Sources: nflverse play-by-play, ESPN FPI</div>
      </section>
    </>
  );
}

// Situations (from the play-by-play splits): label, key
const SITUATIONS: { title: string; dek: string; rows: [string, string][] }[] = [
  { title: 'By down', dek: 'EPA per play on each down.', rows: [['d1', '1st down'], ['d2', '2nd down'], ['d3', '3rd down'], ['d4', '4th down']] },
  { title: 'By field position', dek: 'Where the snap is.', rows: [['backed', 'Backed up (own 1–20)'], ['own', 'Own half (21–50)'], ['opp', 'Opponent half (49–21)'], ['rz', 'Red zone (20–1)']] },
  { title: 'By scheme', dek: 'Formation and play design (play action, motion and blitzes from FTN charting).', rows: [['gun', 'Shotgun'], ['center', 'Under centre'], ['pa', 'Play action'], ['nopa', 'Straight dropback'], ['motion', 'Motion at the snap'], ['nomotion', 'No motion'], ['blitz', 'Against / with a blitz'], ['noblitz', 'No blitz'], ['oop', 'QB out of the pocket'], ['screen', 'Screens'], ['lightbox', 'Runs vs light box (≤6)'], ['heavybox', 'Runs vs stacked box (8+)']] },
];

const sg = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
const pc = (v: number) => `${Math.round(v * 100)}%`;

const STYLE: StripMetric[] = [
  { key: 'passOe', label: 'Pass rate over expected', note: 'pass more (+) or less than the situation suggests', fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)} pts`, neutral: true },
  { key: 'gun', label: 'Shotgun', fmt: pc, neutral: true },
  { key: 'motion', label: 'Motion at the snap', fmt: pc, neutral: true },
  { key: 'playAction', label: 'Play action', note: 'share of dropbacks', fmt: pc, neutral: true },
  { key: 'noHuddle', label: 'No huddle', fmt: pc, neutral: true },
  { key: 'goFourth', label: 'Goes for it on 4th and short', note: '4th and 1–2, game in doubt', fmt: pc, neutral: true },
  { key: 'blitz', label: 'Defence blitzes', note: 'share of dropbacks', fmt: pc, neutral: true },
];
const EXECUTION: StripMetric[] = [
  { key: 'hitAllowed', label: 'QB hit or sacked', note: 'per dropback', fmt: pc, low: true },
  { key: 'drops', label: 'Dropped passes', note: 'per pass attempt', fmt: pc, low: true },
  { key: 'intWorthy', label: 'Interception-worthy throws', note: 'per attempt', fmt: pc, low: true },
  { key: 'penPerGame', label: 'Penalties per game', fmt: v => v.toFixed(1), low: true },
  { key: 'hit', label: 'Defence: QB hits and sacks', note: 'per dropback', fmt: pc },
  { key: 'havoc', label: 'Defence: havoc plays', note: 'tackles for loss, picks, forced fumbles, pass breakups', fmt: pc },
  { key: 'intWorthyForced', label: 'Defence: interception chances', note: 'interception-worthy throws forced', fmt: pc },
];

function NflSituations({ d, abbr }: { d: NflSeasonFile; abbr: string }) {
  const p = d.pbp!;
  const T = Object.fromEntries(d.teams.map(t => [t.abbr, t]));
  const me = T[abbr], color = teamInk(me);
  const teams = p.teams;
  const vals = (side: 'off' | 'def') => Object.fromEntries(Object.entries(teams).map(([a, t]) => [a, Object.fromEntries(Object.entries(t.splits[side]).map(([k, x]) => [k, x[2] >= 5 ? x[0] : null]))]));
  const offV = vals('off'), defV = vals('def');
  const rateV = Object.fromEntries(Object.entries(teams).map(([a, t]) => [a, t.rates]));
  // Scouting report: the situations where the team ranks highest and lowest
  const all = SITUATIONS.flatMap(g => g.rows).flatMap(([k, label]) => (['off', 'def'] as const).map(side => ({ side, label, ...splitRank(teams, side, k, abbr, 8) }))).filter(x => x.rank);
  const best = (side: 'off' | 'def') => all.filter(x => x.side === side).sort((a, b) => a.rank! - b.rank!);
  const say = (xs: typeof all) => xs.map(x => `${x.label} (${ordinal(x.rank!)})`).join(', ');
  const avgEnd = (side: 'off' | 'def') => { const out: Record<string, number> = {}; const ts = Object.values(teams); for (const t of ts) for (const [k, v] of Object.entries(t.drives[side].end)) out[k] = (out[k] ?? 0) + v / ts.length; return out; };
  const avg = (f: (t: typeof teams[string]) => number | null) => { const xs = Object.values(teams).map(f).filter((x): x is number => x != null); return xs.reduce((a, x) => a + x, 0) / xs.length; };
  const mine = teams[abbr];
  if (!mine) return null;
  const strips = (side: 'off' | 'def', rows: [string, string][]) => rows.map(([key, label]) => ({ key, label, fmt: sg, low: side === 'def', note: mine.splits[side][key] ? `${mine.splits[side][key][2]} plays · success ${pc(mine.splits[side][key][1])}` : undefined }));
  return (
    <>
      <section className="ocard">
        <h2>Scouting report</h2>
        <p className="dek"><b>Offence, at its best:</b> {say(best('off').slice(0, 4))}. <b>At its worst:</b> {say(best('off').slice(-4).reverse())}.</p>
        <p className="dek"><b>Defence, at its best:</b> {say(best('def').slice(0, 4))}. <b>At its worst:</b> {say(best('def').slice(-4).reverse())}.</p>
        <p className="dek" style={{ fontSize: 12 }}>Ranks among the 32 teams in EPA per play for each situation (at least eight plays). The detail is below.</p>
      </section>

      {SITUATIONS.map(g => (
        <section key={g.title} className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {(['off', 'def'] as const).map(side => (
            <div key={side} className="ocard">
              <h2>{side === 'off' ? 'Offence' : 'Defence'} · {g.title.toLowerCase()}</h2>
              <p className="dek">{g.dek} {side === 'def' ? 'EPA allowed: further right means less allowed.' : 'Further right is better.'} Grey dots: the other 31 teams.</p>
              <RankStrips metrics={strips(side, g.rows)} values={side === 'off' ? offV : defV} me={abbr} color={color} labelOf={a => a} />
            </div>
          ))}
        </section>
      ))}

      <section className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="ocard">
          <h2>Where the {me.short} throw</h2>
          <p className="dek">EPA per pass attempt by direction and depth of the throw, coloured by rank in the league (blue among the best). The number of attempts tells how often they go there.</p>
          <PassField teams={teams} abbr={abbr} side="off" />
        </div>
        <div className="ocard">
          <h2>Where opponents throw on them</h2>
          <p className="dek">EPA allowed per pass, by zone. Blue: one of the zones the defence covers best.</p>
          <PassField teams={teams} abbr={abbr} side="def" />
        </div>
      </section>
      <section className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="ocard">
          <h2>Where the {me.short} run</h2>
          <p className="dek">EPA per designed run through each gap of the offensive line.</p>
          <RunGaps teams={teams} abbr={abbr} side="off" />
        </div>
        <div className="ocard">
          <h2>Where opponents run on them</h2>
          <p className="dek">EPA allowed per run, gap by gap (the offence's left).</p>
          <RunGaps teams={teams} abbr={abbr} side="def" />
        </div>
      </section>

      <section className="ocard">
        <h2>How drives end</h2>
        <p className="dek">Every possession by its result, the {me.short} against the league average.</p>
        <DriveEnds rows={[
          { label: `${me.short} offence`, bold: true, end: mine.drives.off.end, note: `${mine.drives.off.n} drives · start own ${mine.drives.off.start?.toFixed(0)} · ${mine.drives.off.plays} plays` },
          { label: 'League offence', end: avgEnd('off'), note: `start own ${avg(t => t.drives.off.start).toFixed(0)} · ${avg(t => t.drives.off.plays).toFixed(1)} plays` },
          { label: `${me.short} defence`, bold: true, end: mine.drives.def.end, note: `${mine.drives.def.n} opponent drives · start own ${mine.drives.def.start?.toFixed(0)}` },
          { label: 'League defence', end: avgEnd('def') },
        ]} />
        <div className="osrc">Source: nflverse play-by-play</div>
      </section>

      <section className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="ocard">
          <h2>Style</h2>
          <p className="dek">How the {me.short} like to play. Neither end is better: the rank reads “most”.</p>
          <RankStrips metrics={STYLE} values={rateV} me={abbr} color={color} labelOf={a => a} axis="more →" />
        </div>
        <div className="ocard">
          <h2>Execution</h2>
          <p className="dek">The details that decide close games, for the offence and the defence. Further right is better.</p>
          <RankStrips metrics={EXECUTION} values={rateV} me={abbr} color={color} labelOf={a => a} />
          <div className="osrc">Sources: nflverse play-by-play, FTN charting{p.ftnPlays ? ` (${p.ftnPlays.toLocaleString('en-GB')} plays)` : ''}</div>
        </div>
      </section>
    </>
  );
}
