// Parsing of Wikipedia awards pages: the "winners and nominees" tables used by the
// Oscars, Globes, BAFTA, guild and critics pages, and the "Award: Film" lists of
// festivals and critics groups.

const unlink = s => s.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');
export const clean = s => unlink(
  s.replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, '')
    .replace(/<small>[\s\S]*?<\/small>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{(?:sort|sortname)\|([^|}]+)\|([^|}]+)[^}]*\}\}/gi, '$1 $2')
    .replace(/\{\{(?:abbr|nowrap|lang\|[a-z-]+|nobold)\|([^|}]+)[^}]*\}\}/gi, '$1')
    .replace(/\{\{(?:flagicon|flag)[^}]*\}\}/gi, '')
    .replace(/\{\{[^{}]*\}\}/g, ''),
).replace(/<[^>]+>/g, '').replace(/'''?/g, '').replace(/[‡†§*]/g, '').replace(/\s+/g, ' ').trim();

/** "[[Person]] – ''[[Film]]'' as Role" or "''[[Film]]'' – Producers" -> { film, people, role } */
export function entry(line) {
  const raw = line.replace(/^\*+\s*/, '').trim();
  const winner = /^'''/.test(raw) || raw.includes('‡');
  // Drop the bold markers first, so bold-italic titles keep their italics
  const plain = raw.replace(/'''/g, '');
  const ital = plain.match(/''((?:\[\[[^\]]*\]\]|[^'])+?)''/);
  const film = ital ? clean(ital[1]) : null;
  const txt = clean(plain);
  let people = null, role = null, song = null;
  if (film) {
    const at = txt.indexOf(film);
    const b = txt.slice(0, Math.max(0, at)).replace(/[–—-]\s*$/, '').trim();
    const a = txt.slice(at + film.length).replace(/^\s*[–—-]\s*/, '').trim();
    if (/\bfrom$/.test(b)) { song = b.replace(/\s*from$/, '').replace(/^"|"$/g, ''); people = a.replace(/^music (?:and lyrics )?by\s*/i, '') || null; }
    else if (b && !b.startsWith('(')) { people = b; const r = a.match(/^as (.+)$/); role = r ? r[1] : null; }
    else people = (b.match(/^\(([^)]+)\)/)?.[1] ?? a.replace(/,?\s*(producers?|directors?)$/i, '')) || null;
  } else people = txt;
  return { film, people: people ? people.replace(/(\s*,)+/g, ',').replace(/,\s*and/g, ' and') : null, role, song, winner, text: txt };
}

const isTv = s => /televised|stunt|television|\bTV\b|series|episode|limited|anthology|commercial|music video|variety|talk show|game show|reality|podcast|stand-up|video game|broadcast|streaming series|short form/i.test(s);

/** Category blocks from every wikitable of a page section: [{ category, nominees: entry[] }] */
export function nomineeTables(w) {
  const out = [];
  for (const table of w.split(/\n\{\|/).slice(1).map(t => t.split(/\n\|\}/)[0])) {
    if (!/\n\*/.test(table)) continue;
    let heads = [];
    for (const row of table.split(/\n\|-[^\n]*/)) {
      const cells = [];
      for (const part of row.split(/\n(?=[|!])/)) {
        const m = part.match(/^([|!])(.*)$/s);
        if (!m || part.startsWith('|+')) continue;
        // "| style=... | content" or "! a !! b"
        for (const c of m[2].split(/\s*(?:!!|\|\|)\s*/)) {
          const body = c.replace(/^\s*(?:(?:style|valign|width|align|class|colspan|rowspan|scope)\s*=\s*"[^"]*"\s*)+\|/i, '').replace(/^\s*(?:valign|style|width)=[^|\n]*\|/i, '');
          cells.push({ head: m[1] === '!', body });
        }
      }
      if (cells.length && cells.every(c => c.head)) { heads = cells.map(c => clean(c.body)); continue; }
      cells.forEach((c, i) => {
        const lines = c.body.split('\n');
        const first = lines.findIndex(l => /^\*/.test(l));
        if (first < 0) return;
        const pre = lines.slice(0, first).join(' ').trim();
        // DGA style: the winner sits in bold above the bullets, under a header row
        const preIsWinner = Boolean(heads[i]) && /^'''/.test(pre) && /''[^']/.test(pre.replace(/^'''/, ''));
        const inCell = preIsWinner ? '' : clean(pre.replace(/\{\{Award category\|[^|]*\|([^}]*)\}\}/i, '$1'));
        const category = inCell || heads[i] || null;
        if (!category || isTv(category)) return;
        const nominees = lines.slice(first).filter(l => /^\*/.test(l)).map(entry).filter(e => e.film || e.people);
        if (preIsWinner) nominees.unshift({ ...entry(`* ${pre}`), winner: true });
        // Before the ceremony every nominee is a first-level bullet and nobody is in bold
        if (nominees.length) out.push({ category, nominees });
      });
    }
  }
  return out;
}

