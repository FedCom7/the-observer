// The deeper Space screens: the ISS (expedition, crew, ports, traffic, spacewalks) and SpaceX
// (every launch, boosters, records). Both read Launch Library, which allows 15 requests an hour:
// space.mjs refreshes one of these bundles per run, each at most every six hours.
const LL = 'https://ll.thespacedevs.com/2.3.0';
const ISS_ID = 4;
const SPACEX_ID = 121;

const thumb = img => img?.thumbnail_url ?? img?.image_url ?? null;
const vehicleOf = fv => fv?.spacecraft?.name ?? '';
const missionOf = fv => fv?.launch?.name?.split('|').pop().trim() ?? '';

/** ISS: the current expedition and its crew, who is docked where, recent traffic and spacewalks. 4 requests. */
export async function collectIss(ll) {
  const st = await ll(`/space_stations/${ISS_ID}/?mode=detailed`);
  const expRef = st.active_expeditions?.[0];
  const exp = expRef ? await ll(`/expeditions/${expRef.id}/?mode=detailed`) : null;
  const docking = await ll('/docking_events/?limit=40&ordering=-docking&mode=normal');
  const walks = await ll('/spacewalks/?limit=30&ordering=-start&mode=normal');
  const isIss = d => d.space_station_target?.id === ISS_ID || /ISS|International Space Station/i.test(d.space_station_target?.name ?? '');
  return {
    at: new Date().toISOString(),
    station: {
      name: st.name, image: st.image?.image_url ?? null, founded: st.founded, orbit: st.orbit,
      mass: st.mass, volume: st.volume, height: st.height, width: st.width,
      onboard: st.onboard_crew, docked: st.docked_vehicles, owners: (st.owners ?? []).map(o => o.abbrev),
    },
    expedition: exp ? {
      name: exp.name, start: exp.start, end: exp.end,
      patch: exp.mission_patches?.[0]?.image_url ?? null,
      crew: (exp.crew ?? []).map(c => ({ name: c.astronaut?.name ?? '', role: c.role?.role ?? '', agency: c.astronaut?.agency?.abbrev ?? '', nationality: c.astronaut?.nationality?.[0]?.nationality_name ?? '', image: thumb(c.astronaut?.image), age: c.astronaut?.age ?? null, firstFlight: c.astronaut?.first_flight ?? null, lastFlight: c.astronaut?.last_flight ?? null, inSpace: c.astronaut?.time_in_space ?? null, evaTime: c.astronaut?.eva_time ?? null })),
    } : null,
    ports: (st.docking_location ?? []).filter(p => p.name).map(p => ({
      name: p.name,
      vehicle: p.currently_docked ? vehicleOf(p.currently_docked.flight_vehicle_chaser) || p.currently_docked.payload_flight_chaser?.payload?.name || 'Docked' : null,
      mission: p.currently_docked ? missionOf(p.currently_docked.flight_vehicle_chaser) : null,
      since: p.currently_docked?.docking ?? null,
    })),
    traffic: (docking.results ?? []).filter(isIss).slice(0, 20).map(d => ({
      id: d.id, vehicle: vehicleOf(d.flight_vehicle_chaser) || d.payload_flight_chaser?.payload?.name || '', mission: missionOf(d.flight_vehicle_chaser),
      port: d.docking_location?.name ?? '', docking: d.docking, departure: d.departure,
    })),
    // Every stay at either station (the overview's mission timeline)
    stays: (docking.results ?? []).map(d => ({
      id: d.id, vehicle: vehicleOf(d.flight_vehicle_chaser) || d.payload_flight_chaser?.payload?.name || '', mission: missionOf(d.flight_vehicle_chaser),
      station: isIss(d) ? 'ISS' : /tiangong|tianhe|wentian|mengtian/i.test(`${d.space_station_target?.name} ${d.docking_location?.name}`) ? 'Tiangong' : d.space_station_target?.name ?? '',
      crewed: /crew dragon|soyuz ms|shenzhou|starliner/i.test(vehicleOf(d.flight_vehicle_chaser)),
      docking: d.docking, departure: d.departure,
    })),
    spacewalks: (walks.results ?? []).filter(w => /International Space Station/i.test(w.location ?? '')).slice(0, 14).map(w => ({
      id: w.id, name: w.name, start: w.start, end: w.end, duration: w.duration, crew: (w.crew ?? []).map(c => c.astronaut?.name ?? ''),
    })),
  };
}

