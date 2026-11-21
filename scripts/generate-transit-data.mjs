import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DATA_DIR = path.join(ROOT_DIR, 'public', 'data');

const OVERPASS_ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
];

const OVERPASS_QUERY = `[out:json][timeout:30];
(
  node["highway"="bus_stop"](35.34,-5.56,35.86,-5.08);
  node["public_transport"="platform"]["bus"="yes"](35.34,-5.56,35.86,-5.08);
);
out body;`;

// Verified [lng, lat] coordinate dictionary for all Tetouan & regional hubs
const HUBS = {
  rommana: [-5.39242, 35.56549],
  dar_takafa: [-5.383003, 35.57058],
  ancienne_gare: [-5.366764, 35.566002], // Old Railway Station (Autobus Station - Oued Laou / Ain Zarka)
  khalid_ibn_walid: [-5.380903, 35.572803],
  place_al_adala: [-5.3747, 35.5705],
  avenue_des_far: [-5.353034, 35.580984],
  saniat_rmel: [-5.34879, 35.574079],
  place_palestine: [-5.326428, 35.600447], // Lotissement Souani (Place Palestine)
  quartier_universitaire: [-5.36241, 35.56143], // Mhannech / Faculte des Sciences
  boujarrah: [-5.35418, 35.58501],
  qalaline: [-5.34433, 35.6215],
  dar_zkik: [-5.397175, 35.549853], // Ain Dar Zkik
  hay_nassim: [-5.42068, 35.57232], // Hay Nassim Nakata
  omar_mokhtar: [-5.40046, 35.56647], // Avenue Omar El Mokhtar 7
  hajrat_aroussa: [-5.34031, 35.5988],
  karyane: [-5.335, 35.592],
  mokhtar_soussi: [-5.35848, 35.58889],
  ain_samsa: [-5.406174, 35.591374],
  jamaa_mezouak: [-5.3962, 35.57396], // Avenue Zaio (Jamaa Mezouak)
  bouanane: [-5.371806, 35.548441],
  tamouda: [-5.324956, 35.588406],
  abderrahmane_dakhel: [-5.38431, 35.55897], // Boulevard Abderrahmane Dakhil
  torreta: [-5.369056, 35.5503], // Torreta (El Borj)
  rn13_malaliyine: [-5.327287, 35.624908], // National Route 13 (Malaliyine)
  malaliyine: [-5.341542, 35.626566],
  abdellah_fakhar: [-5.352505, 35.564595],
  barbourine: [-5.374, 35.581],
  sahtriyine: [-5.467919, 35.560172],
  amsa: [-5.230782, 35.526575],
  azla: [-5.242701, 35.550609],
  oued_laou: [-5.09164, 35.44921],
  ain_lahcen: [-5.55494, 35.54749],
  khemis_anjra: [-5.510734, 35.664526],
  saddina: [-5.452721, 35.620427],
  ben_karrich: [-5.425515, 35.507641],
  zinate: [-5.402815, 35.470438],
  arbaa_beni_hassan: [-5.370735, 35.356061],
  beni_salah: [-5.360733, 35.550764],
  ain_zarka: [-5.342911, 35.520493],
  hay_bouzaghlal: [-5.346932, 35.698063],
  mdiq: [-5.322959, 35.685441],
  fnideq: [-5.355107, 35.841411],
  martil: [-5.275194, 35.617984],
};

