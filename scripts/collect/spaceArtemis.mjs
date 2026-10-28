// The road to launch of the next Artemis flight: the steps of an SLS/Orion campaign at Kennedy,
// each marked done (or under way) when nasa.gov reports it for that mission, with the story.
import { wikitext } from './lib.mjs';
import { nasaSearch } from './spaceCorps.mjs';

/**
 * The campaign, in the usual order. `done` matches a story saying the step is complete,
 * `start` one saying it has begun. Titles are matched first, then the opening of the story.
 */
const STEPS = [
  { id: 'begin', lane: 'rocket', label: 'Processing begins at Kennedy', done: /begins processing|processing .*begins/i },
  { id: 'ml', lane: 'pad', label: 'Mobile Launcher back in the Vehicle Assembly Building', done: /mobile launcher (arrives|rolls|moves)/i },
  { id: 'segments', lane: 'rocket', label: 'Booster segments arrive by train', done: /train ride .*booster|booster segments .*arriv/i, start: /booster segments/i },
  { id: 'core', lane: 'rocket', label: 'Core stage arrives at Kennedy', done: /core stage arriv|core stage .*(at|to) kennedy|hardware arrives/i, start: /rolls out .*core stage|core stage on the move/i },
  { id: 'engines', lane: 'rocket', label: 'RS-25 engines installed on the core stage', done: /engines take their place|engine(s)? install(ed|ation complete)|completes .*engine/i, start: /starts .*engine install|engine install/i },
  { id: 'stack', lane: 'rocket', label: 'Solid rocket boosters stacked', done: /completes .*booster stacking|booster stacking complete|boosters? (are )?stacked/i, start: /booster stacking|stacks? (up|the) .*booster|flight hardware stacks/i },
  { id: 'corestack', lane: 'rocket', label: 'Core stage lifted between the boosters', done: /core stage .*(between|joins|integrated with|stacked|lifted)|(lifts?|stacks?) .*core stage/i },
  { id: 'upper', lane: 'rocket', label: 'Adapter and upper stage stacked', done: /(launch vehicle stage adapter|LVSA|ICPS|interim cryogenic|upper stage|orion stage adapter) .*(stack|install|atop|added|joins)|stacks? .*(upper stage|ICPS|adapter)/i },
  { id: 'orionjoin', lane: 'orion', label: 'Orion crew and service modules joined', done: /(crew and service modules joined|joins .*orion modules|orion modules (joined|mated))/i },
  { id: 'oriontest', lane: 'orion', label: 'Orion environmental testing', done: /orion .*(altitude chamber|thermal vacuum|acoustic|test(ing)? complete)|completes .*orion .*test/i },
  { id: 'orionfuel', lane: 'orion', label: 'Orion fuelled and serviced', done: /orion .*(fuell?ed|fuell?ing|servicing|propellant)/i },
  { id: 'las', lane: 'orion', label: 'Launch abort system installed', done: /launch abort (system|tower)/i },
  { id: 'orionstack', lane: 'pad', label: 'Orion stacked on the rocket', done: /orion .*(stack|atop|secured|lifted) .*(rocket|sls)|(rocket|sls) .*(complete|fully stacked)|stacking complete/i },
  { id: 'sims', lane: 'pad', label: 'Launch team countdown simulations', note: 'Controllers in the Launch Control Center rehearse the final hours, failures included.', done: /launch team .*(certif|ready)/i, start: /countdown simulation|launch team .*(simulat|rehears|train)/i },
  { id: 'tests', lane: 'pad', label: 'Integrated tests in the VAB', done: /(integrated|interface|end-to-end) test|countdown demonstration|crew equipment interface/i },
  { id: 'rollout', lane: 'pad', label: 'Rollout to Launch Pad 39B', done: /roll(s|ed)? (out )?to (the )?(launch )?pad|arrives at (launch )?pad|pad 39b/i },
  { id: 'wdr', lane: 'pad', label: 'Wet dress rehearsal', done: /wet dress/i },
  { id: 'frr', lane: 'pad', label: 'Flight readiness review', done: /flight readiness review|go for launch/i },
  { id: 'crew', lane: 'crew', label: 'Crew named', done: /names? .*crew|crew (announced|named)/i },
  { id: 'training', lane: 'crew', label: 'Crew training', done: /crew (completes|finishes) .*training/i, start: /crew training|crew (trains|practices)|training/i },
  { id: 'ceit', lane: 'crew', label: 'Crew checks out the real hardware', note: 'The crew equipment interface test: suited astronauts climb into their own Orion at Kennedy.', done: /crew equipment interface|crew (visits|tours|inspects)|crew .*(climbs?|inside) .*orion/i },
  { id: 'lander', lane: 'crew', label: 'Lander test flight', done: /lander .*(test|demo) .*(complete|success)|(completes|successful) .*lander/i, start: /lander test|lander/i },
  { id: 't38', lane: 'crew', label: 'Crew flies into Kennedy in T-38 jets', note: 'A few days before launch the crew lands at the Shuttle Landing Facility in NASA\u2019s white jets.', done: /crew (arrives?|lands?|touch(es)? down)|astronauts arrive/i },
  { id: 'quarantine', lane: 'crew', label: 'Health stabilisation (quarantine)', note: 'About two weeks of isolation so no one carries a cold into space.', done: /quarantine|health stabili[sz]ation/i },
  // Traditions: things crews have always done, which NASA reports as they happen
  { id: 'patch', lane: 'traditions', label: 'Mission patch unveiled', note: 'Each crew designs its own patch; it flies on their suits and the rocket.', own: true, done: /insignia|emblem|patch\b/i },
  { id: 'capsule', lane: 'traditions', label: 'Crew names the Orion capsule', note: 'Like Apollo\u2019s Columbia or Artemis II\u2019s Integrity, the crew picks the call sign.', own: true, done: /names? .*(orion|spacecraft|capsule)|call sign|nicknam/i },
  { id: 'zerog', lane: 'traditions', label: 'Zero-G indicator chosen', note: 'A small plush toy that floats free the moment the crew reaches orbit.', own: true, done: /zero.?g(ravity)? indicator|plush/i },
  { id: 'suitup', lane: 'traditions', label: 'Suit-up in the Armstrong building', note: 'Launch day: suits are checked in the Neil Armstrong Operations and Checkout Building.', done: /suit(s|ing)? up/i },
  { id: 'walkout', lane: 'traditions', label: 'Walkout and the Astrovan to the pad', note: 'The crew waves to families and rides the Astrovan II to Launch Pad 39B.', done: /walkout|walks? out|astrovan/i },
  { id: 'hatch', lane: 'traditions', label: 'Hatch closed', note: 'Last handshake with the closeout crew; the hatch shuts about two hours before liftoff.', done: /hatch (clos|secured)/i },
];