const landingOf = s => {
  const l = s.landing;
  if (!l?.attempt) return { result: 'expended', where: '' };
  return { result: l.success === true ? 'landed' : l.success === false ? 'lost' : 'pending', where: l.landing_location?.abbrev ?? l.landing_location?.name ?? '' };
};

/** SpaceX: records, every launch this year (by month), recent launches with boosters, what is next. 5 requests. */
export async function collectSpacex(ll, prev) {
  const ag = await ll(`/agencies/${SPACEX_ID}/?mode=detailed`);
  const recent = await ll(`/launches/previous/?lsp__id=${SPACEX_ID}&limit=30&mode=detailed`);
  const upcoming = await ll(`/launches/upcoming/?lsp__id=${SPACEX_ID}&limit=15&mode=normal`);
  // This year's launches in the light "list" mode, two pages of 100
  const year = new Date().getUTCFullYear();
  const yearList = [];
  let url = `/launches/previous/?lsp__id=${SPACEX_ID}&net__gte=${year}-01-01T00:00:00Z&limit=100&mode=list`;
  for (let page = 0; url && page < 2; page++) {
    const j = await ll(url);
    yearList.push(...j.results);
    url = j.next ? j.next.replace(LL, '') : null;
  }
  // The rocket first: a Starship test flight carrying Starlinks counts as Starship
  const kind = name => (/starship/i.test(name) ? 'Starship' : /starlink/i.test(name) ? 'Starlink' : /crew|axiom|dragon|fram|vast|haven/i.test(name) ? 'Dragon' : 'Customer');
  const byMonth = Array.from({ length: 12 }, () => ({ Starlink: 0, Customer: 0, Dragon: 0, Starship: 0, failed: 0 }));
  for (const l of yearList) {
    const m = new Date(l.net).getUTCMonth();
    byMonth[m][kind(l.name)]++;
    if (/fail/i.test(l.status?.abbrev ?? '')) byMonth[m].failed++;
  }
  const launch = l => ({
    id: l.id, name: l.name.split('|').pop().trim(), rocket: l.rocket?.configuration?.name ?? l.name.split('|')[0].trim(),
    net: l.net, status: l.status?.abbrev ?? '', tbc: (l.net_precision?.id ?? 0) >= 6 || ['TBD', 'TBC'].includes(l.status?.abbrev),
    pad: l.pad?.name ?? '', location: l.pad?.location?.name ?? '', orbit: l.mission?.orbit?.abbrev ?? '', type: l.mission?.type ?? '', kind: kind(l.name),
    webcast: l.webcast_live ?? false,
  });
  const recentLaunches = (recent.results ?? []).map(l => ({
    ...launch(l),
    boosters: [].concat(l.rocket?.launcher_stage ?? []).map(s => ({ serial: s.launcher?.serial_number ?? '', flight: s.launcher_flight_number ?? null, turnaround: s.turn_around_time ?? null, ...landingOf(s) })),
  }));
  // Fleet leaders: the boosters with most flights seen in recent launches (kept across runs)
  const fleet = new Map((prev?.fleet ?? []).map(b => [b.serial, b]));
  for (const l of recentLaunches) for (const b of l.boosters) {
    if (!b.serial || b.flight == null) continue;
    const old = fleet.get(b.serial);
    if (!old || b.flight >= old.flights) fleet.set(b.serial, { serial: b.serial, flights: b.flight, last: l.net, lastMission: l.name, status: b.result });
  }
  return {
    at: new Date().toISOString(),
    stats: {
      total: ag.total_launch_count, successes: ag.successful_launches, failures: ag.failed_launches, streak: ag.consecutive_successful_launches,
      landings: ag.successful_landings, landingAttempts: ag.attempted_landings, landingStreak: ag.consecutive_successful_landings,
      dragonReturns: ag.successful_landings_spacecraft, pending: ag.pending_launches,
    },
    year, yearCount: yearList.length, byMonth,
    recent: recentLaunches,
    upcoming: (upcoming.results ?? []).map(launch),
    fleet: [...fleet.values()].sort((a, b) => b.flights - a.flights).slice(0, 12),
  };
}
