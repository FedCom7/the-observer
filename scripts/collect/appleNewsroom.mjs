// Apple Newsroom, studied: the whole archive since 2000 (apple.com/newsroom/archive, 10 stories
// a page), each story with its type and a topic, and Apple's quarterly results read from its own
// "Apple reports … quarter results" press releases.
import { decode, get } from './lib.mjs';

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const ARCHIVE = 'https://www.apple.com/newsroom/archive/';

// First match wins: the order puts specific subjects before broad ones.
export const TOPICS = [
  ['ai', /apple intelligence|siri ai|\bai\b|machine learning|private cloud compute/i],
  ['iphone', /iphone/i],
  ['ipad', /ipad|apple pencil/i],
  ['mac', /\bmac\b|macs\b|imac|macbook|mac (?:mini|pro|studio|os)|macos|os x|powerbook|ibook|power ?mac|xserve|emac|final cut|logic pro|\bm\d (?:pro|max|ultra|chip|family)|apple silicon|\bg[345]\b|cinema (?:hd )?display|magic (?:mouse|trackpad|keyboard)|superdrive|intel|airport|xgrid|pro display/i],
  ['watch', /watch|health|heart|fitness|hearing|sleep|workout|research study/i],
  ['vision', /vision pro|visionos|spatial|apple immersive/i],
  ['audio', /ipod|airpods|itunes|music|homepod|beats|podcast|shazam/i],
  ['tv', /apple tv|tv\+|film|series|emmy|oscar|movie|premiere|documentary|\bmls\b|soccer|formula 1|\bf1\b|friday night baseball|season \d|trailer|hbo|oprah|peanuts|ted lasso|severance/i],
  ['services', /app store|apple pay|apple card|apple cash|wallet|icloud|arcade|apple one|news\+|maps|apple books|apple account|services|apple sports|siri|privacy|imessage|facetime|carplay|ibooks|iad\b|mobileme|\.mac\b/i],
  ['software', /\bwwdc|developer|\bios\b|ios \d|ipados|watchos|tvos|software|swift|xcode|design awards|apps? of the year|accessibility|quicktime|shake|keynote|ilife|iwork|iphoto|imovie|garageband|clips|creator studio|aperture|jaguar|panther|tiger|leopard|safari|boot camp|mac os/i],
  ['planet', /environment|clean energy|carbon|renewable|recycl|climate|green|restore fund|water|solar|wind farm|parks?\b|earth day/i],
  ['retail', /apple store|\bstores?\b|retail|today at apple|apple (?:fifth avenue|park visitor)|\bopens?\b|opening|self service repair|shop with/i],
  ['company', /results|quarter|dividend|board|\bceo\b|executive|appoint|names? .*(?:president|officer|vice)|manufacturing|investment|invest|jobs|billion|acquire|lawsuit|statement|european union|digital markets|regulat|manufactur|supplier|stock|shareholders|leadership|retire|joins apple|chief|governance|housing|job footprint|antitrust|tariff|european commission|covid|apple park/i],
  ['community', /education|school|students|teachers|community|racial|donat|grant|coders?|designers|entrepreneur|camp|scholars|nonprofit|relief|women|veterans/i],
];
export const topicOf = title => TOPICS.find(([, re]) => re.test(title))?.[0] ?? 'other';

