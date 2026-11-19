import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const LINES_PATH = path.join(ROOT, 'public', 'data', 'tetouan-lines.json');
const OSM_STOPS_PATH = path.join(ROOT, 'public', 'data', 'osm-stops.json');
const OUT_PATH = path.join(ROOT, 'public', 'data', 'tetouan-walk.bin');

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const WALKABLE_HIGHWAYS = new Set([
  'footway',
  'pedestrian',
  'steps',
  'path',
  'living_street',
  'residential',
  'unclassified',
  'tertiary',
  'tertiary_link',
  'secondary',
  'secondary_link',
  'primary',
  'primary_link',
  'trunk',
  'trunk_link',
  'service',
  'track',
  'road',
  'corridor',
]);

const EXCLUDED_SERVICES = new Set([
  'parking_aisle',
  'driveway',
  'emergency_access',
  'drive-through',
]);

const COVERAGE_RADIUS_METERS = 2400;
const SIMPLIFY_TOLERANCE_METERS = 4.5;
const EARTH_RADIUS_METERS = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;

function haversineMeters(lng1, lat1, lng2, lat2) {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const sinLat = Math.sin(dLat * 0.5);
  const sinLng = Math.sin(dLng * 0.5);
  const a =
    sinLat * sinLat +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentMeters(px, py, ax, ay, bx, by, cosLat) {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * cosLat;
  const x = (px - ax) * mPerDegLng;
  const y = (py - ay) * mPerDegLat;
  const dx = (bx - ax) * mPerDegLng;
  const dy = (by - ay) * mPerDegLat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-6) {
    return Math.hypot(x, y);
  }
  const t = Math.max(0, Math.min(1, (x * dx + y * dy) / lenSq));
  return Math.hypot(x - t * dx, y - t * dy);
}

function douglasPeuckerIndices(chain, nodeCoords, toleranceMeters) {
  if (chain.length <= 2) return chain;

  const first = nodeCoords.get(chain[0]);
  const last = nodeCoords.get(chain[chain.length - 1]);
  const cosLat = Math.cos(((first.lat + last.lat) * 0.5) * DEG_TO_RAD);

  let maxDist = -1;
  let splitIdx = -1;
  for (let i = 1; i < chain.length - 1; i++) {
    const pt = nodeCoords.get(chain[i]);
    const dist = pointToSegmentMeters(
      pt.lng,
      pt.lat,
      first.lng,
      first.lat,
      last.lng,
      last.lat,
      cosLat,
    );
    if (dist > maxDist) {
      maxDist = dist;
      splitIdx = i;
    }
  }

  if (maxDist > toleranceMeters && splitIdx !== -1) {
    const left = douglasPeuckerIndices(chain.slice(0, splitIdx + 1), nodeCoords, toleranceMeters);
    const right = douglasPeuckerIndices(chain.slice(splitIdx), nodeCoords, toleranceMeters);
    return [...left.slice(0, -1), ...right];
  }

  return [chain[0], chain[chain.length - 1]];
}

function loadAllStops() {
  const lines = JSON.parse(fs.readFileSync(LINES_PATH, 'utf8'));
  const osmStops = fs.existsSync(OSM_STOPS_PATH)
    ? JSON.parse(fs.readFileSync(OSM_STOPS_PATH, 'utf8'))
    : [];

  const points = [];
  for (const line of lines) {
    for (const stop of line.stops) {
      points.push({ lat: stop.lat, lng: stop.lng });
    }
  }
  for (const s of osmStops) {
    points.push({ lat: s.lat, lng: s.lng });
  }
  return points;
}

/** Build a coarse spatial hash grid over all stops for O(1) coverage checks. */
function buildStopCoverageIndex(stops, radiusMeters) {
  const cellDeg = 0.025; // ~2.7 km
  const grid = new Map();
  const key = (cx, cy) => `${cx},${cy}`;

  for (const s of stops) {
    const cx = Math.floor(s.lng / cellDeg);
    const cy = Math.floor(s.lat / cellDeg);
    const k = key(cx, cy);
    let bucket = grid.get(k);
    if (!bucket) {
      bucket = [];
      grid.set(k, bucket);
    }
    bucket.push(s);
  }

  return {
    isNearStop(lat, lng) {
      const cx = Math.floor(lng / cellDeg);
      const cy = Math.floor(lat / cellDeg);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get(key(cx + dx, cy + dy));
          if (!bucket) continue;
          for (const s of bucket) {
            if (haversineMeters(lng, lat, s.lng, s.lat) <= radiusMeters) {
              return true;
            }
          }
        }
      }
      return false;
    },
  };
}

function isWayWalkable(tags) {
  if (!tags || !tags.highway) return false;
  if (!WALKABLE_HIGHWAYS.has(tags.highway)) return false;

  const foot = tags.foot;
  if (foot === 'no' || foot === 'private' || foot === 'prohibited') return false;

  const access = tags.access;
  if (
    (access === 'private' || access === 'no' || access === 'military') &&
    foot !== 'yes' &&
    foot !== 'permissive' &&
    foot !== 'designated'
  ) {
    return false;
  }

  if (tags.highway === 'service' && tags.service && EXCLUDED_SERVICES.has(tags.service)) {
    return false;
  }

  return true;
}