/** "Orion CM-003 ''Integrity''": the vehicles of each flight and the capsule's name, from Wikipedia's infobox. */
async function capsule(mission) {
  try {
    const w = await wikitext(mission);
    const box = w?.match(/\|\s*spacecraft\s*=([\s\S]*?)\n\|\s*\w+\s*=/)?.[1] ?? '';
    const items = [...box.matchAll(/^\s*\|\s*(.+)$/gm)].map(m => m[1]).filter(x => !/^\s*$/.test(x));
    const clean = t => t.replace(/<ref[\s\S]*?(?:<\/ref>|\/>)|\{\{r\s*\|[^}]*\}\}/g, '').replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/''+/g, '').replace(/\s+/g, ' ').trim();
    const orion = items.find(x => /orion/i.test(x));
    return {
      vehicles: items.map(clean).filter(Boolean),
      orion: orion ? clean(orion.replace(/''[^']+''/, '')) : null,
      name: orion?.match(/''([^']+)''/)?.[1] ?? null,
    };
  } catch { return null; }
}

export async function collectArtemisFlow(mission, flights = []) {
  if (!mission) return null;
  const roman = mission.match(/Artemis\s+([IVX]+)/i)?.[1];
  if (!roman) return null;
  const name = `Artemis ${roman}`;
  // This mission and not a neighbour: "Artemis II" must not match inside "Artemis III"
  const about = new RegExp(`\\bArtemis ${roman}(?![IVX])`, 'i');
  const after = `${new Date().getUTCFullYear() - 2}-01-01`;
  const posts = (await nasaSearch(name, after)).filter(p => about.test(p.title) || about.test(p.text.slice(0, 500)))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time)); // oldest first: the first story that reports a step dates it
  const steps = STEPS.map(s => {
    // Done: the first story that reports it. Under way: the latest story about it.
    const ok = p => !s.own || about.test(p.title);
    const done = posts.find(p => ok(p) && s.done.test(p.title));
    const started = !done && s.start ? posts.findLast(p => ok(p) && s.start.test(p.title)) : null;
    const p = done ?? started;
    return { id: s.id, lane: s.lane, label: s.label, note: s.note ?? null, status: done ? 'done' : started ? 'active' : 'todo', date: p?.time ?? null, title: p?.title ?? null, url: p?.url ?? null };
  });
  // Capsule of every Artemis flight; a name on Wikipedia also ticks the naming tradition
  const capsules = {};
  for (const f of flights) { const c = await capsule(f.replace(/\s*\(.*\)$/, '')); if (c) capsules[f.replace(/\s*\(.*\)$/, '')] = c; }
  const own = capsules[name];
  const naming = steps.find(s => s.id === 'capsule');
  if (own?.name) { naming.label = `Orion named \u201c${own.name}\u201d`; if (naming.status !== 'done') naming.status = 'done'; }
  return {
    at: new Date().toISOString(),
    mission: name,
    capsules,
    steps,
    log: [...posts].reverse().slice(0, 30).map(p => ({ title: p.title, url: p.url, time: p.time })),
  };
}