// Complete 35 Bus Lines (17 Urban + 18 Regional)
const LINES_SPEC = [
  // Urban Network (17 Lines - 3.50 MAD)
  {
    id: 'L1',
    number: '1',
    category: 'urban',
    color: '#0284C7',
    price_mad: 3.5,
    frequency_mins: 12,
    first_departure: '06:00',
    last_departure: '22:00',
    corridor: ['rommana', 'dar_takafa', 'avenue_des_far', 'boujarrah'],
    // Verified full Avenue des FAR -> Boussafou -> Bennouna Boussafou -> Boujarrah 1/2/3 -> Boujarrah Station corridor
    routeWaypoints: [
      [-5.39242, 35.56549],
      [-5.383003, 35.57058],
      [-5.353034, 35.580984],
      [-5.347391, 35.586294],
      [-5.3451, 35.589631],
      [-5.342964, 35.592158],
      [-5.345871, 35.593516],
      [-5.347742, 35.594675],
      [-5.350566, 35.593005],
      [-5.353571, 35.591397],
      [-5.35569, 35.587709],
      [-5.35418, 35.58501],
    ],
  },
  { id: 'L3', number: '3', category: 'urban', color: '#4F46E5', price_mad: 3.5, frequency_mins: 20, first_departure: '06:15', last_departure: '21:45', corridor: ['rommana', 'dar_takafa', 'boujarrah', 'qalaline'] },
  { id: 'L4', number: '4', category: 'urban', color: '#059669', price_mad: 3.5, frequency_mins: 20, first_departure: '06:15', last_departure: '21:45', corridor: ['dar_takafa', 'abderrahmane_dakhel', 'dar_zkik'] },
  { id: 'L5', number: '5', category: 'urban', color: '#DB2777', price_mad: 3.5, frequency_mins: 15, first_departure: '06:00', last_departure: '22:00', corridor: ['dar_takafa', 'jamaa_mezouak', 'hay_nassim'] },
  { id: 'L6', number: '6', category: 'urban', color: '#D97706', price_mad: 3.5, frequency_mins: 15, first_departure: '06:00', last_departure: '22:00', corridor: ['dar_takafa', 'omar_mokhtar'] },
  {
    id: 'L7',
    number: '7',
    category: 'urban',
    color: '#0891B2',
    price_mad: 3.5,
    frequency_mins: 12,
    first_departure: '06:00',
    last_departure: '22:15',
    corridor: ['rommana', 'dar_takafa', 'saniat_rmel', 'place_palestine'],
    // Verified Touabel -> Avenue Al Joulane -> Avenue Mehdi Ben Barka -> Wilaya -> Aeroport corridor
    routeWaypoints: [
      [-5.39242, 35.56549],
      [-5.383003, 35.57058],
      [-5.348838, 35.574001],
      [-5.349432, 35.575456],
      [-5.350707, 35.577954],
      [-5.349217, 35.578908],
      [-5.346481, 35.579814],
      [-5.345082, 35.580041],
      [-5.343826, 35.582914],
      [-5.337336, 35.586204],
      [-5.338175, 35.589811],
      [-5.3383, 35.5919],
      [-5.336, 35.5917],
      [-5.332204, 35.59349],
      [-5.326428, 35.600447],
    ],
  },
  { id: 'L8', number: '8', category: 'urban', color: '#E11D48', price_mad: 3.5, frequency_mins: 15, first_departure: '06:15', last_departure: '21:30', corridor: ['rommana', 'dar_takafa', 'avenue_des_far', 'hajrat_aroussa'] },
  { id: 'L9', number: '9', category: 'urban', color: '#7C3AED', price_mad: 3.5, frequency_mins: 15, first_departure: '06:15', last_departure: '21:30', corridor: ['rommana', 'dar_takafa', 'avenue_des_far', 'karyane'] },
  { id: 'L10', number: '10', category: 'urban', color: '#16A34A', price_mad: 3.5, frequency_mins: 15, first_departure: '06:00', last_departure: '22:00', corridor: ['rommana', 'dar_takafa', 'avenue_des_far', 'mokhtar_soussi'] },
  { id: 'L11', number: '11', category: 'urban', color: '#EA580C', price_mad: 3.5, frequency_mins: 20, first_departure: '06:15', last_departure: '21:30', corridor: ['dar_takafa', 'jamaa_mezouak', 'ain_samsa'] },
  { id: 'L12', number: '12', category: 'urban', color: '#0D9488', price_mad: 3.5, frequency_mins: 12, first_departure: '06:00', last_departure: '22:00', corridor: ['ancienne_gare', 'dar_takafa', 'jamaa_mezouak'] },
  { id: 'L13', number: '13', category: 'urban', color: '#C026D3', price_mad: 3.5, frequency_mins: 25, first_departure: '06:30', last_departure: '21:00', corridor: ['rommana', 'ancienne_gare', 'torreta', 'bouanane'] },
  { id: 'L14', number: '14', category: 'urban', color: '#2563EB', price_mad: 3.5, frequency_mins: 15, first_departure: '06:00', last_departure: '22:00', corridor: ['dar_takafa', 'abderrahmane_dakhel'] },
  { id: 'L15', number: '15', category: 'urban', color: '#DC2626', price_mad: 3.5, frequency_mins: 12, first_departure: '06:00', last_departure: '22:15', corridor: ['quartier_universitaire', 'ancienne_gare', 'torreta'] },
  { id: 'L16', number: '16', category: 'urban', color: '#65A30D', price_mad: 3.5, frequency_mins: 20, first_departure: '06:15', last_departure: '21:45', corridor: ['rommana', 'dar_takafa', 'avenue_des_far', 'rn13_malaliyine'] },
  { id: 'L17', number: '17', category: 'urban', color: '#9333EA', price_mad: 3.5, frequency_mins: 20, first_departure: '06:15', last_departure: '21:30', corridor: ['rommana', 'dar_takafa', 'ancienne_gare', 'abdellah_fakhar'] },
  { id: 'L18', number: '18', category: 'urban', color: '#F97316', price_mad: 3.5, frequency_mins: 20, first_departure: '06:15', last_departure: '21:30', corridor: ['rommana', 'dar_takafa', 'barbourine'] },

  // Regional / Suburban Network (18 Lines - 4.00 to 8.00 MAD)
  { id: 'L19', number: '19', category: 'regional', color: '#0284C7', price_mad: 4.5, frequency_mins: 35, first_departure: '06:30', last_departure: '21:00', corridor: ['rommana', 'dar_takafa', 'quartier_universitaire', 'amsa'] },
  { id: 'L20', number: '20', category: 'regional', color: '#0F766E', price_mad: 4.5, frequency_mins: 30, first_departure: '06:30', last_departure: '20:30', corridor: ['rommana', 'dar_takafa', 'quartier_universitaire', 'azla'] },
  { id: 'L21', number: '21', category: 'regional', color: '#0369A1', price_mad: 8.0, frequency_mins: 40, first_departure: '06:30', last_departure: '20:30', corridor: ['ancienne_gare', 'quartier_universitaire', 'amsa', 'oued_laou'] },
  { id: 'L22', number: '22', category: 'regional', color: '#BE185D', price_mad: 4.0, frequency_mins: 20, first_departure: '06:15', last_departure: '21:45', corridor: ['khalid_ibn_walid', 'dar_takafa', 'omar_mokhtar', 'sahtriyine'] },
  { id: 'L23', number: '23', category: 'regional', color: '#CA8A04', price_mad: 5.0, frequency_mins: 30, first_departure: '06:15', last_departure: '21:00', corridor: ['dar_takafa', 'omar_mokhtar', 'sahtriyine', 'ain_lahcen'] },
  { id: 'L24', number: '24', category: 'regional', color: '#E11D48', price_mad: 6.0, frequency_mins: 40, first_departure: '06:30', last_departure: '20:30', corridor: ['dar_takafa', 'saddina', 'khemis_anjra'] },
  { id: 'L25', number: '25', category: 'regional', color: '#7C3AED', price_mad: 5.0, frequency_mins: 35, first_departure: '06:30', last_departure: '21:00', corridor: ['dar_takafa', 'saddina'] },
  { id: 'L26', number: '26', category: 'regional', color: '#4D7C0F', price_mad: 4.0, frequency_mins: 20, first_departure: '06:15', last_departure: '21:45', corridor: ['rommana', 'dar_takafa', 'avenue_des_far', 'malaliyine'] },
  { id: 'L27', number: '27', category: 'regional', color: '#059669', price_mad: 4.5, frequency_mins: 25, first_departure: '06:15', last_departure: '21:30', corridor: ['ancienne_gare', 'ben_karrich'] },
  { id: 'L28', number: '28', category: 'regional', color: '#D97706', price_mad: 5.5, frequency_mins: 40, first_departure: '06:30', last_departure: '20:30', corridor: ['ancienne_gare', 'ben_karrich', 'zinate'] },
  { id: 'L29', number: '29', category: 'regional', color: '#DB2777', price_mad: 7.0, frequency_mins: 45, first_departure: '06:30', last_departure: '20:00', corridor: ['ancienne_gare', 'ben_karrich', 'zinate', 'arbaa_beni_hassan'] },
  { id: 'L30', number: '30', category: 'regional', color: '#14B8A6', price_mad: 4.0, frequency_mins: 30, first_departure: '06:30', last_departure: '20:30', corridor: ['ancienne_gare', 'torreta', 'beni_salah'] },
  { id: 'L31', number: '31', category: 'regional', color: '#6366F1', price_mad: 4.5, frequency_mins: 35, first_departure: '06:30', last_departure: '20:30', corridor: ['ancienne_gare', 'torreta', 'beni_salah', 'ain_zarka'] },
  { id: 'L32', number: '32', category: 'regional', color: '#0EA5E9', price_mad: 4.5, frequency_mins: 25, first_departure: '06:15', last_departure: '21:30', corridor: ['hay_bouzaghlal', 'mdiq', 'martil'] },
  { id: 'L33', number: '33', category: 'regional', color: '#EC4899', price_mad: 6.0, frequency_mins: 25, first_departure: '06:15', last_departure: '21:30', corridor: ['fnideq', 'mdiq', 'martil'] },
  { id: 'L34', number: '34', category: 'regional', color: '#0891B2', price_mad: 5.0, frequency_mins: 15, first_departure: '06:00', last_departure: '22:30', corridor: ['rommana', 'dar_takafa', 'avenue_des_far', 'rn13_malaliyine', 'mdiq'] },
  { id: 'L35', number: '35', category: 'regional', color: '#2563EB', price_mad: 7.0, frequency_mins: 15, first_departure: '06:00', last_departure: '22:30', corridor: ['rommana', 'dar_takafa', 'avenue_des_far', 'rn13_malaliyine', 'mdiq', 'fnideq'] },
  { id: 'L36', number: '36', category: 'regional', color: '#10B981', price_mad: 4.0, frequency_mins: 10, first_departure: '06:00', last_departure: '22:30', corridor: ['rommana', 'dar_takafa', 'saniat_rmel', 'tamouda', 'martil'] },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadHubDictionaries() {
  const enRaw = await fs.readFile(path.join(ROOT_DIR, 'src', 'i18n', 'en.json'), 'utf8');
  const arRaw = await fs.readFile(path.join(ROOT_DIR, 'src', 'i18n', 'ar.json'), 'utf8');
  const enJson = JSON.parse(enRaw);
  const arJson = JSON.parse(arRaw);
  return {
    enHubs: enJson.hubs,
    arHubs: arJson.hubs,
  };
}

async function fetchOsmStops() {
  const seen = new Map();

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`[Overpass] Querying ${endpoint}...`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'TetoWayTetouanTransitGIS/1.0',
        },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const elements = Array.isArray(data?.elements) ? data.elements : [];

      for (const el of elements) {
        if (el.type !== 'node' || typeof el.lat !== 'number' || typeof el.lon !== 'number') {
          continue;
        }
        const tags = el.tags || {};
        const id = String(el.id);
        if (!seen.has(id)) {
          seen.set(id, {
            id,
            lat: Number(el.lat.toFixed(6)),
            lng: Number(el.lon.toFixed(6)),
            name_en: tags['name:en'] || tags['name:fr'] || tags.name || 'Bus Stop',
            name_ar: tags['name:ar'] || '',
          });
        }
      }

      const normalized = Array.from(seen.values());
      if (normalized.length > 0) {
        console.log(`[Overpass] Retrieved ${normalized.length} bus stops from ${endpoint}.`);
        return normalized;
      }
    } catch (err) {
      console.warn(`[Overpass] ${endpoint} failed: ${err.message}`);
    }
  }

  // Fallback to existing local cache normalized to name_en/name_ar
  const outPath = path.join(PUBLIC_DATA_DIR, 'osm-stops.json');
  try {
    const existing = await fs.readFile(outPath, 'utf8');
    const parsed = JSON.parse(existing);
    if (Array.isArray(parsed) && parsed.length > 0) {
      console.warn(`[Overpass] Using cached ${outPath} (${parsed.length} stops).`);
      return parsed.map((s) => ({
        id: String(s.id),
        lat: s.lat,
        lng: s.lng,
        name_en: s.name_en || (s.name_fr === 'Arret Bus' ? 'Bus Stop' : s.name_fr) || 'Bus Stop',
        name_ar: s.name_ar || '',
      }));
    }
  } catch {
    // Ignore missing cache
  }

  return [];
}

