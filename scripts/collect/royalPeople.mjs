// Who is who in the Royal Family: the working royals, the line of succession and the dates that
// are fixed once and for all (birthdays, anniversaries). Facts, not scraped: change them only when
// the Palace changes them (a new title, a retirement from public life).

/** `diary` is the heading royal.uk uses in the Royal Diary and the Court Circular; `wiki` the Wikipedia page (for the portrait). */
export const PEOPLE = [
  { id: 'king', wiki: 'Charles III', name: 'King Charles III', title: 'The King', diary: ['The King'], born: [1948, 11, 14], working: true, role: 'Head of State; Head of the Commonwealth', lead: 'Sovereign since 8 September 2022', homes: 'Buckingham Palace · Windsor Castle · Clarence House · Highgrove · Sandringham · Balmoral' },
  { id: 'queen', wiki: 'Queen Camilla', name: 'Queen Camilla', title: 'The Queen', diary: ['The Queen'], born: [1947, 7, 17], working: true, role: 'Consort of the King', lead: 'Queen since 6 May 2023', homes: 'With the King: Buckingham Palace · Windsor · Clarence House · Highgrove · Sandringham · Balmoral' },
  { id: 'william', wiki: 'William, Prince of Wales', name: 'William, Prince of Wales', title: 'The Prince of Wales', diary: ['The Prince of Wales'], born: [1982, 6, 21], working: true, role: 'Heir apparent; Duke of Cornwall and of Lancaster', lead: 'First in line to the throne', homes: 'Windsor Great Park · Anmer Hall (Norfolk) · Kensington Palace (office)' },
  { id: 'catherine', wiki: 'Catherine, Princess of Wales', name: 'Catherine, Princess of Wales', title: 'The Princess of Wales', diary: ['The Princess of Wales'], born: [1982, 1, 9], working: true, role: 'Princess of Wales', lead: 'Wife of the heir apparent', homes: 'Windsor Great Park · Anmer Hall (Norfolk) · Kensington Palace (office)' },
  { id: 'anne', wiki: 'Anne, Princess Royal', name: 'Anne, Princess Royal', title: 'The Princess Royal', diary: ['The Princess Royal'], born: [1950, 8, 15], working: true, role: 'The King’s sister; the busiest royal for years', lead: 'Patron of 300+ organisations', homes: 'Gatcombe Park (Gloucestershire) · St James’s Palace (office)' },
  { id: 'edward', wiki: 'Prince Edward, Duke of Edinburgh', name: 'Prince Edward, Duke of Edinburgh', title: 'The Duke of Edinburgh', diary: ['The Duke of Edinburgh'], born: [1964, 3, 10], working: true, role: 'The King’s brother; Duke of Edinburgh since March 2023', lead: 'Runs the Duke of Edinburgh’s Award', homes: 'Bagshot Park (Surrey) · Buckingham Palace (office)' },
  { id: 'sophie', wiki: 'Sophie, Duchess of Edinburgh', name: 'Sophie, Duchess of Edinburgh', title: 'The Duchess of Edinburgh', diary: ['The Duchess of Edinburgh'], born: [1965, 1, 20], working: true, role: 'Wife of the Duke of Edinburgh', lead: 'Patron of charities for women, sight and conflict-related violence', homes: 'Bagshot Park (Surrey) · Buckingham Palace (office)' },
  { id: 'richard', wiki: 'Prince Richard, Duke of Gloucester', name: 'Prince Richard, Duke of Gloucester', title: 'The Duke of Gloucester', diary: ['The Duke of Gloucester'], born: [1944, 8, 26], working: true, role: 'The King’s first cousin', lead: 'Senior working royal by age after the King', homes: 'Kensington Palace (Apartment 1)' },
  { id: 'birgitte', wiki: 'Birgitte, Duchess of Gloucester', name: 'Birgitte, Duchess of Gloucester', title: 'The Duchess of Gloucester', diary: ['The Duchess of Gloucester'], born: [1946, 6, 20], working: true, role: 'Wife of the Duke of Gloucester', lead: '', homes: 'Kensington Palace (Apartment 1)' },
  { id: 'kent', wiki: 'Prince Edward, Duke of Kent', name: 'Prince Edward, Duke of Kent', title: 'The Duke of Kent', diary: ['The Duke of Kent'], born: [1935, 10, 9], working: false, role: 'The King’s first cousin; stepped back from public life in 2022', lead: '', homes: 'Wren House, Kensington Palace' },
  { id: 'alexandra', wiki: 'Princess Alexandra, The Honourable Lady Ogilvy', name: 'Princess Alexandra', title: 'Princess Alexandra', diary: ['Princess Alexandra'], born: [1936, 12, 25], working: false, role: 'The King’s first cousin; retired from public engagements', lead: '', homes: 'Thatched House Lodge, Richmond' },
  // Not working royals: family dates only
  { id: 'george', wiki: 'Prince George of Wales', name: 'Prince George of Wales', title: 'Prince George', born: [2013, 7, 22], working: false, role: 'Second in line to the throne' },
  { id: 'charlotte', wiki: 'Princess Charlotte of Wales', name: 'Princess Charlotte of Wales', title: 'Princess Charlotte', born: [2015, 5, 2], working: false, role: 'Third in line to the throne' },
  { id: 'louis', wiki: 'Prince Louis of Wales', name: 'Prince Louis of Wales', title: 'Prince Louis', born: [2018, 4, 23], working: false, role: 'Fourth in line to the throne' },
  { id: 'harry', wiki: 'Prince Harry, Duke of Sussex', name: 'Prince Harry, Duke of Sussex', title: 'The Duke of Sussex', born: [1984, 9, 15], working: false, role: 'Fifth in line to the throne; left royal duties in 2020' },
  { id: 'beatrice', wiki: 'Princess Beatrice', name: 'Princess Beatrice', title: 'Princess Beatrice', born: [1988, 8, 8], working: false, role: 'Granddaughter of Queen Elizabeth II' },
  { id: 'eugenie', wiki: 'Princess Eugenie', name: 'Princess Eugenie', title: 'Princess Eugenie', born: [1990, 3, 23], working: false, role: 'Granddaughter of Queen Elizabeth II' },
];