// What kind of news a story is, from its title and type. Checked in this order; "launch" needs a
// product word and a launch verb (a press release may use a softer verb), "stories" takes the
// features (updates, Apple Stories, photos) left over.
const HARDWARE = /notebook|desktop|server|iphone|ipad|\bmac\b|macbook|imac|mac (?:mini|pro|studio)|apple watch|airpods|homepod|apple tv(?!\+)|vision pro|airtag|ipod|display|keyboard|mouse|trackpad|pencil|chip|\bm\d\b|airport|xserve|power ?mac|powerbook|ibook|emac|beats|homeview|home collection|accessor/i;
const OS_NAME = /\b(?:ios|ipados|macos|watchos|tvos|visionos)\b|mac os x/i;
// Product words in stories that are about the company, not a launch
const NOT_LAUNCH = /manufactur|partners|supplier|investment|\bjobs\b|results|recycl|carbon|program\b/i;
const LAUNCH_SOFT = /unleash|upgrad|lowers|price|brings? iphone|introduc|unveil|announc|debut|launch|say hello|meet the|new\b|available|pre-?order|arriv|ships?\b|now shipping|delivers|updates? (?:the|its)|refresh|next generation|all-new|faster|more powerful/i;
const LAUNCH_STRONG = /unleash|introduc|unveil|debut|pre-?order|available (?:today|now|to order|starting|for pre-order)|arriv|in stores|now shipping|say hello|meet the new/i;
export const GROUPS = [
  ['events', /media advisory|media alert|\bwwdc\b|keynote|special event|apple event|media event|macworld|livestream|to (?:unveil|preview)|event (?:on|in)|expo\b|worldwide developers conference|sends invit|invitations/i],
  ['launch', null],
  ['retail', /^(?!.*(?:manufactur|data cent|academy|office|music hall))(?:.*)(?:apple store(?! app)|(?<!itunes |music |app |itunes music |online |web )\bstores?\b|retail|today at apple|\b(?:re)?opens\b|now open\b|to open (?:first|its|new)|first customers|grand opening|self service repair|genius|shop with)/i],
  ['company', /results|quarter|dividend|\bboard\b|\bceo\b|\bcfo\b|chief|executive|officer|appoint|names? |leadership|retire|joins apple|manufacturing|investment|invest|\bjobs\b|billion|acquir|lawsuit|statement|european union|digital markets|regulat|manufactur|supplier|shareholder|stock|governance|antitrust|tariff|commission|court|settle|investigat|headquarters|apple park|data cent/i],
  ['impact', /families|child safety|kids|environment|clean energy|carbon|renewable|recycl|climate|green bond|restore fund|solar|wind farm|education|school|students|teachers|community|racial|equity|donat|grant|nonprofit|relief|coders?|scholars|entrepreneur camp|women|veterans|accessibility|privacy|safety|parks|earth day|covid|hurricane|wildfire|housing/i],
  ['services', /applecare|apple upgrade|academy award|apple tv\+|tv\+|apple tv app|apple music|itunes|apple arcade|apple pay|apple card|apple cash|wallet|icloud|apple one|news\+|fitness\+|apple books|podcasts|app store|apple sports|\bmls\b|soccer|formula 1|\bf1\b|baseball|emmy|oscar|golden globe|film|documentary|season|premiere|trailer|movie|music|concert|shazam|maps/i],
  ['software', /\bios\b|ios \d|ipados|macos|mac os|os x|watchos|tvos|visionos|software|feature|update|apple intelligence|siri|apps?\b|safari|facetime|imessage|messages|health|carplay|developer|swift|xcode|quicktime|final cut|logic|studio pro|jam pack|soundtrack|motion|shake|pro apps|garageband|imovie|iphoto|iwork|ilife|keynote|pages|numbers|aperture|clips|creator studio|beta/i],
  ['stories', null],
];
export function groupOf(title, kind) {
  for (const [g, re] of GROUPS) {
    if (g === 'launch') { if (HARDWARE.test(title) && !OS_NAME.test(title) && !NOT_LAUNCH.test(title) && (kind === 'PRESS RELEASE' ? LAUNCH_SOFT : LAUNCH_STRONG).test(title)) return g; continue; }
    if (g === 'stories') { if (['APPLE STORIES', 'PHOTOS', 'PHOTO', 'QUICK READ', 'UPDATE'].includes(kind)) return g; continue; }
    if (re.test(title)) return g;
  }
  return 'other';
}

/** The stories on one archive page: { d: 'YYYY-MM-DD', k: type, t: title, u: path }. */
async function archivePage(n) {
  const html = await get(`${ARCHIVE}?page=${n}`, { browser: true });
  return [...html.matchAll(/<a href="(\/newsroom\/[^"]+)"[^>]*aria-label="([^"]+)"/g)].map(m => {
    const label = decode(m[2]).replace(/\u00a0/g, ' ');
    const p = label.match(new RegExp(`^(${MONTHS}) (\\d{1,2}), (\\d{4}) - ([A-Z][A-Z ]+?) - (.+)$`));
    if (!p) return null;
    const d = `${p[3]}-${String(MONTHS.split('|').indexOf(p[1]) + 1).padStart(2, '0')}-${p[2].padStart(2, '0')}`;
    return { d, k: p[4].trim(), t: p[5].trim(), u: m[1], c: topicOf(p[5]), g: groupOf(p[5], p[4].trim()) };
  }).filter(Boolean);
}

