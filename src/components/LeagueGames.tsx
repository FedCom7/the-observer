// A league's games on its own page (MLB, NBA): read straight from the ESPN scoreboard, so the
// regular season stays here and does not fill the control room.
import { useEffect, useState } from 'react';
import { DAY, MIN, hhmm, isNight, sportsDay } from '../core/time';
import { LEAGUES, leagueDay, type LeagueGame } from '../sources/leagueDay';
import { Score } from './common';
import { Crest } from './NextGame';

/** Last night's games and today's (Rome sports days), refreshed every 30 s while one is on. */
export function useLeagueGames(key: 'mlb' | 'nba', now: number): { today: LeagueGame[]; yesterday: LeagueGame[] } | null {
  const day0 = sportsDay(now);
  const [games, setGames] = useState<LeagueGame[] | null>(null);
  useEffect(() => {
    const l = LEAGUES.find(x => x.key === key)!;
    let alive = true, timer = 0;
    const tick = async (hot: boolean) => {
      const g = await leagueDay(l, day0 - DAY, day0 + DAY, hot).catch(() => null);
      if (!alive) return;
      if (g) setGames(g);
      const live = (g ?? []).some(x => x.state === 'in' || (x.state === 'pre' && Math.abs(x.start - Date.now()) < 15 * MIN));
      timer = window.setTimeout(() => tick(live), live ? 30e3 : 2 * MIN);
    };
    tick(false);
    return () => { alive = false; clearTimeout(timer); };
  }, [key, day0]);
  if (!games) return null;
  return { today: games.filter(g => g.start >= day0 || g.state === 'in'), yesterday: games.filter(g => g.start < day0 && g.state !== 'in') };
}

/** One game: both teams with crest and score, then the line that matters for its state. */
export function LeagueGameCard({ g }: { g: LeagueGame }) {
  const L = g.line;
  const live = g.state === 'in';
  const sides = g.home && g.away ? [g.away, g.home] : [];
  const detail = g.state === 'pre'
    ? [L.series, L.probables && `SP ${L.probables}`, g.tv].filter(Boolean).join(' · ')
    : live ? [L.situation, L.lastPlay].filter(Boolean).join(' · ') : [L.series, L.leaders ?? L.headline].filter(Boolean).join(' · ');
  return (
    <div style={{ border: `1px solid ${live ? '#ff453a' : 'var(--o-line)'}`, borderRadius: 10, padding: '10px 12px', background: live ? 'color-mix(in srgb, #ff453a 7%, var(--o-card))' : 'var(--o-card)', fontSize: 13 }}>
      {sides.map(s => (
        <div key={s.abbr} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: s.winner ? 700 : 400, color: g.state === 'post' && s.winner === false ? 'var(--o-ink3)' : 'var(--o-ink)' }}>
          <Crest side={s} size={18} />
          <span style={{ flex: 1, minWidth: 0 }}>{s.name}</span>
          {g.state !== 'pre' && <Score as="b">{s.score ?? ''}</Score>}
        </div>
      ))}
      <div style={{ fontSize: 11, marginTop: 4, color: live ? '#ff453a' : 'var(--o-ink3)' }}>
        {g.state === 'pre' ? `${hhmm(g.start)} Rome${isNight(g.start) ? ' · night' : ''}` : g.clock ?? (live ? 'Live' : 'Final')}
      </div>
      {detail && <div style={{ fontSize: 11, marginTop: 3, color: 'var(--o-ink2)' }}><Score>{detail}</Score></div>}
    </div>
  );
}

/** A day of games as a grid of cards. */
export function LeagueGameGrid({ games }: { games: LeagueGame[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
      {games.map(g => <LeagueGameCard key={g.id} g={g} />)}
    </div>
  );
}