async function fetchOverpassTile(bbox, label) {
  const [minLat, minLng, maxLat, maxLng] = bbox;
  const highwayRegex = Array.from(WALKABLE_HIGHWAYS).join('|');
  const query = `[out:json][timeout:120];(way["highway"~"^(${highwayRegex})$"](${minLat},${minLng},${maxLat},${maxLng}););(._;>;);out body;`;

  let lastErr = null;
  for (let attempt = 0; attempt < OVERPASS_ENDPOINTS.length; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt];
    try {
      console.log(`  [${label}] Querying ${endpoint}...`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'TetoWay-WalkGraphBuilder/1.0 (https://github.com/evile92/TetoWay)',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (!Array.isArray(data.elements)) {
        throw new Error('Malformed Overpass response');
      }
      console.log(`  [${label}] Received ${data.elements.length} OSM elements.`);
      return data.elements;
    } catch (err) {
      lastErr = err;
      console.warn(`  [${label}] Failed on ${endpoint}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr ?? new Error(`All Overpass endpoints failed for ${label}`);
}

/** Build bounding tiles covering only regions containing bus stops (with margin). */
function buildActiveTiles(stops) {
  const tileStep = 0.16; // ~17 km squares
  const margin = 0.025; // ~2.7 km
  const activeCells = new Set();

  for (const s of stops) {
    const tx = Math.floor(s.lng / tileStep);
    const ty = Math.floor(s.lat / tileStep);
    activeCells.add(`${tx},${ty}`);
  }

  const tiles = [];
  for (const cell of activeCells) {
    const [tx, ty] = cell.split(',').map(Number);
    const minLng = Number((tx * tileStep - margin).toFixed(4));
    const maxLng = Number(((tx + 1) * tileStep + margin).toFixed(4));
    const minLat = Number((ty * tileStep - margin).toFixed(4));
    const maxLat = Number(((ty + 1) * tileStep + margin).toFixed(4));
    tiles.push({ label: `tile_${tx}_${ty}`, bbox: [minLat, minLng, maxLat, maxLng] });
  }
  return tiles;
}

async function main() {
  console.log('Loading TetoWay transit stops...');
  const stops = loadAllStops();
  console.log(`Loaded ${stops.length} transit + OSM stop reference points.`);

  const coverage = buildStopCoverageIndex(stops, COVERAGE_RADIUS_METERS);
  const tiles = buildActiveTiles(stops);
  console.log(`Querying ${tiles.length} Overpass tiles covering all transit corridors...`);

  const osmNodes = new Map();
  const osmWays = new Map();

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const elements = await fetchOverpassTile(tile.bbox, `${i + 1}/${tiles.length} ${tile.label}`);
    for (const el of elements) {
      if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
        osmNodes.set(el.id, { lat: el.lat, lng: el.lon });
      } else if (el.type === 'way' && Array.isArray(el.nodes) && el.nodes.length >= 2) {
        if (isWayWalkable(el.tags)) {
          osmWays.set(el.id, el.nodes);
        }
      }
    }
    if (i < tiles.length - 1) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  console.log(`Raw OSM totals: ${osmNodes.size} nodes, ${osmWays.size} walkable ways.`);

  // Filter ways to those intersecting the stop coverage buffer
  const keptWays = [];
  const nodeUsageCount = new Map();

  for (const wayNodes of osmWays.values()) {
    const validNodes = wayNodes.filter((id) => osmNodes.has(id));
    if (validNodes.length < 2) continue;

    let touchesCoverage = false;
    for (let i = 0; i < validNodes.length; i++) {
      const pt = osmNodes.get(validNodes[i]);
      if (coverage.isNearStop(pt.lat, pt.lng)) {
        touchesCoverage = true;
        break;
      }
    }
    if (!touchesCoverage) continue;

    keptWays.push(validNodes);
    for (let i = 0; i < validNodes.length; i++) {
      const nid = validNodes[i];
      const inc = i === 0 || i === validNodes.length - 1 ? 1 : 2;
      nodeUsageCount.set(nid, (nodeUsageCount.get(nid) ?? 0) + inc);
    }
  }

  console.log(`Ways inside ${COVERAGE_RADIUS_METERS}m transit coverage: ${keptWays.length}`);

  // Topology-preserving Douglas-Peucker simplification along degree-2 chains
  const adj = new Map();
  function addUndirectedEdge(u, v) {
    if (u === v) return;
    let setU = adj.get(u);
    if (!setU) {
      setU = new Set();
      adj.set(u, setU);
    }
    setU.add(v);

    let setV = adj.get(v);
    if (!setV) {
      setV = new Set();
      adj.set(v, setV);
    }
    setV.add(u);
  }

  for (const wayNodes of keptWays) {
    // Split way at any intersection / shared node (usage > 2) or loop closure
    let segStart = 0;
    for (let i = 1; i < wayNodes.length; i++) {
      const isEnd = i === wayNodes.length - 1;
      const isJunction = (nodeUsageCount.get(wayNodes[i]) ?? 0) > 2;
      if (isEnd || isJunction) {
        const subChain = wayNodes.slice(segStart, i + 1);
        const simplified = douglasPeuckerIndices(subChain, osmNodes, SIMPLIFY_TOLERANCE_METERS);
        for (let k = 0; k < simplified.length - 1; k++) {
          addUndirectedEdge(simplified[k], simplified[k + 1]);
        }
        segStart = i;
      }
    }
  }

  // Filter tiny disconnected islands (< 4 nodes) unless near a stop (< 300m)
  const nearStopStrict = buildStopCoverageIndex(stops, 300);
  const visited = new Set();
  const keptNodeIds = [];

  for (const startId of adj.keys()) {
    if (visited.has(startId)) continue;
    const component = [];
    const queue = [startId];
    visited.add(startId);
    let head = 0;
    let hasNearbyStop = false;

    while (head < queue.length) {
      const cur = queue[head++];
      component.push(cur);
      if (!hasNearbyStop) {
        const pt = osmNodes.get(cur);
        if (nearStopStrict.isNearStop(pt.lat, pt.lng)) {
          hasNearbyStop = true;
        }
      }
      const neighbors = adj.get(cur);
      if (!neighbors) continue;
      for (const nxt of neighbors) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push(nxt);
        }
      }
    }

    if (component.length >= 4 || hasNearbyStop) {
      for (const id of component) {
        keptNodeIds.push(id);
      }
    }
  }

  // Assign dense indices 0..N-1
  const idToIdx = new Map();
  for (let i = 0; i < keptNodeIds.length; i++) {
    idToIdx.set(keptNodeIds[i], i);
  }

  const N = keptNodeIds.length;
  const latE6 = new Int32Array(N);
  const lngE6 = new Int32Array(N);
  const offsets = new Uint32Array(N + 1);

  let directedEdgeCount = 0;
  for (let u = 0; u < N; u++) {
    const osmId = keptNodeIds[u];
    const pt = osmNodes.get(osmId);
    latE6[u] = Math.round(pt.lat * 1e6);
    lngE6[u] = Math.round(pt.lng * 1e6);
    offsets[u] = directedEdgeCount;
    const neighbors = adj.get(osmId);
    if (neighbors) {
      for (const nbId of neighbors) {
        if (idToIdx.has(nbId)) {
          directedEdgeCount++;
        }
      }
    }
  }
  offsets[N] = directedEdgeCount;

  const targets = new Uint32Array(directedEdgeCount);
  const weights = new Uint16Array(directedEdgeCount);

  let cursor = 0;
  for (let u = 0; u < N; u++) {
    const osmId = keptNodeIds[u];
    const ptU = osmNodes.get(osmId);
    const neighbors = adj.get(osmId);
    if (!neighbors) continue;

    for (const nbId of neighbors) {
      const v = idToIdx.get(nbId);
      if (v === undefined) continue;
      const ptV = osmNodes.get(nbId);
      const dist = Math.round(haversineMeters(ptU.lng, ptU.lat, ptV.lng, ptV.lat));
      targets[cursor] = v;
      weights[cursor] = Math.max(1, Math.min(65535, dist));
      cursor++;
    }
  }

  // Pack TTWK v1 binary CSR buffer (4-byte aligned sections for zero-copy TypedArray views)
  const headerBytes = 16;
  const latBytes = N * 4;
  const lngBytes = N * 4;
  const offsetsBytes = (N + 1) * 4;
  const targetsBytes = directedEdgeCount * 4;
  const weightsBytes = directedEdgeCount * 2;
  const totalBytes =
    headerBytes + latBytes + lngBytes + offsetsBytes + targetsBytes + weightsBytes;

  const outBuf = Buffer.allocUnsafe(totalBytes);
  outBuf.write('TTWK', 0, 4, 'ascii');
  outBuf.writeUInt32LE(1, 4);
  outBuf.writeUInt32LE(N, 8);
  outBuf.writeUInt32LE(directedEdgeCount, 12);

  let pos = headerBytes;
  Buffer.from(latE6.buffer).copy(outBuf, pos);
  pos += latBytes;
  Buffer.from(lngE6.buffer).copy(outBuf, pos);
  pos += lngBytes;
  Buffer.from(offsets.buffer).copy(outBuf, pos);
  pos += offsetsBytes;
  Buffer.from(targets.buffer).copy(outBuf, pos);
  pos += targetsBytes;
  Buffer.from(weights.buffer).copy(outBuf, pos);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, outBuf);

  const gzipped = zlib.gzipSync(outBuf, { level: 9 });
  console.log('\n=== TetoWay Offline Walk Graph Built ===');
  console.log(`Nodes:          ${N.toLocaleString()}`);
  console.log(`Directed edges: ${directedEdgeCount.toLocaleString()} (${(directedEdgeCount / 2).toLocaleString()} segments)`);
  console.log(`Raw binary:     ${(outBuf.length / 1024).toFixed(1)} KB -> ${OUT_PATH}`);
  console.log(`Gzipped (wire): ${(gzipped.length / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error('Walk graph build failed:', err);
  process.exit(1);
});