/** Line of succession, the first five: stable, set by law. */
export const SUCCESSION = ['william', 'george', 'charlotte', 'louis', 'harry'];

/** The Diary and the Court Circular name people by title; this maps a title (or its start) to ids. */
export function peopleIn(text) {
  const ids = [];
  const t = text.replace(/^\s*(?:Her|His) (?:Majesty|Royal Highness)\s+/i, '');
  // Joint entries: "The King and Queen", "The Prince and Princess of Wales", "The Duke and Duchess of Gloucester"
  if (/^The King and (?:The )?Queen\b/.test(t)) return ['king', 'queen'];
  if (/^The Prince and Princess of Wales\b/.test(t)) return ['william', 'catherine'];
  if (/^The Duke and Duchess of Edinburgh\b/.test(t)) return ['edward', 'sophie'];
  if (/^The Duke and Duchess of Gloucester\b/.test(t)) return ['richard', 'birgitte'];
  for (const p of PEOPLE) for (const d of p.diary ?? []) if (new RegExp(`^${d}\\b`).test(t) && !ids.includes(p.id)) ids.push(p.id);
  return ids;
}

const DAY = 86400e3;
const LONDON = 'Europe/London';

/** Birthdays and family anniversaries for the next ~13 months, as calendar events. */
export function familyDates(zoned, iso, now = Date.now()) {
  const out = [];
  const Y = new Date(now).getUTCFullYear();
  const add = (id, title, y, m, d, extra) => {
    const start = zoned(y, m, d, 9, 0, LONDON);
    if (start < now - 2 * DAY || start > now + 400 * DAY) return;
    out.push({ id: `royal:${id}:${y}`, passion: 'royal', who: 'The Royal Family', start: iso(start), approxTime: true, source: 'Fixed date', ...extra, title });
  };
  const ord = n => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] ?? 'th'}`;
  for (const y of [Y, Y + 1]) {
    for (const p of PEOPLE) {
      const [by, bm, bd] = p.born;
      const age = y - by;
      const major = ['king', 'queen', 'william', 'catherine', 'anne'].includes(p.id);
      add(`birthday:${p.id}`, `${p.title === 'The King' ? 'The King' : p.name.split(',')[0]} turns ${age}`, y, bm, bd, {
        kind: 'birthday', weight: major ? 2 : 1, people: [p.id], who: p.title, sub: `${ord(age)} birthday`,
      });
    }
    add('anniv:accession', `Accession Day: ${ord(y - 1952)} anniversary of Queen Elizabeth II’s accession`, y, 2, 6, { kind: 'anniversary', weight: 1, source: 'Fixed date: 6 February' });
    add('anniv:charles-camilla', `The King and Queen’s ${ord(y - 2005)} wedding anniversary`, y, 4, 9, { kind: 'anniversary', weight: 1, people: ['king', 'queen'] });
    add('anniv:wedding-wales', `The Prince and Princess of Wales’s ${ord(y - 2011)} wedding anniversary`, y, 4, 29, { kind: 'anniversary', weight: 1, people: ['william', 'catherine'] });
    add('anniv:coronation', `${ord(y - 2023)} anniversary of the Coronation`, y, 5, 6, { kind: 'anniversary', weight: 1, people: ['king', 'queen'] });
    add('anniv:elizabeth-birth', `Queen Elizabeth II would have turned ${y - 1926}`, y, 4, 21, { kind: 'anniversary', weight: 1 });
    add('anniv:elizabeth-death', `${ord(y - 2022)} anniversary of the death of Queen Elizabeth II`, y, 9, 8, { kind: 'anniversary', weight: 1 });
  }
  return out;
}