/** Pages 1..n, a few at a time, until the archive ends (the last page repeats past its end). */
async function pages(from, to, stopAt) {
  const out = [];
  let lastFirst = null;
  for (let n = from; n <= to; n += 6) {
    const batch = await Promise.all(Array.from({ length: Math.min(6, to - n + 1) }, (_, i) => archivePage(n + i).catch(() => [])));
    for (const items of batch) {
      if (!items.length || items[0].u === lastFirst) return out;
      lastFirst = items[0].u;
      out.push(...items);
      if (stopAt && items.some(i => stopAt.has(i.u))) return out;
    }
  }
  return out;
}

/**
 * The full archive, newest first. The first run reads every page (about 300); later runs read
 * only the newest pages until they meet a story already known.
 */
export async function newsroomArchive(prev = []) {
  const known = new Set(prev.map(i => i.u));
  const fresh = prev.length > 1000 ? await pages(1, 40, known) : await pages(1, 600);
  const seen = new Set();
  return [...fresh, ...prev]
    .map(i => ({ ...i, c: topicOf(i.t), g: groupOf(i.t, i.k) }))
    .filter(i => !seen.has(i.u) && seen.add(i.u))
    .sort((a, b) => b.d.localeCompare(a.d));
}

const QUARTERS = { first: 1, second: 2, third: 3, fourth: 4 };
const money = s => {
  const m = s.match(/\$\s?([\d.,]+)\s*(billion|million)/i);
  return m ? +m[1].replace(/,/g, '') * (/billion/i.test(m[2]) ? 1 : 1e-3) : null;
};

/** Revenue (billions), diluted EPS and net income from an "Apple reports … quarter results" release. */
async function results(item) {
  const html = await get(`https://www.apple.com${item.u}`, { browser: true });
  const t = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
  const q = t.match(/fiscal (\d{4}) (first|second|third|fourth) quarter|(first|second|third|fourth) quarter of fiscal (?:year )?(\d{4})|fiscal (\d{4}) (first|second|third|fourth)/i)
    ?? item.t.match(/(first|second|third|fourth) quarter/i);
  const fy = q ? +(q[1] ?? q[4] ?? q[5] ?? 0) || null : null;
  const qn = q ? QUARTERS[(q[2] ?? q[3] ?? q[6] ?? q[1]).toLowerCase()] ?? null : null;
  // Total revenue first: the subtitle can quote a segment ("Services revenue of $10 billion")
  const rev = t.match(/(?:quarterly |posted (?:an? )?(?:all-time |record )*)revenues?(?: record)? (?:of|was|were) \$\s?[\d.,]+\s*(?:billion|million)/i)
    ?? t.match(/revenues? for the quarter (?:of|was|were) \$\s?[\d.,]+\s*(?:billion|million)/i)
    ?? t.match(/revenues?(?: record)? (?:of|was|were) \$\s?[\d.,]+\s*(?:billion|million)/i);
  const eps = t.match(/earnings per (?:diluted )?share (?:of|was|were) \$\s?(\d*\.\d+)|\$\s?(\d*\.\d+) per (?:diluted )?share/i);
  const net = t.match(/net (?:quarterly )?(?:profit|income|loss) (?:of|was) \$\s?[\d.,]+\s*(?:billion|million)/i);
  // "a net loss of $8 million, or $.02 per share"
  const sign = net && /loss/i.test(net[0]) ? -1 : 1;
  return {
    u: item.u, d: item.d, fy: fy ?? (qn === 1 ? +item.d.slice(0, 4) + 1 : +item.d.slice(0, 4)), q: qn,
    revenue: rev ? money(rev[0]) : null, eps: eps ? sign * +(eps[1] ?? eps[2]) : null, net: net ? sign * money(net[0]) : null,
  };
}

/** Every quarterly results release found in the archive; known ones are not read again. */
export async function earningsHistory(archive, prev = []) {
  const known = new Map(prev.map(r => [r.u, r]));
  const releases = archive.filter(i => /^apple reports? .*quarter results/i.test(i.t) && !/conference call|to report/i.test(i.t + i.u));
  const todo = releases.filter(i => !known.has(i.u));
  for (let i = 0; i < todo.length; i += 6) {
    const got = await Promise.all(todo.slice(i, i + 6).map(r => results(r).catch(() => null)));
    for (const r of got) if (r) known.set(r.u, r);
  }
  return [...known.values()].sort((a, b) => a.d.localeCompare(b.d));
}