/** "* Golden Lion: ''Film'' by Director" lines (festivals, critics groups). */
export function colonList(w) {
  const out = [];
  for (const line of w.split('\n')) {
    const m = line.replace(/'''/g, '').match(/^\*+\s*((?:\[\[[^\]]*\]\]|[^:\n]){3,90}?)\s*:\s*(.+)$/);
    if (!m) continue;
    const category = clean(m[1]);
    if (!/award|best|prize|lion|palme|golden|silver|grand|jury|special|people's choice|film|director|actor|actress|screenplay|cinematograph|score|performance|ensemble|picture/i.test(category) || isTv(category)) continue;
    const e = entry(`* ${m[2]}`);
    if (!e.film && !e.people) continue;
    out.push({ category, nominees: [{ ...e, people: e.people?.replace(/^by\s+|\s+for$/g, '') ?? null, winner: true }] });
  }
  return out;
}

// ---------- canonical Oscar categories ----------
export const OSCAR_CATS = [
  ['picture', 'Best Picture'], ['director', 'Director'], ['actor', 'Actor'], ['actress', 'Actress'], ['supActor', 'Supporting Actor'], ['supActress', 'Supporting Actress'],
  ['origScreenplay', 'Original Screenplay'], ['adaptScreenplay', 'Adapted Screenplay'], ['animated', 'Animated Feature'], ['international', 'International Feature'], ['documentary', 'Documentary Feature'],
  ['cinematography', 'Cinematography'], ['editing', 'Film Editing'], ['production', 'Production Design'], ['costume', 'Costume Design'], ['makeup', 'Makeup and Hairstyling'],
  ['score', 'Original Score'], ['song', 'Original Song'], ['sound', 'Sound'], ['vfx', 'Visual Effects'], ['casting', 'Casting'],
  ['docShort', 'Documentary Short'], ['liveShort', 'Live Action Short'], ['animShort', 'Animated Short'],
];

/** Which Oscar category a precursor's category speaks to (null = not tracked). */
export function oscarCat(name, award) {
  const n = name.toLowerCase();
  if (/short/.test(n)) return /documentar/.test(n) ? 'docShort' : /animat/.test(n) ? 'animShort' : /live/.test(n) ? 'liveShort' : null;
  if (/student|first[- ]time|debut|breakthrough|lifetime|honorary|tribute|career|achievement award|humanitarian|vanguard|visionary|icon|spotlight|rising|newcomer|young|youth/.test(n) && !/outstanding achievement in|achievement in (?:sound|cinemato|direct)/.test(n)) return null;
  if (/animated|animation/.test(n)) return /feature|film|picture/.test(n) && !/(?:effects|character|storyboard|voice|music|editorial|writing|production design|direction)/.test(n) ? 'animated' : null;
  if (/documentar/.test(n)) return /series|episod/.test(n) ? null : 'documentary';
  if (/foreign|international|non-english|not in the english|language other/.test(n)) return 'international';
  if (/supporting/.test(n)) return /actress|female/.test(n) ? 'supActress' : /actor|male/.test(n) ? 'supActor' : null;
  if (/actress|female actor|by a female/.test(n)) return 'actress';
  if (/\bactor\b|male actor|by a male/.test(n)) return 'actor';
  if (/cast in a motion picture|ensemble|casting/.test(n)) return /casting/.test(n) ? 'casting' : 'picture';
  if (/adapted/.test(n)) return 'adaptScreenplay';
  if (/original screenplay|original writing/.test(n)) return 'origScreenplay';
  if (/screenplay|writing|script/.test(n)) return award === 'scripter' ? 'adaptScreenplay' : 'origScreenplay';
  if (/direct/.test(n) && !/art direct/.test(n)) return 'director';
  if (/cinematograph|photograph/.test(n)) return 'cinematography';
  if (/edit/.test(n) && !/sound edit/.test(n)) return 'editing';
  if (/production design|art direction|set decoration/.test(n)) return 'production';
  if (/costume/.test(n)) return 'costume';
  if (/make-?up|hair/.test(n)) return 'makeup';
  if (/song/.test(n)) return 'song';
  if (/score|\bmusic\b/.test(n) && !/musical/.test(n)) return 'score';
  if (/sound|mixing/.test(n)) return 'sound';
  if (/visual effects|vfx/.test(n)) return award !== 'ves' || /photoreal feature/.test(n) ? 'vfx' : null;
  if (/picture|best film|best feature|feature film|motion picture|top ten|golden lion|palme|people's choice|golden bear/.test(n)) return 'picture';
  return null;
}

/** "Award | Film | Director" tables (TIFF and some critics pages). */
export function rowTables(w) {
  const out = [];
  for (const table of w.split(/\n\{\|/).slice(1).map(t => t.split(/\n\|\}/)[0])) {
    const rows = table.split(/\n\|-[^\n]*/).map(r => r.split(/\n(?=[|!])/).map(c => c.replace(/^[|!]\s*/, '')).filter(c => c && !c.startsWith('class=') && !c.startsWith('+')));
    const head = rows.find(r => r.length >= 2 && /award|category|prize/i.test(r[0]) && /film|winner|recipient/i.test(r[1]));
    if (!head) continue;
    for (const r of rows) {
      if (r === head || r.length < 2 || isTv(r[0])) continue;
      const category = clean(r[0]);
      const e = entry(`* ${r[1]}`);
      const people = r[2] ? clean(r[2]) : e.people;
      if (category && (e.film || people)) out.push({ category, nominees: [{ ...e, people, winner: true }] });
    }
  }
  return out;
}

/** Festival prizes that speak to an Oscar category (the main competition only). */
export function festivalCat(name) {
  const n = name.toLowerCase();
  if (/runner|international people|midnight|documentary|platform|short|queer|fipresci|critics|orizzonti|future|classics|immersive|lifetime|tribute/.test(n)) return null;
  if (/palme d'or|golden lion|^people's choice award$/.test(n)) return 'picture';
  if (/best director|silver lion.*direct|mise en sc/.test(n)) return 'director';
  if (/best actress|volpi cup for best actress|interpretation.*fem/.test(n)) return 'actress';
  if (/best actor|volpi cup for best actor|interpretation.*mas/.test(n)) return 'actor';
  if (/screenplay/.test(n)) return 'origScreenplay';
  return null;
}