async function fetchOsrmRoute(spec) {
  const coords = Array.isArray(spec.routeWaypoints)
    ? spec.routeWaypoints
    : spec.corridor.map((key) => {
        const pt = HUBS[key];
        if (!pt) {
          throw new Error(`Missing hub coordinate for "${key}" in line ${spec.id}`);
        }
        return pt;
      });
  const lineId = spec.id;

  const coordsParam = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'TetoWayTetouanTransitGIS/1.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429) {
        const waitMs = 1500 * attempt;
        console.warn(`[OSRM] Rate-limited on ${lineId}, waiting ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const geometry = data?.routes?.[0]?.geometry;
      if (geometry?.type === 'LineString' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
        return { geometry, snapped: true };
      }
      throw new Error('Invalid OSRM route geometry');
    } catch (err) {
      console.warn(`[OSRM] ${lineId} attempt ${attempt} failed: ${err.message}`);
      await sleep(900 * attempt);
    }
  }

  console.warn(`[OSRM] ${lineId} fell back to straight corridor LineString after retries.`);
  return {
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
    snapped: false,
  };
}

function buildOrderedStops(lineSpec, geometry, osmStops, enHubs, arHubs) {
  const lineFeature = turf.lineString(geometry.coordinates);
  const totalKm = turf.length(lineFeature, { units: 'kilometers' });

  const hubEntries = lineSpec.corridor.map((hubKey, idx) => {
    const [lng, lat] = HUBS[hubKey];
    const snapped = turf.nearestPointOnLine(lineFeature, turf.point([lng, lat]), { units: 'kilometers' });
    let loc = snapped?.properties?.location ?? (idx / Math.max(1, lineSpec.corridor.length - 1)) * totalKm;

    if (idx === 0) loc = -0.001;
    if (idx === lineSpec.corridor.length - 1) loc = totalKm + 0.001;

    return {
      hub_key: hubKey,
      name_en: enHubs[hubKey] || hubKey,
      name_ar: arHubs[hubKey] || '',
      lat,
      lng,
      location: loc,
    };
  });

  const matchedOsmEntries = [];
  for (const osm of osmStops) {
    const osmPoint = turf.point([osm.lng, osm.lat]);
    const distToLineMeters = turf.pointToLineDistance(osmPoint, lineFeature, { units: 'meters' });
    if (distToLineMeters > 60) continue;

    const tooCloseToHub = hubEntries.some(
      (hub) => turf.distance(osmPoint, turf.point([hub.lng, hub.lat]), { units: 'meters' }) < 45,
    );
    if (tooCloseToHub) continue;

    const tooCloseToOsm = matchedOsmEntries.some((existing) => {
      const dist = turf.distance(osmPoint, turf.point([existing.lng, existing.lat]), {
        units: 'meters',
      });
      if (dist < 35) return true;
      if (
        dist < 85 &&
        osm.name_en !== 'Bus Stop' &&
        existing.name_en.toLowerCase() === osm.name_en.toLowerCase()
      ) {
        return true;
      }
      return false;
    });
    if (tooCloseToOsm) continue;

    const snapped = turf.nearestPointOnLine(lineFeature, osmPoint, { units: 'kilometers' });
    const location = snapped?.properties?.location ?? 0;

    matchedOsmEntries.push({
      hub_key: null,
      name_en: osm.name_en,
      name_ar: osm.name_ar,
      lat: osm.lat,
      lng: osm.lng,
      location,
    });
  }

  const combined = [...hubEntries, ...matchedOsmEntries].sort((a, b) => a.location - b.location);

  return combined.map((stop, index) => {
    const order = index + 1;
    return {
      id: `${lineSpec.id}_S${order}`,
      order,
      hub_key: stop.hub_key,
      name_en: stop.name_en,
      name_ar: stop.name_ar,
      lat: stop.lat,
      lng: stop.lng,
    };
  });
}

async function main() {
  await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true });

  const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
  const onlyIds = onlyArg
    ? new Set(onlyArg.slice('--only='.length).split(',').map((s) => s.trim().toUpperCase()))
    : null;

  const { enHubs, arHubs } = await loadHubDictionaries();
  const osmOutPath = path.join(PUBLIC_DATA_DIR, 'osm-stops.json');
  const linesOutPath = path.join(PUBLIC_DATA_DIR, 'tetouan-lines.json');

  let osmStops;
  let existingLinesById = new Map();

  if (onlyIds) {
    osmStops = JSON.parse(await fs.readFile(osmOutPath, 'utf8'));
    const existingLines = JSON.parse(await fs.readFile(linesOutPath, 'utf8'));
    for (const line of existingLines) {
      existingLinesById.set(line.id, line);
    }
    console.log(`[Targeted] Updating only: ${Array.from(onlyIds).join(', ')} using cached OSM stops (${osmStops.length}).`);
  } else {
    osmStops = await fetchOsmStops();
    await fs.writeFile(osmOutPath, JSON.stringify(osmStops, null, 2), 'utf8');
    console.log(`[Output] Wrote ${osmStops.length} stops to ${osmOutPath}`);
  }

  const lines = [];
  let snappedCount = 0;

  for (let i = 0; i < LINES_SPEC.length; i++) {
    const spec = LINES_SPEC[i];
    if (onlyIds && !onlyIds.has(spec.id.toUpperCase()) && !onlyIds.has(spec.number.toUpperCase())) {
      const preserved = existingLinesById.get(spec.id);
      if (preserved) {
        lines.push(preserved);
        continue;
      }
    }

    const { geometry, snapped } = await fetchOsrmRoute(spec);
    if (snapped) snappedCount++;

    const stops = buildOrderedStops(spec, geometry, osmStops, enHubs, arHubs);
    const origin_key = spec.corridor[0];
    const destination_key = spec.corridor[spec.corridor.length - 1];

    lines.push({
      id: spec.id,
      number: spec.number,
      category: spec.category,
      color: spec.color,
      price_mad: spec.price_mad,
      first_departure: spec.first_departure,
      last_departure: spec.last_departure,
      frequency_mins: spec.frequency_mins,
      origin_key,
      destination_key,
      stops,
      geometry,
    });

    console.log(
      `[Line ${i + 1}/${LINES_SPEC.length}] ${spec.id}: ${geometry.coordinates.length} pts (${snapped ? 'OSRM' : 'fallback'}), ${stops.length} stops`,
    );

    if (!onlyIds && i < LINES_SPEC.length - 1) {
      await sleep(400);
    }
  }

  await fs.writeFile(linesOutPath, JSON.stringify(lines, null, 2), 'utf8');
  console.log(
    `[Output] Wrote ${lines.length} lines (${snappedCount} updated via OSRM) to ${linesOutPath}`,
  );
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
